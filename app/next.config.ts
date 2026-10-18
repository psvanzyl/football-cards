import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output: the Coolify image only ships the server bundle + static assets.
  output: "standalone",

  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
