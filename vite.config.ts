import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'DocuTools Pro',
        short_name: 'DocuTools',
        description: 'A Ferramenta Definitiva para OCR, Imagens e IA.',
        theme_color: '#2563eb',
        background_color: '#f8fafc',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {
            // Ícone temporário em alta resolução direto da web para funcionar imediatamente
            src: 'https://cdn-icons-png.flaticon.com/512/2911/2911230.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
});
