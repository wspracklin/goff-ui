'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Settings,
  Server,
  Key,
  Shield,
  CheckCircle2,
  XCircle,
  Loader2,
  Save,
  RefreshCw,
  GitBranch,
  ChevronRight,
  Monitor,
  Code2,
  Layers,
  Bell,
  Database,
  FolderOpen,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAppStore } from '@/lib/store';
import goffClient from '@/lib/api';
import { toast } from 'sonner';

export default function SettingsPage() {
  const { config, setConfig, isConnected, testConnection, connectionError, isDevMode, setDevMode } =
    useAppStore();

  const [proxyUrl, setProxyUrl] = useState(config.proxyUrl);
  const [apiKey, setApiKey] = useState(config.apiKey || '');
  const [adminApiKey, setAdminApiKey] = useState(config.adminApiKey || '');
  const [isTesting, setIsTesting] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    setHasChanges(
      proxyUrl !== config.proxyUrl ||
        apiKey !== (config.apiKey || '') ||
        adminApiKey !== (config.adminApiKey || '')
    );
  }, [proxyUrl, apiKey, adminApiKey, config]);

  const handleSave = (showToast = true) => {
    setConfig({
      proxyUrl,
      apiKey: apiKey || undefined,
      adminApiKey: adminApiKey || undefined,
    });
    if (showToast) {
      toast.success('Settings saved');
    }
    setHasChanges(false);
  };

  const handleTestConnection = async () => {
    setIsTesting(true);

    // Temporarily apply settings for testing
    goffClient.setConfig({
      proxyUrl,
      apiKey: apiKey || undefined,
      adminApiKey: adminApiKey || undefined,
    });

    try {
      const health = await goffClient.getHealth();
      if (health.initialized) {
        toast.success('Connection successful');
        // Save if test passes (suppress duplicate toast)
        handleSave(false);
        await testConnection();
      } else {
        toast.error('Proxy is not initialized');
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Connection failed'
      );
      // Restore previous settings
      goffClient.setConfig(config);
    } finally {
      setIsTesting(false);
    }
  };

  const handleRefreshFlags = async () => {
    if (!adminApiKey) {
      toast.error('Admin API key required for refresh');
      return;
    }

    try {
      await goffClient.refreshFlags();
      toast.success('Flags refreshed from retriever');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to refresh flags'
      );
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-2xl font-bold">Settings</h2>
        <p className="text-zinc-600 dark:text-zinc-400">
          Configure your connection to the GO Feature Flag relay proxy
        </p>
      </div>

      {/* Mode Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Monitor className="h-5 w-5" />
            Operating Mode
          </CardTitle>
          <CardDescription>
            Choose how the UI connects to your feature flags
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => {
                setDevMode(true);
                toast.success('Switched to Development mode');
              }}
              className={`flex flex-col items-center gap-3 p-4 rounded-lg border-2 transition-all ${
                isDevMode
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
                  : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
              }`}
            >
              <Code2 className={`h-8 w-8 ${isDevMode ? 'text-blue-500' : 'text-zinc-400'}`} />
              <div className="text-center">
                <div className={`font-medium ${isDevMode ? 'text-blue-700 dark:text-blue-300' : ''}`}>
                  Development
                </div>
                <div className="text-xs text-zinc-500 mt-1">
                  Local flags via Flag Manager API
                </div>
              </div>
              {isDevMode && (
                <Badge variant="success" className="text-xs">Active</Badge>
              )}
            </button>
            <button
              onClick={() => {
                setDevMode(false);
                toast.success('Switched to Production mode');
              }}
              className={`flex flex-col items-center gap-3 p-4 rounded-lg border-2 transition-all ${
                !isDevMode
                  ? 'border-green-500 bg-green-50 dark:bg-green-950'
                  : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
              }`}
            >
              <Server className={`h-8 w-8 ${!isDevMode ? 'text-green-500' : 'text-zinc-400'}`} />
              <div className="text-center">
                <div className={`font-medium ${!isDevMode ? 'text-green-700 dark:text-green-300' : ''}`}>
                  Production
                </div>
                <div className="text-xs text-zinc-500 mt-1">
                  Connect to relay proxy
                </div>
              </div>
              {!isDevMode && (
                <Badge variant="success" className="text-xs">Active</Badge>
              )}
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Connection Status - Production mode only */}
      {!isDevMode && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Server className="h-5 w-5" />
                Connection Status
              </div>
              <Badge variant={isConnected ? 'success' : 'destructive'}>
                {isConnected ? (
                  <>
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Connected
                  </>
                ) : (
                  <>
                    <XCircle className="h-3 w-3 mr-1" />
                    Disconnected
                  </>
                )}
              </Badge>
            </CardTitle>
          </CardHeader>
          {connectionError && (
            <CardContent>
              <div className="rounded-lg bg-red-50 dark:bg-red-950 p-3 text-sm text-red-600 dark:text-red-400">
                {connectionError}
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Connection Settings - Production mode only */}
      {!isDevMode && <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Relay Proxy Configuration
          </CardTitle>
          <CardDescription>
            Enter the URL and API keys for your GO Feature Flag relay proxy
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="proxyUrl">Proxy URL *</Label>
            <Input
              id="proxyUrl"
              value={proxyUrl}
              onChange={(e) => setProxyUrl(e.target.value)}
              placeholder="http://localhost:1031"
            />
            <p className="mt-1 text-xs text-zinc-500">
              The URL of your GO Feature Flag relay proxy (default port: 1031)
            </p>
          </div>

          <div>
            <Label htmlFor="apiKey" className="flex items-center gap-2">
              <Key className="h-3 w-3" />
              Evaluation API Key
            </Label>
            <Input
              id="apiKey"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Optional - leave empty if auth is disabled"
            />
            <p className="mt-1 text-xs text-zinc-500">
              Used for flag evaluation endpoints. Leave empty if authentication
              is disabled.
            </p>
          </div>

          <div>
            <Label htmlFor="adminApiKey" className="flex items-center gap-2">
              <Shield className="h-3 w-3" />
              Admin API Key
            </Label>
            <Input
              id="adminApiKey"
              type="password"
              value={adminApiKey}
              onChange={(e) => setAdminApiKey(e.target.value)}
              placeholder="Optional - for admin operations"
            />
            <p className="mt-1 text-xs text-zinc-500">
              Used for admin endpoints like forcing flag refresh. Leave empty if
              not configured.
            </p>
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              onClick={handleTestConnection}
              disabled={isTesting || !proxyUrl}
            >
              {isTesting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Server className="h-4 w-4 mr-2" />
              )}
              Test Connection
            </Button>

            <Button
              variant="outline"
              onClick={() => handleSave()}
              disabled={!hasChanges}
            >
              <Save className="h-4 w-4 mr-2" />
              Save
            </Button>
          </div>
        </CardContent>
      </Card>}

      {/* Admin Actions - Production mode only */}
      {!isDevMode && <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Admin Actions
          </CardTitle>
          <CardDescription>
            Administrative operations for the relay proxy
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <div>
              <h4 className="font-medium">Force Flag Refresh</h4>
              <p className="text-sm text-zinc-500">
                Trigger the relay proxy to refresh flags from the retriever
              </p>
            </div>
            <Button
              variant="outline"
              onClick={handleRefreshFlags}
              disabled={!isConnected || !adminApiKey}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>

          {!adminApiKey && (
            <p className="text-sm text-amber-600 dark:text-amber-400">
              Configure an admin API key above to enable admin actions
            </p>
          )}
        </CardContent>
      </Card>}

      {/* Git Integrations Link */}
      <Card className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors">
        <Link href="/settings/integrations">
          <CardContent className="flex items-center justify-between p-6">
            <div className="flex items-center gap-4">
              <GitBranch className="h-6 w-6 text-blue-600" />
              <div>
                <h3 className="font-medium">Git Integrations</h3>
                <p className="text-sm text-zinc-500">
                  Configure ADO or GitLab repositories for PR-based flag changes
                </p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-zinc-400" />
          </CardContent>
        </Link>
      </Card>

      {/* Flag Sets Link */}
      <Card className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors">
        <Link href="/settings/flagsets">
          <CardContent className="flex items-center justify-between p-6">
            <div className="flex items-center gap-4">
              <Layers className="h-6 w-6 text-purple-600" />
              <div>
                <h3 className="font-medium">Flag Sets</h3>
                <p className="text-sm text-zinc-500">
                  Manage flag sets with independent retrievers, exporters, and API keys
                </p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-zinc-400" />
          </CardContent>
        </Link>
      </Card>

      {/* Notifiers Link */}
      <Card className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors">
        <Link href="/settings/notifiers">
          <CardContent className="flex items-center justify-between p-6">
            <div className="flex items-center gap-4">
              <Bell className="h-6 w-6 text-orange-500" />
              <div>
                <h3 className="font-medium">Notifiers</h3>
                <p className="text-sm text-zinc-500">
                  Configure notifications for flag configuration changes (Slack, Discord, Teams, Webhook)
                </p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-zinc-400" />
          </CardContent>
        </Link>
      </Card>

      {/* Retrievers Link */}
      <Card className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors">
        <Link href="/settings/retrievers">
          <CardContent className="flex items-center justify-between p-6">
            <div className="flex items-center gap-4">
              <FolderOpen className="h-6 w-6 text-blue-600" />
              <div>
                <h3 className="font-medium">Retrievers</h3>
                <p className="text-sm text-zinc-500">
                  Configure where flag configurations are fetched from (S3, GitHub, HTTP, File, etc.)
                </p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-zinc-400" />
          </CardContent>
        </Link>
      </Card>

      {/* Exporters Link */}
      <Card className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors">
        <Link href="/settings/exporters">
          <CardContent className="flex items-center justify-between p-6">
            <div className="flex items-center gap-4">
              <Database className="h-6 w-6 text-green-600" />
              <div>
                <h3 className="font-medium">Exporters</h3>
                <p className="text-sm text-zinc-500">
                  Configure where flag evaluation data is exported (S3, Kafka, Webhook, File, etc.)
                </p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-zinc-400" />
          </CardContent>
        </Link>
      </Card>

      {/* Help - Production mode only */}
      {!isDevMode && (
        <Card>
          <CardHeader>
            <CardTitle>Help</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 text-sm text-zinc-600 dark:text-zinc-400">
              <div>
                <h4 className="font-medium text-foreground mb-1">
                  Starting the Relay Proxy
                </h4>
                <pre className="p-3 bg-zinc-100 dark:bg-zinc-800 rounded-lg overflow-x-auto">
                  {`# Using Docker
docker run -p 1031:1031 \\
  -v $(pwd)/flags.yaml:/flags.yaml \\
  thomaspoignant/go-feature-flag-relay-proxy:latest

# Or using the binary
./go-feature-flag-relay-proxy --config config.yaml`}
                </pre>
              </div>

              <div>
                <h4 className="font-medium text-foreground mb-1">
                  Example Configuration
                </h4>
                <pre className="p-3 bg-zinc-100 dark:bg-zinc-800 rounded-lg overflow-x-auto">
                  {`# config.yaml
retriever:
  kind: file
  path: /flags.yaml
authorizedKeys:
  evaluation:
    - my-evaluation-key
  admin:
    - my-admin-key`}
                </pre>
              </div>

              <div>
                <h4 className="font-medium text-foreground mb-1">
                  CORS Configuration
                </h4>
                <p>
                  If accessing from a different origin, ensure CORS is configured
                  on the relay proxy or use a reverse proxy.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
