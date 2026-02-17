import { NextRequest, NextResponse } from 'next/server';

const FLAG_MANAGER_API_URL = process.env.FLAG_MANAGER_API_URL;

// GET - List audit events with pagination and filters
export async function GET(request: NextRequest) {
  if (!FLAG_MANAGER_API_URL) {
    return NextResponse.json({ data: [], total: 0, page: 1, pageSize: 50, totalPages: 0 });
  }

  try {
    // Forward query params to backend
    const searchParams = request.nextUrl.searchParams;
    const queryString = searchParams.toString();
    const url = `${FLAG_MANAGER_API_URL}/api/audit${queryString ? `?${queryString}` : ''}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch audit events: ${response.statusText}`);
    }
    return NextResponse.json(await response.json());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch audit events' },
      { status: 500 }
    );
  }
}
