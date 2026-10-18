import type { NextConfig } from "next";

const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined;

const nextConfig: NextConfig = {
  // Report photos are served from the public Supabase Storage bucket.
  images: {
    remotePatterns: supabaseHost
      ? [{ protocol: "https", hostname: supabaseHost, pathname: "/storage/v1/object/public/photos/**" }]
      : [],
  },
  cacheComponents: true,
  partialPrefetching: true,
  // Phones reach the dev server through a Cloudflare quick tunnel (HTTPS is needed for camera GPS).
  allowedDevOrigins: ["*.trycloudflare.com"],
  turbopack: {
    // A stray lockfile in the home folder would otherwise be taken as the workspace root.
    root: import.meta.dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
