'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Key,
  Plus,
  Trash2,
  Copy,
  Loader2,
  AlertCircle,
  ArrowLeft,
  Clock,
  Shield,
} from 'lucide-react';
import Link from 'next/link';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

interface APIKey {
  id: string;
  name: string;
  keyPrefix: string;
  permissions: string[];
  createdAt: string;
  expiresAt?: string;
  lastUsedAt?: string;
}

interface CreateAPIKeyResponse {
  id: string;
  name: string;
  key: string;
  keyPrefix: string;
  permissions: string[];
}

export default function APIKeysPage() {
  const queryClient = useQueryClient();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showKeyDialog, setShowKeyDialog] = useState(false);
  const [newKeyData, setNewKeyData] = useState<CreateAPIKeyResponse | null>(null);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyPermissions, setNewKeyPermissions] = useState<string[]>(['read']);
  const [newKeyExpiry, setNewKeyExpiry] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const apiKeysQuery = useQuery({
    queryKey: ['api-keys'],
    queryFn: async () => {
      const res = await fetch('/api/api-keys');
      if (!res.ok) throw new Error('Failed to fetch API keys');
      const data = await res.json();
      return (data.apiKeys || []) as APIKey[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; permissions: string[]; expiresIn?: string }) => {
      const res = await fetch('/api/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: 'Failed to create API key' }));
        throw new Error(error.error || 'Failed to create API key');
      }
      return res.json() as Promise<CreateAPIKeyResponse>;
    },
    onSuccess: (data) => {
      setNewKeyData(data);
      setShowCreateDialog(false);
      setShowKeyDialog(true);
      setNewKeyName('');
      setNewKeyPermissions(['read']);
      setNewKeyExpiry('');
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to create API key');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/api-keys/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete API key');
    },
    onSuccess: () => {
      toast.success('API key deleted');
      setDeleteConfirmId(null);
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to delete API key');
    },
  });

  const handleCreate = () => {
    if (!newKeyName.trim()) {
      toast.error('Name is required');
      return;
    }
    createMutation.mutate({
      name: newKeyName.trim(),
      permissions: newKeyPermissions,
      expiresIn: newKeyExpiry || undefined,
    });
  };

  const togglePermission = (perm: string) => {
    setNewKeyPermissions((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]
    );
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-4">
        <Link href="/settings">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Settings
          </Button>
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">API Keys</h2>
          <p className="text-zinc-600 dark:text-zinc-400">
            Manage API keys for programmatic access to the Flag Manager API
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Key
        </Button>
      </div>

      {/* Info Card */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <Shield className="h-5 w-5 text-blue-500 mt-0.5" />
            <div className="text-sm text-zinc-600 dark:text-zinc-400">
              <p>
                API keys allow automation tools, CI/CD pipelines, and scripts to interact
                with the Flag Manager API. Keys are shown only once at creation time.
              </p>
              <p className="mt-1">
                Use the <code className="text-xs bg-zinc-100 dark:bg-zinc-800 px-1 rounded">X-API-Key</code> header
                to authenticate requests.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* API Keys List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Active Keys
          </CardTitle>
          <CardDescription>
            {apiKeysQuery.data?.length || 0} API key{(apiKeysQuery.data?.length || 0) !== 1 ? 's' : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {apiKeysQuery.isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
            </div>
          ) : apiKeysQuery.error ? (
            <div className="flex items-center gap-2 text-red-500 py-4">
              <AlertCircle className="h-5 w-5" />
              <span>Failed to load API keys</span>
            </div>
          ) : apiKeysQuery.data && apiKeysQuery.data.length > 0 ? (
            <div className="space-y-3">
              {apiKeysQuery.data.map((apiKey) => (
                <div
                  key={apiKey.id}
                  className="flex items-center justify-between rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{apiKey.name}</span>
                      <code className="text-xs bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded">
                        {apiKey.keyPrefix}...
                      </code>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-zinc-500">
                      <span>Created {formatDate(apiKey.createdAt)}</span>
                      {apiKey.lastUsedAt && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Last used {formatDate(apiKey.lastUsedAt)}
                        </span>
                      )}
                      {apiKey.expiresAt && (
                        <span className="text-amber-600">
                          Expires {formatDate(apiKey.expiresAt)}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-1 mt-1">
                      {apiKey.permissions.map((perm) => (
                        <Badge key={perm} variant="secondary" className="text-xs">
                          {perm}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div>
                    {deleteConfirmId === apiKey.id ? (
                      <div className="flex items-center gap-2">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => deleteMutation.mutate(apiKey.id)}
                          disabled={deleteMutation.isPending}
                        >
                          {deleteMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            'Confirm'
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDeleteConfirmId(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteConfirmId(apiKey.id)}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Key className="mx-auto h-12 w-12 text-zinc-300 dark:text-zinc-700" />
              <p className="mt-4 text-zinc-500">No API keys yet</p>
              <p className="mt-1 text-sm text-zinc-400">
                Create an API key to enable programmatic access
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create API Key</DialogTitle>
            <DialogDescription>
              Create a new API key for programmatic access. The key will only be shown once.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="keyName">Name</Label>
              <Input
                id="keyName"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="e.g., CI/CD Pipeline"
              />
            </div>
            <div>
              <Label>Permissions</Label>
              <div className="flex gap-2 mt-2">
                {['read', 'write', 'admin'].map((perm) => (
                  <Button
                    key={perm}
                    variant={newKeyPermissions.includes(perm) ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => togglePermission(perm)}
                  >
                    {perm}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <Label htmlFor="keyExpiry">Expiry (optional)</Label>
              <select
                id="keyExpiry"
                value={newKeyExpiry}
                onChange={(e) => setNewKeyExpiry(e.target.value)}
                className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
              >
                <option value="">Never expires</option>
                <option value="24h">24 hours</option>
                <option value="168h">7 days</option>
                <option value="720h">30 days</option>
                <option value="2160h">90 days</option>
                <option value="8760h">1 year</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Show Key Dialog */}
      <Dialog open={showKeyDialog} onOpenChange={setShowKeyDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>API Key Created</DialogTitle>
            <DialogDescription>
              Copy your API key now. It will not be shown again.
            </DialogDescription>
          </DialogHeader>
          {newKeyData && (
            <div className="space-y-4 py-4">
              <div>
                <Label>Name</Label>
                <p className="text-sm font-medium">{newKeyData.name}</p>
              </div>
              <div>
                <Label>API Key</Label>
                <div className="flex items-center gap-2 mt-1">
                  <code className="flex-1 rounded-md bg-zinc-100 dark:bg-zinc-800 p-3 text-sm font-mono break-all">
                    {newKeyData.key}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(newKeyData.key)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="rounded-lg bg-amber-50 dark:bg-amber-950 p-3 text-sm text-amber-700 dark:text-amber-300">
                <AlertCircle className="h-4 w-4 inline mr-2" />
                Make sure to copy your API key now. You won&apos;t be able to see it again.
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setShowKeyDialog(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
