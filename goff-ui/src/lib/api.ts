import {
  AllFlagRequest,
  AllFlagsResponse,
  ConnectionConfig,
  EvalFlagRequest,
  EvalFlagResponse,
  FlagChangeResponse,
  FlagConfigurationRequest,
  FlagConfigurationResponse,
  HealthResponse,
  InfoResponse,
  OFREPBulkEvaluateResponse,
  OFREPEvalRequest,
  OFREPEvaluateResponse,
  RefreshResponse,
} from './types';

class GoFeatureFlagClient {
  private config: ConnectionConfig | null = null;

  setConfig(config: ConnectionConfig) {
    this.config = config;
  }

  getConfig(): ConnectionConfig | null {
    return this.config;
  }

  private getBaseUrl(): string {
    if (!this.config?.proxyUrl) {
      throw new Error('Proxy URL not configured');
    }
    return this.config.proxyUrl.replace(/\/$/, '');
  }

  private getHeaders(useAdminKey = false): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    const apiKey = useAdminKey ? this.config?.adminApiKey : this.config?.apiKey;
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    return headers;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    useAdminKey = false
  ): Promise<T> {
    const url = `${this.getBaseUrl()}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        ...this.getHeaders(useAdminKey),
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Error ${response.status}: ${errorText}`);
    }

    return response.json();
  }

  // Health & Info endpoints
  async getHealth(): Promise<HealthResponse> {
    return this.request<HealthResponse>('/health');
  }

  async getInfo(): Promise<InfoResponse> {
    return this.request<InfoResponse>('/info');
  }

  // Flag evaluation endpoints
  async getAllFlags(context: AllFlagRequest): Promise<AllFlagsResponse> {
    return this.request<AllFlagsResponse>('/v1/allflags', {
      method: 'POST',
      body: JSON.stringify(context),
    });
  }

  async evaluateFlag(
    flagKey: string,
    request: EvalFlagRequest
  ): Promise<EvalFlagResponse> {
    return this.request<EvalFlagResponse>(`/v1/feature/${flagKey}/eval`, {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  // Flag configuration endpoints
  async getFlagConfiguration(
    request?: FlagConfigurationRequest
  ): Promise<FlagConfigurationResponse> {
    return this.request<FlagConfigurationResponse>('/v1/flag/configuration', {
      method: 'POST',
      body: JSON.stringify(request || {}),
    });
  }

  async getFlagChange(etag?: string): Promise<FlagChangeResponse> {
    const headers: HeadersInit = {};
    if (etag) {
      headers['If-None-Match'] = etag;
    }
    return this.request<FlagChangeResponse>('/v1/flag/change', {
      headers,
    });
  }

  // Admin endpoints
  async refreshFlags(): Promise<RefreshResponse> {
    return this.request<RefreshResponse>(
      '/admin/v1/retriever/refresh',
      {
        method: 'POST',
      },
      true
    );
  }

  // OFREP endpoints
  async ofrepEvaluateFlag(
    flagKey: string,
    request: OFREPEvalRequest
  ): Promise<OFREPEvaluateResponse> {
    return this.request<OFREPEvaluateResponse>(
      `/ofrep/v1/evaluate/flags/${flagKey}`,
      {
        method: 'POST',
        body: JSON.stringify(request),
      }
    );
  }

  async ofrepBulkEvaluate(
    request: OFREPEvalRequest
  ): Promise<OFREPBulkEvaluateResponse> {
    return this.request<OFREPBulkEvaluateResponse>('/ofrep/v1/evaluate/flags', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  // WebSocket connection for real-time updates
  connectWebSocket(
    onMessage: (data: unknown) => void,
    onError?: (error: Event) => void,
    onClose?: () => void
  ): WebSocket | null {
    if (!this.config?.proxyUrl) {
      return null;
    }

    const wsUrl = this.config.proxyUrl
      .replace(/^http/, 'ws')
      .replace(/\/$/, '');

    const apiKeyParam = this.config.apiKey
      ? `?apiKey=${encodeURIComponent(this.config.apiKey)}`
      : '';

    const ws = new WebSocket(`${wsUrl}/ws/v1/flag/change${apiKeyParam}`);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessage(data);
      } catch {
        onMessage(event.data);
      }
    };

    if (onError) {
      ws.onerror = onError;
    }

    if (onClose) {
      ws.onclose = onClose;
    }

    return ws;
  }

  // Metrics endpoint (returns text)
  async getMetrics(): Promise<string> {
    const url = `${this.getBaseUrl()}/metrics`;
    const response = await fetch(url, {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Metrics Error ${response.status}`);
    }

    return response.text();
  }
}

export const goffClient = new GoFeatureFlagClient();
export default goffClient;
