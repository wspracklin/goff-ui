'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Database,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Loader2,
  AlertCircle,
  FileText,
  Webhook,
  Cloud,
  HardDrive,
  Radio,
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

type ExporterKind =
  | 'file'
  | 'webhook'
  | 'log'
  | 's3'
  | 'googleStorage'
  | 'azureBlobStorage'
  | 'kafka'
  | 'sqs'
  | 'kinesis'
  | 'pubsub';

interface Exporter {
  id: string;
  name: string;
  kind: ExporterKind;
  description?: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;

  // Common fields for bulk exporters
  flushInterval?: number;
  maxEventInMemory?: number;
  format?: 'JSON' | 'CSV' | 'Parquet';
  filename?: string;
  csvTemplate?: string;
  parquetCompressionCodec?: string;

  // File exporter
  outputDir?: string;

  // Webhook exporter
  endpointUrl?: string;
  secret?: string;
  headers?: Record<string, string>;
  meta?: Record<string, string>;

  // Log exporter
  logFormat?: string;

  // S3 exporter
  s3Bucket?: string;
  s3Path?: string;

  // Google Cloud Storage exporter
  gcsBucket?: string;
  gcsPath?: string;

  // Azure Blob Storage exporter
  azureContainer?: string;
  azureAccountName?: string;
  azureAccountKey?: string;
  azurePath?: string;

  // Kafka exporter
  kafkaTopic?: string;
  kafkaAddresses?: string[];

  // SQS exporter
  sqsQueueUrl?: string;

  // Kinesis exporter
  kinesisStreamArn?: string;
  kinesisStreamName?: string;

  // PubSub exporter
  pubsubProjectId?: string;
  pubsubTopic?: string;
}

type FormMode = 'create' | 'edit' | null;

const exporterKinds: { value: ExporterKind; label: string; icon: React.ReactNode; color: string; category: 'storage' | 'queue' | 'other' }[] = [
  { value: 'file', label: 'File', icon: <HardDrive className="h-4 w-4" />, color: 'text-blue-500', category: 'storage' },
  { value: 's3', label: 'AWS S3', icon: <Cloud className="h-4 w-4" />, color: 'text-orange-500', category: 'storage' },
  { value: 'googleStorage', label: 'GCS', icon: <Cloud className="h-4 w-4" />, color: 'text-blue-400', category: 'storage' },
  { value: 'azureBlobStorage', label: 'Azure Blob', icon: <Cloud className="h-4 w-4" />, color: 'text-cyan-500', category: 'storage' },
  { value: 'webhook', label: 'Webhook', icon: <Webhook className="h-4 w-4" />, color: 'text-purple-500', category: 'other' },
  { value: 'kafka', label: 'Kafka', icon: <Radio className="h-4 w-4" />, color: 'text-red-500', category: 'queue' },
  { value: 'sqs', label: 'AWS SQS', icon: <Radio className="h-4 w-4" />, color: 'text-orange-400', category: 'queue' },
  { value: 'kinesis', label: 'Kinesis', icon: <Radio className="h-4 w-4" />, color: 'text-orange-600', category: 'queue' },
  { value: 'pubsub', label: 'PubSub', icon: <Radio className="h-4 w-4" />, color: 'text-blue-600', category: 'queue' },
  { value: 'log', label: 'Log', icon: <FileText className="h-4 w-4" />, color: 'text-zinc-500', category: 'other' },
];

// Exporters that support bulk format options
const bulkExporters: ExporterKind[] = ['file', 's3', 'googleStorage', 'azureBlobStorage'];

