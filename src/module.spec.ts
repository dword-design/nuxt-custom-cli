import pathLib from 'node:path';

import { expect, test } from '@playwright/test';
import endent from 'endent';
import { execaCommand } from 'execa';
import fs from 'fs-extra';
import outputFiles from 'output-files';

import { CUSTOM_CLI_ERROR_MESSAGE } from './module';

test('dev', async ({}, testInfo) => {
  const cwd = testInfo.outputPath();

  await outputFiles(cwd, {
    'nuxt.config.ts':
      "export default defineNuxtConfig({ modules: ['../../src'] });",
    'server/cli.ts': "export default defineCustomCli(() => console.log('hi'))",
  });

  await execaCommand('nuxi prepare', { cwd });

  const { stdout } = await execaCommand('tsx ../../src/cli.ts', {
    cwd,
    env: { NODE_ENV: '' },
  });

  expect(stdout).toMatch(/\nhi$/m);
});

test('dev throws when defineCustomCli is missing', async ({}, testInfo) => {
  const cwd = testInfo.outputPath();

  await outputFiles(cwd, {
    'nuxt.config.ts':
      "export default defineNuxtConfig({ modules: ['../../src'] });",
    'server/cli.ts': 'export default () => {};',
  });

  await execaCommand('nuxi prepare', { cwd });

  await expect(
    execaCommand('tsx ../../src/cli.ts', { cwd, env: { NODE_ENV: '' } }),
  ).rejects.toThrow(CUSTOM_CLI_ERROR_MESSAGE);
});

test('prod', async ({}, testInfo) => {
  const cwd = testInfo.outputPath();

  await outputFiles(cwd, {
    'nuxt.config.ts':
      "export default defineNuxtConfig({ modules: ['../../src'] });",
    'server/cli.ts': "export default defineCustomCli(() => console.log('hi'))",
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

      export default defineCustomCli(foo);
    `,
  });

  await execaCommand('nuxt build', { cwd });
  await fs.remove(pathLib.join(cwd, 'node_modules'));
  const { stdout } = await execaCommand('node .output/server/cli.mjs', { cwd });
  expect(stdout).toEqual('hi');
});

test('prod throws when defineCustomCli is missing', async ({}, testInfo) => {
  const cwd = testInfo.outputPath();

  await outputFiles(cwd, {
    'nuxt.config.ts':
      "export default defineNuxtConfig({ modules: ['../../src'] });",
    'server/cli.ts': 'export default () => {};',
  });

  await execaCommand('nuxt build', { cwd });

  await expect(
    execaCommand('node .output/server/cli.mjs', { cwd }),
  ).rejects.toThrow(CUSTOM_CLI_ERROR_MESSAGE);
});

test.describe('type', () => {
  const TSCONFIG_STRING = JSON.stringify({
    files: [],
    references: [
      { path: './.nuxt/tsconfig.app.json' },
      { path: './.nuxt/tsconfig.server.json' },
      { path: './.nuxt/tsconfig.shared.json' },
      { path: './.nuxt/tsconfig.node.json' },
    ],
  });

  test('correct', async ({}, testInfo) => {
    const cwd = testInfo.outputPath();

    await outputFiles(cwd, {
      'nuxt.config.ts':
        "export default defineNuxtConfig({ modules: ['../../src'] });",
      'server/cli.ts': 'export default defineCustomCli(() => {})',
      'tsconfig.json': TSCONFIG_STRING,
    });

    await execaCommand('nuxt typecheck', { cwd });
  });

  test('return value', async ({}, testInfo) => {
    const cwd = testInfo.outputPath();

    await outputFiles(cwd, {
      'nuxt.config.ts':
        "export default defineNuxtConfig({ modules: ['../../src'] });",
      'server/cli.ts': "export default defineCustomCli(() => 'foo')",
      'tsconfig.json': TSCONFIG_STRING,
    });

    await execaCommand('nuxt typecheck', { cwd });
  });

  test('wrong', async ({}, testInfo) => {
    const cwd = testInfo.outputPath();

    await outputFiles(cwd, {
      'nuxt.config.ts':
        "export default defineNuxtConfig({ modules: ['../../src'] });",
      'server/cli.ts': "export default defineCustomCli('foo');",
      'tsconfig.json': TSCONFIG_STRING,
    });

    await expect(execaCommand('nuxt typecheck', { cwd })).rejects.toThrow();
  });
});
