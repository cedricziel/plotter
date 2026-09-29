import { defineConfig } from 'vite';

// Bundles the API server and the data builder into single Node files so the
// runtime image needs neither node_modules nor a TypeScript loader.
export default defineConfig({
  publicDir: false,
  build: {
    ssr: true,
    outDir: 'server-dist',
    emptyOutDir: true,
    target: 'node22',
    rollupOptions: {
      input: { server: 'server/main.ts', waterways: 'tools/waterways/cli.ts', fis: 'tools/fis/cli.ts' },
      output: { entryFileNames: '[name].mjs' },
    },
  },
  ssr: { noExternal: true },
});
