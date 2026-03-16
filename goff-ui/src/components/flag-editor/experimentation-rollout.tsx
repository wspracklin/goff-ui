import { Info } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { DateTimePicker } from '@/components/ui/datetime-picker';
import { ExperimentationRollout } from '@/lib/local-api';
import { Variation } from './index';
import { PercentageRollout } from './percentage-rollout';

interface ExperimentationRolloutEditorProps {
  variations: Variation[];
  experimentation: ExperimentationRollout;
  setExperimentation: (exp: ExperimentationRollout) => void;
  percentages: Record<string, number>;
  setPercentages: (percentages: Record<string, number>) => void;
  defaultVariation: string;
  setDefaultVariation: (variation: string) => void;
}

export function ExperimentationRolloutEditor({
  variations,
  experimentation,
  setExperimentation,
  percentages,
  setPercentages,
  defaultVariation,
  setDefaultVariation,
}: ExperimentationRolloutEditorProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 p-3 rounded-lg bg-zinc-50 dark:bg-zinc-900">
        <Info className="h-4 w-4 text-zinc-500 mt-0.5" />
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Run a time-bound experiment. The flag is only active between the start and end dates. Outside this window, users receive the default value.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label>Start Date</Label>
          <DateTimePicker
            value={experimentation.start}
            onChange={(value) =>
              setExperimentation({ ...experimentation, start: value })
            }
            placeholder="Select start date"
          />
        </div>
        <div>
          <Label>End Date</Label>
          <DateTimePicker
            value={experimentation.end}
            onChange={(value) =>
              setExperimentation({ ...experimentation, end: value })
            }
            placeholder="Select end date"
          />
        </div>
      </div>

      <div className="border-t border-zinc-200 dark:border-zinc-800 pt-4">
        <Label className="mb-3 block">Distribution During Experiment</Label>
        <div className="flex gap-4 mb-4">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              checked={Object.keys(percentages).length === 0}
              onChange={() => setPercentages({})}
            />
            <span className="text-sm">Single Variation</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              checked={Object.keys(percentages).length > 0}
              onChange={() => {
                const initial: Record<string, number> = {};
                variations.forEach((v, i) => {
                  initial[v.name] = i === 0 ? 50 : i === 1 ? 50 : 0;
                });
                setPercentages(initial);
              }}
            />
            <span className="text-sm">Percentage Split</span>
          </label>
        </div>

        {Object.keys(percentages).length === 0 ? (
          <div>
            <select
              value={defaultVariation}
              onChange={(e) => setDefaultVariation(e.target.value)}
              className="flex h-10 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            >
              {variations.map((v) => (
                <option key={v.name} value={v.name}>{v.name}</option>
              ))}
            </select>
          </div>
        ) : (
          <PercentageRollout
            variations={variations}
            percentages={percentages}
            setPercentages={setPercentages}
            barColor="bg-purple-500"
          />
        )}
      </div>
    </div>
  );
}
