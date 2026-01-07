'use client';

import { useState, useEffect } from 'react';
import { Plus, Trash2, GripVertical, Calendar, Clock, TrendingUp, FlaskConical, ListOrdered, Info, HelpCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { DateTimePicker, DateTimePickerCompact } from '@/components/ui/datetime-picker';
import { LocalFlagConfig, TargetingRule, ProgressiveRollout, ScheduledStep, ExperimentationRollout } from '@/lib/local-api';
import { toast } from 'sonner';

type RolloutStrategy = 'single' | 'percentage' | 'progressive' | 'scheduled' | 'experimentation';

interface FlagEditorProps {
  initialKey?: string;
  initialConfig?: LocalFlagConfig;
  onSave: (key: string, config: LocalFlagConfig) => void;
  onCancel: () => void;
  isLoading?: boolean;
  mode: 'create' | 'edit';
  usePrWorkflow?: boolean;
}

interface Variation {
  name: string;
  value: string;
  type: 'boolean' | 'string' | 'number' | 'json';
}

export function FlagEditor({
  initialKey = '',
  initialConfig,
  onSave,
  onCancel,
  isLoading = false,
  mode,
  usePrWorkflow = false,
}: FlagEditorProps) {
  const [flagKey, setFlagKey] = useState(initialKey);
  const [variations, setVariations] = useState<Variation[]>([
    { name: 'enabled', value: 'true', type: 'boolean' },
    { name: 'disabled', value: 'false', type: 'boolean' },
  ]);
  const [defaultVariation, setDefaultVariation] = useState('disabled');
  const [rolloutStrategy, setRolloutStrategy] = useState<RolloutStrategy>('single');
  const [percentages, setPercentages] = useState<Record<string, number>>({});
  const [targetingRules, setTargetingRules] = useState<TargetingRule[]>([]);
  const [isDisabled, setIsDisabled] = useState(false);
  const [trackEvents, setTrackEvents] = useState(true);
  const [version, setVersion] = useState('');
  const [description, setDescription] = useState('');
  const [bucketingKey, setBucketingKey] = useState('');
  const [metadataEntries, setMetadataEntries] = useState<{ key: string; value: string }[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showQueryHelp, setShowQueryHelp] = useState(false);

  // Targeting rule type for each rule
  type TargetingRuleType = 'variation' | 'percentage' | 'progressive';
  const [targetingRuleTypes, setTargetingRuleTypes] = useState<Record<number, TargetingRuleType>>({});

  // Progressive rollout state
  const [progressiveRollout, setProgressiveRollout] = useState<ProgressiveRollout>({
    initial: { variation: '', date: '', percentage: 0 },
    end: { variation: '', date: '', percentage: 100 },
  });

  // Scheduled rollout state
  const [scheduledSteps, setScheduledSteps] = useState<ScheduledStep[]>([]);

  // Experimentation state
  const [experimentation, setExperimentation] = useState<ExperimentationRollout>({
    start: '',
    end: '',
  });

  // Initialize from existing config
  useEffect(() => {
    if (initialConfig) {
      // Parse variations
      if (initialConfig.variations) {
        const vars: Variation[] = Object.entries(initialConfig.variations).map(
          ([name, value]) => ({
            name,
            value: typeof value === 'object' ? JSON.stringify(value) : String(value),
            type: getValueType(value),
          })
        );
        setVariations(vars.length > 0 ? vars : variations);
      }

      // Determine rollout strategy and parse default rule
      if (initialConfig.scheduledRollout && initialConfig.scheduledRollout.length > 0) {
        setRolloutStrategy('scheduled');
        setScheduledSteps(initialConfig.scheduledRollout);
      } else if (initialConfig.experimentation?.start || initialConfig.experimentation?.end) {
        setRolloutStrategy('experimentation');
        setExperimentation(initialConfig.experimentation);
        // Also parse the default rule for experimentation (usually percentage)
        if (initialConfig.defaultRule?.percentage) {
          setPercentages(initialConfig.defaultRule.percentage);
        } else if (initialConfig.defaultRule?.variation) {
          setDefaultVariation(initialConfig.defaultRule.variation);
        }
      } else if (initialConfig.defaultRule?.progressiveRollout) {
        setRolloutStrategy('progressive');
        setProgressiveRollout(initialConfig.defaultRule.progressiveRollout);
      } else if (initialConfig.defaultRule?.percentage) {
        setRolloutStrategy('percentage');
        setPercentages(initialConfig.defaultRule.percentage);
      } else if (initialConfig.defaultRule?.variation) {
        setRolloutStrategy('single');
        setDefaultVariation(initialConfig.defaultRule.variation);
      }

      // Parse targeting rules
      if (initialConfig.targeting) {
        setTargetingRules(initialConfig.targeting);
      }

      setIsDisabled(initialConfig.disable || false);
      setTrackEvents(initialConfig.trackEvents !== false);
      setVersion(initialConfig.version || '');
      setBucketingKey(initialConfig.bucketingKey || '');

      // Parse metadata
      if (initialConfig.metadata) {
        const desc = (initialConfig.metadata.description as string) || '';
        setDescription(desc);

        // Parse other metadata entries (excluding description)
        const entries = Object.entries(initialConfig.metadata)
          .filter(([key]) => key !== 'description')
          .map(([key, value]) => ({
            key,
            value: typeof value === 'object' ? JSON.stringify(value) : String(value),
          }));
        setMetadataEntries(entries);

        // Show advanced section if there are extra metadata entries or bucketing key
        if (entries.length > 0 || initialConfig.bucketingKey) {
          setShowAdvanced(true);
        }
      }

      // Parse targeting rule types
      if (initialConfig.targeting) {
        const ruleTypes: Record<number, TargetingRuleType> = {};
        initialConfig.targeting.forEach((rule, index) => {
          if (rule.progressiveRollout) {
            ruleTypes[index] = 'progressive';
          } else if (rule.percentage && Object.keys(rule.percentage).length > 0) {
            ruleTypes[index] = 'percentage';
          } else {
            ruleTypes[index] = 'variation';
          }
        });
        setTargetingRuleTypes(ruleTypes);
      }
    }
  }, [initialConfig]);

  const getValueType = (value: unknown): 'boolean' | 'string' | 'number' | 'json' => {
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'object') return 'json';
    return 'string';
  };

  const parseValue = (value: string, type: string): unknown => {
    switch (type) {
      case 'boolean':
        return value === 'true';
      case 'number':
        return parseFloat(value) || 0;
      case 'json':
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      default:
        return value;
    }
  };

  const addVariation = () => {
    const newName = `variation-${variations.length + 1}`;
    setVariations([...variations, { name: newName, value: '', type: 'string' }]);
  };

  const removeVariation = (index: number) => {
    if (variations.length <= 2) return; // Minimum 2 variations
    const newVariations = variations.filter((_, i) => i !== index);
    setVariations(newVariations);

    // Update default if removed
    if (defaultVariation === variations[index].name) {
      setDefaultVariation(newVariations[0]?.name || '');
    }
  };

  const updateVariation = (index: number, field: keyof Variation, value: string) => {
    const updated = [...variations];
    if (field === 'name') {
      // Update references if name changes
      const oldName = updated[index].name;
      if (defaultVariation === oldName) {
        setDefaultVariation(value);
      }
      // Update percentages
      if (percentages[oldName] !== undefined) {
        const newPercentages = { ...percentages };
        newPercentages[value] = newPercentages[oldName];
        delete newPercentages[oldName];
        setPercentages(newPercentages);
      }
    }
    updated[index] = { ...updated[index], [field]: value };
    setVariations(updated);
  };

  const addTargetingRule = () => {
    setTargetingRules([
      ...targetingRules,
      { name: `rule-${targetingRules.length + 1}`, query: '', variation: variations[0]?.name || '' },
    ]);
  };

  const removeTargetingRule = (index: number) => {
    setTargetingRules(targetingRules.filter((_, i) => i !== index));
  };

  const updateTargetingRule = (index: number, updates: Partial<TargetingRule>) => {
    const updated = [...targetingRules];
    updated[index] = { ...updated[index], ...updates };
    setTargetingRules(updated);
  };

  // Scheduled rollout helpers
  const addScheduledStep = () => {
    const newDate = new Date();
    newDate.setDate(newDate.getDate() + scheduledSteps.length + 1);
    setScheduledSteps([
      ...scheduledSteps,
      {
        date: newDate.toISOString().slice(0, 16),
        defaultRule: { variation: variations[0]?.name || '' },
      },
    ]);
  };

  const removeScheduledStep = (index: number) => {
    setScheduledSteps(scheduledSteps.filter((_, i) => i !== index));
  };

  const updateScheduledStep = (index: number, updates: Partial<ScheduledStep>) => {
    const updated = [...scheduledSteps];
    updated[index] = { ...updated[index], ...updates };
    setScheduledSteps(updated);
  };

  // Format date for datetime-local input
  const formatDateForInput = (dateStr: string | undefined): string => {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      return date.toISOString().slice(0, 16);
    } catch {
      return '';
    }
  };

  // Convert datetime-local to ISO string
  const formatDateToISO = (dateStr: string): string => {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      return date.toISOString();
    } catch {
      return dateStr;
    }
  };

  const handleSubmit = () => {
    // Validate required fields based on rollout strategy
    if (rolloutStrategy === 'progressive') {
      if (!progressiveRollout.initial?.date || !progressiveRollout.end?.date) {
        toast.error('Progressive rollout requires start and end dates');
        return;
      }
      if (!progressiveRollout.initial?.variation || !progressiveRollout.end?.variation) {
        toast.error('Progressive rollout requires initial and end variations');
        return;
      }
      // Validate date order
      const startDate = new Date(progressiveRollout.initial.date);
      const endDate = new Date(progressiveRollout.end.date);
      if (endDate <= startDate) {
        toast.error('End date must be after start date');
        return;
      }
    }
    if (rolloutStrategy === 'scheduled') {
      if (scheduledSteps.length === 0 || !scheduledSteps.some(s => s.date)) {
        toast.error('Scheduled rollout requires at least one step with a date');
        return;
      }
    }
    if (rolloutStrategy === 'experimentation') {
      if (!experimentation.start && !experimentation.end) {
        toast.error('Experimentation requires start or end date');
        return;
      }
    }

    // Build the config
    const variationsObj: Record<string, unknown> = {};
    variations.forEach((v) => {
      variationsObj[v.name] = parseValue(v.value, v.type);
    });

    const config: LocalFlagConfig = {
      variations: variationsObj,
      disable: isDisabled,
      trackEvents,
    };

    // Build default rule based on rollout strategy
    switch (rolloutStrategy) {
      case 'single':
        config.defaultRule = { variation: defaultVariation };
        break;

      case 'percentage':
        config.defaultRule = { percentage: percentages };
        break;

      case 'progressive':
        config.defaultRule = {
          progressiveRollout: {
            initial: {
              variation: progressiveRollout.initial?.variation,
              percentage: progressiveRollout.initial?.percentage,
              date: formatDateToISO(progressiveRollout.initial?.date || ''),
            },
            end: {
              variation: progressiveRollout.end?.variation,
              percentage: progressiveRollout.end?.percentage,
              date: formatDateToISO(progressiveRollout.end?.date || ''),
            },
          },
        };
        break;

      case 'scheduled':
        config.defaultRule = { variation: defaultVariation };
        config.scheduledRollout = scheduledSteps.map(step => ({
          ...step,
          date: formatDateToISO(step.date),
        }));
        break;

      case 'experimentation':
        config.defaultRule = Object.keys(percentages).length > 0
          ? { percentage: percentages }
          : { variation: defaultVariation };
        config.experimentation = {
          start: formatDateToISO(experimentation.start || ''),
          end: formatDateToISO(experimentation.end || ''),
        };
        break;
    }

    if (targetingRules.length > 0) {
      config.targeting = targetingRules;
    }

    if (version) {
      config.version = version;
    }

    if (bucketingKey) {
      config.bucketingKey = bucketingKey;
    }

    // Build metadata object
    const metadata: Record<string, unknown> = {};
    if (description) {
      metadata.description = description;
    }
    metadataEntries.forEach(({ key, value }) => {
      if (key.trim()) {
        // Try to parse JSON values
        try {
          metadata[key.trim()] = JSON.parse(value);
        } catch {
          metadata[key.trim()] = value;
        }
      }
    });
    if (Object.keys(metadata).length > 0) {
      config.metadata = metadata;
    }

    onSave(flagKey, config);
  };

  return (
    <div className="space-y-6">
      {/* Basic Info */}
      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="flagKey">Flag Key *</Label>
            <Input
              id="flagKey"
              value={flagKey}
              onChange={(e) => setFlagKey(e.target.value)}
              placeholder="my-feature-flag"
              disabled={mode === 'edit'}
            />
            <p className="mt-1 text-xs text-zinc-500">
              Unique identifier for the flag (cannot contain spaces)
            </p>
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this flag do?"
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="version">Version</Label>
              <Input
                id="version"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="1.0.0"
              />
            </div>
            <div className="flex items-end gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={!isDisabled}
                  onChange={(e) => setIsDisabled(!e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm">Enabled</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={trackEvents}
                  onChange={(e) => setTrackEvents(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm">Track Events</span>
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Advanced Settings (collapsible) */}
      <Card>
        <CardHeader
          className="cursor-pointer"
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              Advanced Settings
              {(bucketingKey || metadataEntries.length > 0) && (
                <Badge variant="secondary" className="text-xs">Configured</Badge>
              )}
            </CardTitle>
            {showAdvanced ? (
              <ChevronUp className="h-5 w-5 text-zinc-400" />
            ) : (
              <ChevronDown className="h-5 w-5 text-zinc-400" />
            )}
          </div>
        </CardHeader>
        {showAdvanced && (
          <CardContent className="space-y-6">
            {/* Bucketing Key */}
            <div>
              <Label htmlFor="bucketingKey">Bucketing Key</Label>
              <Input
                id="bucketingKey"
                value={bucketingKey}
                onChange={(e) => setBucketingKey(e.target.value)}
                placeholder="e.g., companyId, teamId"
              />
              <p className="mt-1 text-xs text-zinc-500">
                Use a different evaluation context field for consistent traffic splitting instead of the default targetingKey.
                If specified but missing from context, flag evaluation will fail.
              </p>
            </div>

            {/* Custom Metadata */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Custom Metadata</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setMetadataEntries([...metadataEntries, { key: '', value: '' }])}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Entry
                </Button>
              </div>
              <p className="text-xs text-zinc-500 mb-3">
                Add custom metadata like configuration URLs, Jira issues, or owner information.
              </p>
              {metadataEntries.length === 0 ? (
                <p className="text-sm text-zinc-400 text-center py-2">
                  No custom metadata entries
                </p>
              ) : (
                <div className="space-y-2">
                  {metadataEntries.map((entry, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Input
                        value={entry.key}
                        onChange={(e) => {
                          const updated = [...metadataEntries];
                          updated[index] = { ...entry, key: e.target.value };
                          setMetadataEntries(updated);
                        }}
                        placeholder="Key (e.g., jiraIssue)"
                        className="w-40"
                      />
                      <Input
                        value={entry.value}
                        onChange={(e) => {
                          const updated = [...metadataEntries];
                          updated[index] = { ...entry, value: e.target.value };
                          setMetadataEntries(updated);
                        }}
                        placeholder="Value"
                        className="flex-1"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setMetadataEntries(metadataEntries.filter((_, i) => i !== index));
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Variations */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Variations</CardTitle>
          <Button variant="outline" size="sm" onClick={addVariation}>
            <Plus className="h-4 w-4 mr-1" />
            Add Variation
          </Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {variations.map((variation, index) => (
              <div key={index} className="flex items-center gap-3">
                <GripVertical className="h-4 w-4 text-zinc-400" />
                <Input
                  value={variation.name}
                  onChange={(e) => updateVariation(index, 'name', e.target.value)}
                  placeholder="Variation name"
                  className="w-40"
                />
                <select
                  value={variation.type}
                  onChange={(e) => updateVariation(index, 'type', e.target.value)}
                  className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                >
                  <option value="boolean">Boolean</option>
                  <option value="string">String</option>
                  <option value="number">Number</option>
                  <option value="json">JSON</option>
                </select>
                <Input
                  value={variation.value}
                  onChange={(e) => updateVariation(index, 'value', e.target.value)}
                  placeholder={variation.type === 'boolean' ? 'true/false' : 'Value'}
                  className="flex-1"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeVariation(index)}
                  disabled={variations.length <= 2}
                >
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Rollout Strategy */}
      <Card>
        <CardHeader>
          <CardTitle>Rollout Strategy</CardTitle>
          <CardDescription>
            Choose how to roll out this flag to users
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Strategy Selector */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <button
              type="button"
              onClick={() => setRolloutStrategy('single')}
              className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all ${
                rolloutStrategy === 'single'
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
                  : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300'
              }`}
            >
              <Clock className={`h-5 w-5 ${rolloutStrategy === 'single' ? 'text-blue-500' : 'text-zinc-400'}`} />
              <span className="text-xs font-medium">Single</span>
            </button>
            <button
              type="button"
              onClick={() => setRolloutStrategy('percentage')}
              className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all ${
                rolloutStrategy === 'percentage'
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
                  : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300'
              }`}
            >
              <TrendingUp className={`h-5 w-5 ${rolloutStrategy === 'percentage' ? 'text-blue-500' : 'text-zinc-400'}`} />
              <span className="text-xs font-medium">Percentage</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setRolloutStrategy('progressive');
                // Initialize progressive rollout with default dates if empty
                if (!progressiveRollout.initial?.date && !progressiveRollout.end?.date) {
                  const startDate = new Date();
                  const endDate = new Date();
                  endDate.setDate(endDate.getDate() + 7);
                  const firstVar = variations[0]?.name || '';
                  const lastVar = variations[variations.length - 1]?.name || firstVar;
                  setProgressiveRollout({
                    initial: { variation: firstVar, date: startDate.toISOString().slice(0, 16), percentage: 0 },
                    end: { variation: lastVar, date: endDate.toISOString().slice(0, 16), percentage: 100 },
                  });
                }
              }}
              className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all ${
                rolloutStrategy === 'progressive'
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
                  : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300'
              }`}
            >
              <Calendar className={`h-5 w-5 ${rolloutStrategy === 'progressive' ? 'text-blue-500' : 'text-zinc-400'}`} />
              <span className="text-xs font-medium">Progressive</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setRolloutStrategy('scheduled');
                // Initialize with one step if empty
                if (scheduledSteps.length === 0) {
                  const tomorrow = new Date();
                  tomorrow.setDate(tomorrow.getDate() + 1);
                  setScheduledSteps([{
                    date: tomorrow.toISOString().slice(0, 16),
                    defaultRule: { variation: variations[0]?.name || '' },
                  }]);
                }
              }}
              className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all ${
                rolloutStrategy === 'scheduled'
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
                  : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300'
              }`}
            >
              <ListOrdered className={`h-5 w-5 ${rolloutStrategy === 'scheduled' ? 'text-blue-500' : 'text-zinc-400'}`} />
              <span className="text-xs font-medium">Scheduled</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setRolloutStrategy('experimentation');
                // Initialize with default dates if empty
                if (!experimentation.start && !experimentation.end) {
                  const startDate = new Date();
                  const endDate = new Date();
                  endDate.setDate(endDate.getDate() + 14);
                  setExperimentation({
                    start: startDate.toISOString().slice(0, 16),
                    end: endDate.toISOString().slice(0, 16),
                  });
                }
              }}
              className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all ${
                rolloutStrategy === 'experimentation'
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
                  : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300'
              }`}
            >
              <FlaskConical className={`h-5 w-5 ${rolloutStrategy === 'experimentation' ? 'text-blue-500' : 'text-zinc-400'}`} />
              <span className="text-xs font-medium">Experiment</span>
            </button>
          </div>

          {/* Single Variation */}
          {rolloutStrategy === 'single' && (
            <div className="space-y-4">
              <div className="flex items-start gap-2 p-3 rounded-lg bg-zinc-50 dark:bg-zinc-900">
                <Info className="h-4 w-4 text-zinc-500 mt-0.5" />
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  All users will receive the same variation.
                </p>
              </div>
              <div>
                <Label>Default Variation</Label>
                <select
                  value={defaultVariation}
                  onChange={(e) => setDefaultVariation(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                >
                  {variations.map((v) => (
                    <option key={v.name} value={v.name}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Percentage Rollout */}
          {rolloutStrategy === 'percentage' && (
            <div className="space-y-4">
              <div className="flex items-start gap-2 p-3 rounded-lg bg-zinc-50 dark:bg-zinc-900">
                <Info className="h-4 w-4 text-zinc-500 mt-0.5" />
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Split traffic between variations by percentage. Users consistently receive the same variation.
                </p>
              </div>
              <div className="space-y-3">
                {variations.map((v) => (
                  <div key={v.name} className="flex items-center gap-3">
                    <span className="w-32 text-sm font-medium">{v.name}</span>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={percentages[v.name] || 0}
                      onChange={(e) =>
                        setPercentages({
                          ...percentages,
                          [v.name]: parseInt(e.target.value) || 0,
                        })
                      }
                      className="w-24"
                    />
                    <span className="text-sm text-zinc-500">%</span>
                    <div className="flex-1 h-2 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500"
                        style={{ width: `${percentages[v.name] || 0}%` }}
                      />
                    </div>
                  </div>
                ))}
                <p className="text-xs text-zinc-500">
                  Total: {Object.values(percentages).reduce((a, b) => a + b, 0)}%
                  {Object.values(percentages).reduce((a, b) => a + b, 0) !== 100 && (
                    <span className="text-amber-500 ml-2">(should equal 100%)</span>
                  )}
                </p>
              </div>
            </div>
          )}

          {/* Progressive Rollout */}
          {rolloutStrategy === 'progressive' && (
            <div className="space-y-4">
              <div className="flex items-start gap-2 p-3 rounded-lg bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800">
                <TrendingUp className="h-4 w-4 text-orange-500 mt-0.5" />
                <div className="text-sm text-orange-700 dark:text-orange-300">
                  <p className="font-medium mb-1">Progressive Rollout Timeline</p>
                  <ul className="text-xs space-y-0.5 text-orange-600 dark:text-orange-400">
                    <li>• <strong>Before</strong> start date → Returns initial variation</li>
                    <li>• <strong>Between</strong> start and end → Gradually shifts from initial to end variation</li>
                    <li>• <strong>After</strong> end date → Returns end variation at end percentage</li>
                  </ul>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Initial State */}
                <div className="space-y-3 p-4 rounded-lg border-2 border-orange-200 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-950/50">
                  <h4 className="font-medium text-sm flex items-center gap-2">
                    <Badge variant="secondary" className="bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300">Initial State</Badge>
                  </h4>
                  <div>
                    <Label className="text-orange-700 dark:text-orange-300">Start Date *</Label>
                    <DateTimePicker
                      value={progressiveRollout.initial?.date}
                      onChange={(value) =>
                        setProgressiveRollout({
                          ...progressiveRollout,
                          initial: { ...progressiveRollout.initial, date: value },
                        })
                      }
                      placeholder="When to start rolling out"
                    />
                  </div>
                  <div>
                    <Label className="text-orange-700 dark:text-orange-300">Initial Variation *</Label>
                    <select
                      value={progressiveRollout.initial?.variation || ''}
                      onChange={(e) =>
                        setProgressiveRollout({
                          ...progressiveRollout,
                          initial: { ...progressiveRollout.initial, variation: e.target.value },
                        })
                      }
                      className="flex h-10 w-full rounded-md border border-orange-300 bg-white px-3 py-2 text-sm dark:border-orange-700 dark:bg-zinc-950"
                    >
                      <option value="">Select starting variation</option>
                      {variations.map((v) => (
                        <option key={v.name} value={v.name}>{v.name}</option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-orange-600 dark:text-orange-400">Served before start date</p>
                  </div>
                  <div>
                    <Label className="text-orange-700 dark:text-orange-300">Starting Percentage</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        value={progressiveRollout.initial?.percentage ?? 0}
                        onChange={(e) =>
                          setProgressiveRollout({
                            ...progressiveRollout,
                            initial: { ...progressiveRollout.initial, percentage: parseInt(e.target.value) || 0 },
                          })
                        }
                        className="w-24"
                      />
                      <span className="text-sm text-orange-600 dark:text-orange-400">%</span>
                    </div>
                    <p className="mt-1 text-xs text-zinc-500">Default: 0% (optional)</p>
                  </div>
                </div>

                {/* End State */}
                <div className="space-y-3 p-4 rounded-lg border-2 border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/50">
                  <h4 className="font-medium text-sm flex items-center gap-2">
                    <Badge variant="success" className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">End State</Badge>
                  </h4>
                  <div>
                    <Label className="text-green-700 dark:text-green-300">End Date *</Label>
                    <DateTimePicker
                      value={progressiveRollout.end?.date}
                      onChange={(value) =>
                        setProgressiveRollout({
                          ...progressiveRollout,
                          end: { ...progressiveRollout.end, date: value },
                        })
                      }
                      placeholder="When to complete rollout"
                    />
                  </div>
                  <div>
                    <Label className="text-green-700 dark:text-green-300">End Variation *</Label>
                    <select
                      value={progressiveRollout.end?.variation || ''}
                      onChange={(e) =>
                        setProgressiveRollout({
                          ...progressiveRollout,
                          end: { ...progressiveRollout.end, variation: e.target.value },
                        })
                      }
                      className="flex h-10 w-full rounded-md border border-green-300 bg-white px-3 py-2 text-sm dark:border-green-700 dark:bg-zinc-950"
                    >
                      <option value="">Select target variation</option>
                      {variations.map((v) => (
                        <option key={v.name} value={v.name}>{v.name}</option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-green-600 dark:text-green-400">Served after end date</p>
                  </div>
                  <div>
                    <Label className="text-green-700 dark:text-green-300">Target Percentage</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        value={progressiveRollout.end?.percentage ?? 100}
                        onChange={(e) =>
                          setProgressiveRollout({
                            ...progressiveRollout,
                            end: { ...progressiveRollout.end, percentage: parseInt(e.target.value) || 100 },
                          })
                        }
                        className="w-24"
                      />
                      <span className="text-sm text-green-600 dark:text-green-400">%</span>
                    </div>
                    <p className="mt-1 text-xs text-zinc-500">Default: 100% (optional)</p>
                  </div>
                </div>
              </div>

              {/* Visual Timeline Preview */}
              {progressiveRollout.initial?.date && progressiveRollout.end?.date && (
                <div className="p-3 rounded-lg bg-zinc-100 dark:bg-zinc-800">
                  <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-2">Timeline Preview</p>
                  <div className="flex items-center gap-2">
                    <div className="flex-shrink-0 text-center">
                      <p className="text-xs font-medium text-orange-600">{progressiveRollout.initial?.variation || '?'}</p>
                      <p className="text-[10px] text-zinc-500">{progressiveRollout.initial?.percentage ?? 0}%</p>
                    </div>
                    <div className="flex-1 h-2 rounded-full bg-gradient-to-r from-orange-400 to-green-400 relative">
                      <div className="absolute -top-5 left-0 text-[10px] text-zinc-500">
                        {new Date(progressiveRollout.initial.date).toLocaleDateString()}
                      </div>
                      <div className="absolute -top-5 right-0 text-[10px] text-zinc-500">
                        {new Date(progressiveRollout.end.date).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="flex-shrink-0 text-center">
                      <p className="text-xs font-medium text-green-600">{progressiveRollout.end?.variation || '?'}</p>
                      <p className="text-[10px] text-zinc-500">{progressiveRollout.end?.percentage ?? 100}%</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Scheduled Rollout */}
          {rolloutStrategy === 'scheduled' && (
            <div className="space-y-4">
              <div className="flex items-start gap-2 p-3 rounded-lg bg-zinc-50 dark:bg-zinc-900">
                <Info className="h-4 w-4 text-zinc-500 mt-0.5" />
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Define multiple stages with specific dates. At each stage, the flag configuration updates automatically.
                </p>
              </div>

              <div>
                <Label>Initial Default Variation</Label>
                <select
                  value={defaultVariation}
                  onChange={(e) => setDefaultVariation(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                >
                  {variations.map((v) => (
                    <option key={v.name} value={v.name}>{v.name}</option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-zinc-500">This is served before the first scheduled step</p>
              </div>

              <div className="space-y-3">
                {scheduledSteps.map((step, index) => (
                  <div
                    key={index}
                    className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <Badge variant="secondary">Step {index + 1}</Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeScheduledStep(index)}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label>Date & Time</Label>
                        <DateTimePicker
                          value={step.date}
                          onChange={(value) =>
                            updateScheduledStep(index, { date: value })
                          }
                          placeholder="Select date & time"
                        />
                      </div>
                      <div>
                        <Label>Serve Variation</Label>
                        <select
                          value={step.defaultRule?.variation || ''}
                          onChange={(e) =>
                            updateScheduledStep(index, {
                              defaultRule: { variation: e.target.value },
                            })
                          }
                          className="flex h-10 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                        >
                          {variations.map((v) => (
                            <option key={v.name} value={v.name}>{v.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                ))}

                <Button variant="outline" size="sm" onClick={addScheduledStep}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add Step
                </Button>
              </div>
            </div>
          )}

          {/* Experimentation Rollout */}
          {rolloutStrategy === 'experimentation' && (
            <div className="space-y-4">
              <div className="flex items-start gap-2 p-3 rounded-lg bg-zinc-50 dark:bg-zinc-900">
                <Info className="h-4 w-4 text-zinc-500 mt-0.5" />
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Run a time-bound experiment. The flag is only active between the start and end dates. Outside this window, users receive the default value.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Start Date</Label>
                  <DateTimePicker
                    value={experimentation.start}
                    onChange={(value) =>
                      setExperimentation({ ...experimentation, start: value })
                    }
                    placeholder="Select start date"
                  />
                </div>
                <div>
                  <Label>End Date</Label>
                  <DateTimePicker
                    value={experimentation.end}
                    onChange={(value) =>
                      setExperimentation({ ...experimentation, end: value })
                    }
                    placeholder="Select end date"
                  />
                </div>
              </div>

              <div className="border-t border-zinc-200 dark:border-zinc-800 pt-4">
                <Label className="mb-3 block">Distribution During Experiment</Label>
                <div className="flex gap-4 mb-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={Object.keys(percentages).length === 0}
                      onChange={() => setPercentages({})}
                    />
                    <span className="text-sm">Single Variation</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={Object.keys(percentages).length > 0}
                      onChange={() => {
                        const initial: Record<string, number> = {};
                        variations.forEach((v, i) => {
                          initial[v.name] = i === 0 ? 50 : i === 1 ? 50 : 0;
                        });
                        setPercentages(initial);
                      }}
                    />
                    <span className="text-sm">Percentage Split</span>
                  </label>
                </div>

                {Object.keys(percentages).length === 0 ? (
                  <div>
                    <select
                      value={defaultVariation}
                      onChange={(e) => setDefaultVariation(e.target.value)}
                      className="flex h-10 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                    >
                      {variations.map((v) => (
                        <option key={v.name} value={v.name}>{v.name}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {variations.map((v) => (
                      <div key={v.name} className="flex items-center gap-3">
                        <span className="w-32 text-sm font-medium">{v.name}</span>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          value={percentages[v.name] || 0}
                          onChange={(e) =>
                            setPercentages({
                              ...percentages,
                              [v.name]: parseInt(e.target.value) || 0,
                            })
                          }
                          className="w-24"
                        />
                        <span className="text-sm text-zinc-500">%</span>
                        <div className="flex-1 h-2 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-purple-500"
                            style={{ width: `${percentages[v.name] || 0}%` }}
                          />
                        </div>
                      </div>
                    ))}
                    <p className="text-xs text-zinc-500">
                      Total: {Object.values(percentages).reduce((a, b) => a + b, 0)}%
                      {Object.values(percentages).reduce((a, b) => a + b, 0) !== 100 && (
                        <span className="text-amber-500 ml-2">(should equal 100%)</span>
                      )}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Targeting Rules */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle>Targeting Rules</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowQueryHelp(!showQueryHelp)}
              title="Query syntax help"
            >
              <HelpCircle className="h-4 w-4 text-zinc-400" />
            </Button>
          </div>
          <Button variant="outline" size="sm" onClick={addTargetingRule}>
            <Plus className="h-4 w-4 mr-1" />
            Add Rule
          </Button>
        </CardHeader>
        <CardContent>
          {/* Query Syntax Help */}
          {showQueryHelp && (
            <div className="mb-4 p-4 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
              <h4 className="font-medium text-sm mb-2 text-blue-900 dark:text-blue-100">Query Syntax Reference</h4>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <p className="font-medium text-blue-800 dark:text-blue-200 mb-1">Comparison Operators</p>
                  <ul className="space-y-0.5 text-blue-700 dark:text-blue-300">
                    <li><code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">eq</code> / <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">==</code> - equals</li>
                    <li><code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">ne</code> / <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">!=</code> - not equals</li>
                    <li><code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">lt</code> / <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">&lt;</code> - less than</li>
                    <li><code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">gt</code> / <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">&gt;</code> - greater than</li>
                    <li><code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">le</code> / <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">&lt;=</code> - less or equal</li>
                    <li><code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">ge</code> / <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">&gt;=</code> - greater or equal</li>
                  </ul>
                </div>
                <div>
                  <p className="font-medium text-blue-800 dark:text-blue-200 mb-1">String & Logic Operators</p>
                  <ul className="space-y-0.5 text-blue-700 dark:text-blue-300">
                    <li><code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">co</code> - contains</li>
                    <li><code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">sw</code> - starts with</li>
                    <li><code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">ew</code> - ends with</li>
                    <li><code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">in</code> - in list</li>
                    <li><code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">pr</code> - present (exists)</li>
                    <li><code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">and</code> / <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">or</code> / <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">not</code></li>
                  </ul>
                </div>
              </div>
              <p className="mt-2 text-xs text-blue-600 dark:text-blue-400">
                Example: <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">(email ew &quot;@company.com&quot;) and (role eq &quot;admin&quot;)</code>
              </p>
            </div>
          )}

          {targetingRules.length === 0 ? (
            <p className="text-sm text-zinc-500 text-center py-4">
              No targeting rules. All users will receive the default rule.
            </p>
          ) : (
            <div className="space-y-4">
              {targetingRules.map((rule, index) => {
                const ruleType = targetingRuleTypes[index] || 'variation';

                return (
                  <div
                    key={index}
                    className={`rounded-lg border p-4 ${
                      rule.disable
                        ? 'border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900/50'
                        : 'border-zinc-200 dark:border-zinc-800'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Badge variant={rule.disable ? 'secondary' : 'default'}>
                          Rule {index + 1}
                        </Badge>
                        {rule.disable && (
                          <span className="text-xs text-zinc-500">(Disabled)</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-1.5 text-xs text-zinc-500">
                          <input
                            type="checkbox"
                            checked={!rule.disable}
                            onChange={(e) =>
                              updateTargetingRule(index, { disable: !e.target.checked })
                            }
                            className="rounded"
                          />
                          Enabled
                        </label>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeTargetingRule(index)}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label>Rule Name</Label>
                          <Input
                            value={rule.name || ''}
                            onChange={(e) =>
                              updateTargetingRule(index, { name: e.target.value })
                            }
                            placeholder="beta-users"
                          />
                        </div>
                        <div>
                          <Label>Query</Label>
                          <Input
                            value={rule.query || ''}
                            onChange={(e) =>
                              updateTargetingRule(index, { query: e.target.value })
                            }
                            placeholder='email ew "@company.com"'
                          />
                        </div>
                      </div>

                      {/* Rule Type Selector */}
                      <div>
                        <Label className="mb-2 block">Serve</Label>
                        <div className="flex gap-2 mb-3">
                          <button
                            type="button"
                            onClick={() => {
                              setTargetingRuleTypes({ ...targetingRuleTypes, [index]: 'variation' });
                              updateTargetingRule(index, { percentage: undefined, progressiveRollout: undefined });
                            }}
                            className={`px-3 py-1.5 text-xs rounded-md border transition-all ${
                              ruleType === 'variation'
                                ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                                : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300'
                            }`}
                          >
                            Single Variation
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setTargetingRuleTypes({ ...targetingRuleTypes, [index]: 'percentage' });
                              updateTargetingRule(index, { variation: undefined, progressiveRollout: undefined });
                              // Initialize percentages if not set
                              if (!rule.percentage || Object.keys(rule.percentage).length === 0) {
                                const initial: Record<string, number> = {};
                                variations.forEach((v, i) => {
                                  initial[v.name] = i === 0 ? 50 : i === 1 ? 50 : 0;
                                });
                                updateTargetingRule(index, { percentage: initial });
                              }
                            }}
                            className={`px-3 py-1.5 text-xs rounded-md border transition-all ${
                              ruleType === 'percentage'
                                ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                                : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300'
                            }`}
                          >
                            Percentage
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setTargetingRuleTypes({ ...targetingRuleTypes, [index]: 'progressive' });
                              updateTargetingRule(index, { variation: undefined, percentage: undefined });
                            }}
                            className={`px-3 py-1.5 text-xs rounded-md border transition-all ${
                              ruleType === 'progressive'
                                ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                                : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300'
                            }`}
                          >
                            Progressive
                          </button>
                        </div>

                        {/* Single Variation */}
                        {ruleType === 'variation' && (
                          <select
                            value={rule.variation || ''}
                            onChange={(e) =>
                              updateTargetingRule(index, { variation: e.target.value })
                            }
                            className="flex h-10 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                          >
                            {variations.map((v) => (
                              <option key={v.name} value={v.name}>
                                {v.name}
                              </option>
                            ))}
                          </select>
                        )}

                        {/* Percentage Distribution */}
                        {ruleType === 'percentage' && (
                          <div className="space-y-2">
                            {variations.map((v) => (
                              <div key={v.name} className="flex items-center gap-2">
                                <span className="w-24 text-xs">{v.name}</span>
                                <Input
                                  type="number"
                                  min="0"
                                  max="100"
                                  value={rule.percentage?.[v.name] || 0}
                                  onChange={(e) =>
                                    updateTargetingRule(index, {
                                      percentage: {
                                        ...rule.percentage,
                                        [v.name]: parseInt(e.target.value) || 0,
                                      },
                                    })
                                  }
                                  className="w-20 h-8 text-sm"
                                />
                                <span className="text-xs text-zinc-500">%</span>
                                <div className="flex-1 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-blue-500"
                                    style={{ width: `${rule.percentage?.[v.name] || 0}%` }}
                                  />
                                </div>
                              </div>
                            ))}
                            <p className="text-xs text-zinc-500">
                              Total: {Object.values(rule.percentage || {}).reduce((a, b) => a + b, 0)}%
                              {Object.values(rule.percentage || {}).reduce((a, b) => a + b, 0) !== 100 && (
                                <span className="text-amber-500 ml-1">(should equal 100%)</span>
                              )}
                            </p>
                          </div>
                        )}

                        {/* Progressive Rollout */}
                        {ruleType === 'progressive' && (
                          <div className="grid grid-cols-2 gap-4 p-3 rounded-lg bg-zinc-50 dark:bg-zinc-900">
                            <div className="space-y-2">
                              <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Initial</p>
                              <DateTimePickerCompact
                                value={rule.progressiveRollout?.initial?.date}
                                onChange={(value) =>
                                  updateTargetingRule(index, {
                                    progressiveRollout: {
                                      ...rule.progressiveRollout,
                                      initial: {
                                        ...rule.progressiveRollout?.initial,
                                        date: value,
                                      },
                                    },
                                  })
                                }
                                placeholder="Start date"
                              />
                              <select
                                value={rule.progressiveRollout?.initial?.variation || ''}
                                onChange={(e) =>
                                  updateTargetingRule(index, {
                                    progressiveRollout: {
                                      ...rule.progressiveRollout,
                                      initial: {
                                        ...rule.progressiveRollout?.initial,
                                        variation: e.target.value,
                                      },
                                    },
                                  })
                                }
                                className="h-8 w-full rounded-md border border-zinc-300 bg-white px-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                              >
                                <option value="">Select variation</option>
                                {variations.map((v) => (
                                  <option key={v.name} value={v.name}>{v.name}</option>
                                ))}
                              </select>
                            </div>
                            <div className="space-y-2">
                              <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">End</p>
                              <DateTimePickerCompact
                                value={rule.progressiveRollout?.end?.date}
                                onChange={(value) =>
                                  updateTargetingRule(index, {
                                    progressiveRollout: {
                                      ...rule.progressiveRollout,
                                      end: {
                                        ...rule.progressiveRollout?.end,
                                        date: value,
                                      },
                                    },
                                  })
                                }
                                placeholder="End date"
                              />
                              <select
                                value={rule.progressiveRollout?.end?.variation || ''}
                                onChange={(e) =>
                                  updateTargetingRule(index, {
                                    progressiveRollout: {
                                      ...rule.progressiveRollout,
                                      end: {
                                        ...rule.progressiveRollout?.end,
                                        variation: e.target.value,
                                      },
                                    },
                                  })
                                }
                                className="h-8 w-full rounded-md border border-zinc-300 bg-white px-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                              >
                                <option value="">Select variation</option>
                                {variations.map((v) => (
                                  <option key={v.name} value={v.name}>{v.name}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={onCancel} disabled={isLoading}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={isLoading || !flagKey.trim()}
        >
          {isLoading
            ? usePrWorkflow ? 'Creating PR...' : 'Saving...'
            : usePrWorkflow
              ? mode === 'create' ? 'Create PR' : 'Submit Changes as PR'
              : mode === 'create' ? 'Create Flag' : 'Save Changes'}
        </Button>
      </div>
      {usePrWorkflow && (
        <p className="text-center text-sm text-zinc-500">
          Changes will be submitted as a pull request for review
        </p>
      )}
    </div>
  );
}
