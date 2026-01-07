import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import yaml from 'yaml';

// Flag Manager API URL - when set, proxy requests to the API
const FLAG_MANAGER_API_URL = process.env.FLAG_MANAGER_API_URL;

// Flag file path - used only when FLAG_MANAGER_API_URL is not set
const FLAGS_FILE = process.env.FLAGS_FILE || './flags.yaml';

interface ProgressiveRolloutStep {
  variation?: string;
  percentage?: number;
  date?: string;
}

interface ProgressiveRollout {
  initial?: ProgressiveRolloutStep;
  end?: ProgressiveRolloutStep;
}

interface ScheduledStep {
  date: string;
  targeting?: Array<{
    name?: string;
    query?: string;
    variation?: string;
    percentage?: Record<string, number>;
    progressiveRollout?: ProgressiveRollout;
    disable?: boolean;
  }>;
  defaultRule?: {
    variation?: string;
    percentage?: Record<string, number>;
    progressiveRollout?: ProgressiveRollout;
  };
}

interface FlagConfig {
  variations?: Record<string, unknown>;
  targeting?: Array<{
    name?: string;
    query?: string;
    variation?: string;
    percentage?: Record<string, number>;
    progressiveRollout?: ProgressiveRollout;
    disable?: boolean;
  }>;
  defaultRule?: {
    variation?: string;
    percentage?: Record<string, number>;
    progressiveRollout?: ProgressiveRollout;
  };
  trackEvents?: boolean;
  disable?: boolean;
  version?: string;
  metadata?: Record<string, unknown>;
  scheduledRollout?: ScheduledStep[];
  experimentation?: {
    start?: string;
    end?: string;
  };
  bucketingKey?: string;
}

type FlagsFile = Record<string, FlagConfig>;

// ============================================================================
// Flag Manager API Client (used when FLAG_MANAGER_API_URL is set)
// ============================================================================

async function apiListFlags(): Promise<{ flags: FlagsFile }> {
  const response = await fetch(`${FLAG_MANAGER_API_URL}/api/projects`);
  if (!response.ok) {
    throw new Error(`Failed to list projects: ${response.statusText}`);
  }
  const { projects } = await response.json();

  // Aggregate flags from all projects
  const allFlags: FlagsFile = {};
  for (const project of projects || []) {
    const flagsResponse = await fetch(`${FLAG_MANAGER_API_URL}/api/projects/${project}/flags`);
    if (flagsResponse.ok) {
      const { flags } = await flagsResponse.json();
      // Prefix flag keys with project name if multiple projects
      if (projects.length > 1) {
        for (const [key, config] of Object.entries(flags || {})) {
          allFlags[`${project}/${key}`] = config as FlagConfig;
        }
      } else {
        Object.assign(allFlags, flags || {});
      }
    }
  }

  return { flags: allFlags };
}

async function apiCreateFlag(key: string, config: FlagConfig): Promise<void> {
  // Use 'default' project for simple setup
  const project = 'default';

  // Ensure project exists
  await fetch(`${FLAG_MANAGER_API_URL}/api/projects/${project}`, {
    method: 'POST',
  });

  const response = await fetch(`${FLAG_MANAGER_API_URL}/api/projects/${project}/flags/${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || `Failed to create flag: ${response.statusText}`);
  }
}

// ============================================================================
// Local File Storage (used when FLAG_MANAGER_API_URL is not set)
// ============================================================================

async function readFlagsFile(): Promise<FlagsFile> {
  try {
    const filePath = path.resolve(FLAGS_FILE);
    const content = await fs.readFile(filePath, 'utf-8');
    return yaml.parse(content) || {};
  } catch (error) {
    // File doesn't exist yet, return empty object
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

async function writeFlagsFile(flags: FlagsFile): Promise<void> {
  const filePath = path.resolve(FLAGS_FILE);
  const content = yaml.stringify(flags, { indent: 2 });
  await fs.writeFile(filePath, content, 'utf-8');
}

// ============================================================================
// Route Handlers
// ============================================================================

// GET - List all flags
export async function GET() {
  try {
    if (FLAG_MANAGER_API_URL) {
      const { flags } = await apiListFlags();
      return NextResponse.json({ flags, source: 'api' });
    }

    const flags = await readFlagsFile();
    return NextResponse.json({ flags, filePath: path.resolve(FLAGS_FILE) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to read flags' },
      { status: 500 }
    );
  }
}

// POST - Create a new flag
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { key, config } = body as { key: string; config: FlagConfig };

    if (!key || typeof key !== 'string') {
      return NextResponse.json(
        { error: 'Flag key is required' },
        { status: 400 }
      );
    }

    if (FLAG_MANAGER_API_URL) {
      await apiCreateFlag(key, config);
      return NextResponse.json({ success: true, flag: { key, config } });
    }

    const flags = await readFlagsFile();

    if (flags[key]) {
      return NextResponse.json(
        { error: 'Flag already exists' },
        { status: 409 }
      );
    }

    flags[key] = config;
    await writeFlagsFile(flags);

    return NextResponse.json({ success: true, flag: { key, config } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create flag' },
      { status: 500 }
    );
  }
}
