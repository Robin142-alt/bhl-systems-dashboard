import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['@prisma/client', 'pg'],
  images: {
    dangerouslyAllowSVG: true, // This allows the Guest avatar to show up
    contentDispositionType: 'attachment',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'ui-avatars.com',
      },
    ],
  },
  // Production optimizations
  poweredByHeader: false, // Don't expose "X-Powered-By: Next.js" header
  reactStrictMode: true,
};

export default nextConfig;