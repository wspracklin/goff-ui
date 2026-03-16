import { LocalFlagConfig } from '@/lib/local-api';
import { FlagConfiguration } from '@/lib/types';

export type RolloutType = 'single' | 'percentage' | 'progressive' | 'scheduled' | 'experimentation';

export const ON_VARIATION_NAMES = ['enabled', 'on', 'true', 'yes', 'active'];
export const OFF_VARIATION_NAMES = ['disabled', 'off', 'false', 'no', 'inactive'];

export const getRolloutType = (flag: LocalFlagConfig | FlagConfiguration | null | undefined): RolloutType => {
  if (!flag) return 'single';
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

export const isPercentageRollout = (flag: LocalFlagConfig | FlagConfiguration | null | undefined): boolean => {
  if (!flag) return false;
  return !!(flag.defaultRule?.percentage && Object.keys(flag.defaultRule.percentage).length > 0);
};

export const isFlagOn = (flag: LocalFlagConfig | FlagConfiguration | null | undefined): boolean => {
  if (!flag) return false;
  // Check if flag is entirely disabled via the disable field
  if (flag.disable) return false;

  const rolloutType = getRolloutType(flag);

  // For complex rollout types, flag is "on" if not disabled
  if (['percentage', 'progressive', 'scheduled', 'experimentation'].includes(rolloutType)) {
    return true;
  }

  // For simple flags, check the defaultRule variation
  const defaultVariation = flag.defaultRule?.variation;
  if (!defaultVariation) return false;

  return ON_VARIATION_NAMES.includes(defaultVariation.toLowerCase());
};

export const getOnPercentage = (flag: LocalFlagConfig | FlagConfiguration | null | undefined): number => {
  if (!flag) return 0;
  if (!isPercentageRollout(flag)) return isFlagOn(flag) ? 100 : 0;

  const percentage = flag.defaultRule?.percentage || {};

  let totalOn = 0;
  for (const [variation, pct] of Object.entries(percentage)) {
    if (ON_VARIATION_NAMES.includes(variation.toLowerCase())) {
      totalOn += pct;
    }
  }
  return totalOn;
};

export const getToggleVariations = (flag: LocalFlagConfig | FlagConfiguration | null | undefined): { on: string; off: string } => {
  if (!flag) return { on: 'enabled', off: 'disabled' };
  const variations = flag.variations ? Object.keys(flag.variations) : [];

  const onVariation = variations.find(v => ON_VARIATION_NAMES.includes(v.toLowerCase())) || variations[0] || 'enabled';
  const offVariation = variations.find(v => OFF_VARIATION_NAMES.includes(v.toLowerCase())) || variations[1] || 'disabled';

  return { on: onVariation, off: offVariation };
};

export const cleanFlagConfig = (config: LocalFlagConfig | FlagConfiguration): LocalFlagConfig => {
  const clean: LocalFlagConfig = {};

  if (config.variations !== undefined) clean.variations = config.variations;
  if (config.defaultRule !== undefined) clean.defaultRule = config.defaultRule;
  if (config.targeting !== undefined) clean.targeting = config.targeting;
  if (config.disable !== undefined) clean.disable = config.disable;
  if (config.trackEvents !== undefined) clean.trackEvents = config.trackEvents;
  if (config.version !== undefined) clean.version = config.version;
  if (config.metadata !== undefined) clean.metadata = config.metadata;
  if (config.scheduledRollout !== undefined) clean.scheduledRollout = config.scheduledRollout;
  if (config.experimentation !== undefined) clean.experimentation = config.experimentation;
  if (config.bucketingKey !== undefined) clean.bucketingKey = config.bucketingKey;

  return clean;
};
