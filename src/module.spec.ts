import pathLib from 'node:path';

import { expect, test } from '@playwright/test';
import endent from 'endent';
import { execaCommand } from 'execa';
import fs from 'fs-extra';
import outputFiles from 'output-files';
import stripAnsi from 'strip-ansi';

import { CUSTOM_CLI_ERROR_MESSAGE } from './module';

test.describe('dev', () => {
  test('valid', async ({}, testInfo) => {
    const cwd = testInfo.outputPath();

    await outputFiles(cwd, {
      'nuxt.config.ts':
        "export default defineNuxtConfig({ modules: ['../../src'] });",
      'server/cli.ts':
        "export default defineCustomCli(() => console.log('hi'))",
    });

    await execaCommand('nuxi prepare', { cwd });

    const { stdout } = await execaCommand('tsx ../../src/cli.ts', {
      cwd,
      env: { CI: '1', NODE_ENV: '' }, // CI: 1 for consistent log output between local and CI runs
    });

    expect(stdout).toMatch(/^\[log\] \[log\] hi$/m);
  });

  test('error', async ({}, testInfo) => {
    const cwd = testInfo.outputPath();

    await outputFiles(cwd, {
      'nuxt.config.ts':
        "export default defineNuxtConfig({ modules: ['../../src'] });",
      'server/cli.ts':
        "export default defineCustomCli(() => { throw new Error('foo'); })",
    });

    await execaCommand('nuxi prepare', { cwd });

    const result = await execaCommand('tsx ../../src/cli.ts', {
      cwd,
      env: { CI: '1', NODE_ENV: '' }, // CI: 1 for consistent log output between local and CI runs
      reject: false,
    });

    expect(result.exitCode).toBe(1);
    expect(stripAnsi(result.stdout)).toMatch(/^\[log\] \[error\] foo$/m);
  });

  test('no defineCustomCli', async ({}, testInfo) => {
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
});

test.describe('prod', () => {
  test('valid', async ({}, testInfo) => {
    const cwd = testInfo.outputPath();

    await outputFiles(cwd, {
      'nuxt.config.ts':
        "export default defineNuxtConfig({ modules: ['../../src'] });",
      'server/cli.ts':
        "export default defineCustomCli(() => console.log('hi'))",
    });

    await execaCommand('nuxt build', { cwd });

    const { stdout } = await execaCommand('node .output/server/cli.mjs', {
      cwd,
    });

    expect(stdout).toEqual('hi');
  });

  test.only('runtime', async ({}, testInfo) => {
    const cwd = testInfo.outputPath();

    await outputFiles(cwd, {
      'nuxt.config.ts':
        "export default defineNuxtConfig({ modules: ['../../src'] });",
      'server/cli.ts': endent`
        export default defineCustomCli(async () => {
          await new Promise(resolve => setTimeout(resolve, 2000));
          useRuntimeConfig();
        });
      `,
    });

    await execaCommand('nuxt build', { cwd });

    const { stdout } = await execaCommand('node .output/server/cli.mjs', {
      cwd
    });

    expect(stdout).toEqual('hi');
    expect(stdout).not.toMatch('Listening on');
  });

  test('error', async ({}, testInfo) => {
    const cwd = testInfo.outputPath();

    await outputFiles(cwd, {
      'nuxt.config.ts':
        "export default defineNuxtConfig({ modules: ['../../src'] });",
      server: {
        // Auto-import so that server is started
        'cli.ts': 'export default defineCustomCli(() => foo())',
        'utils/foo.ts': "export default () => { throw new Error('foo'); }",
      },
    });

    await execaCommand('nuxt build', { cwd });

    const result = await execaCommand('node .output/server/cli.mjs', {
      cwd,
      reject: false,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/^Error: foo$/m);
  });

  test('dependency', async ({}, testInfo) => {
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

    const { stdout } = await execaCommand('node .output/server/cli.mjs', {
      cwd,
    });

    expect(stdout).toEqual('hi');
  });

  test('no defineCustomCli', async ({}, testInfo) => {
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
});

test.describe('defineCustomCli type', () => {
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

test('helper files are generated as mjs and d.ts from node_modules package', async ({}, testInfo) => {
  /**
   * Nuxt moves the buildDir into node_modules/.cache/nuxt if .nuxt already exists and it's not explicitly set in
   * nuxt.config (see https://github.com/nuxt/nuxt/blob/ada4e8954fa19b917698c3371aefcf7191bdcd02/packages/kit/src/loader/config.ts#L64).
   * Inside node_modules, TypeScript cannot be transpiled, so we need to make sure that the generated templates still work.
   */
  test.setTimeout(60_000);
  const cwd = testInfo.outputPath();

  await outputFiles(cwd, {
    'nuxt.config.ts': "export default defineNuxtConfig({ modules: ['self'] });",
    'server/cli.ts': 'export default defineCustomCli(() => {})',
  });

  await execaCommand('base prepublishOnly');
  await fs.ensureDir(pathLib.join(cwd, 'node_modules'));
  await fs.symlink('../../..', pathLib.join(cwd, 'node_modules', 'self'));
  await execaCommand('nuxi prepare', { cwd });
  await execaCommand('nuxt build', { cwd });
});
