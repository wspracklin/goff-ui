import { NextRequest, NextResponse } from 'next/server';

const FLAG_MANAGER_API_URL = process.env.FLAG_MANAGER_API_URL;

export interface FlagSetRetriever {
  kind: string;
  path?: string;
  url?: string;
  headers?: Record<string, string>;
  repositorySlug?: string;
  branch?: string;
  filePath?: string;
  pollingInterval?: number;
  fileFormat?: string;
}

export interface FlagSetExporter {
  kind: string;
  flushInterval?: number;
  maxEventInMemory?: number;
  bulk?: boolean;
  endpointUrl?: string;
  headers?: Record<string, string>;
  outputDir?: string;
  filename?: string;
  format?: string;
}

export interface FlagSetNotifier {
  kind: string;
  slackWebhookUrl?: string;
  endpointUrl?: string;
  headers?: Record<string, string>;
}

export interface FlagSet {
  id: string;
  name: string;
  description?: string;
  apiKeys: string[];
  retriever: FlagSetRetriever;
  exporter?: FlagSetExporter;
  notifier?: FlagSetNotifier;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

// GET - List all flag sets
export async function GET() {
  if (!FLAG_MANAGER_API_URL) {
    return NextResponse.json({ flagSets: [] });
  }

  try {
    const response = await fetch(`${FLAG_MANAGER_API_URL}/api/flagsets`);
    if (!response.ok) {
      throw new Error(`Failed to fetch flag sets: ${response.statusText}`);
    }
    return NextResponse.json(await response.json());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch flag sets' },
      { status: 500 }
    );
  }
}

// POST - Create a new flag set
export async function POST(request: NextRequest) {
  if (!FLAG_MANAGER_API_URL) {
    return NextResponse.json(
      { error: 'Flag Manager API not configured' },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();

    const response = await fetch(`${FLAG_MANAGER_API_URL}/api/flagsets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json(
        { error: error || `Failed to create flag set: ${response.statusText}` },
        { status: response.status }
      );
    }

    return NextResponse.json(await response.json(), { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create flag set' },
      { status: 500 }
    );
  }
}
