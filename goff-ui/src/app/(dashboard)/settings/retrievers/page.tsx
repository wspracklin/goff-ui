'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FolderOpen,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Loader2,
  AlertCircle,
  FileText,
  Globe,
  Cloud,
  GitBranch,
  Database,
  Server,
  Box,
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

type RetrieverKind =
  | 'file'
  | 'http'
  | 's3'
  | 'googleStorage'
  | 'azureBlobStorage'
  | 'github'
  | 'gitlab'
  | 'bitbucket'
  | 'mongodb'
  | 'redis'
  | 'configmap';

interface Retriever {
  id: string;
  name: string;
  kind: RetrieverKind;
  description?: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;

  pollingInterval?: number;
  timeout?: number;
  fileFormat?: string;

  path?: string;
  url?: string;
  method?: string;
  body?: string;
  headers?: Record<string, string>;

  s3Bucket?: string;
  s3Item?: string;

  gcsBucket?: string;
  gcsObject?: string;

  azureContainer?: string;
  azureAccountName?: string;
  azureAccountKey?: string;
  azureObject?: string;

  githubRepositorySlug?: string;
  githubPath?: string;
  githubBranch?: string;
  githubToken?: string;

  gitlabRepositorySlug?: string;
  gitlabPath?: string;
  gitlabBranch?: string;
  gitlabToken?: string;
  gitlabBaseUrl?: string;

  bitbucketRepositorySlug?: string;
  bitbucketPath?: string;
  bitbucketBranch?: string;
  bitbucketToken?: string;
  bitbucketBaseUrl?: string;

  mongodbUri?: string;
  mongodbDatabase?: string;
  mongodbCollection?: string;

  redisAddr?: string;
  redisPassword?: string;
  redisDb?: number;
  redisPrefix?: string;

  configmapNamespace?: string;
  configmapName?: string;
  configmapKey?: string;
}

type FormMode = 'create' | 'edit' | null;

const retrieverKinds: { value: RetrieverKind; label: string; icon: React.ReactNode; color: string; category: 'local' | 'cloud' | 'git' | 'database' }[] = [
  { value: 'file', label: 'File', icon: <FileText className="h-4 w-4" />, color: 'text-blue-500', category: 'local' },
  { value: 'http', label: 'HTTP(S)', icon: <Globe className="h-4 w-4" />, color: 'text-green-500', category: 'local' },
  { value: 'configmap', label: 'ConfigMap', icon: <Box className="h-4 w-4" />, color: 'text-blue-600', category: 'local' },
  { value: 's3', label: 'AWS S3', icon: <Cloud className="h-4 w-4" />, color: 'text-orange-500', category: 'cloud' },
  { value: 'googleStorage', label: 'GCS', icon: <Cloud className="h-4 w-4" />, color: 'text-blue-400', category: 'cloud' },
  { value: 'azureBlobStorage', label: 'Azure Blob', icon: <Cloud className="h-4 w-4" />, color: 'text-cyan-500', category: 'cloud' },
  { value: 'github', label: 'GitHub', icon: <GitBranch className="h-4 w-4" />, color: 'text-gray-700 dark:text-gray-300', category: 'git' },
  { value: 'gitlab', label: 'GitLab', icon: <GitBranch className="h-4 w-4" />, color: 'text-orange-600', category: 'git' },
  { value: 'bitbucket', label: 'Bitbucket', icon: <GitBranch className="h-4 w-4" />, color: 'text-blue-700', category: 'git' },
  { value: 'mongodb', label: 'MongoDB', icon: <Database className="h-4 w-4" />, color: 'text-green-600', category: 'database' },
  { value: 'redis', label: 'Redis', icon: <Server className="h-4 w-4" />, color: 'text-red-500', category: 'database' },
];

