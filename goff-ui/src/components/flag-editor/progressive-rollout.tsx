import { TrendingUp } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { DateTimePicker } from '@/components/ui/datetime-picker';
import { ProgressiveRollout } from '@/lib/local-api';
import { Variation } from './index';

interface ProgressiveRolloutEditorProps {
  variations: Variation[];
  progressiveRollout: ProgressiveRollout;
  setProgressiveRollout: (rollout: ProgressiveRollout) => void;
}

export function ProgressiveRolloutEditor({
  variations,
  progressiveRollout,
  setProgressiveRollout,
}: ProgressiveRolloutEditorProps) {
  return (
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
  );
}
