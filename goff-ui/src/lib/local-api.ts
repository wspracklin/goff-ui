// Local API client for flag management (CRUD operations)
// This connects to the Next.js API routes that manage the flags file

export interface ProgressiveRolloutStep {
  variation?: string;
  percentage?: number;
  date?: string;
}

export interface ProgressiveRollout {
  initial?: ProgressiveRolloutStep;
  end?: ProgressiveRolloutStep;
}

export interface ScheduledStep {
  date: string;
  targeting?: TargetingRule[];
  defaultRule?: {
    variation?: string;
    percentage?: Record<string, number>;
    progressiveRollout?: ProgressiveRollout;
  };
}

export interface ExperimentationRollout {
  start?: string;
  end?: string;
}

export interface LocalFlagConfig {
  variations?: Record<string, unknown>;
  targeting?: TargetingRule[];
  defaultRule?: {
    variation?: string;
    percentage?: Record<string, number>;
    progressiveRollout?: ProgressiveRollout;
  };
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

export interface FlagWithConfig {
  key: string;
  config: LocalFlagConfig;
}

class LocalFlagAPI {
  private baseUrl = '/api/flags';

  async listFlags(): Promise<{ flags: Record<string, LocalFlagConfig>; filePath: string }> {
    const response = await fetch(this.baseUrl);
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to list flags');
    }
    return response.json();
  }

  async getFlag(key: string): Promise<FlagWithConfig> {
    const response = await fetch(`${this.baseUrl}/${key}`);
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to get flag');
    }
    return response.json();
  }

  async createFlag(key: string, config: LocalFlagConfig): Promise<FlagWithConfig> {
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, config }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create flag');
    }
    return response.json();
  }

  async updateFlag(
    key: string,
    config: LocalFlagConfig,
    newKey?: string
  ): Promise<FlagWithConfig> {
    const response = await fetch(`${this.baseUrl}/${key}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config, newKey }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update flag');
    }
    return response.json();
  }

  async deleteFlag(key: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/${key}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to delete flag');
    }
  }
}

export const localFlagAPI = new LocalFlagAPI();
export default localFlagAPI;
