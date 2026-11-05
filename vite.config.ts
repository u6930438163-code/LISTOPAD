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
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      // Katalogi danych runtime (aplikacje Studia, bazy, eksporty) są zapisywane przez serwer;
      // ich obserwowanie powodowało ciągłe przeładowania interfejsu.
      watch: process.env.DISABLE_HMR === 'true' ? null : {
        ignored: ['**/apps/**', '**/data/**', '**/exports/**', '**/Nowy_system/**', '**/bastillaos/**', '**/*.sqlite', '**/.svl_deployments.json'],
      },
    },
  };
});

