import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ['firebase-admin'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
      {
        // Never let a quiz payload sit in a shared/proxy cache. Proctoring
        // images (/api/admin/snapshots/<id>) are left out: they never change,
        // set their own private cache header, and re-downloading one costs a
        // Firestore read every time.
        source: '/api/:path((?!admin/snapshots/).*)',
        headers: [{ key: 'Cache-Control', value: 'no-store, max-age=0' }],
      },
    ];
  },
};

export default nextConfig;
