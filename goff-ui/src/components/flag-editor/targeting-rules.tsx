import { Plus, Trash2, HelpCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DateTimePickerCompact } from '@/components/ui/datetime-picker';
import { TargetingRule } from '@/lib/local-api';
import { Variation, TargetingRuleType } from './index';
import { useState } from 'react';

interface TargetingRulesProps {
  variations: Variation[];
  targetingRules: TargetingRule[];
  setTargetingRules: (rules: TargetingRule[]) => void;
  targetingRuleTypes: Record<number, TargetingRuleType>;
  setTargetingRuleTypes: (types: Record<number, TargetingRuleType>) => void;
}

export function TargetingRules({
  variations,
  targetingRules,
  setTargetingRules,
  targetingRuleTypes,
  setTargetingRuleTypes,
}: TargetingRulesProps) {
  const [showQueryHelp, setShowQueryHelp] = useState(false);

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

  return (
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
  );
}
