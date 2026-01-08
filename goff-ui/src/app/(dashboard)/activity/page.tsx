'use client';

import Link from 'next/link';
import {
  Activity,
  AlertCircle,
  Wifi,
  WifiOff,
  Trash2,
  Plus,
  Minus,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/lib/store';
import { formatDate } from '@/lib/utils';
import { useWebSocketContext } from '@/components/providers/websocket-provider';

export default function ActivityPage() {
  const { isConnected, isDevMode, flagUpdates, clearFlagUpdates } = useAppStore();
  const { wsStatus, reconnect } = useWebSocketContext();

  const wsConnected = wsStatus === 'connected';
  const wsConnecting = wsStatus === 'connecting';

  if (isDevMode) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <AlertCircle className="h-16 w-16 text-amber-500" />
        <h2 className="text-2xl font-semibold">Development Mode</h2>
        <p className="text-zinc-600 dark:text-zinc-400 text-center max-w-md">
          Real-time activity monitoring requires a connection to a relay proxy.
          Switch to Production mode in{' '}
          <Link href="/settings" className="text-blue-600 hover:underline">
            Settings
          </Link>{' '}
          to enable WebSocket updates.
        </p>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <AlertCircle className="h-16 w-16 text-yellow-500" />
        <h2 className="text-2xl font-semibold">Not Connected</h2>
        <p className="text-zinc-600 dark:text-zinc-400">
          Configure your connection in{' '}
          <Link href="/settings" className="text-blue-600 hover:underline">
            Settings
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Activity</h2>
          <p className="text-zinc-600 dark:text-zinc-400">
            Real-time flag change notifications
          </p>
        </div>
        <div className="flex items-center gap-2">
          {flagUpdates.length > 0 && (
            <Button variant="outline" size="sm" onClick={clearFlagUpdates}>
              <Trash2 className="h-4 w-4 mr-2" />
              Clear
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={reconnect}
            disabled={wsConnected || wsConnecting}
          >
            {wsConnecting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            {wsConnecting ? 'Connecting...' : 'Reconnect'}
          </Button>
        </div>
      </div>

      {/* WebSocket Status */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {wsConnected ? (
                <Wifi className="h-5 w-5 text-green-500" />
              ) : wsConnecting ? (
                <Loader2 className="h-5 w-5 text-amber-500 animate-spin" />
              ) : (
                <WifiOff className="h-5 w-5 text-red-500" />
              )}
              <div>
                <p className="font-medium">
                  WebSocket {wsConnected ? 'Connected' : wsConnecting ? 'Connecting' : 'Disconnected'}
                </p>
                <p className="text-sm text-zinc-500">
                  {wsConnected
                    ? 'Listening for flag changes in real-time'
                    : wsConnecting
                    ? 'Establishing connection to relay proxy...'
                    : 'Not receiving real-time updates'}
                </p>
              </div>
            </div>
            <Badge variant={wsConnected ? 'success' : wsConnecting ? 'secondary' : 'destructive'}>
              {wsConnected ? 'Live' : wsConnecting ? 'Connecting' : 'Offline'}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Activity Feed */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Flag Changes
          </CardTitle>
          <CardDescription>
            {flagUpdates.length > 0
              ? `${flagUpdates.length} update${flagUpdates.length > 1 ? 's' : ''} received`
              : 'No updates received yet'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {flagUpdates.length > 0 ? (
            <div className="space-y-4">
              {flagUpdates.map((update, index) => (
                <div
                  key={index}
                  className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm text-zinc-500">
                      {formatDate(new Date())}
                    </span>
                    <Badge variant="secondary">Update #{flagUpdates.length - index}</Badge>
                  </div>

                  {/* Added Flags */}
                  {update.added && Object.keys(update.added).length > 0 && (
                    <div className="mb-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Plus className="h-4 w-4 text-green-500" />
                        <span className="font-medium text-green-600 dark:text-green-400">
                          Added ({Object.keys(update.added).length})
                        </span>
                      </div>
                      <div className="space-y-1 pl-6">
                        {Object.keys(update.added).map((flagKey) => (
                          <Link
                            key={flagKey}
                            href={`/flags/${flagKey}`}
                            className="block text-sm hover:text-blue-600"
                          >
                            {flagKey}
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Deleted Flags */}
                  {update.deleted && Object.keys(update.deleted).length > 0 && (
                    <div className="mb-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Minus className="h-4 w-4 text-red-500" />
                        <span className="font-medium text-red-600 dark:text-red-400">
                          Deleted ({Object.keys(update.deleted).length})
                        </span>
                      </div>
                      <div className="space-y-1 pl-6">
                        {Object.keys(update.deleted).map((flagKey) => (
                          <span
                            key={flagKey}
                            className="block text-sm text-zinc-500 line-through"
                          >
                            {flagKey}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Updated Flags */}
                  {update.updated && Object.keys(update.updated).length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <RefreshCw className="h-4 w-4 text-blue-500" />
                        <span className="font-medium text-blue-600 dark:text-blue-400">
                          Updated ({Object.keys(update.updated).length})
                        </span>
                      </div>
                      <div className="space-y-1 pl-6">
                        {Object.keys(update.updated).map((flagKey) => (
                          <Link
                            key={flagKey}
                            href={`/flags/${flagKey}`}
                            className="block text-sm hover:text-blue-600"
                          >
                            {flagKey}
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Activity className="mx-auto h-12 w-12 text-zinc-300 dark:text-zinc-700" />
              <p className="mt-4 text-zinc-500">No activity yet</p>
              <p className="mt-1 text-sm text-zinc-400">
                Flag changes will appear here in real-time
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Help */}
      <Card>
        <CardHeader>
          <CardTitle>About Real-Time Updates</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-zinc-600 dark:text-zinc-400 space-y-2">
            <p>
              The activity feed uses WebSocket to receive real-time notifications
              when flag configurations change on the relay proxy.
            </p>
            <p>
              Changes are detected when the relay proxy polls its retriever
              (configurable via <code className="text-xs bg-zinc-100 dark:bg-zinc-800 px-1 rounded">pollingInterval</code>).
            </p>
            <p>
              If the WebSocket disconnects, click &quot;Reconnect&quot; to re-establish
              the connection.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
