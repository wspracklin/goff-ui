'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  Layers,
  Plus,
  Pencil,
  Trash2,
  Key,
  Copy,
  Check,
  AlertCircle,
  Loader2,
  Server,
  ArrowLeft,
  Star,
  RefreshCw,
  Eye,
  EyeOff,
  Globe,
  FileText,
  Database,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogContent,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

interface FlagSetRetriever {
  kind: string;
  path?: string;
  url?: string;
  headers?: Record<string, string>;
  pollingInterval?: number;
  fileFormat?: string;
}

interface FlagSetExporter {
  kind: string;
  endpointUrl?: string;
  flushInterval?: number;
}

interface FlagSetNotifier {
  kind: string;
  slackWebhookUrl?: string;
  endpointUrl?: string;
}

interface FlagSet {
  id: string;
  name: string;
  description?: string;
  apiKeys: string[];
  retriever: FlagSetRetriever;
  exporter?: FlagSetExporter;
  notifier?: FlagSetNotifier;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

type RetrieverKind = 'file' | 'http' | 'git';

const retrieverKindLabels: Record<RetrieverKind, string> = {
  file: 'File',
  http: 'HTTP',
  git: 'Git Repository',
};

const retrieverKindIcons: Record<RetrieverKind, React.ReactNode> = {
  file: <FileText className="h-4 w-4" />,
  http: <Globe className="h-4 w-4" />,
  git: <Database className="h-4 w-4" />,
};

export default function FlagSetsPage() {
  const queryClient = useQueryClient();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingFlagSet, setEditingFlagSet] = useState<FlagSet | null>(null);
  const [deletingFlagSet, setDeletingFlagSet] = useState<FlagSet | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showApiKeys, setShowApiKeys] = useState<Record<string, boolean>>({});

  // Form state
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formRetrieverKind, setFormRetrieverKind] = useState<RetrieverKind>('file');
  const [formRetrieverPath, setFormRetrieverPath] = useState('');
  const [formRetrieverUrl, setFormRetrieverUrl] = useState('');
  const [formPollingInterval, setFormPollingInterval] = useState('30000');
  const [formIsDefault, setFormIsDefault] = useState(false);

  // Fetch flag sets
  const flagSetsQuery = useQuery({
    queryKey: ['flagsets'],
    queryFn: async () => {
      const response = await fetch('/api/flagsets');
      if (!response.ok) throw new Error('Failed to fetch flag sets');
      const data = await response.json();
      return data.flagSets as FlagSet[];
    },
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (flagSet: Partial<FlagSet>) => {
      const response = await fetch('/api/flagsets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(flagSet),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create flag set');
      }
      return response.json();
    },
    onSuccess: () => {
      toast.success('Flag set created');
      queryClient.invalidateQueries({ queryKey: ['flagsets'] });
      setShowCreateDialog(false);
      resetForm();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to create flag set');
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, ...flagSet }: Partial<FlagSet> & { id: string }) => {
      const response = await fetch(`/api/flagsets/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(flagSet),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update flag set');
      }
      return response.json();
    },
    onSuccess: () => {
      toast.success('Flag set updated');
      queryClient.invalidateQueries({ queryKey: ['flagsets'] });
      setEditingFlagSet(null);
      resetForm();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to update flag set');
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/flagsets/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete flag set');
      }
      return response.json();
    },
    onSuccess: async () => {
      toast.success('Flag set deleted');
      await queryClient.invalidateQueries({ queryKey: ['flagsets'], refetchType: 'all' });
      setDeletingFlagSet(null);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to delete flag set');
    },
  });

  // Generate API key mutation
  const generateKeyMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/flagsets/${id}/apikey`, {
        method: 'POST',
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate API key');
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast.success('API key generated');
      queryClient.invalidateQueries({ queryKey: ['flagsets'] });
      // Copy to clipboard
      navigator.clipboard.writeText(data.apiKey);
      setCopiedKey(data.apiKey);
      setTimeout(() => setCopiedKey(null), 3000);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to generate API key');
    },
  });

  // Remove API key mutation
  const removeKeyMutation = useMutation({
    mutationFn: async ({ id, apiKey }: { id: string; apiKey: string }) => {
      const response = await fetch(`/api/flagsets/${id}/apikey`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to remove API key');
      }
      return response.json();
    },
    onSuccess: () => {
      toast.success('API key removed');
      queryClient.invalidateQueries({ queryKey: ['flagsets'] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to remove API key');
    },
  });

  const resetForm = () => {
    setFormName('');
    setFormDescription('');
    setFormRetrieverKind('file');
    setFormRetrieverPath('');
    setFormRetrieverUrl('');
    setFormPollingInterval('30000');
    setFormIsDefault(false);
  };

  const openEditDialog = (flagSet: FlagSet) => {
    setFormName(flagSet.name);
    setFormDescription(flagSet.description || '');
    setFormRetrieverKind((flagSet.retriever.kind as RetrieverKind) || 'file');
    setFormRetrieverPath(flagSet.retriever.path || '');
    setFormRetrieverUrl(flagSet.retriever.url || '');
    setFormPollingInterval(String(flagSet.retriever.pollingInterval || 30000));
    setFormIsDefault(flagSet.isDefault);
    setEditingFlagSet(flagSet);
  };

  const handleSubmit = () => {
    const retriever: FlagSetRetriever = {
      kind: formRetrieverKind,
      pollingInterval: parseInt(formPollingInterval) || 30000,
    };

    if (formRetrieverKind === 'file') {
      retriever.path = formRetrieverPath;
    } else if (formRetrieverKind === 'http') {
      retriever.url = formRetrieverUrl;
    }

    const flagSet: Partial<FlagSet> = {
      name: formName,
      description: formDescription || undefined,
      retriever,
      isDefault: formIsDefault,
    };

    if (editingFlagSet) {
      updateMutation.mutate({ id: editingFlagSet.id, ...flagSet, apiKeys: editingFlagSet.apiKeys });
    } else {
      createMutation.mutate(flagSet);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(text);
    setTimeout(() => setCopiedKey(null), 2000);
    toast.success('Copied to clipboard');
  };

  const toggleShowApiKeys = (id: string) => {
    setShowApiKeys((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const isLoading = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-4">
        <Link href="/settings">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h2 className="text-2xl font-bold">Flag Sets</h2>
          <p className="text-zinc-600 dark:text-zinc-400">
            Organize feature flags into separate groups with independent configurations
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Flag Set
        </Button>
      </div>

      {/* Info Card */}
      <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800 dark:text-blue-200">
              <p className="font-medium mb-1">About Flag Sets</p>
              <p>
                Flag sets allow you to organize flags by team, environment, or tenant. Each set has
                its own API keys, retriever configuration, and can have separate exporters and notifiers.
                When flag sets are enabled, the relay proxy routes requests based on API keys.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Flag Sets List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5" />
            Configured Flag Sets
          </CardTitle>
          <CardDescription>
            {flagSetsQuery.data?.length || 0} flag set(s) configured
          </CardDescription>
        </CardHeader>
        <CardContent>
          {flagSetsQuery.isLoading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : flagSetsQuery.data && flagSetsQuery.data.length > 0 ? (
            <div className="space-y-4">
              {flagSetsQuery.data.map((flagSet) => (
                <div
                  key={flagSet.id}
                  className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-lg">{flagSet.name}</h3>
                      {flagSet.isDefault && (
                        <Badge variant="success" className="text-xs">
                          <Star className="h-3 w-3 mr-1" />
                          Default
                        </Badge>
                      )}
                      <Badge variant="secondary" className="text-xs">
                        {retrieverKindIcons[flagSet.retriever.kind as RetrieverKind]}
                        <span className="ml-1">{retrieverKindLabels[flagSet.retriever.kind as RetrieverKind] || flagSet.retriever.kind}</span>
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditDialog(flagSet)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeletingFlagSet(flagSet)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {flagSet.description && (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-3">
                      {flagSet.description}
                    </p>
                  )}

                  {/* Retriever Info */}
                  <div className="text-sm text-zinc-500 mb-3">
                    {flagSet.retriever.kind === 'file' && flagSet.retriever.path && (
                      <span>Path: <code className="bg-zinc-100 dark:bg-zinc-800 px-1 rounded">{flagSet.retriever.path}</code></span>
                    )}
                    {flagSet.retriever.kind === 'http' && flagSet.retriever.url && (
                      <span>URL: <code className="bg-zinc-100 dark:bg-zinc-800 px-1 rounded">{flagSet.retriever.url}</code></span>
                    )}
                    {flagSet.retriever.pollingInterval && (
                      <span className="ml-3">Polling: {flagSet.retriever.pollingInterval}ms</span>
                    )}
                  </div>

                  {/* API Keys */}
                  <div className="border-t border-zinc-200 dark:border-zinc-700 pt-3 mt-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Key className="h-4 w-4 text-zinc-400" />
                        <span className="text-sm font-medium">API Keys ({flagSet.apiKeys.length})</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleShowApiKeys(flagSet.id)}
                        >
                          {showApiKeys[flagSet.id] ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => generateKeyMutation.mutate(flagSet.id)}
                          disabled={generateKeyMutation.isPending}
                        >
                          {generateKeyMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Plus className="h-4 w-4" />
                          )}
                          <span className="ml-1">Generate Key</span>
                        </Button>
                      </div>
                    </div>
                    {showApiKeys[flagSet.id] && (
                      <div className="space-y-2">
                        {flagSet.apiKeys.map((key, idx) => (
                          <div
                            key={idx}
                            className="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-800 rounded px-3 py-2"
                          >
                            <code className="flex-1 text-xs font-mono truncate">{key}</code>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => copyToClipboard(key)}
                            >
                              {copiedKey === key ? (
                                <Check className="h-4 w-4 text-green-500" />
                              ) : (
                                <Copy className="h-4 w-4" />
                              )}
                            </Button>
                            {flagSet.apiKeys.length > 1 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => removeKeyMutation.mutate({ id: flagSet.id, apiKey: key })}
                                className="text-red-600 hover:text-red-700"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Timestamps */}
                  <div className="text-xs text-zinc-400 mt-3">
                    Created: {new Date(flagSet.createdAt).toLocaleDateString()}
                    {flagSet.updatedAt !== flagSet.createdAt && (
                      <span className="ml-3">Updated: {new Date(flagSet.updatedAt).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Layers className="mx-auto h-12 w-12 text-zinc-300 dark:text-zinc-700" />
              <h3 className="mt-4 text-lg font-medium">No flag sets configured</h3>
              <p className="mt-2 text-sm text-zinc-500">
                Create a flag set to organize your feature flags
              </p>
              <Button className="mt-4" onClick={() => setShowCreateDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create First Flag Set
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={showCreateDialog || !!editingFlagSet} onOpenChange={(open) => {
        if (!open) {
          setShowCreateDialog(false);
          setEditingFlagSet(null);
          resetForm();
        }
      }}>
        <DialogHeader>
          <DialogTitle>{editingFlagSet ? 'Edit Flag Set' : 'Create Flag Set'}</DialogTitle>
          <DialogDescription>
            {editingFlagSet
              ? 'Update the flag set configuration'
              : 'Create a new flag set to organize related feature flags'}
          </DialogDescription>
        </DialogHeader>
        <DialogContent>
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g., frontend-team, production"
              />
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="What is this flag set for?"
                rows={2}
              />
            </div>

            <div>
              <Label>Retriever Type</Label>
              <div className="grid grid-cols-3 gap-2 mt-2">
                {(['file', 'http'] as RetrieverKind[]).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => setFormRetrieverKind(kind)}
                    className={`flex items-center gap-2 p-3 rounded-lg border-2 transition-all ${
                      formRetrieverKind === kind
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
                        : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300'
                    }`}
                  >
                    {retrieverKindIcons[kind]}
                    <span className="text-sm font-medium">{retrieverKindLabels[kind]}</span>
                  </button>
                ))}
              </div>
            </div>

            {formRetrieverKind === 'file' && (
              <div>
                <Label htmlFor="path">File Path</Label>
                <Input
                  id="path"
                  value={formRetrieverPath}
                  onChange={(e) => setFormRetrieverPath(e.target.value)}
                  placeholder="/path/to/flags.yaml"
                />
                <p className="mt-1 text-xs text-zinc-500">
                  Path will be auto-generated if left empty
                </p>
              </div>
            )}

            {formRetrieverKind === 'http' && (
              <div>
                <Label htmlFor="url">HTTP URL *</Label>
                <Input
                  id="url"
                  value={formRetrieverUrl}
                  onChange={(e) => setFormRetrieverUrl(e.target.value)}
                  placeholder="https://api.example.com/flags"
                />
              </div>
            )}

            <div>
              <Label htmlFor="polling">Polling Interval (ms)</Label>
              <Input
                id="polling"
                type="number"
                value={formPollingInterval}
                onChange={(e) => setFormPollingInterval(e.target.value)}
                placeholder="30000"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isDefault"
                checked={formIsDefault}
                onChange={(e) => setFormIsDefault(e.target.checked)}
                className="rounded"
              />
              <Label htmlFor="isDefault" className="cursor-pointer">
                Set as default flag set
              </Label>
            </div>
          </div>
        </DialogContent>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setShowCreateDialog(false);
              setEditingFlagSet(null);
              resetForm();
            }}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isLoading || !formName.trim()}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {editingFlagSet ? 'Updating...' : 'Creating...'}
              </>
            ) : (
              editingFlagSet ? 'Update Flag Set' : 'Create Flag Set'
            )}
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deletingFlagSet} onOpenChange={(open) => !open && setDeletingFlagSet(null)}>
        <DialogHeader>
          <DialogTitle>Delete Flag Set</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete &quot;{deletingFlagSet?.name}&quot;?
          </DialogDescription>
        </DialogHeader>
        <DialogContent>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            This will remove the flag set configuration. The flags file associated with this
            set will not be deleted, but the set will no longer be accessible via its API keys.
          </p>
        </DialogContent>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setDeletingFlagSet(null)}
            disabled={deleteMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => deletingFlagSet && deleteMutation.mutate(deletingFlagSet.id)}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Deleting...
              </>
            ) : (
              'Delete Flag Set'
            )}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
