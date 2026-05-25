import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
        port: "54321",
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "http",
        hostname: "127.0.0.1",
        port: "54321",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  devIndicators: false,
  // Next.js 16: Server Actions を 127.0.0.1 からも許可する。
  // Supabase Auth の Cookie スコープ都合で app を 127.0.0.1:3000 でアクセスしているため必須。
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  experimental: {
    serverActions: {
      // 添付（最大5枚×5MB=25MB）がフレームワーク段階で弾かれないよう余裕を持たせる（support spec）
      bodySizeLimit: "30mb",
    },
  },
};

export default nextConfig;
