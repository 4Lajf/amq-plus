import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    globals: true,
  },
  resolve: {
    alias: {
      '$lib': path.resolve(__dirname, './src/lib'),
      '$env/static/public': path.resolve(__dirname, './tests/mocks/env-public.js'),
      '$env/static/private': path.resolve(__dirname, './tests/mocks/env-private.js')
    }
  }
});
