import { resolve as resolvePath } from 'node:path'
import { defineConfig } from 'vitest/config'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  resolve:
    mode === 'test'
      ? {
          // In jsdom the client build of Svelte is what component tests need;
          // without this the server entry loads and lifecycle hooks no-op.
          alias: [{ find: /^svelte$/, replacement: resolvePath('node_modules/svelte/src/index-client.js') }],
        }
      : undefined,
  plugins: [svelte()],
  test: {
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**'],
    globals: true,
    environment: 'jsdom',
    server: {
      deps: {
        inline: ['@testing-library/svelte'],
      },
    },
  },
}))
