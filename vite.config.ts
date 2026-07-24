import path from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

  worker: {
    format: "es",
  },

  build: {
    target: "esnext",
    chunkSizeWarningLimit: 1000,

    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("react")) {
            return "vendor-react";
          }

          if (
            id.includes("docx") ||
            id.includes("jspdf") ||
            id.includes("file-saver")
          ) {
            return "vendor-docx";
          }

          if (id.includes("lucide-react")) {
            return "vendor-icons";
          }
        },
      },
    },
  },

  plugins: [
    react(),
    tailwindcss(),

    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",

      includeAssets: [
        "logo.png",
        "favicon.ico",
        "apple-touch-icon.png",
      ],

      workbox: {
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 30 * 1024 * 1024,

        // Protege a API do cache do PWA
        navigateFallbackDenylist: [/^\/api/],

        globPatterns: [
          "**/*.{js,css,html,ico,png,svg,woff,woff2}",
        ],

        runtimeCaching: [
          {
            urlPattern: /^https:\/\/huggingface\.co\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "hf-models",
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/cdn-lfs\.huggingface\.co\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "hf-lfs",
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/image\.pollinations\.ai\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "generated-images",
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 7,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },

      manifest: {
        name: "DocuTools Pro",
        short_name: "DocuTools",
        description:
          "OCR, IA, Transcrição de Áudio, Tradução, PDF e Conversão de Mídia",
        theme_color: "#6366f1",
        background_color: "#ffffff",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",

        categories: [
          "productivity",
          "utilities",
        ],

        icons: [
          {
            src: "/logo.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any maskable",
          },
          {
            src: "/logo.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },

      devOptions: {
        enabled: true,
      },
    }),
  ],
});