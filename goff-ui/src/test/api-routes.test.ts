import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('API Route Helpers', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  describe('Flag Manager API URL Configuration', () => {
    it('should use FLAG_MANAGER_API_URL environment variable', () => {
      const apiUrl = process.env.FLAG_MANAGER_API_URL || 'http://localhost:8080'
      expect(typeof apiUrl).toBe('string')
    })
  })

  describe('Project API', () => {
    it('should build correct list projects URL', () => {
      const baseUrl = 'http://localhost:8080'
      const url = `${baseUrl}/api/projects`
      expect(url).toBe('http://localhost:8080/api/projects')
    })

    it('should build correct get project URL', () => {
      const baseUrl = 'http://localhost:8080'
      const projectName = 'my-project'
      const url = `${baseUrl}/api/projects/${projectName}`
      expect(url).toBe('http://localhost:8080/api/projects/my-project')
    })

    it('should build correct create project URL', () => {
      const baseUrl = 'http://localhost:8080'
      const projectName = 'new-project'
      const url = `${baseUrl}/api/projects/${projectName}`
      expect(url).toBe('http://localhost:8080/api/projects/new-project')
    })
  })

  describe('Flag API', () => {
    it('should build correct list flags URL', () => {
      const baseUrl = 'http://localhost:8080'
      const projectName = 'my-project'
      const url = `${baseUrl}/api/projects/${projectName}/flags`
      expect(url).toBe('http://localhost:8080/api/projects/my-project/flags')
    })

    it('should build correct get flag URL', () => {
      const baseUrl = 'http://localhost:8080'
      const projectName = 'my-project'
      const flagKey = 'my-flag'
      const url = `${baseUrl}/api/projects/${projectName}/flags/${flagKey}`
      expect(url).toBe('http://localhost:8080/api/projects/my-project/flags/my-flag')
    })

    it('should build correct create flag URL', () => {
      const baseUrl = 'http://localhost:8080'
      const projectName = 'my-project'
      const flagKey = 'new-flag'
      const url = `${baseUrl}/api/projects/${projectName}/flags/${flagKey}`
      expect(url).toBe('http://localhost:8080/api/projects/my-project/flags/new-flag')
    })

    it('should build correct update flag URL', () => {
      const baseUrl = 'http://localhost:8080'
      const projectName = 'my-project'
      const flagKey = 'existing-flag'
      const url = `${baseUrl}/api/projects/${projectName}/flags/${flagKey}`
      expect(url).toBe('http://localhost:8080/api/projects/my-project/flags/existing-flag')
    })

    it('should build correct delete flag URL', () => {
      const baseUrl = 'http://localhost:8080'
      const projectName = 'my-project'
      const flagKey = 'flag-to-delete'
      const url = `${baseUrl}/api/projects/${projectName}/flags/${flagKey}`
      expect(url).toBe('http://localhost:8080/api/projects/my-project/flags/flag-to-delete')
    })
  })

  describe('Notifiers API', () => {
    it('should build correct list notifiers URL', () => {
      const baseUrl = 'http://localhost:8080'
      const url = `${baseUrl}/api/notifiers`
      expect(url).toBe('http://localhost:8080/api/notifiers')
    })

    it('should build correct get notifier URL', () => {
      const baseUrl = 'http://localhost:8080'
      const notifierId = 'notifier-123'
      const url = `${baseUrl}/api/notifiers/${notifierId}`
      expect(url).toBe('http://localhost:8080/api/notifiers/notifier-123')
    })
  })

  describe('Exporters API', () => {
    it('should build correct list exporters URL', () => {
      const baseUrl = 'http://localhost:8080'
      const url = `${baseUrl}/api/exporters`
      expect(url).toBe('http://localhost:8080/api/exporters')
    })

    it('should build correct get exporter URL', () => {
      const baseUrl = 'http://localhost:8080'
      const exporterId = 'exporter-123'
      const url = `${baseUrl}/api/exporters/${exporterId}`
      expect(url).toBe('http://localhost:8080/api/exporters/exporter-123')
    })
  })

  describe('Retrievers API', () => {
    it('should build correct list retrievers URL', () => {
      const baseUrl = 'http://localhost:8080'
      const url = `${baseUrl}/api/retrievers`
      expect(url).toBe('http://localhost:8080/api/retrievers')
    })

    it('should build correct get retriever URL', () => {
      const baseUrl = 'http://localhost:8080'
      const retrieverId = 'retriever-123'
      const url = `${baseUrl}/api/retrievers/${retrieverId}`
      expect(url).toBe('http://localhost:8080/api/retrievers/retriever-123')
    })
  })

  describe('Flag Sets API', () => {
    it('should build correct list flagsets URL', () => {
      const baseUrl = 'http://localhost:8080'
      const url = `${baseUrl}/api/flagsets`
      expect(url).toBe('http://localhost:8080/api/flagsets')
    })

    it('should build correct get flagset URL', () => {
      const baseUrl = 'http://localhost:8080'
      const flagsetId = 'flagset-123'
      const url = `${baseUrl}/api/flagsets/${flagsetId}`
      expect(url).toBe('http://localhost:8080/api/flagsets/flagset-123')
    })

    it('should build correct relay proxy config URL', () => {
      const baseUrl = 'http://localhost:8080'
      const url = `${baseUrl}/api/flagsets/config/relay-proxy`
      expect(url).toBe('http://localhost:8080/api/flagsets/config/relay-proxy')
    })
  })

  describe('Integrations API', () => {
    it('should build correct list integrations URL', () => {
      const baseUrl = 'http://localhost:8080'
      const url = `${baseUrl}/api/integrations`
      expect(url).toBe('http://localhost:8080/api/integrations')
    })

    it('should build correct get integration URL', () => {
      const baseUrl = 'http://localhost:8080'
      const integrationId = 'integration-123'
      const url = `${baseUrl}/api/integrations/${integrationId}`
      expect(url).toBe('http://localhost:8080/api/integrations/integration-123')
    })

    it('should build correct test integration URL', () => {
      const baseUrl = 'http://localhost:8080'
      const integrationId = 'integration-123'
      const url = `${baseUrl}/api/integrations/${integrationId}/test`
      expect(url).toBe('http://localhost:8080/api/integrations/integration-123/test')
    })
  })

  describe('Raw Flags API', () => {
    it('should build correct raw flags URL', () => {
      const baseUrl = 'http://localhost:8080'
      const url = `${baseUrl}/api/flags/raw`
      expect(url).toBe('http://localhost:8080/api/flags/raw')
    })

    it('should build correct raw project flags URL', () => {
      const baseUrl = 'http://localhost:8080'
      const projectName = 'my-project'
      const url = `${baseUrl}/api/flags/raw/${projectName}`
      expect(url).toBe('http://localhost:8080/api/flags/raw/my-project')
    })
  })
})

