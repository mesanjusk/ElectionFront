// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Change the target if your API domain changes
const API_TARGET = 'https://electionserver.onrender.com'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Anything starting with /api will be proxied to your backend
      '/api': {
        target: API_TARGET,
        changeOrigin: true, // sets Host header to target (important for some hosts)
        secure: true,       // keep true; your target is https
        // If your backend path already starts with /api, no rewrite needed.
        // If your backend expected "/" instead, you would use:
        // rewrite: (path) => path.replace(/^\/api/, '')
      },
    },
  },
})
