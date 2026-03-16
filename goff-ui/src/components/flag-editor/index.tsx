'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { LocalFlagConfig, TargetingRule, ProgressiveRollout, ScheduledStep, ExperimentationRollout } from '@/lib/local-api';
import { toast } from 'sonner';
import { BasicInfo } from './basic-info';
import { AdvancedSettings } from './advanced-settings';
import { VariationsEditor } from './variations-editor';
import { RolloutStrategySection } from './rollout-strategy';
import { TargetingRules } from './targeting-rules';

export type RolloutStrategyType = 'single' | 'percentage' | 'progressive' | 'scheduled' | 'experimentation';
export type TargetingRuleType = 'variation' | 'percentage' | 'progressive';

export interface Variation {
  name: string;
  value: string;
  type: 'boolean' | 'string' | 'number' | 'json';
}

interface FlagEditorProps {
  initialKey?: string;
  initialConfig?: LocalFlagConfig;
  onSave: (key: string, config: LocalFlagConfig) => void;
  onCancel: () => void;
  isLoading?: boolean;
  mode: 'create' | 'edit';
  usePrWorkflow?: boolean;
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
  const [rolloutStrategy, setRolloutStrategy] = useState<RolloutStrategyType>('single');
  const [percentages, setPercentages] = useState<Record<string, number>>({});
  const [targetingRules, setTargetingRules] = useState<TargetingRule[]>([]);
  const [isDisabled, setIsDisabled] = useState(false);
  const [trackEvents, setTrackEvents] = useState(true);
  const [version, setVersion] = useState('');
  const [description, setDescription] = useState('');
  const [bucketingKey, setBucketingKey] = useState('');
  const [metadataEntries, setMetadataEntries] = useState<{ key: string; value: string }[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [targetingRuleTypes, setTargetingRuleTypes] = useState<Record<number, TargetingRuleType>>({});

  const [progressiveRollout, setProgressiveRollout] = useState<ProgressiveRollout>({
    initial: { variation: '', date: '', percentage: 0 },
    end: { variation: '', date: '', percentage: 100 },
  });

  const [scheduledSteps, setScheduledSteps] = useState<ScheduledStep[]>([]);

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

        const entries = Object.entries(initialConfig.metadata)
          .filter(([key]) => key !== 'description')
          .map(([key, value]) => ({
            key,
            value: typeof value === 'object' ? JSON.stringify(value) : String(value),
          }));
        setMetadataEntries(entries);

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
    if (variations.length <= 2) return;
    const newVariations = variations.filter((_, i) => i !== index);
    setVariations(newVariations);

    if (defaultVariation === variations[index].name) {
      setDefaultVariation(newVariations[0]?.name || '');
    }
  };

  const updateVariation = (index: number, field: keyof Variation, value: string) => {
    const updated = [...variations];
    if (field === 'name') {
      const oldName = updated[index].name;
      if (defaultVariation === oldName) {
        setDefaultVariation(value);
      }
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
      <BasicInfo
        flagKey={flagKey}
        setFlagKey={setFlagKey}
        description={description}
        setDescription={setDescription}
        version={version}
        setVersion={setVersion}
        isDisabled={isDisabled}
        setIsDisabled={setIsDisabled}
        trackEvents={trackEvents}
        setTrackEvents={setTrackEvents}
        mode={mode}
      />

      <AdvancedSettings
        bucketingKey={bucketingKey}
        setBucketingKey={setBucketingKey}
        metadataEntries={metadataEntries}
        setMetadataEntries={setMetadataEntries}
        showAdvanced={showAdvanced}
        setShowAdvanced={setShowAdvanced}
      />

      <VariationsEditor
        variations={variations}
        addVariation={addVariation}
        removeVariation={removeVariation}
        updateVariation={updateVariation}
      />

      <RolloutStrategySection
        rolloutStrategy={rolloutStrategy}
        setRolloutStrategy={setRolloutStrategy}
        variations={variations}
        defaultVariation={defaultVariation}
        setDefaultVariation={setDefaultVariation}
        percentages={percentages}
        setPercentages={setPercentages}
        progressiveRollout={progressiveRollout}
        setProgressiveRollout={setProgressiveRollout}
        scheduledSteps={scheduledSteps}
        setScheduledSteps={setScheduledSteps}
        experimentation={experimentation}
        setExperimentation={setExperimentation}
      />

      <TargetingRules
        variations={variations}
        targetingRules={targetingRules}
        setTargetingRules={setTargetingRules}
        targetingRuleTypes={targetingRuleTypes}
        setTargetingRuleTypes={setTargetingRuleTypes}
      />

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
