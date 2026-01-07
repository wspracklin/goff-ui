import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';

const isDevMode = process.env.DEV_MODE === 'true';
const FLAG_MANAGER_API_URL = process.env.FLAG_MANAGER_API_URL || 'http://localhost:8080';

// GET - Get a single flag
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string; flagKey: string }> }
) {
  if (!isDevMode) {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const { name: project, flagKey } = await params;

  try {
    const response = await fetch(
      `${FLAG_MANAGER_API_URL}/api/projects/${encodeURIComponent(project)}/flags/${encodeURIComponent(flagKey)}`,
      {
        headers: { 'Content-Type': 'application/json' },
      }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to get flag' }));
      return NextResponse.json(error, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error getting flag:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get flag' },
      { status: 500 }
    );
  }
}

// POST - Create a new flag
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ name: string; flagKey: string }> }
) {
  if (!isDevMode) {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const { name: project, flagKey } = await params;

  try {
    const body = await request.json();

    const response = await fetch(
      `${FLAG_MANAGER_API_URL}/api/projects/${encodeURIComponent(project)}/flags/${encodeURIComponent(flagKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to create flag' }));
      return NextResponse.json(error, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('Error creating flag:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create flag' },
      { status: 500 }
    );
  }
}

// PUT - Update a flag
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ name: string; flagKey: string }> }
) {
  if (!isDevMode) {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const { name: project, flagKey } = await params;

  try {
    const body = await request.json();

    const response = await fetch(
      `${FLAG_MANAGER_API_URL}/api/projects/${encodeURIComponent(project)}/flags/${encodeURIComponent(flagKey)}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to update flag' }));
      return NextResponse.json(error, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error updating flag:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update flag' },
      { status: 500 }
    );
  }
}

// DELETE - Delete a flag
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ name: string; flagKey: string }> }
) {
  if (!isDevMode) {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const { name: project, flagKey } = await params;

  try {
    const response = await fetch(
      `${FLAG_MANAGER_API_URL}/api/projects/${encodeURIComponent(project)}/flags/${encodeURIComponent(flagKey)}`,
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to delete flag' }));
      return NextResponse.json(error, { status: response.status });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Error deleting flag:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete flag' },
      { status: 500 }
    );
  }
}
