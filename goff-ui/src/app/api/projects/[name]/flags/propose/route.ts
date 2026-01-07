import { NextRequest, NextResponse } from 'next/server';

const FLAG_MANAGER_API_URL = process.env.FLAG_MANAGER_API_URL;

interface FlagConfig {
  variations?: Record<string, unknown>;
  targeting?: Array<{
    name?: string;
    query?: string;
    variation?: string;
    percentage?: Record<string, number>;
    disable?: boolean;
  }>;
  defaultRule?: {
    variation?: string;
    percentage?: Record<string, number>;
  };
  trackEvents?: boolean;
  disable?: boolean;
  version?: string;
  metadata?: Record<string, unknown>;
}

// POST - Propose a flag change (creates PR/MR)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  if (!FLAG_MANAGER_API_URL) {
    return NextResponse.json(
      { error: 'Flag Manager API not configured' },
      { status: 500 }
    );
  }

  try {
    const { name: project } = await params;
    const body = await request.json();
    const { flagKey, config, title, description, action } = body as {
      flagKey: string;
      config?: FlagConfig;
      title?: string;
      description?: string;
      action: 'create' | 'update' | 'delete';
    };

    if (!flagKey) {
      return NextResponse.json(
        { error: 'Flag key is required' },
        { status: 400 }
      );
    }

    if (!action) {
      return NextResponse.json(
        { error: 'Action is required (create, update, or delete)' },
        { status: 400 }
      );
    }

    const response = await fetch(
      `${FLAG_MANAGER_API_URL}/api/projects/${project}/flags/${encodeURIComponent(flagKey)}/propose`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config, title, description, action }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json(
        { error: error || `Failed to create PR: ${response.statusText}` },
        { status: response.status }
      );
    }

    const result = await response.json();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to propose flag change' },
      { status: 500 }
    );
  }
}