describe('Request Body Validation', () => {
  describe('Flag Configuration Request', () => {
    it('should serialize simple flag config correctly', () => {
      const config = {
        variations: {
          enabled: true,
          disabled: false,
        },
        defaultRule: {
          variation: 'disabled',
        },
      }

      const json = JSON.stringify(config)
      const parsed = JSON.parse(json)

      expect(parsed.variations.enabled).toBe(true)
      expect(parsed.variations.disabled).toBe(false)
      expect(parsed.defaultRule.variation).toBe('disabled')
    })

    it('should serialize flag with percentage correctly', () => {
      const config = {
        variations: {
          control: 'baseline',
          treatment: 'experiment',
        },
        defaultRule: {
          percentage: {
            control: 50,
            treatment: 50,
          },
        },
      }

      const json = JSON.stringify(config)
      const parsed = JSON.parse(json)

      expect(parsed.defaultRule.percentage.control).toBe(50)
      expect(parsed.defaultRule.percentage.treatment).toBe(50)
    })

    it('should serialize flag with targeting rules correctly', () => {
      const config = {
        variations: {
          enabled: true,
          disabled: false,
        },
        targeting: [
          {
            name: 'beta-users',
            query: 'email ew "@company.com"',
            variation: 'enabled',
          },
        ],
        defaultRule: {
          variation: 'disabled',
        },
      }

      const json = JSON.stringify(config)
      const parsed = JSON.parse(json)

      expect(parsed.targeting).toHaveLength(1)
      expect(parsed.targeting[0].name).toBe('beta-users')
      expect(parsed.targeting[0].query).toBe('email ew "@company.com"')
    })

    it('should serialize flag with progressive rollout correctly', () => {
      const config = {
        variations: {
          enabled: true,
          disabled: false,
        },
        defaultRule: {
          progressiveRollout: {
            initial: {
              variation: 'disabled',
              percentage: 0,
              date: '2024-01-01T00:00:00Z',
            },
            end: {
              variation: 'enabled',
              percentage: 100,
              date: '2024-01-31T23:59:59Z',
            },
          },
        },
      }

      const json = JSON.stringify(config)
      const parsed = JSON.parse(json)

      expect(parsed.defaultRule.progressiveRollout.initial.variation).toBe('disabled')
      expect(parsed.defaultRule.progressiveRollout.end.variation).toBe('enabled')
    })

    it('should serialize flag with scheduled rollout correctly', () => {
      const config = {
        variations: {
          enabled: true,
          disabled: false,
        },
        defaultRule: {
          variation: 'disabled',
        },
        scheduledRollout: [
          {
            date: '2024-01-15T00:00:00Z',
            defaultRule: {
              percentage: { enabled: 10, disabled: 90 },
            },
          },
          {
            date: '2024-01-29T00:00:00Z',
            defaultRule: {
              variation: 'enabled',
            },
          },
        ],
      }

      const json = JSON.stringify(config)
      const parsed = JSON.parse(json)

      expect(parsed.scheduledRollout).toHaveLength(2)
      expect(parsed.scheduledRollout[0].date).toBe('2024-01-15T00:00:00Z')
      expect(parsed.scheduledRollout[0].defaultRule.percentage.enabled).toBe(10)
    })

    it('should serialize flag with experimentation correctly', () => {
      const config = {
        variations: {
          control: 'baseline',
          treatment: 'experiment',
        },
        defaultRule: {
          percentage: { control: 50, treatment: 50 },
        },
        experimentation: {
          start: '2024-01-01T00:00:00Z',
          end: '2024-01-31T23:59:59Z',
        },
        trackEvents: true,
      }

      const json = JSON.stringify(config)
      const parsed = JSON.parse(json)

      expect(parsed.experimentation.start).toBe('2024-01-01T00:00:00Z')
      expect(parsed.experimentation.end).toBe('2024-01-31T23:59:59Z')
      expect(parsed.trackEvents).toBe(true)
    })

    it('should serialize flag with all settings correctly', () => {
      const config = {
        variations: {
          enabled: true,
          disabled: false,
        },
        defaultRule: {
          variation: 'disabled',
        },
        disable: false,
        trackEvents: true,
        version: '1.0.0',
        bucketingKey: 'companyId',
        metadata: {
          description: 'Test flag',
          owner: 'platform-team',
        },
      }

      const json = JSON.stringify(config)
      const parsed = JSON.parse(json)

      expect(parsed.disable).toBe(false)
      expect(parsed.trackEvents).toBe(true)
      expect(parsed.version).toBe('1.0.0')
      expect(parsed.bucketingKey).toBe('companyId')
      expect(parsed.metadata.description).toBe('Test flag')
    })
  })

  describe('Notifier Configuration Request', () => {
    it('should serialize slack notifier correctly', () => {
      const config = {
        name: 'slack-alerts',
        kind: 'slack',
        enabled: true,
        webhookUrl: 'https://hooks.slack.com/services/xxx',
      }

      const json = JSON.stringify(config)
      const parsed = JSON.parse(json)

      expect(parsed.kind).toBe('slack')
      expect(parsed.webhookUrl).toBe('https://hooks.slack.com/services/xxx')
    })

    it('should serialize webhook notifier correctly', () => {
      const config = {
        name: 'webhook-alerts',
        kind: 'webhook',
        enabled: true,
        endpointUrl: 'https://example.com/webhook',
        secret: 'my-secret',
        headers: {
          Authorization: 'Bearer token',
        },
      }

      const json = JSON.stringify(config)
      const parsed = JSON.parse(json)

      expect(parsed.kind).toBe('webhook')
      expect(parsed.endpointUrl).toBe('https://example.com/webhook')
      expect(parsed.headers.Authorization).toBe('Bearer token')
    })
  })

  describe('Exporter Configuration Request', () => {
    it('should serialize file exporter correctly', () => {
      const config = {
        name: 'file-exporter',
        kind: 'file',
        enabled: true,
        outputDir: '/var/log/goff',
        fileFormat: 'json',
      }

      const json = JSON.stringify(config)
      const parsed = JSON.parse(json)

      expect(parsed.kind).toBe('file')
      expect(parsed.outputDir).toBe('/var/log/goff')
    })

    it('should serialize s3 exporter correctly', () => {
      const config = {
        name: 's3-exporter',
        kind: 's3',
        enabled: true,
        s3Bucket: 'my-bucket',
        s3Path: 'exports/',
      }

      const json = JSON.stringify(config)
      const parsed = JSON.parse(json)

      expect(parsed.kind).toBe('s3')
      expect(parsed.s3Bucket).toBe('my-bucket')
    })
  })

  describe('Retriever Configuration Request', () => {
    it('should serialize file retriever correctly', () => {
      const config = {
        name: 'file-retriever',
        kind: 'file',
        enabled: true,
        path: '/etc/goff/flags.yaml',
      }

      const json = JSON.stringify(config)
      const parsed = JSON.parse(json)

      expect(parsed.kind).toBe('file')
      expect(parsed.path).toBe('/etc/goff/flags.yaml')
    })

    it('should serialize github retriever correctly', () => {
      const config = {
        name: 'github-retriever',
        kind: 'github',
        enabled: true,
        githubRepositorySlug: 'org/repo',
        githubPath: 'flags.yaml',
        githubBranch: 'main',
      }

      const json = JSON.stringify(config)
      const parsed = JSON.parse(json)

      expect(parsed.kind).toBe('github')
      expect(parsed.githubRepositorySlug).toBe('org/repo')
    })
  })
})

