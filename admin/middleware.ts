import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options as object),
          );
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isLoginPage = pathname === '/login';

  if (!user && !isLoginPage) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (user && !isLoginPage) {
    const isAdmin =
      user.user_metadata?.is_admin === true ||
      user.app_metadata?.role === 'admin';
    if (!isAdmin) {
      return new NextResponse(
        '<html><body><h1>403 Forbidden</h1><p>Admin access required. ' +
        'Set <code>is_admin: true</code> in this user\'s metadata via the Supabase dashboard.</p></body></html>',
        { status: 403, headers: { 'Content-Type': 'text/html' } },
      );
    }
  }

  if (user && isLoginPage) {
    return NextResponse.redirect(new URL('/admin/poi-review', request.url));
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
