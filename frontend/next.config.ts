import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  images: {
    // Allow images from your Supabase Storage domain
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'muytnsmayhmlgbnwbiap.supabase.co', // Your Supabase project hostname
        port: '',
        pathname: '/storage/v1/object/public/**', // Allow access to public storage objects
      },
    ],
  },
};

export default nextConfig;
