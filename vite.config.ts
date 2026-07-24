/**
 * DocuTools Pro - Configuração Vite
 * 
 * Este arquivo configura o bundler Vite com:
 * - Plugin React para Fast Refresh
 * - Plugin Tailwind CSS 4
 * - Plugin PWA para Progressive Web App
 * - Aliases de importação
 * - Configurações de build otimizadas
 */

import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// Obtém __dirname em ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vite.dev/config/
export default defineConfig({
  // ============================================
  // RESOLUÇÃO DE MÓDULOS
  // ============================================
  resolve: {
    alias: {
      // Permite usar @/ como alias para src/
      "@": path.resolve(__dirname, "src"),
    },
  },

  // ============================================
  // CONFIGURAÇÕES DE WORKER
  // ============================================
  worker: {
    // Formato ES para workers (necessário para Tesseract.js)
    format: "es",
  },

  // ============================================
  // CONFIGURAÇÕES DE BUILD
  // ============================================
  build: {
    // Target moderno para melhor performance
    target: "esnext",
    
    // Aumenta o limite de warning para chunks grandes (Tesseract.js é grande)
    chunkSizeWarningLimit: 1000,
    
    // Configurações de rollup para melhor code-splitting
    rollupOptions: {
      output: {
        manualChunks: {
          // Separa vendors grandes em chunks próprios
          'vendor-react': ['react', 'react-dom'],
          'vendor-docx': ['docx', 'jspdf', 'file-saver'],
          'vendor-icons': ['lucide-react'],
        },
      },
    },
  },

  // ============================================
  // PLUGINS
  // ============================================
  plugins: [
    // Plugin React com Fast Refresh
    react(),

    // Plugin Tailwind CSS 4
    tailwindcss(),

    // Plugin PWA
    VitePWA({
      // Atualiza automaticamente o service worker
      registerType: "autoUpdate",
      
      // Injeta registro automaticamente
      injectRegister: "auto",

      // Assets a incluir no cache
      includeAssets: ["logo.png"],

      // Configurações do Workbox
      workbox: {
        // Aumenta limite de cache para 30MB (necessário para Tesseract.js)
        maximumFileSizeToCacheInBytes: 30 * 1024 * 1024,
        
        // Limpa caches antigos
        cleanupOutdatedCaches: true,
        
        // Arquivos a incluir no precache
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        
        // Cache runtime para recursos externos
        runtimeCaching: [
          {
            // Cache para modelos do Hugging Face
            urlPattern: /^https:\/\/huggingface\.co\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "hf-models",
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 dias
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            // Cache para CDN do Hugging Face
            urlPattern: /^https:\/\/cdn-lfs\.huggingface\.co\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "hf-lfs",
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 dias
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            // Cache para imagens geradas (Pollinations)
            urlPattern: /^https:\/\/image\.pollinations\.ai\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "generated-images",
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 7, // 7 dias
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },

      // Configurações do Web App Manifest
      manifest: {
        name: "DocuTools Pro",
        short_name: "DocuTools",
        description: "OCR, IA, Transcrição de Áudio, Tradução, PDF e Conversão de Mídia",
        theme_color: "#6366f1",
        background_color: "#ffffff",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        categories: ["productivity", "utilities"],
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
    }),
  ],
});