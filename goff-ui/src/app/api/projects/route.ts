import { NextResponse } from 'next/server';
import { auth } from '@/auth';

const isDevMode = process.env.DEV_MODE === 'true';
const FLAG_MANAGER_API_URL = process.env.FLAG_MANAGER_API_URL || 'http://localhost:8080';

export async function GET() {
  // In dev mode with no Flag Manager API, return empty projects
  if (isDevMode && !process.env.FLAG_MANAGER_API_URL) {
    return NextResponse.json({ projects: ['default'] });
  }

  // Check authentication in production
  if (!isDevMode) {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    // Proxy to Flag Manager API
    const response = await fetch(`${FLAG_MANAGER_API_URL}/api/projects`, {
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to list projects' }));
      return NextResponse.json(error, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error listing projects:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list projects' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  // Check authentication in production
  if (!isDevMode) {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const body = await request.json();
    const { project } = body;

    if (!project) {
      return NextResponse.json({ error: 'Project name is required' }, { status: 400 });
    }

    // Proxy to Flag Manager API
    const response = await fetch(`${FLAG_MANAGER_API_URL}/api/projects/${encodeURIComponent(project)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to create project' }));
      return NextResponse.json(error, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('Error creating project:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create project' },
      { status: 500 }
    );
  }
}
