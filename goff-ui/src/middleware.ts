import { auth } from '@/auth';
import { NextResponse } from 'next/server';

const isDevMode = process.env.DEV_MODE === 'true';

export default auth((req) => {
  // In dev mode, skip all auth checks
  if (isDevMode) {
    // Redirect login page to home in dev mode
    if (req.nextUrl.pathname === '/login') {
      return NextResponse.redirect(new URL('/', req.url));
    }
    return NextResponse.next();
  }

  const isLoggedIn = !!req.auth;
  const isLoginPage = req.nextUrl.pathname === '/login';
  const isAuthApi = req.nextUrl.pathname.startsWith('/api/auth');

  // Allow auth API routes
  if (isAuthApi) {
    return NextResponse.next();
  }

  // Redirect to login if not authenticated
  if (!isLoggedIn && !isLoginPage) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  // Redirect to home if already logged in and trying to access login
  if (isLoggedIn && isLoginPage) {
    return NextResponse.redirect(new URL('/', req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
