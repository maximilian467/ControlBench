import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // "@/..." zeigt auf src/, z. B. import { api } from "@/lib/api"
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
})
