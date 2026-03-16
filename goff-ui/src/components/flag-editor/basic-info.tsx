import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface BasicInfoProps {
  flagKey: string;
  setFlagKey: (key: string) => void;
  description: string;
  setDescription: (desc: string) => void;
  version: string;
  setVersion: (version: string) => void;
  isDisabled: boolean;
  setIsDisabled: (disabled: boolean) => void;
  trackEvents: boolean;
  setTrackEvents: (track: boolean) => void;
  mode: 'create' | 'edit';
}

export function BasicInfo({
  flagKey,
  setFlagKey,
  description,
  setDescription,
  version,
  setVersion,
  isDisabled,
  setIsDisabled,
  trackEvents,
  setTrackEvents,
  mode,
}: BasicInfoProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Basic Information</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="flagKey">Flag Key *</Label>
          <Input
            id="flagKey"
            value={flagKey}
            onChange={(e) => setFlagKey(e.target.value)}
            placeholder="my-feature-flag"
            disabled={mode === 'edit'}
          />
          <p className="mt-1 text-xs text-zinc-500">
            Unique identifier for the flag (cannot contain spaces)
          </p>
        </div>

        <div>
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What does this flag do?"
            rows={2}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="version">Version</Label>
            <Input
              id="version"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="1.0.0"
            />
          </div>
          <div className="flex items-end gap-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={!isDisabled}
                onChange={(e) => setIsDisabled(!e.target.checked)}
                className="rounded"
              />
              <span className="text-sm">Enabled</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={trackEvents}
                onChange={(e) => setTrackEvents(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm">Track Events</span>
            </label>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
