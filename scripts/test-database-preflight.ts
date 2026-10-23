import { loadEnvFile } from "node:process";
import path from "node:path";
import { closeTestEcommerceDbPool, preflightTestDatabase } from "../app/lib/test-database";

async function main() {
  try {
    loadEnvFile(path.resolve(process.cwd(), ".env.local"));
    console.log(JSON.stringify(await preflightTestDatabase(), null, 2));
  } catch {
    // Driver/configuration errors can contain credentials; never print raw errors.
    console.log(JSON.stringify({ server: null, database: null, ssl: null, success: false }));
    process.exitCode = 1;
  } finally {
    await closeTestEcommerceDbPool().catch(() => { process.exitCode = 1; });
  }
}

void main();
