// `output: "standalone"` is required for Docker/SPCS deployment.
// `images.unoptimized` avoids needing the sharp package.
//
// `turbopack.root` and `outputFileTracingRoot` are pinned to this app's
// own directory because Next.js 16 + Turbopack walks upward looking for
// a lockfile and silently re-roots the project if it finds one in a
// parent directory. Symptoms when this re-roots are nasty: `/` returns
// 404, chunk URLs contain the wrong path prefix, and
// `outputFileTracingRoot` is wrong at deploy time. Keeping these
// pinned to `__dirname` is the only reliable fix; do NOT remove them
// when adding new config.

import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Vercel's Next.js builder does its own file tracing; standalone output there
  // fails with ENOENT .next/next-server.js.nft.json. Docker/SPCS keep standalone.
  output: process.env.VERCEL ? undefined : 'standalone',
  outputFileTracingRoot: __dirname,
  turbopack: {
    root: __dirname,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
