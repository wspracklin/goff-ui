import { NextRequest, NextResponse } from 'next/server';

const FLAG_MANAGER_API_URL = process.env.FLAG_MANAGER_API_URL;

// POST - Test an integration connection
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!FLAG_MANAGER_API_URL) {
    return NextResponse.json({ error: 'API not configured' }, { status: 500 });
  }

  const { id } = await params;

  try {
    const response = await fetch(`${FLAG_MANAGER_API_URL}/api/integrations/${id}/test`, {
      method: 'POST',
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json(
        { error: error || `Failed to test integration: ${response.statusText}` },
        { status: response.status }
      );
    }

    return NextResponse.json(await response.json());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to test integration' },
      { status: 500 }
    );
  }
}
