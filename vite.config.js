import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Recharts is by far the heaviest dependency and changes far less often
        // than app code — splitting it lets browsers keep it cached across
        // deploys instead of re-downloading 500kB on every push.
        manualChunks: {
          charts: ["recharts"],
          supabase: ["@supabase/supabase-js"],
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
});
