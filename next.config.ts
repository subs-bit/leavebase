import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: { typedRoutes: false },
  // The policy PDF lives outside /public so it can be auth-gated. Tell the build to ship it
  // alongside the route that reads it, or the file is missing once deployed.
  outputFileTracingIncludes: {
    "/api/policy-document": ["./private-assets/**"],
  },
};

export default nextConfig;
