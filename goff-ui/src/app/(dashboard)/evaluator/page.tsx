'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import {
  FlaskConical,
  Play,
  AlertCircle,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  Copy,
  Layers,
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
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { useAppStore } from '@/lib/store';
import goffClient from '@/lib/api';
import { localFlagAPI } from '@/lib/local-api';
import { toast } from 'sonner';
import type { FlagConfiguration } from '@/lib/types';
import { formatValue, getValueColor, getValueType } from '@/lib/utils';

interface CustomAttribute {
  key: string;
  value: string;
}

interface EvaluationResult {
  flagKey: string;
  value: unknown;
  variationType: string;
  reason: string;
  failed: boolean;
  errorCode?: string;
  version?: string;
  metadata?: Record<string, unknown>;
}

type EvaluationMode = 'standard' | 'ofrep';

function EvaluatorContent() {
  const searchParams = useSearchParams();
  const { isConnected, isDevMode, selectedFlagSet } = useAppStore();

  const [targetingKey, setTargetingKey] = useState('user-123');
  const [selectedFlag, setSelectedFlag] = useState('');
  const [defaultValue, setDefaultValue] = useState('false');
  const [customAttributes, setCustomAttributes] = useState<CustomAttribute[]>([
    { key: 'email', value: 'user@example.com' },
  ]);
  const [results, setResults] = useState<EvaluationResult[]>([]);
  const [bulkMode, setBulkMode] = useState(false);
  const [evaluationMode, setEvaluationMode] = useState<EvaluationMode>('standard');

  // Pre-fill flag from URL
  useEffect(() => {
    const flag = searchParams.get('flag');
    if (flag) {
      setSelectedFlag(flag);
    }
  }, [searchParams]);

  // Fetch flagset info for display
  const flagSetsQuery = useQuery({
    queryKey: ['flagsets'],
    queryFn: async () => {
      const res = await fetch('/api/flagsets');
      if (!res.ok) throw new Error('Failed to fetch flag sets');
      const data = await res.json();
      return data.flagSets as Array<{ id: string; name: string; isDefault: boolean }>;
    },
    staleTime: 5 * 60 * 1000,
  });

  const selectedFlagSetName = flagSetsQuery.data?.find(fs => fs.id === selectedFlagSet)?.name;

  // Fetch flags from the selected flagset (or relay proxy if no flagset selected)
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
  });

  // Simple hash function for percentage bucketing in dev mode
  const hashString = (str: string): number => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  };

  // Evaluate percentage rollout based on targeting key
  const evaluatePercentage = (
    flagKey: string,
    percentage: Record<string, number>,
    variations: Record<string, unknown>,
    key: string
  ): { variation: string; value: unknown } => {
    // Hash the targeting key + flag key for consistent bucketing
    const hashValue = hashString(`${key}:${flagKey}`);
    const bucket = hashValue % 100;

    // Sort variations for consistent ordering
    const entries = Object.entries(percentage).sort((a, b) => a[0].localeCompare(b[0]));

    let cumulative = 0;
    for (const [variationName, pct] of entries) {
      cumulative += pct;
      if (bucket < cumulative) {
        return {
          variation: variationName,
          value: variations[variationName],
        };
      }
    }

    // Fallback to first variation
    const firstVariation = entries[0]?.[0] || Object.keys(variations)[0];
    return {
      variation: firstVariation,
      value: variations[firstVariation],
    };
  };

  // Evaluate scheduled rollout - find the active step based on current time
  const evaluateScheduledRollout = (
    flagKey: string,
    scheduledRollout: FlagConfiguration['scheduledRollout'],
    variations: Record<string, unknown>,
    evalTargetingKey: string
  ): { variation: string; value: unknown; reason: string } | null => {
    if (!scheduledRollout || scheduledRollout.length === 0) return null;

    const now = new Date();

    // Sort steps by date descending to find the most recent active step
    const sortedSteps = [...scheduledRollout]
      .filter(step => step.date)
      .sort((a, b) => new Date(b.date!).getTime() - new Date(a.date!).getTime());

    // Find the first step that is active (date has passed)
    for (const step of sortedSteps) {
      const stepDate = new Date(step.date!);
      if (stepDate <= now) {
        // This step is active - evaluate its rule
        if (step.defaultRule?.variation) {
          return {
            variation: step.defaultRule.variation,
            value: variations[step.defaultRule.variation],
            reason: `SCHEDULED_ROLLOUT (Dev Mode - step from ${stepDate.toLocaleDateString()})`,
          };
        }
        if (step.defaultRule?.percentage && Object.keys(step.defaultRule.percentage).length > 0) {
          const result = evaluatePercentage(flagKey, step.defaultRule.percentage, variations, evalTargetingKey);
          return {
            variation: result.variation,
            value: result.value,
            reason: `SCHEDULED_ROLLOUT (Dev Mode - percentage step from ${stepDate.toLocaleDateString()})`,
          };
        }
      }
    }

    return null; // No active scheduled step yet
  };

  // Evaluate progressive rollout - calculate current percentage based on time
  const evaluateProgressiveRollout = (
    flagKey: string,
    progressiveRollout: NonNullable<FlagConfiguration['defaultRule']>['progressiveRollout'],
    variations: Record<string, unknown>,
    evalTargetingKey: string
  ): { variation: string; value: unknown; reason: string } | null => {
    if (!progressiveRollout?.initial?.date || !progressiveRollout?.end?.date) return null;
    if (!progressiveRollout.initial.variation || !progressiveRollout.end.variation) return null;

    const now = new Date();
    const startDate = new Date(progressiveRollout.initial.date);
    const endDate = new Date(progressiveRollout.end.date);

    const initialVariation = progressiveRollout.initial.variation;
    const endVariation = progressiveRollout.end.variation;
    const initialPct = progressiveRollout.initial.percentage ?? 0;
    const endPct = progressiveRollout.end.percentage ?? 100;

    // Before start date - return initial variation
    if (now < startDate) {
      return {
        variation: initialVariation,
        value: variations[initialVariation],
        reason: `PROGRESSIVE_ROLLOUT (Dev Mode - before start, 100% ${initialVariation})`,
      };
    }

    // After end date - return end variation at end percentage
    if (now >= endDate) {
      // Use percentage-based evaluation at the end percentage
      const percentage: Record<string, number> = {
        [endVariation]: endPct,
        [initialVariation]: 100 - endPct,
      };
      const result = evaluatePercentage(flagKey, percentage, variations, evalTargetingKey);
      return {
        variation: result.variation,
        value: result.value,
        reason: `PROGRESSIVE_ROLLOUT (Dev Mode - complete, ${endPct}% ${endVariation})`,
      };
    }

    // During rollout - calculate current percentage
    const totalDuration = endDate.getTime() - startDate.getTime();
    const elapsed = now.getTime() - startDate.getTime();
    const progress = Math.min(1, Math.max(0, elapsed / totalDuration));

    // Linear interpolation from initial to end percentage
    const currentEndPct = Math.round(initialPct + (endPct - initialPct) * progress);
    const currentInitialPct = 100 - currentEndPct;

    const percentage: Record<string, number> = {
      [endVariation]: currentEndPct,
      [initialVariation]: currentInitialPct,
    };

    const result = evaluatePercentage(flagKey, percentage, variations, evalTargetingKey);
    return {
      variation: result.variation,
      value: result.value,
      reason: `PROGRESSIVE_ROLLOUT (Dev Mode - ${currentEndPct}% ${endVariation}, ${Math.round(progress * 100)}% complete)`,
    };
  };

  // Check if experimentation is active
  const isExperimentationActive = (experimentation: FlagConfiguration['experimentation']): boolean => {
    if (!experimentation) return false;

    const now = new Date();
    const start = experimentation.start ? new Date(experimentation.start) : null;
    const end = experimentation.end ? new Date(experimentation.end) : null;

    if (start && now < start) return false;
    if (end && now > end) return false;

    return true;
  };

  // Evaluate a single flag config in dev mode
  const evaluateFlagConfig = (
    flagKey: string,
    config: FlagConfiguration,
    evalTargetingKey: string
  ): { variation: string; value: unknown; reason: string } => {
    // Check if flag is disabled
    if (config.disable) {
      const firstVariation = Object.keys(config.variations || {})[0];
      return {
        variation: firstVariation || 'default',
        value: config.variations?.[firstVariation],
        reason: 'DISABLED (Dev Mode - flag is disabled)',
      };
    }

    // Check for scheduled rollout first (highest priority for time-based)
    if (config.scheduledRollout && config.scheduledRollout.length > 0) {
      const result = evaluateScheduledRollout(flagKey, config.scheduledRollout, config.variations || {}, evalTargetingKey);
      if (result) return result;
      // If no active step, fall through to default rule
    }

    // Check for progressive rollout in default rule
    if (config.defaultRule?.progressiveRollout) {
      const result = evaluateProgressiveRollout(
        flagKey,
        config.defaultRule.progressiveRollout,
        config.variations || {},
        evalTargetingKey
      );
      if (result) return result;
    }

    // Check experimentation - if active, use percentage or variation from default rule
    if (config.experimentation && isExperimentationActive(config.experimentation)) {
      // During experimentation, evaluate normally but note it's an experiment
      if (config.defaultRule?.percentage && Object.keys(config.defaultRule.percentage).length > 0) {
        const result = evaluatePercentage(
          flagKey,
          config.defaultRule.percentage,
          config.variations || {},
          evalTargetingKey
        );
        return {
          variation: result.variation,
          value: result.value,
          reason: `EXPERIMENTATION (Dev Mode - active experiment, bucket for "${evalTargetingKey}")`,
        };
      }
    }

    // Check for percentage rollout
    if (config.defaultRule?.percentage && Object.keys(config.defaultRule.percentage).length > 0) {
      const result = evaluatePercentage(
        flagKey,
        config.defaultRule.percentage,
        config.variations || {},
        evalTargetingKey
      );
      return {
        variation: result.variation,
        value: result.value,
        reason: `PERCENTAGE_ROLLOUT (Dev Mode - bucket for "${evalTargetingKey}")`,
      };
    }

    // Check for simple variation
    const defaultVariation = config.defaultRule?.variation;
    if (defaultVariation && config.variations) {
      return {
        variation: defaultVariation,
        value: config.variations[defaultVariation],
        reason: 'DEFAULT (Dev Mode)',
      };
    }

    // Fallback to first variation
    const firstVariation = Object.keys(config.variations || {})[0];
    return {
      variation: firstVariation || 'default',
      value: config.variations?.[firstVariation] ?? Object.values(config.variations || {})[0],
      reason: 'DEFAULT (Dev Mode - No Rule)',
    };
  };

  const evaluateMutation = useMutation({
    mutationFn: async () => {
      // In dev mode or with flagset selected, evaluate locally
      if (isDevMode || selectedFlagSet) {
        const flagsData = (flagsQuery.data?.flags || {}) as Record<string, FlagConfiguration | null>;
        const evalKey = targetingKey || 'anonymous';

        if (bulkMode || !selectedFlag) {
          // Show all flags with their evaluated values (filter out nulls)
          return Object.entries(flagsData)
            .filter(([, config]) => config != null)
            .map(([key, config]) => {
              const result = evaluateFlagConfig(key, config!, evalKey);
              return {
                flagKey: key,
                value: result.value,
                variationType: result.variation,
                reason: result.reason,
                failed: false,
              };
            });
        } else {
          // Single flag evaluation
          const config = flagsData[selectedFlag];
          if (!config) {
            return [{
              flagKey: selectedFlag,
              value: parseDefaultValue(defaultValue),
              variationType: 'unknown',
              reason: 'FLAG_NOT_FOUND',
              failed: true,
              errorCode: 'FLAG_NOT_FOUND',
            }];
          }
          const result = evaluateFlagConfig(selectedFlag, config, evalKey);
          return [{
            flagKey: selectedFlag,
            value: result.value,
            variationType: result.variation,
            reason: result.reason,
            failed: false,
          }];
        }
      }

      // OFREP evaluation mode
      if (evaluationMode === 'ofrep') {
        const ofrepContext = {
          targetingKey,
          ...customAttributes.reduce(
            (acc, attr) => {
              if (attr.key) {
                acc[attr.key] = attr.value;
              }
              return acc;
            },
            {} as Record<string, string>
          ),
        };

        if (bulkMode || !selectedFlag) {
          // OFREP bulk evaluation
          const response = await goffClient.ofrepBulkEvaluate({
            context: ofrepContext,
          });

          return response.flags.map((flag) => ({
            flagKey: flag.key,
            value: flag.value,
            variationType: flag.variant,
            reason: flag.reason,
            failed: false,
            metadata: flag.metadata,
          }));
        } else {
          // OFREP single flag evaluation
          const response = await goffClient.ofrepEvaluateFlag(selectedFlag, {
            context: ofrepContext,
          });

          return [
            {
              flagKey: response.key,
              value: response.value,
              variationType: response.variant,
              reason: response.reason,
              failed: false,
              metadata: response.metadata,
            },
          ];
        }
      }

      // Standard evaluation mode
      const context = {
        evaluationContext: {
          key: targetingKey,
          custom: customAttributes.reduce(
            (acc, attr) => {
              if (attr.key) {
                acc[attr.key] = attr.value;
              }
              return acc;
            },
            {} as Record<string, string>
          ),
        },
        defaultValue: parseDefaultValue(defaultValue),
      };

      if (bulkMode || !selectedFlag) {
        // Evaluate all flags
        const response = await goffClient.getAllFlags({
          evaluationContext: context.evaluationContext,
        });

        return Object.entries(response.flags).map(([key, state]) => ({
          flagKey: key,
          value: state.value,
          variationType: state.variationType,
          reason: state.failed ? 'ERROR' : 'SUCCESS',
          failed: state.failed || false,
          errorCode: state.errorCode,
        }));
      } else {
        // Evaluate single flag
        const response = await goffClient.evaluateFlag(selectedFlag, context);

        return [
          {
            flagKey: selectedFlag,
            value: response.value,
            variationType: response.variationType,
            reason: response.reason,
            failed: response.failed,
            errorCode: response.errorCode,
            version: response.version,
            metadata: response.metadata,
          },
        ];
      }
    },
    onSuccess: (data) => {
      setResults(data);
      toast.success(
        `Evaluated ${data.length} flag${data.length > 1 ? 's' : ''}`
      );
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Evaluation failed');
    },
  });

  const parseDefaultValue = (value: string): unknown => {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  };

  const addCustomAttribute = () => {
    setCustomAttributes([...customAttributes, { key: '', value: '' }]);
  };

  const removeCustomAttribute = (index: number) => {
    setCustomAttributes(customAttributes.filter((_, i) => i !== index));
  };

  const updateCustomAttribute = (
    index: number,
    field: 'key' | 'value',
    value: string
  ) => {
    const updated = [...customAttributes];
    updated[index][field] = value;
    setCustomAttributes(updated);
  };

  const copyContext = () => {
    const context = {
      key: targetingKey,
      custom: customAttributes.reduce(
        (acc, attr) => {
          if (attr.key) {
            acc[attr.key] = attr.value;
          }
          return acc;
        },
        {} as Record<string, string>
      ),
    };
    navigator.clipboard.writeText(JSON.stringify(context, null, 2));
    toast.success('Context copied to clipboard');
  };

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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Flag Evaluator</h2>
        <p className="text-zinc-600 dark:text-zinc-400">
          Test flag evaluations with different contexts
          {selectedFlagSetName && (
            <span className="ml-2">
              <Badge variant="secondary" className="text-xs">
                <Layers className="h-3 w-3 mr-1" />
                {selectedFlagSetName}
              </Badge>
            </span>
          )}
        </p>
      </div>

      {/* No flagset selected warning */}
      {!selectedFlagSet && !isDevMode && (
        <Card className="bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800">
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800 dark:text-amber-200">
                <p className="font-medium mb-1">No Flag Set Selected</p>
                <p>
                  Select a flag set from the sidebar to evaluate flags. Without a flag set,
                  evaluations will use the relay proxy directly (if connected).
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Evaluation Context */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FlaskConical className="h-5 w-5" />
                  Evaluation Context
                </CardTitle>
                <CardDescription>
                  Configure the user context for evaluation
                </CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={copyContext}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="targetingKey">Targeting Key *</Label>
              <Input
                id="targetingKey"
                value={targetingKey}
                onChange={(e) => setTargetingKey(e.target.value)}
                placeholder="user-123"
              />
              <p className="mt-1 text-xs text-zinc-500">
                Unique identifier for the user/entity
              </p>
            </div>

            <div>
              <Label htmlFor="flag">Flag to Evaluate</Label>
              <select
                id="flag"
                value={selectedFlag}
                onChange={(e) => setSelectedFlag(e.target.value)}
                className="flex h-10 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:ring-offset-2 dark:border-zinc-700 dark:bg-zinc-950"
              >
                <option value="">All flags (bulk evaluation)</option>
                {flagsQuery.data?.flags &&
                  Object.entries(flagsQuery.data.flags)
                    .filter(([, flag]) => flag != null)
                    .map(([key]) => key)
                    .sort()
                    .map((key) => (
                      <option key={key} value={key}>
                        {key}
                      </option>
                    ))}
              </select>
            </div>

            {selectedFlag && (
              <div>
                <Label htmlFor="defaultValue">Default Value</Label>
                <Textarea
                  id="defaultValue"
                  value={defaultValue}
                  onChange={(e) => setDefaultValue(e.target.value)}
                  placeholder="false"
                  rows={2}
                />
                <p className="mt-1 text-xs text-zinc-500">
                  Returned if evaluation fails (JSON or string)
                </p>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Custom Attributes</Label>
                <Button variant="ghost" size="sm" onClick={addCustomAttribute}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add
                </Button>
              </div>
              <div className="space-y-2">
                {customAttributes.map((attr, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      placeholder="Key"
                      value={attr.key}
                      onChange={(e) =>
                        updateCustomAttribute(index, 'key', e.target.value)
                      }
                      className="w-1/3"
                    />
                    <Input
                      placeholder="Value"
                      value={attr.value}
                      onChange={(e) =>
                        updateCustomAttribute(index, 'value', e.target.value)
                      }
                      className="flex-1"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeCustomAttribute(index)}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {/* Evaluation Mode - Only in Production mode */}
            {!isDevMode && (
              <div>
                <Label>Evaluation Protocol</Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => setEvaluationMode('standard')}
                    className={`p-2 rounded-lg border-2 transition-all text-sm ${
                      evaluationMode === 'standard'
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
                        : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300'
                    }`}
                  >
                    <div className="font-medium">Standard</div>
                    <div className="text-xs text-zinc-500">GO Feature Flag API</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEvaluationMode('ofrep')}
                    className={`p-2 rounded-lg border-2 transition-all text-sm ${
                      evaluationMode === 'ofrep'
                        ? 'border-purple-500 bg-purple-50 dark:bg-purple-950'
                        : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300'
                    }`}
                  >
                    <div className="font-medium">OFREP</div>
                    <div className="text-xs text-zinc-500">OpenFeature Protocol</div>
                  </button>
                </div>
                {evaluationMode === 'ofrep' && (
                  <p className="mt-2 text-xs text-purple-600 dark:text-purple-400">
                    Using OpenFeature Remote Evaluation Protocol (OFREP) endpoints
                  </p>
                )}
              </div>
            )}

            <div className="flex items-center gap-2 pt-4">
              <Button
                onClick={() => evaluateMutation.mutate()}
                disabled={evaluateMutation.isPending || !targetingKey}
                className="flex-1"
              >
                {evaluateMutation.isPending ? (
                  <Spinner size="sm" className="mr-2" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                Evaluate {evaluationMode === 'ofrep' && !isDevMode ? '(OFREP)' : ''}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setBulkMode(!bulkMode);
                  setSelectedFlag('');
                }}
              >
                {bulkMode ? 'Single' : 'Bulk'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        <Card>
          <CardHeader>
            <CardTitle>Evaluation Results</CardTitle>
            <CardDescription>
              {results.length > 0
                ? `${results.length} flag${results.length > 1 ? 's' : ''} evaluated`
                : 'Run an evaluation to see results'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {results.length > 0 ? (
              <div className="space-y-3 max-h-[600px] overflow-y-auto">
                {results.map((result, index) => (
                  <div
                    key={index}
                    className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <Link
                        href={`/flags/${result.flagKey}`}
                        className="font-medium hover:text-blue-600"
                      >
                        {result.flagKey}
                      </Link>
                      <div className="flex items-center gap-2">
                        {result.failed ? (
                          <XCircle className="h-4 w-4 text-red-500" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        )}
                        <Badge
                          variant={result.failed ? 'destructive' : 'success'}
                        >
                          {result.failed ? 'Failed' : 'Success'}
                        </Badge>
                      </div>
                    </div>

                    <div className="space-y-2 text-sm">
                      <div className="flex items-start justify-between gap-4">
                        <span className="text-zinc-500">Value:</span>
                        <pre
                          className={`text-right ${getValueColor(
                            getValueType(result.value)
                          )}`}
                        >
                          {formatValue(result.value)}
                        </pre>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-zinc-500">Variation:</span>
                        <Badge variant="secondary">
                          {result.variationType}
                        </Badge>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-zinc-500">Reason:</span>
                        <span>{result.reason}</span>
                      </div>

                      {result.version && (
                        <div className="flex items-center justify-between">
                          <span className="text-zinc-500">Version:</span>
                          <span>v{result.version}</span>
                        </div>
                      )}

                      {result.errorCode && (
                        <div className="flex items-center justify-between">
                          <span className="text-zinc-500">Error:</span>
                          <Badge variant="destructive">{result.errorCode}</Badge>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <FlaskConical className="mx-auto h-12 w-12 text-zinc-300 dark:text-zinc-700" />
                <p className="mt-4 text-zinc-500">No results yet</p>
                <p className="mt-1 text-sm text-zinc-400">
                  Configure your context and click Evaluate
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Reference */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Reference</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <h4 className="font-medium mb-2">Evaluation Reasons</h4>
              <ul className="text-sm text-zinc-600 dark:text-zinc-400 space-y-1">
                <li>
                  <code className="text-xs bg-zinc-100 dark:bg-zinc-800 px-1 rounded">
                    TARGETING_MATCH
                  </code>{' '}
                  - Rule matched
                </li>
                <li>
                  <code className="text-xs bg-zinc-100 dark:bg-zinc-800 px-1 rounded">
                    SPLIT
                  </code>{' '}
                  - Percentage rollout
                </li>
                <li>
                  <code className="text-xs bg-zinc-100 dark:bg-zinc-800 px-1 rounded">
                    DEFAULT
                  </code>{' '}
                  - Default rule applied
                </li>
                <li>
                  <code className="text-xs bg-zinc-100 dark:bg-zinc-800 px-1 rounded">
                    DISABLED
                  </code>{' '}
                  - Flag disabled
                </li>
                <li>
                  <code className="text-xs bg-zinc-100 dark:bg-zinc-800 px-1 rounded">
                    ERROR
                  </code>{' '}
                  - Evaluation error
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-2">Error Codes</h4>
              <ul className="text-sm text-zinc-600 dark:text-zinc-400 space-y-1">
                <li>
                  <code className="text-xs bg-zinc-100 dark:bg-zinc-800 px-1 rounded">
                    FLAG_NOT_FOUND
                  </code>
                </li>
                <li>
                  <code className="text-xs bg-zinc-100 dark:bg-zinc-800 px-1 rounded">
                    TYPE_MISMATCH
                  </code>
                </li>
                <li>
                  <code className="text-xs bg-zinc-100 dark:bg-zinc-800 px-1 rounded">
                    INVALID_CONTEXT
                  </code>
                </li>
                <li>
                  <code className="text-xs bg-zinc-100 dark:bg-zinc-800 px-1 rounded">
                    TARGETING_KEY_MISSING
                  </code>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-2">OFREP Endpoints</h4>
              <ul className="text-sm text-zinc-600 dark:text-zinc-400 space-y-1">
                <li>
                  <code className="text-xs bg-purple-100 dark:bg-purple-900 px-1 rounded text-purple-700 dark:text-purple-300">
                    /ofrep/v1/evaluate/flags
                  </code>{' '}
                  - Bulk
                </li>
                <li>
                  <code className="text-xs bg-purple-100 dark:bg-purple-900 px-1 rounded text-purple-700 dark:text-purple-300">
                    /ofrep/v1/evaluate/flags/:key
                  </code>{' '}
                  - Single
                </li>
                <li className="pt-1 text-xs">
                  OpenFeature Remote Evaluation Protocol for standardized flag evaluation across providers
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-2">Tips</h4>
              <ul className="text-sm text-zinc-600 dark:text-zinc-400 space-y-1">
                <li>Use consistent targeting keys for A/B testing</li>
                <li>Add custom attributes for targeting rules</li>
                <li>Default values should match the flag type</li>
                <li>Check the reason to debug unexpected values</li>
                <li>Use OFREP for OpenFeature SDK compatibility</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function EvaluatorLoading() {
  return (
    <div className="flex justify-center py-8">
      <Spinner />
    </div>
  );
}

export default function EvaluatorPage() {
  return (
    <Suspense fallback={<EvaluatorLoading />}>
      <EvaluatorContent />
    </Suspense>
  );
}
