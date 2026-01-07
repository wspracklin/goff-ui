import { describe, it, expect } from 'vitest'
import type { FlagConfiguration, TargetingRule, Rule, ProgressiveRollout, ScheduledStep, ExperimentationRollout } from '../lib/types'

// =============================================================================
// FLAG CONFIGURATION VALIDATION TESTS
// Tests for all flag configuration types and their validation
// =============================================================================

describe('FlagConfiguration Validation', () => {
  describe('Variations', () => {
    it('should accept boolean variations', () => {
      const config: FlagConfiguration = {
        variations: {
          enabled: true,
          disabled: false,
        },
        defaultRule: { variation: 'disabled' },
      }
      expect(config.variations).toHaveProperty('enabled', true)
      expect(config.variations).toHaveProperty('disabled', false)
    })

    it('should accept string variations', () => {
      const config: FlagConfiguration = {
        variations: {
          control: 'baseline',
          treatment: 'experiment',
        },
        defaultRule: { variation: 'control' },
      }
      expect(config.variations?.control).toBe('baseline')
      expect(config.variations?.treatment).toBe('experiment')
    })

    it('should accept number variations', () => {
      const config: FlagConfiguration = {
        variations: {
          low: 10,
          medium: 50,
          high: 100,
        },
        defaultRule: { variation: 'medium' },
      }
      expect(config.variations?.low).toBe(10)
      expect(config.variations?.medium).toBe(50)
    })

    it('should accept JSON object variations', () => {
      const config: FlagConfiguration = {
        variations: {
          configA: { color: 'red', size: 10 },
          configB: { color: 'blue', size: 20 },
        },
        defaultRule: { variation: 'configA' },
      }
      expect(config.variations?.configA).toEqual({ color: 'red', size: 10 })
    })

    it('should accept array variations', () => {
      const config: FlagConfiguration = {
        variations: {
          listA: ['a', 'b', 'c'],
          listB: ['x', 'y', 'z'],
        },
        defaultRule: { variation: 'listA' },
      }
      expect(config.variations?.listA).toEqual(['a', 'b', 'c'])
    })
  })

  describe('DefaultRule', () => {
    it('should accept single variation', () => {
      const rule: Rule = {
        variation: 'enabled',
      }
      expect(rule.variation).toBe('enabled')
      expect(rule.percentage).toBeUndefined()
    })

    it('should accept 50/50 percentage split', () => {
      const rule: Rule = {
        percentage: {
          control: 50,
          treatment: 50,
        },
      }
      expect(rule.percentage?.control).toBe(50)
      expect(rule.percentage?.treatment).toBe(50)
      expect(Object.values(rule.percentage!).reduce((a, b) => a + b, 0)).toBe(100)
    })

    it('should accept 90/10 canary split', () => {
      const rule: Rule = {
        percentage: {
          stable: 90,
          canary: 10,
        },
      }
      expect(Object.values(rule.percentage!).reduce((a, b) => a + b, 0)).toBe(100)
    })

    it('should accept three-way split', () => {
      const rule: Rule = {
        percentage: {
          v1: 33.33,
          v2: 33.33,
          v3: 33.34,
        },
      }
      const total = Object.values(rule.percentage!).reduce((a, b) => a + b, 0)
      expect(total).toBeCloseTo(100, 2)
    })

    it('should accept decimal percentages', () => {
      const rule: Rule = {
        percentage: {
          main: 99.99,
          experiment: 0.01,
        },
      }
      const total = Object.values(rule.percentage!).reduce((a, b) => a + b, 0)
      expect(total).toBeCloseTo(100, 2)
    })
  })

  describe('ProgressiveRollout', () => {
    it('should have valid initial and end steps', () => {
      const progressive: ProgressiveRollout = {
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
      }
      expect(progressive.initial?.variation).toBe('disabled')
      expect(progressive.initial?.percentage).toBe(0)
      expect(progressive.end?.variation).toBe('enabled')
      expect(progressive.end?.percentage).toBe(100)
    })

    it('should have dates in ISO format', () => {
      const progressive: ProgressiveRollout = {
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
      }
      expect(new Date(progressive.initial!.date!).toISOString()).toBe('2024-01-01T00:00:00.000Z')
      expect(new Date(progressive.end!.date!).toISOString()).toBe('2024-01-31T23:59:59.000Z')
    })

    it('should have end date after initial date', () => {
      const progressive: ProgressiveRollout = {
        initial: {
          date: '2024-01-01T00:00:00Z',
        },
        end: {
          date: '2024-01-31T23:59:59Z',
        },
      }
      const initialDate = new Date(progressive.initial!.date!)
      const endDate = new Date(progressive.end!.date!)
      expect(endDate.getTime()).toBeGreaterThan(initialDate.getTime())
    })
  })

  describe('ScheduledRollout', () => {
    it('should accept single scheduled step', () => {
      const steps: ScheduledStep[] = [
        {
          date: '2024-01-15T00:00:00Z',
          defaultRule: { variation: 'enabled' },
        },
      ]
      expect(steps).toHaveLength(1)
      expect(steps[0].defaultRule?.variation).toBe('enabled')
    })

    it('should accept multi-step rollout', () => {
      const steps: ScheduledStep[] = [
        {
          date: '2024-01-15T00:00:00Z',
          defaultRule: {
            percentage: { enabled: 10, disabled: 90 },
          },
        },
        {
          date: '2024-01-22T00:00:00Z',
          defaultRule: {
            percentage: { enabled: 50, disabled: 50 },
          },
        },
        {
          date: '2024-01-29T00:00:00Z',
          defaultRule: { variation: 'enabled' },
        },
      ]
      expect(steps).toHaveLength(3)
      expect(steps[0].defaultRule?.percentage?.enabled).toBe(10)
      expect(steps[1].defaultRule?.percentage?.enabled).toBe(50)
      expect(steps[2].defaultRule?.variation).toBe('enabled')
    })

    it('should have dates in chronological order', () => {
      const steps: ScheduledStep[] = [
        { date: '2024-01-15T00:00:00Z', defaultRule: { variation: 'disabled' } },
        { date: '2024-01-22T00:00:00Z', defaultRule: { variation: 'enabled' } },
      ]
      const dates = steps.map(s => new Date(s.date).getTime())
      for (let i = 1; i < dates.length; i++) {
        expect(dates[i]).toBeGreaterThan(dates[i - 1])
      }
    })

    it('should accept step with targeting rules', () => {
      const steps: ScheduledStep[] = [
        {
          date: '2024-01-15T00:00:00Z',
          targeting: [
            {
              name: 'beta-users',
              query: 'plan eq "beta"',
              variation: 'enabled',
            },
          ],
          defaultRule: { variation: 'disabled' },
        },
      ]
      expect(steps[0].targeting).toHaveLength(1)
      expect(steps[0].targeting![0].name).toBe('beta-users')
    })
  })

  describe('Experimentation', () => {
    it('should have valid start and end dates', () => {
      const experimentation: ExperimentationRollout = {
        start: '2024-01-01T00:00:00Z',
        end: '2024-01-31T23:59:59Z',
      }
      expect(experimentation.start).toBeDefined()
      expect(experimentation.end).toBeDefined()
    })

    it('should have end date after start date', () => {
      const experimentation: ExperimentationRollout = {
        start: '2024-01-01T00:00:00Z',
        end: '2024-01-31T23:59:59Z',
      }
      const startDate = new Date(experimentation.start!)
      const endDate = new Date(experimentation.end!)
      expect(endDate.getTime()).toBeGreaterThan(startDate.getTime())
    })

    it('should be combined with percentage split for A/B testing', () => {
      const config: FlagConfiguration = {
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
        experimentation: {
          start: '2024-01-01T00:00:00Z',
          end: '2024-01-31T23:59:59Z',
        },
        trackEvents: true,
      }
      expect(config.experimentation).toBeDefined()
      expect(config.trackEvents).toBe(true)
    })
  })

  describe('TargetingRules', () => {
    it('should accept rule with variation', () => {
      const rule: TargetingRule = {
        name: 'beta-users',
        query: 'email ew "@company.com"',
        variation: 'enabled',
      }
      expect(rule.name).toBe('beta-users')
      expect(rule.query).toBe('email ew "@company.com"')
      expect(rule.variation).toBe('enabled')
    })

    it('should accept rule with percentage', () => {
      const rule: TargetingRule = {
        name: 'gradual-rollout',
        query: 'plan eq "enterprise"',
        percentage: {
          enabled: 25,
          disabled: 75,
        },
      }
      expect(rule.percentage?.enabled).toBe(25)
      expect(rule.percentage?.disabled).toBe(75)
    })

    it('should accept disabled rule', () => {
      const rule: TargetingRule = {
        name: 'disabled-rule',
        query: 'email co "test"',
        variation: 'enabled',
        disable: true,
      }
      expect(rule.disable).toBe(true)
    })

    it('should accept rule with progressive rollout', () => {
      const rule: TargetingRule = {
        name: 'progressive-beta',
        query: 'plan eq "beta"',
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
      }
      expect(rule.progressiveRollout).toBeDefined()
    })

    it('should accept multiple targeting rules in order', () => {
      const rules: TargetingRule[] = [
        {
          name: 'admin-users',
          query: 'role eq "admin"',
          variation: 'enabled',
        },
        {
          name: 'beta-testers',
          query: 'beta eq true',
          variation: 'enabled',
        },
        {
          name: 'premium-users',
          query: 'plan eq "premium"',
          percentage: { enabled: 50, disabled: 50 },
        },
      ]
      expect(rules).toHaveLength(3)
      expect(rules[0].name).toBe('admin-users') // Order preserved
      expect(rules[1].name).toBe('beta-testers')
      expect(rules[2].name).toBe('premium-users')
    })
  })

  describe('Advanced Settings', () => {
    it('should accept disable flag', () => {
      const config: FlagConfiguration = {
        variations: { enabled: true, disabled: false },
        defaultRule: { variation: 'enabled' },
        disable: true,
      }
      expect(config.disable).toBe(true)
    })

    it('should accept trackEvents setting', () => {
      const config: FlagConfiguration = {
        variations: { enabled: true, disabled: false },
        defaultRule: { variation: 'enabled' },
        trackEvents: true,
      }
      expect(config.trackEvents).toBe(true)
    })

    it('should accept version string', () => {
      const config: FlagConfiguration = {
        variations: { enabled: true, disabled: false },
        defaultRule: { variation: 'enabled' },
        version: '1.2.3',
      }
      expect(config.version).toBe('1.2.3')
    })

    it('should accept bucketingKey', () => {
      const config: FlagConfiguration = {
        variations: { enabled: true, disabled: false },
        defaultRule: {
          percentage: { enabled: 50, disabled: 50 },
        },
        bucketingKey: 'companyId',
      }
      expect(config.bucketingKey).toBe('companyId')
    })

    it('should accept metadata', () => {
      const config: FlagConfiguration = {
        variations: { enabled: true, disabled: false },
        defaultRule: { variation: 'enabled' },
        metadata: {
          description: 'Test flag',
          owner: 'platform-team',
          jiraIssue: 'PLAT-123',
          tags: ['feature', 'rollout'],
          priority: 1,
        },
      }
      expect(config.metadata?.description).toBe('Test flag')
      expect(config.metadata?.owner).toBe('platform-team')
      expect(config.metadata?.tags).toEqual(['feature', 'rollout'])
    })
  })

  describe('Query Operators', () => {
    const validQueries = [
      { name: 'equals', query: 'role eq "admin"' },
      { name: 'not equals', query: 'role ne "guest"' },
      { name: 'contains', query: 'email co "@company"' },
      { name: 'starts with', query: 'accountId sw "test-"' },
      { name: 'ends with', query: 'email ew "@company.com"' },
      { name: 'in list', query: 'country in ["US", "CA", "MX"]' },
      { name: 'less than', query: 'accountAge lt 30' },
      { name: 'greater than', query: 'loginCount gt 100' },
      { name: 'less than or equal', query: 'accountAge le 30' },
      { name: 'greater than or equal', query: 'loginCount ge 100' },
      { name: 'AND operator', query: 'role eq "admin" and country eq "US"' },
      { name: 'OR operator', query: 'role eq "admin" or beta eq true' },
      { name: 'complex nested', query: '(role eq "admin" or role eq "manager") and country in ["US", "CA"]' },
      { name: 'boolean value', query: 'beta eq true' },
      { name: 'numeric value', query: 'age gt 18' },
    ]

    validQueries.forEach(({ name, query }) => {
      it(`should accept ${name} query: ${query}`, () => {
        const rule: TargetingRule = {
          name: `test-${name}`,
          query,
          variation: 'enabled',
        }
        expect(rule.query).toBe(query)
      })
    })
  })

  describe('Complete Flag Configuration', () => {
    it('should accept full featured flag', () => {
      const config: FlagConfiguration = {
        variations: {
          control: { theme: 'light', features: ['basic'] },
          treatment: { theme: 'dark', features: ['basic', 'advanced'] },
        },
        targeting: [
          {
            name: 'internal-users',
            query: 'email ew "@company.com"',
            variation: 'treatment',
          },
          {
            name: 'beta-users',
            query: 'beta eq true',
            percentage: { control: 20, treatment: 80 },
          },
        ],
        defaultRule: {
          percentage: {
            control: 50,
            treatment: 50,
          },
        },
        experimentation: {
          start: '2024-01-01T00:00:00Z',
          end: '2024-03-31T23:59:59Z',
        },
        trackEvents: true,
        disable: false,
        version: '2.0.0',
        bucketingKey: 'userId',
        metadata: {
          description: 'Dark mode experiment',
          owner: 'design-team',
          hypothesis: 'Dark mode improves engagement',
          createdAt: '2024-01-01T00:00:00Z',
          tags: ['experiment', 'ui', 'dark-mode'],
        },
      }

      expect(config.variations).toBeDefined()
      expect(config.targeting).toHaveLength(2)
      expect(config.defaultRule?.percentage).toBeDefined()
      expect(config.experimentation).toBeDefined()
      expect(config.trackEvents).toBe(true)
      expect(config.disable).toBe(false)
      expect(config.version).toBe('2.0.0')
      expect(config.bucketingKey).toBe('userId')
      expect(config.metadata?.description).toBe('Dark mode experiment')
    })
  })
})
