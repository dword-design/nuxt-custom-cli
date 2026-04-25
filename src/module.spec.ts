import pathLib from 'node:path';

import { expect, test } from '@playwright/test';
import endent from 'endent';
import { execaCommand } from 'execa';
import fs from 'fs-extra';
import getPort from 'get-port';
import outputFiles from 'output-files';
import portReady from 'port-ready';
import stripAnsi from 'strip-ansi';
import kill from 'tree-kill-promise';

import {
  CUSTOM_CLI_ERROR_MESSAGE,
  PROD_NITRO_PATCH_ERROR_MESSAGE,
} from './module';

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
  test('Nitro server code changed', async ({}, testInfo) => {
    const cwd = testInfo.outputPath();

    await outputFiles(cwd, {
      'nuxt.config.ts': endent`
        export default defineNuxtConfig({
          modules: ['./test-module', '../../src'],
        });
      `,
      'server/cli.ts': 'export default defineCustomCli(() => {})',
      'test-module.ts': endent`
        import { defineNuxtModule } from '@nuxt/kit';

        export default defineNuxtModule({
          setup: (_options, nuxt) => {
            nuxt.hook('nitro:init', nitro => {
              nitro.hooks.hook('rollup:before', (_nitro, rollupConfig) => {
                const mutateNitroPlugin = {
                  name: 'mutate-nitro-listen-snippet',
                  renderChunk: (code: string, chunk: { fileName: string }) => {
                    if (!chunk.fileName.endsWith('/nitro/nitro.mjs')) {
                      return null;
                    }

                    return code.replace(
                      'const listener = server.listen(path ? { path } : { port, host }, (err) => {',
                      'const listener = server.listen(path ? { path } : { port, host }, () => {',
                    );
                  },
                };

                rollupConfig.plugins = Array.isArray(rollupConfig.plugins)
                  ? [...rollupConfig.plugins, mutateNitroPlugin]
                  : rollupConfig.plugins
                    ? [rollupConfig.plugins, mutateNitroPlugin]
                    : [mutateNitroPlugin];
              });
            });
          },
        });
      `,
    });

    await expect(execaCommand('nuxt build', { cwd })).rejects.toThrow(
      PROD_NITRO_PATCH_ERROR_MESSAGE,
    );
  });

  test('valid', async ({}, testInfo) => {
    const cwd = testInfo.outputPath();

    await outputFiles(cwd, {
      'nuxt.config.ts':
        "export default defineNuxtConfig({ modules: ['../../src'] });",
      'server/cli.ts':
        "export default defineCustomCli(() => console.log('hi'))",
    });

    const { all } = await execaCommand('nuxt build', { all: true, cwd });

    expect(all).not.toContain(
      '[plugin nuxt-custom-cli-no-listen] Sourcemap is likely to be incorrect',
    );

    const { stdout } = await execaCommand('node .output/server/cli.mjs', {
      cwd,
    });

    expect(stdout).toEqual('hi');
  });

  test('runtime', async ({}, testInfo) => {
    const cwd = testInfo.outputPath();

    await outputFiles(cwd, {
      'nuxt.config.ts':
        "export default defineNuxtConfig({ modules: ['../../src'] });",
      'server/cli.ts': endent`
        import { loadRuntime } from './utils/runtime';

        export default defineCustomCli(async () => {
          await new Promise(resolve => setTimeout(resolve, 2000));
          loadRuntime();
        });
      `,
      'server/utils/runtime.ts': endent`
        export const loadRuntime = () => {
          useRuntimeConfig();
          useAppConfig();
        };
      `,
    });

    await execaCommand('nuxt build', { cwd });

    const { stdout } = await execaCommand('node .output/server/cli.mjs', {
      cwd,
    });

    expect(stdout).toEqual('');
    expect(stdout).not.toMatch('Listening on');
  });

  test('error uses source map', async ({}, testInfo) => {
    const cwd = testInfo.outputPath();

    await outputFiles(cwd, {
      'nuxt.config.ts':
        "export default defineNuxtConfig({ modules: ['../../src'] });",
      'server/cli.ts': endent`
        export default defineCustomCli(() => {
          throw new Error('foo');
        });
      `,
    });

    await execaCommand('nuxt build', { cwd });

    const result = await execaCommand(
      'node --enable-source-maps .output/server/cli.mjs',
      { cwd, reject: false },
    );

    const stderr = stripAnsi(result.stderr);
    expect(result.exitCode).toBe(1);
    expect(stderr).toMatch(/^Error: foo$/m);
    expect(stderr).toMatch(/[\\/]server[\\/]cli\.ts:2:\d+/);
  });

  test('imported runtime error uses source map', async ({}, testInfo) => {
    const cwd = testInfo.outputPath();

    await outputFiles(cwd, {
      'nuxt.config.ts':
        "export default defineNuxtConfig({ modules: ['../../src'] });",
      'server/cli.ts': endent`
        import { loadRuntime } from './utils/runtime';

        export default defineCustomCli(() => {
          loadRuntime();
        });
      `,
      'server/utils/runtime.ts': endent`
        export const loadRuntime = () => {
          throw new Error('runtime foo');
        };
      `,
    });

    await execaCommand('nuxt build', { cwd });

    const result = await execaCommand(
      'node --enable-source-maps .output/server/cli.mjs',
      { cwd, reject: false },
    );

    const stderr = stripAnsi(result.stderr);
    expect(result.exitCode).toBe(1);
    expect(stderr).toMatch(/^Error: runtime foo$/m);
    expect(stderr).toMatch(/[\\/]server[\\/]utils[\\/]runtime\.ts:2:\d+/);
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

test.describe('prod server', () => {
  test('valid', async ({ page }, testInfo) => {
    const cwd = testInfo.outputPath();

    await outputFiles(cwd, {
      'app/pages/index.vue': endent`
        <template>
          <div class="foo">hi</div>
        </template>
      `,
      'nuxt.config.ts':
        "export default defineNuxtConfig({ modules: ['../../src'] });",
      'server/cli.ts': 'export default defineCustomCli(() => {})',
    });

    await execaCommand('nuxt build', { cwd });
    const port = await getPort();

    const nuxt = execaCommand('node .output/server/index.mjs', {
      cwd,
      env: { PORT: String(port) },
    });

    try {
      await portReady(port);
      await page.goto(`http://localhost:${port}`);
      await expect(page.locator('.foo')).toHaveText('hi');
    } finally {
      await kill(nuxt.pid!);
    }
  });
});
