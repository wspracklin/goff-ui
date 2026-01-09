'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, AlertCircle, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { FlagEditor } from '@/components/flag-editor';
import { LocalFlagConfig } from '@/lib/local-api';
import { toast } from 'sonner';
import { useState } from 'react';
import { useAppStore } from '@/lib/store';
import goffClient from '@/lib/api';

export default function EditFlagPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { config, selectedFlagSet } = useAppStore();
  const [isLoading, setIsLoading] = useState(false);

  // Handle catch-all route - key comes as array of path segments
  const keySegments = params.key as string[];
  const flagKey = keySegments ? keySegments.join('/') : '';

  // Fetch the specific flag from the selected flagset (same as detail page)
  const flagQuery = useQuery({
    queryKey: ['flagset-flag', selectedFlagSet, flagKey],
    queryFn: async () => {
      if (!selectedFlagSet) return null;
      const response = await fetch(`/api/flagsets/${selectedFlagSet}/flags`);
      if (!response.ok) throw new Error('Failed to fetch flags');
      const data = await response.json();
      return data.flags?.[flagKey] as LocalFlagConfig | null;
    },
    enabled: !!selectedFlagSet,
  });

  const flagConfig = flagQuery.data;
  const isLoadingFlag = flagQuery.isLoading;

  const handleSave = async (key: string, newFlagConfig: LocalFlagConfig) => {
    if (!selectedFlagSet) {
      toast.error('Please select a flag set first');
      return;
    }

    setIsLoading(true);
    try {
      // Update the flag in the flagset
      const response = await fetch(
        `/api/flagsets/${selectedFlagSet}/flags/${encodeURIComponent(flagKey)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ config: newFlagConfig, newKey: key !== flagKey ? key : undefined }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update flag');
      }

      // Try to refresh flags on the relay proxy if admin key is configured
      if (config.adminApiKey) {
        try {
          await goffClient.refreshFlags();
        } catch {
          // Ignore refresh errors
        }
      }

      // Invalidate queries to refresh data
      await queryClient.invalidateQueries({ queryKey: ['flagset-flags', selectedFlagSet] });
      await queryClient.invalidateQueries({ queryKey: ['flagset-flag', selectedFlagSet, flagKey] });
      await queryClient.invalidateQueries({ queryKey: ['flags-config'] });

      toast.success(`Flag "${key}" updated successfully`);
      router.push(`/flags/${key}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update flag');
    } finally {
      setIsLoading(false);
    }
  };

  if (!selectedFlagSet) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <Layers className="h-16 w-16 text-yellow-500" />
        <h2 className="text-2xl font-semibold">No Flag Set Selected</h2>
        <p className="text-zinc-600 dark:text-zinc-400">
          Please select a flag set from the sidebar to edit flags
        </p>
        <Button onClick={() => router.push('/flags')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Flags
        </Button>
      </div>
    );
  }

  if (isLoadingFlag) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }

  if (!flagConfig) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <AlertCircle className="h-16 w-16 text-red-500" />
        <h2 className="text-2xl font-semibold">Flag Not Found</h2>
        <p className="text-zinc-600 dark:text-zinc-400">
          The flag &quot;{flagKey}&quot; does not exist in this flag set
        </p>
        <Button onClick={() => router.push('/flags')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Flags
        </Button>
      </div>
    );
  }

  // Convert flag format to LocalFlagConfig
  const initialConfig: LocalFlagConfig = {
    variations: flagConfig.variations,
    defaultRule: flagConfig.defaultRule,
    targeting: flagConfig.targeting,
    disable: flagConfig.disable,
    trackEvents: flagConfig.trackEvents,
    version: flagConfig.version,
    metadata: flagConfig.metadata,
    scheduledRollout: flagConfig.scheduledRollout,
    experimentation: flagConfig.experimentation,
    bucketingKey: flagConfig.bucketingKey,
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/flags/${flagKey}`)}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-2xl font-bold">Edit Flag</h2>
          <p className="text-zinc-600 dark:text-zinc-400">
            {flagKey}
          </p>
        </div>
      </div>

      <FlagEditor
        mode="edit"
        initialKey={flagKey}
        initialConfig={initialConfig}
        onSave={handleSave}
        onCancel={() => router.push(`/flags/${flagKey}`)}
        isLoading={isLoading}
      />
    </div>
  );
}
