import { Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface AdvancedSettingsProps {
  bucketingKey: string;
  setBucketingKey: (key: string) => void;
  metadataEntries: { key: string; value: string }[];
  setMetadataEntries: (entries: { key: string; value: string }[]) => void;
  showAdvanced: boolean;
  setShowAdvanced: (show: boolean) => void;
}

export function AdvancedSettings({
  bucketingKey,
  setBucketingKey,
  metadataEntries,
  setMetadataEntries,
  showAdvanced,
  setShowAdvanced,
}: AdvancedSettingsProps) {
  return (
    <Card>
      <CardHeader
        className="cursor-pointer"
        onClick={() => setShowAdvanced(!showAdvanced)}
      >
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            Advanced Settings
            {(bucketingKey || metadataEntries.length > 0) && (
              <Badge variant="secondary" className="text-xs">Configured</Badge>
            )}
          </CardTitle>
          {showAdvanced ? (
            <ChevronUp className="h-5 w-5 text-zinc-400" />
          ) : (
            <ChevronDown className="h-5 w-5 text-zinc-400" />
          )}
        </div>
      </CardHeader>
      {showAdvanced && (
        <CardContent className="space-y-6">
          {/* Bucketing Key */}
          <div>
            <Label htmlFor="bucketingKey">Bucketing Key</Label>
            <Input
              id="bucketingKey"
              value={bucketingKey}
              onChange={(e) => setBucketingKey(e.target.value)}
              placeholder="e.g., companyId, teamId"
            />
            <p className="mt-1 text-xs text-zinc-500">
              Use a different evaluation context field for consistent traffic splitting instead of the default targetingKey.
              If specified but missing from context, flag evaluation will fail.
            </p>
          </div>

          {/* Custom Metadata */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Custom Metadata</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMetadataEntries([...metadataEntries, { key: '', value: '' }])}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Entry
              </Button>
            </div>
            <p className="text-xs text-zinc-500 mb-3">
              Add custom metadata like configuration URLs, Jira issues, or owner information.
            </p>
            {metadataEntries.length === 0 ? (
              <p className="text-sm text-zinc-400 text-center py-2">
                No custom metadata entries
              </p>
            ) : (
              <div className="space-y-2">
                {metadataEntries.map((entry, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      value={entry.key}
                      onChange={(e) => {
                        const updated = [...metadataEntries];
                        updated[index] = { ...entry, key: e.target.value };
                        setMetadataEntries(updated);
                      }}
                      placeholder="Key (e.g., jiraIssue)"
                      className="w-40"
                    />
                    <Input
                      value={entry.value}
                      onChange={(e) => {
                        const updated = [...metadataEntries];
                        updated[index] = { ...entry, value: e.target.value };
                        setMetadataEntries(updated);
                      }}
                      placeholder="Value"
                      className="flex-1"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setMetadataEntries(metadataEntries.filter((_, i) => i !== index));
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
