import { defineConfig } from 'vite';

// GitHub Pages serves project sites from a sub-path, so the Pages build needs
// the repository name as base and writes straight into docs/. Local dev,
// preview and the default build stay at the site root.
const pages = process.env.GITHUB_PAGES === 'true';

export default defineConfig({
  // relative base: the bundle works at any host/sub-path (GitHub Pages project
  // sites, CDN mirrors, a folder opened over HTTP)
  base: pages ? './' : '/',
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    strictPort: true,
    allowedHosts: true,
  },
  build: {
    target: 'es2020',
    outDir: pages ? 'docs' : 'dist',
    emptyOutDir: true,
  },
});
