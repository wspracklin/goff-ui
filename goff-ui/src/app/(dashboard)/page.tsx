'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  Flag,
  Server,
  Zap,
  Layers,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { useAppStore } from '@/lib/store';
import goffClient from '@/lib/api';
import { localFlagAPI } from '@/lib/local-api';
import { formatRelativeTime } from '@/lib/utils';
import Link from 'next/link';

interface FlagSet {
  id: string;
  name: string;
  isDefault: boolean;
}

export default function DashboardPage() {
  const { isConnected, config, isDevMode, selectedFlagSet } = useAppStore();

  // Connection is now handled by ConnectionProvider on app start

  const healthQuery = useQuery({
    queryKey: ['health'],
    queryFn: () => goffClient.getHealth(),
    enabled: isConnected && !isDevMode,
    refetchInterval: 30000,
  });

  const infoQuery = useQuery({
    queryKey: ['info'],
    queryFn: () => goffClient.getInfo(),
    enabled: isConnected && !isDevMode,
    refetchInterval: 30000,
  });

  // Fetch flags from the selected flagset (or fallback to local/relay proxy)
  const flagsQuery = useQuery({
    queryKey: selectedFlagSet ? ['flagset-flags', selectedFlagSet] : (isDevMode ? ['local-flags'] : ['flags-config']),
    queryFn: async () => {
      // If a flagset is selected, fetch from that flagset
      if (selectedFlagSet) {
        const response = await fetch(`/api/flagsets/${selectedFlagSet}/flags`);
        if (!response.ok) {
          throw new Error('Failed to fetch flags from flagset');
        }
        const data = await response.json();
        return { flags: data.flags || {} };
      }

      // No flagset selected - fall back to local/relay proxy
      if (isDevMode) {
        const result = await localFlagAPI.listFlags();
        return { flags: result.flags };
      }
      return goffClient.getFlagConfiguration();
    },
    enabled: !!selectedFlagSet || isDevMode || isConnected,
    refetchInterval: 30000,
  });

  // Fetch flagsets
  const flagSetsQuery = useQuery({
    queryKey: ['flagsets'],
    queryFn: async () => {
      const res = await fetch('/api/flagsets');
      if (!res.ok) throw new Error('Failed to fetch flag sets');
      const data = await res.json();
      return data.flagSets as FlagSet[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const selectedFlagSetName = flagSetsQuery.data?.find(fs => fs.id === selectedFlagSet)?.name;

  // Type for flag with percentage rollout
  type FlagWithRollout = {
    disable?: boolean;
    version?: string;
    defaultRule?: {
      variation?: string;
      percentage?: Record<string, number>;
    };
  };

  // Helper to check if flag uses percentage rollout
  const isPercentageRollout = (flag: FlagWithRollout | null | undefined): boolean => {
    if (!flag) return false;
    return !!(flag.defaultRule?.percentage && Object.keys(flag.defaultRule.percentage).length > 0);
  };

  // Helper to determine if a flag is currently "on" based on defaultRule
  const isFlagOn = (flag: FlagWithRollout | null | undefined): boolean => {
    if (!flag) return false;
    if (flag.disable) return false;

    // For percentage rollout, check if "on" variations have any percentage
    if (isPercentageRollout(flag)) {
      const onVariations = ['enabled', 'on', 'true', 'yes', 'active'];
      const percentage = flag.defaultRule?.percentage || {};
      return Object.entries(percentage).some(
        ([variation, pct]) => onVariations.includes(variation.toLowerCase()) && pct > 0
      );
    }

    const defaultVariation = flag.defaultRule?.variation;
    if (!defaultVariation) return false;
    const onVariations = ['enabled', 'on', 'true', 'yes', 'active'];
    return onVariations.includes(defaultVariation.toLowerCase());
  };

  // Helper to get percentage for rollout flags
  const getOnPercentage = (flag: FlagWithRollout | null | undefined): number => {
    if (!flag) return 0;
    if (!isPercentageRollout(flag)) return isFlagOn(flag) ? 100 : 0;
    const onVariations = ['enabled', 'on', 'true', 'yes', 'active'];
    const percentage = flag.defaultRule?.percentage || {};
    let totalOn = 0;
    for (const [variation, pct] of Object.entries(percentage)) {
      if (onVariations.includes(variation.toLowerCase())) {
        totalOn += pct;
      }
    }
    return totalOn;
  };

  const flags = (flagsQuery.data?.flags || {}) as Record<string, FlagWithRollout | null>;

  // Filter out null flags
  const validFlags = Object.entries(flags).filter(([, flag]) => flag != null) as [string, FlagWithRollout][];

  const flagCount = validFlags.length;

  const enabledFlags = validFlags.filter(([, f]) => isFlagOn(f)).length;

  const disabledFlags = flagCount - enabledFlags;

  if (!isConnected && !isDevMode && !selectedFlagSet) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <AlertCircle className="h-16 w-16 text-yellow-500" />
        <h2 className="text-2xl font-semibold">Not Connected</h2>
        <p className="text-zinc-600 dark:text-zinc-400">
          Configure your connection in{' '}
          <Link href="/settings" className="text-blue-600 hover:underline">
            Settings
          </Link>
          {' '}or select a Flag Set from the sidebar
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Dashboard</h2>
        <div className="flex items-center gap-2">
          <p className="text-zinc-600 dark:text-zinc-400">
            Overview of your feature flag system
          </p>
          {selectedFlagSetName && (
            <Link
              href="/settings/flagsets"
              className="flex items-center gap-1.5 rounded-full bg-purple-100 dark:bg-purple-900/30 px-2.5 py-0.5 text-xs font-medium text-purple-700 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors"
            >
              <Layers className="h-3 w-3" />
              {selectedFlagSetName}
            </Link>
          )}
        </div>
      </div>

      {/* Status Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Health Status */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">System Health</CardTitle>
            <Server className="h-4 w-4 text-zinc-500" />
          </CardHeader>
          <CardContent>
            {isDevMode ? (
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-blue-500" />
                <span className="text-2xl font-bold">Dev Mode</span>
              </div>
            ) : healthQuery.isLoading ? (
              <Spinner size="sm" />
            ) : healthQuery.data?.initialized ? (
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                <span className="text-2xl font-bold">Healthy</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-red-500" />
                <span className="text-2xl font-bold">Unhealthy</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Total Flags */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Flags</CardTitle>
            <Flag className="h-4 w-4 text-zinc-500" />
          </CardHeader>
          <CardContent>
            {flagsQuery.isLoading ? (
              <Spinner size="sm" />
            ) : (
              <div className="flex items-center gap-2">
                <Link href="/flags" className="text-2xl font-bold hover:text-blue-600 transition-colors">
                  {flagCount}
                </Link>
                <Link href="/flags?status=enabled">
                  <Badge variant="success" className="cursor-pointer hover:opacity-80 transition-opacity">
                    {enabledFlags} active
                  </Badge>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Disabled Flags */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Disabled Flags</CardTitle>
            <Zap className="h-4 w-4 text-zinc-500" />
          </CardHeader>
          <CardContent>
            {flagsQuery.isLoading ? (
              <Spinner size="sm" />
            ) : (
              <div className="flex items-center gap-2">
                <Link href="/flags?status=disabled" className="text-2xl font-bold hover:text-blue-600 transition-colors">
                  {disabledFlags}
                </Link>
                {disabledFlags > 0 && (
                  <Link href="/flags?status=disabled">
                    <Badge variant="warning" className="cursor-pointer hover:opacity-80 transition-opacity">
                      needs attention
                    </Badge>
                  </Link>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Last Refresh */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Last Refresh</CardTitle>
            <Clock className="h-4 w-4 text-zinc-500" />
          </CardHeader>
          <CardContent>
            {isDevMode ? (
              <div className="flex flex-col">
                <span className="text-2xl font-bold">Local File</span>
                <span className="text-xs text-zinc-500">flags.yaml</span>
              </div>
            ) : infoQuery.isLoading ? (
              <Spinner size="sm" />
            ) : infoQuery.data?.cacheRefresh ? (
              <div className="flex flex-col">
                <span className="text-2xl font-bold">
                  {formatRelativeTime(infoQuery.data.cacheRefresh)}
                </span>
                <span className="text-xs text-zinc-500">
                  {new Date(infoQuery.data.cacheRefresh).toLocaleString()}
                </span>
              </div>
            ) : (
              <span className="text-zinc-500">N/A</span>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Flags */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Feature Flags
          </CardTitle>
        </CardHeader>
        <CardContent>
          {flagsQuery.isLoading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : flagCount > 0 ? (
            <div className="space-y-2">
              {validFlags
                .slice(0, 10)
                .map(([key, flag]) => {
                  const isRollout = isPercentageRollout(flag);
                  const onPct = getOnPercentage(flag);

                  return (
                    <Link
                      key={key}
                      href={`/flags/${key}`}
                      className="flex items-center justify-between rounded-lg border border-zinc-200 p-3 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800"
                    >
                      <div className="flex items-center gap-3">
                        <Flag
                          className={`h-4 w-4 ${
                            isRollout
                              ? 'text-blue-500'
                              : isFlagOn(flag)
                                ? 'text-green-500'
                                : 'text-zinc-400'
                          }`}
                        />
                        <span className="font-medium">{key}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {flag.version && (
                          <Badge variant="secondary">v{flag.version}</Badge>
                        )}
                        {isRollout ? (
                          <Badge variant="default" className="bg-blue-500">
                            {onPct}% Rollout
                          </Badge>
                        ) : (
                          <Badge variant={isFlagOn(flag) ? 'success' : 'destructive'}>
                            {isFlagOn(flag) ? 'Enabled' : 'Disabled'}
                          </Badge>
                        )}
                      </div>
                    </Link>
                  );
                })}
              {flagCount > 10 && (
                <Link
                  href="/flags"
                  className="block text-center text-sm text-blue-600 hover:underline"
                >
                  View all {flagCount} flags
                </Link>
              )}
            </div>
          ) : (
            <p className="text-center text-zinc-500 py-8">No flags found</p>
          )}
        </CardContent>
      </Card>

      {/* Flagsets */}
      {infoQuery.data?.flagsets &&
        Object.keys(infoQuery.data.flagsets).length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Flagsets</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Object.entries(infoQuery.data.flagsets).map(
                  ([name, lastRefresh]) => (
                    <div
                      key={name}
                      className="flex items-center justify-between rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
                    >
                      <span className="font-medium">{name}</span>
                      <span className="text-sm text-zinc-500">
                        {formatRelativeTime(lastRefresh)}
                      </span>
                    </div>
                  )
                )}
              </div>
            </CardContent>
          </Card>
        )}
    </div>
  );
}
