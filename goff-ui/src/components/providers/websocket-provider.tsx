'use client';

import { ReactNode, createContext, useContext } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';

interface WebSocketContextValue {
  wsStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  reconnect: () => void;
  disconnect: () => void;
}

const WebSocketContext = createContext<WebSocketContextValue | null>(null);

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const ws = useWebSocket();

  return (
    <WebSocketContext.Provider value={ws}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocketContext() {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocketContext must be used within a WebSocketProvider');
  }
  return context;
}
