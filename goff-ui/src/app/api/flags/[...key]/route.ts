import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import yaml from 'yaml';

// Flag Manager API URL - when set, proxy requests to the API
const FLAG_MANAGER_API_URL = process.env.FLAG_MANAGER_API_URL;

// Flag file path - used only when FLAG_MANAGER_API_URL is not set
const FLAGS_FILE = process.env.FLAGS_FILE || './flags.yaml';

// Default project name for API operations
const DEFAULT_PROJECT = 'default';

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
// Flag Manager API Client
// ============================================================================

// Parse key into project and flag name
// Key format: "project/flagName" or just "flagName" (uses DEFAULT_PROJECT)
function parseKey(key: string): { project: string; flagName: string } {
  const slashIndex = key.indexOf('/');
  if (slashIndex > 0) {
    return {
      project: key.substring(0, slashIndex),
      flagName: key.substring(slashIndex + 1),
    };
  }
  return { project: DEFAULT_PROJECT, flagName: key };
}

async function apiGetFlag(key: string): Promise<{ key: string; config: FlagConfig } | null> {
  const { project, flagName } = parseKey(key);
  const response = await fetch(
    `${FLAG_MANAGER_API_URL}/api/projects/${project}/flags/${encodeURIComponent(flagName)}`
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Failed to get flag: ${response.statusText}`);
  }

  const data = await response.json();
  return { key, config: data.config };
}

async function apiUpdateFlag(key: string, config: FlagConfig, newKey?: string): Promise<void> {
  const { project, flagName } = parseKey(key);
  const response = await fetch(
    `${FLAG_MANAGER_API_URL}/api/projects/${project}/flags/${encodeURIComponent(flagName)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config, newKey: newKey ? parseKey(newKey).flagName : undefined }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || `Failed to update flag: ${response.statusText}`);
  }
}

async function apiDeleteFlag(key: string): Promise<void> {
  const { project, flagName } = parseKey(key);
  const response = await fetch(
    `${FLAG_MANAGER_API_URL}/api/projects/${project}/flags/${encodeURIComponent(flagName)}`,
    { method: 'DELETE' }
  );

  if (!response.ok && response.status !== 404) {
    const error = await response.text();
    throw new Error(error || `Failed to delete flag: ${response.statusText}`);
  }
}

// ============================================================================
// Local File Storage
// ============================================================================

async function readFlagsFile(): Promise<FlagsFile> {
  try {
    const filePath = path.resolve(FLAGS_FILE);
    const content = await fs.readFile(filePath, 'utf-8');
    return yaml.parse(content) || {};
  } catch (error) {
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

// GET - Get a single flag
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ key: string[] }> }
) {
  try {
    const { key } = await params;
    // Handle catch-all route - key comes as array of path segments
    const decodedKey = Array.isArray(key) ? key.join('/') : key;

    if (FLAG_MANAGER_API_URL) {
      const flag = await apiGetFlag(decodedKey);
      if (!flag) {
        return NextResponse.json({ error: 'Flag not found' }, { status: 404 });
      }
      return NextResponse.json(flag);
    }

    const flags = await readFlagsFile();

    if (!flags[decodedKey]) {
      return NextResponse.json(
        { error: 'Flag not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ key: decodedKey, config: flags[decodedKey] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to read flag' },
      { status: 500 }
    );
  }
}

// PUT - Update a flag
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ key: string[] }> }
) {
  try {
    const { key } = await params;
    // Handle catch-all route - key comes as array of path segments
    const decodedKey = Array.isArray(key) ? key.join('/') : key;
    const body = await request.json();
    const { config, newKey } = body as { config: FlagConfig; newKey?: string };

    if (FLAG_MANAGER_API_URL) {
      await apiUpdateFlag(decodedKey, config, newKey);
      return NextResponse.json({
        success: true,
        flag: { key: newKey || decodedKey, config }
      });
    }

    const flags = await readFlagsFile();

    if (!flags[decodedKey]) {
      return NextResponse.json(
        { error: 'Flag not found' },
        { status: 404 }
      );
    }

    // If renaming the flag
    if (newKey && newKey !== decodedKey) {
      if (flags[newKey]) {
        return NextResponse.json(
          { error: 'A flag with the new key already exists' },
          { status: 409 }
        );
      }
      delete flags[decodedKey];
      flags[newKey] = config;
    } else {
      flags[decodedKey] = config;
    }

    await writeFlagsFile(flags);

    return NextResponse.json({
      success: true,
      flag: { key: newKey || decodedKey, config }
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update flag' },
      { status: 500 }
    );
  }
}

// DELETE - Delete a flag
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ key: string[] }> }
) {
  try {
    const { key } = await params;
    // Handle catch-all route - key comes as array of path segments
    const decodedKey = Array.isArray(key) ? key.join('/') : key;

    if (FLAG_MANAGER_API_URL) {
      await apiDeleteFlag(decodedKey);
      return NextResponse.json({ success: true });
    }

    const flags = await readFlagsFile();

    if (!flags[decodedKey]) {
      return NextResponse.json(
        { error: 'Flag not found' },
        { status: 404 }
      );
    }

    delete flags[decodedKey];
    await writeFlagsFile(flags);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete flag' },
      { status: 500 }
    );
  }
}
