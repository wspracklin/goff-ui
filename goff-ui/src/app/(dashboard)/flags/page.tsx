'use client';

import { useState, useMemo, useEffect, Suspense } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Flag,
  Search,
  Filter,
  ChevronRight,
  AlertCircle,
  ToggleLeft,
  ToggleRight,
  Plus,
  Loader2,
  Zap,
  PieChart,
  Layers,
  Calendar,
  ListOrdered,
  FlaskConical,
  TrendingUp,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { FlagConfiguration } from '@/lib/types';
import { getValueType } from '@/lib/utils';
import { toast } from 'sonner';

type FilterStatus = 'all' | 'enabled' | 'disabled';

// Wrap the main content in Suspense for useSearchParams
export default function FlagsPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-8"><Spinner /></div>}>
      <FlagsPageContent />
    </Suspense>
  );
}

interface FlagSet {
  id: string;
  name: string;
  isDefault: boolean;
}

function FlagsPageContent() {
  const { isConnected, isDevMode, selectedFlagSet } = useAppStore();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [togglingFlag, setTogglingFlag] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Fetch flagsets to get the name of the selected one
  const flagSetsQuery = useQuery({
    queryKey: ['flagsets'],
    queryFn: async () => {
      const res = await fetch('/api/flagsets');
      if (!res.ok) throw new Error('Failed to fetch flag sets');
      return res.json() as Promise<{ flagSets: FlagSet[] }>;
    },
    staleTime: 5 * 60 * 1000,
  });

  const selectedFlagSetName = flagSetsQuery.data?.flagSets?.find(fs => fs.id === selectedFlagSet)?.name;

  // Quick flag dialog state
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickFlagKey, setQuickFlagKey] = useState('');
  const [quickFlagDescription, setQuickFlagDescription] = useState('');
  const [isCreatingQuickFlag, setIsCreatingQuickFlag] = useState(false);

  // Initialize filter from URL params
  useEffect(() => {
    const statusParam = searchParams.get('status');
    if (statusParam === 'enabled' || statusParam === 'disabled') {
      setFilterStatus(statusParam);
    }
  }, [searchParams]);

  // Update URL when filter changes
  const handleFilterChange = (status: FilterStatus) => {
    setFilterStatus(status);
    const params = new URLSearchParams(searchParams.toString());
    if (status === 'all') {
      params.delete('status');
    } else {
      params.set('status', status);
    }
    router.replace(`/flags${params.toString() ? `?${params.toString()}` : ''}`, { scroll: false });
  };

  // In dev mode, fetch from local flags file; otherwise from relay proxy
  const flagsQuery = useQuery({
    queryKey: isDevMode ? ['local-flags'] : ['flags-config'],
    queryFn: async () => {
      if (isDevMode) {
        const result = await localFlagAPI.listFlags();
        return { flags: result.flags };
      }
      return goffClient.getFlagConfiguration();
    },
    enabled: isDevMode || isConnected,
    refetchInterval: 30000,
  });

  // Helper to determine rollout type
  type RolloutType = 'single' | 'percentage' | 'progressive' | 'scheduled' | 'experimentation';

  const getRolloutType = (flag: LocalFlagConfig | FlagConfiguration): RolloutType => {
    // Check for scheduled rollout with actual steps that have dates
    if (flag.scheduledRollout && flag.scheduledRollout.length > 0) {
      const hasValidSteps = flag.scheduledRollout.some(step => step.date);
      if (hasValidSteps) {
        return 'scheduled';
      }
    }
    // Check for experimentation with actual dates (not empty strings)
    if (flag.experimentation && (flag.experimentation.start || flag.experimentation.end)) {
      return 'experimentation';
    }
    // Check for progressive rollout with actual content (initial or end with dates)
    const pr = flag.defaultRule?.progressiveRollout;
    if (pr && (pr.initial?.date || pr.end?.date)) {
      return 'progressive';
    }
    if (flag.defaultRule?.percentage && Object.keys(flag.defaultRule.percentage).length > 0) {
      return 'percentage';
    }
    return 'single';
  };

  // Helper to check if flag uses percentage rollout
  const isPercentageRollout = (flag: LocalFlagConfig | FlagConfiguration): boolean => {
    return !!(flag.defaultRule?.percentage && Object.keys(flag.defaultRule.percentage).length > 0);
  };

  // Helper to determine if a flag is currently "on" based on its configuration
  const isFlagOn = (flag: LocalFlagConfig | FlagConfiguration): boolean => {
    // Check if flag is entirely disabled via the disable field
    if (flag.disable) return false;

    const rolloutType = getRolloutType(flag);

    // For complex rollout types, flag is "on" if not disabled
    // (the rollout strategy determines the actual value)
    if (['percentage', 'progressive', 'scheduled', 'experimentation'].includes(rolloutType)) {
      return true; // Flag is active, rollout strategy determines value
    }

    // For simple flags, check the defaultRule variation
    const defaultVariation = flag.defaultRule?.variation;
    if (!defaultVariation) return false;

    // Consider it "on" if the default variation is "enabled", "on", "true", or similar
    const onVariations = ['enabled', 'on', 'true', 'yes', 'active'];
    return onVariations.includes(defaultVariation.toLowerCase());
  };

  // Helper to get the "on" variation percentage for display
  const getOnPercentage = (flag: LocalFlagConfig | FlagConfiguration): number => {
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

  // Helper to get the "on" and "off" variation names from a flag
  const getToggleVariations = (flag: LocalFlagConfig | FlagConfiguration): { on: string; off: string } => {
    const variations = flag.variations ? Object.keys(flag.variations) : [];

    // Look for common "on" variation names
    const onNames = ['enabled', 'on', 'true', 'yes', 'active'];
    const offNames = ['disabled', 'off', 'false', 'no', 'inactive'];

    const onVariation = variations.find(v => onNames.includes(v.toLowerCase())) || variations[0] || 'enabled';
    const offVariation = variations.find(v => offNames.includes(v.toLowerCase())) || variations[1] || 'disabled';

    return { on: onVariation, off: offVariation };
  };

  // Mutation to toggle flag enabled/disabled state
  const toggleFlagMutation = useMutation({
    mutationFn: async ({ key, currentConfig, turnOn }: {
      key: string;
      currentConfig: LocalFlagConfig | FlagConfiguration;
      turnOn: boolean;
    }) => {
      const rolloutType = getRolloutType(currentConfig);

      // For complex rollout types (percentage, progressive, scheduled, experimentation),
      // use the `disable` field to preserve the rollout configuration
      if (['percentage', 'progressive', 'scheduled', 'experimentation'].includes(rolloutType)) {
        const updatedConfig: LocalFlagConfig = {
          ...currentConfig,
          disable: !turnOn, // Toggle the disable field
        };
        return localFlagAPI.updateFlag(key, updatedConfig);
      }

      // For simple flags, toggle by changing the defaultRule.variation
      const { on, off } = getToggleVariations(currentConfig);
      const newVariation = turnOn ? on : off;

      const updatedConfig: LocalFlagConfig = {
        ...currentConfig,
        disable: false, // Ensure flag is not disabled
        defaultRule: {
          ...currentConfig.defaultRule,
          variation: newVariation,
        },
      };

      return localFlagAPI.updateFlag(key, updatedConfig);
    },
    onMutate: async ({ key }) => {
      setTogglingFlag(key);
    },
    onSuccess: async (_, { key, turnOn, currentConfig }) => {
      const rolloutType = getRolloutType(currentConfig);
      const isComplex = ['percentage', 'progressive', 'scheduled', 'experimentation'].includes(rolloutType);

      if (isComplex) {
        toast.success(`Flag "${key}" ${turnOn ? 'enabled' : 'disabled'} (${rolloutType} rollout preserved)`);
      } else {
        toast.success(`Flag "${key}" set to ${turnOn ? 'enabled' : 'disabled'}`);
      }
      // Invalidate and refetch flags
      await queryClient.invalidateQueries({ queryKey: ['local-flags'] });
      await queryClient.invalidateQueries({ queryKey: ['flags-config'] });
      // Force refetch
      await queryClient.refetchQueries({ queryKey: ['local-flags'] });
      await queryClient.refetchQueries({ queryKey: ['flags-config'] });
    },
    onError: (error, { key }) => {
      toast.error(`Failed to toggle flag "${key}": ${error instanceof Error ? error.message : 'Unknown error'}`);
    },
    onSettled: () => {
      setTogglingFlag(null);
    },
  });

  const handleToggle = (
    e: React.MouseEvent,
    key: string,
    flag: LocalFlagConfig | FlagConfiguration
  ) => {
    e.preventDefault(); // Prevent navigation
    e.stopPropagation();

    const currentlyOn = isFlagOn(flag);
    toggleFlagMutation.mutate({
      key,
      currentConfig: flag,
      turnOn: !currentlyOn,
    });
  };

  // Quick flag creation
  const handleCreateQuickFlag = async () => {
    if (!quickFlagKey.trim()) {
      toast.error('Flag key is required');
      return;
    }

    // Validate flag key format (no spaces, alphanumeric with dashes/underscores)
    const keyPattern = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
    if (!keyPattern.test(quickFlagKey.trim())) {
      toast.error('Flag key must start with a letter and contain only letters, numbers, dashes, and underscores');
      return;
    }

    setIsCreatingQuickFlag(true);

    const quickFlagConfig: LocalFlagConfig = {
      variations: {
        enabled: true,
        disabled: false,
      },
      defaultRule: {
        variation: 'disabled',
      },
      trackEvents: true,
      ...(quickFlagDescription.trim() && {
        metadata: {
          description: quickFlagDescription.trim(),
        },
      }),
    };

    try {
      await localFlagAPI.createFlag(quickFlagKey.trim(), quickFlagConfig);
      toast.success(`Flag "${quickFlagKey}" created`);

      // Reset form and close dialog
      setQuickFlagKey('');
      setQuickFlagDescription('');
      setShowQuickAdd(false);

      // Refresh flags list
      await queryClient.invalidateQueries({ queryKey: ['local-flags'] });
      await queryClient.invalidateQueries({ queryKey: ['flags-config'] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create flag');
    } finally {
      setIsCreatingQuickFlag(false);
    }
  };

  const filteredFlags = useMemo(() => {
    if (!flagsQuery.data?.flags) return [];

    return Object.entries(flagsQuery.data.flags)
      .filter(([key, flag]) => {
        // Search filter
        if (search && !key.toLowerCase().includes(search.toLowerCase())) {
          return false;
        }

        // Status filter - use isFlagOn logic
        const isOn = isFlagOn(flag);
        if (filterStatus === 'enabled' && !isOn) return false;
        if (filterStatus === 'disabled' && isOn) return false;

        return true;
      })
      .sort(([a], [b]) => a.localeCompare(b));
  }, [flagsQuery.data?.flags, search, filterStatus]);

  const getVariationType = (flag: FlagConfiguration | LocalFlagConfig): string => {
    if (!flag.variations) return 'unknown';
    const values = Object.values(flag.variations);
    if (values.length === 0) return 'unknown';
    return getValueType(values[0]);
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Feature Flags</h2>
          <div className="flex items-center gap-2">
            <p className="text-zinc-600 dark:text-zinc-400">
              View and manage all feature flags
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
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowQuickAdd(true)}>
            <Zap className="h-4 w-4 mr-2" />
            Quick Add
          </Button>
          <Link href="/flags/new">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Flag
            </Button>
          </Link>
        </div>
      </div>

      {/* Quick Add Dialog */}
      <Dialog open={showQuickAdd} onOpenChange={setShowQuickAdd}>
        <DialogHeader>
          <DialogTitle>Quick Add Flag</DialogTitle>
          <DialogDescription>
            Create a simple boolean feature flag with enabled/disabled variations
          </DialogDescription>
        </DialogHeader>
        <DialogContent>
          <div className="space-y-4">
            <div>
              <Label htmlFor="quickFlagKey">Flag Key *</Label>
              <Input
                id="quickFlagKey"
                value={quickFlagKey}
                onChange={(e) => setQuickFlagKey(e.target.value)}
                placeholder="my-feature-flag"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isCreatingQuickFlag) {
                    handleCreateQuickFlag();
                  }
                }}
              />
              <p className="mt-1 text-xs text-zinc-500">
                Unique identifier (letters, numbers, dashes, underscores)
              </p>
            </div>
            <div>
              <Label htmlFor="quickFlagDescription">Description</Label>
              <Textarea
                id="quickFlagDescription"
                value={quickFlagDescription}
                onChange={(e) => setQuickFlagDescription(e.target.value)}
                placeholder="What does this flag control?"
                rows={2}
              />
            </div>
            <div className="rounded-lg bg-zinc-100 dark:bg-zinc-800 p-3 text-sm">
              <p className="font-medium mb-2">Default Configuration:</p>
              <ul className="text-zinc-600 dark:text-zinc-400 space-y-1">
                <li>• Variations: <code className="text-xs bg-zinc-200 dark:bg-zinc-700 px-1 rounded">enabled (true)</code> / <code className="text-xs bg-zinc-200 dark:bg-zinc-700 px-1 rounded">disabled (false)</code></li>
                <li>• Default: <code className="text-xs bg-zinc-200 dark:bg-zinc-700 px-1 rounded">disabled</code></li>
              </ul>
            </div>
          </div>
        </DialogContent>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setShowQuickAdd(false);
              setQuickFlagKey('');
              setQuickFlagDescription('');
            }}
            disabled={isCreatingQuickFlag}
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreateQuickFlag}
            disabled={isCreatingQuickFlag || !quickFlagKey.trim()}
          >
            {isCreatingQuickFlag ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Zap className="h-4 w-4 mr-2" />
                Create Flag
              </>
            )}
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <Input
                placeholder="Search flags..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-zinc-400" />
              <div className="flex rounded-lg border border-zinc-200 dark:border-zinc-800">
                <Button
                  variant={filterStatus === 'all' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => handleFilterChange('all')}
                  className="rounded-r-none"
                >
                  All
                </Button>
                <Button
                  variant={filterStatus === 'enabled' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => handleFilterChange('enabled')}
                  className="rounded-none border-x border-zinc-200 dark:border-zinc-800"
                >
                  Enabled
                </Button>
                <Button
                  variant={filterStatus === 'disabled' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => handleFilterChange('disabled')}
                  className="rounded-l-none"
                >
                  Disabled
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Flags List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Flag className="h-5 w-5" />
            Flags ({filteredFlags.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {flagsQuery.isLoading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : filteredFlags.length > 0 ? (
            <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {filteredFlags.map(([key, flag]) => {
                const rolloutType = getRolloutType(flag);
                const onPct = getOnPercentage(flag);

                // Check if flag is disabled
                const isDisabled = flag.disable === true;

                // Render rollout type indicator (all types are now toggleable)
                const renderRolloutIndicator = () => {
                  const isLoading = togglingFlag === key;

                  // Wrapper button for all types
                  const ToggleButton = ({ children, title }: { children: React.ReactNode; title: string }) => (
                    <button
                      onClick={(e) => handleToggle(e, key, flag)}
                      disabled={isLoading}
                      className={`flex items-center justify-center w-10 h-10 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50 ${
                        isDisabled ? 'opacity-50' : ''
                      }`}
                      title={title}
                    >
                      {isLoading ? (
                        <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
                      ) : (
                        children
                      )}
                    </button>
                  );

                  switch (rolloutType) {
                    case 'percentage':
                      return (
                        <ToggleButton title={isDisabled ? 'Enable percentage rollout' : `${onPct}% rollout - Click to disable`}>
                          <div className="relative">
                            <PieChart className={`h-6 w-6 ${isDisabled ? 'text-zinc-400' : 'text-blue-500'}`} />
                            <span className={`absolute -bottom-1 -right-1 text-[8px] font-bold text-white rounded px-0.5 ${
                              isDisabled ? 'bg-zinc-400' : 'bg-blue-500'
                            }`}>
                              {onPct}%
                            </span>
                          </div>
                        </ToggleButton>
                      );
                    case 'progressive':
                      return (
                        <ToggleButton title={isDisabled ? 'Enable progressive rollout' : 'Progressive rollout - Click to disable'}>
                          <TrendingUp className={`h-6 w-6 ${isDisabled ? 'text-zinc-400' : 'text-orange-500'}`} />
                        </ToggleButton>
                      );
                    case 'scheduled':
                      return (
                        <ToggleButton title={isDisabled ? 'Enable scheduled rollout' : 'Scheduled rollout - Click to disable'}>
                          <ListOrdered className={`h-6 w-6 ${isDisabled ? 'text-zinc-400' : 'text-purple-500'}`} />
                        </ToggleButton>
                      );
                    case 'experimentation':
                      return (
                        <ToggleButton title={isDisabled ? 'Enable experimentation' : 'Experimentation - Click to disable'}>
                          <FlaskConical className={`h-6 w-6 ${isDisabled ? 'text-zinc-400' : 'text-pink-500'}`} />
                        </ToggleButton>
                      );
                    default:
                      return (
                        <ToggleButton title={isFlagOn(flag) ? 'Disable flag' : 'Enable flag'}>
                          {isFlagOn(flag) ? (
                            <ToggleRight className="h-6 w-6 text-green-500 hover:text-green-600" />
                          ) : (
                            <ToggleLeft className="h-6 w-6 text-zinc-400 hover:text-zinc-600" />
                          )}
                        </ToggleButton>
                      );
                  }
                };

                // Render rollout badge
                const renderRolloutBadge = () => {
                  switch (rolloutType) {
                    case 'percentage':
                      return (
                        <Badge variant="default" className="bg-blue-500">
                          {onPct}% Rollout
                        </Badge>
                      );
                    case 'progressive':
                      return (
                        <Badge variant="default" className="bg-orange-500">
                          Progressive
                        </Badge>
                      );
                    case 'scheduled':
                      return (
                        <Badge variant="default" className="bg-purple-500">
                          Scheduled
                        </Badge>
                      );
                    case 'experimentation':
                      return (
                        <Badge variant="default" className="bg-pink-500">
                          Experiment
                        </Badge>
                      );
                    default:
                      return (
                        <Badge
                          variant={isFlagOn(flag) ? 'success' : 'destructive'}
                        >
                          {isFlagOn(flag) ? 'Enabled' : 'Disabled'}
                        </Badge>
                      );
                  }
                };

                return (
                  <div
                    key={key}
                    className="flex items-center justify-between py-4 -mx-6 px-6 first:pt-0 last:pb-0"
                  >
                    {/* Toggle Button or Rollout Type Indicator */}
                    {renderRolloutIndicator()}

                    {/* Flag Info - Clickable Link */}
                    <Link
                      href={`/flags/${key}`}
                      className="flex-1 flex items-center justify-between ml-2 py-2 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50 rounded-lg px-3"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{key}</span>
                          {flag.version && (
                            <Badge variant="secondary" className="text-xs">
                              v{flag.version}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="secondary" className="text-xs">
                            {getVariationType(flag)}
                          </Badge>
                          {flag.variations && (
                            <span className="text-xs text-zinc-500">
                              {Object.keys(flag.variations).length} variations
                            </span>
                          )}
                          {flag.targeting && flag.targeting.length > 0 && (
                            <span className="text-xs text-zinc-500">
                              {flag.targeting.length} targeting rules
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {renderRolloutBadge()}
                        <ChevronRight className="h-5 w-5 text-zinc-400" />
                      </div>
                    </Link>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8">
              <Flag className="mx-auto h-12 w-12 text-zinc-300 dark:text-zinc-700" />
              <p className="mt-4 text-zinc-500">No flags found</p>
              {search && (
                <p className="mt-2 text-sm text-zinc-400">
                  Try adjusting your search or filter criteria
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
