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
  // Das Backend erlaubt per CORS nur Port 5173. Ist er belegt, lieber mit Fehler abbrechen
  // als still auf 5174 auszuweichen, wo der Browser dann jede API-Anfrage blockiert.
  server: { port: 5173, strictPort: true },
})
