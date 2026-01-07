'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Loader2,
  AlertCircle,
  Send,
  MessageSquare,
  Webhook,
  FileText,
} from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { toast } from 'sonner';

interface Notifier {
  id: string;
  name: string;
  kind: 'slack' | 'discord' | 'microsoftteams' | 'webhook' | 'log';
  description?: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  webhookUrl?: string;
  endpointUrl?: string;
  secret?: string;
  headers?: Record<string, string>;
  meta?: Record<string, string>;
  logFormat?: 'json' | 'text';
}

type NotifierKind = Notifier['kind'];
type FormMode = 'create' | 'edit' | null;

const notifierKinds: { value: NotifierKind; label: string; icon: React.ReactNode; color: string }[] = [
  { value: 'slack', label: 'Slack', icon: <MessageSquare className="h-4 w-4" />, color: 'text-purple-500' },
  { value: 'discord', label: 'Discord', icon: <MessageSquare className="h-4 w-4" />, color: 'text-indigo-500' },
  { value: 'microsoftteams', label: 'Teams', icon: <MessageSquare className="h-4 w-4" />, color: 'text-blue-500' },
  { value: 'webhook', label: 'Webhook', icon: <Webhook className="h-4 w-4" />, color: 'text-orange-500' },
  { value: 'log', label: 'Log', icon: <FileText className="h-4 w-4" />, color: 'text-zinc-500' },
];

