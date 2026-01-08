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
  Bell,
  Upload,
  ChevronDown,
  ChevronUp,
  Cloud,
  GitBranch,
  HardDrive,
  MessageSquare,
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
  // S3
  bucket?: string;
  item?: string;
  // GitHub/GitLab/Bitbucket
  repositorySlug?: string;
  branch?: string;
  token?: string;
  // Kubernetes
  namespace?: string;
  configmap?: string;
  // Database
  connectionString?: string;
  database?: string;
  collection?: string;
  prefix?: string;
}

interface FlagSetExporter {
  kind: string;
  endpointUrl?: string;
  flushInterval?: number;
  // S3/GCS/Azure
  bucket?: string;
  // Kafka
  topic?: string;
  brokers?: string;
  // SQS
  queueUrl?: string;
}

interface FlagSetNotifier {
  kind: string;
  slackWebhookUrl?: string;
  discordWebhookUrl?: string;
  teamsWebhookUrl?: string;
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

// All 12 retriever types from GO Feature Flag documentation
type RetrieverKind = 'file' | 'http' | 's3' | 'gcs' | 'azure' | 'github' | 'gitlab' | 'bitbucket' | 'kubernetes' | 'mongodb' | 'redis' | 'postgresql';

const retrieverKindLabels: Record<RetrieverKind, string> = {
  file: 'File System',
  http: 'HTTP(S)',
  s3: 'AWS S3',
  gcs: 'Google Cloud Storage',
  azure: 'Azure Blob Storage',
  github: 'GitHub',
  gitlab: 'GitLab',
  bitbucket: 'Bitbucket',
  kubernetes: 'Kubernetes ConfigMap',
  mongodb: 'MongoDB',
  redis: 'Redis',
  postgresql: 'PostgreSQL',
};

const retrieverKindIcons: Record<RetrieverKind, React.ReactNode> = {
  file: <FileText className="h-4 w-4" />,
  http: <Globe className="h-4 w-4" />,
  s3: <Cloud className="h-4 w-4" />,
  gcs: <Cloud className="h-4 w-4" />,
  azure: <Cloud className="h-4 w-4" />,
  github: <GitBranch className="h-4 w-4" />,
  gitlab: <GitBranch className="h-4 w-4" />,
  bitbucket: <GitBranch className="h-4 w-4" />,
  kubernetes: <HardDrive className="h-4 w-4" />,
  mongodb: <Database className="h-4 w-4" />,
  redis: <Database className="h-4 w-4" />,
  postgresql: <Database className="h-4 w-4" />,
};

// Exporter types from GO Feature Flag documentation
type ExporterKind = 'webhook' | 'file' | 'log' | 's3' | 'gcs' | 'azure' | 'kafka' | 'kinesis' | 'pubsub' | 'sqs' | 'opentelemetry';

const exporterKindLabels: Record<ExporterKind, string> = {
  webhook: 'Webhook',
  file: 'File System',
  log: 'Application Log',
  s3: 'AWS S3',
  gcs: 'Google Cloud Storage',
  azure: 'Azure Blob Storage',
  kafka: 'Apache Kafka',
  kinesis: 'AWS Kinesis',
  pubsub: 'Google Cloud PubSub',
  sqs: 'AWS SQS',
  opentelemetry: 'OpenTelemetry',
};

// Notifier types from GO Feature Flag documentation
type NotifierKind = 'slack' | 'discord' | 'teams' | 'webhook';

const notifierKindLabels: Record<NotifierKind, string> = {
  slack: 'Slack',
  discord: 'Discord',
  teams: 'Microsoft Teams',
  webhook: 'Webhook',
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

  // Additional retriever fields
  const [formRetrieverBucket, setFormRetrieverBucket] = useState('');
  const [formRetrieverItem, setFormRetrieverItem] = useState('');
  const [formRetrieverRepoSlug, setFormRetrieverRepoSlug] = useState('');
  const [formRetrieverBranch, setFormRetrieverBranch] = useState('main');
  const [formRetrieverToken, setFormRetrieverToken] = useState('');
  const [formRetrieverNamespace, setFormRetrieverNamespace] = useState('default');
  const [formRetrieverConfigmap, setFormRetrieverConfigmap] = useState('');
  const [formRetrieverConnString, setFormRetrieverConnString] = useState('');
  const [formRetrieverDatabase, setFormRetrieverDatabase] = useState('');
  const [formRetrieverCollection, setFormRetrieverCollection] = useState('');
  const [formRetrieverPrefix, setFormRetrieverPrefix] = useState('');

  // Exporter form state
  const [formExporterEnabled, setFormExporterEnabled] = useState(false);
  const [formExporterKind, setFormExporterKind] = useState<ExporterKind>('webhook');
  const [formExporterEndpoint, setFormExporterEndpoint] = useState('');
  const [formExporterFlushInterval, setFormExporterFlushInterval] = useState('60000');
  const [formExporterBucket, setFormExporterBucket] = useState('');
  const [formExporterTopic, setFormExporterTopic] = useState('');
  const [formExporterBrokers, setFormExporterBrokers] = useState('');
  const [formExporterQueueUrl, setFormExporterQueueUrl] = useState('');

  // Notifier form state
  const [formNotifierEnabled, setFormNotifierEnabled] = useState(false);
  const [formNotifierKind, setFormNotifierKind] = useState<NotifierKind>('slack');
  const [formNotifierSlackUrl, setFormNotifierSlackUrl] = useState('');
  const [formNotifierDiscordUrl, setFormNotifierDiscordUrl] = useState('');
  const [formNotifierTeamsUrl, setFormNotifierTeamsUrl] = useState('');
  const [formNotifierWebhookUrl, setFormNotifierWebhookUrl] = useState('');

  // Advanced section toggle
  const [showAdvanced, setShowAdvanced] = useState(false);

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
    // Retriever fields
    setFormRetrieverBucket('');
    setFormRetrieverItem('');
    setFormRetrieverRepoSlug('');
    setFormRetrieverBranch('main');
    setFormRetrieverToken('');
    setFormRetrieverNamespace('default');
    setFormRetrieverConfigmap('');
    setFormRetrieverConnString('');
    setFormRetrieverDatabase('');
    setFormRetrieverCollection('');
    setFormRetrieverPrefix('');
    // Exporter fields
    setFormExporterEnabled(false);
    setFormExporterKind('webhook');
    setFormExporterEndpoint('');
    setFormExporterFlushInterval('60000');
    setFormExporterBucket('');
    setFormExporterTopic('');
    setFormExporterBrokers('');
    setFormExporterQueueUrl('');
    // Notifier fields
    setFormNotifierEnabled(false);
    setFormNotifierKind('slack');
    setFormNotifierSlackUrl('');
    setFormNotifierDiscordUrl('');
    setFormNotifierTeamsUrl('');
    setFormNotifierWebhookUrl('');
    setShowAdvanced(false);
  };

