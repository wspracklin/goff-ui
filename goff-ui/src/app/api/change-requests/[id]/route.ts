import { NextRequest, NextResponse } from 'next/server';

const FLAG_MANAGER_API_URL = process.env.FLAG_MANAGER_API_URL;

// GET - Get a single change request
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!FLAG_MANAGER_API_URL) {
    return NextResponse.json({ error: 'API not configured' }, { status: 500 });
  }

  const { id } = await params;

  try {
    const response = await fetch(`${FLAG_MANAGER_API_URL}/api/change-requests/${id}`);
    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json(
        { error: error || `Failed to fetch change request: ${response.statusText}` },
        { status: response.status }
      );
    }
    return NextResponse.json(await response.json());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch change request' },
      { status: 500 }
    );
  }
}
