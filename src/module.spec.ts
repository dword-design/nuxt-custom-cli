import pathLib from 'node:path';

import { expect, test } from '@playwright/test';
import { execaCommand } from 'execa';
import fs from 'fs-extra';
import outputFiles from 'output-files';

test('dev', async ({}, testInfo) => {
  const cwd = testInfo.outputPath();

  await fs.outputFile(
    pathLib.join(cwd, 'server', 'cli.ts'),
    "console.log('hi')",
  );

  await execaCommand('nuxi prepare', { cwd });
  const { stdout } = await execaCommand('tsx ../../src/cli.ts', { cwd });
  expect(stdout).toMatch(/\nhi$/m);
});

test('prod', async ({}, testInfo) => {
  const cwd = testInfo.outputPath();

  await outputFiles(cwd, {
    'nuxt.config.ts':
      "export default defineNuxtConfig({ modules: ['../../src'] });",
    'server/cli.ts': "console.log('hi')",
  });

  await execaCommand('nuxt build', { cwd });
  const { stdout } = await execaCommand('node .output/server/cli.mjs', { cwd });
  expect(stdout).toEqual('hi');
});
