import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig(({ mode }) => {
  const publicEnv = loadEnv(mode, __dirname, "VITE_");
  return {
    resolve: {
      alias: { "@": resolve(__dirname, "src") },
    },
    server: {
      port: 5173,
      proxy: {
        "^/api(?:/|$)": {
          target: "http://localhost:8787",
          changeOrigin: true,
        },
      },
    },
    worker: { format: "es" },
    build: {
      outDir: "dist",
      emptyOutDir: true,
    },
    plugins: [
      react(),
      {
        name: "datavault-release-manifest",
        generateBundle() {
          this.emitFile({
            type: "asset",
            fileName: "release-manifest.json",
            source: JSON.stringify({
              schemaVersion: 1,
              contractAddress: publicEnv.VITE_CONTRACT_ADDRESS ?? "",
              chainId: publicEnv.VITE_CHAIN_ID ?? "",
              rpcUrl: publicEnv.VITE_CHAIN_RPC_URL ?? "",
            }),
          });
        },
      },
    ],
  };
});
