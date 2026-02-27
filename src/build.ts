import pathLib from 'node:path';

import Unimport from 'unimport/unplugin';
import { build } from 'vite';

export default ({
  alias,
  outDir,
  rootDir,
}: {
  alias: Record<string, string>;
  outDir: string;
  rootDir: string;
}) =>
  build({
    build: {
      emptyOutDir: false,
      lib: {
        entry: pathLib.join(rootDir, 'server', 'cli.ts'),
        fileName: 'cli',
        formats: ['es'],
      },
      outDir,
      rollupOptions: {
        external: [/node_modules/],
        output: { entryFileNames: 'cli.mjs' },
      },
      ssr: true,
      target: 'node22',
    },
    plugins: [
      Unimport.vite({
        dirs: [pathLib.join(rootDir, 'server/utils/**/*.ts')],
        dts: false,
      }),
    ],
    resolve: { alias },
  });
