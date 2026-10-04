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
      );
    `);
    await executeSingleSql(
      `INSERT INTO roles (name) VALUES ('superadmin'), ('admin'), ('user') ON CONFLICT (name) DO NOTHING;`
    );
  } catch (rErr) {
    console.warn("[DB Roles Warning]", rErr);
  }

  // 2. Ensure Users table
  try {
    await executeSingleSql(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        password TEXT NOT NULL,
        role_id INTEGER REFERENCES roles(id) ON UPDATE CASCADE ON DELETE SET NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        subscription_expires_at TIMESTAMP WITH TIME ZONE,
        billing_cycle_days INTEGER NOT NULL DEFAULT 30,
        approved_at TIMESTAMP WITH TIME ZONE,
        approved_by INTEGER,
        email_verified_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
    `);

    await executeSingleSql(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'pending';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMP WITH TIME ZONE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS billing_cycle_days INTEGER NOT NULL DEFAULT 30;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITH TIME ZONE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS approved_by INTEGER;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP WITH TIME ZONE;

      CREATE INDEX IF NOT EXISTS idx_users_role_id ON users(role_id);
      CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
      CREATE INDEX IF NOT EXISTS idx_users_subscription ON users(subscription_expires_at);
    `);
  } catch (uErr) {
    console.warn("[DB Users Columns Warning]", uErr);
  }

  // 3. Ensure Auth Support Tables & Indexes
  try {
    await executeSingleSql(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE,
        jti VARCHAR(191) NOT NULL UNIQUE,
        revoked BOOLEAN DEFAULT FALSE,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_jti ON refresh_tokens(jti);

      CREATE TABLE IF NOT EXISTS email_verification_tokens (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        token TEXT NOT NULL,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_email_verification_email ON email_verification_tokens(email);

      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        token TEXT NOT NULL,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_password_reset_email ON password_reset_tokens(email);

      CREATE TABLE IF NOT EXISTS otp_verifications (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        otp_hash TEXT NOT NULL,
        type VARCHAR(50) NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 5,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_otp_verifications_email_type ON otp_verifications(email, type);
    `);
  } catch (authErr) {
    console.warn("[DB Auth Tables Warning]", authErr);
  }

  // 4. Ensure Bond Records table & comprehensive performance indexes
  try {
    await executeSingleSql(`
      CREATE TABLE IF NOT EXISTS bond_records (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE,
        bank_name TEXT NOT NULL,
        branch_name TEXT,
        ads_code TEXT,
        lc_year TEXT,
        lc_nature TEXT,
        lc_serial TEXT,
        lc_id TEXT,
        lc_value NUMERIC(20, 2) DEFAULT 0,
        currency TEXT DEFAULT 'USD',
        lc_date TIMESTAMP WITH TIME ZONE,
        lc_expiry_date TIMESTAMP WITH TIME ZONE,
        bb_usanse_period TEXT,
        last_ship_date TIMESTAMP WITH TIME ZONE,
        proceeds_date TIMESTAMP WITH TIME ZONE,
        applicant_name TEXT,
        irc TEXT,
        exporter_info TEXT,
        export_lc_number TEXT,
        beneficiary_bank TEXT,
        beneficiary_branch TEXT,
        beneficiary_name TEXT,
        beneficiary_address TEXT,
        beneficiary_irc TEXT,
        beneficiary_erc TEXT,
        pi_number TEXT,
        pi_date TIMESTAMP WITH TIME ZONE,
        bond_license TEXT,
        accepted TEXT,
        cancel_yn TEXT DEFAULT 'N',
        cancel_cause TEXT,
        entry_date TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );

      ALTER TABLE bond_records ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE;
      
      CREATE INDEX IF NOT EXISTS idx_bond_records_user_id ON bond_records(user_id);
      CREATE INDEX IF NOT EXISTS idx_bond_records_user_lc_id ON bond_records(user_id, lc_id);
      CREATE INDEX IF NOT EXISTS idx_bond_records_user_bank ON bond_records(user_id, bank_name);
      CREATE INDEX IF NOT EXISTS idx_bond_records_user_entry_date ON bond_records(user_id, entry_date);
      CREATE INDEX IF NOT EXISTS idx_bond_records_user_lc_date ON bond_records(user_id, lc_date);
      CREATE INDEX IF NOT EXISTS idx_bond_records_applicant ON bond_records(applicant_name);
      CREATE INDEX IF NOT EXISTS idx_bond_records_beneficiary ON bond_records(beneficiary_name);
      CREATE INDEX IF NOT EXISTS idx_bond_records_bond_license ON bond_records(bond_license);
    `);
  } catch (bErr) {
    console.warn("[DB Bond Records Columns Warning]", bErr);
  }

  // 5. Dynamic SuperAdmin Account Setup from .env
  try {
    const superadminEmail = (process.env.ADMIN_EMAIL || process.env.SUPERADMIN_EMAIL || "isupportbd.info@gmail.com").trim().toLowerCase();
    const superadminPassword = process.env.ADMIN_PASSWORD || process.env.SUPERADMIN_PASSWORD || "12345678";
    const superadminName = process.env.ADMIN_NAME || process.env.SUPERADMIN_NAME || "Super Admin";

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
