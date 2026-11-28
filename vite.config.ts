import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

const buildId = new Date().toISOString()

export default defineConfig({
  define: {
    __APP_BUILD_ID__: JSON.stringify(buildId),
  },
  plugins: [
    react(),
    {
      name: "dms-build-version",
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "version.json",
          source: JSON.stringify({ buildId }),
        })
      },
    },
  ],
  server: {
    host: "127.0.0.1",
    port: 5174,
  },
})
