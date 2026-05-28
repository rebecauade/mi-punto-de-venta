import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        short_name: "taloapp",
        name: "TaloApp - Punto de Venta",
        description: "Sistema de gestión de ventas y stock para comercios",
        start_url: "/",
        display: "standalone",
        theme_color: "#7c3aed",
        background_color: "#ffffff",
        orientation: "portrait",
        icons: [
          {
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ]
});