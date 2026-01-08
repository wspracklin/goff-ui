'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Server,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  Loader2,
  Activity,
  BarChart3,
  Info,
  Layers,
  AlertCircle,
  Cpu,
  MemoryStick,
  Network,
  Timer,
  Gauge,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAppStore } from '@/lib/store';
import goffClient from '@/lib/api';
import { toast } from 'sonner';

interface HealthInfo {
  initialized: boolean;
  checkedAt: Date;
}

interface ProxyInfo {
  cacheRefresh: string;
  flagsets?: Record<string, string>;
  checkedAt: Date;
}

interface ParsedMetric {
  name: string;
  help: string;
  type: string;
  values: Array<{
    labels: Record<string, string>;
    value: number;
  }>;
}

export default function RelayProxyPage() {
  const { isConnected, isDevMode, config } = useAppStore();
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [proxyInfo, setProxyInfo] = useState<ProxyInfo | null>(null);
  const [metrics, setMetrics] = useState<string>('');
  const [parsedMetrics, setParsedMetrics] = useState<ParsedMetric[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const parseMetrics = (metricsText: string): ParsedMetric[] => {
    const lines = metricsText.split('\n');
    const result: ParsedMetric[] = [];
    let currentMetric: ParsedMetric | null = null;

    for (const line of lines) {
      if (line.startsWith('# HELP ')) {
        const parts = line.substring(7).split(' ');
        const name = parts[0];
        const help = parts.slice(1).join(' ');
        currentMetric = { name, help, type: '', values: [] };
        result.push(currentMetric);
      } else if (line.startsWith('# TYPE ')) {
        if (currentMetric) {
          const parts = line.substring(7).split(' ');
          currentMetric.type = parts[1] || '';
        }
      } else if (line && !line.startsWith('#') && currentMetric) {
        const match = line.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{([^}]*)\})?\s+(.+)$/);
        if (match) {
          const labels: Record<string, string> = {};
          if (match[2]) {
            match[2].split(',').forEach((pair) => {
              const [key, value] = pair.split('=');
              if (key && value) {
                labels[key.trim()] = value.replace(/"/g, '').trim();
              }
            });
          }
          currentMetric.values.push({
            labels,
            value: parseFloat(match[3]),
          });
        }
      }
    }

    return result.filter((m) => m.values.length > 0);
  };

  const fetchData = useCallback(async () => {
    if (isDevMode || !config.proxyUrl) return;

    setIsLoading(true);
    try {
      // Fetch health
      const healthData = await goffClient.getHealth();
      setHealth({ initialized: healthData.initialized, checkedAt: new Date() });

      // Fetch info
      const infoData = await goffClient.getInfo();
      setProxyInfo({ ...infoData, checkedAt: new Date() });

      // Fetch metrics
      const metricsData = await goffClient.getMetrics();
      setMetrics(metricsData);
      setParsedMetrics(parseMetrics(metricsData));

      setLastRefresh(new Date());
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to fetch proxy data'
      );
    } finally {
      setIsLoading(false);
    }
  }, [isDevMode, config.proxyUrl]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchData]);

  const handleForceRefresh = async () => {
    if (!config.adminApiKey) {
      toast.error('Admin API key required for refresh');
      return;
    }

    setIsRefreshing(true);
    try {
      await goffClient.refreshFlags();
      toast.success('Flags refreshed from retriever');
      await fetchData();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to refresh flags'
      );
    } finally {
      setIsRefreshing(false);
    }
  };

  // Get important metrics
  const getMetricValue = (name: string, labels?: Record<string, string>): number | null => {
    const metric = parsedMetrics.find((m) => m.name === name);
    if (!metric || metric.values.length === 0) return null;

    if (labels) {
      const value = metric.values.find((v) =>
        Object.entries(labels).every(([key, val]) => v.labels[key] === val)
      );
      return value?.value ?? null;
    }

    return metric.values[0]?.value ?? null;
  };

  const totalRequests = getMetricValue('http_requests_total') ||
    parsedMetrics
      .filter((m) => m.name.includes('http_request'))
      .reduce((sum, m) => sum + m.values.reduce((s, v) => s + v.value, 0), 0);

  const evaluationCount = getMetricValue('feature_flag_evaluations_total') ||
    parsedMetrics
      .filter((m) => m.name.includes('evaluation'))
      .reduce((sum, m) => sum + m.values.reduce((s, v) => s + v.value, 0), 0);

  if (isDevMode) {
    return (
      <div className="space-y-6 max-w-4xl">
        <div className="flex items-center gap-4">
          <Link href="/settings">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex-1">
            <h2 className="text-2xl font-bold">Relay Proxy Monitoring</h2>
            <p className="text-zinc-600 dark:text-zinc-400">
              Health, info, and metrics for your relay proxy
            </p>
          </div>
        </div>

        <Card className="bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800">
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800 dark:text-amber-200">
                <p className="font-medium mb-1">Development Mode</p>
                <p>
                  Relay proxy monitoring is only available in Production mode.
                  Switch to Production mode in Settings to connect to a relay proxy.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-4">
        <Link href="/settings">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h2 className="text-2xl font-bold">Relay Proxy Monitoring</h2>
          <p className="text-zinc-600 dark:text-zinc-400">
            Health, info, and metrics for your relay proxy
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={autoRefresh ? 'bg-green-50 border-green-300 dark:bg-green-950' : ''}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${autoRefresh ? 'animate-spin' : ''}`} />
            {autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh'}
          </Button>
          <Button onClick={fetchData} disabled={isLoading}>
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {lastRefresh && (
        <p className="text-xs text-zinc-500">
          Last updated: {lastRefresh.toLocaleTimeString()}
        </p>
      )}

      {/* Health Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Health Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div
                className={`h-16 w-16 rounded-full flex items-center justify-center ${
                  health?.initialized
                    ? 'bg-green-100 dark:bg-green-900'
                    : 'bg-red-100 dark:bg-red-900'
                }`}
              >
                {health?.initialized ? (
                  <CheckCircle2 className="h-8 w-8 text-green-600" />
                ) : (
                  <XCircle className="h-8 w-8 text-red-600" />
                )}
              </div>
              <div>
                <h3 className="text-lg font-semibold">
                  {health?.initialized ? 'Healthy' : 'Unhealthy'}
                </h3>
                <p className="text-sm text-zinc-500">
                  {health?.initialized
                    ? 'Relay proxy is initialized and ready'
                    : 'Relay proxy is not initialized'}
                </p>
                {health?.checkedAt && (
                  <p className="text-xs text-zinc-400 mt-1">
                    Checked at {health.checkedAt.toLocaleTimeString()}
                  </p>
                )}
              </div>
            </div>
            <Badge variant={health?.initialized ? 'success' : 'destructive'} className="text-lg px-4 py-2">
              {health?.initialized ? 'OK' : 'ERROR'}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Proxy Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5" />
            Proxy Information
          </CardTitle>
          <CardDescription>
            Configuration and runtime information
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
              <div className="flex items-center gap-2 text-sm text-zinc-500 mb-1">
                <Clock className="h-4 w-4" />
                Last Cache Refresh
              </div>
              <p className="text-lg font-medium">
                {proxyInfo?.cacheRefresh
                  ? new Date(proxyInfo.cacheRefresh).toLocaleString()
                  : 'Unknown'}
              </p>
            </div>
            <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
              <div className="flex items-center gap-2 text-sm text-zinc-500 mb-1">
                <Server className="h-4 w-4" />
                Proxy URL
              </div>
              <p className="text-lg font-medium truncate">{config.proxyUrl}</p>
            </div>
          </div>

          {/* Flagsets */}
          {proxyInfo?.flagsets && Object.keys(proxyInfo.flagsets).length > 0 && (
            <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
              <div className="flex items-center gap-2 text-sm text-zinc-500 mb-3">
                <Layers className="h-4 w-4" />
                Configured Flag Sets ({Object.keys(proxyInfo.flagsets).length})
              </div>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(proxyInfo.flagsets).map(([name, hash]) => (
                  <div
                    key={name}
                    className="flex items-center justify-between bg-zinc-50 dark:bg-zinc-900 rounded px-3 py-2"
                  >
                    <span className="font-medium">{name}</span>
                    <code className="text-xs text-zinc-500">{hash}</code>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Force Refresh */}
          <div className="flex items-center justify-between rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <div>
              <h4 className="font-medium">Force Flag Refresh</h4>
              <p className="text-sm text-zinc-500">
                Trigger the relay proxy to refresh flags from the retriever
              </p>
            </div>
            <Button
              variant="outline"
              onClick={handleForceRefresh}
              disabled={!isConnected || !config.adminApiKey || isRefreshing}
            >
              {isRefreshing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Key Metrics Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Key Metrics
          </CardTitle>
          <CardDescription>
            Important metrics from the relay proxy
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard
              icon={<Network className="h-5 w-5 text-blue-500" />}
              label="Total Requests"
              value={totalRequests}
            />
            <MetricCard
              icon={<Gauge className="h-5 w-5 text-green-500" />}
              label="Evaluations"
              value={evaluationCount}
            />
            <MetricCard
              icon={<Timer className="h-5 w-5 text-amber-500" />}
              label="Uptime"
              value={getMetricValue('process_uptime_seconds')}
              format={(v) => formatDuration(v)}
            />
            <MetricCard
              icon={<MemoryStick className="h-5 w-5 text-purple-500" />}
              label="Memory (MB)"
              value={getMetricValue('go_memstats_alloc_bytes')}
              format={(v) => (v / 1024 / 1024).toFixed(1)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Raw Metrics */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cpu className="h-5 w-5" />
            All Metrics
          </CardTitle>
          <CardDescription>
            Prometheus-format metrics from /metrics endpoint
          </CardDescription>
        </CardHeader>
        <CardContent>
          {parsedMetrics.length > 0 ? (
            <div className="space-y-4">
              {parsedMetrics.slice(0, 20).map((metric, idx) => (
                <div
                  key={idx}
                  className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3"
                >
                  <div className="flex items-center justify-between mb-1">
                    <code className="text-sm font-medium text-blue-600 dark:text-blue-400">
                      {metric.name}
                    </code>
                    <Badge variant="secondary" className="text-xs">
                      {metric.type}
                    </Badge>
                  </div>
                  <p className="text-xs text-zinc-500 mb-2">{metric.help}</p>
                  <div className="space-y-1">
                    {metric.values.slice(0, 5).map((v, vIdx) => (
                      <div
                        key={vIdx}
                        className="flex items-center justify-between text-sm bg-zinc-50 dark:bg-zinc-900 rounded px-2 py-1"
                      >
                        <span className="text-zinc-600 dark:text-zinc-400">
                          {Object.keys(v.labels).length > 0
                            ? Object.entries(v.labels)
                                .map(([k, val]) => `${k}="${val}"`)
                                .join(', ')
                            : '(no labels)'}
                        </span>
                        <span className="font-mono font-medium">
                          {typeof v.value === 'number' && v.value % 1 !== 0
                            ? v.value.toFixed(4)
                            : v.value}
                        </span>
                      </div>
                    ))}
                    {metric.values.length > 5 && (
                      <p className="text-xs text-zinc-400 pl-2">
                        ... and {metric.values.length - 5} more
                      </p>
                    )}
                  </div>
                </div>
              ))}
              {parsedMetrics.length > 20 && (
                <p className="text-sm text-zinc-500 text-center">
                  Showing 20 of {parsedMetrics.length} metrics
                </p>
              )}
            </div>
          ) : metrics ? (
            <pre className="bg-zinc-100 dark:bg-zinc-800 rounded-lg p-4 text-xs overflow-x-auto max-h-96">
              {metrics}
            </pre>
          ) : (
            <div className="text-center py-8 text-zinc-500">
              <Cpu className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No metrics available</p>
              <p className="text-sm">Connect to a relay proxy to view metrics</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  format,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | null;
  format?: (v: number) => string;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-sm text-zinc-500">{label}</span>
      </div>
      <p className="text-2xl font-bold">
        {value !== null
          ? format
            ? format(value)
            : value.toLocaleString()
          : '--'}
      </p>
    </div>
  );
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return '--';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}