export default function RetrieversSettingsPage() {
  const queryClient = useQueryClient();

  const [formMode, setFormMode] = useState<FormMode>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState<Partial<Retriever>>({
    kind: 'file',
    enabled: true,
    pollingInterval: 30000,
    timeout: 10000,
  });
  const [headerEntries, setHeaderEntries] = useState<{ key: string; value: string }[]>([]);

  // Query retrievers
  const retrieversQuery = useQuery({
    queryKey: ['retrievers'],
    queryFn: async () => {
      const response = await fetch('/api/retrievers');
      if (!response.ok) throw new Error('Failed to fetch retrievers');
      const data = await response.json();
      return data.retrievers as Retriever[];
    },
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: Partial<Retriever>) => {
      const response = await fetch('/api/retrievers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create retriever');
      }
      return response.json();
    },
    onSuccess: () => {
      toast.success('Retriever created');
      queryClient.invalidateQueries({ queryKey: ['retrievers'] });
      resetForm();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to create retriever');
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Retriever> }) => {
      const response = await fetch(`/api/retrievers/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update retriever');
      }
      return response.json();
    },
    onSuccess: () => {
      toast.success('Retriever updated');
      queryClient.invalidateQueries({ queryKey: ['retrievers'] });
      resetForm();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to update retriever');
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/retrievers/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete retriever');
      }
      return response.json();
    },
    onSuccess: () => {
      toast.success('Retriever deleted');
      queryClient.invalidateQueries({ queryKey: ['retrievers'] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to delete retriever');
    },
  });

  const resetForm = () => {
    setFormMode(null);
    setEditingId(null);
    setFormData({
      kind: 'file',
      enabled: true,
      pollingInterval: 30000,
      timeout: 10000,
    });
    setHeaderEntries([]);
  };

  const startEdit = (retriever: Retriever) => {
    setFormMode('edit');
    setEditingId(retriever.id);
    setFormData({ ...retriever });
    setHeaderEntries(
      retriever.headers
        ? Object.entries(retriever.headers).map(([key, value]) => ({ key, value }))
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
    if (formData.kind === 'file' && !formData.path?.trim()) {
      toast.error('File path is required');
      return;
    }

    if (formData.kind === 'http' && !formData.url?.trim()) {
      toast.error('URL is required');
      return;
    }

    if (formData.kind === 's3') {
      if (!formData.s3Bucket?.trim()) {
        toast.error('S3 bucket is required');
        return;
      }
      if (!formData.s3Item?.trim()) {
        toast.error('S3 item path is required');
        return;
      }
    }

    if (formData.kind === 'googleStorage') {
      if (!formData.gcsBucket?.trim()) {
        toast.error('GCS bucket is required');
        return;
      }
      if (!formData.gcsObject?.trim()) {
        toast.error('GCS object path is required');
        return;
      }
    }

    if (formData.kind === 'azureBlobStorage') {
      if (!formData.azureContainer?.trim()) {
        toast.error('Azure container is required');
        return;
      }
      if (!formData.azureAccountName?.trim()) {
        toast.error('Azure account name is required');
        return;
      }
      if (!formData.azureObject?.trim()) {
        toast.error('Azure object path is required');
        return;
      }
    }

    if (formData.kind === 'github') {
      if (!formData.githubRepositorySlug?.trim()) {
        toast.error('GitHub repository slug is required');
        return;
      }
      if (!formData.githubPath?.trim()) {
        toast.error('GitHub file path is required');
        return;
      }
    }

    if (formData.kind === 'gitlab') {
      if (!formData.gitlabRepositorySlug?.trim()) {
        toast.error('GitLab repository slug is required');
        return;
      }
      if (!formData.gitlabPath?.trim()) {
        toast.error('GitLab file path is required');
        return;
      }
    }

    if (formData.kind === 'bitbucket') {
      if (!formData.bitbucketRepositorySlug?.trim()) {
        toast.error('Bitbucket repository slug is required');
        return;
      }
      if (!formData.bitbucketPath?.trim()) {
        toast.error('Bitbucket file path is required');
        return;
      }
    }

    if (formData.kind === 'mongodb') {
      if (!formData.mongodbUri?.trim()) {
        toast.error('MongoDB URI is required');
        return;
      }
      if (!formData.mongodbDatabase?.trim()) {
        toast.error('MongoDB database is required');
        return;
      }
      if (!formData.mongodbCollection?.trim()) {
        toast.error('MongoDB collection is required');
        return;
      }
    }

    if (formData.kind === 'redis' && !formData.redisAddr?.trim()) {
      toast.error('Redis address is required');
      return;
    }

    if (formData.kind === 'configmap') {
      if (!formData.configmapNamespace?.trim()) {
        toast.error('ConfigMap namespace is required');
        return;
      }
      if (!formData.configmapName?.trim()) {
        toast.error('ConfigMap name is required');
        return;
      }
      if (!formData.configmapKey?.trim()) {
        toast.error('ConfigMap key is required');
        return;
      }
    }

    // Convert header entries to object
    const headers: Record<string, string> = {};
    headerEntries.forEach(({ key, value }) => {
      if (key.trim()) headers[key.trim()] = value;
    });

    const submitData: Partial<Retriever> = {
      ...formData,
      id: formData.id || formData.name?.toLowerCase().replace(/\s+/g, '-'),
      headers: Object.keys(headers).length > 0 ? headers : undefined,
    };

    if (formMode === 'create') {
      createMutation.mutate(submitData);
    } else if (formMode === 'edit' && editingId) {
      updateMutation.mutate({ id: editingId, data: submitData });
    }
  };

  const updateField = (field: keyof Retriever, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  const getKindInfo = (kind: RetrieverKind) => {
    return retrieverKinds.find((k) => k.value === kind) || retrieverKinds[0];
  };

  const getRetrieverSummary = (retriever: Retriever): string => {
    switch (retriever.kind) {
      case 'file':
        return `Path: ${retriever.path || 'Not set'}`;
      case 'http':
        return `URL: ${retriever.url || 'Not set'}`;
      case 's3':
        return `Bucket: ${retriever.s3Bucket || 'Not set'}`;
      case 'googleStorage':
        return `Bucket: ${retriever.gcsBucket || 'Not set'}`;
      case 'azureBlobStorage':
        return `Container: ${retriever.azureContainer || 'Not set'}`;
      case 'github':
        return `Repo: ${retriever.githubRepositorySlug || 'Not set'}`;
      case 'gitlab':
        return `Repo: ${retriever.gitlabRepositorySlug || 'Not set'}`;
      case 'bitbucket':
        return `Repo: ${retriever.bitbucketRepositorySlug || 'Not set'}`;
      case 'mongodb':
        return `DB: ${retriever.mongodbDatabase || 'Not set'}`;
      case 'redis':
        return `Addr: ${retriever.redisAddr || 'Not set'}`;
      case 'configmap':
        return `ConfigMap: ${retriever.configmapName || 'Not set'}`;
      default:
        return '';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Retrievers</h2>
          <p className="text-zinc-600 dark:text-zinc-400">
            Configure where flag configurations are fetched from
          </p>
        </div>
        {!formMode && (
          <Button onClick={() => setFormMode('create')}>
            <Plus className="h-4 w-4 mr-2" />
            Add Retriever
          </Button>
        )}
      </div>

      {/* Form Card */}
      {formMode && (
        <Card>
          <CardHeader>
            <CardTitle>
              {formMode === 'create' ? 'New Retriever' : 'Edit Retriever'}
            </CardTitle>
            <CardDescription>
              Configure a source for flag configurations
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
                    placeholder="My Retriever"
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
                <Label>Retriever Type *</Label>
                <div className="mt-2 space-y-2">
                  <p className="text-xs text-zinc-500">Local / HTTP</p>
                  <div className="flex flex-wrap gap-2">
                    {retrieverKinds.filter((k) => k.category === 'local').map((kind) => (
                      <Button
                        key={kind.value}
                        type="button"
                        variant={formData.kind === kind.value ? 'default' : 'outline'}
                        onClick={() => updateField('kind', kind.value)}
                        className="flex items-center gap-2"
                        size="sm"
                      >
                        <span className={kind.color}>{kind.icon}</span>
                        {kind.label}
                      </Button>
                    ))}
                  </div>
                  <p className="text-xs text-zinc-500 mt-2">Cloud Storage</p>
                  <div className="flex flex-wrap gap-2">
                    {retrieverKinds.filter((k) => k.category === 'cloud').map((kind) => (
                      <Button
                        key={kind.value}
                        type="button"
                        variant={formData.kind === kind.value ? 'default' : 'outline'}
                        onClick={() => updateField('kind', kind.value)}
                        className="flex items-center gap-2"
                        size="sm"
                      >
                        <span className={kind.color}>{kind.icon}</span>
                        {kind.label}
                      </Button>
                    ))}
                  </div>
                  <p className="text-xs text-zinc-500 mt-2">Git Providers</p>
                  <div className="flex flex-wrap gap-2">
                    {retrieverKinds.filter((k) => k.category === 'git').map((kind) => (
                      <Button
                        key={kind.value}
                        type="button"
                        variant={formData.kind === kind.value ? 'default' : 'outline'}
                        onClick={() => updateField('kind', kind.value)}
                        className="flex items-center gap-2"
                        size="sm"
                      >
                        <span className={kind.color}>{kind.icon}</span>
                        {kind.label}
                      </Button>
                    ))}
                  </div>
                  <p className="text-xs text-zinc-500 mt-2">Databases</p>
                  <div className="flex flex-wrap gap-2">
                    {retrieverKinds.filter((k) => k.category === 'database').map((kind) => (
                      <Button
                        key={kind.value}
                        type="button"
                        variant={formData.kind === kind.value ? 'default' : 'outline'}
                        onClick={() => updateField('kind', kind.value)}
                        className="flex items-center gap-2"
                        size="sm"
                      >
                        <span className={kind.color}>{kind.icon}</span>
                        {kind.label}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Common Options */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="pollingInterval">Polling Interval (ms)</Label>
                  <Input
                    id="pollingInterval"
                    type="number"
                    value={formData.pollingInterval || 30000}
                    onChange={(e) => updateField('pollingInterval', parseInt(e.target.value) || 30000)}
                  />
                  <p className="mt-1 text-xs text-zinc-500">How often to check for updates</p>
                </div>
                <div>
                  <Label htmlFor="timeout">Timeout (ms)</Label>
                  <Input
                    id="timeout"
                    type="number"
                    value={formData.timeout || 10000}
                    onChange={(e) => updateField('timeout', parseInt(e.target.value) || 10000)}
                  />
                  <p className="mt-1 text-xs text-zinc-500">Request timeout</p>
                </div>
              </div>

              {/* File Configuration */}
              {formData.kind === 'file' && (
                <div className="space-y-4 p-4 border rounded-lg bg-zinc-50 dark:bg-zinc-900">
                  <h4 className="font-medium flex items-center gap-2">
                    <FileText className="h-4 w-4 text-blue-500" />
                    File Configuration
                  </h4>
                  <div>
                    <Label htmlFor="path">File Path *</Label>
                    <Input
                      id="path"
                      value={formData.path || ''}
                      onChange={(e) => updateField('path', e.target.value)}
                      placeholder="/path/to/flags.yaml"
                    />
                  </div>
                </div>
              )}

              {/* HTTP Configuration */}
              {formData.kind === 'http' && (
                <div className="space-y-4 p-4 border rounded-lg bg-zinc-50 dark:bg-zinc-900">
                  <h4 className="font-medium flex items-center gap-2">
                    <Globe className="h-4 w-4 text-green-500" />
                    HTTP Configuration
                  </h4>
                  <div>
                    <Label htmlFor="url">URL *</Label>
                    <Input
                      id="url"
                      type="url"
                      value={formData.url || ''}
                      onChange={(e) => updateField('url', e.target.value)}
                      placeholder="https://example.com/flags.yaml"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="method">HTTP Method</Label>
                      <select
                        id="method"
                        value={formData.method || 'GET'}
                        onChange={(e) => updateField('method', e.target.value)}
                        className="w-full mt-1 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2"
                      >
                        <option value="GET">GET</option>
                        <option value="POST">POST</option>
                      </select>
                    </div>
                  </div>
                  {formData.method === 'POST' && (
                    <div>
                      <Label htmlFor="body">Request Body</Label>
                      <Textarea
                        id="body"
                        value={formData.body || ''}
                        onChange={(e) => updateField('body', e.target.value)}
                        placeholder="Optional request body"
                        rows={3}
                      />
                    </div>
                  )}
                  {/* Headers */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label>Headers</Label>
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
                </div>
              )}

              {/* S3 Configuration */}
              {formData.kind === 's3' && (
                <div className="space-y-4 p-4 border rounded-lg bg-zinc-50 dark:bg-zinc-900">
                  <h4 className="font-medium flex items-center gap-2">
                    <Cloud className="h-4 w-4 text-orange-500" />
                    AWS S3 Configuration
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="s3Bucket">Bucket *</Label>
                      <Input
                        id="s3Bucket"
                        value={formData.s3Bucket || ''}
                        onChange={(e) => updateField('s3Bucket', e.target.value)}
                        placeholder="my-bucket"
                      />
                    </div>
                    <div>
                      <Label htmlFor="s3Item">Item Path *</Label>
                      <Input
                        id="s3Item"
                        value={formData.s3Item || ''}
                        onChange={(e) => updateField('s3Item', e.target.value)}
                        placeholder="config/flags.yaml"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-zinc-500">
                    Configure AWS credentials via environment variables
                  </p>
                </div>
              )}

              {/* GCS Configuration */}
              {formData.kind === 'googleStorage' && (
                <div className="space-y-4 p-4 border rounded-lg bg-zinc-50 dark:bg-zinc-900">
                  <h4 className="font-medium flex items-center gap-2">
                    <Cloud className="h-4 w-4 text-blue-400" />
                    Google Cloud Storage Configuration
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="gcsBucket">Bucket *</Label>
                      <Input
                        id="gcsBucket"
                        value={formData.gcsBucket || ''}
                        onChange={(e) => updateField('gcsBucket', e.target.value)}
                        placeholder="my-gcs-bucket"
                      />
                    </div>
                    <div>
                      <Label htmlFor="gcsObject">Object Path *</Label>
                      <Input
                        id="gcsObject"
                        value={formData.gcsObject || ''}
                        onChange={(e) => updateField('gcsObject', e.target.value)}
                        placeholder="flags.yaml"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-zinc-500">
                    Configure GCP credentials via GOOGLE_APPLICATION_CREDENTIALS
                  </p>
                </div>
              )}

              {/* Azure Blob Configuration */}
              {formData.kind === 'azureBlobStorage' && (
                <div className="space-y-4 p-4 border rounded-lg bg-zinc-50 dark:bg-zinc-900">
                  <h4 className="font-medium flex items-center gap-2">
                    <Cloud className="h-4 w-4 text-cyan-500" />
                    Azure Blob Storage Configuration
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="azureContainer">Container *</Label>
                      <Input
                        id="azureContainer"
                        value={formData.azureContainer || ''}
                        onChange={(e) => updateField('azureContainer', e.target.value)}
                        placeholder="my-container"
                      />
                    </div>
                    <div>
                      <Label htmlFor="azureObject">Object Path *</Label>
                      <Input
                        id="azureObject"
                        value={formData.azureObject || ''}
                        onChange={(e) => updateField('azureObject', e.target.value)}
                        placeholder="flags.yaml"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="azureAccountName">Account Name *</Label>
                      <Input
                        id="azureAccountName"
                        value={formData.azureAccountName || ''}
                        onChange={(e) => updateField('azureAccountName', e.target.value)}
                        placeholder="mystorageaccount"
                      />
                    </div>
                    <div>
                      <Label htmlFor="azureAccountKey">Account Key</Label>
                      <Input
                        id="azureAccountKey"
                        type="password"
                        value={formData.azureAccountKey || ''}
                        onChange={(e) => updateField('azureAccountKey', e.target.value)}
                        placeholder="********"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* GitHub Configuration */}
              {formData.kind === 'github' && (
                <div className="space-y-4 p-4 border rounded-lg bg-zinc-50 dark:bg-zinc-900">
                  <h4 className="font-medium flex items-center gap-2">
                    <GitBranch className="h-4 w-4 text-gray-700 dark:text-gray-300" />
                    GitHub Configuration
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="githubRepositorySlug">Repository *</Label>
                      <Input
                        id="githubRepositorySlug"
                        value={formData.githubRepositorySlug || ''}
                        onChange={(e) => updateField('githubRepositorySlug', e.target.value)}
                        placeholder="owner/repo"
                      />
                    </div>
                    <div>
                      <Label htmlFor="githubPath">File Path *</Label>
                      <Input
                        id="githubPath"
                        value={formData.githubPath || ''}
                        onChange={(e) => updateField('githubPath', e.target.value)}
                        placeholder="config/flags.yaml"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="githubBranch">Branch</Label>
                      <Input
                        id="githubBranch"
                        value={formData.githubBranch || ''}
                        onChange={(e) => updateField('githubBranch', e.target.value)}
                        placeholder="main"
                      />
                    </div>
                    <div>
                      <Label htmlFor="githubToken">Token (for private repos)</Label>
                      <Input
                        id="githubToken"
                        type="password"
                        value={formData.githubToken || ''}
                        onChange={(e) => updateField('githubToken', e.target.value)}
                        placeholder="********"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* GitLab Configuration */}
              {formData.kind === 'gitlab' && (
                <div className="space-y-4 p-4 border rounded-lg bg-zinc-50 dark:bg-zinc-900">
                  <h4 className="font-medium flex items-center gap-2">
                    <GitBranch className="h-4 w-4 text-orange-600" />
                    GitLab Configuration
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="gitlabRepositorySlug">Repository *</Label>
                      <Input
                        id="gitlabRepositorySlug"
                        value={formData.gitlabRepositorySlug || ''}
                        onChange={(e) => updateField('gitlabRepositorySlug', e.target.value)}
                        placeholder="owner/repo"
                      />
                    </div>
                    <div>
                      <Label htmlFor="gitlabPath">File Path *</Label>
                      <Input
                        id="gitlabPath"
                        value={formData.gitlabPath || ''}
                        onChange={(e) => updateField('gitlabPath', e.target.value)}
                        placeholder="config/flags.yaml"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="gitlabBranch">Branch</Label>
                      <Input
                        id="gitlabBranch"
                        value={formData.gitlabBranch || ''}
                        onChange={(e) => updateField('gitlabBranch', e.target.value)}
                        placeholder="main"
                      />
                    </div>
                    <div>
                      <Label htmlFor="gitlabBaseUrl">Base URL</Label>
                      <Input
                        id="gitlabBaseUrl"
                        value={formData.gitlabBaseUrl || ''}
                        onChange={(e) => updateField('gitlabBaseUrl', e.target.value)}
                        placeholder="https://gitlab.com"
                      />
                    </div>
                    <div>
                      <Label htmlFor="gitlabToken">Token</Label>
                      <Input
                        id="gitlabToken"
                        type="password"
                        value={formData.gitlabToken || ''}
                        onChange={(e) => updateField('gitlabToken', e.target.value)}
                        placeholder="********"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Bitbucket Configuration */}
              {formData.kind === 'bitbucket' && (
                <div className="space-y-4 p-4 border rounded-lg bg-zinc-50 dark:bg-zinc-900">
                  <h4 className="font-medium flex items-center gap-2">
                    <GitBranch className="h-4 w-4 text-blue-700" />
                    Bitbucket Configuration
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="bitbucketRepositorySlug">Repository *</Label>
                      <Input
                        id="bitbucketRepositorySlug"
                        value={formData.bitbucketRepositorySlug || ''}
                        onChange={(e) => updateField('bitbucketRepositorySlug', e.target.value)}
                        placeholder="owner/repo"
                      />
                    </div>
                    <div>
                      <Label htmlFor="bitbucketPath">File Path *</Label>
                      <Input
                        id="bitbucketPath"
                        value={formData.bitbucketPath || ''}
                        onChange={(e) => updateField('bitbucketPath', e.target.value)}
                        placeholder="config/flags.yaml"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="bitbucketBranch">Branch</Label>
                      <Input
                        id="bitbucketBranch"
                        value={formData.bitbucketBranch || ''}
                        onChange={(e) => updateField('bitbucketBranch', e.target.value)}
                        placeholder="main"
                      />
                    </div>
                    <div>
                      <Label htmlFor="bitbucketBaseUrl">Base URL</Label>
                      <Input
                        id="bitbucketBaseUrl"
                        value={formData.bitbucketBaseUrl || ''}
                        onChange={(e) => updateField('bitbucketBaseUrl', e.target.value)}
                        placeholder="https://bitbucket.org"
                      />
                    </div>
                    <div>
                      <Label htmlFor="bitbucketToken">Token</Label>
                      <Input
                        id="bitbucketToken"
                        type="password"
                        value={formData.bitbucketToken || ''}
                        onChange={(e) => updateField('bitbucketToken', e.target.value)}
                        placeholder="********"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* MongoDB Configuration */}
              {formData.kind === 'mongodb' && (
                <div className="space-y-4 p-4 border rounded-lg bg-zinc-50 dark:bg-zinc-900">
                  <h4 className="font-medium flex items-center gap-2">
                    <Database className="h-4 w-4 text-green-600" />
                    MongoDB Configuration
                  </h4>
                  <div>
                    <Label htmlFor="mongodbUri">Connection URI *</Label>
                    <Input
                      id="mongodbUri"
                      value={formData.mongodbUri || ''}
                      onChange={(e) => updateField('mongodbUri', e.target.value)}
                      placeholder="mongodb://user:pass@localhost:27017/"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="mongodbDatabase">Database *</Label>
                      <Input
                        id="mongodbDatabase"
                        value={formData.mongodbDatabase || ''}
                        onChange={(e) => updateField('mongodbDatabase', e.target.value)}
                        placeholder="appConfig"
                      />
                    </div>
                    <div>
                      <Label htmlFor="mongodbCollection">Collection *</Label>
                      <Input
                        id="mongodbCollection"
                        value={formData.mongodbCollection || ''}
                        onChange={(e) => updateField('mongodbCollection', e.target.value)}
                        placeholder="featureFlags"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Redis Configuration */}
              {formData.kind === 'redis' && (
                <div className="space-y-4 p-4 border rounded-lg bg-zinc-50 dark:bg-zinc-900">
                  <h4 className="font-medium flex items-center gap-2">
                    <Server className="h-4 w-4 text-red-500" />
                    Redis Configuration
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="redisAddr">Address *</Label>
                      <Input
                        id="redisAddr"
                        value={formData.redisAddr || ''}
                        onChange={(e) => updateField('redisAddr', e.target.value)}
                        placeholder="localhost:6379"
                      />
                    </div>
                    <div>
                      <Label htmlFor="redisPassword">Password</Label>
                      <Input
                        id="redisPassword"
                        type="password"
                        value={formData.redisPassword || ''}
                        onChange={(e) => updateField('redisPassword', e.target.value)}
                        placeholder="********"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="redisDb">Database</Label>
                      <Input
                        id="redisDb"
                        type="number"
                        value={formData.redisDb || 0}
                        onChange={(e) => updateField('redisDb', parseInt(e.target.value) || 0)}
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <Label htmlFor="redisPrefix">Key Prefix</Label>
                      <Input
                        id="redisPrefix"
                        value={formData.redisPrefix || ''}
                        onChange={(e) => updateField('redisPrefix', e.target.value)}
                        placeholder="goff:"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* ConfigMap Configuration */}
              {formData.kind === 'configmap' && (
                <div className="space-y-4 p-4 border rounded-lg bg-zinc-50 dark:bg-zinc-900">
                  <h4 className="font-medium flex items-center gap-2">
                    <Box className="h-4 w-4 text-blue-600" />
                    Kubernetes ConfigMap Configuration
                  </h4>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="configmapNamespace">Namespace *</Label>
                      <Input
                        id="configmapNamespace"
                        value={formData.configmapNamespace || ''}
                        onChange={(e) => updateField('configmapNamespace', e.target.value)}
                        placeholder="default"
                      />
                    </div>
                    <div>
                      <Label htmlFor="configmapName">ConfigMap Name *</Label>
                      <Input
                        id="configmapName"
                        value={formData.configmapName || ''}
                        onChange={(e) => updateField('configmapName', e.target.value)}
                        placeholder="feature-flags"
                      />
                    </div>
                    <div>
                      <Label htmlFor="configmapKey">Key *</Label>
                      <Input
                        id="configmapKey"
                        value={formData.configmapKey || ''}
                        onChange={(e) => updateField('configmapKey', e.target.value)}
                        placeholder="flags.yaml"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-4 border-t">
                <Button type="submit" disabled={isPending}>
                  {isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4 mr-2" />
                  )}
                  {formMode === 'create' ? 'Create Retriever' : 'Save Changes'}
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

      {/* Retrievers List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5" />
            Configured Retrievers
          </CardTitle>
          <CardDescription>
            Flag configurations will be fetched from these sources
          </CardDescription>
        </CardHeader>
        <CardContent>
          {retrieversQuery.isLoading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : retrieversQuery.data && retrieversQuery.data.length > 0 ? (
            <div className="space-y-4">
              {retrieversQuery.data.map((retriever) => {
                const kindInfo = getKindInfo(retriever.kind);
                return (
                  <div
                    key={retriever.id}
                    className={`flex items-center justify-between p-4 border rounded-lg ${
                      retriever.enabled
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
                          <span className="font-medium">{retriever.name}</span>
                          <Badge variant={retriever.enabled ? 'success' : 'secondary'}>
                            {retriever.enabled ? 'Enabled' : 'Disabled'}
                          </Badge>
                          <Badge variant="secondary">{kindInfo.label}</Badge>
                        </div>
                        {retriever.description && (
                          <p className="text-sm text-zinc-500 mt-1">{retriever.description}</p>
                        )}
                        <p className="text-xs text-zinc-400 mt-1">
                          {getRetrieverSummary(retriever)}
                          {retriever.pollingInterval && ` • Poll: ${retriever.pollingInterval}ms`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => startEdit(retriever)}
                        disabled={formMode !== null}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (confirm(`Delete retriever "${retriever.name}"?`)) {
                            deleteMutation.mutate(retriever.id);
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
              <p className="mt-4 text-zinc-500">No retrievers configured</p>
              <p className="text-sm text-zinc-400 mt-1">
                Add a retriever to fetch flag configurations from external sources
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
