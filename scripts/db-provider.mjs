#!/usr/bin/env node
/**
 * Switch the Prisma datasource between SQLite (offline local work) and PostgreSQL (production).
 *
 * Prisma requires the provider to be a literal in the schema, so it cannot be read from an
 * environment variable. This flips the one line and reminds you what DATABASE_URL should look
 * like. The rest of the codebase is provider-agnostic — no query uses a dialect-specific feature.
 *
 *   node scripts/db-provider.mjs postgres
 *   node scripts/db-provider.mjs sqlite
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(here, "..", "prisma", "schema.prisma");

const target = (process.argv[2] ?? "").toLowerCase();
const providers = {
  postgres: "postgresql",
  postgresql: "postgresql",
  pg: "postgresql",
  sqlite: "sqlite",
};

const provider = providers[target];
if (!provider) {
  console.error("Usage: node scripts/db-provider.mjs <postgres|sqlite>");
  process.exit(1);
}

const schema = readFileSync(schemaPath, "utf8");
const current = schema.match(/datasource db \{[^}]*provider\s*=\s*"([^"]+)"/)?.[1];

if (current === provider) {
  console.log(`Already on ${provider}. Nothing to do.`);
  process.exit(0);
}

const updated = schema.replace(
  /(datasource db \{[^}]*provider\s*=\s*")[^"]+(")/,
  `$1${provider}$2`,
);
writeFileSync(schemaPath, updated);

console.log(`Switched Prisma datasource: ${current} → ${provider}`);
console.log("");
if (provider === "postgresql") {
  console.log("Set DATABASE_URL to your Postgres connection string, for example:");
  console.log('  DATABASE_URL="postgresql://user:pass@host/db?sslmode=require"');
} else {
  console.log("Set DATABASE_URL back to the local file:");
  console.log('  DATABASE_URL="file:./leavebase.db"');
}
console.log("");
console.log("Then run:  npx prisma generate && npx prisma db push");
