/**
 * Creating a login for a new family member.
 *
 * This exists because the browser cannot do it. Creating an auth user needs the
 * service_role key, and that key bypasses every RLS policy in the database — a
 * page anyone can open must never hold it. So the one operation that needs it
 * lives here, on a server, doing exactly that one thing.
 *
 * The function is not a hole in the security model, because it re-establishes
 * the same check the database would have made:
 *
 *   1. It reads the caller's JWT and asks Postgres, as that caller, whether
 *      they are an admin. RLS answers, not this code.
 *   2. It takes family_id from that same answer, never from the request body.
 *      A body-supplied family_id would let any admin post someone into another
 *      family — the exact isolation tests/rls_isolation.sql exists to prove.
 *
 * What it deliberately does NOT do is grant access to anything. It creates a
 * login and a members row. The new person still sees only ciphertext until an
 * admin admits them in the browser, because the family key never leaves a
 * browser and this server has no way to obtain it.
 *
 *
 * Deploy:
 *   npx supabase functions deploy invite-member
 *
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected by the platform.
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * CORS headers, echoing whatever the browser asked to send.
 *
 * A hardcoded allow-list was wrong here, and failed in a way that was hard to
 * read: supabase-js sends `x-supabase-api-version` (and `x-region` in some
 * versions), the preflight did not list them, so the browser refused before the
 * request left the device. The client reports that as "Failed to send a request
 * to the Edge Function" — no status code, nothing in the function's logs,
 * because the function was never reached.
 *
 * Echoing the requested headers keeps a future supabase-js release from
 * breaking invites the same way. It is not a weakening: the caller still has to
 * present a valid JWT belonging to an admin, and this is a wildcard-origin
 * endpoint with no cookie auth, so there is no credentialed cross-origin
 * request for a header allow-list to have been protecting.
 */
function cors(req: Request): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      req.headers.get("Access-Control-Request-Headers") ??
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
}

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "Use POST" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json(req, { error: "Sign in first" }, 401);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Bound to the caller's token, so every query runs under their RLS.
  const asCaller = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: isAdmin, error: adminError } = await asCaller.rpc("is_admin");
  if (adminError) return json(req, { error: adminError.message }, 400);
  if (!isAdmin) return json(req, { error: "Only an admin can invite" }, 403);

  // From the caller's own membership, never from the request. This is the line
  // that keeps an admin of one family from posting a member into another.
  const { data: familyId, error: familyError } = await asCaller.rpc("current_family_id");
  if (familyError || !familyId) {
    return json(req, { error: familyError?.message ?? "No family" }, 400);
  }

  let body: { email?: string; displayName?: string; role?: string };
  try {
    body = await req.json();
  } catch {
    return json(req, { error: "Expected a JSON body" }, 400);
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const displayName = (body.displayName ?? "").trim();
  // Anything unrecognised becomes a plain member. Silently upgrading somebody
  // to admin because of a typo is the wrong direction to fail in.
  const role = body.role === "admin" ? "admin" : "member";

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json(req, { error: "That email is not valid" }, 400);
  if (!displayName) return json(req, { error: "A name is required" }, 400);

  const asAdmin = createClient(url, serviceKey);

  // The metadata is load-bearing: handle_new_user() in 0005_auth.sql reads it
  // to create the members row. Without it the invitee signs in to nothing and
  // the trigger deliberately does nothing rather than guess a family.
  const { data, error } = await asAdmin.auth.admin.inviteUserByEmail(email, {
    data: { family_id: familyId, display_name: displayName, role },
  });

  if (error) {
    // Supabase's built-in mailer is rate limited on the free plan, and that
    // failure looks like a bug in the app unless it is named.
    const hint = /rate|limit/i.test(error.message)
      ? " Supabase's built-in email is limited to a few messages an hour on the free plan. Configure SMTP under Authentication → Emails, or add the user directly in the dashboard."
      : "";
    return json(req, { error: error.message + hint }, 400);
  }

  return json(req, { userId: data.user?.id ?? null, email, displayName, role });
});
