import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingIncludes: {
    "/*": ["./AGENTS.md", "./data/**/*"],
  },
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