export default function ExportersSettingsPage() {
  const queryClient = useQueryClient();

  const [formMode, setFormMode] = useState<FormMode>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState<Partial<Exporter>>({
    kind: 'file',
    enabled: true,
    format: 'JSON',
    flushInterval: 60000,
    maxEventInMemory: 100000,
  });
  const [headerEntries, setHeaderEntries] = useState<{ key: string; value: string }[]>([]);
  const [metaEntries, setMetaEntries] = useState<{ key: string; value: string }[]>([]);
  const [kafkaAddressesText, setKafkaAddressesText] = useState('');

  // Query exporters
  const exportersQuery = useQuery({
    queryKey: ['exporters'],
    queryFn: async () => {
      const response = await fetch('/api/exporters');
      if (!response.ok) throw new Error('Failed to fetch exporters');
      const data = await response.json();
      return data.exporters as Exporter[];
    },
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: Partial<Exporter>) => {
      const response = await fetch('/api/exporters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create exporter');
      }
      return response.json();
    },
    onSuccess: () => {
      toast.success('Exporter created');
      queryClient.invalidateQueries({ queryKey: ['exporters'] });
      resetForm();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to create exporter');
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Exporter> }) => {
      const response = await fetch(`/api/exporters/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update exporter');
      }
      return response.json();
    },
    onSuccess: () => {
      toast.success('Exporter updated');
      queryClient.invalidateQueries({ queryKey: ['exporters'] });
      resetForm();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to update exporter');
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/exporters/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete exporter');
      }
      return response.json();
    },
    onSuccess: () => {
      toast.success('Exporter deleted');
      queryClient.invalidateQueries({ queryKey: ['exporters'] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to delete exporter');
    },
  });

  const resetForm = () => {
    setFormMode(null);
    setEditingId(null);
    setFormData({
      kind: 'file',
      enabled: true,
      format: 'JSON',
      flushInterval: 60000,
      maxEventInMemory: 100000,
    });
    setHeaderEntries([]);
    setMetaEntries([]);
    setKafkaAddressesText('');
  };

  const startEdit = (exporter: Exporter) => {
    setFormMode('edit');
    setEditingId(exporter.id);
    setFormData({ ...exporter });
    setHeaderEntries(
      exporter.headers
        ? Object.entries(exporter.headers).map(([key, value]) => ({ key, value }))
        : []
    );
    setMetaEntries(
      exporter.meta
        ? Object.entries(exporter.meta).map(([key, value]) => ({ key, value }))
        : []
    );
    setKafkaAddressesText(exporter.kafkaAddresses?.join('\n') || '');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name?.trim()) {
      toast.error('Name is required');
      return;
    }

    // Validate based on kind
    if (formData.kind === 'file' && !formData.outputDir?.trim()) {
      toast.error('Output directory is required');
      return;
    }

    if (formData.kind === 'webhook' && !formData.endpointUrl?.trim()) {
      toast.error('Endpoint URL is required');
      return;
    }

    if (formData.kind === 's3' && !formData.s3Bucket?.trim()) {
      toast.error('S3 bucket is required');
      return;
    }

    if (formData.kind === 'googleStorage' && !formData.gcsBucket?.trim()) {
      toast.error('GCS bucket is required');
      return;
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
    }

    if (formData.kind === 'kafka') {
      if (!formData.kafkaTopic?.trim()) {
        toast.error('Kafka topic is required');
        return;
      }
    }

    if (formData.kind === 'sqs' && !formData.sqsQueueUrl?.trim()) {
      toast.error('SQS queue URL is required');
      return;
    }

    if (formData.kind === 'pubsub') {
      if (!formData.pubsubProjectId?.trim()) {
        toast.error('GCP Project ID is required');
        return;
      }
      if (!formData.pubsubTopic?.trim()) {
        toast.error('PubSub topic is required');
        return;
      }
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

    // Parse Kafka addresses
    const kafkaAddresses = kafkaAddressesText
      .split('\n')
      .map((addr) => addr.trim())
      .filter((addr) => addr.length > 0);

    const submitData: Partial<Exporter> = {
      ...formData,
      id: formData.id || formData.name?.toLowerCase().replace(/\s+/g, '-'),
      headers: Object.keys(headers).length > 0 ? headers : undefined,
      meta: Object.keys(meta).length > 0 ? meta : undefined,
      kafkaAddresses: kafkaAddresses.length > 0 ? kafkaAddresses : undefined,
    };

    if (formMode === 'create') {
      createMutation.mutate(submitData);
    } else if (formMode === 'edit' && editingId) {
      updateMutation.mutate({ id: editingId, data: submitData });
    }
  };

  const updateField = (field: keyof Exporter, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  const getKindInfo = (kind: ExporterKind) => {
    return exporterKinds.find((k) => k.value === kind) || exporterKinds[0];
  };

  const getExporterSummary = (exporter: Exporter): string => {
    switch (exporter.kind) {
      case 'file':
        return `Dir: ${exporter.outputDir || 'Not set'}`;
      case 's3':
        return `Bucket: ${exporter.s3Bucket || 'Not set'}`;
      case 'googleStorage':
        return `Bucket: ${exporter.gcsBucket || 'Not set'}`;
      case 'azureBlobStorage':
        return `Container: ${exporter.azureContainer || 'Not set'}`;
      case 'webhook':
        return `URL: ${exporter.endpointUrl || 'Not set'}`;
      case 'kafka':
        return `Topic: ${exporter.kafkaTopic || 'Not set'}`;
      case 'sqs':
        return `Queue: ${exporter.sqsQueueUrl?.substring(0, 40)}...`;
      case 'kinesis':
        return `Stream: ${exporter.kinesisStreamName || exporter.kinesisStreamArn || 'Not set'}`;
      case 'pubsub':
        return `Topic: ${exporter.pubsubTopic || 'Not set'}`;
      case 'log':
        return `Format: ${exporter.logFormat || 'default'}`;
      default:
        return '';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Exporters</h2>
          <p className="text-zinc-600 dark:text-zinc-400">
            Configure where flag evaluation data is exported
          </p>
        </div>
        {!formMode && (
          <Button onClick={() => setFormMode('create')}>
            <Plus className="h-4 w-4 mr-2" />
            Add Exporter
          </Button>
        )}
      </div>

      {/* Form Card */}
      {formMode && (
        <Card>
          <CardHeader>
            <CardTitle>
              {formMode === 'create' ? 'New Exporter' : 'Edit Exporter'}
            </CardTitle>
            <CardDescription>
              Configure an exporter for flag evaluation data
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
                    placeholder="My Exporter"
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
                <Label>Exporter Type *</Label>
                <div className="mt-2 space-y-2">
                  <p className="text-xs text-zinc-500">Storage</p>
                  <div className="flex flex-wrap gap-2">
                    {exporterKinds.filter((k) => k.category === 'storage').map((kind) => (
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
                  <p className="text-xs text-zinc-500 mt-2">Queue / Streaming</p>
                  <div className="flex flex-wrap gap-2">
                    {exporterKinds.filter((k) => k.category === 'queue').map((kind) => (
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
                  <p className="text-xs text-zinc-500 mt-2">Other</p>
                  <div className="flex flex-wrap gap-2">
                    {exporterKinds.filter((k) => k.category === 'other').map((kind) => (
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

              {/* Common Bulk Exporter Options */}
              {bulkExporters.includes(formData.kind as ExporterKind) && (
                <div className="space-y-4 p-4 border rounded-lg bg-zinc-50 dark:bg-zinc-900">
                  <h4 className="font-medium">Export Settings</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="flushInterval">Flush Interval (ms)</Label>
                      <Input
                        id="flushInterval"
                        type="number"
                        value={formData.flushInterval || 60000}
                        onChange={(e) => updateField('flushInterval', parseInt(e.target.value) || 60000)}
                        placeholder="60000"
                      />
                      <p className="mt-1 text-xs text-zinc-500">Time between exports</p>
                    </div>
                    <div>
                      <Label htmlFor="maxEventInMemory">Max Events in Memory</Label>
                      <Input
                        id="maxEventInMemory"
                        type="number"
                        value={formData.maxEventInMemory || 100000}
                        onChange={(e) => updateField('maxEventInMemory', parseInt(e.target.value) || 100000)}
                        placeholder="100000"
                      />
                      <p className="mt-1 text-xs text-zinc-500">Trigger export threshold</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Output Format</Label>
                      <div className="flex gap-4 mt-2">
                        {(['JSON', 'CSV', 'Parquet'] as const).map((fmt) => (
                          <label key={fmt} className="flex items-center gap-2">
                            <input
                              type="radio"
                              checked={formData.format === fmt}
                              onChange={() => updateField('format', fmt)}
                            />
                            <span className="text-sm">{fmt}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    {formData.format === 'Parquet' && (
                      <div>
                        <Label htmlFor="parquetCodec">Parquet Compression</Label>
                        <select
                          id="parquetCodec"
                          value={formData.parquetCompressionCodec || 'SNAPPY'}
                          onChange={(e) => updateField('parquetCompressionCodec', e.target.value)}
                          className="w-full mt-1 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2"
                        >
                          <option value="SNAPPY">SNAPPY</option>
                          <option value="GZIP">GZIP</option>
                          <option value="LZ4">LZ4</option>
                          <option value="ZSTD">ZSTD</option>
                        </select>
                      </div>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="filename">Filename Template</Label>
                    <Input
                      id="filename"
                      value={formData.filename || ''}
                      onChange={(e) => updateField('filename', e.target.value)}
                      placeholder="flag-variation-{{ .Hostname}}-{{ .Timestamp}}.{{ .Format}}"
                    />
                    <p className="mt-1 text-xs text-zinc-500">
                      Available: {'{{ .Hostname }}'}, {'{{ .Timestamp }}'}, {'{{ .Format }}'}
                    </p>
                  </div>
                  {formData.format === 'CSV' && (
                    <div>
                      <Label htmlFor="csvTemplate">CSV Template</Label>
                      <Input
                        id="csvTemplate"
                        value={formData.csvTemplate || ''}
                        onChange={(e) => updateField('csvTemplate', e.target.value)}
                        placeholder="{{ .Kind}};{{ .ContextKind}};{{ .UserKey}};..."
                      />
                    </div>
                  )}
                </div>
              )}

              {/* File Configuration */}
              {formData.kind === 'file' && (
                <div className="space-y-4 p-4 border rounded-lg bg-zinc-50 dark:bg-zinc-900">
                  <h4 className="font-medium flex items-center gap-2">
                    <HardDrive className="h-4 w-4 text-blue-500" />
                    File System Configuration
                  </h4>
                  <div>
                    <Label htmlFor="outputDir">Output Directory *</Label>
                    <Input
                      id="outputDir"
                      value={formData.outputDir || ''}
                      onChange={(e) => updateField('outputDir', e.target.value)}
                      placeholder="/output-data/"
                    />
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
                      <Label htmlFor="s3Path">Path</Label>
                      <Input
                        id="s3Path"
                        value={formData.s3Path || ''}
                        onChange={(e) => updateField('s3Path', e.target.value)}
                        placeholder="exports/"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-zinc-500">
                    Configure AWS credentials via environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
                  </p>
                </div>
              )}

              {/* Google Cloud Storage Configuration */}
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
                      <Label htmlFor="gcsPath">Path</Label>
                      <Input
                        id="gcsPath"
                        value={formData.gcsPath || ''}
                        onChange={(e) => updateField('gcsPath', e.target.value)}
                        placeholder="exports/"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-zinc-500">
                    Configure GCP credentials via GOOGLE_APPLICATION_CREDENTIALS environment variable
                  </p>
                </div>
              )}

              {/* Azure Blob Storage Configuration */}
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
                      <Label htmlFor="azurePath">Path</Label>
                      <Input
                        id="azurePath"
                        value={formData.azurePath || ''}
                        onChange={(e) => updateField('azurePath', e.target.value)}
                        placeholder="exports/"
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
                      <Label htmlFor="azureAccountKey">Account Key *</Label>
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

              {/* Webhook Configuration */}
              {formData.kind === 'webhook' && (
                <div className="space-y-4 p-4 border rounded-lg bg-zinc-50 dark:bg-zinc-900">
                  <h4 className="font-medium flex items-center gap-2">
                    <Webhook className="h-4 w-4 text-purple-500" />
                    Webhook Configuration
                  </h4>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="flushInterval">Flush Interval (ms)</Label>
                      <Input
                        id="flushInterval"
                        type="number"
                        value={formData.flushInterval || 60000}
                        onChange={(e) => updateField('flushInterval', parseInt(e.target.value) || 60000)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="maxEventInMemory">Max Events in Memory</Label>
                      <Input
                        id="maxEventInMemory"
                        type="number"
                        value={formData.maxEventInMemory || 100000}
                        onChange={(e) => updateField('maxEventInMemory', parseInt(e.target.value) || 100000)}
                      />
                    </div>
                  </div>

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
                      placeholder="Optional secret"
                    />
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

              {/* Kafka Configuration */}
              {formData.kind === 'kafka' && (
                <div className="space-y-4 p-4 border rounded-lg bg-zinc-50 dark:bg-zinc-900">
                  <h4 className="font-medium flex items-center gap-2">
                    <Radio className="h-4 w-4 text-red-500" />
                    Apache Kafka Configuration
                  </h4>
                  <div>
                    <Label htmlFor="kafkaTopic">Topic *</Label>
                    <Input
                      id="kafkaTopic"
                      value={formData.kafkaTopic || ''}
                      onChange={(e) => updateField('kafkaTopic', e.target.value)}
                      placeholder="go-feature-flag-events"
                    />
                  </div>
                  <div>
                    <Label htmlFor="kafkaAddresses">Bootstrap Servers *</Label>
                    <Textarea
                      id="kafkaAddresses"
                      value={kafkaAddressesText}
                      onChange={(e) => setKafkaAddressesText(e.target.value)}
                      placeholder="localhost:9092&#10;cluster2:9092"
                      rows={3}
                    />
                    <p className="mt-1 text-xs text-zinc-500">One address per line</p>
                  </div>
                </div>
              )}

              {/* SQS Configuration */}
              {formData.kind === 'sqs' && (
                <div className="space-y-4 p-4 border rounded-lg bg-zinc-50 dark:bg-zinc-900">
                  <h4 className="font-medium flex items-center gap-2">
                    <Radio className="h-4 w-4 text-orange-400" />
                    AWS SQS Configuration
                  </h4>
                  <div>
                    <Label htmlFor="sqsQueueUrl">Queue URL *</Label>
                    <Input
                      id="sqsQueueUrl"
                      value={formData.sqsQueueUrl || ''}
                      onChange={(e) => updateField('sqsQueueUrl', e.target.value)}
                      placeholder="https://sqs.us-east-1.amazonaws.com/XXXX/my-queue"
                    />
                  </div>
                  <p className="text-xs text-zinc-500">
                    Configure AWS credentials via environment variables
                  </p>
                </div>
              )}

              {/* Kinesis Configuration */}
              {formData.kind === 'kinesis' && (
                <div className="space-y-4 p-4 border rounded-lg bg-zinc-50 dark:bg-zinc-900">
                  <h4 className="font-medium flex items-center gap-2">
                    <Radio className="h-4 w-4 text-orange-600" />
                    AWS Kinesis Configuration
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="kinesisStreamArn">Stream ARN</Label>
                      <Input
                        id="kinesisStreamArn"
                        value={formData.kinesisStreamArn || ''}
                        onChange={(e) => updateField('kinesisStreamArn', e.target.value)}
                        placeholder="arn:aws:kinesis:us-east-1:XXXX:stream/my-stream"
                      />
                    </div>
                    <div>
                      <Label htmlFor="kinesisStreamName">Stream Name</Label>
                      <Input
                        id="kinesisStreamName"
                        value={formData.kinesisStreamName || ''}
                        onChange={(e) => updateField('kinesisStreamName', e.target.value)}
                        placeholder="my-stream"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-zinc-500">
                    Provide either Stream ARN or Stream Name. Configure AWS credentials via environment variables.
                  </p>
                </div>
              )}

              {/* PubSub Configuration */}
              {formData.kind === 'pubsub' && (
                <div className="space-y-4 p-4 border rounded-lg bg-zinc-50 dark:bg-zinc-900">
                  <h4 className="font-medium flex items-center gap-2">
                    <Radio className="h-4 w-4 text-blue-600" />
                    Google Cloud PubSub Configuration
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="pubsubProjectId">Project ID *</Label>
                      <Input
                        id="pubsubProjectId"
                        value={formData.pubsubProjectId || ''}
                        onChange={(e) => updateField('pubsubProjectId', e.target.value)}
                        placeholder="my-gcp-project"
                      />
                    </div>
                    <div>
                      <Label htmlFor="pubsubTopic">Topic *</Label>
                      <Input
                        id="pubsubTopic"
                        value={formData.pubsubTopic || ''}
                        onChange={(e) => updateField('pubsubTopic', e.target.value)}
                        placeholder="goff-feature-events"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-zinc-500">
                    Configure GCP credentials via GOOGLE_APPLICATION_CREDENTIALS environment variable
                  </p>
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
                    <Label htmlFor="logFormat">Log Format Template</Label>
                    <Input
                      id="logFormat"
                      value={formData.logFormat || ''}
                      onChange={(e) => updateField('logFormat', e.target.value)}
                      placeholder='[{{ .FormattedDate}}] user="{{ .UserKey}}", flag="{{ .Key}}", value="{{ .Value}}"'
                    />
                    <p className="mt-1 text-xs text-zinc-500">
                      Go template format. Available: FormattedDate, UserKey, Key, Value, Variation, etc.
                    </p>
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
                  {formMode === 'create' ? 'Create Exporter' : 'Save Changes'}
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

      {/* Exporters List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Configured Exporters
          </CardTitle>
          <CardDescription>
            Evaluation data will be exported to these destinations
          </CardDescription>
        </CardHeader>
        <CardContent>
          {exportersQuery.isLoading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : exportersQuery.data && exportersQuery.data.length > 0 ? (
            <div className="space-y-4">
              {exportersQuery.data.map((exporter) => {
                const kindInfo = getKindInfo(exporter.kind);
                return (
                  <div
                    key={exporter.id}
                    className={`flex items-center justify-between p-4 border rounded-lg ${
                      exporter.enabled
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
                          <span className="font-medium">{exporter.name}</span>
                          <Badge variant={exporter.enabled ? 'success' : 'secondary'}>
                            {exporter.enabled ? 'Enabled' : 'Disabled'}
                          </Badge>
                          <Badge variant="secondary">{kindInfo.label}</Badge>
                        </div>
                        {exporter.description && (
                          <p className="text-sm text-zinc-500 mt-1">{exporter.description}</p>
                        )}
                        <p className="text-xs text-zinc-400 mt-1">
                          {getExporterSummary(exporter)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => startEdit(exporter)}
                        disabled={formMode !== null}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (confirm(`Delete exporter "${exporter.name}"?`)) {
                            deleteMutation.mutate(exporter.id);
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
              <p className="mt-4 text-zinc-500">No exporters configured</p>
              <p className="text-sm text-zinc-400 mt-1">
                Add an exporter to collect flag evaluation data
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
