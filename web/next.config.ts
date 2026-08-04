import type { NextConfig } from "next";

/**
 * Refuse to build a CI deploy that cannot reach the database.
 *
 * NEXT_PUBLIC_* values are compiled into the JavaScript at build time. In a
 * static export there is no runtime to read them later, so a build that starts
 * without them produces a site that can never sign anyone in — and it produces
 * it silently, with a green tick in the deploy log.
 *
 * That already happened once: the variables were set under Cloudflare's runtime
 * "Variables and secrets" rather than under Build, which does nothing for a site
 * with no Functions. Nothing failed; the app just deployed unable to connect.
 * This turns that into a red build with the reason in it.
 *
 * Only on CI. Local `next build` without a .env.local stays useful for checking
 * that the export still compiles.
 */
const isCI = Boolean(process.env.CF_PAGES ?? process.env.CI);

// Each entry is a list of accepted names; any one of them satisfies it. The key
// has two because Supabase renamed "anon" to "publishable" and its Connect
// snippet now emits the newer one — copying what the dashboard gives you should
// not be a mistake.
const REQUIRED = [
  ["NEXT_PUBLIC_SUPABASE_URL"],
  ["NEXT_PUBLIC_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"],
];

const missing = REQUIRED.filter((names) => !names.some((n) => process.env[n])).map((names) =>
  names.join(" or "),
);

if (isCI && missing.length > 0) {
  throw new Error(
    `Missing at build time: ${missing.join(", ")}.\n\n` +
      `In Cloudflare these are BUILD variables: Settings -> Pages configuration -> ` +
      `Environment variables -> Production. The newer top-level "Variables and secrets" ` +
      `panel is runtime configuration for Pages Functions and has no effect on a static ` +
      `export, which is compiled before any request exists.`,
  );
}

const nextConfig: NextConfig = {
  // Static export: the whole app ships as plain HTML/CSS/JS to Cloudflare Pages.
  // No Node server, no cold starts, no hosting cost.
  output: "export",

  // Required with `output: 'export'` — the default image loader needs a server.
  images: { unoptimized: true },

  // Emits /jewelry/index.html rather than /jewelry.html, which static hosts
  // resolve more predictably.
  trailingSlash: true,
};

export default nextConfig;
