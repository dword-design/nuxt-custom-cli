#!/usr/bin/env node

import { execaCommand } from 'execa';

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(1));
const args = process.argv.slice(2);

await execaCommand('nuxt dev', {
  env: { NUXT_CLI_ARGS: JSON.stringify(args), NUXT_RUN_CLI: '1' },
  stdio: 'inherit',
});