export default function NotifiersSettingsPage() {
  const queryClient = useQueryClient();

  const [formMode, setFormMode] = useState<FormMode>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState<Partial<Notifier>>({
    kind: 'slack',
    enabled: true,
    logFormat: 'json',
  });
  const [headerEntries, setHeaderEntries] = useState<{ key: string; value: string }[]>([]);
  const [metaEntries, setMetaEntries] = useState<{ key: string; value: string }[]>([]);

  // Query notifiers
  const notifiersQuery = useQuery({
    queryKey: ['notifiers'],
    queryFn: async () => {
      const response = await fetch('/api/notifiers');
      if (!response.ok) throw new Error('Failed to fetch notifiers');
      const data = await response.json();
      return data.notifiers as Notifier[];
    },
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: Partial<Notifier>) => {
      const response = await fetch('/api/notifiers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create notifier');
      }
      return response.json();
    },
    onSuccess: () => {
      toast.success('Notifier created');
      queryClient.invalidateQueries({ queryKey: ['notifiers'] });
      resetForm();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to create notifier');
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Notifier> }) => {
      const response = await fetch(`/api/notifiers/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update notifier');
      }
      return response.json();
    },
    onSuccess: () => {
      toast.success('Notifier updated');
      queryClient.invalidateQueries({ queryKey: ['notifiers'] });
      resetForm();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to update notifier');
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/notifiers/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete notifier');
      }
      return response.json();
    },
    onSuccess: () => {
      toast.success('Notifier deleted');
      queryClient.invalidateQueries({ queryKey: ['notifiers'] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to delete notifier');
    },
  });

  // Test mutation
  const testMutation = useMutation({
    mutationFn: async (id: string) => {
      setTestingId(id);
      const response = await fetch(`/api/notifiers/${id}/test`, {
        method: 'POST',
      });
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Test failed');
      }
      return data;
    },
    onSuccess: () => {
      toast.success('Test notification sent successfully!');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Test failed');
    },
    onSettled: () => {
      setTestingId(null);
    },
  });

  const resetForm = () => {
    setFormMode(null);
    setEditingId(null);
    setFormData({
      kind: 'slack',
      enabled: true,
      logFormat: 'json',
    });
    setHeaderEntries([]);
    setMetaEntries([]);
  };

  const startEdit = (notifier: Notifier) => {
    setFormMode('edit');
    setEditingId(notifier.id);
    setFormData({ ...notifier });
    setHeaderEntries(
      notifier.headers
        ? Object.entries(notifier.headers).map(([key, value]) => ({ key, value }))
        : []
    );
    setMetaEntries(
      notifier.meta
        ? Object.entries(notifier.meta).map(([key, value]) => ({ key, value }))
        : []
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name?.trim()) {
      toast.error('Name is required');
      return;
    }

    // Validate based on kind
    if (['slack', 'discord', 'microsoftteams'].includes(formData.kind || '')) {
      if (!formData.webhookUrl?.trim()) {
        toast.error('Webhook URL is required');
        return;
      }
    }

    if (formData.kind === 'webhook' && !formData.endpointUrl?.trim()) {
      toast.error('Endpoint URL is required');
      return;
    }

    // Convert header/meta entries to objects
    const headers: Record<string, string> = {};
    headerEntries.forEach(({ key, value }) => {
      if (key.trim()) headers[key.trim()] = value;
    });

    const meta: Record<string, string> = {};
    metaEntries.forEach(({ key, value }) => {
      if (key.trim()) meta[key.trim()] = value;
    });

    const submitData: Partial<Notifier> = {
      ...formData,
      id: formData.id || formData.name?.toLowerCase().replace(/\s+/g, '-'),
      headers: Object.keys(headers).length > 0 ? headers : undefined,
      meta: Object.keys(meta).length > 0 ? meta : undefined,
    };

    if (formMode === 'create') {
      createMutation.mutate(submitData);
    } else if (formMode === 'edit' && editingId) {
      updateMutation.mutate({ id: editingId, data: submitData });
    }
  };

  const updateField = (field: keyof Notifier, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  const getKindInfo = (kind: NotifierKind) => {
    return notifierKinds.find((k) => k.value === kind) || notifierKinds[0];
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Notifiers</h2>
          <p className="text-zinc-600 dark:text-zinc-400">
            Configure notifications for flag configuration changes
          </p>
        </div>
        {!formMode && (
          <Button onClick={() => setFormMode('create')}>
            <Plus className="h-4 w-4 mr-2" />
            Add Notifier
          </Button>
        )}
      </div>

      {/* Form Card */}
      {formMode && (
        <Card>
          <CardHeader>
            <CardTitle>
              {formMode === 'create' ? 'New Notifier' : 'Edit Notifier'}
            </CardTitle>
            <CardDescription>
              Configure a notification channel for flag changes
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    value={formData.name || ''}
                    onChange={(e) => updateField('name', e.target.value)}
                    placeholder="My Slack Notifier"
                  />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.enabled ?? true}
                      onChange={(e) => updateField('enabled', e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-sm">Enabled</span>
                  </label>
                </div>
              </div>

              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description || ''}
                  onChange={(e) => updateField('description', e.target.value)}
                  placeholder="Optional description"
                  rows={2}
                />
              </div>

              {/* Kind Selection */}
              <div>
                <Label>Notification Type *</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {notifierKinds.map((kind) => (
                    <Button
                      key={kind.value}
                      type="button"
                      variant={formData.kind === kind.value ? 'default' : 'outline'}
                      onClick={() => updateField('kind', kind.value)}
                      className="flex items-center gap-2"
                    >
                      <span className={kind.color}>{kind.icon}</span>
                      {kind.label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Slack/Discord/Teams Configuration */}
              {['slack', 'discord', 'microsoftteams'].includes(formData.kind || '') && (
                <div className="space-y-4 p-4 border rounded-lg bg-zinc-50 dark:bg-zinc-900">
                  <h4 className="font-medium flex items-center gap-2">
                    {getKindInfo(formData.kind as NotifierKind).icon}
                    {getKindInfo(formData.kind as NotifierKind).label} Configuration
                  </h4>
                  <div>
                    <Label htmlFor="webhookUrl">Webhook URL *</Label>
                    <Input
                      id="webhookUrl"
                      type="url"
                      value={formData.webhookUrl || ''}
                      onChange={(e) => updateField('webhookUrl', e.target.value)}
                      placeholder={
                        formData.kind === 'slack'
                          ? 'https://hooks.slack.com/services/...'
                          : formData.kind === 'discord'
                            ? 'https://discord.com/api/webhooks/...'
                            : 'https://outlook.office.com/webhook/...'
                      }
                    />
                    <p className="mt-1 text-xs text-zinc-500">
                      {formData.kind === 'slack' && 'Create an incoming webhook in Slack and paste the URL here'}
                      {formData.kind === 'discord' && 'Create a webhook in Discord channel settings'}
                      {formData.kind === 'microsoftteams' && 'Create an incoming webhook connector in Teams'}
                    </p>
                  </div>
                </div>
              )}

              {/* Webhook Configuration */}
              {formData.kind === 'webhook' && (
                <div className="space-y-4 p-4 border rounded-lg bg-zinc-50 dark:bg-zinc-900">
                  <h4 className="font-medium flex items-center gap-2">
                    <Webhook className="h-4 w-4 text-orange-500" />
                    Webhook Configuration
                  </h4>

                  <div>
                    <Label htmlFor="endpointUrl">Endpoint URL *</Label>
                    <Input
                      id="endpointUrl"
                      type="url"
                      value={formData.endpointUrl || ''}
                      onChange={(e) => updateField('endpointUrl', e.target.value)}
                      placeholder="https://example.com/webhook"
                    />
                  </div>

                  <div>
                    <Label htmlFor="secret">Secret (for HMAC signature)</Label>
                    <Input
                      id="secret"
                      type="password"
                      value={formData.secret || ''}
                      onChange={(e) => updateField('secret', e.target.value)}
                      placeholder="Optional secret for X-Hub-Signature-256"
                    />
                    <p className="mt-1 text-xs text-zinc-500">
                      If set, requests will include X-Hub-Signature-256 header for verification
                    </p>
                  </div>

                  {/* Headers */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label>Custom Headers</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setHeaderEntries([...headerEntries, { key: '', value: '' }])}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add Header
                      </Button>
                    </div>
                    {headerEntries.length === 0 ? (
                      <p className="text-sm text-zinc-400">No custom headers</p>
                    ) : (
                      <div className="space-y-2">
                        {headerEntries.map((entry, index) => (
                          <div key={index} className="flex items-center gap-2">
                            <Input
                              value={entry.key}
                              onChange={(e) => {
                                const updated = [...headerEntries];
                                updated[index] = { ...entry, key: e.target.value };
                                setHeaderEntries(updated);
                              }}
                              placeholder="Header name"
                              className="w-40"
                            />
                            <Input
                              value={entry.value}
                              onChange={(e) => {
                                const updated = [...headerEntries];
                                updated[index] = { ...entry, value: e.target.value };
                                setHeaderEntries(updated);
                              }}
                              placeholder="Header value"
                              className="flex-1"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setHeaderEntries(headerEntries.filter((_, i) => i !== index));
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Metadata */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label>Metadata</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setMetaEntries([...metaEntries, { key: '', value: '' }])}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add Meta
                      </Button>
                    </div>
                    <p className="text-xs text-zinc-500 mb-2">
                      Custom key-value pairs included in webhook payload
                    </p>
                    {metaEntries.length === 0 ? (
                      <p className="text-sm text-zinc-400">No metadata</p>
                    ) : (
                      <div className="space-y-2">
                        {metaEntries.map((entry, index) => (
                          <div key={index} className="flex items-center gap-2">
                            <Input
                              value={entry.key}
                              onChange={(e) => {
                                const updated = [...metaEntries];
                                updated[index] = { ...entry, key: e.target.value };
                                setMetaEntries(updated);
                              }}
                              placeholder="Key"
                              className="w-40"
                            />
                            <Input
                              value={entry.value}
                              onChange={(e) => {
                                const updated = [...metaEntries];
                                updated[index] = { ...entry, value: e.target.value };
                                setMetaEntries(updated);
                              }}
                              placeholder="Value"
                              className="flex-1"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setMetaEntries(metaEntries.filter((_, i) => i !== index));
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Log Configuration */}
              {formData.kind === 'log' && (
                <div className="space-y-4 p-4 border rounded-lg bg-zinc-50 dark:bg-zinc-900">
                  <h4 className="font-medium flex items-center gap-2">
                    <FileText className="h-4 w-4 text-zinc-500" />
                    Log Configuration
                  </h4>
                  <div>
                    <Label>Log Format</Label>
                    <div className="flex gap-4 mt-2">
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          checked={formData.logFormat === 'json'}
                          onChange={() => updateField('logFormat', 'json')}
                        />
                        <span className="text-sm">JSON</span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          checked={formData.logFormat === 'text'}
                          onChange={() => updateField('logFormat', 'text')}
                        />
                        <span className="text-sm">Text</span>
                      </label>
                    </div>
                    <p className="mt-2 text-xs text-zinc-500">
                      Flag changes will be logged to stdout in the selected format
                    </p>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-4 border-t">
                <Button type="submit" disabled={isPending}>
                  {isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : formMode === 'create' ? (
                    <Check className="h-4 w-4 mr-2" />
                  ) : (
                    <Check className="h-4 w-4 mr-2" />
                  )}
                  {formMode === 'create' ? 'Create Notifier' : 'Save Changes'}
                </Button>
                <Button type="button" variant="outline" onClick={resetForm} disabled={isPending}>
                  <X className="h-4 w-4 mr-2" />
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Notifiers List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Configured Notifiers
          </CardTitle>
          <CardDescription>
            Notifications will be sent when flag configurations change
          </CardDescription>
        </CardHeader>
        <CardContent>
          {notifiersQuery.isLoading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : notifiersQuery.data && notifiersQuery.data.length > 0 ? (
            <div className="space-y-4">
              {notifiersQuery.data.map((notifier) => {
                const kindInfo = getKindInfo(notifier.kind);
                return (
                  <div
                    key={notifier.id}
                    className={`flex items-center justify-between p-4 border rounded-lg ${
                      notifier.enabled
                        ? 'border-zinc-200 dark:border-zinc-800'
                        : 'border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/50 opacity-60'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 ${kindInfo.color}`}>
                        {kindInfo.icon}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{notifier.name}</span>
                          <Badge variant={notifier.enabled ? 'success' : 'secondary'}>
                            {notifier.enabled ? 'Enabled' : 'Disabled'}
                          </Badge>
                          <Badge variant="secondary">{kindInfo.label}</Badge>
                        </div>
                        {notifier.description && (
                          <p className="text-sm text-zinc-500 mt-1">{notifier.description}</p>
                        )}
                        <p className="text-xs text-zinc-400 mt-1">
                          {notifier.webhookUrl && `Webhook: ${notifier.webhookUrl.substring(0, 50)}...`}
                          {notifier.endpointUrl && `Endpoint: ${notifier.endpointUrl}`}
                          {notifier.kind === 'log' && `Format: ${notifier.logFormat || 'json'}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => testMutation.mutate(notifier.id)}
                        disabled={!notifier.enabled || testingId === notifier.id}
                        title="Send test notification"
                      >
                        {testingId === notifier.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => startEdit(notifier)}
                        disabled={formMode !== null}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (confirm(`Delete notifier "${notifier.name}"?`)) {
                            deleteMutation.mutate(notifier.id);
                          }
                        }}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8">
              <AlertCircle className="mx-auto h-12 w-12 text-zinc-300" />
              <p className="mt-4 text-zinc-500">No notifiers configured</p>
              <p className="text-sm text-zinc-400 mt-1">
                Add a notifier to receive alerts when flag configurations change
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
