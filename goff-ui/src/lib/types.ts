// Go Feature Flag API Types

export interface EvaluationContext {
  key: string;
  custom?: Record<string, string>;
}

export interface EvalFlagRequest {
  evaluationContext: EvaluationContext;
  defaultValue?: unknown;
}

export interface AllFlagRequest {
  evaluationContext: EvaluationContext;
}

export interface FlagState {
  value: unknown;
  timestamp: number;
  variationType: string;
  trackEvents: boolean;
  failed?: boolean;
  errorCode?: string;
  reason?: string;
}

export interface AllFlagsResponse {
  valid: boolean;
  flags: Record<string, FlagState>;
}

export interface EvalFlagResponse {
  value: unknown;
  variationType: string;
  failed: boolean;
  trackEvents: boolean;
  version: string;
  reason: string;
  errorCode: string;
  metadata?: Record<string, unknown>;
}

export interface HealthResponse {
  initialized: boolean;
}

export interface InfoResponse {
  cacheRefresh: string;
  flagsets?: Record<string, string>;
}

export interface FlagChangeResponse {
  hash: number;
  flags: Record<string, number>;
}

export interface FlagConfigurationRequest {
  flags?: string[];
}

export interface FlagConfiguration {
  variations?: Record<string, unknown>;
  targeting?: TargetingRule[];
  defaultRule?: Rule;
  trackEvents?: boolean;
  disable?: boolean;
  version?: string;
  metadata?: Record<string, unknown>;
  scheduledRollout?: ScheduledStep[];
  experimentation?: ExperimentationRollout;
  bucketingKey?: string;
}

export interface TargetingRule {
  name?: string;
  query?: string;
  variation?: string;
  percentage?: Record<string, number>;
  progressiveRollout?: ProgressiveRollout;
  disable?: boolean;
}

export interface Rule {
  variation?: string;
  percentage?: Record<string, number>;
  progressiveRollout?: ProgressiveRollout;
}

export interface ProgressiveRollout {
  initial?: ProgressiveRolloutStep;
  end?: ProgressiveRolloutStep;
}

export interface ProgressiveRolloutStep {
  variation?: string;
  percentage?: number;
  date?: string;
}

export interface ScheduledStep {
  date: string;
  targeting?: TargetingRule[];
  defaultRule?: Rule;
}

export interface ExperimentationRollout {
  start?: string;
  end?: string;
}

export interface FlagConfigurationResponse {
  flags: Record<string, FlagConfiguration>;
  evaluationContextEnrichment?: Record<string, unknown>;
  errorCode?: string;
  errorDetails?: string;
}

export interface RefreshResponse {
  refreshed: boolean;
}

export interface DiffCache {
  added?: Record<string, FlagConfiguration>;
  deleted?: Record<string, FlagConfiguration>;
  updated?: Record<string, DiffUpdated>;
}

export interface DiffUpdated {
  old_value: FlagConfiguration;
  new_value: FlagConfiguration;
}

export interface CollectEvalDataRequest {
  events: Record<string, unknown>[];
  meta?: Record<string, unknown>;
}

export interface CollectEvalDataResponse {
  ingestedContentCount: number;
}

// OFREP Types
export interface OFREPEvalRequest {
  context: Record<string, string>;
}

export interface OFREPEvaluateResponse {
  key: string;
  value: unknown;
  reason: string;
  variant: string;
  metadata?: Record<string, unknown>;
}

export interface OFREPBulkEvaluateResponse {
  flags: OFREPEvaluateResponse[];
}

// UI Specific Types
export interface ConnectionConfig {
  proxyUrl: string;
  apiKey?: string;
  adminApiKey?: string;
}

export interface FlagWithKey extends FlagConfiguration {
  key: string;
}
