import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',  // ← IMPORTANT pour accès réseau LAN
    port: 5173,
    // Proxy pour rediriger les appels API vers le backend
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        secure: false,
      },
      // Proxy pour Socket.IO aussi
      '/socket.io': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        ws: true, // Important pour WebSocket
      },
    },
  },
})
