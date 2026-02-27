#!/usr/bin/env node

import pathLib from 'node:path';

import { execa } from 'execa';

import build from './build';
import { getAliasFromNuxtTsConfig } from './get-alias-from-tsconfig';

const rootDir = process.cwd();
const outDir = pathLib.join(rootDir, '.nuxt');
const builtCliPath = pathLib.join(outDir, 'cli.mjs');

try {
  const alias = await getAliasFromNuxtTsConfig({ rootDir });
  await build({ alias, outDir, rootDir });
} catch (error) {
  console.error('Build failed:', error);
  process.exit(1);
}

const cliArgs = process.argv.slice(2);
const child = execa('node', [builtCliPath, ...cliArgs], { stdio: 'inherit' });

child.on('exit', code => {
  process.exit(code || 0);
});
