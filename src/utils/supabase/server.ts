import { auth } from "@clerk/nextjs/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { isLocalAuthBypassEnabled } from "@/utils/auth-mode";

/**
 * Server-side API URL. `SUPABASE_INTERNAL_URL` is for Next.js in Docker
 * (`host.docker.internal`); the browser still uses `NEXT_PUBLIC_SUPABASE_URL`.
 */
function supabaseApiUrl(): string {
  const internal = process.env.SUPABASE_INTERNAL_URL?.trim();
  if (internal) {
    return internal;
  }
  return process.env.NEXT_PUBLIC_SUPABASE_URL!;
}

/** User-scoped client (RLS enforced) using the publishable key + Clerk session. */
export const createClient = () => {
  if (isLocalAuthBypassEnabled()) {
    return createAdminClient();
  }

  return createSupabaseClient(
    supabaseApiUrl(),
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      async accessToken() {
        return (await auth()).getToken() ?? null;
      },
    }
  );
};

/** Elevated server-only client (bypasses RLS). Never import from client code. */
export const createAdminClient = () => {
  return createSupabaseClient(
    supabaseApiUrl(),
    process.env.SUPABASE_SECRET_KEY!
  );
};
