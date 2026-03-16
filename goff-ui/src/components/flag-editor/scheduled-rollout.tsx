import { Plus, Trash2, Info } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DateTimePicker } from '@/components/ui/datetime-picker';
import { ScheduledStep } from '@/lib/local-api';
import { Variation } from './index';

interface ScheduledRolloutEditorProps {
  variations: Variation[];
  scheduledSteps: ScheduledStep[];
  setScheduledSteps: (steps: ScheduledStep[]) => void;
  defaultVariation: string;
  setDefaultVariation: (variation: string) => void;
}

export function ScheduledRolloutEditor({
  variations,
  scheduledSteps,
  setScheduledSteps,
  defaultVariation,
  setDefaultVariation,
}: ScheduledRolloutEditorProps) {
  const addScheduledStep = () => {
    const newDate = new Date();
    newDate.setDate(newDate.getDate() + scheduledSteps.length + 1);
    setScheduledSteps([
      ...scheduledSteps,
      {
        date: newDate.toISOString().slice(0, 16),
        defaultRule: { variation: variations[0]?.name || '' },
      },
    ]);
  };

  const removeScheduledStep = (index: number) => {
    setScheduledSteps(scheduledSteps.filter((_, i) => i !== index));
  };

  const updateScheduledStep = (index: number, updates: Partial<ScheduledStep>) => {
    const updated = [...scheduledSteps];
    updated[index] = { ...updated[index], ...updates };
    setScheduledSteps(updated);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 p-3 rounded-lg bg-zinc-50 dark:bg-zinc-900">
        <Info className="h-4 w-4 text-zinc-500 mt-0.5" />
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Define multiple stages with specific dates. At each stage, the flag configuration updates automatically.
        </p>
      </div>

      <div>
        <Label>Initial Default Variation</Label>
        <select
          value={defaultVariation}
          onChange={(e) => setDefaultVariation(e.target.value)}
          className="flex h-10 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        >
          {variations.map((v) => (
            <option key={v.name} value={v.name}>{v.name}</option>
          ))}
        </select>
        <p className="mt-1 text-xs text-zinc-500">This is served before the first scheduled step</p>
      </div>

      <div className="space-y-3">
        {scheduledSteps.map((step, index) => (
          <div
            key={index}
            className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
          >
            <div className="flex items-center justify-between mb-3">
              <Badge variant="secondary">Step {index + 1}</Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeScheduledStep(index)}
              >
                <Trash2 className="h-4 w-4 text-red-500" />
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Date & Time</Label>
                <DateTimePicker
                  value={step.date}
                  onChange={(value) =>
                    updateScheduledStep(index, { date: value })
                  }
                  placeholder="Select date & time"
                />
              </div>
              <div>
                <Label>Serve Variation</Label>
                <select
                  value={step.defaultRule?.variation || ''}
                  onChange={(e) =>
                    updateScheduledStep(index, {
                      defaultRule: { variation: e.target.value },
                    })
                  }
                  className="flex h-10 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                >
                  {variations.map((v) => (
                    <option key={v.name} value={v.name}>{v.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        ))}

        <Button variant="outline" size="sm" onClick={addScheduledStep}>
          <Plus className="h-4 w-4 mr-1" />
          Add Step
        </Button>
      </div>
    </div>
  );
}
