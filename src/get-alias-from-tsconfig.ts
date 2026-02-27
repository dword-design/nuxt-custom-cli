import pathLib from 'node:path';

import fs from 'fs-extra';

type TsConfig = { compilerOptions?: { paths?: Record<string, string[]> } };

export const getAliasFromNuxtTsConfig = async ({
  rootDir,
  tsconfigPath = '.nuxt/tsconfig.server.json',
}: {
  rootDir: string;
  tsconfigPath?: string;
}) => {
  const tsconfig = JSON.parse(
    await fs.readFile(pathLib.join(rootDir, tsconfigPath), 'utf8'),
  ) as TsConfig;

  const paths = tsconfig.compilerOptions?.paths ?? {};
  return Object.fromEntries(
    Object.entries(paths)
      .filter(([key]) => key.endsWith('/*'))
      .map(([key, value]) => {
        const aliasKey = key.slice(0, -2);
        const aliasValue = value[0]!.replace(/^\.\.\//, '').slice(0, -2);
        return [aliasKey, pathLib.join(rootDir, aliasValue)];
      }),
  );
};
