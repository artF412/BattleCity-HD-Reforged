import { defineConfig } from 'vite';

// Static-site build; base '' keeps asset paths relative so it deploys to any host.
export default defineConfig({
  base: '',
  build: { target: 'es2020' },
});
