import { defineConfig } from 'vitest/config';

export default defineConfig({
  ssr: {
    noExternal: [
      '@dnd-booker/shared',
      '@dnd-booker/text-layout',
    ],
  },
  test: {
    environment: 'node',
  },
});
