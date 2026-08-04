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
const KEY_VAR = "NEXT_PUBLIC_SUPABASE_ANON_KEY";

// Read through constants, not a computed key. Next replaces `process.env.X` at
// build time only when X is written out literally; `process.env[name]` is left
// alone and evaluates to undefined in the browser.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let client: SupabaseClient | null = null;

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
        // No session tokens in the URL. This app has no OAuth redirect, and a
        // token in a URL is a token in history, in logs, and in a shared link.
        detectSessionInUrl: false,
        flowType: "pkce",
      },
      global: {
        headers: { "x-application-name": "jewelry-vault" },
      },
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
