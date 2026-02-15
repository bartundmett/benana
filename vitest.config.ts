import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/.git/**', 'dist-electron/**', 'dist-renderer/**', 'release/**']
  }
});
