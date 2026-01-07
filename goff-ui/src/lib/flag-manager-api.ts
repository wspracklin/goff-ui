// Flag Manager API client
// This client communicates with the Flag Manager API for CRUD operations on flags
// The Flag Manager API reads/writes to a Kubernetes ConfigMap

export interface FlagConfig {
  variations?: Record<string, unknown>;
  targeting?: TargetingRule[];
  defaultRule?: {
    variation?: string;
    percentage?: Record<string, number>;
  };
  trackEvents?: boolean;
  disable?: boolean;
  version?: string;
  metadata?: Record<string, unknown>;
}

export interface TargetingRule {
  name?: string;
  query?: string;
  variation?: string;
  percentage?: Record<string, number>;
  disable?: boolean;
}

export interface FlagWithKey {
  key: string;
  config: FlagConfig;
}

class FlagManagerAPI {
  private baseUrl: string;

  constructor() {
    // Use environment variable or default to localhost for development
    this.baseUrl = process.env.NEXT_PUBLIC_FLAG_MANAGER_API_URL ||
                   process.env.FLAG_MANAGER_API_URL ||
                   'http://localhost:8080';
  }

  setBaseUrl(url: string) {
    this.baseUrl = url;
  }

  // Project operations
  async listProjects(): Promise<string[]> {
    const response = await fetch(`${this.baseUrl}/api/projects`);
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to list projects' }));
      throw new Error(error.error || 'Failed to list projects');
    }
    const data = await response.json();
    return data.projects || [];
  }

  async getProject(project: string): Promise<{ project: string; flags: Record<string, FlagConfig> }> {
    const response = await fetch(`${this.baseUrl}/api/projects/${encodeURIComponent(project)}`);
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to get project' }));
      throw new Error(error.error || 'Failed to get project');
    }
    return response.json();
  }

  async createProject(project: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/projects/${encodeURIComponent(project)}`, {
      method: 'POST',
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to create project' }));
      throw new Error(error.error || 'Failed to create project');
    }
  }

  async deleteProject(project: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/projects/${encodeURIComponent(project)}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to delete project' }));
      throw new Error(error.error || 'Failed to delete project');
    }
  }

  // Flag operations
  async listFlags(project: string): Promise<Record<string, FlagConfig>> {
    const response = await fetch(`${this.baseUrl}/api/projects/${encodeURIComponent(project)}/flags`);
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to list flags' }));
      throw new Error(error.error || 'Failed to list flags');
    }
    const data = await response.json();
    return data.flags || {};
  }

  async getFlag(project: string, flagKey: string): Promise<FlagWithKey> {
    const response = await fetch(
      `${this.baseUrl}/api/projects/${encodeURIComponent(project)}/flags/${encodeURIComponent(flagKey)}`
    );
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to get flag' }));
      throw new Error(error.error || 'Failed to get flag');
    }
    return response.json();
  }

  async createFlag(project: string, flagKey: string, config: FlagConfig): Promise<FlagWithKey> {
    const response = await fetch(
      `${this.baseUrl}/api/projects/${encodeURIComponent(project)}/flags/${encodeURIComponent(flagKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      }
    );
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to create flag' }));
      throw new Error(error.error || 'Failed to create flag');
    }
    return response.json();
  }

  async updateFlag(
    project: string,
    flagKey: string,
    config: FlagConfig,
    newKey?: string
  ): Promise<FlagWithKey> {
    const response = await fetch(
      `${this.baseUrl}/api/projects/${encodeURIComponent(project)}/flags/${encodeURIComponent(flagKey)}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config, newKey }),
      }
    );
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to update flag' }));
      throw new Error(error.error || 'Failed to update flag');
    }
    return response.json();
  }

  async deleteFlag(project: string, flagKey: string): Promise<void> {
    const response = await fetch(
      `${this.baseUrl}/api/projects/${encodeURIComponent(project)}/flags/${encodeURIComponent(flagKey)}`,
      {
        method: 'DELETE',
      }
    );
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to delete flag' }));
      throw new Error(error.error || 'Failed to delete flag');
    }
  }

  // Admin operations
  async refreshRelayProxy(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/admin/refresh`, {
      method: 'POST',
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to refresh relay proxy' }));
      throw new Error(error.error || 'Failed to refresh relay proxy');
    }
  }
}

export const flagManagerAPI = new FlagManagerAPI();
export default flagManagerAPI;
