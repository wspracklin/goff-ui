import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';

const isDevMode = process.env.DEV_MODE === 'true';
const FLAG_MANAGER_API_URL = process.env.FLAG_MANAGER_API_URL || 'http://localhost:8080';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  // Check authentication in production
  if (!isDevMode) {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const { name: project } = await params;

  try {
    // Proxy to Flag Manager API
    const response = await fetch(
      `${FLAG_MANAGER_API_URL}/api/projects/${encodeURIComponent(project)}/flags`,
      {
        headers: { 'Content-Type': 'application/json' },
      }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to list flags' }));
      return NextResponse.json(error, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error listing flags:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list flags' },
      { status: 500 }
    );
  }
}
