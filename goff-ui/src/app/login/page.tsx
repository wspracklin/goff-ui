import { auth, signIn } from '@/auth';
import { redirect } from 'next/navigation';
import { Flag } from 'lucide-react';

export default async function LoginPage() {
  const session = await auth();

  if (session) {
    redirect('/');
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-900">
      <div className="w-full max-w-md p-8">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-blue-100 dark:bg-blue-900 rounded-full">
              <Flag className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
          <h1 className="text-2xl font-bold">GO Feature Flag</h1>
          <p className="text-zinc-600 dark:text-zinc-400 mt-2">
            Sign in to manage feature flags
          </p>
        </div>

        <form
          action={async () => {
            'use server';
            await signIn('keycloak', { redirectTo: '/' });
          }}
        >
          <button
            type="submit"
            className="w-full flex items-center justify-center gap-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg px-4 py-3 font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
          >
            Sign in with Keycloak
          </button>
        </form>

        <p className="text-center text-sm text-zinc-500 mt-6">
          You will be redirected to your organization&apos;s login page
        </p>
      </div>
    </div>
  );
}
