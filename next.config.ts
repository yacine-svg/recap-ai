import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  webpack(config) {
    // @shadergradient/react only exports an "import" condition, which Next's server
    // bundle can't resolve. Point the bundler straight at its ES module.
    config.resolve.alias = {
      ...config.resolve.alias,
      "@shadergradient/react$": path.join(process.cwd(), "node_modules/@shadergradient/react/dist/index.mjs"),
    };
    return config;
  },
};

export default nextConfig;
