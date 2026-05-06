import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

async function signOut() {
  'use server';
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll:  () => cookieStore.getAll(),
        setAll: (list: { name: string; value: string; options: CookieOptions }[]) =>
          list.forEach(({ name, value, options }) => cookieStore.set(name, value, options as object)),
      },
    },
  );
  await supabase.auth.signOut();
  redirect('/login');
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll:  () => cookieStore.getAll(),
        setAll: (list: { name: string; value: string; options: CookieOptions }[]) =>
          list.forEach(({ name, value, options }) => cookieStore.set(name, value, options as object)),
      },
    },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-teal-600 font-bold text-lg tracking-tight">XRoad</span>
          <span className="text-gray-300 text-lg">·</span>
          <span className="text-gray-600 text-sm font-medium">Admin</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">{user.email}</span>
          <form action={signOut}>
            <button
              type="submit"
              className="text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-8">
        {children}
      </main>
    </div>
  );
}
