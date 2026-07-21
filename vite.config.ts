import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  optimizeDeps: {
    exclude: [
      '@huggingface/transformers'
    ]
  },

  worker: {
    format: 'es'
  },

  build: {
    target: 'esnext'
  },

  plugins: [
    react(),

    tailwindcss(),

    VitePWA({
      registerType: 'autoUpdate',

      injectRegister: 'auto',

      includeAssets: [
        'logo.png'
      ],

      workbox: {
        cleanupOutdatedCaches: true,

        runtimeCaching: [
          {
            urlPattern: /^https:\/\/huggingface\.co\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'hf-models',
              expiration: {
                maxEntries: 20
              }
            }
          },

          {
            urlPattern: /^https:\/\/cdn-lfs\.huggingface\.co\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'hf-lfs',
              expiration: {
                maxEntries: 20
              }
            }
          }
        ]
      },

      manifest: {
        name: 'DocuTools Pro',

        short_name: 'DocuTools',

        description:
          'OCR, IA, Transcrição de Áudio, Tradução, PDF e Conversão de Mídia',

        theme_color: '#ffffff',

        background_color: '#ffffff',

        display: 'standalone',

        orientation: 'portrait',

        icons: [
          {
            src: '/logo.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },

          {
            src: '/logo.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ]
});