  const openEditDialog = (flagSet: FlagSet) => {
    setFormName(flagSet.name);
    setFormDescription(flagSet.description || '');
    setFormRetrieverKind((flagSet.retriever.kind as RetrieverKind) || 'file');
    setFormRetrieverPath(flagSet.retriever.path || '');
    setFormRetrieverUrl(flagSet.retriever.url || '');
    setFormPollingInterval(String(flagSet.retriever.pollingInterval || 30000));
    setFormIsDefault(flagSet.isDefault);

    // Additional retriever fields
    setFormRetrieverBucket(flagSet.retriever.bucket || '');
    setFormRetrieverItem(flagSet.retriever.item || '');
    setFormRetrieverRepoSlug(flagSet.retriever.repositorySlug || '');
    setFormRetrieverBranch(flagSet.retriever.branch || 'main');
    setFormRetrieverToken(flagSet.retriever.token || '');
    setFormRetrieverNamespace(flagSet.retriever.namespace || 'default');
    setFormRetrieverConfigmap(flagSet.retriever.configmap || '');
    setFormRetrieverConnString(flagSet.retriever.connectionString || '');
    setFormRetrieverDatabase(flagSet.retriever.database || '');
    setFormRetrieverCollection(flagSet.retriever.collection || '');
    setFormRetrieverPrefix(flagSet.retriever.prefix || '');

    // Exporter
    if (flagSet.exporter) {
      setFormExporterEnabled(true);
      setFormExporterKind((flagSet.exporter.kind as ExporterKind) || 'webhook');
      setFormExporterEndpoint(flagSet.exporter.endpointUrl || '');
      setFormExporterFlushInterval(String(flagSet.exporter.flushInterval || 60000));
      setFormExporterBucket(flagSet.exporter.bucket || '');
      setFormExporterTopic(flagSet.exporter.topic || '');
      setFormExporterBrokers(flagSet.exporter.brokers || '');
      setFormExporterQueueUrl(flagSet.exporter.queueUrl || '');
      setShowAdvanced(true);
    } else {
      setFormExporterEnabled(false);
    }

    // Notifier
    if (flagSet.notifier) {
      setFormNotifierEnabled(true);
      setFormNotifierKind((flagSet.notifier.kind as NotifierKind) || 'slack');
      setFormNotifierSlackUrl(flagSet.notifier.slackWebhookUrl || '');
      setFormNotifierDiscordUrl(flagSet.notifier.discordWebhookUrl || '');
      setFormNotifierTeamsUrl(flagSet.notifier.teamsWebhookUrl || '');
      setFormNotifierWebhookUrl(flagSet.notifier.endpointUrl || '');
      setShowAdvanced(true);
    } else {
      setFormNotifierEnabled(false);
    }

    setEditingFlagSet(flagSet);
  };

