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
  FolderOpen,
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
  const { isConnected, flagUpdates, selectedProject, setSelectedProject, isDevMode, setDevMode, selectedFlagSet, setSelectedFlagSet } = useAppStore();
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);
  const [flagSetDropdownOpen, setFlagSetDropdownOpen] = useState(false);

  // Check dev mode on mount
  useEffect(() => {
    fetch('/api/config')
      .then(res => res.json())
      .then(data => setDevMode(data.devMode))
      .catch(() => setDevMode(false));
  }, [setDevMode]);

  const projectsQuery = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const res = await fetch('/api/projects');
      if (!res.ok) throw new Error('Failed to fetch projects');
      return res.json() as Promise<{ projects: string[] }>;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: !isDevMode, // Don't fetch projects in dev mode
  });

  const flagSetsQuery = useQuery({
    queryKey: ['flagsets'],
    queryFn: async () => {
      const res = await fetch('/api/flagsets');
      if (!res.ok) throw new Error('Failed to fetch flag sets');
      return res.json() as Promise<{ flagSets: FlagSet[] }>;
    },
    staleTime: 30 * 1000, // 30 seconds - shorter to pick up changes faster
    refetchOnWindowFocus: true,
  });

  // Auto-select default flagset if none selected, or clear if selected one was deleted
  useEffect(() => {
    const flagSets = flagSetsQuery.data?.flagSets || [];

    // If current selection no longer exists, clear it
    if (selectedFlagSet && flagSets.length > 0 && !flagSets.find(fs => fs.id === selectedFlagSet)) {
      const defaultFlagSet = flagSets.find(fs => fs.isDefault);
      setSelectedFlagSet(defaultFlagSet?.id || flagSets[0]?.id || null);
      return;
    }

    // Auto-select if none selected
    if (!selectedFlagSet && flagSets.length > 0) {
      const defaultFlagSet = flagSets.find(fs => fs.isDefault);
      if (defaultFlagSet) {
        setSelectedFlagSet(defaultFlagSet.id);
      } else {
        setSelectedFlagSet(flagSets[0].id);
      }
    }
  }, [selectedFlagSet, flagSetsQuery.data, setSelectedFlagSet]);

  const selectedFlagSetName = flagSetsQuery.data?.flagSets?.find(fs => fs.id === selectedFlagSet)?.name;

  return (
    <div className="flex h-full w-64 flex-col border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 border-b border-zinc-200 px-6 dark:border-zinc-800">
        <Flag className="h-6 w-6 text-blue-600" />
        <span className="text-lg font-semibold">GO Feature Flag</span>
      </div>

      {/* Project Selector - Only show when not in dev mode */}
      {!isDevMode && (
        <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <div className="relative">
            <button
              onClick={() => setProjectDropdownOpen(!projectDropdownOpen)}
              className="flex w-full items-center justify-between rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
            >
              <div className="flex items-center gap-2">
                <FolderOpen className="h-4 w-4 text-zinc-500" />
                <span className="truncate">
                  {selectedProject || 'Select Project'}
                </span>
              </div>
              <ChevronDown
                className={cn(
                  'h-4 w-4 text-zinc-500 transition-transform',
                  projectDropdownOpen && 'rotate-180'
                )}
              />
            </button>

            {projectDropdownOpen && (
              <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-60 overflow-auto rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                {projectsQuery.isLoading ? (
                  <div className="px-3 py-2 text-sm text-zinc-500">Loading...</div>
                ) : projectsQuery.error ? (
                  <div className="px-3 py-2 text-sm text-red-500">
                    Failed to load projects
                  </div>
                ) : projectsQuery.data?.projects.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-zinc-500">
                    No projects found
                  </div>
                ) : (
                  projectsQuery.data?.projects.map((project) => (
                    <button
                      key={project}
                      onClick={() => {
                        setSelectedProject(project);
                        setProjectDropdownOpen(false);
                      }}
                      className={cn(
                        'flex w-full items-center px-3 py-2 text-sm transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800',
                        selectedProject === project &&
                          'bg-zinc-100 font-medium dark:bg-zinc-800'
                      )}
                    >
                      {project}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Dev Mode Indicator */}
      {isDevMode && (
        <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 dark:bg-amber-950">
            <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
              Dev Mode - Using Local Flags
            </span>
          </div>
        </div>
      )}

      {/* Flagset Selector */}
      {flagSetsQuery.data?.flagSets && flagSetsQuery.data.flagSets.length > 0 && (
        <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <div className="relative">
            <button
              onClick={() => setFlagSetDropdownOpen(!flagSetDropdownOpen)}
              className="flex w-full items-center justify-between rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
            >
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-zinc-500" />
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
                {flagSetsQuery.data.flagSets.map((flagSet) => (
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
        </div>
      )}

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
