'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  GitPullRequest,
  Check,
  X,
  Play,
  Ban,
  MessageSquare,
  Loader2,
  Clock,
  CheckCircle2,
  XCircle,
  ArrowRight,
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

interface ChangeRequest {
  id: string;
  title: string;
  description: string;
  status: string;
  authorId: string;
  authorEmail: string;
  authorName: string;
  project: string;
  flagKey: string;
  resourceType: string;
  currentConfig: unknown;
  proposedConfig: unknown;
  createdAt: string;
  updatedAt: string;
  appliedAt: string | null;
  appliedBy: string;
}

interface Review {
  id: string;
  changeRequestId: string;
  reviewerId: string;
  reviewerEmail: string;
  reviewerName: string;
  decision: string;
  comment: string;
  createdAt: string;
}

const statusConfig: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  pending: { color: 'bg-yellow-500', icon: <Clock className="h-3 w-3" />, label: 'Pending' },
  approved: { color: 'bg-green-500', icon: <CheckCircle2 className="h-3 w-3" />, label: 'Approved' },
  rejected: { color: 'bg-red-500', icon: <XCircle className="h-3 w-3" />, label: 'Rejected' },
  applied: { color: 'bg-blue-500', icon: <Check className="h-3 w-3" />, label: 'Applied' },
  cancelled: { color: 'bg-zinc-500', icon: <Ban className="h-3 w-3" />, label: 'Cancelled' },
};

