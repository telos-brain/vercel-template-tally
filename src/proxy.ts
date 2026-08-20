import { NextResponse } from "next/server";
import type { NextFetchEvent, NextRequest } from "next/server";
import { isLocalAuthBypassEnabled } from "@/utils/auth-mode";

export default async function middleware(
  request: NextRequest,
  event: NextFetchEvent
) {
  if (isLocalAuthBypassEnabled()) {
    return NextResponse.next();
  }

  const { clerkMiddleware, createRouteMatcher } = await import(
    "@clerk/nextjs/server"
  );

  const isPublicRoute = createRouteMatcher([
    "/sign-in(.*)",
    "/sign-up(.*)",
    "/accept-invite(.*)",
    "/api/invites(.*)",
    // Brain tool callbacks use dual-secret handshake (not Clerk):
    // Authorization: Bearer TOOL_API_KEY + X-Brain-Authorization: Bearer BRAIN_API_KEY
    "/api/tools(.*)",
    // Vercel cron / manual heartbeat uses Authorization: Bearer CRON_SECRET
    "/api/cron(.*)",
  ]);

  const isApiRoute = createRouteMatcher(["/api(.*)"]);

  const handler = clerkMiddleware(async (auth, req) => {
    if (isPublicRoute(req)) {
      return;
    }

    // API clients cannot follow a sign-in HTML redirect. Return JSON 401
    // and let route handlers authenticate via requireRole / getCurrentUser.
    if (isApiRoute(req)) {
      const { userId } = await auth();
      if (!userId) {
        return NextResponse.json(
          { success: false, error: "Unauthorized" },
          { status: 401 }
        );
      }
      return;
    }

    await auth.protect();
  });

  return handler(request, event);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    "/(api|trpc)(.*)",
  ],
};
