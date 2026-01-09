'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SessionProvider } from 'next-auth/react';
import { ThemeProvider } from 'next-themes';
import { ReactNode, useState } from 'react';
import { Toaster } from 'sonner';
import { WebSocketProvider } from './providers/websocket-provider';
import { ConnectionProvider } from './providers/connection-provider';

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 10 * 1000, // 10 seconds
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <SessionProvider>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <QueryClientProvider client={queryClient}>
          <ConnectionProvider>
            <WebSocketProvider>
              {children}
            </WebSocketProvider>
          </ConnectionProvider>
          <Toaster position="top-right" richColors />
        </QueryClientProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
