import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

// The Foundry packages don't exist outside Foundry; for local tests we
// resolve them to thin stubs. Tests target only the pure logic in
// src/comments/{types,dictionary,parse,views}.ts so the stubs are exercised
// for TypeScript typechecking, not for runtime behavior.
export default defineConfig({
  resolve: {
    alias: {
      '@foundry/functions-api': resolve(__dirname, 'src/types/foundry-stubs.ts'),
      '@foundry/ontology-api': resolve(__dirname, 'src/types/foundry-stubs.ts'),
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    reporters: ['verbose'],
    coverage: { enabled: false },
  },
});
