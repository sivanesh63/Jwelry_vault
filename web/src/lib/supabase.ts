/**
 * The Supabase client, and the only place that knows the project exists.
 *
 * Created lazily rather than at module load. A static export runs this file
 * during `next build`, where the environment variables may be absent — creating
 * the client there would fail the build for every page, including the ones that
 * never talk to the database. Deferring it means a missing variable surfaces as
 * a sentence on screen at the moment somebody signs in, which is both later and
 * far easier to diagnose.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { fromPgBytea, toPgBytea, type Bytes } from "./crypto";

const URL_VAR = "NEXT_PUBLIC_SUPABASE_URL";
const KEY_VAR = "NEXT_PUBLIC_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY";

// Written out literally, never as process.env[name]. Next substitutes these at
// build time only when the property access is spelled out; a computed key is
// left alone and evaluates to undefined in the browser.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;

// Two names for the same thing. Supabase renamed the browser-safe key from
// "anon" to "publishable", and its own Connect snippet now emits
// NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Copying what the dashboard hands you
// should work, so both are accepted rather than making the name a thing to get
// wrong. Values look like `eyJhbGci…` (older) or `sb_publishable_…` (newer);
// supabase-js takes either.
const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

let client: SupabaseClient | null = null;

/**
 * How this page was opened: "invite", "recovery", or null for a normal visit.
 *
 * Captured at module load, which is the only moment it is available —
 * supabase-js clears the token out of the address bar as soon as it exchanges
 * it, and by the time any component renders the evidence is gone.
 *
 * It matters because somebody arriving from an invite has a valid session and
 * no password. Sending them straight into the vault would leave an account they
 * can never sign into again once that link expires.
 */
function urlParams(): URLSearchParams {
  const merged = new URLSearchParams(window.location.search);
  for (const [k, v] of new URLSearchParams(window.location.hash.replace(/^#/, ""))) {
    if (!merged.has(k)) merged.set(k, v);
  }
  return merged;
}

export const arrivedFrom: "invite" | "recovery" | null = (() => {
  if (typeof window === "undefined") return null;
  const type = urlParams().get("type");
  return type === "invite" || type === "recovery" ? type : null;
})();

/**
 * Why an email link failed, if it did.
 *
 * Supabase reports a refused link by redirecting back with `error` and
 * `error_description` in the fragment. Nothing consumes those by default, so
 * the app simply rendered its sign-in form — and somebody who has never had a
 * password is then staring at a password field with no explanation, which is
 * exactly what happened here.
 *
 * The common case is not a bug at all: invite links are single-use, so opening
 * one twice fails the second time. That is worth saying in words rather than
 * leaving somebody to conclude the app is broken.
 */
export const linkError: string | null = (() => {
  if (typeof window === "undefined") return null;
  const params = urlParams();
  const code = params.get("error_code") ?? params.get("error");
  if (!code) return null;

  const described = params.get("error_description")?.replace(/\+/g, " ") ?? code;
  if (/expired|invalid|not_found|otp/i.test(code + described)) {
    return `${described}. Invite and recovery links can only be opened once and expire after a day — ask an admin to send a fresh one.`;
  }
  return described;
})();

/** True when the app has been given a project to talk to. */
export function isConfigured(): boolean {
  return Boolean(url && anonKey);
}

export function getSupabase(): SupabaseClient {
  if (!url || !anonKey) {
    throw new Error(
      `The vault is not connected to a database. Set ${URL_VAR} and ${KEY_VAR} ` +
        `in Cloudflare Pages → Settings → Environment variables (Production and Preview), ` +
        `then redeploy.`,
    );
  }
  if (!client) {
    client = createClient(url, anonKey, {
      auth: {
        // The session outliving a tab is the point: the PIN, not a re-login, is
        // what stands between a returning family member and their vault. The
        // session alone still decrypts nothing.
        persistSession: true,
        autoRefreshToken: true,

        // This was false, on the reasoning that a token in a URL is a token in
        // history and in logs. The reasoning was fine and the setting was
        // wrong: an invite link *is* a token in a URL, so the app ignored it
        // and dropped invited people on a sign-in form asking for a password
        // that did not exist yet. There was no way into the vault for anyone
        // who was not the founder.
        //
        // supabase-js strips the token from the address bar as soon as it has
        // exchanged it, so the exposure is one navigation rather than a
        // permanent entry in history.
        detectSessionInUrl: true,

        // Implicit rather than PKCE, deliberately. PKCE keeps a code verifier
        // in the browser that started the flow — but nobody starts an invite in
        // a browser. It starts in an email client, and the link may well open
        // in a different browser or on a different device, where the verifier
        // does not exist and verification simply fails.
        flowType: "implicit",
      },
      // No custom global headers, deliberately. An "x-application-name" label
      // lived here and did nothing but appear in logs nobody reads — while
      // adding itself to every CORS preflight, where the Edge Function's
      // allow-list did not name it and the browser refused the request before
      // it left the device. A decorative header is not worth a class of failure
      // that reports itself as "Failed to send a request".
    });
  }
  return client;
}

/**
 * Calls an RPC and throws on failure instead of returning `{ data, error }`.
 *
 * Postgres error messages from the state machine are written to be read by a
 * person — "Cannot take out item …: it is with_member" — so they are surfaced
 * rather than replaced with a generic failure.
 */
export async function rpc<T>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await getSupabase().rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}

// ------------------------------------------------------------ bytea wire ----
//
// PostgREST sends and receives bytea as the Postgres hex literal `\x…`. Getting
// this wrong is silent: the bytes go in as the ASCII of the string "\x0148…"
// and nothing complains until a decrypt fails weeks later. These two are the
// only sanctioned crossing points.

/** Bytes on their way into a bytea column or an RPC argument. */
export function toPg(bytes: Bytes | null | undefined): string | null {
  return bytes ? toPgBytea(bytes) : null;
}

export function decodeBytea(value: unknown): Bytes | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Uint8Array) return value as Bytes;
  if (typeof value === "string") return fromPgBytea(value);
  throw new Error("Expected bytea as a hex string from PostgREST");
}

/**
 * Supabase has no way to say "this project is awake". The free tier pauses a
 * project after a week of inactivity, and the first request afterwards fails in
 * a way that looks like a network error rather than a paused database — worth
 * naming, because the fix is a dashboard click and nothing in the app.
 */
export function describeConnectionFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return (
      "Could not reach the database. If nobody has opened the vault in over a " +
      "week, the free-tier project may have paused — resume it from the " +
      "Supabase dashboard."
    );
  }
  return message;
}
