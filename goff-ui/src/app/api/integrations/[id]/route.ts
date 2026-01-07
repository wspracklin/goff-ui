import { NextRequest, NextResponse } from 'next/server';

const FLAG_MANAGER_API_URL = process.env.FLAG_MANAGER_API_URL;

// GET - Get a single integration
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!FLAG_MANAGER_API_URL) {
    return NextResponse.json({ error: 'API not configured' }, { status: 500 });
  }

  const { id } = await params;

  try {
    const response = await fetch(`${FLAG_MANAGER_API_URL}/api/integrations/${id}`);
    if (response.status === 404) {
      return NextResponse.json({ error: 'Integration not found' }, { status: 404 });
    }
    if (!response.ok) {
      throw new Error(`Failed to fetch integration: ${response.statusText}`);
    }
    return NextResponse.json(await response.json());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch integration' },
      { status: 500 }
    );
  }
}

// PUT - Update an integration
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!FLAG_MANAGER_API_URL) {
    return NextResponse.json({ error: 'API not configured' }, { status: 500 });
  }

  const { id } = await params;

  try {
    const body = await request.json();

    const response = await fetch(`${FLAG_MANAGER_API_URL}/api/integrations/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json(
        { error: error || `Failed to update integration: ${response.statusText}` },
        { status: response.status }
      );
    }

    return NextResponse.json(await response.json());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update integration' },
      { status: 500 }
    );
  }
}

// DELETE - Delete an integration
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!FLAG_MANAGER_API_URL) {
    return NextResponse.json({ error: 'API not configured' }, { status: 500 });
  }

  const { id } = await params;

  try {
    const response = await fetch(`${FLAG_MANAGER_API_URL}/api/integrations/${id}`, {
      method: 'DELETE',
    });

    if (!response.ok && response.status !== 404) {
      const error = await response.text();
      return NextResponse.json(
        { error: error || `Failed to delete integration: ${response.statusText}` },
        { status: response.status }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete integration' },
      { status: 500 }
    );
  }
}
