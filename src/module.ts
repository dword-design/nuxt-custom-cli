import pathLib from 'node:path';

import {
  addServerImports,
  addServerPlugin,
  addTemplate,
  defineNuxtModule,
} from '@nuxt/kit';
import endent from 'endent';
import MagicString from 'magic-string';

export const CUSTOM_CLI_ERROR_MESSAGE =
  'Default export from server/cli.ts must be wrapped with defineCustomCli(...).';

export const PROD_NITRO_PATCH_ERROR_MESSAGE =
  'Failed to patch Nitro server startup code. Nuxt internals may have changed and nuxt-custom-cli needs an update.';
const DEFINE_WRAPPER_USED_MARKER = '__defineCustomCliUsed';
const TEMPLATE_FOLDER = 'custom-cli';

export default defineNuxtModule({
  setup: (options, nuxt) => {
    const defineCustomCliTemplate = addTemplate({
      filename: pathLib.join(TEMPLATE_FOLDER, 'define-custom-cli.mjs'),
      getContents: () => endent`
        export const defineCustomCli = handler =>
          Object.defineProperty(handler, '${DEFINE_WRAPPER_USED_MARKER}', {
            configurable: false,
            enumerable: false,
            value: true,
            writable: false,
          });
      `,
      write: true,
    });

    addTemplate({
      filename: pathLib.join(TEMPLATE_FOLDER, 'define-custom-cli.d.mts'),
      getContents: () => endent`
        export type CustomCliHandler = () => unknown;

        export const defineCustomCli: (handler: CustomCliHandler) => CustomCliHandler;
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

        const noListenPlugin = {
          name: 'nuxt-custom-cli-no-listen',
          renderChunk: (code: string, chunk: { fileName: string }) => {
            if (!chunk.fileName.endsWith('/nitro/nitro.mjs')) {
              return null;
            }

            const listenSnippet =
              'const listener = server.listen(path ? { path } : { port, host }, (err) => {';

            const listenPrefixSnippet = 'const listener = ';

            const shutdownSnippet =
              'setupGracefulShutdown(listener, nitroApp);';

            const listenConditionPrefix = 'isCliEntry ? null : ';

            const cliEntryDefinition =
              "const isCliEntry = (process.argv[1] || '').replaceAll('\\', '/').endsWith('/cli.mjs');\n";

            const listenStartIndex = code.indexOf(listenSnippet);
            const shutdownStartIndex = code.indexOf(shutdownSnippet);

            if (listenStartIndex === -1 || shutdownStartIndex === -1) {
              throw new Error(PROD_NITRO_PATCH_ERROR_MESSAGE);
            }

            const magicString = new MagicString(code);
            magicString.prependLeft(listenStartIndex, cliEntryDefinition);

            magicString.appendLeft(
              listenStartIndex + listenPrefixSnippet.length,
              listenConditionPrefix,
            );

            magicString.prependLeft(shutdownStartIndex, 'if (listener) {\n  ');

            magicString.appendRight(
              shutdownStartIndex + shutdownSnippet.length,
              '\n}',
            );

            return {
              code: magicString.toString(),
              map: magicString.generateMap({
                hires: true,
                includeContent: true,
                source: chunk.fileName,
              }),
            };
          },
        };

        rollupConfig.plugins = Array.isArray(rollupConfig.plugins)
          ? [...rollupConfig.plugins, noListenPlugin]
          : rollupConfig.plugins
            ? [rollupConfig.plugins, noListenPlugin]
            : [noListenPlugin];

        rollupConfig.output.entryFileNames = chunkInfo => {
          if (chunkInfo.facadeModuleId === entry.dst) return 'cli.mjs';
          if (chunkInfo.name === 'node-server') return 'index.mjs';
          return '[name].mjs';
        };
      });
    });
  },
});
