import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: process.env.VERCEL ? undefined : 'standalone',
  // The course workspace sits below another lockfile in the user directory.
  // Keep all tracing and Turbopack identifiers relative to this repository.
  outputFileTracingRoot: process.cwd(),
  turbopack: { root: process.cwd() },
  transpilePackages: ['mathml2omml', 'pptxgenjs', '@openmaic/importer'],
  // These agent packages do a runtime `import(specifier)` with a computed
  // specifier (to lazily load node:fs/os/path without breaking browser/Vite
  // builds). webpack can't statically analyze that and bundling it throws
  // "Cannot find module as expression is too dynamic" at runtime on the server
  // (the "Edit with AI" Pro-mode path), which broke the #619 keep-alive e2e.
  // Mark them server-external so Next loads them natively and the dynamic
  // import resolves as a real Node call.
  serverExternalPackages: [
    '@earendil-works/pi-ai',
    '@earendil-works/pi-agent-core',
    '@openmaic/generation',
    // Keep PostgreSQL's Node-only modules on the server side. This preserves
    // the instrumentation boundary with or without DATABASE_URL configured.
    'pg',
    'pg-connection-string',
  ],
  webpack(config, { isServer, nextRuntime, webpack: webpackLib }) {
    if (!isServer || nextRuntime === 'edge') {
      // instrumentation.ts conditionally imports the Node-only asset collector.
      // Webpack still walks that dynamic branch while preparing the client
      // graph, where `pg` would pull in path/stream/util. The branch never runs
      // in a browser, so replace only the client-side resolution with an empty
      // module while retaining the real external package on the server.
      config.resolve.alias = {
        ...config.resolve.alias,
        '@/lib/persistence/asset-collector-schedule$': false,
        pg: false,
        'pg-connection-string': false,
      };
      config.plugins.push(
        new webpackLib.IgnorePlugin({
          resourceRegExp: /asset-collector-schedule/,
        }),
      );
    }
    return config;
  },
  experimental: {
    proxyClientMaxBodySize: '200mb',
  },
  async headers() {
    const extraAncestors = process.env.ALLOWED_FRAME_ANCESTORS?.trim();
    const frameAncestors = extraAncestors ? `'self' ${extraAncestors}` : "'self'";

    return [
      {
        source: '/(.*)',
        headers: [
          // X-Frame-Options only supports SAMEORIGIN (no allow-list),
          // so we omit it when custom ancestors are configured.
          ...(!extraAncestors ? [{ key: 'X-Frame-Options', value: 'SAMEORIGIN' }] : []),
          {
            key: 'Content-Security-Policy',
            value: `frame-ancestors ${frameAncestors}`,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
