/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @aya/shared is a workspace TypeScript package shipped as source-built dist;
  // transpile it so Next can consume it directly in the monorepo.
  transpilePackages: ['@aya/shared'],
};

export default nextConfig;
