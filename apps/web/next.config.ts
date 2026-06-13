import type { NextConfig } from 'next';

const n8nBaseUrl = process.env.NEXT_PUBLIC_N8N_BASE_URL ?? 'http://localhost:5678';

const cspHeader = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self' https: wss:",
  `frame-src 'self' ${n8nBaseUrl}`,
  "frame-ancestors 'none'",
].join('; ');

const nextConfig: NextConfig = {
  transpilePackages: ['@mantleagents/shared'],
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: '/((?!orchestration).*)',
        headers: [{ key: 'Content-Security-Policy', value: cspHeader }],
      },
    ];
  },
  async redirects() {
    return [
      { source: '/dashboard', destination: '/overview', permanent: true },
      { source: '/timeline', destination: '/fx-agent?tab=timeline', permanent: true },
      { source: '/settings', destination: '/fx-agent?tab=settings', permanent: true },
    ];
  },
  serverExternalPackages: ['pino-pretty'],
};

export default nextConfig;
