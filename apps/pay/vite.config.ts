import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// envDir: read VITE_* from the repo root .env, next to the server's settings.
export default defineConfig({ plugins: [react(), tailwindcss()], envDir: "../.." })
