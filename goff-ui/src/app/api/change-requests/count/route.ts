import { NextRequest, NextResponse } from 'next/server';

const FLAG_MANAGER_API_URL = process.env.FLAG_MANAGER_API_URL;

// GET - Get count of change requests (with optional filters)
export async function GET(request: NextRequest) {
  if (!FLAG_MANAGER_API_URL) {
    return NextResponse.json({ error: 'API not configured' }, { status: 500 });
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const queryString = searchParams.toString();
    const url = `${FLAG_MANAGER_API_URL}/api/change-requests/count${queryString ? `?${queryString}` : ''}`;

    const response = await fetch(url);
    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json(
        { error: error || `Failed to fetch change request count: ${response.statusText}` },
        { status: response.status }
      );
    }
    return NextResponse.json(await response.json());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch change request count' },
      { status: 500 }
    );
  }
}
