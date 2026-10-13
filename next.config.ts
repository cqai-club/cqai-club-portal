import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['geoip-country'],
  outputFileTracingIncludes: {
    '/api/ebao-studio/download': [
      './node_modules/geoip-country/data/**/*',
      './node_modules/geoip-country/LICENSE',
      './node_modules/geoip-country/EULA',
    ],
  },
  // The original club site was plain Express: /apply/ and /apply both worked
  // and returned HTML. Next's default trailing-slash redirect (308 /apply/ ->
  // /apply) turns directory-style HTML into a download of the non-HTML URL.
  // Preserve the original paths exactly.
  trailingSlash: true,
  skipTrailingSlashRedirect: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
      {
        protocol: 'http',
        hostname: '**',
      },
    ],
    dangerouslyAllowSVG: true,
  },
  async headers() {
    return [
      {
        // Match the old Express static caching behavior for the site's images.
        source: '/images/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=604800' },
        ],
      },
    ];
  },
};

export default nextConfig;
