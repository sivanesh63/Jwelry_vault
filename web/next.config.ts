import type { NextConfig } from "next";

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