export default function ChangeRequestsPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [selectedCR, setSelectedCR] = useState<string | null>(null);
  const [reviewComment, setReviewComment] = useState('');
  const [showReviewDialog, setShowReviewDialog] = useState<{ id: string; decision: string } | null>(null);

  const crsQuery = useQuery({
    queryKey: ['change-requests', statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ page: '1', pageSize: '50' });
      if (statusFilter && statusFilter !== 'all') params.set('status', statusFilter);
      const res = await fetch(`/api/change-requests?${params}`);
      if (!res.ok) throw new Error('Failed to fetch change requests');
      return res.json() as Promise<{ data: ChangeRequest[]; total: number }>;
    },
  });

  const detailQuery = useQuery({
    queryKey: ['change-request', selectedCR],
    queryFn: async () => {
      if (!selectedCR) return null;
      const res = await fetch(`/api/change-requests/${selectedCR}`);
      if (!res.ok) throw new Error('Failed to fetch change request');
      return res.json() as Promise<{ changeRequest: ChangeRequest; reviews: Review[] }>;
    },
    enabled: !!selectedCR,
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ id, decision, comment }: { id: string; decision: string; comment: string }) => {
      const res = await fetch(`/api/change-requests/${id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, comment }),
      });
      if (!res.ok) throw new Error('Failed to submit review');
      return res.json();
    },
    onSuccess: (_, { decision }) => {
      toast.success(`Change request ${decision}`);
      queryClient.invalidateQueries({ queryKey: ['change-requests'] });
      queryClient.invalidateQueries({ queryKey: ['change-request', selectedCR] });
      setShowReviewDialog(null);
      setReviewComment('');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed'),
  });

  const applyMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/change-requests/${id}/apply`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to apply change request');
      return res.json();
    },
    onSuccess: () => {
      toast.success('Change request applied');
      queryClient.invalidateQueries({ queryKey: ['change-requests'] });
      queryClient.invalidateQueries({ queryKey: ['change-request', selectedCR] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed'),
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/change-requests/${id}/cancel`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to cancel change request');
      return res.json();
    },
    onSuccess: () => {
      toast.success('Change request cancelled');
      queryClient.invalidateQueries({ queryKey: ['change-requests'] });
      queryClient.invalidateQueries({ queryKey: ['change-request', selectedCR] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed'),
  });

  const cr = detailQuery.data?.changeRequest;
  const reviews = detailQuery.data?.reviews || [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Change Requests</h2>
        <p className="text-zinc-600 dark:text-zinc-400">
          Review and approve flag configuration changes
        </p>
      </div>

      {/* Status Tabs */}
      <div className="flex gap-2">
        {['pending', 'approved', 'rejected', 'applied', 'all'].map(status => (
          <Button
            key={status}
            variant={statusFilter === status ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setStatusFilter(status)}
            className="capitalize"
          >
            {status}
          </Button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GitPullRequest className="h-5 w-5" />
              Requests ({crsQuery.data?.total || 0})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {crsQuery.isLoading ? (
              <div className="flex justify-center py-8"><Spinner /></div>
            ) : crsQuery.data && crsQuery.data.data.length > 0 ? (
              <div className="space-y-2">
                {crsQuery.data.data.map(item => {
                  const config = statusConfig[item.status] || statusConfig.pending;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setSelectedCR(item.id)}
                      className={`w-full text-left p-3 rounded-lg border transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800 ${
                        selectedCR === item.id
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
                          : 'border-zinc-200 dark:border-zinc-800'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-sm truncate">{item.title}</span>
                        <Badge variant="default" className={`${config.color} text-xs flex items-center gap-1`}>
                          {config.icon}
                          {config.label}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-zinc-500">
                        <span>{item.authorEmail || item.authorName || 'Unknown'}</span>
                        <span>-</span>
                        {item.flagKey && <code>{item.flagKey}</code>}
                        <span className="ml-auto">{new Date(item.createdAt).toLocaleDateString()}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8">
                <GitPullRequest className="mx-auto h-12 w-12 text-zinc-300 dark:text-zinc-700" />
                <p className="mt-4 text-zinc-500">No change requests</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Detail */}
        <div className="space-y-4">
          {selectedCR && cr ? (
            <>
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{cr.title}</CardTitle>
                    <Badge variant="default" className={`${statusConfig[cr.status]?.color || 'bg-zinc-500'}`}>
                      {cr.status}
                    </Badge>
                  </div>
                  <CardDescription>
                    By {cr.authorEmail || cr.authorName} on {new Date(cr.createdAt).toLocaleString()}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {cr.description && (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">{cr.description}</p>
                  )}
                  <div className="flex gap-4 text-sm">
                    {cr.project && (
                      <div>
                        <span className="text-zinc-500">Project:</span>{' '}
                        <span className="font-medium">{cr.project}</span>
                      </div>
                    )}
                    {cr.flagKey && (
                      <div>
                        <span className="text-zinc-500">Flag:</span>{' '}
                        <code className="font-medium">{cr.flagKey}</code>
                      </div>
                    )}
                  </div>

                  {/* Config Diff */}
                  {!!(cr.currentConfig || cr.proposedConfig) && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs mb-1 block">Current Config</Label>
                        <pre className="text-xs p-2 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded overflow-x-auto max-h-64">
                          {JSON.stringify(cr.currentConfig, null, 2)}
                        </pre>
                      </div>
                      <div>
                        <Label className="text-xs mb-1 block">Proposed Config</Label>
                        <pre className="text-xs p-2 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded overflow-x-auto max-h-64">
                          {JSON.stringify(cr.proposedConfig, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  {(cr.status === 'pending' || cr.status === 'approved') && (
                    <div className="flex gap-2 pt-2">
                      {cr.status === 'pending' && (
                        <>
                          <Button
                            size="sm"
                            onClick={() => setShowReviewDialog({ id: cr.id, decision: 'approved' })}
                            className="bg-green-600 hover:bg-green-700"
                          >
                            <Check className="h-4 w-4 mr-1" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => setShowReviewDialog({ id: cr.id, decision: 'rejected' })}
                          >
                            <X className="h-4 w-4 mr-1" />
                            Reject
                          </Button>
                        </>
                      )}
                      {(cr.status === 'approved' || cr.status === 'pending') && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => applyMutation.mutate(cr.id)}
                          disabled={applyMutation.isPending}
                        >
                          {applyMutation.isPending ? (
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          ) : (
                            <Play className="h-4 w-4 mr-1" />
                          )}
                          Apply
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => cancelMutation.mutate(cr.id)}
                        disabled={cancelMutation.isPending}
                      >
                        <Ban className="h-4 w-4 mr-1" />
                        Cancel
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Reviews Timeline */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    Reviews ({reviews.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {reviews.length > 0 ? (
                    <div className="space-y-3">
                      {reviews.map(review => (
                        <div key={review.id} className="flex gap-3 text-sm">
                          <div className={`mt-1 h-2 w-2 rounded-full flex-shrink-0 ${
                            review.decision === 'approved' ? 'bg-green-500' :
                            review.decision === 'rejected' ? 'bg-red-500' : 'bg-blue-500'
                          }`} />
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">
                                {review.reviewerEmail || review.reviewerName || 'Unknown'}
                              </span>
                              <Badge variant="secondary" className="text-xs capitalize">
                                {review.decision}
                              </Badge>
                              <span className="text-zinc-400 text-xs">
                                {new Date(review.createdAt).toLocaleString()}
                              </span>
                            </div>
                            {review.comment && (
                              <p className="text-zinc-600 dark:text-zinc-400 mt-1">{review.comment}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-zinc-500">No reviews yet</p>
                  )}
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <ArrowRight className="h-8 w-8 text-zinc-300 mb-4" />
                <p className="text-zinc-500">Select a change request to view details</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Review Dialog */}
      <Dialog open={!!showReviewDialog} onOpenChange={() => { setShowReviewDialog(null); setReviewComment(''); }}>
        <DialogHeader>
          <DialogTitle className="capitalize">
            {showReviewDialog?.decision === 'approved' ? 'Approve' : 'Reject'} Change Request
          </DialogTitle>
          <DialogDescription>Add an optional comment with your review</DialogDescription>
        </DialogHeader>
        <DialogContent>
          <Textarea
            value={reviewComment}
            onChange={(e) => setReviewComment(e.target.value)}
            placeholder="Add a comment..."
            rows={3}
          />
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => { setShowReviewDialog(null); setReviewComment(''); }}>
            Cancel
          </Button>
          <Button
            onClick={() => showReviewDialog && reviewMutation.mutate({
              id: showReviewDialog.id,
              decision: showReviewDialog.decision,
              comment: reviewComment,
            })}
            disabled={reviewMutation.isPending}
            className={showReviewDialog?.decision === 'approved' ? 'bg-green-600 hover:bg-green-700' : ''}
            variant={showReviewDialog?.decision === 'rejected' ? 'destructive' : 'default'}
          >
            {reviewMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {showReviewDialog?.decision === 'approved' ? 'Approve' : 'Reject'}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
