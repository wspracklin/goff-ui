'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  Flag,
  LayoutDashboard,
  Settings,
  FlaskConical,
  Activity,
  RefreshCw,
  ChevronDown,
  Layers,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/lib/store';
import { Badge } from '@/components/ui/badge';
import { useState, useEffect } from 'react';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Flags', href: '/flags', icon: Flag },
  { name: 'Evaluator', href: '/evaluator', icon: FlaskConical },
  { name: 'Activity', href: '/activity', icon: Activity },
  { name: 'Settings', href: '/settings', icon: Settings },
];

interface FlagSet {
  id: string;
  name: string;
  isDefault: boolean;
}

export function Sidebar() {
  const pathname = usePathname();
  const { isConnected, flagUpdates, isDevMode, setDevMode, selectedFlagSet, setSelectedFlagSet } = useAppStore();
  const [flagSetDropdownOpen, setFlagSetDropdownOpen] = useState(false);

  // Check dev mode on mount
  useEffect(() => {
    fetch('/api/config')
      .then(res => res.json())
      .then(data => setDevMode(data.devMode))
      .catch(() => setDevMode(false));
  }, [setDevMode]);

  const flagSetsQuery = useQuery({
    queryKey: ['flagsets'],
    queryFn: async () => {
      const res = await fetch('/api/flagsets');
      if (!res.ok) throw new Error('Failed to fetch flag sets');
      const data = await res.json();
      return data.flagSets as FlagSet[];
    },
    staleTime: 5 * 1000, // 5 seconds - shorter to pick up changes faster
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });

  // Auto-select default flagset, or clear if selected one was deleted
  useEffect(() => {
    const flagSets = flagSetsQuery.data || [];

    // If current selection no longer exists in the list, clear it
    if (selectedFlagSet && flagSets.length > 0 && !flagSets.find(fs => fs.id === selectedFlagSet)) {
      setSelectedFlagSet(null);
      return;
    }

    // Auto-select default flag set if none selected
    if (!selectedFlagSet && flagSets.length > 0) {
      const defaultFlagSet = flagSets.find(fs => fs.isDefault);
      setSelectedFlagSet(defaultFlagSet?.id || flagSets[0].id);
    }
  }, [selectedFlagSet, flagSetsQuery.data, setSelectedFlagSet]);

  const selectedFlagSetName = selectedFlagSet
    ? flagSetsQuery.data?.find(fs => fs.id === selectedFlagSet)?.name
    : 'Select Flag Set';

  return (
    <div className="flex h-full w-64 flex-col border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 border-b border-zinc-200 px-6 dark:border-zinc-800">
        <Flag className="h-6 w-6 text-blue-600" />
        <span className="text-lg font-semibold">GO Feature Flag</span>
      </div>

      {/* Flagset Selector */}
      <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        {flagSetsQuery.data && flagSetsQuery.data.length > 0 ? (
          <div className="relative">
            <button
              onClick={() => setFlagSetDropdownOpen(!flagSetDropdownOpen)}
              className="flex w-full items-center justify-between rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
            >
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-purple-500" />
                <span className="truncate">
                  {selectedFlagSetName || 'Select Flag Set'}
                </span>
              </div>
              <ChevronDown
                className={cn(
                  'h-4 w-4 text-zinc-500 transition-transform',
                  flagSetDropdownOpen && 'rotate-180'
                )}
              />
            </button>

            {flagSetDropdownOpen && (
              <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-60 overflow-auto rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                {flagSetsQuery.data.map((flagSet) => (
                  <button
                    key={flagSet.id}
                    onClick={() => {
                      setSelectedFlagSet(flagSet.id);
                      setFlagSetDropdownOpen(false);
                    }}
                    className={cn(
                      'flex w-full items-center justify-between px-3 py-2 text-sm transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800',
                      selectedFlagSet === flagSet.id &&
                        'bg-zinc-100 font-medium dark:bg-zinc-800'
                    )}
                  >
                    <span>{flagSet.name}</span>
                    {flagSet.isDefault && (
                      <Badge variant="secondary" className="text-xs">
                        Default
                      </Badge>
                    )}
                  </button>
                ))}
                <Link
                  href="/settings/flagsets"
                  onClick={() => setFlagSetDropdownOpen(false)}
                  className="flex w-full items-center gap-2 border-t border-zinc-200 px-3 py-2 text-sm text-zinc-500 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                >
                  <Settings className="h-3 w-3" />
                  Manage Flag Sets
                </Link>
              </div>
            )}
          </div>
        ) : (
          <Link
            href="/settings/flagsets"
            className="flex w-full items-center justify-between rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-500 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
          >
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4" />
              <span>Create a Flag Set</span>
            </div>
            <ChevronDown className="h-4 w-4 rotate-[-90deg]" />
          </Link>
        )}
      </div>

      {/* Connection Status */}
      <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              'h-2 w-2 rounded-full',
              isConnected ? 'bg-green-500' : 'bg-red-500'
            )}
          />
          <span className="text-sm text-zinc-600 dark:text-zinc-400">
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navigation.map((item) => {
          const isActive =
            item.href === '/'
              ? pathname === '/'
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100'
                  : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100'
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.name}
              {item.name === 'Activity' && flagUpdates.length > 0 && (
                <Badge variant="secondary" className="ml-auto">
                  {flagUpdates.length}
                </Badge>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-zinc-200 p-4 dark:border-zinc-800">
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <RefreshCw className="h-3 w-3" />
          <span>Auto-refresh enabled</span>
        </div>
      </div>
    </div>
  );
}
