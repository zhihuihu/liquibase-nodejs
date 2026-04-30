#!/usr/bin/env node

import { liquibase } from './index';

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: db-migrator --changelog <path> --dialect <name> --host <host> --database <db> --user <user> --password <pass>');
    process.exit(1);
  }

  const parseArg = (name: string) => {
    const idx = args.indexOf(`--${name}`);
    if (idx === -1) return undefined;
    return args[idx + 1];
  };

  const changelogPath = parseArg('changelog');
  const dialect = parseArg('dialect');
  const host = parseArg('host');
  const port = parseInt(parseArg('port') || '5432', 10);
  const database = parseArg('database');
  const user = parseArg('user');
  const password = parseArg('password');

  if (!changelogPath || !dialect || !host || !database || !user || !password) {
    console.error('Missing required arguments');
    process.exit(1);
  }

  const result = await liquibase({
    connection: { host, port, database, user, password },
    dialect: dialect as any,
    changelogPath,
  });

  if (!result.success) {
    console.error('Migration failed:', result.error);
    process.exit(1);
  }

  console.log(`Migration complete: ${result.executed} executed, ${result.skipped} skipped`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
