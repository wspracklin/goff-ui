'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useAppStore } from '@/lib/store';
import goffClient from '@/lib/api';
import { DiffCache } from '@/lib/types';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

interface WebSocketMessage {
  type: 'flag_change' | 'heartbeat' | 'error';
  data?: DiffCache;
  error?: string;
}

export function useWebSocket() {
  const { isConnected, isDevMode, config, addFlagUpdate } = useAppStore();
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [wsStatus, setWsStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const reconnectDelay = 3000;

  const handleMessage = useCallback((data: unknown) => {
    try {
      // GO Feature Flag relay proxy can send messages in different formats:
      // 1. Wrapped: { type: 'flag_change', data: DiffCache }
      // 2. Direct DiffCache: { added: {...}, deleted: {...}, updated: {...} }
      // 3. Error: { type: 'error', error: '...' }

      const message = data as WebSocketMessage | DiffCache;
      let diffCache: DiffCache | undefined;

      // Check if it's a wrapped message with type field
      if ('type' in message && message.type === 'flag_change' && 'data' in message) {
        diffCache = (message as WebSocketMessage).data;
      } else if ('type' in message && message.type === 'error') {
        console.error('WebSocket error:', (message as WebSocketMessage).error);
        return;
      } else if ('added' in message || 'deleted' in message || 'updated' in message) {
        // Direct DiffCache format (no wrapper)
        diffCache = message as DiffCache;
      }

      if (diffCache) {
        // Add to store
        addFlagUpdate(diffCache);

        // Invalidate relevant queries
        queryClient.invalidateQueries({ queryKey: ['flags-config'] });
        queryClient.invalidateQueries({ queryKey: ['local-flags'] });
        queryClient.invalidateQueries({ queryKey: ['flagset-flags'] });

        // Show notification
        const added = diffCache.added ? Object.keys(diffCache.added).length : 0;
        const deleted = diffCache.deleted ? Object.keys(diffCache.deleted).length : 0;
        const updated = diffCache.updated ? Object.keys(diffCache.updated).length : 0;

        const changes: string[] = [];
        if (added > 0) changes.push(`${added} added`);
        if (updated > 0) changes.push(`${updated} updated`);
        if (deleted > 0) changes.push(`${deleted} deleted`);

        if (changes.length > 0) {
          toast.info(`Flag changes detected: ${changes.join(', ')}`, {
            duration: 5000,
          });
        }
      } else {
        // Log unrecognized message format for debugging
        console.log('WebSocket received unrecognized message:', data);
      }
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
    }
  }, [addFlagUpdate, queryClient]);

  const connect = useCallback(() => {
    if (isDevMode || !isConnected || !config.proxyUrl) {
      return;
    }

    // Clean up existing connection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setWsStatus('connecting');

    console.log('WebSocket: Attempting to connect to relay proxy...');

    const ws = goffClient.connectWebSocket(
      (data) => {
        console.log('WebSocket: Received message:', data);
        handleMessage(data);
      },
      (error) => {
        console.error('WebSocket error:', error);
        setWsStatus('error');
      },
      () => {
        setWsStatus('disconnected');

        // Attempt reconnection
        if (reconnectAttempts.current < maxReconnectAttempts) {
          reconnectAttempts.current++;
          console.log(`WebSocket disconnected. Reconnecting (attempt ${reconnectAttempts.current}/${maxReconnectAttempts})...`);

          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, reconnectDelay * reconnectAttempts.current);
        } else {
          console.log('Max reconnection attempts reached');
        }
      }
    );

    if (ws) {
      wsRef.current = ws;

      ws.onopen = () => {
        setWsStatus('connected');
        reconnectAttempts.current = 0;
        console.log('WebSocket connected for real-time flag updates');
      };
    } else {
      console.warn('WebSocket: Failed to create connection (connectWebSocket returned null)');
    }
  }, [isDevMode, isConnected, config.proxyUrl, handleMessage]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setWsStatus('disconnected');
    reconnectAttempts.current = 0;
  }, []);

  // Connect when conditions are met
  useEffect(() => {
    if (!isDevMode && isConnected && config.proxyUrl) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [isDevMode, isConnected, config.proxyUrl, connect, disconnect]);

  return {
    wsStatus,
    reconnect: connect,
    disconnect,
  };
}
