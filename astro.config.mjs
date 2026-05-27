import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://ltaylor067758.github.io',
  base: '/daily-briefing/',
  output: 'static',
  build: {
    assets: 'assets'
  }
});
