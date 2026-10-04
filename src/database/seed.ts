import { initDatabase } from "../framework/database/connection.js";
import { syncDatabaseSchemaAndSuperAdmin } from "./sync.js";

async function runSeed() {
  await initDatabase();
  console.log("Seeding Jupiter Database Records in PostgreSQL...");
  await syncDatabaseSchemaAndSuperAdmin();
  console.log("Jupiter Database seeded successfully!");
  process.exit(0);
}

runSeed().catch((err) => {
  console.error("Seed error:", err);
  process.exit(1);
});
