import pathLib from 'node:path';

import {
  addServerImports,
  addServerPlugin,
  addTemplate,
  defineNuxtModule,
} from '@nuxt/kit';
import endent from 'endent';

export const CUSTOM_CLI_ERROR_MESSAGE =
  'Default export from server/cli.ts must be wrapped with defineCustomCli(...).';
const DEFINE_WRAPPER_USED_MARKER = '__defineCustomCliUsed';
const TEMPLATE_FOLDER = 'nuxt-custom-cli';

export default defineNuxtModule({
  setup: (_options, nuxt) => {
    const defineCustomCliTemplate = addTemplate({
      filename: pathLib.join(TEMPLATE_FOLDER, 'custom-cli-define.ts'),
      getContents: () => endent`
        export type CustomCliHandler = () => unknown;

        export const defineCustomCli = (handler: CustomCliHandler) =>
          Object.defineProperty(handler, '${DEFINE_WRAPPER_USED_MARKER}', {
            configurable: false,
            enumerable: false,
            value: true,
            writable: false,
          });
      `,
      write: true,
    });

    addServerImports({
      as: 'defineCustomCli',
      from: defineCustomCliTemplate.dst,
      name: 'defineCustomCli',
    });

    if (nuxt.options.dev) {
      const cliPath = pathLib.resolve(nuxt.options.rootDir, 'server', 'cli.ts');

      const relativeCliPath = pathLib
        .relative(pathLib.join(nuxt.options.buildDir, TEMPLATE_FOLDER), cliPath)
        .replaceAll('\\', '/');

      const cliImportPath = relativeCliPath.startsWith('.')
        ? relativeCliPath
        : `./${relativeCliPath}`;

      const devPlugin = addTemplate({
        filename: pathLib.join(TEMPLATE_FOLDER, 'dev-plugin.ts'),
        getContents: () => endent`
          import main from '${cliImportPath}';

          const assertCustomCli = () => {
            if (typeof main !== 'function' || !main['${DEFINE_WRAPPER_USED_MARKER}']) {
              throw new Error('${CUSTOM_CLI_ERROR_MESSAGE}');
            }
          };

          export default defineNitroPlugin(() => {
            if (process.env.NUXT_RUN_CLI !== '1') {
              return;
            }

            queueMicrotask(async () => {
              try {
                assertCustomCli();
                const args = JSON.parse(process.env.NUXT_CLI_ARGS || '[]');
                process.argv = [...process.argv, ...args];
                await main();
                process.kill(process.ppid, 'SIGINT');
              } catch (error) {
                console.error(error);
                process.kill(process.ppid, 'SIGTERM');
              }
            });
          });
        `,
        write: true,
      });

      addServerPlugin(devPlugin.dst);
      return;
    }

    const cliPath = pathLib.resolve(nuxt.options.rootDir, 'server', 'cli.ts');

    const relativeCliPath = pathLib
      .relative(pathLib.join(nuxt.options.buildDir, TEMPLATE_FOLDER), cliPath)
      .replaceAll('\\', '/');

    const cliImportPath = relativeCliPath.startsWith('.')
      ? relativeCliPath
      : `./${relativeCliPath}`;

    const entry = addTemplate({
      filename: pathLib.join(TEMPLATE_FOLDER, 'prod-entry.ts'),
      getContents: () => endent`
        import main from '${cliImportPath}';

        const assertCustomCli = () => {
          if (typeof main !== 'function' || !main['${DEFINE_WRAPPER_USED_MARKER}']) {
            throw new Error('${CUSTOM_CLI_ERROR_MESSAGE}');
          }
        };

        const run = async () => {
          assertCustomCli();
          await main();

          if (process.listenerCount('SIGTERM') > 0) {
            process.exit(0);
            return;
          }
        }

        run();
      `,
      write: true,
    });

    nuxt.hook('nitro:init', nitro => {
      nitro.hooks.hook('rollup:before', (_nitro, rollupConfig) => {
        rollupConfig.input =
          typeof rollupConfig.input === 'string'
            ? [rollupConfig.input, entry.dst]
            : Array.isArray(rollupConfig.input)
              ? [...rollupConfig.input, entry.dst]
              : { ...rollupConfig.input, cli: entry.dst };

        rollupConfig.output.entryFileNames = chunkInfo => {
          if (chunkInfo.facadeModuleId === entry.dst) return 'cli.mjs';
          if (chunkInfo.name === 'node-server') return 'index.mjs';
          return '[name].mjs';
        };
      });
    });
  },
});
