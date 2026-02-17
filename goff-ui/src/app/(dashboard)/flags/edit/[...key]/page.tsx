'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, AlertCircle, Layers, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Spinner } from '@/components/ui/spinner';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogContent,
  DialogFooter,
} from '@/components/ui/dialog';
import { FlagEditor } from '@/components/flag-editor';
import { LocalFlagConfig } from '@/lib/local-api';
import { toast } from 'sonner';
import { useState } from 'react';
import { useAppStore } from '@/lib/store';
import goffClient from '@/lib/api';
import Link from 'next/link';

export default function EditFlagPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { config, selectedFlagSet } = useAppStore();
  const [isLoading, setIsLoading] = useState(false);
  const [showChangeNoteDialog, setShowChangeNoteDialog] = useState(false);
  const [changeNote, setChangeNote] = useState('');
  const [pendingSave, setPendingSave] = useState<{ key: string; config: LocalFlagConfig } | null>(null);

  // Handle catch-all route - key comes as array of path segments
  const keySegments = params.key as string[];
  const flagKey = keySegments ? keySegments.join('/') : '';

  // Fetch app config to check if approvals/change notes are required
  const appConfigQuery = useQuery({
    queryKey: ['app-config'],
    queryFn: async () => {
      const res = await fetch('/api/config');
      if (!res.ok) return { requireApprovals: false, requireChangeNotes: false };
      return res.json() as Promise<{ requireApprovals?: boolean; requireChangeNotes?: boolean }>;
    },
    staleTime: 60000,
  });

  const requireApprovals = appConfigQuery.data?.requireApprovals ?? false;
  const requireChangeNotes = appConfigQuery.data?.requireChangeNotes ?? false;

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

    // If change notes required or approvals, show dialog first
    if (requireChangeNotes || requireApprovals) {
      setPendingSave({ key, config: newFlagConfig });
      setShowChangeNoteDialog(true);
      return;
    }

    await executeSave(key, newFlagConfig, '');
  };

  const executeSave = async (key: string, newFlagConfig: LocalFlagConfig, note: string) => {
    setIsLoading(true);
    try {
      // Update the flag in the flagset
      const response = await fetch(
        `/api/flagsets/${selectedFlagSet}/flags/${encodeURIComponent(flagKey)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            config: newFlagConfig,
            newKey: key !== flagKey ? key : undefined,
            ...(note && { changeNote: note }),
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update flag');
      }

      const result = await response.json();

      // Check if the update created a change request instead of direct-saving
      if (result.requiresApproval && result.changeRequestId) {
        toast.success(
          <div>
            Change request created.{' '}
            <Link href="/change-requests" className="underline font-medium">
              View change requests
            </Link>
          </div>
        );
        router.push('/change-requests');
        return;
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
      setShowChangeNoteDialog(false);
      setPendingSave(null);
      setChangeNote('');
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

      {/* Change Note Dialog */}
      <Dialog open={showChangeNoteDialog} onOpenChange={(open) => {
        if (!open) {
          setShowChangeNoteDialog(false);
          setPendingSave(null);
          setChangeNote('');
        }
      }}>
        <DialogHeader>
          <DialogTitle>
            {requireApprovals ? 'Submit for Review' : 'Save Changes'}
          </DialogTitle>
          <DialogDescription>
            {requireApprovals
              ? 'This change will create a review request before being applied.'
              : 'Add a note describing what changed and why.'}
          </DialogDescription>
        </DialogHeader>
        <DialogContent>
          <div>
            <Label htmlFor="changeNote">
              Change Note {requireChangeNotes && <span className="text-red-500">(required)</span>}
            </Label>
            <Textarea
              id="changeNote"
              value={changeNote}
              onChange={(e) => setChangeNote(e.target.value)}
              placeholder="Describe what changed and why..."
              rows={3}
            />
          </div>
        </DialogContent>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setShowChangeNoteDialog(false);
              setPendingSave(null);
              setChangeNote('');
            }}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (requireChangeNotes && !changeNote.trim()) {
                toast.error('Change note is required');
                return;
              }
              if (pendingSave) {
                executeSave(pendingSave.key, pendingSave.config, changeNote.trim());
              }
            }}
            disabled={isLoading}
          >
            {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {requireApprovals ? 'Submit for Review' : 'Save'}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
