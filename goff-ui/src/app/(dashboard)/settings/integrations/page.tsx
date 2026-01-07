'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  GitBranch,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Loader2,
  TestTube,
  Star,
  AlertCircle,
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
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { toast } from 'sonner';

interface GitIntegration {
  id: string;
  name: string;
  provider: 'ado' | 'gitlab';
  description?: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  adoOrgUrl?: string;
  adoProject?: string;
  adoRepository?: string;
  adoPat?: string;
  gitlabUrl?: string;
  gitlabProjectId?: string;
  gitlabToken?: string;
  baseBranch: string;
  flagsPath: string;
}

type FormMode = 'create' | 'edit' | null;

export default function IntegrationsPage() {
  const queryClient = useQueryClient();
  const [formMode, setFormMode] = useState<FormMode>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState<Partial<GitIntegration>>({
    provider: 'ado',
    baseBranch: 'main',
    flagsPath: '/flags.yaml',
  });

  const integrationsQuery = useQuery({
    queryKey: ['integrations'],
    queryFn: async () => {
      const response = await fetch('/api/integrations');
      if (!response.ok) throw new Error('Failed to fetch integrations');
      const data = await response.json();
      return data.integrations as GitIntegration[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: Partial<GitIntegration>) => {
      const response = await fetch('/api/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create integration');
      }
      return response.json();
    },
    onSuccess: () => {
      toast.success('Integration created');
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
      resetForm();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to create integration');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<GitIntegration> }) => {
      const response = await fetch(`/api/integrations/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update integration');
      }
      return response.json();
    },
    onSuccess: () => {
      toast.success('Integration updated');
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
      resetForm();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to update integration');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/integrations/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete integration');
      }
      return response.json();
    },
    onSuccess: () => {
      toast.success('Integration deleted');
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to delete integration');
    },
  });

  const testMutation = useMutation({
    mutationFn: async (id: string) => {
      setTestingId(id);
      const response = await fetch(`/api/integrations/${id}/test`, {
        method: 'POST',
      });
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Connection test failed');
      }
      return data;
    },
    onSuccess: () => {
      toast.success('Connection successful!');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Connection test failed');
    },
    onSettled: () => {
      setTestingId(null);
    },
  });

  const resetForm = () => {
    setFormMode(null);
    setEditingId(null);
    setFormData({
      provider: 'ado',
      baseBranch: 'main',
      flagsPath: '/flags.yaml',
    });
  };

  const startEdit = (integration: GitIntegration) => {
    setFormMode('edit');
    setEditingId(integration.id);
    setFormData({ ...integration });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.id || !formData.name) {
      toast.error('ID and Name are required');
      return;
    }

    if (formMode === 'create') {
      createMutation.mutate(formData);
    } else if (formMode === 'edit' && editingId) {
      updateMutation.mutate({ id: editingId, data: formData });
    }
  };

  const updateField = (field: keyof GitIntegration, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Git Integrations</h2>
          <p className="text-zinc-600 dark:text-zinc-400">
            Connect to Git repositories for PR-based flag changes
          </p>
        </div>
        {!formMode && (
          <Button onClick={() => setFormMode('create')}>
            <Plus className="h-4 w-4 mr-2" />
            Add Integration
          </Button>
        )}
      </div>

      {/* Form */}
      {formMode && (
        <Card>
          <CardHeader>
            <CardTitle>
              {formMode === 'create' ? 'New Integration' : 'Edit Integration'}
            </CardTitle>
            <CardDescription>
              Configure a Git repository connection for flag management
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Basic Info */}
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="id">ID *</Label>
                  <Input
                    id="id"
                    value={formData.id || ''}
                    onChange={(e) => updateField('id', e.target.value)}
                    placeholder="my-ado-repo"
                    disabled={formMode === 'edit'}
                  />
                  <p className="text-xs text-zinc-500 mt-1">Unique identifier (cannot be changed)</p>
                </div>
                <div>
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    value={formData.name || ''}
                    onChange={(e) => updateField('name', e.target.value)}
                    placeholder="My ADO Repository"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  value={formData.description || ''}
                  onChange={(e) => updateField('description', e.target.value)}
                  placeholder="Production feature flags repository"
                />
              </div>

              {/* Provider Selection */}
              <div>
                <Label>Provider</Label>
                <div className="flex gap-2 mt-2">
                  <Button
                    type="button"
                    variant={formData.provider === 'ado' ? 'default' : 'outline'}
                    onClick={() => updateField('provider', 'ado')}
                  >
                    Azure DevOps
                  </Button>
                  <Button
                    type="button"
                    variant={formData.provider === 'gitlab' ? 'default' : 'outline'}
                    onClick={() => updateField('provider', 'gitlab')}
                  >
                    GitLab
                  </Button>
                </div>
              </div>

              {/* ADO-specific fields */}
              {formData.provider === 'ado' && (
                <div className="space-y-4 p-4 border rounded-lg bg-zinc-50 dark:bg-zinc-900">
                  <h4 className="font-medium">Azure DevOps Configuration</h4>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label htmlFor="adoOrgUrl">Organization URL *</Label>
                      <Input
                        id="adoOrgUrl"
                        value={formData.adoOrgUrl || ''}
                        onChange={(e) => updateField('adoOrgUrl', e.target.value)}
                        placeholder="https://dev.azure.com/your-org"
                      />
                    </div>
                    <div>
                      <Label htmlFor="adoProject">Project *</Label>
                      <Input
                        id="adoProject"
                        value={formData.adoProject || ''}
                        onChange={(e) => updateField('adoProject', e.target.value)}
                        placeholder="YourProject"
                      />
                    </div>
                    <div>
                      <Label htmlFor="adoRepository">Repository *</Label>
                      <Input
                        id="adoRepository"
                        value={formData.adoRepository || ''}
                        onChange={(e) => updateField('adoRepository', e.target.value)}
                        placeholder="feature-flags"
                      />
                    </div>
                    <div>
                      <Label htmlFor="adoPat">Personal Access Token *</Label>
                      <Input
                        id="adoPat"
                        type="password"
                        value={formData.adoPat || ''}
                        onChange={(e) => updateField('adoPat', e.target.value)}
                        placeholder="••••••••"
                      />
                      <p className="text-xs text-zinc-500 mt-1">Requires Code (Read & Write) permission</p>
                    </div>
                  </div>
                </div>
              )}

              {/* GitLab-specific fields */}
              {formData.provider === 'gitlab' && (
                <div className="space-y-4 p-4 border rounded-lg bg-zinc-50 dark:bg-zinc-900">
                  <h4 className="font-medium">GitLab Configuration</h4>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label htmlFor="gitlabUrl">GitLab URL *</Label>
                      <Input
                        id="gitlabUrl"
                        value={formData.gitlabUrl || ''}
                        onChange={(e) => updateField('gitlabUrl', e.target.value)}
                        placeholder="https://gitlab.com"
                      />
                    </div>
                    <div>
                      <Label htmlFor="gitlabProjectId">Project ID or Path *</Label>
                      <Input
                        id="gitlabProjectId"
                        value={formData.gitlabProjectId || ''}
                        onChange={(e) => updateField('gitlabProjectId', e.target.value)}
                        placeholder="group/project or 12345"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Label htmlFor="gitlabToken">Personal Access Token *</Label>
                      <Input
                        id="gitlabToken"
                        type="password"
                        value={formData.gitlabToken || ''}
                        onChange={(e) => updateField('gitlabToken', e.target.value)}
                        placeholder="••••••••"
                      />
                      <p className="text-xs text-zinc-500 mt-1">Requires api and write_repository scopes</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Common fields */}
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="baseBranch">Base Branch</Label>
                  <Input
                    id="baseBranch"
                    value={formData.baseBranch || ''}
                    onChange={(e) => updateField('baseBranch', e.target.value)}
                    placeholder="main"
                  />
                </div>
                <div>
                  <Label htmlFor="flagsPath">Flags File Path</Label>
                  <Input
                    id="flagsPath"
                    value={formData.flagsPath || ''}
                    onChange={(e) => updateField('flagsPath', e.target.value)}
                    placeholder="/flags.yaml"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isDefault"
                  checked={formData.isDefault || false}
                  onChange={(e) => updateField('isDefault', e.target.checked)}
                  className="rounded"
                />
                <Label htmlFor="isDefault" className="cursor-pointer">
                  Set as default integration
                </Label>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-4">
                <Button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {(createMutation.isPending || updateMutation.isPending) && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  {formMode === 'create' ? 'Create Integration' : 'Save Changes'}
                </Button>
                <Button type="button" variant="outline" onClick={resetForm}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Integrations List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5" />
            Configured Integrations
          </CardTitle>
        </CardHeader>
        <CardContent>
          {integrationsQuery.isLoading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : integrationsQuery.data && integrationsQuery.data.length > 0 ? (
            <div className="space-y-4">
              {integrationsQuery.data.map((integration) => (
                <div
                  key={integration.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`p-2 rounded-lg ${
                        integration.provider === 'ado'
                          ? 'bg-blue-100 dark:bg-blue-900'
                          : 'bg-orange-100 dark:bg-orange-900'
                      }`}
                    >
                      <GitBranch
                        className={`h-5 w-5 ${
                          integration.provider === 'ado'
                            ? 'text-blue-600 dark:text-blue-400'
                            : 'text-orange-600 dark:text-orange-400'
                        }`}
                      />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{integration.name}</span>
                        {integration.isDefault && (
                          <Badge variant="secondary" className="text-xs">
                            <Star className="h-3 w-3 mr-1" />
                            Default
                          </Badge>
                        )}
                        <Badge variant="default" className="text-xs">
                          {integration.provider === 'ado' ? 'Azure DevOps' : 'GitLab'}
                        </Badge>
                      </div>
                      <p className="text-sm text-zinc-500">
                        {integration.provider === 'ado'
                          ? `${integration.adoProject}/${integration.adoRepository}`
                          : integration.gitlabProjectId}
                        {' • '}
                        {integration.baseBranch}
                      </p>
                      {integration.description && (
                        <p className="text-xs text-zinc-400 mt-1">{integration.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => testMutation.mutate(integration.id)}
                      disabled={testingId === integration.id}
                    >
                      {testingId === integration.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <TestTube className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => startEdit(integration)}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (confirm('Delete this integration?')) {
                          deleteMutation.mutate(integration.id);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <AlertCircle className="mx-auto h-12 w-12 text-zinc-300 dark:text-zinc-700" />
              <p className="mt-4 text-zinc-500">No integrations configured</p>
              <p className="mt-2 text-sm text-zinc-400">
                Add a Git integration to enable PR-based flag changes
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card>
        <CardHeader>
          <CardTitle>How it works</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-zinc-600 dark:text-zinc-400 space-y-2">
          <p>
            When a Git integration is configured, flag changes will create Pull Requests
            (ADO) or Merge Requests (GitLab) instead of modifying flags directly.
          </p>
          <p>
            <strong>Workflow:</strong>
          </p>
          <ol className="list-decimal list-inside space-y-1 ml-2">
            <li>Edit a flag in the UI</li>
            <li>Click &quot;Propose Change&quot; to create a PR/MR</li>
            <li>Review and approve the PR/MR in your Git provider</li>
            <li>Merge to apply the change</li>
            <li>GO Feature Flag relay proxy picks up the change automatically</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
