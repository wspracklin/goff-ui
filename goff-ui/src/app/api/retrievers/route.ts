import { NextRequest, NextResponse } from 'next/server';

const FLAG_MANAGER_API_URL = process.env.FLAG_MANAGER_API_URL;

export type RetrieverKind =
  | 'file'
  | 'http'
  | 's3'
  | 'googleStorage'
  | 'azureBlobStorage'
  | 'github'
  | 'gitlab'
  | 'bitbucket'
  | 'mongodb'
  | 'redis'
  | 'configmap';

export interface Retriever {
  id: string;
  name: string;
  kind: RetrieverKind;
  description?: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;

  // Common fields
  pollingInterval?: number;
  timeout?: number;
  fileFormat?: 'yaml' | 'json' | 'toml';

  // File retriever
  path?: string;

  // HTTP retriever
  url?: string;
  method?: string;
  body?: string;
  headers?: Record<string, string>;

  // S3 retriever
  s3Bucket?: string;
  s3Item?: string;

  // Google Cloud Storage retriever
  gcsBucket?: string;
  gcsObject?: string;

  // Azure Blob Storage retriever
  azureContainer?: string;
  azureAccountName?: string;
  azureAccountKey?: string;
  azureObject?: string;

  // GitHub retriever
  githubRepositorySlug?: string;
  githubPath?: string;
  githubBranch?: string;
  githubToken?: string;

  // GitLab retriever
  gitlabRepositorySlug?: string;
  gitlabPath?: string;
  gitlabBranch?: string;
  gitlabToken?: string;
  gitlabBaseUrl?: string;

  // Bitbucket retriever
  bitbucketRepositorySlug?: string;
  bitbucketPath?: string;
  bitbucketBranch?: string;
  bitbucketToken?: string;
  bitbucketBaseUrl?: string;

  // MongoDB retriever
  mongodbUri?: string;
  mongodbDatabase?: string;
  mongodbCollection?: string;

  // Redis retriever
  redisAddr?: string;
  redisPassword?: string;
  redisDb?: number;
  redisPrefix?: string;

  // Kubernetes ConfigMap retriever
  configmapNamespace?: string;
  configmapName?: string;
  configmapKey?: string;
}

// GET - List all retrievers
export async function GET() {
  if (!FLAG_MANAGER_API_URL) {
    return NextResponse.json({ retrievers: [] });
  }

  try {
    const response = await fetch(`${FLAG_MANAGER_API_URL}/api/retrievers`);
    if (!response.ok) {
      throw new Error(`Failed to fetch retrievers: ${response.statusText}`);
    }
    return NextResponse.json(await response.json());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch retrievers' },
      { status: 500 }
    );
  }
}

// POST - Create a new retriever
export async function POST(request: NextRequest) {
  if (!FLAG_MANAGER_API_URL) {
    return NextResponse.json(
      { error: 'Flag Manager API not configured' },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const response = await fetch(`${FLAG_MANAGER_API_URL}/api/retrievers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json(
        { error: error || `Failed to create retriever: ${response.statusText}` },
        { status: response.status }
      );
    }

    return NextResponse.json(await response.json(), { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create retriever' },
      { status: 500 }
    );
  }
}
