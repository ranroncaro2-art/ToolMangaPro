import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/accounts',
        destination: 'http://127.0.0.1:5000/api/accounts',
      },
    ];
  },
};

export default nextConfig;
