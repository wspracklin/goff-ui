'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, AlertCircle, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { FlagEditor } from '@/components/flag-editor';
import { LocalFlagConfig, localFlagAPI } from '@/lib/local-api';
import { toast } from 'sonner';
import { useState } from 'react';
import { useAppStore } from '@/lib/store';
import goffClient from '@/lib/api';

export default function EditFlagPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { selectedProject, isConnected, isDevMode, config } = useAppStore();
  const [isLoading, setIsLoading] = useState(false);

  // Handle catch-all route - key comes as array of path segments
  const keySegments = params.key as string[];
  const flagKey = keySegments ? keySegments.join('/') : '';

  // In dev mode, fetch from local flags file; otherwise from relay proxy
  const localFlagQuery = useQuery({
    queryKey: ['local-flag', flagKey],
    queryFn: () => localFlagAPI.getFlag(flagKey),
    enabled: isDevMode,
  });

  const flagQuery = useQuery({
    queryKey: ['flags-config'],
    queryFn: () => goffClient.getFlagConfiguration(),
    enabled: isConnected && !isDevMode,
  });

  // Use local flag data in dev mode, otherwise use relay proxy data
  const flagConfig = isDevMode
    ? localFlagQuery.data?.config
    : flagQuery.data?.flags?.[flagKey];

  const isLoadingFlag = isDevMode ? localFlagQuery.isLoading : flagQuery.isLoading;

  const handleSave = async (key: string, newFlagConfig: LocalFlagConfig) => {
    // In dev mode, use local API
    if (isDevMode) {
      setIsLoading(true);
      try {
        await localFlagAPI.updateFlag(flagKey, newFlagConfig, key !== flagKey ? key : undefined);

        // Try to refresh flags on the relay proxy if admin key is configured
        if (config.adminApiKey) {
          try {
            await goffClient.refreshFlags();
          } catch {
            // Ignore refresh errors
          }
        }

        await queryClient.invalidateQueries({ queryKey: ['flags-config'] });
        await queryClient.invalidateQueries({ queryKey: ['local-flags'] });
        await queryClient.invalidateQueries({ queryKey: ['local-flag', flagKey] });

        toast.success(`Flag "${key}" updated successfully`);
        router.push(`/flags/${key}`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to update flag');
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // In production mode, use PR workflow
    if (!selectedProject) {
      toast.error('Please select a project first');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(selectedProject)}/flags/propose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update',
          flagKey,
          flagConfig: newFlagConfig,
          newFlagKey: key !== flagKey ? key : undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create PR');
      }

      // Invalidate queries to refresh data
      await queryClient.invalidateQueries({ queryKey: ['flags-config'] });
      await queryClient.invalidateQueries({ queryKey: ['projects'] });

      toast.success(
        <div className="flex items-center gap-2">
          <span>Pull request created!</span>
          <a
            href={data.pullRequest.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-blue-600 hover:underline"
          >
            View PR <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      );
      router.push(`/flags/${key}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update flag');
    } finally {
      setIsLoading(false);
    }
  };

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
          The flag &quot;{flagKey}&quot; does not exist
        </p>
        <Button onClick={() => router.push('/flags')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Flags
        </Button>
      </div>
    );
  }

  // Convert relay proxy flag format to LocalFlagConfig
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

  const showProjectWarning = !isDevMode && !selectedProject;

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
            {!isDevMode && selectedProject && <span className="ml-2 text-xs">({selectedProject})</span>}
            {isDevMode && <span className="ml-2 text-xs">(local development)</span>}
          </p>
        </div>
      </div>

      {showProjectWarning ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950">
          <p className="text-amber-800 dark:text-amber-200">
            Please select a project from the sidebar before editing a flag.
          </p>
        </div>
      ) : (
        <FlagEditor
          mode="edit"
          initialKey={flagKey}
          initialConfig={initialConfig}
          onSave={handleSave}
          onCancel={() => router.push(`/flags/${flagKey}`)}
          isLoading={isLoading}
          usePrWorkflow={!isDevMode}
        />
      )}
    </div>
  );
}
