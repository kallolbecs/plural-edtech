import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({ // Recreate response to apply cookie changes
            request: { headers: request.headers },
          });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options) {
          request.cookies.set({ name, value: '', ...options });
          response = NextResponse.next({ // Recreate response to apply cookie changes
            request: { headers: request.headers },
          });
          response.cookies.set({ name, value: '', ...options });
        },
      },
    }
  );

  // Refresh session if expired - important to keep session active
  const { data: { session } } = await supabase.auth.getSession();

  // Define protected and public routes
  const { pathname } = request.nextUrl;
  const publicRoutes = ['/signin', '/signup', '/auth/callback']; // Add any other public paths

  // If user is not logged in and trying to access a protected route, redirect to signin
  if (!session && !publicRoutes.some(path => pathname.startsWith(path))) {
    console.log(`No session, redirecting from ${pathname} to /signin`);
    return NextResponse.redirect(new URL('/signin', request.url));
  }

  // If user is logged in and trying to access signin/signup, redirect to home
  if (session && (pathname === '/signin' || pathname === '/signup')) {
     console.log(`Session found, redirecting from ${pathname} to /`);
    return NextResponse.redirect(new URL('/', request.url));
  }

  // Allow the request to proceed
  return response;
}

// Define which paths the middleware should run on
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more exceptions.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};