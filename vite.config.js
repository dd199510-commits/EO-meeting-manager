import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import process from 'node:process'
import { fileURLToPath, URL } from 'node:url'
import { sites } from './build/sites-vite-plugin.js'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react(), sites()],
  resolve: {
    alias: {
      '@seedData': fileURLToPath(new URL(
        process.env.VITE_PUBLIC_EMPTY_DATA === 'true'
          ? './src/data/emptySeedData.js'
          : './src/data/seedData.js',
        import.meta.url,
      )),
    },
  },
})
