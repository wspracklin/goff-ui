import { cn } from '@/lib/utils';
import { HTMLAttributes } from 'react';

export interface BadgeProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'secondary' | 'success' | 'warning' | 'destructive';
}

function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors',
        {
          'bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900':
            variant === 'default',
          'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100':
            variant === 'secondary',
          'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100':
            variant === 'success',
          'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100':
            variant === 'warning',
          'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100':
            variant === 'destructive',
        },
        className
      )}
      {...props}
    />
  );
}

export { Badge };
