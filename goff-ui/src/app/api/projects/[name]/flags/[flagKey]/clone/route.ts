import { NextRequest, NextResponse } from 'next/server';

const FLAG_MANAGER_API_URL = process.env.FLAG_MANAGER_API_URL;

// POST - Clone a flag
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ name: string; flagKey: string }> }
) {
  if (!FLAG_MANAGER_API_URL) {
    return NextResponse.json({ error: 'API not configured' }, { status: 500 });
  }

  const { name, flagKey } = await params;

  try {
    const body = await request.json();

    const response = await fetch(
      `${FLAG_MANAGER_API_URL}/api/projects/${encodeURIComponent(name)}/flags/${encodeURIComponent(flagKey)}/clone`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json(
        { error: error || `Failed to clone flag: ${response.statusText}` },
        { status: response.status }
      );
    }

    return NextResponse.json(await response.json(), { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to clone flag' },
      { status: 500 }
    );
  }
}
