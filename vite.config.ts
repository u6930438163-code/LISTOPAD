import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      allowedHosts: ['terminal.local'],
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Keep source transforms fresh after GitHub sync even with live HMR disabled,
      // while ignoring runtime directories to prevent unnecessary rebuild loops.
      watch: {
        ignored: ['**/apps/**', '**/data/**', '**/exports/**', '**/Nowy_system/**', '**/bastillaos/**', '**/*.sqlite', '**/.svl_deployments.json'],
      },
    },
  };
});

