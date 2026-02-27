import pathLib from 'node:path';

import { defineNuxtModule } from '@nuxt/kit';

import build from './build';

export default defineNuxtModule({
  setup: (_, nuxt) => {
    const globalState = globalThis as typeof globalThis & {
      __knowledgeOutputCliBuilt?: boolean;
    };

    nuxt.hook('nitro:build:public-assets', async nitro => {
      if (globalState.__knowledgeOutputCliBuilt) {
        return;
      }

      globalState.__knowledgeOutputCliBuilt = true;
      const outputPath = pathLib.join(nitro.options.output.dir, 'server');

      await build({
        alias: nuxt.options.alias,
        outDir: outputPath,
        rootDir: nuxt.options.rootDir,
      });
    });
  },
});
