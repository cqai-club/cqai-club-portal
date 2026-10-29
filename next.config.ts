import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['geoip-country'],
  async headers() {
    return ['/member/:path*', '/preview/:path*', '/api/admin/:path*', '/mcp/:path*', '/catalog-source.json'].map(source => ({
      source,
      headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
    }));
  },
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
};

export default nextConfig;
