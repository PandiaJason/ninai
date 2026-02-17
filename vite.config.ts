import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  server: {
    watch: {
      ignored: ['**/release/**']
    }
  },
  base: './',
  plugins: [react()],
  esbuild: {
    drop: ['console', 'debugger'], // Strip all logs in production
  },
  build: {
    sourcemap: false, // Disable source maps for smaller bundle
    minify: 'esbuild', // Fast and efficient minification
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor': ['react', 'react-dom', 'dexie', 'dexie-react-hooks'],
          'tiptap': ['@tiptap/react', '@tiptap/starter-kit', '@tiptap/extension-image'],
        }
      }
    }
  }
})
