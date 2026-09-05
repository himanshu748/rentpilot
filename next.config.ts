import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "[::1]"],
  output: "export",
  images: { unoptimized: true },
  env: {
    NEXT_PUBLIC_CONVEX_URL:
      process.env.VITE_CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL,
  },
};

export default nextConfig;
