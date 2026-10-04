import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { sql, eq } from "drizzle-orm";
import { db } from "@/framework/facade.js";
import { users } from "@/modules/auth/database/models/user.js";
import { roles } from "@/modules/auth/database/models/role.js";

async function executeSingleSql(rawSql: string) {
  const clean = rawSql.trim();
  if (!clean) return;
  try {
    await db.execute(sql.raw(clean));
  } catch (err: any) {
    if (
      !err.message?.includes("already exists") &&
      !err.message?.includes("duplicate") &&
      !err.message?.includes("multiple primary keys")
    ) {
      console.warn(`[DB Schema Sync Warning]:`, err.message || err);
    }
  }
}

export async function syncDatabaseSchemaAndSuperAdmin() {
  console.log("[DB Sync] Starting clean schema and SuperAdmin synchronization for Jupiter...");

  // 1. Ensure Roles table
  try {
    await executeSingleSql(`
      CREATE TABLE IF NOT EXISTS roles (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await executeSingleSql(
      `INSERT INTO roles (name) VALUES ('superadmin'), ('admin'), ('user') ON CONFLICT (name) DO NOTHING`
    );
  } catch (rErr) {
    console.warn("[DB Roles Warning]", rErr);
  }

  // 2. Ensure users table columns
  try {
    await executeSingleSql(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'pending';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMP WITH TIME ZONE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS billing_cycle_days INTEGER NOT NULL DEFAULT 30;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITH TIME ZONE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS approved_by INTEGER;
    `);
  } catch (uErr) {
    console.warn("[DB Users Columns Warning]", uErr);
  }

  // 3. Ensure bond_records table columns & index
  try {
    await executeSingleSql(`
      ALTER TABLE bond_records ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
      CREATE INDEX IF NOT EXISTS idx_bond_records_user_id ON bond_records(user_id);
    `);
  } catch (bErr) {
    console.warn("[DB Bond Records Columns Warning]", bErr);
  }

  // 4. Dynamic SuperAdmin Account Setup from .env
  try {
    const superadminEmail = (process.env.SUPERADMIN_EMAIL || process.env.ADMIN_EMAIL || "isupportbd.info@gmail.com").trim().toLowerCase();
    const superadminPassword = process.env.SUPERADMIN_PASSWORD || process.env.ADMIN_PASSWORD || "12345678";
    const superadminName = process.env.SUPERADMIN_NAME || process.env.ADMIN_NAME || "Super Admin";

    if (superadminEmail && superadminPassword) {
      let [superadminRole] = await db.select().from(roles).where(eq(roles.name, "superadmin")).limit(1);
      if (!superadminRole) {
        try {
          const [createdRole] = await db.insert(roles).values({ name: "superadmin" }).returning();
          superadminRole = createdRole;
        } catch {
          const [existingRole] = await db.select().from(roles).where(eq(roles.name, "superadmin")).limit(1);
          superadminRole = existingRole;
        }
      }

      const hashedPassword = await bcrypt.hash(superadminPassword, 10);
      const existingAdmin = await db.select().from(users).where(sql`lower(${users.email}) = ${superadminEmail}`).limit(1);

      // Set subscription far into future for SuperAdmin (10 years)
      const tenYearsLater = new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000);

      let adminUserId: number;

      if (existingAdmin.length > 0) {
        adminUserId = existingAdmin[0].id;
        await db.update(users).set({
          name: superadminName,
          email: superadminEmail,
          password: hashedPassword,
          roleId: superadminRole?.id || existingAdmin[0].roleId,
          status: "active",
          subscriptionExpiresAt: tenYearsLater,
          emailVerifiedAt: new Date(),
          updatedAt: new Date()
        }).where(eq(users.id, existingAdmin[0].id));
      } else {
        const [inserted] = await db.insert(users).values({
          name: superadminName,
          email: superadminEmail,
          password: hashedPassword,
          roleId: superadminRole?.id,
          status: "active",
          subscriptionExpiresAt: tenYearsLater,
          emailVerifiedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date()
        }).returning();
        adminUserId = inserted.id;
      }

      // Assign orphaned bond_records without user_id to adminUserId
      if (adminUserId) {
        await executeSingleSql(`UPDATE bond_records SET user_id = ${adminUserId} WHERE user_id IS NULL;`);
      }

      console.log(`[SuperAdmin Sync] SuperAdmin account ready & synced: ${superadminEmail}`);
    }
  } catch (adminErr) {
    console.error("[SuperAdmin Sync Error]", adminErr);
  }

  console.log("[DB Sync] Schema synchronization finished.");
}
