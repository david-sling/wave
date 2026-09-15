import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The agent docs are read off disk by app/agent/[topic]. They are prerendered
  // at build, so this is belt and braces — but a traced bundle that dropped them
  // would take out the one page an agent reaches for when it is already stuck.
  outputFileTracingIncludes: {
    "/agent/[topic]": ["./docs/agent/**/*.md"],
  },
};

export default nextConfig;
