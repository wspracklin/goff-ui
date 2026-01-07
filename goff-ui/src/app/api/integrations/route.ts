import { NextRequest, NextResponse } from 'next/server';

const FLAG_MANAGER_API_URL = process.env.FLAG_MANAGER_API_URL;

export interface GitIntegration {
  id: string;
  name: string;
  provider: 'ado' | 'gitlab';
  description?: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  // ADO fields
  adoOrgUrl?: string;
  adoProject?: string;
  adoRepository?: string;
  adoPat?: string;
  // GitLab fields
  gitlabUrl?: string;
  gitlabProjectId?: string;
  gitlabToken?: string;
  // Common
  baseBranch: string;
  flagsPath: string;
}

// GET - List all integrations
export async function GET() {
  if (!FLAG_MANAGER_API_URL) {
    return NextResponse.json({ integrations: [] });
  }

  try {
    const response = await fetch(`${FLAG_MANAGER_API_URL}/api/integrations`);
    if (!response.ok) {
      throw new Error(`Failed to fetch integrations: ${response.statusText}`);
    }
    return NextResponse.json(await response.json());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch integrations' },
      { status: 500 }
    );
  }
}

// POST - Create a new integration
export async function POST(request: NextRequest) {
  if (!FLAG_MANAGER_API_URL) {
    return NextResponse.json(
      { error: 'Flag Manager API not configured' },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();

    const response = await fetch(`${FLAG_MANAGER_API_URL}/api/integrations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json(
        { error: error || `Failed to create integration: ${response.statusText}` },
        { status: response.status }
      );
    }

    return NextResponse.json(await response.json(), { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create integration' },
      { status: 500 }
    );
  }
}
