import { Input } from '@/components/ui/input';
import { Variation } from './index';

interface PercentageRolloutProps {
  variations: Variation[];
  percentages: Record<string, number>;
  setPercentages: (percentages: Record<string, number>) => void;
  barColor?: string;
}

export function PercentageRollout({
  variations,
  percentages,
  setPercentages,
  barColor = 'bg-blue-500',
}: PercentageRolloutProps) {
  return (
    <div className="space-y-3">
      {variations.map((v) => (
        <div key={v.name} className="flex items-center gap-3">
          <span className="w-32 text-sm font-medium">{v.name}</span>
          <Input
            type="number"
            min="0"
            max="100"
            value={percentages[v.name] || 0}
            onChange={(e) =>
              setPercentages({
                ...percentages,
                [v.name]: parseInt(e.target.value) || 0,
              })
            }
            className="w-24"
          />
          <span className="text-sm text-zinc-500">%</span>
          <div className="flex-1 h-2 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
            <div
              className={`h-full ${barColor}`}
              style={{ width: `${percentages[v.name] || 0}%` }}
            />
          </div>
        </div>
      ))}
      <p className="text-xs text-zinc-500">
        Total: {Object.values(percentages).reduce((a, b) => a + b, 0)}%
        {Object.values(percentages).reduce((a, b) => a + b, 0) !== 100 && (
          <span className="text-amber-500 ml-2">(should equal 100%)</span>
        )}
      </p>
    </div>
  );
}
