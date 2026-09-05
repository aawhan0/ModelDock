import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  const appRoutes = [
    '/models',
    '/inference',
    '/history',
    '/monitoring',
    '/endpoints',
    '/settings',
    '/documentation',
  ];

  const isAppRoute =
    pathname === '/' ||
    appRoutes.some(
      (route) =>
        pathname === route ||
        pathname.startsWith(`${route}/`)
    );

  if (isAppRoute && pathname !== '/') {
    return NextResponse.rewrite(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
