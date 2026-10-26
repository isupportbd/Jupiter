import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { sql, eq } from "drizzle-orm";
import { db } from "@/framework/facade.js";
import { users } from "@/modules/auth/database/models/user.js";
import { roles } from "@/modules/auth/database/models/role.js";

async function executeSingleSql(rawSql: string) {
  const statements = rawSql
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);

  for (const statement of statements) {
    try {
      await db.execute(sql.raw(statement));
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
      `INSERT INTO roles (name) VALUES ('superadmin'), ('admin'), ('user'), ('operator') ON CONFLICT (name) DO NOTHING;`
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
        admin_id INTEGER REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE,
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
      ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_id INTEGER REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'pending';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMP WITH TIME ZONE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS billing_cycle_days INTEGER NOT NULL DEFAULT 30;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITH TIME ZONE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS approved_by INTEGER;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP WITH TIME ZONE;

      CREATE INDEX IF NOT EXISTS idx_users_role_id ON users(role_id);
      CREATE INDEX IF NOT EXISTS idx_users_admin_id ON users(admin_id);
      CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
      CREATE INDEX IF NOT EXISTS idx_users_subscription ON users(subscription_expires_at);

      -- Migration safeguard: Ensure any pre-existing users without a status or email-verified are marked 'active'
      -- so deployment doesn't lock out existing office admins and operators
      UPDATE users SET status = 'active' WHERE status IS NULL;

      -- Ensure existing admin has an active subscription (365 days) if not already set
      UPDATE users 
      SET subscription_expires_at = COALESCE(subscription_expires_at, NOW() + INTERVAL '365 days')
      WHERE role_id IN (SELECT id FROM roles WHERE name IN ('admin', 'superadmin'))
        AND subscription_expires_at IS NULL;
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

      -- Enable PostgreSQL Trigram extension for fast %search% operations
      CREATE EXTENSION IF NOT EXISTS pg_trgm;

      -- Composite indexes for user-scoped date sorting (prevents expensive in-memory sorts)
      CREATE INDEX IF NOT EXISTS idx_bond_records_user_lc_sort ON bond_records(user_id, lc_date DESC, entry_date DESC, id DESC);
      CREATE INDEX IF NOT EXISTS idx_bond_records_user_entry_sort ON bond_records(user_id, entry_date DESC, id DESC);
      CREATE INDEX IF NOT EXISTS idx_bond_records_user_coalesce ON bond_records(user_id, COALESCE(entry_date, lc_date));

      -- Add record_hash column for 31-column deterministic deduplication
      ALTER TABLE bond_records ADD COLUMN IF NOT EXISTS record_hash TEXT;

      -- Backfill record_hash for any existing legacy rows that have record_hash IS NULL
      UPDATE bond_records
      SET record_hash = encode(sha256(
        convert_to(
          concat_ws('|',
            lower(trim(coalesce(bank_name, ''))),
            lower(trim(coalesce(branch_name, ''))),
            lower(trim(coalesce(ads_code, ''))),
            lower(trim(coalesce(lc_year, ''))),
            lower(trim(coalesce(lc_nature, ''))),
            lower(trim(coalesce(lc_serial, ''))),
            lower(trim(coalesce(lc_id, ''))),
            lower(trim(coalesce(lc_value::text, ''))),
            lower(trim(coalesce(currency, ''))),
            lower(trim(coalesce(to_char(lc_date at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), ''))),
            lower(trim(coalesce(to_char(lc_expiry_date at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), ''))),
            lower(trim(coalesce(bb_usanse_period, ''))),
            lower(trim(coalesce(to_char(last_ship_date at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), ''))),
            lower(trim(coalesce(to_char(proceeds_date at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), ''))),
            lower(trim(coalesce(applicant_name, ''))),
            lower(trim(coalesce(irc, ''))),
            lower(trim(coalesce(exporter_info, ''))),
            lower(trim(coalesce(export_lc_number, ''))),
            lower(trim(coalesce(beneficiary_bank, ''))),
            lower(trim(coalesce(beneficiary_branch, ''))),
            lower(trim(coalesce(beneficiary_name, ''))),
            lower(trim(coalesce(beneficiary_address, ''))),
            lower(trim(coalesce(beneficiary_irc, ''))),
            lower(trim(coalesce(beneficiary_erc, ''))),
            lower(trim(coalesce(pi_number, ''))),
            lower(trim(coalesce(to_char(pi_date at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), ''))),
            lower(trim(coalesce(bond_license, ''))),
            lower(trim(coalesce(accepted, ''))),
            lower(trim(coalesce(cancel_yn, ''))),
            lower(trim(coalesce(cancel_cause, ''))),
            lower(trim(coalesce(to_char(entry_date at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), '')))
          ),
          'UTF8'
        )
      ), 'hex')
      WHERE record_hash IS NULL;

      -- If legacy data had identical duplicate rows, clean duplicates before creating UNIQUE index
      DELETE FROM bond_records a USING bond_records b
      WHERE a.id > b.id AND a.record_hash IS NOT NULL AND a.record_hash = b.record_hash;

      -- Drop overly-narrow 5-column index to ensure no valid distinct rows are ever dropped
      DROP INDEX IF EXISTS idx_bond_records_dedup;

      -- 31-Column Full Row Cryptographic Unique Index: Drops duplicate ONLY if all 31 business fields are identical
      CREATE UNIQUE INDEX IF NOT EXISTS idx_bond_records_record_hash ON bond_records(record_hash);

      -- Office-wide composite date sorting and grouping indexes
      CREATE INDEX IF NOT EXISTS idx_bond_records_global_lc_sort ON bond_records(lc_date DESC, entry_date DESC, id DESC);
      CREATE INDEX IF NOT EXISTS idx_bond_records_global_entry_sort ON bond_records(entry_date DESC, id DESC);
      CREATE INDEX IF NOT EXISTS idx_bond_records_global_coalesce ON bond_records(COALESCE(entry_date, lc_date));
      CREATE INDEX IF NOT EXISTS idx_bond_records_global_bank ON bond_records(bank_name);
      CREATE INDEX IF NOT EXISTS idx_bond_records_global_lc_id ON bond_records(lc_id);

      -- GIN Trigram indexes on all searched columns for instant substring matching (eliminates full table scans)
      CREATE INDEX IF NOT EXISTS idx_bond_trgm_beneficiary ON bond_records USING gin (beneficiary_name gin_trgm_ops);
      CREATE INDEX IF NOT EXISTS idx_bond_trgm_applicant ON bond_records USING gin (applicant_name gin_trgm_ops);
      CREATE INDEX IF NOT EXISTS idx_bond_trgm_lc_id ON bond_records USING gin (lc_id gin_trgm_ops);
      CREATE INDEX IF NOT EXISTS idx_bond_trgm_bank ON bond_records USING gin (bank_name gin_trgm_ops);
      CREATE INDEX IF NOT EXISTS idx_bond_trgm_branch ON bond_records USING gin (branch_name gin_trgm_ops);
      CREATE INDEX IF NOT EXISTS idx_bond_trgm_export_lc ON bond_records USING gin (export_lc_number gin_trgm_ops);
      CREATE INDEX IF NOT EXISTS idx_bond_trgm_pi_number ON bond_records USING gin (pi_number gin_trgm_ops);
      CREATE INDEX IF NOT EXISTS idx_bond_trgm_exporter ON bond_records USING gin (exporter_info gin_trgm_ops);
      CREATE INDEX IF NOT EXISTS idx_bond_trgm_ben_bank ON bond_records USING gin (beneficiary_bank gin_trgm_ops);
      CREATE INDEX IF NOT EXISTS idx_bond_trgm_ben_branch ON bond_records USING gin (beneficiary_branch gin_trgm_ops);
      CREATE INDEX IF NOT EXISTS idx_bond_trgm_ben_addr ON bond_records USING gin (beneficiary_address gin_trgm_ops);
      CREATE INDEX IF NOT EXISTS idx_bond_trgm_bond_lic ON bond_records USING gin (bond_license gin_trgm_ops);
    `);
  } catch (bErr) {
    console.warn("[DB Bond Records Columns Warning]", bErr);
  }

  // 5. Dynamic SuperAdmin Account Setup from .env (only created if no superadmin exists)
  try {
    const rawEmail = process.env.ADMIN_EMAIL || process.env.SUPERADMIN_EMAIL;
    const rawPassword = process.env.ADMIN_PASSWORD || process.env.SUPERADMIN_PASSWORD;
    const superadminEmail = rawEmail ? rawEmail.trim().toLowerCase() : "";
    const superadminPassword = rawPassword ? rawPassword.trim() : "";
    const superadminName = (process.env.ADMIN_NAME || process.env.SUPERADMIN_NAME || "Super Admin").trim();

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

      const existingAdmin = await db.select().from(users).where(sql`lower(${users.email}) = ${superadminEmail}`).limit(1);
      const tenYearsLater = new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000);
      let adminUserId: number;

      if (existingAdmin.length > 0) {
        adminUserId = existingAdmin[0].id;
        // Do NOT overwrite existing password or credentials; only ensure role and active status
        if (existingAdmin[0].roleId !== superadminRole?.id || existingAdmin[0].status !== "active") {
          await db.update(users).set({
            roleId: superadminRole?.id || existingAdmin[0].roleId,
            status: "active",
            updatedAt: new Date()
          }).where(eq(users.id, existingAdmin[0].id));
        }
        console.log(`[SuperAdmin Sync] SuperAdmin account verified: ${superadminEmail}`);
      } else {
        const hashedPassword = await bcrypt.hash(superadminPassword, 10);
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
        console.log(`[SuperAdmin Sync] SuperAdmin account bootstrapped: ${superadminEmail}`);
      }

      // Assign orphaned bond_records without user_id to adminUserId
      if (adminUserId) {
        await executeSingleSql(`UPDATE bond_records SET user_id = ${adminUserId} WHERE user_id IS NULL;`);
      }
    }
  } catch (adminErr) {
    console.error("[SuperAdmin Sync Error]", adminErr);
  }

  console.log("[DB Sync] Schema synchronization finished.");
}
