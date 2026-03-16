import { Plus, Trash2, GripVertical } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Variation } from './index';

interface VariationsEditorProps {
  variations: Variation[];
  addVariation: () => void;
  removeVariation: (index: number) => void;
  updateVariation: (index: number, field: keyof Variation, value: string) => void;
}

export function VariationsEditor({
  variations,
  addVariation,
  removeVariation,
  updateVariation,
}: VariationsEditorProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Variations</CardTitle>
        <Button variant="outline" size="sm" onClick={addVariation}>
          <Plus className="h-4 w-4 mr-1" />
          Add Variation
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {variations.map((variation, index) => (
            <div key={index} className="flex items-center gap-3">
              <GripVertical className="h-4 w-4 text-zinc-400" />
              <Input
                value={variation.name}
                onChange={(e) => updateVariation(index, 'name', e.target.value)}
                placeholder="Variation name"
                className="w-40"
              />
              <select
                value={variation.type}
                onChange={(e) => updateVariation(index, 'type', e.target.value)}
                className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                <option value="boolean">Boolean</option>
                <option value="string">String</option>
                <option value="number">Number</option>
                <option value="json">JSON</option>
              </select>
              <Input
                value={variation.value}
                onChange={(e) => updateVariation(index, 'value', e.target.value)}
                placeholder={variation.type === 'boolean' ? 'true/false' : 'Value'}
                className="flex-1"
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeVariation(index)}
                disabled={variations.length <= 2}
              >
                <Trash2 className="h-4 w-4 text-red-500" />
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
