import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config) => {
    config.externals.push("pino-pretty", "lokijs", "encoding");
    
    // Exclure les fichiers Hardhat du webpack
    config.resolve.alias = {
      ...config.resolve.alias,
      "hardhat": false,
      "hardhat/config": false,
      "hardhat/deploy": false,
      "@nomicfoundation/hardhat-toolbox": false,
    };
    
    return config;
  },
};

export default nextConfig;
