'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  ArrowLeft,
  Flag,
  AlertCircle,
  Code,
  Target,
  Layers,
  Calendar,
  FlaskConical,
  Info,
  Pencil,
  Trash2,
  ExternalLink,
  TrendingUp,
  ListOrdered,
  Clock,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogContent,
  DialogFooter,
} from '@/components/ui/dialog';
import { useAppStore } from '@/lib/store';
import goffClient from '@/lib/api';
import { localFlagAPI, LocalFlagConfig } from '@/lib/local-api';
import { formatValue, getValueType, getValueColor } from '@/lib/utils';
import { toast } from 'sonner';

export default function FlagDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isConnected, selectedProject, isDevMode, config } = useAppStore();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Handle catch-all route - key comes as array of path segments
  const keySegments = params.key as string[];
  const flagKey = keySegments ? keySegments.join('/') : '';

  // Helper to determine rollout type
  type RolloutType = 'simple' | 'percentage' | 'progressive' | 'scheduled' | 'experimentation';

  const getRolloutType = (flag: LocalFlagConfig): RolloutType => {
    if (flag.scheduledRollout && flag.scheduledRollout.length > 0) {
      const hasValidSteps = flag.scheduledRollout.some(step => step.date);
      if (hasValidSteps) return 'scheduled';
    }
    if (flag.experimentation && (flag.experimentation.start || flag.experimentation.end)) {
      return 'experimentation';
    }
    const pr = flag.defaultRule?.progressiveRollout;
    if (pr && (pr.initial?.date || pr.end?.date)) {
      return 'progressive';
    }
    if (flag.defaultRule?.percentage && Object.keys(flag.defaultRule.percentage).length > 0) {
      return 'percentage';
    }
    return 'simple';
  };

  // Helper to check if flag uses percentage rollout
  const isPercentageRollout = (flag: LocalFlagConfig): boolean => {
    return !!(flag.defaultRule?.percentage && Object.keys(flag.defaultRule.percentage).length > 0);
  };

  // Helper to determine if a flag is currently "on" based on defaultRule
  const isFlagOn = (flag: LocalFlagConfig): boolean => {
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
  const getOnPercentage = (flag: LocalFlagConfig): number => {
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

  // In dev mode, fetch from local flags file; otherwise from relay proxy
  const localFlagQuery = useQuery({
    queryKey: ['local-flag', flagKey],
    queryFn: () => localFlagAPI.getFlag(flagKey),
    enabled: isDevMode,
  });

  const handleDelete = async () => {
    // In dev mode, use local API
    if (isDevMode) {
      setIsDeleting(true);
      try {
        await localFlagAPI.deleteFlag(flagKey);

        // Try to refresh flags on the relay proxy
        if (config.adminApiKey) {
          try {
            await goffClient.refreshFlags();
          } catch {
            // Ignore refresh errors
          }
        }

        await queryClient.invalidateQueries({ queryKey: ['flags-config'] });
        await queryClient.invalidateQueries({ queryKey: ['local-flags'] });

        toast.success(`Flag "${flagKey}" deleted`);
        router.push('/flags');
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to delete flag');
      } finally {
        setIsDeleting(false);
        setShowDeleteDialog(false);
      }
      return;
    }

    // In production mode, use PR workflow
    if (!selectedProject) {
      toast.error('Please select a project first');
      return;
    }

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(selectedProject)}/flags/propose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete',
          flagKey,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create PR');
      }

      await queryClient.invalidateQueries({ queryKey: ['flags-config'] });
      await queryClient.invalidateQueries({ queryKey: ['projects'] });

      toast.success(
        <div className="flex items-center gap-2">
          <span>Deletion PR created!</span>
          <a
            href={data.pullRequest.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-blue-600 hover:underline"
          >
            View PR <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      );
      router.push('/flags');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete flag');
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  const flagsQuery = useQuery({
    queryKey: ['flags-config'],
    queryFn: () => goffClient.getFlagConfiguration(),
    enabled: isConnected && !isDevMode,
  });

  // Use local flag data in dev mode, otherwise use relay proxy data
  const flag = isDevMode
    ? localFlagQuery.data?.config
    : flagsQuery.data?.flags?.[flagKey];

  const isLoading = isDevMode ? localFlagQuery.isLoading : flagsQuery.isLoading;

  if (!isConnected && !isDevMode) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <AlertCircle className="h-16 w-16 text-yellow-500" />
        <h2 className="text-2xl font-semibold">Not Connected</h2>
        <p className="text-zinc-600 dark:text-zinc-400">
          Configure your connection in{' '}
          <Link href="/settings" className="text-blue-600 hover:underline">
            Settings
          </Link>
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }

  if (!flag) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <AlertCircle className="h-16 w-16 text-red-500" />
        <h2 className="text-2xl font-semibold">Flag Not Found</h2>
        <p className="text-zinc-600 dark:text-zinc-400">
          The flag &quot;{flagKey}&quot; does not exist
        </p>
        <Button onClick={() => router.push('/flags')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Flags
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.push('/flags')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            {(() => {
              const rolloutType = getRolloutType(flag);
              const iconClass = 'h-6 w-6';
              switch (rolloutType) {
                case 'progressive':
                  return <TrendingUp className={`${iconClass} text-orange-500`} />;
                case 'scheduled':
                  return <ListOrdered className={`${iconClass} text-purple-500`} />;
                case 'experimentation':
                  return <FlaskConical className={`${iconClass} text-pink-500`} />;
                case 'percentage':
                  return <Flag className={`${iconClass} text-blue-500`} />;
                default:
                  return <Flag className={`${iconClass} ${isFlagOn(flag) ? 'text-green-500' : 'text-zinc-400'}`} />;
              }
            })()}
            <h2 className="text-2xl font-bold">{flagKey}</h2>
            {(() => {
              const rolloutType = getRolloutType(flag);
              switch (rolloutType) {
                case 'progressive':
                  return <Badge variant="default" className="bg-orange-500">Progressive Rollout</Badge>;
                case 'scheduled':
                  return <Badge variant="default" className="bg-purple-500">Scheduled</Badge>;
                case 'experimentation':
                  return <Badge variant="default" className="bg-pink-500">Experiment</Badge>;
                case 'percentage':
                  return <Badge variant="default" className="bg-blue-500">{getOnPercentage(flag)}% Rollout</Badge>;
                default:
                  return (
                    <Badge variant={isFlagOn(flag) ? 'success' : 'destructive'}>
                      {isFlagOn(flag) ? 'Enabled' : 'Disabled'}
                    </Badge>
                  );
              }
            })()}
            {flag.disable && <Badge variant="destructive">Disabled</Badge>}
            {flag.version && (
              <Badge variant="secondary">v{flag.version}</Badge>
            )}
          </div>
          {flag.metadata?.description ? (
            <p className="mt-1 text-zinc-600 dark:text-zinc-400">
              {String(flag.metadata.description)}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/evaluator?flag=${encodeURIComponent(flagKey)}`}>
            <Button variant="outline">
              <FlaskConical className="mr-2 h-4 w-4" />
              Test
            </Button>
          </Link>
          <Link href={`/flags/edit/${flagKey}`}>
            <Button variant="outline">
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Button>
          </Link>
          <Button
            variant="outline"
            onClick={() => setShowDeleteDialog(true)}
            className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogHeader>
          <DialogTitle>Delete Flag</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete &quot;{flagKey}&quot;?
          </DialogDescription>
        </DialogHeader>
        <DialogContent>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {isDevMode
              ? 'This will permanently delete the flag from your local configuration file.'
              : 'This will create a pull request to remove the flag from the configuration. The change will take effect once the PR is merged.'}
          </p>
        </DialogContent>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setShowDeleteDialog(false)}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isDeleting || (!isDevMode && !selectedProject)}
          >
            {isDeleting
              ? isDevMode ? 'Deleting...' : 'Creating PR...'
              : isDevMode ? 'Delete Flag' : 'Create Deletion PR'}
          </Button>
        </DialogFooter>
      </Dialog>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Variations */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5" />
              Variations
            </CardTitle>
            <CardDescription>
              Possible values this flag can return
            </CardDescription>
          </CardHeader>
          <CardContent>
            {flag.variations ? (
              <div className="space-y-3">
                {Object.entries(flag.variations).map(([name, value]) => {
                  const type = getValueType(value);
                  return (
                    <div
                      key={name}
                      className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{name}</span>
                        <Badge variant="secondary">{type}</Badge>
                      </div>
                      <pre
                        className={`mt-2 text-sm ${getValueColor(type)} overflow-x-auto`}
                      >
                        {formatValue(value)}
                      </pre>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-zinc-500">No variations defined</p>
            )}
          </CardContent>
        </Card>

        {/* Default Rule */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Code className="h-5 w-5" />
              Default Rule
            </CardTitle>
            <CardDescription>
              Applied when no targeting rules match
            </CardDescription>
          </CardHeader>
          <CardContent>
            {flag.defaultRule ? (
              <div className="space-y-3">
                {flag.defaultRule.variation && !flag.defaultRule.progressiveRollout && (
                  <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                    <span className="text-sm text-zinc-500">Variation:</span>
                    <p className="font-medium">{flag.defaultRule.variation}</p>
                  </div>
                )}
                {flag.defaultRule.percentage && (
                  <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                    <span className="text-sm text-zinc-500">Percentage Rollout:</span>
                    <div className="mt-2 space-y-2">
                      {Object.entries(flag.defaultRule.percentage).map(
                        ([variation, percentage]) => (
                          <div
                            key={variation}
                            className="flex items-center justify-between"
                          >
                            <span>{variation}</span>
                            <div className="flex items-center gap-2">
                              <div className="w-32 h-2 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-blue-500"
                                  style={{ width: `${percentage}%` }}
                                />
                              </div>
                              <span className="text-sm font-medium w-12 text-right">
                                {percentage}%
                              </span>
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )}
                {flag.defaultRule.progressiveRollout && (
                  <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 dark:border-orange-800 dark:bg-orange-950">
                    <div className="flex items-center gap-2 mb-3">
                      <TrendingUp className="h-5 w-5 text-orange-500" />
                      <span className="font-medium text-orange-700 dark:text-orange-300">Progressive Rollout</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-orange-600 dark:text-orange-400 uppercase">Initial</p>
                        <div className="bg-white dark:bg-zinc-900 rounded p-2 space-y-1">
                          <div className="flex justify-between text-sm">
                            <span className="text-zinc-500">Variation:</span>
                            <span className="font-medium">{flag.defaultRule.progressiveRollout.initial?.variation || '-'}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-zinc-500">Percentage:</span>
                            <span className="font-medium">{flag.defaultRule.progressiveRollout.initial?.percentage ?? 0}%</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-zinc-500">Date:</span>
                            <span className="font-medium">
                              {flag.defaultRule.progressiveRollout.initial?.date
                                ? new Date(flag.defaultRule.progressiveRollout.initial.date).toLocaleString()
                                : '-'}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-orange-600 dark:text-orange-400 uppercase">End</p>
                        <div className="bg-white dark:bg-zinc-900 rounded p-2 space-y-1">
                          <div className="flex justify-between text-sm">
                            <span className="text-zinc-500">Variation:</span>
                            <span className="font-medium">{flag.defaultRule.progressiveRollout.end?.variation || '-'}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-zinc-500">Percentage:</span>
                            <span className="font-medium">{flag.defaultRule.progressiveRollout.end?.percentage ?? 100}%</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-zinc-500">Date:</span>
                            <span className="font-medium">
                              {flag.defaultRule.progressiveRollout.end?.date
                                ? new Date(flag.defaultRule.progressiveRollout.end.date).toLocaleString()
                                : '-'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 text-xs text-orange-600 dark:text-orange-400">
                      <Clock className="inline h-3 w-3 mr-1" />
                      Traffic gradually shifts from initial to end variation between the specified dates
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-zinc-500">No default rule defined</p>
            )}
          </CardContent>
        </Card>

        {/* Scheduled Rollout */}
        {flag.scheduledRollout && flag.scheduledRollout.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ListOrdered className="h-5 w-5 text-purple-500" />
                Scheduled Rollout
              </CardTitle>
              <CardDescription>
                Configuration changes at specific dates
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {flag.scheduledRollout.map((step, index) => (
                  <div
                    key={index}
                    className="rounded-lg border border-purple-200 bg-purple-50 p-3 dark:border-purple-800 dark:bg-purple-950"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <Badge variant="secondary" className="bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300">
                        Step {index + 1}
                      </Badge>
                      <span className="text-sm font-medium text-purple-700 dark:text-purple-300">
                        {step.date ? new Date(step.date).toLocaleString() : 'No date'}
                      </span>
                    </div>
                    {step.defaultRule && (
                      <div className="text-sm">
                        {step.defaultRule.variation && (
                          <p><span className="text-zinc-500">Variation:</span> <span className="font-medium">{step.defaultRule.variation}</span></p>
                        )}
                        {step.defaultRule.percentage && (
                          <div className="mt-1">
                            <span className="text-zinc-500">Percentage:</span>
                            <div className="flex flex-wrap gap-2 mt-1">
                              {Object.entries(step.defaultRule.percentage).map(([v, p]) => (
                                <Badge key={v} variant="secondary">{v}: {p}%</Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    {step.targeting && step.targeting.length > 0 && (
                      <div className="mt-2 text-sm">
                        <span className="text-zinc-500">Targeting rules:</span>
                        <span className="ml-1 font-medium">{step.targeting.length} rule(s)</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Targeting Rules */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Targeting Rules
            </CardTitle>
            <CardDescription>
              Rules evaluated in order to determine flag value
            </CardDescription>
          </CardHeader>
          <CardContent>
            {flag.targeting && flag.targeting.length > 0 ? (
              <div className="space-y-4">
                {flag.targeting.map((rule, index) => (
                  <div
                    key={index}
                    className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <Badge variant="secondary">Rule {index + 1}</Badge>
                      {rule.name && (
                        <span className="font-medium">{rule.name}</span>
                      )}
                      {rule.disable && (
                        <Badge variant="destructive">Disabled</Badge>
                      )}
                    </div>

                    {rule.query && (
                      <div className="mb-3">
                        <span className="text-sm text-zinc-500">Query:</span>
                        <pre className="mt-1 p-2 bg-zinc-100 dark:bg-zinc-800 rounded text-sm overflow-x-auto">
                          {rule.query}
                        </pre>
                      </div>
                    )}

                    {rule.variation && (
                      <div className="mb-3">
                        <span className="text-sm text-zinc-500">Returns:</span>
                        <p className="font-medium">{rule.variation}</p>
                      </div>
                    )}

                    {rule.percentage && (
                      <div>
                        <span className="text-sm text-zinc-500">
                          Percentage Rollout:
                        </span>
                        <div className="mt-2 space-y-2">
                          {Object.entries(rule.percentage).map(
                            ([variation, percentage]) => (
                              <div
                                key={variation}
                                className="flex items-center justify-between"
                              >
                                <span>{variation}</span>
                                <div className="flex items-center gap-2">
                                  <div className="w-32 h-2 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-blue-500"
                                      style={{ width: `${percentage}%` }}
                                    />
                                  </div>
                                  <span className="text-sm font-medium w-12 text-right">
                                    {percentage}%
                                  </span>
                                </div>
                              </div>
                            )
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-zinc-500">No targeting rules defined</p>
            )}
          </CardContent>
        </Card>

        {/* Experimentation */}
        {flag.experimentation && (flag.experimentation.start || flag.experimentation.end) && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FlaskConical className="h-5 w-5 text-pink-500" />
                Experimentation
              </CardTitle>
              <CardDescription>
                A/B test window for data collection
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border border-pink-200 bg-pink-50 p-4 dark:border-pink-800 dark:bg-pink-950">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-medium text-pink-600 dark:text-pink-400 uppercase mb-1">Start Date</p>
                    <p className="font-medium text-pink-700 dark:text-pink-300">
                      {flag.experimentation.start
                        ? new Date(flag.experimentation.start).toLocaleString()
                        : 'Not set'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-pink-600 dark:text-pink-400 uppercase mb-1">End Date</p>
                    <p className="font-medium text-pink-700 dark:text-pink-300">
                      {flag.experimentation.end
                        ? new Date(flag.experimentation.end).toLocaleString()
                        : 'Not set'}
                    </p>
                  </div>
                </div>
                <div className="mt-3 text-xs text-pink-600 dark:text-pink-400">
                  <Info className="inline h-3 w-3 mr-1" />
                  Events are tracked during this window for analysis
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Metadata */}
        {flag.metadata && Object.keys(flag.metadata).length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Info className="h-5 w-5" />
                Metadata
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Object.entries(flag.metadata).map(([key, value]) => (
                  <div
                    key={key}
                    className="flex items-start justify-between gap-4"
                  >
                    <span className="text-sm text-zinc-500">{key}:</span>
                    <span className="text-sm font-medium text-right">
                      {typeof value === 'object'
                        ? JSON.stringify(value)
                        : String(value)}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Raw Configuration */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Code className="h-5 w-5" />
              Raw Configuration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="p-4 bg-zinc-900 text-zinc-100 rounded-lg overflow-x-auto text-sm">
              {JSON.stringify(flag, null, 2)}
            </pre>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
