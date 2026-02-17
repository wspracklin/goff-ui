'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users,
  Plus,
  Trash2,
  Loader2,
  Pencil,
  Search,
  Flag,
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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

interface Segment {
  id: string;
  name: string;
  description: string;
  rules: string[];
  createdAt: string;
  updatedAt: string;
}

interface SegmentUsage {
  segment: string;
  usage: { flagKey: string }[];
  count: number;
}

export default function SegmentsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editSegment, setEditSegment] = useState<Segment | null>(null);
  const [deleteSegment, setDeleteSegment] = useState<Segment | null>(null);
  const [usageSegment, setUsageSegment] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formRules, setFormRules] = useState<string[]>(['']);

  const segmentsQuery = useQuery({
    queryKey: ['segments', search],
    queryFn: async () => {
      const params = new URLSearchParams({ page: '1', pageSize: '100' });
      if (search) params.set('search', search);
      const res = await fetch(`/api/segments?${params}`);
      if (!res.ok) throw new Error('Failed to fetch segments');
      return res.json() as Promise<{ data: Segment[]; total: number }>;
    },
  });

  const usageQuery = useQuery({
    queryKey: ['segment-usage', usageSegment],
    queryFn: async () => {
      if (!usageSegment) return null;
      const res = await fetch(`/api/segments/${usageSegment}/usage`);
      if (!res.ok) throw new Error('Failed to fetch usage');
      return res.json() as Promise<SegmentUsage>;
    },
    enabled: !!usageSegment,
  });

  const createMutation = useMutation({
    mutationFn: async (seg: { name: string; description: string; rules: string[] }) => {
      const res = await fetch('/api/segments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(seg),
      });
      if (!res.ok) {
        const error = await res.text();
        throw new Error(error || 'Failed to create segment');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('Segment created');
      queryClient.invalidateQueries({ queryKey: ['segments'] });
      resetForm();
      setShowCreate(false);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed'),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...seg }: { id: string; name: string; description: string; rules: string[] }) => {
      const res = await fetch(`/api/segments/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(seg),
      });
      if (!res.ok) {
        const error = await res.text();
        throw new Error(error || 'Failed to update segment');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('Segment updated');
      queryClient.invalidateQueries({ queryKey: ['segments'] });
      resetForm();
      setEditSegment(null);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/segments/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete segment');
    },
    onSuccess: () => {
      toast.success('Segment deleted');
      queryClient.invalidateQueries({ queryKey: ['segments'] });
      setDeleteSegment(null);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed'),
  });

  const resetForm = () => {
    setFormName('');
    setFormDescription('');
    setFormRules(['']);
  };

  const openEdit = (seg: Segment) => {
    setFormName(seg.name);
    setFormDescription(seg.description);
    setFormRules(seg.rules.length > 0 ? seg.rules : ['']);
    setEditSegment(seg);
  };

  const addRule = () => setFormRules([...formRules, '']);
  const removeRule = (index: number) => setFormRules(formRules.filter((_, i) => i !== index));
  const updateRule = (index: number, value: string) => {
    const updated = [...formRules];
    updated[index] = value;
    setFormRules(updated);
  };

  const handleSave = () => {
    const rules = formRules.filter(r => r.trim());
    if (!formName.trim()) {
      toast.error('Name is required');
      return;
    }
    if (rules.length === 0) {
      toast.error('At least one rule is required');
      return;
    }

    if (editSegment) {
      updateMutation.mutate({ id: editSegment.id, name: formName.trim(), description: formDescription.trim(), rules });
    } else {
      createMutation.mutate({ name: formName.trim(), description: formDescription.trim(), rules });
    }
  };

  const isFormOpen = showCreate || !!editSegment;
  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Segments</h2>
          <p className="text-zinc-600 dark:text-zinc-400">
            Reusable targeting segments for feature flags
          </p>
        </div>
        <Button onClick={() => { resetForm(); setShowCreate(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          Create Segment
        </Button>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <Input
              placeholder="Search segments..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Segments List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Segments ({segmentsQuery.data?.total || 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {segmentsQuery.isLoading ? (
            <div className="flex justify-center py-8"><Spinner /></div>
          ) : segmentsQuery.data && segmentsQuery.data.data.length > 0 ? (
            <div className="space-y-3">
              {segmentsQuery.data.data.map(seg => (
                <div
                  key={seg.id}
                  className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{seg.name}</span>
                      <Badge variant="secondary">{seg.rules.length} rules</Badge>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setUsageSegment(seg.id)}>
                        <Flag className="h-4 w-4 mr-1" />
                        Usage
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => openEdit(seg)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteSegment(seg)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {seg.description && (
                    <p className="text-sm text-zinc-500 mb-2">{seg.description}</p>
                  )}
                  <div className="space-y-1">
                    {seg.rules.map((rule, i) => (
                      <pre key={i} className="text-xs p-2 bg-zinc-100 dark:bg-zinc-800 rounded overflow-x-auto">
                        {rule}
                      </pre>
                    ))}
                  </div>
                  <p className="text-xs text-zinc-400 mt-2">
                    Use in targeting rules as: <code className="bg-zinc-100 dark:bg-zinc-800 px-1 rounded">segment:{seg.name}</code>
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Users className="mx-auto h-12 w-12 text-zinc-300 dark:text-zinc-700" />
              <p className="mt-4 text-zinc-500">No segments found</p>
              <p className="mt-2 text-sm text-zinc-400">
                Create segments to reuse targeting rules across multiple flags
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={isFormOpen} onOpenChange={() => { setShowCreate(false); setEditSegment(null); resetForm(); }}>
        <DialogHeader>
          <DialogTitle>{editSegment ? 'Edit Segment' : 'Create Segment'}</DialogTitle>
          <DialogDescription>
            Define a reusable set of targeting rules
          </DialogDescription>
        </DialogHeader>
        <DialogContent>
          <div className="space-y-4">
            <div>
              <Label htmlFor="segName">Name *</Label>
              <Input
                id="segName"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g., beta-users"
              />
            </div>
            <div>
              <Label htmlFor="segDesc">Description</Label>
              <Textarea
                id="segDesc"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="What does this segment target?"
                rows={2}
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Rules (query strings)</Label>
                <Button variant="outline" size="sm" onClick={addRule}>
                  <Plus className="h-3 w-3 mr-1" />
                  Add Rule
                </Button>
              </div>
              <div className="space-y-2">
                {formRules.map((rule, i) => (
                  <div key={i} className="flex gap-2">
                    <Input
                      value={rule}
                      onChange={(e) => updateRule(i, e.target.value)}
                      placeholder='e.g., email co "@acme.com"'
                      className="font-mono text-sm"
                    />
                    {formRules.length > 1 && (
                      <Button variant="ghost" size="sm" onClick={() => removeRule(i)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-xs text-zinc-500 mt-2">
                Rules are joined with &quot;or&quot; when expanded in targeting queries
              </p>
            </div>
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => { setShowCreate(false); setEditSegment(null); resetForm(); }}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {editSegment ? 'Update' : 'Create'}
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteSegment} onOpenChange={() => setDeleteSegment(null)}>
        <DialogHeader>
          <DialogTitle>Delete Segment</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete &quot;{deleteSegment?.name}&quot;?
          </DialogDescription>
        </DialogHeader>
        <DialogContent>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Flags referencing this segment will no longer have their targeting rules expanded.
          </p>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setDeleteSegment(null)}>Cancel</Button>
          <Button
            variant="destructive"
            onClick={() => deleteSegment && deleteMutation.mutate(deleteSegment.id)}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Delete
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Usage Dialog */}
      <Dialog open={!!usageSegment} onOpenChange={() => setUsageSegment(null)}>
        <DialogHeader>
          <DialogTitle>Segment Usage</DialogTitle>
          <DialogDescription>Flags that reference this segment</DialogDescription>
        </DialogHeader>
        <DialogContent>
          {usageQuery.isLoading ? (
            <div className="flex justify-center py-4"><Spinner /></div>
          ) : usageQuery.data ? (
            usageQuery.data.count > 0 ? (
              <div className="space-y-2">
                {usageQuery.data.usage.map((u, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 rounded bg-zinc-100 dark:bg-zinc-800">
                    <Flag className="h-4 w-4 text-blue-500" />
                    <span className="font-mono text-sm">{u.flagKey}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-zinc-500">No flags reference this segment yet.</p>
            )
          ) : null}
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setUsageSegment(null)}>Close</Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
