import pathLib from 'node:path';

import { expect, test } from '@playwright/test';
import endent from 'endent';
import { execaCommand } from 'execa';
import fs from 'fs-extra';
import outputFiles from 'output-files';

test('dev', async ({}, testInfo) => {
  const cwd = testInfo.outputPath();

  await outputFiles(cwd, {
    'nuxt.config.ts':
      "export default defineNuxtConfig({ modules: ['../../src'] });",
    'server/cli.ts': "export default () => console.log('hi')",
  });

  await execaCommand('nuxi prepare', { cwd });

  const { stdout } = await execaCommand('tsx ../../src/cli.ts', {
    cwd,
    env: { NODE_ENV: '' },
  });

  expect(stdout).toMatch(/\nhi$/m);
});

test('prod', async ({}, testInfo) => {
  const cwd = testInfo.outputPath();

  await outputFiles(cwd, {
    'nuxt.config.ts':
      "export default defineNuxtConfig({ modules: ['../../src'] });",
    'server/cli.ts': "export default () => console.log('hi')",
  });

  await execaCommand('nuxt build', { cwd });
  const { stdout } = await execaCommand('node .output/server/cli.mjs', { cwd });
  expect(stdout).toEqual('hi');
});

test('dependency and prod', async ({}, testInfo) => {
  const cwd = testInfo.outputPath();

  await outputFiles(cwd, {
    'node_modules/foo': {
      'index.js': "export default () => console.log('hi');",
      'package.json': JSON.stringify({
        exports: './index.js',
        name: 'foo',
        type: 'module',
      }),
    },
    'nuxt.config.ts':
      "export default defineNuxtConfig({ modules: ['../../src'] });",
    'server/cli.ts': endent`
      import foo from 'foo';

      export default foo;
    `,
  });

  await execaCommand('nuxt build', { cwd });
  await fs.remove(pathLib.join(cwd, 'node_modules'));
  const { stdout } = await execaCommand('node .output/server/cli.mjs', { cwd });
  expect(stdout).toEqual('hi');
});
