import { auth } from '@/auth';
import { NextRequest, NextResponse } from 'next/server';

const isDevMode = process.env.DEV_MODE === 'true';

// In dev mode, bypass NextAuth entirely to avoid AUTH_URL issues
function devMiddleware(req: NextRequest) {
  if (req.nextUrl.pathname === '/login') {
    return NextResponse.redirect(new URL('/', req.url));
  }
  return NextResponse.next();
}

const authMiddleware = auth((req) => {
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

export default isDevMode ? devMiddleware : authMiddleware;

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
