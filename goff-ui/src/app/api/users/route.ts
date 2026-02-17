import { NextResponse } from 'next/server';

const FLAG_MANAGER_API_URL = process.env.FLAG_MANAGER_API_URL;

export async function GET() {
  if (!FLAG_MANAGER_API_URL) {
    return NextResponse.json({ users: [] });
  }

  try {
    const response = await fetch(`${FLAG_MANAGER_API_URL}/api/users`);
    if (!response.ok) {
      throw new Error(`Failed to fetch users: ${response.statusText}`);
    }
    return NextResponse.json(await response.json());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch users' },
      { status: 500 }
    );
  }
}
