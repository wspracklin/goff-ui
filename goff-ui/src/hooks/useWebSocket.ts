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
      const message = data as WebSocketMessage;

      if (message.type === 'flag_change' && message.data) {
        // Add to store
        addFlagUpdate(message.data);

        // Invalidate relevant queries
        queryClient.invalidateQueries({ queryKey: ['flags-config'] });
        queryClient.invalidateQueries({ queryKey: ['local-flags'] });
        queryClient.invalidateQueries({ queryKey: ['flagset-flags'] });

        // Show notification
        const added = message.data.added ? Object.keys(message.data.added).length : 0;
        const deleted = message.data.deleted ? Object.keys(message.data.deleted).length : 0;
        const updated = message.data.updated ? Object.keys(message.data.updated).length : 0;

        const changes: string[] = [];
        if (added > 0) changes.push(`${added} added`);
        if (updated > 0) changes.push(`${updated} updated`);
        if (deleted > 0) changes.push(`${deleted} deleted`);

        if (changes.length > 0) {
          toast.info(`Flag changes detected: ${changes.join(', ')}`, {
            duration: 5000,
          });
        }
      } else if (message.type === 'error') {
        console.error('WebSocket error:', message.error);
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

    const ws = goffClient.connectWebSocket(
      handleMessage,
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
