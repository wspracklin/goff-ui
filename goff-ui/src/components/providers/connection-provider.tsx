'use client';

import { ReactNode, useEffect, useRef } from 'react';
import { useAppStore } from '@/lib/store';

interface ConnectionProviderProps {
  children: ReactNode;
}

/**
 * Provider that auto-connects to the relay proxy on app start
 * when in Production mode (not dev mode) and a proxy URL is configured.
 */
export function ConnectionProvider({ children }: ConnectionProviderProps) {
  const { config, isDevMode, testConnection, isConnected } = useAppStore();
  const hasAttemptedConnection = useRef(false);

  useEffect(() => {
    // Only attempt auto-connect once on mount
    if (hasAttemptedConnection.current) return;

    // Auto-connect if:
    // 1. Not in dev mode (production mode)
    // 2. A proxy URL is configured
    // 3. Not already connected
    if (!isDevMode && config.proxyUrl && !isConnected) {
      hasAttemptedConnection.current = true;
      testConnection();
    }
  }, [isDevMode, config.proxyUrl, isConnected, testConnection]);

  // Reset the flag if mode changes to allow re-connection attempt
  useEffect(() => {
    if (isDevMode) {
      hasAttemptedConnection.current = false;
    }
  }, [isDevMode]);

  return <>{children}</>;
}
