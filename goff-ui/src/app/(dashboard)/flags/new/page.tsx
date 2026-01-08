'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FlagEditor } from '@/components/flag-editor';
import { LocalFlagConfig, localFlagAPI } from '@/lib/local-api';
import { toast } from 'sonner';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '@/lib/store';
import goffClient from '@/lib/api';

export default function NewFlagPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { selectedProject, isDevMode, config, selectedFlagSet } = useAppStore();
  const [isLoading, setIsLoading] = useState(false);

  const handleSave = async (key: string, flagConfig: LocalFlagConfig) => {
    setIsLoading(true);

    try {
      // If a flagset is selected, create flag in that flagset
      if (selectedFlagSet) {
        const response = await fetch(`/api/flagsets/${selectedFlagSet}/flags/${encodeURIComponent(key)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(flagConfig),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to create flag');
        }

        // Try to refresh flags on the relay proxy if admin key is configured
        if (config.adminApiKey) {
          try {
            await goffClient.refreshFlags();
          } catch {
            // Ignore refresh errors
          }
        }

        await queryClient.invalidateQueries({ queryKey: ['flagset-flags', selectedFlagSet] });
        toast.success(`Flag "${key}" created successfully`);
        router.push('/flags');
        return;
      }

      // No flagset selected - use local API in dev mode
      if (isDevMode) {
        await localFlagAPI.createFlag(key, flagConfig);

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

        toast.success(`Flag "${key}" created successfully`);
        router.push('/flags');
        return;
      }

      // In production mode without flagset, use PR workflow
      if (!selectedProject) {
        toast.error('Please select a project first');
        return;
      }

      const response = await fetch(`/api/projects/${encodeURIComponent(selectedProject)}/flags/propose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          flagKey: key,
          flagConfig,
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
      router.push('/flags');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create flag');
    } finally {
      setIsLoading(false);
    }
  };

  const showProjectWarning = !isDevMode && !selectedProject && !selectedFlagSet;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.push('/flags')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-2xl font-bold">Create New Flag</h2>
          <p className="text-zinc-600 dark:text-zinc-400">
            {isDevMode ? (
              'Define a new feature flag (local development)'
            ) : selectedProject ? (
              <>Define a new feature flag for <strong>{selectedProject}</strong></>
            ) : (
              'Select a project first to create a flag'
            )}
          </p>
        </div>
      </div>

      {showProjectWarning ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950">
          <p className="text-amber-800 dark:text-amber-200">
            Please select a project from the sidebar before creating a flag.
          </p>
        </div>
      ) : (
        <FlagEditor
          mode="create"
          onSave={handleSave}
          onCancel={() => router.push('/flags')}
          isLoading={isLoading}
          usePrWorkflow={!isDevMode}
        />
      )}
    </div>
  );
}
