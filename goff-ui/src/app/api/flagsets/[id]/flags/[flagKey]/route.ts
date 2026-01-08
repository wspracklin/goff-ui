import { NextRequest, NextResponse } from 'next/server';

const FLAG_MANAGER_API_URL = process.env.FLAG_MANAGER_API_URL;

// GET - Get a single flag from a flagset
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; flagKey: string }> }
) {
  const { id, flagKey } = await params;

  if (!FLAG_MANAGER_API_URL) {
    return NextResponse.json(
      { error: 'Flag Manager API not configured' },
      { status: 500 }
    );
  }

  try {
    const response = await fetch(`${FLAG_MANAGER_API_URL}/api/flagsets/${id}/flags/${flagKey}`);
    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json(
        { error: error || `Failed to fetch flag: ${response.statusText}` },
        { status: response.status }
      );
    }
    return NextResponse.json(await response.json());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch flag' },
      { status: 500 }
    );
  }
}

// POST - Create a new flag in a flagset
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; flagKey: string }> }
) {
  const { id, flagKey } = await params;

  if (!FLAG_MANAGER_API_URL) {
    return NextResponse.json(
      { error: 'Flag Manager API not configured' },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();

    const response = await fetch(`${FLAG_MANAGER_API_URL}/api/flagsets/${id}/flags/${flagKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json(
        { error: error || `Failed to create flag: ${response.statusText}` },
        { status: response.status }
      );
    }

    return NextResponse.json(await response.json(), { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create flag' },
      { status: 500 }
    );
  }
}

// PUT - Update a flag in a flagset
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; flagKey: string }> }
) {
  const { id, flagKey } = await params;

  if (!FLAG_MANAGER_API_URL) {
    return NextResponse.json(
      { error: 'Flag Manager API not configured' },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();

    const response = await fetch(`${FLAG_MANAGER_API_URL}/api/flagsets/${id}/flags/${flagKey}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json(
        { error: error || `Failed to update flag: ${response.statusText}` },
        { status: response.status }
      );
    }

    return NextResponse.json(await response.json());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update flag' },
      { status: 500 }
    );
  }
}

// DELETE - Delete a flag from a flagset
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; flagKey: string }> }
) {
  const { id, flagKey } = await params;

  if (!FLAG_MANAGER_API_URL) {
    return NextResponse.json(
      { error: 'Flag Manager API not configured' },
      { status: 500 }
    );
  }

  try {
    const response = await fetch(`${FLAG_MANAGER_API_URL}/api/flagsets/${id}/flags/${flagKey}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json(
        { error: error || `Failed to delete flag: ${response.statusText}` },
        { status: response.status }
      );
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete flag' },
      { status: 500 }
    );
  }
}
