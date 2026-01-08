import { NextResponse } from 'next/server';

const FLAG_MANAGER_API_URL = process.env.FLAG_MANAGER_API_URL || 'http://localhost:8095';

interface FlagSetRetriever {
  kind: string;
  path?: string;
  url?: string;
  pollingInterval?: number;
}

interface FlagSetExporter {
  kind: string;
  endpointUrl?: string;
  flushInterval?: number;
}

interface FlagSetNotifier {
  kind: string;
  slackWebhookUrl?: string;
  endpointUrl?: string;
}

interface FlagSet {
  id: string;
  name: string;
  description?: string;
  apiKeys: string[];
  retriever: FlagSetRetriever;
  exporter?: FlagSetExporter;
  notifier?: FlagSetNotifier;
  isDefault: boolean;
}

// Generate relay proxy config YAML from flagsets
export async function GET() {
  try {
    // Fetch all flagsets
    const response = await fetch(`${FLAG_MANAGER_API_URL}/api/flagsets`, {
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch flag sets' },
        { status: 500 }
      );
    }

    const data = await response.json();
    const flagSets: FlagSet[] = data.flagSets || [];

    // Build the relay proxy config
    const config = generateRelayProxyConfig(flagSets);

    return new NextResponse(config, {
      headers: {
        'Content-Type': 'application/x-yaml',
        'Content-Disposition': 'attachment; filename="relay-proxy-config.yaml"',
      },
    });
  } catch (error) {
    console.error('Error generating relay proxy config:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

function generateRelayProxyConfig(flagSets: FlagSet[]): string {
  const lines: string[] = [
    '# GO Feature Flag Relay Proxy Configuration',
    '# Auto-generated from Flag Sets',
    `# Generated at: ${new Date().toISOString()}`,
    '',
    'server:',
    '  port: 1031',
    '  host: 0.0.0.0',
    '',
    '# REST API timeout',
    'restApiTimeout: 5000',
    '',
    '# Enable admin API for manual refresh',
    'enableAdmin: true',
    '',
  ];

  if (flagSets.length === 0) {
    // No flagsets configured - use default HTTP retriever
    lines.push('# No flag sets configured - using default retriever');
    lines.push('retriever:');
    lines.push('  kind: http');
    lines.push(`  url: ${FLAG_MANAGER_API_URL}/api/flags/raw`);
    lines.push('  method: GET');
    lines.push('  timeout: 10000');
    lines.push('');
    lines.push('pollingInterval: 30000');
  } else {
    // Configure flag sets
    lines.push('# =============================================================================');
    lines.push('# Flag Sets Configuration');
    lines.push('# =============================================================================');
    lines.push('# Each flag set has its own retriever, API keys, and optional exporter/notifier');
    lines.push('');
    lines.push('flagSets:');

    for (const flagSet of flagSets) {
      lines.push(`  ${flagSet.name.toLowerCase().replace(/\s+/g, '-')}:`);

      // API Keys
      if (flagSet.apiKeys && flagSet.apiKeys.length > 0) {
        lines.push('    apiKeys:');
        for (const key of flagSet.apiKeys) {
          lines.push(`      - "${key}"`);
        }
      }

      // Retriever configuration
      lines.push('    retriever:');
      lines.push(`      kind: ${flagSet.retriever.kind}`);

      if (flagSet.retriever.kind === 'file' && flagSet.retriever.path) {
        lines.push(`      path: "${flagSet.retriever.path}"`);
      } else if (flagSet.retriever.kind === 'http') {
        // Use the flag manager API for HTTP retrievers
        const url = flagSet.retriever.url || `${FLAG_MANAGER_API_URL}/api/flagsets/${flagSet.id}/flags/raw`;
        lines.push(`      url: "${url}"`);
        lines.push('      method: GET');
        lines.push('      timeout: 10000');
      }

      // Polling interval
      const pollingInterval = flagSet.retriever.pollingInterval || 30000;
      lines.push(`    pollingInterval: ${pollingInterval}`);

      // Exporter configuration
      if (flagSet.exporter) {
        lines.push('    exporter:');
        lines.push(`      kind: ${flagSet.exporter.kind}`);
        if (flagSet.exporter.kind === 'webhook' && flagSet.exporter.endpointUrl) {
          lines.push(`      endpointUrl: "${flagSet.exporter.endpointUrl}"`);
        }
        if (flagSet.exporter.flushInterval) {
          lines.push(`      flushInterval: ${flagSet.exporter.flushInterval}`);
        }
      }

      // Notifier configuration
      if (flagSet.notifier) {
        lines.push('    notifier:');
        lines.push(`      kind: ${flagSet.notifier.kind}`);
        if (flagSet.notifier.kind === 'slack' && flagSet.notifier.slackWebhookUrl) {
          lines.push(`      slackWebhookUrl: "${flagSet.notifier.slackWebhookUrl}"`);
        } else if (flagSet.notifier.kind === 'webhook' && flagSet.notifier.endpointUrl) {
          lines.push(`      endpointUrl: "${flagSet.notifier.endpointUrl}"`);
        }
      }

      lines.push('');
    }
  }

  return lines.join('\n');
}
