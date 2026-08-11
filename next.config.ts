import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The dev overlay badge sits bottom-left, exactly where the AI composer lives.
  devIndicators: false,
}

export default nextConfig
