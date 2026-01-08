'use client';

import { RefreshCw, Bell, Moon, Sun, LogOut, User, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/lib/store';
import goffClient from '@/lib/api';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useTheme } from 'next-themes';

export function Header() {
  const { config, isConnected } = useAppStore();
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  const cycleTheme = () => {
    if (theme === 'light') {
      setTheme('dark');
    } else if (theme === 'dark') {
      setTheme('system');
    } else {
      setTheme('light');
    }
  };

  const handleRefresh = async () => {
    if (!isConnected) {
      toast.error('Not connected to proxy');
      return;
    }

    setIsRefreshing(true);
    try {
      if (config.adminApiKey) {
        await goffClient.refreshFlags();
        toast.success('Flags refreshed from retriever');
      }
      await queryClient.invalidateQueries();
      toast.success('Data refreshed');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to refresh'
      );
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleLogout = async () => {
    await signOut({ callbackUrl: '/login' });
  };

  return (
    <header className="flex h-16 items-center justify-between border-b border-zinc-200 bg-white px-6 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center gap-4">
        <h1 className="text-xl font-semibold">Feature Flag Management</h1>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw
            className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`}
          />
        </Button>

        <Button variant="ghost" size="sm">
          <Bell className="h-4 w-4" />
        </Button>

        <div className="relative">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowThemeMenu(!showThemeMenu)}
            title={`Theme: ${theme}`}
          >
            {mounted ? (
              resolvedTheme === 'dark' ? (
                <Moon className="h-4 w-4" />
              ) : (
                <Sun className="h-4 w-4" />
              )
            ) : (
              <Sun className="h-4 w-4" />
            )}
          </Button>

          {showThemeMenu && (
            <div className="absolute right-0 top-full z-10 mt-1 w-36 rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
              <button
                onClick={() => {
                  setTheme('light');
                  setShowThemeMenu(false);
                }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                  theme === 'light' ? 'text-blue-600 dark:text-blue-400' : ''
                }`}
              >
                <Sun className="h-4 w-4" />
                Light
              </button>
              <button
                onClick={() => {
                  setTheme('dark');
                  setShowThemeMenu(false);
                }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                  theme === 'dark' ? 'text-blue-600 dark:text-blue-400' : ''
                }`}
              >
                <Moon className="h-4 w-4" />
                Dark
              </button>
              <button
                onClick={() => {
                  setTheme('system');
                  setShowThemeMenu(false);
                }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                  theme === 'system' ? 'text-blue-600 dark:text-blue-400' : ''
                }`}
              >
                <Monitor className="h-4 w-4" />
                System
              </button>
            </div>
          )}
        </div>

        {/* User Menu */}
        {session?.user && (
          <div className="relative ml-2">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
            >
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900">
                <User className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
              </div>
              <span className="max-w-[120px] truncate">
                {session.user.name || session.user.email}
              </span>
            </button>

            {showUserMenu && (
              <div className="absolute right-0 top-full z-10 mt-1 w-48 rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                <div className="border-b border-zinc-200 px-3 py-2 dark:border-zinc-700">
                  <p className="text-sm font-medium">{session.user.name}</p>
                  <p className="text-xs text-zinc-500">{session.user.email}</p>
                </div>
                <button
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
