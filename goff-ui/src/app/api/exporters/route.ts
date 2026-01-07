import { NextRequest, NextResponse } from 'next/server';

const FLAG_MANAGER_API_URL = process.env.FLAG_MANAGER_API_URL;

export type ExporterKind =
  | 'file'
  | 'webhook'
  | 'log'
  | 's3'
  | 'googleStorage'
  | 'azureBlobStorage'
  | 'kafka'
  | 'sqs'
  | 'kinesis'
  | 'pubsub';

export interface Exporter {
  id: string;
  name: string;
  kind: ExporterKind;
  description?: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;

  // Common fields for bulk exporters
  flushInterval?: number;
  maxEventInMemory?: number;
  format?: 'JSON' | 'CSV' | 'Parquet';
  filename?: string;
  csvTemplate?: string;
  parquetCompressionCodec?: string;

  // File exporter
  outputDir?: string;

  // Webhook exporter
  endpointUrl?: string;
  secret?: string;
  headers?: Record<string, string>;
  meta?: Record<string, string>;

  // Log exporter
  logFormat?: string;

  // S3 exporter
  s3Bucket?: string;
  s3Path?: string;

  // Google Cloud Storage exporter
  gcsBucket?: string;
  gcsPath?: string;

  // Azure Blob Storage exporter
  azureContainer?: string;
  azureAccountName?: string;
  azureAccountKey?: string;
  azurePath?: string;

  // Kafka exporter
  kafkaTopic?: string;
  kafkaAddresses?: string[];

  // SQS exporter
  sqsQueueUrl?: string;

  // Kinesis exporter
  kinesisStreamArn?: string;
  kinesisStreamName?: string;

  // PubSub exporter
  pubsubProjectId?: string;
  pubsubTopic?: string;
}

// GET - List all exporters
export async function GET() {
  if (!FLAG_MANAGER_API_URL) {
    return NextResponse.json({ exporters: [] });
  }

  try {
    const response = await fetch(`${FLAG_MANAGER_API_URL}/api/exporters`);
    if (!response.ok) {
      throw new Error(`Failed to fetch exporters: ${response.statusText}`);
    }
    return NextResponse.json(await response.json());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch exporters' },
      { status: 500 }
    );
  }
}

// POST - Create a new exporter
export async function POST(request: NextRequest) {
  if (!FLAG_MANAGER_API_URL) {
    return NextResponse.json(
      { error: 'Flag Manager API not configured' },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const response = await fetch(`${FLAG_MANAGER_API_URL}/api/exporters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json(
        { error: error || `Failed to create exporter: ${response.statusText}` },
        { status: response.status }
      );
    }

    return NextResponse.json(await response.json(), { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create exporter' },
      { status: 500 }
    );
  }
}
