import { NextRequest, NextResponse } from 'next/server';

const FLAG_MANAGER_API_URL = process.env.FLAG_MANAGER_API_URL;

export interface Notifier {
  id: string;
  name: string;
  kind: 'slack' | 'discord' | 'microsoftteams' | 'webhook' | 'log';
  description?: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  // Slack/Discord/Teams
  webhookUrl?: string;
  // Webhook-specific
  endpointUrl?: string;
  secret?: string;
  headers?: Record<string, string>;
  meta?: Record<string, string>;
  // Log-specific
  logFormat?: 'json' | 'text';
}

// GET - List all notifiers
export async function GET() {
  if (!FLAG_MANAGER_API_URL) {
    return NextResponse.json({ notifiers: [] });
  }

  try {
    const response = await fetch(`${FLAG_MANAGER_API_URL}/api/notifiers`);
    if (!response.ok) {
      throw new Error(`Failed to fetch notifiers: ${response.statusText}`);
    }
    return NextResponse.json(await response.json());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch notifiers' },
      { status: 500 }
    );
  }
}

// POST - Create a new notifier
export async function POST(request: NextRequest) {
  if (!FLAG_MANAGER_API_URL) {
    return NextResponse.json(
      { error: 'Flag Manager API not configured' },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const response = await fetch(`${FLAG_MANAGER_API_URL}/api/notifiers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json(
        { error: error || `Failed to create notifier: ${response.statusText}` },
        { status: response.status }
      );
    }

    return NextResponse.json(await response.json(), { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create notifier' },
      { status: 500 }
    );
  }
}