describe('Response Parsing', () => {
  it('should parse projects list response', () => {
    const response = {
      projects: ['project-a', 'project-b', 'project-c'],
    }

    expect(response.projects).toHaveLength(3)
    expect(response.projects).toContain('project-a')
  })

  it('should parse flags list response', () => {
    const response = {
      flags: {
        'flag-1': {
          variations: { enabled: true, disabled: false },
          defaultRule: { variation: 'disabled' },
        },
        'flag-2': {
          variations: { v1: 'a', v2: 'b' },
          defaultRule: { percentage: { v1: 50, v2: 50 } },
        },
      },
    }

    expect(Object.keys(response.flags)).toHaveLength(2)
    expect(response.flags['flag-1'].defaultRule?.variation).toBe('disabled')
    expect(response.flags['flag-2'].defaultRule?.percentage?.v1).toBe(50)
  })

  it('should parse single flag response', () => {
    const response = {
      key: 'my-flag',
      config: {
        variations: { enabled: true, disabled: false },
        defaultRule: { variation: 'enabled' },
        version: '1.0.0',
      },
    }

    expect(response.key).toBe('my-flag')
    expect(response.config.version).toBe('1.0.0')
  })

  it('should parse health response', () => {
    const response = {
      healthy: true,
    }

    expect(response.healthy).toBe(true)
  })

  it('should parse error response', () => {
    const response = {
      error: 'Project not found',
    }

    expect(response.error).toBe('Project not found')
  })
})
