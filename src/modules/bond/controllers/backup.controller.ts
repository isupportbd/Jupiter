import { spawn } from "node:child_process";
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Handler } from "hono";
import { HttpStatusCodes } from "@/framework/facade.js";
import { syncDatabaseSchemaAndSuperAdmin } from "@/database/sync.js";

/**
 * Helper to get database connection string
 */
function getDatabaseUrl(): string {
  return process.env.DATABASE_URL || "postgres://postgres:postgres@127.0.0.1:5432/postgres";
}

/**
 * 1. Download Full SQL Backup of Jupiter Tables
 * Route: GET /api/bond/backup/download
 * Authorization: SuperAdmin only
 */
export const downloadDatabaseBackup: Handler = async (c: any) => {
  try {
    const auth = c.get("auth");
    const role = String(auth?.role || "").toLowerCase();

    if (role !== "superadmin") {
      return c.json({ message: "Access denied. SuperAdmin privileges required." }, HttpStatusCodes.FORBIDDEN);
    }

    const dbUrl = getDatabaseUrl();
    const args = [
      `--dbname=${dbUrl}`,
      "--clean",
      "--if-exists",
      "--no-owner",
      "--no-acl",
      "--inserts",
      "-t", "public.roles",
      "-t", "public.users",
      "-t", "public.refresh_tokens",
      "-t", "public.email_verification_tokens",
      "-t", "public.password_reset_tokens",
      "-t", "public.otp_verifications",
      "-t", "public.bond_records"
    ];

    const sqlContent = await new Promise<string>((resolve, reject) => {
      const proc = spawn("pg_dump", args, { windowsHide: true });
      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (data) => {
        stdout += data.toString();
      });
      proc.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      proc.on("error", (err) => {
        reject(new Error(`Failed to start pg_dump process: ${err.message}`));
      });

      proc.on("close", (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(stderr || `pg_dump exited with error code ${code}`));
        }
      });
    });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `jupiter_backup_${timestamp}.sql`;

    c.header("Content-Type", "application/sql; charset=utf-8");
    c.header("Content-Disposition", `attachment; filename="${filename}"`);
    c.header("Cache-Control", "no-cache, no-store, must-revalidate");

    return c.body(sqlContent);
  } catch (error: any) {
    console.error("Backup download error:", error);
    return c.json({ message: error.message || "Failed to generate database backup" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};

/**
 * 2. Upload / Restore SQL Backup into Jupiter Database
 * Route: POST /api/bond/backup/restore
 * Authorization: SuperAdmin only
 */
export const restoreDatabaseBackup: Handler = async (c: any) => {
  let tempFilePath: string | null = null;
  try {
    const auth = c.get("auth");
    const role = String(auth?.role || "").toLowerCase();

    if (role !== "superadmin") {
      return c.json({ message: "Access denied. SuperAdmin privileges required." }, HttpStatusCodes.FORBIDDEN);
    }

    const body = await c.req.parseBody();
    const file = body.file as any;

    if (!file) {
      return c.json({ message: "No SQL backup file provided." }, HttpStatusCodes.BAD_REQUEST);
    }

    // Read file buffer/text
    let sqlString = "";
    if (typeof file === "string") {
      sqlString = file;
    } else if (typeof file.text === "function") {
      sqlString = await file.text();
    } else if (file instanceof Blob || file instanceof File) {
      sqlString = await file.text();
    } else {
      return c.json({ message: "Invalid file format. Please upload a valid .sql backup file." }, HttpStatusCodes.BAD_REQUEST);
    }

    if (!sqlString || sqlString.trim().length === 0) {
      return c.json({ message: "The uploaded SQL file is empty." }, HttpStatusCodes.BAD_REQUEST);
    }

    const tmpDir = path.resolve(process.cwd(), "src/storage/tmp");
    if (!existsSync(tmpDir)) {
      mkdirSync(tmpDir, { recursive: true });
    }

    tempFilePath = path.join(tmpDir, `restore_${Date.now()}_${Math.random().toString(36).slice(2)}.sql`);
    writeFileSync(tempFilePath, sqlString, "utf-8");

    const dbUrl = getDatabaseUrl();
    const args = [`--dbname=${dbUrl}`, "-f", tempFilePath];

    await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      const proc = spawn("psql", args, { windowsHide: true });
      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (data) => {
        stdout += data.toString();
      });
      proc.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      proc.on("error", (err) => {
        reject(new Error(`Failed to start psql process: ${err.message}`));
      });

      proc.on("close", (code) => {
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          reject(new Error(stderr || `psql restore exited with error code ${code}`));
        }
      });
    });

    // Re-verify schema and SuperAdmin account integrity
    try {
      await syncDatabaseSchemaAndSuperAdmin();
    } catch (syncErr) {
      console.warn("Post-restore sync warning:", syncErr);
    }

    return c.json({
      success: true,
      message: "Database successfully restored from SQL backup file."
    });
  } catch (error: any) {
    console.error("Backup restore error:", error);
    return c.json({ message: error.message || "Failed to restore database from SQL file" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  } finally {
    if (tempFilePath && existsSync(tempFilePath)) {
      try {
        unlinkSync(tempFilePath);
      } catch (_) {}
    }
  }
};
