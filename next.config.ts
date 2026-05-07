import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this directory. Without it, Next walks up
  // the tree looking for lockfiles and finds the stray
  // C:\Users\rspcb\package-lock.json in the user's home folder, which it
  // wrongly treats as the workspace root. That throws off Turbopack's
  // file-watching scope and the dependency graph it has to invalidate
  // when files change. process.cwd() is the directory from which `next`
  // is invoked — always this project root when run via npm scripts.
  turbopack: {
    root: process.cwd(),
  },

  // LAN IPs allowed to hit this dev server (fixes the "Cross-origin
  // request blocked" warning when accessing the dev URL from another
  // machine on the same network — phone, second laptop, etc.).
  // Both IPs in the previous config got collapsed to one because the
  // file accidentally declared `allowedDevOrigins` twice; consolidating
  // to a single array.
  allowedDevOrigins: ["172.26.160.1", "192.168.1.4", "172.17.16.1", "192.168.1.12"],

  // Tree-shake heavy packages where we only use a subset. Without this,
  // every route that imports a single lucide icon pulls in the entire
  // icon library at JIT compile time — the visible "compiling…"
  // indicator on every navigation. With it, only the imported names are
  // bundled per route. Same wins for @base-ui/react primitives and the
  // command-menu (cmdk).
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "@base-ui/react",
      "cmdk",
      "@radix-ui/react-icons",
      "date-fns",
    ],
  },
};

export default nextConfig;
