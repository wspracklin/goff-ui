'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ClipboardList,
  ChevronLeft,
  ChevronRight,
  Search,
  Filter,
  Loader2,
  AlertCircle,
  Download,
  ChevronDown,
  ChevronUp,
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
import { Badge } from '@/components/ui/badge';

interface AuditEvent {
  id: string;
  timestamp: string;
  actorId?: string;
  actorEmail?: string;
  actorName?: string;
  actorType?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  resourceName?: string;
  project?: string;
  changes?: {
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
  };
  metadata?: Record<string, unknown>;
}

interface AuditResponse {
  data: AuditEvent[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const ACTION_COLORS: Record<string, string> = {
  'flag.created': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  'flag.updated': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  'flag.deleted': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  'flag.toggled': 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  'project.created': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  'project.deleted': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  'flagset.created': 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  'flagset.updated': 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  'flagset.deleted': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

const RESOURCE_TYPE_OPTIONS = ['flag', 'project', 'flagset', 'notifier', 'exporter', 'retriever', 'integration'];

export default function AuditPage() {
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [resourceTypeFilter, setResourceTypeFilter] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);

  const buildQueryString = () => {
    const params = new URLSearchParams();
    params.set('page', page.toString());
    params.set('pageSize', pageSize.toString());
    if (search) params.set('search', search);
    if (actionFilter) params.set('action', actionFilter);
    if (resourceTypeFilter) params.set('resource_type', resourceTypeFilter);
    return params.toString();
  };

  const auditQuery = useQuery({
    queryKey: ['audit', page, pageSize, search, actionFilter, resourceTypeFilter],
    queryFn: async () => {
      const res = await fetch(`/api/audit?${buildQueryString()}`);
      if (!res.ok) throw new Error('Failed to fetch audit events');
      return res.json() as Promise<AuditResponse>;
    },
  });

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const formatAction = (action: string) => {
    return action.replace('.', ' ').replace(/\b\w/g, (l) => l.toUpperCase());
  };

  const getActionBadgeClass = (action: string) => {
    return ACTION_COLORS[action] || 'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200';
  };

  const handleExport = (format: 'csv' | 'json') => {
    const params = new URLSearchParams();
    params.set('format', format);
    if (search) params.set('search', search);
    if (actionFilter) params.set('action', actionFilter);
    if (resourceTypeFilter) params.set('resource_type', resourceTypeFilter);
    window.open(`/api/audit/export?${params.toString()}`, '_blank');
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
  };

  const data = auditQuery.data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Audit Log</h2>
          <p className="text-zinc-600 dark:text-zinc-400">
            Track all changes to flags, projects, and configurations
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => handleExport('csv')}>
            <Download className="h-4 w-4 mr-2" />
            CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport('json')}>
            <Download className="h-4 w-4 mr-2" />
            JSON
          </Button>
        </div>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center gap-3">
            <form onSubmit={handleSearch} className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by actor, resource, or action..."
                className="pl-10"
              />
            </form>
            <Button
              variant={showFilters ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className="h-4 w-4 mr-2" />
              Filters
            </Button>
          </div>

          {showFilters && (
            <div className="flex items-center gap-4 mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-800">
              <div className="flex-1">
                <label className="text-xs font-medium text-zinc-500 mb-1 block">Resource Type</label>
                <select
                  value={resourceTypeFilter}
                  onChange={(e) => {
                    setResourceTypeFilter(e.target.value);
                    setPage(1);
                  }}
                  className="flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 py-1 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <option value="">All types</option>
                  {RESOURCE_TYPE_OPTIONS.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="text-xs font-medium text-zinc-500 mb-1 block">Action</label>
                <Input
                  value={actionFilter}
                  onChange={(e) => {
                    setActionFilter(e.target.value);
                    setPage(1);
                  }}
                  placeholder="e.g., flag.created"
                  className="h-9"
                />
              </div>
              {(actionFilter || resourceTypeFilter) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-5"
                  onClick={() => {
                    setActionFilter('');
                    setResourceTypeFilter('');
                    setPage(1);
                  }}
                >
                  Clear
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Audit Events */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            Events
          </CardTitle>
          {data && (
            <CardDescription>
              Showing {((data.page - 1) * data.pageSize) + 1}-{Math.min(data.page * data.pageSize, data.total)} of {data.total} events
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {auditQuery.isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
            </div>
          ) : auditQuery.error ? (
            <div className="flex items-center gap-2 text-red-500 py-4">
              <AlertCircle className="h-5 w-5" />
              <span>Failed to load audit events. The audit feature requires PostgreSQL.</span>
            </div>
          ) : data && data.data.length > 0 ? (
            <div className="space-y-2">
              {data.data.map((event) => (
                <div
                  key={event.id}
                  className="rounded-lg border border-zinc-200 dark:border-zinc-800"
                >
                  <button
                    onClick={() => toggleExpanded(event.id)}
                    className="flex w-full items-center justify-between p-4 text-left hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors"
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${getActionBadgeClass(event.action)}`}>
                        {formatAction(event.action)}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">
                            {event.resourceName || event.resourceId || 'Unknown'}
                          </span>
                          <Badge variant="secondary" className="text-xs shrink-0">
                            {event.resourceType}
                          </Badge>
                          {event.project && (
                            <Badge variant="secondary" className="text-xs shrink-0">
                              {event.project}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-zinc-500 mt-1">
                          <span>
                            {event.actorName || event.actorEmail || event.actorType || 'system'}
                          </span>
                          <span>&middot;</span>
                          <span>{formatDate(event.timestamp)}</span>
                        </div>
                      </div>
                    </div>
                    {event.changes ? (
                      expandedIds.has(event.id) ? (
                        <ChevronUp className="h-4 w-4 text-zinc-400 shrink-0" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-zinc-400 shrink-0" />
                      )
                    ) : null}
                  </button>

                  {expandedIds.has(event.id) && event.changes && (
                    <div className="border-t border-zinc-200 dark:border-zinc-800 p-4 bg-zinc-50 dark:bg-zinc-900/50">
                      <div className="grid grid-cols-2 gap-4">
                        {event.changes.before && (
                          <div>
                            <h4 className="text-xs font-medium text-zinc-500 mb-2">Before</h4>
                            <pre className="text-xs bg-white dark:bg-zinc-950 rounded-md p-3 overflow-auto max-h-64 border border-zinc-200 dark:border-zinc-800">
                              {JSON.stringify(event.changes.before, null, 2)}
                            </pre>
                          </div>
                        )}
                        {event.changes.after && (
                          <div>
                            <h4 className="text-xs font-medium text-zinc-500 mb-2">After</h4>
                            <pre className="text-xs bg-white dark:bg-zinc-950 rounded-md p-3 overflow-auto max-h-64 border border-zinc-200 dark:border-zinc-800">
                              {JSON.stringify(event.changes.after, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <ClipboardList className="mx-auto h-12 w-12 text-zinc-300 dark:text-zinc-700" />
              <p className="mt-4 text-zinc-500">No audit events found</p>
              <p className="mt-1 text-sm text-zinc-400">
                {search || actionFilter || resourceTypeFilter
                  ? 'Try adjusting your filters'
                  : 'Events will appear here as changes are made'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-zinc-500">
            Page {data.page} of {data.totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
              disabled={page >= data.totalPages}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
