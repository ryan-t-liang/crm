import path from "node:path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: "assets/app.js",
        chunkFileNames: "assets/chunks/[name]-[hash].js",
        manualChunks: (id) => {
          if (id.includes("recharts") || id.includes("d3-")) return "charts"
          if (id.includes("react-dom") || id.includes("/react/")) return "react"
          return undefined
        },
        assetFileNames: (assetInfo) => assetInfo.names?.some((name) => name.endsWith(".css"))
          ? "assets/app.css"
          : "assets/[name]-[hash][extname]",
      },
    },
  },
})
