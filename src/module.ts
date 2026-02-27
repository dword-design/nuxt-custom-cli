import pathLib from 'node:path';

import {
  addServerImports,
  addServerPlugin,
  addTemplate,
  defineNuxtModule,
} from '@nuxt/kit';
import endent from 'endent';

export default defineNuxtModule({
  setup: (_options, nuxt) => {
    const defineCustomCliTemplate = addTemplate({
      filename: 'custom-cli-define.ts',
      getContents: () => endent`
        export type CustomCliHandler = () => unknown;

        export const defineCustomCli = (handler: CustomCliHandler) => handler;
      `,
      write: true,
    });

    addServerImports({
      as: 'defineCustomCli',
      from: defineCustomCliTemplate.dst,
      name: 'defineCustomCli',
    });

    const buildDir = pathLib.resolve(
      nuxt.options.rootDir,
      nuxt.options.buildDir,
    );

    if (nuxt.options.dev) {
      const cliPath = pathLib.resolve(nuxt.options.rootDir, 'server', 'cli.ts');

      const relativeCliPath = pathLib
        .relative(buildDir, cliPath)
        .replaceAll('\\', '/');

      const cliImportPath = relativeCliPath.startsWith('.')
        ? relativeCliPath
        : `./${relativeCliPath}`;

      const devPlugin = addTemplate({
        filename: 'custom-cli-dev-plugin.ts',
        getContents: () => endent`
          import main from '${cliImportPath}';

          export default defineNitroPlugin(() => {
            if (process.env.NUXT_RUN_CLI !== '1') {
              return;
            }

            queueMicrotask(async () => {
              try {
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
      .relative(buildDir, cliPath)
      .replaceAll('\\', '/');

    const cliImportPath = relativeCliPath.startsWith('.')
      ? relativeCliPath
      : `./${relativeCliPath}`;

    const entry = addTemplate({
      filename: 'custom-cli-entry.ts',
      getContents: () => endent`
        import main from '${cliImportPath}';

        const run = async () => {
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

    const entryPath = pathLib.resolve(buildDir, entry.filename);

    nuxt.hook('nitro:init', nitro => {
      nitro.hooks.hook('rollup:before', (_nitro, rollupConfig) => {
        rollupConfig.input =
          typeof rollupConfig.input === 'string'
            ? [rollupConfig.input, entryPath]
            : Array.isArray(rollupConfig.input)
              ? [...rollupConfig.input, entryPath]
              : { ...rollupConfig.input, cli: entryPath };

        rollupConfig.output.entryFileNames = chunkInfo => {
          if (chunkInfo.name === 'custom-cli-entry') return 'cli.mjs';
          if (chunkInfo.name === 'node-server') return 'index.mjs';
          return '[name].mjs';
        };
      });
    });
  },
});
