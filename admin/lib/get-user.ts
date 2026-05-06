import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function getSessionUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list: { name: string; value: string; options: CookieOptions }[]) =>
          list.forEach(({ name, value, options }) => cookieStore.set(name, value, options as object)),
      },
    },
  );
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}