  const handleSubmit = () => {
    const retriever: FlagSetRetriever = {
      kind: formRetrieverKind,
      pollingInterval: parseInt(formPollingInterval) || 30000,
    };

    // Set retriever-specific fields based on kind
    switch (formRetrieverKind) {
      case 'file':
        retriever.path = formRetrieverPath;
        break;
      case 'http':
        retriever.url = formRetrieverUrl;
        break;
      case 's3':
      case 'gcs':
      case 'azure':
        retriever.bucket = formRetrieverBucket;
        retriever.item = formRetrieverItem;
        break;
      case 'github':
      case 'gitlab':
      case 'bitbucket':
        retriever.repositorySlug = formRetrieverRepoSlug;
        retriever.branch = formRetrieverBranch;
        retriever.path = formRetrieverPath;
        if (formRetrieverToken) retriever.token = formRetrieverToken;
        break;
      case 'kubernetes':
        retriever.namespace = formRetrieverNamespace;
        retriever.configmap = formRetrieverConfigmap;
        break;
      case 'mongodb':
        retriever.connectionString = formRetrieverConnString;
        retriever.database = formRetrieverDatabase;
        retriever.collection = formRetrieverCollection;
        break;
      case 'redis':
        retriever.connectionString = formRetrieverConnString;
        retriever.prefix = formRetrieverPrefix;
        break;
      case 'postgresql':
        retriever.connectionString = formRetrieverConnString;
        break;
    }

    // Build exporter if enabled
    let exporter: FlagSetExporter | undefined;
    if (formExporterEnabled) {
      exporter = {
        kind: formExporterKind,
        flushInterval: parseInt(formExporterFlushInterval) || 60000,
      };

      switch (formExporterKind) {
        case 'webhook':
          exporter.endpointUrl = formExporterEndpoint;
          break;
        case 's3':
        case 'gcs':
        case 'azure':
          exporter.bucket = formExporterBucket;
          break;
        case 'kafka':
          exporter.topic = formExporterTopic;
          exporter.brokers = formExporterBrokers;
          break;
        case 'kinesis':
        case 'pubsub':
          exporter.topic = formExporterTopic;
          break;
        case 'sqs':
          exporter.queueUrl = formExporterQueueUrl;
          break;
      }
    }

    // Build notifier if enabled
    let notifier: FlagSetNotifier | undefined;
    if (formNotifierEnabled) {
      notifier = {
        kind: formNotifierKind,
      };
      switch (formNotifierKind) {
        case 'slack':
          notifier.slackWebhookUrl = formNotifierSlackUrl;
          break;
        case 'discord':
          notifier.discordWebhookUrl = formNotifierDiscordUrl;
          break;
        case 'teams':
          notifier.teamsWebhookUrl = formNotifierTeamsUrl;
          break;
        case 'webhook':
          notifier.endpointUrl = formNotifierWebhookUrl;
          break;
      }
    }

    const flagSet: Partial<FlagSet> = {
      name: formName,
      description: formDescription || undefined,
      retriever,
      exporter,
      notifier,
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
                    <div className="flex items-center gap-2 flex-wrap">
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
                      {flagSet.exporter && (
                        <Badge variant="secondary" className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                          <Upload className="h-3 w-3 mr-1" />
                          Exporter
                        </Badge>
                      )}
                      {flagSet.notifier && (
                        <Badge variant="secondary" className="text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                          <Bell className="h-3 w-3 mr-1" />
                          Notifier
                        </Badge>
                      )}
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
              <select
                value={formRetrieverKind}
                onChange={(e) => setFormRetrieverKind(e.target.value as RetrieverKind)}
                className="mt-2 flex h-10 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                <optgroup label="Local">
                  <option value="file">File System</option>
                </optgroup>
                <optgroup label="Remote">
                  <option value="http">HTTP(S)</option>
                </optgroup>
                <optgroup label="Cloud Storage">
                  <option value="s3">AWS S3</option>
                  <option value="gcs">Google Cloud Storage</option>
                  <option value="azure">Azure Blob Storage</option>
                </optgroup>
                <optgroup label="Git Repositories">
                  <option value="github">GitHub</option>
                  <option value="gitlab">GitLab</option>
                  <option value="bitbucket">Bitbucket</option>
                </optgroup>
                <optgroup label="Container">
                  <option value="kubernetes">Kubernetes ConfigMap</option>
                </optgroup>
                <optgroup label="Databases">
                  <option value="mongodb">MongoDB</option>
                  <option value="redis">Redis</option>
                  <option value="postgresql">PostgreSQL</option>
                </optgroup>
              </select>
              <p className="mt-1 text-xs text-zinc-500 flex items-center gap-1">
                {retrieverKindIcons[formRetrieverKind]}
                {retrieverKindLabels[formRetrieverKind]}
              </p>
            </div>

            {/* File retriever */}
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

            {/* HTTP retriever */}
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

            {/* S3/GCS/Azure retriever */}
            {['s3', 'gcs', 'azure'].includes(formRetrieverKind) && (
              <div className="space-y-3">
                <div>
                  <Label htmlFor="bucket">Bucket Name *</Label>
                  <Input
                    id="bucket"
                    value={formRetrieverBucket}
                    onChange={(e) => setFormRetrieverBucket(e.target.value)}
                    placeholder="my-feature-flags-bucket"
                  />
                </div>
                <div>
                  <Label htmlFor="item">Object/Item Path *</Label>
                  <Input
                    id="item"
                    value={formRetrieverItem}
                    onChange={(e) => setFormRetrieverItem(e.target.value)}
                    placeholder="flags/config.yaml"
                  />
                </div>
                <p className="text-xs text-zinc-500">
                  {formRetrieverKind === 's3' && 'Configure AWS credentials via environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)'}
                  {formRetrieverKind === 'gcs' && 'Configure GCP credentials via GOOGLE_APPLICATION_CREDENTIALS'}
                  {formRetrieverKind === 'azure' && 'Configure Azure credentials via environment variables'}
                </p>
              </div>
            )}

            {/* GitHub/GitLab/Bitbucket retriever */}
            {['github', 'gitlab', 'bitbucket'].includes(formRetrieverKind) && (
              <div className="space-y-3">
                <div>
                  <Label htmlFor="repoSlug">Repository Slug *</Label>
                  <Input
                    id="repoSlug"
                    value={formRetrieverRepoSlug}
                    onChange={(e) => setFormRetrieverRepoSlug(e.target.value)}
                    placeholder={formRetrieverKind === 'github' ? 'owner/repo' : 'project-id'}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="branch">Branch</Label>
                    <Input
                      id="branch"
                      value={formRetrieverBranch}
                      onChange={(e) => setFormRetrieverBranch(e.target.value)}
                      placeholder="main"
                    />
                  </div>
                  <div>
                    <Label htmlFor="filePath">File Path *</Label>
                    <Input
                      id="filePath"
                      value={formRetrieverPath}
                      onChange={(e) => setFormRetrieverPath(e.target.value)}
                      placeholder="config/flags.yaml"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="token">Access Token</Label>
                  <Input
                    id="token"
                    type="password"
                    value={formRetrieverToken}
                    onChange={(e) => setFormRetrieverToken(e.target.value)}
                    placeholder="ghp_xxxx or glpat-xxxx"
                  />
                  <p className="mt-1 text-xs text-zinc-500">Required for private repositories</p>
                </div>
              </div>
            )}

            {/* Kubernetes retriever */}
            {formRetrieverKind === 'kubernetes' && (
              <div className="space-y-3">
                <div>
                  <Label htmlFor="namespace">Namespace</Label>
                  <Input
                    id="namespace"
                    value={formRetrieverNamespace}
                    onChange={(e) => setFormRetrieverNamespace(e.target.value)}
                    placeholder="default"
                  />
                </div>
                <div>
                  <Label htmlFor="configmap">ConfigMap Name *</Label>
                  <Input
                    id="configmap"
                    value={formRetrieverConfigmap}
                    onChange={(e) => setFormRetrieverConfigmap(e.target.value)}
                    placeholder="feature-flags-config"
                  />
                </div>
              </div>
            )}

            {/* MongoDB retriever */}
            {formRetrieverKind === 'mongodb' && (
              <div className="space-y-3">
                <div>
                  <Label htmlFor="connString">Connection String *</Label>
                  <Input
                    id="connString"
                    type="password"
                    value={formRetrieverConnString}
                    onChange={(e) => setFormRetrieverConnString(e.target.value)}
                    placeholder="mongodb://localhost:27017"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="database">Database *</Label>
                    <Input
                      id="database"
                      value={formRetrieverDatabase}
                      onChange={(e) => setFormRetrieverDatabase(e.target.value)}
                      placeholder="featureflags"
                    />
                  </div>
                  <div>
                    <Label htmlFor="collection">Collection *</Label>
                    <Input
                      id="collection"
                      value={formRetrieverCollection}
                      onChange={(e) => setFormRetrieverCollection(e.target.value)}
                      placeholder="flags"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Redis retriever */}
            {formRetrieverKind === 'redis' && (
              <div className="space-y-3">
                <div>
                  <Label htmlFor="connString">Connection String *</Label>
                  <Input
                    id="connString"
                    type="password"
                    value={formRetrieverConnString}
                    onChange={(e) => setFormRetrieverConnString(e.target.value)}
                    placeholder="redis://localhost:6379"
                  />
                </div>
                <div>
                  <Label htmlFor="prefix">Key Prefix</Label>
                  <Input
                    id="prefix"
                    value={formRetrieverPrefix}
                    onChange={(e) => setFormRetrieverPrefix(e.target.value)}
                    placeholder="goff:"
                  />
                </div>
              </div>
            )}

            {/* PostgreSQL retriever */}
            {formRetrieverKind === 'postgresql' && (
              <div>
                <Label htmlFor="connString">Connection String *</Label>
                <Input
                  id="connString"
                  type="password"
                  value={formRetrieverConnString}
                  onChange={(e) => setFormRetrieverConnString(e.target.value)}
                  placeholder="postgres://user:pass@localhost:5432/dbname"
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

            {/* Advanced Settings Toggle */}
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
            >
              {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              <span>Advanced Settings (Exporter & Notifier)</span>
            </button>

            {showAdvanced && (
              <div className="space-y-4 border-t border-zinc-200 dark:border-zinc-700 pt-4">
                {/* Exporter Configuration */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Upload className="h-4 w-4 text-zinc-500" />
                    <span className="text-sm font-medium">Data Exporter</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="exporterEnabled"
                      checked={formExporterEnabled}
                      onChange={(e) => setFormExporterEnabled(e.target.checked)}
                      className="rounded"
                    />
                    <Label htmlFor="exporterEnabled" className="cursor-pointer text-sm">
                      Enable data export (evaluation events)
                    </Label>
                  </div>

                  {formExporterEnabled && (
                    <div className="space-y-3 ml-6">
                      <div>
                        <Label>Exporter Type</Label>
                        <select
                          value={formExporterKind}
                          onChange={(e) => setFormExporterKind(e.target.value as ExporterKind)}
                          className="mt-2 flex h-10 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                        >
                          <optgroup label="Basic">
                            <option value="webhook">Webhook</option>
                            <option value="file">File System</option>
                            <option value="log">Application Log</option>
                          </optgroup>
                          <optgroup label="Cloud Storage">
                            <option value="s3">AWS S3</option>
                            <option value="gcs">Google Cloud Storage</option>
                            <option value="azure">Azure Blob Storage</option>
                          </optgroup>
                          <optgroup label="Message Queues">
                            <option value="kafka">Apache Kafka</option>
                            <option value="kinesis">AWS Kinesis</option>
                            <option value="pubsub">Google Cloud PubSub</option>
                            <option value="sqs">AWS SQS</option>
                          </optgroup>
                          <optgroup label="Observability">
                            <option value="opentelemetry">OpenTelemetry</option>
                          </optgroup>
                        </select>
                        <p className="mt-1 text-xs text-zinc-500">{exporterKindLabels[formExporterKind]}</p>
                      </div>

                      {formExporterKind === 'webhook' && (
                        <div>
                          <Label htmlFor="exporterEndpoint">Webhook URL</Label>
                          <Input
                            id="exporterEndpoint"
                            value={formExporterEndpoint}
                            onChange={(e) => setFormExporterEndpoint(e.target.value)}
                            placeholder="https://api.example.com/events"
                          />
                        </div>
                      )}

                      {['s3', 'gcs', 'azure'].includes(formExporterKind) && (
                        <div>
                          <Label htmlFor="exporterBucket">Bucket Name *</Label>
                          <Input
                            id="exporterBucket"
                            value={formExporterBucket}
                            onChange={(e) => setFormExporterBucket(e.target.value)}
                            placeholder="my-evaluation-data-bucket"
                          />
                        </div>
                      )}

                      {formExporterKind === 'kafka' && (
                        <div className="space-y-3">
                          <div>
                            <Label htmlFor="exporterTopic">Kafka Topic *</Label>
                            <Input
                              id="exporterTopic"
                              value={formExporterTopic}
                              onChange={(e) => setFormExporterTopic(e.target.value)}
                              placeholder="feature-flag-events"
                            />
                          </div>
                          <div>
                            <Label htmlFor="exporterBrokers">Brokers</Label>
                            <Input
                              id="exporterBrokers"
                              value={formExporterBrokers}
                              onChange={(e) => setFormExporterBrokers(e.target.value)}
                              placeholder="localhost:9092"
                            />
                          </div>
                        </div>
                      )}

                      {['kinesis', 'pubsub'].includes(formExporterKind) && (
                        <div>
                          <Label htmlFor="exporterTopic">
                            {formExporterKind === 'kinesis' ? 'Stream Name *' : 'Topic Name *'}
                          </Label>
                          <Input
                            id="exporterTopic"
                            value={formExporterTopic}
                            onChange={(e) => setFormExporterTopic(e.target.value)}
                            placeholder={formExporterKind === 'kinesis' ? 'feature-flag-stream' : 'projects/*/topics/feature-flags'}
                          />
                        </div>
                      )}

                      {formExporterKind === 'sqs' && (
                        <div>
                          <Label htmlFor="exporterQueueUrl">Queue URL *</Label>
                          <Input
                            id="exporterQueueUrl"
                            value={formExporterQueueUrl}
                            onChange={(e) => setFormExporterQueueUrl(e.target.value)}
                            placeholder="https://sqs.us-east-1.amazonaws.com/123456789/my-queue"
                          />
                        </div>
                      )}

                      <div>
                        <Label htmlFor="exporterFlushInterval">Flush Interval (ms)</Label>
                        <Input
                          id="exporterFlushInterval"
                          type="number"
                          value={formExporterFlushInterval}
                          onChange={(e) => setFormExporterFlushInterval(e.target.value)}
                          placeholder="60000"
                        />
                        <p className="mt-1 text-xs text-zinc-500">
                          How often to send batched events (default: 60 seconds)
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Notifier Configuration */}
                <div className="space-y-3 border-t border-zinc-200 dark:border-zinc-700 pt-3">
                  <div className="flex items-center gap-2">
                    <Bell className="h-4 w-4 text-zinc-500" />
                    <span className="text-sm font-medium">Change Notifier</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="notifierEnabled"
                      checked={formNotifierEnabled}
                      onChange={(e) => setFormNotifierEnabled(e.target.checked)}
                      className="rounded"
                    />
                    <Label htmlFor="notifierEnabled" className="cursor-pointer text-sm">
                      Enable flag change notifications
                    </Label>
                  </div>

                  {formNotifierEnabled && (
                    <div className="space-y-3 ml-6">
                      <div>
                        <Label>Notifier Type</Label>
                        <div className="grid grid-cols-2 gap-2 mt-2">
                          {(['slack', 'discord', 'teams', 'webhook'] as const).map((kind) => (
                            <button
                              key={kind}
                              type="button"
                              onClick={() => setFormNotifierKind(kind)}
                              className={`p-2 rounded-lg border-2 transition-all text-sm flex items-center justify-center gap-2 ${
                                formNotifierKind === kind
                                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
                                  : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300'
                              }`}
                            >
                              <MessageSquare className="h-4 w-4" />
                              {notifierKindLabels[kind]}
                            </button>
                          ))}
                        </div>
                      </div>

                      {formNotifierKind === 'slack' && (
                        <div>
                          <Label htmlFor="notifierSlackUrl">Slack Webhook URL</Label>
                          <Input
                            id="notifierSlackUrl"
                            value={formNotifierSlackUrl}
                            onChange={(e) => setFormNotifierSlackUrl(e.target.value)}
                            placeholder="https://hooks.slack.com/services/..."
                          />
                          <p className="mt-1 text-xs text-zinc-500">
                            Create an incoming webhook in your Slack workspace settings
                          </p>
                        </div>
                      )}

                      {formNotifierKind === 'discord' && (
                        <div>
                          <Label htmlFor="notifierDiscordUrl">Discord Webhook URL</Label>
                          <Input
                            id="notifierDiscordUrl"
                            value={formNotifierDiscordUrl}
                            onChange={(e) => setFormNotifierDiscordUrl(e.target.value)}
                            placeholder="https://discord.com/api/webhooks/..."
                          />
                          <p className="mt-1 text-xs text-zinc-500">
                            Create a webhook in your Discord server&apos;s channel settings
                          </p>
                        </div>
                      )}

                      {formNotifierKind === 'teams' && (
                        <div>
                          <Label htmlFor="notifierTeamsUrl">Microsoft Teams Webhook URL</Label>
                          <Input
                            id="notifierTeamsUrl"
                            value={formNotifierTeamsUrl}
                            onChange={(e) => setFormNotifierTeamsUrl(e.target.value)}
                            placeholder="https://outlook.office.com/webhook/..."
                          />
                          <p className="mt-1 text-xs text-zinc-500">
                            Create an incoming webhook connector in your Teams channel
                          </p>
                        </div>
                      )}

                      {formNotifierKind === 'webhook' && (
                        <div>
                          <Label htmlFor="notifierWebhookUrl">Webhook URL</Label>
                          <Input
                            id="notifierWebhookUrl"
                            value={formNotifierWebhookUrl}
                            onChange={(e) => setFormNotifierWebhookUrl(e.target.value)}
                            placeholder="https://api.example.com/notifications"
                          />
                          <p className="mt-1 text-xs text-zinc-500">
                            Custom webhook endpoint that receives JSON payloads on flag changes
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
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
