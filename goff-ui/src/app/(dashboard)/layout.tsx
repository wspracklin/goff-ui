import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { ReactNode } from 'react';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-auto bg-zinc-50 p-6 dark:bg-zinc-900">
          {children}
        </main>
      </div>
    </div>
  );
}
