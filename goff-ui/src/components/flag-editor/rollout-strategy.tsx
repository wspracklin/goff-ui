import { Clock, Calendar, TrendingUp, ListOrdered, FlaskConical, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { ProgressiveRollout as ProgressiveRolloutType, ScheduledStep, ExperimentationRollout } from '@/lib/local-api';
import { Variation, RolloutStrategyType } from './index';
import { PercentageRollout } from './percentage-rollout';
import { ProgressiveRolloutEditor } from './progressive-rollout';
import { ScheduledRolloutEditor } from './scheduled-rollout';
import { ExperimentationRolloutEditor } from './experimentation-rollout';

interface RolloutStrategyProps {
  rolloutStrategy: RolloutStrategyType;
  setRolloutStrategy: (strategy: RolloutStrategyType) => void;
  variations: Variation[];
  defaultVariation: string;
  setDefaultVariation: (variation: string) => void;
  percentages: Record<string, number>;
  setPercentages: (percentages: Record<string, number>) => void;
  progressiveRollout: ProgressiveRolloutType;
  setProgressiveRollout: (rollout: ProgressiveRolloutType) => void;
  scheduledSteps: ScheduledStep[];
  setScheduledSteps: (steps: ScheduledStep[]) => void;
  experimentation: ExperimentationRollout;
  setExperimentation: (exp: ExperimentationRollout) => void;
}

export function RolloutStrategySection({
  rolloutStrategy,
  setRolloutStrategy,
  variations,
  defaultVariation,
  setDefaultVariation,
  percentages,
  setPercentages,
  progressiveRollout,
  setProgressiveRollout,
  scheduledSteps,
  setScheduledSteps,
  experimentation,
  setExperimentation,
}: RolloutStrategyProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Rollout Strategy</CardTitle>
        <CardDescription>
          Choose how to roll out this flag to users
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Strategy Selector */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <button
            type="button"
            onClick={() => setRolloutStrategy('single')}
            className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all ${
              rolloutStrategy === 'single'
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
                : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300'
            }`}
          >
            <Clock className={`h-5 w-5 ${rolloutStrategy === 'single' ? 'text-blue-500' : 'text-zinc-400'}`} />
            <span className="text-xs font-medium">Single</span>
          </button>
          <button
            type="button"
            onClick={() => setRolloutStrategy('percentage')}
            className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all ${
              rolloutStrategy === 'percentage'
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
                : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300'
            }`}
          >
            <TrendingUp className={`h-5 w-5 ${rolloutStrategy === 'percentage' ? 'text-blue-500' : 'text-zinc-400'}`} />
            <span className="text-xs font-medium">Percentage</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setRolloutStrategy('progressive');
              if (!progressiveRollout.initial?.date && !progressiveRollout.end?.date) {
                const startDate = new Date();
                const endDate = new Date();
                endDate.setDate(endDate.getDate() + 7);
                const firstVar = variations[0]?.name || '';
                const lastVar = variations[variations.length - 1]?.name || firstVar;
                setProgressiveRollout({
                  initial: { variation: firstVar, date: startDate.toISOString().slice(0, 16), percentage: 0 },
                  end: { variation: lastVar, date: endDate.toISOString().slice(0, 16), percentage: 100 },
                });
              }
            }}
            className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all ${
              rolloutStrategy === 'progressive'
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
                : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300'
            }`}
          >
            <Calendar className={`h-5 w-5 ${rolloutStrategy === 'progressive' ? 'text-blue-500' : 'text-zinc-400'}`} />
            <span className="text-xs font-medium">Progressive</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setRolloutStrategy('scheduled');
              if (scheduledSteps.length === 0) {
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                setScheduledSteps([{
                  date: tomorrow.toISOString().slice(0, 16),
                  defaultRule: { variation: variations[0]?.name || '' },
                }]);
              }
            }}
            className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all ${
              rolloutStrategy === 'scheduled'
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
                : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300'
            }`}
          >
            <ListOrdered className={`h-5 w-5 ${rolloutStrategy === 'scheduled' ? 'text-blue-500' : 'text-zinc-400'}`} />
            <span className="text-xs font-medium">Scheduled</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setRolloutStrategy('experimentation');
              if (!experimentation.start && !experimentation.end) {
                const startDate = new Date();
                const endDate = new Date();
                endDate.setDate(endDate.getDate() + 14);
                setExperimentation({
                  start: startDate.toISOString().slice(0, 16),
                  end: endDate.toISOString().slice(0, 16),
                });
              }
            }}
            className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all ${
              rolloutStrategy === 'experimentation'
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
                : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300'
            }`}
          >
            <FlaskConical className={`h-5 w-5 ${rolloutStrategy === 'experimentation' ? 'text-blue-500' : 'text-zinc-400'}`} />
            <span className="text-xs font-medium">Experiment</span>
          </button>
        </div>

        {/* Single Variation */}
        {rolloutStrategy === 'single' && (
          <div className="space-y-4">
            <div className="flex items-start gap-2 p-3 rounded-lg bg-zinc-50 dark:bg-zinc-900">
              <Info className="h-4 w-4 text-zinc-500 mt-0.5" />
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                All users will receive the same variation.
              </p>
            </div>
            <div>
              <Label>Default Variation</Label>
              <select
                value={defaultVariation}
                onChange={(e) => setDefaultVariation(e.target.value)}
                className="flex h-10 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                {variations.map((v) => (
                  <option key={v.name} value={v.name}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Percentage Rollout */}
        {rolloutStrategy === 'percentage' && (
          <div className="space-y-4">
            <div className="flex items-start gap-2 p-3 rounded-lg bg-zinc-50 dark:bg-zinc-900">
              <Info className="h-4 w-4 text-zinc-500 mt-0.5" />
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Split traffic between variations by percentage. Users consistently receive the same variation.
              </p>
            </div>
            <PercentageRollout
              variations={variations}
              percentages={percentages}
              setPercentages={setPercentages}
            />
          </div>
        )}

        {/* Progressive Rollout */}
        {rolloutStrategy === 'progressive' && (
          <ProgressiveRolloutEditor
            variations={variations}
            progressiveRollout={progressiveRollout}
            setProgressiveRollout={setProgressiveRollout}
          />
        )}

        {/* Scheduled Rollout */}
        {rolloutStrategy === 'scheduled' && (
          <ScheduledRolloutEditor
            variations={variations}
            scheduledSteps={scheduledSteps}
            setScheduledSteps={setScheduledSteps}
            defaultVariation={defaultVariation}
            setDefaultVariation={setDefaultVariation}
          />
        )}

        {/* Experimentation Rollout */}
        {rolloutStrategy === 'experimentation' && (
          <ExperimentationRolloutEditor
            variations={variations}
            experimentation={experimentation}
            setExperimentation={setExperimentation}
            percentages={percentages}
            setPercentages={setPercentages}
            defaultVariation={defaultVariation}
            setDefaultVariation={setDefaultVariation}
          />
        )}
      </CardContent>
    </Card>
  );
}
