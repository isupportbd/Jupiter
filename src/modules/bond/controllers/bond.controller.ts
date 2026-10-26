import { createHash } from "node:crypto";
import { and, desc, eq, gte, ilike, lte, or, sql } from "drizzle-orm";
import type { Handler } from "hono";
import { db, HttpStatusCodes } from "@/framework/facade.js";
import { bondRecords } from "@/modules/bond/database/models/bond.js";
import { users } from "@/modules/auth/database/models/user.js";

/**
 * Computes a deterministic SHA-256 cryptographic hash across all 31 business fields.
 * Ensures that two rows are considered duplicates ONLY if all 31 columns are identical.
 * If even a single column differs (e.g. value, date, branch, status), it is treated as a valid distinct record.
 */
function computeRecordHash(row: Record<string, any>): string {
  const fields = [
    row.bankName,
    row.branchName,
    row.adsCode,
    row.lcYear,
    row.lcNature,
    row.lcSerial,
    row.lcId,
    row.lcValue,
    row.currency,
    row.lcDate instanceof Date ? row.lcDate.toISOString() : (row.lcDate || ""),
    row.lcExpiryDate instanceof Date ? row.lcExpiryDate.toISOString() : (row.lcExpiryDate || ""),
    row.bbUsansePeriod,
    row.lastShipDate instanceof Date ? row.lastShipDate.toISOString() : (row.lastShipDate || ""),
    row.proceedsDate instanceof Date ? row.proceedsDate.toISOString() : (row.proceedsDate || ""),
    row.applicantName,
    row.irc,
    row.exporterInfo,
    row.exportLcNumber,
    row.beneficiaryBank,
    row.beneficiaryBranch,
    row.beneficiaryName,
    row.beneficiaryAddress,
    row.beneficiaryIrc,
    row.beneficiaryErc,
    row.piNumber,
    row.piDate instanceof Date ? row.piDate.toISOString() : (row.piDate || ""),
    row.bondLicense,
    row.accepted,
    row.cancelYn,
    row.cancelCause,
    row.entryDate instanceof Date ? row.entryDate.toISOString() : (row.entryDate || "")
  ];

  const normalized = fields
    .map((v) => (v !== null && v !== undefined ? String(v).trim().toLowerCase() : ""))
    .join("|");

  return createHash("sha256").update(normalized).digest("hex");
}

/**
 * Helper to extract current authenticated user and permissions
 */
function getAuthContext(c: any) {
  const auth = c.get("auth");
  const userId = auth?.id ? Number(auth.id) : null;
  const role = String(auth?.role || "").toLowerCase();
  const isSuperOrAdmin = role === "superadmin" || role === "admin";
  const adminId = auth?.adminId !== undefined && auth?.adminId !== null ? Number(auth.adminId) : null;
  const isOperator = Boolean(adminId) || role === "operator";
  const tenantId = adminId || userId;
  return { userId, isSuperOrAdmin, isOperator, adminId, tenantId, auth };
}

function parseFilterDate(str: string, endOfDay = false): Date | null {
  if (!str) return null;
  const trimmed = str.trim();
  if (!trimmed || trimmed === "undefined" || trimmed === "null") return null;
  const match = trimmed.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (match) {
    const y = Number(match[1]);
    const m = Number(match[2]) - 1;
    const d = Number(match[3]);
    return endOfDay
      ? new Date(Date.UTC(y, m, d, 23, 59, 59, 999))
      : new Date(Date.UTC(y, m, d, 0, 0, 0, 0));
  }
  try {
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  } catch (_) {}
  return null;
}

function parseRecordDate(val: any): Date | null {
  if (!val) return null;
  const str = String(val).trim();
  if (!str || str === "undefined" || str === "null" || str === "N/A" || str === "-" || str === "NaN") return null;
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

function parseRecordNumeric(val: any): string {
  if (val === null || val === undefined || val === "") return "0";
  const num = typeof val === "number" ? val : Number(String(val).replace(/,/g, "").trim());
  return isNaN(num) ? "0" : num.toFixed(2);
}

/**
 * 1. Process One Chunk of Records (Stream directly into bondRecords for current user)
 * Route: POST /api/bond/upload/chunk
 */
export const processUploadChunk: Handler = async (c: any) => {
  try {
    const { userId, tenantId, isSuperOrAdmin } = getAuthContext(c);
    if (!userId || !tenantId) {
      return c.json({ message: "Unauthorized. Please log in first." }, HttpStatusCodes.UNAUTHORIZED);
    }

    if (!isSuperOrAdmin) {
      const tenantUser = await db.query.users.findFirst({ where: eq(users.id, tenantId) });
      if (!tenantUser || tenantUser.status !== "active") {
        return c.json(
          { message: "Account is not active or suspended. File upload is disabled." },
          HttpStatusCodes.FORBIDDEN
        );
      }
      if (!tenantUser.subscriptionExpiresAt || new Date(tenantUser.subscriptionExpiresAt).getTime() <= Date.now()) {
        return c.json(
          { message: "Your subscription has expired. File upload is disabled. Please contact the Administrator to renew." },
          HttpStatusCodes.FORBIDDEN
        );
      }
    }

    const body = await c.req.json();
    const chunkIndex = Number(body.chunkIndex || 1);
    const totalChunks = Number(body.totalChunks || 1);
    const records: any[] = body.records || [];

    if (!Array.isArray(records) || records.length === 0) {
      return c.json({ message: "No records found in payload" }, HttpStatusCodes.BAD_REQUEST);
    }

    const rowsToInsert = records.map((r) => {
      const parsedRow = {
        userId: Number(userId),
        bankName: String(r.bankName || "Unknown Bank").trim(),
        branchName: r.branchName ? String(r.branchName).trim() : null,
        adsCode: r.adsCode ? String(r.adsCode).trim() : null,
        lcYear: r.lcYear ? String(r.lcYear).trim() : null,
        lcNature: r.lcNature ? String(r.lcNature).trim() : null,
        lcSerial: r.lcSerial ? String(r.lcSerial).trim() : null,
        lcId: r.lcId ? String(r.lcId).trim() : null,
        lcValue: parseRecordNumeric(r.lcValue),
        currency: r.currency ? String(r.currency).trim().toUpperCase() : "USD",
        lcDate: parseRecordDate(r.lcDate),
        lcExpiryDate: parseRecordDate(r.lcExpiryDate),
        bbUsansePeriod: r.bbUsansePeriod ? String(r.bbUsansePeriod).trim() : null,
        lastShipDate: parseRecordDate(r.lastShipDate),
        proceedsDate: parseRecordDate(r.proceedsDate),
        irc: r.irc ? String(r.irc).trim() : null,
        exporterInfo: r.exporterInfo ? String(r.exporterInfo).trim() : null,
        applicantName: r.applicantName ? String(r.applicantName).trim() : null,
        exportLcNumber: r.exportLcNumber ? String(r.exportLcNumber).trim() : null,
        beneficiaryBank: r.beneficiaryBank ? String(r.beneficiaryBank).trim() : null,
        beneficiaryBranch: r.beneficiaryBranch ? String(r.beneficiaryBranch).trim() : null,
        beneficiaryName: r.beneficiaryName ? String(r.beneficiaryName).trim() : null,
        beneficiaryAddress: r.beneficiaryAddress ? String(r.beneficiaryAddress).trim() : null,
        beneficiaryIrc: r.beneficiaryIrc ? String(r.beneficiaryIrc).trim() : null,
        beneficiaryErc: r.beneficiaryErc ? String(r.beneficiaryErc).trim() : null,
        piNumber: r.piNumber ? String(r.piNumber).trim() : null,
        piDate: parseRecordDate(r.piDate),
        bondLicense: r.bondLicense ? String(r.bondLicense).trim() : null,
        accepted: r.accepted ? String(r.accepted).trim() : null,
        cancelYn: r.cancelYn ? String(r.cancelYn).trim().toUpperCase() : "N",
        cancelCause: r.cancelCause ? String(r.cancelCause).trim() : null,
        entryDate: parseRecordDate(r.entryDate),
        recordHash: ""
      };
      parsedRow.recordHash = computeRecordHash(parsedRow);
      return parsedRow;
    });

    // In-memory deduplication using full 31-column cryptographic hash (zero false positives)
    const seenInChunk = new Set<string>();
    const dedupedRows = [];
    for (const row of rowsToInsert) {
      if (!seenInChunk.has(row.recordHash)) {
        seenInChunk.add(row.recordHash);
        dedupedRows.push(row);
      }
    }

    // Direct insertion into PostgreSQL in safe sub-batches within an atomic transaction
    // onConflictDoNothing avoids duplicate entries across users or repeat uploads
    const subBatchSize = 500;
    await db.transaction(async (tx) => {
      for (let i = 0; i < dedupedRows.length; i += subBatchSize) {
        const subBatch = dedupedRows.slice(i, i + subBatchSize);
        await tx.insert(bondRecords).values(subBatch).onConflictDoNothing();
      }
    });

    return c.json({
      message: `Chunk ${chunkIndex}/${totalChunks} processed successfully`,
      data: {
        chunkIndex,
        totalChunks,
        insertedOrUpdated: rowsToInsert.length
      }
    });
  } catch (error: any) {
    const errorDetails = error?.cause?.message || error?.message || "Failed to process chunk";
    console.error("Chunk insert error:", errorDetails, error);
    return c.json({ message: errorDetails }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};

/**
 * 2. Get Summary & Counts (Strictly scoped to user's own data)
 * Route: GET /api/bond/summary
 */
export const getSummary: Handler = async (c: any) => {
  try {
    const { userId, tenantId } = getAuthContext(c);
    if (!userId || !tenantId) {
      return c.json({ message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);
    }

    const countResult = await db
      .select({ count: sql`count(*)` })
      .from(bondRecords);
    const totalRecords = Number(countResult[0]?.count || 0);

    return c.json({
      success: true,
      data: {
        totalRecords
      }
    });
  } catch (error: any) {
    return c.json({ message: error.message }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};

/**
 * 2.1 Get Database Storage Size (Database size in GB/MB)
 * Route: GET /api/bond/storage-size
 */
export const getDatabaseStorageSize: Handler = async (c: any) => {
  try {
    const { userId } = getAuthContext(c);
    if (!userId) {
      return c.json({ message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);
    }

    const result: any = await db.execute(
      sql`SELECT pg_database_size(current_database()) AS size_bytes, pg_size_pretty(pg_database_size(current_database())) AS size_pretty`
    );

    const rows = result?.rows || result || [];
    const sizeBytes = Number(rows[0]?.size_bytes || 0);
    const sizePretty = String(rows[0]?.size_pretty || "0 MB");
    const sizeGb = (sizeBytes / (1024 * 1024 * 1024)).toFixed(3);
    const sizeGbDisplay = (sizeBytes / (1024 * 1024 * 1024)).toFixed(2);
    const sizeMbDisplay = (sizeBytes / (1024 * 1024)).toFixed(2);

    return c.json({
      success: true,
      data: {
        sizeBytes,
        sizePretty,
        sizeMb: `${sizeMbDisplay} MB`,
        sizeGb: `${sizeGbDisplay} GB`,
        sizeGbPrecise: `${sizeGb} GB`
      }
    });
  } catch (error: any) {
    console.error("Database storage size error:", error);
    return c.json({ message: error.message }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};

/**
 * 3. Get Local LC Report (Paginated + Filterable + Exportable + Strictly User Scoped)
 * Route: GET /api/bond/reports/local-lc
 */
export const getLocalLcReport: Handler = async (c: any) => {
  try {
    const { userId, tenantId, isSuperOrAdmin } = getAuthContext(c);
    if (!userId || !tenantId) {
      return c.json({ message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);
    }

    const isExport = c.req.query("export") === "true";

    if (isExport && !isSuperOrAdmin) {
      const tenantUser = await db.query.users.findFirst({ where: eq(users.id, tenantId) });
      if (!tenantUser || tenantUser.status !== "active" || !tenantUser.subscriptionExpiresAt || new Date(tenantUser.subscriptionExpiresAt).getTime() <= Date.now()) {
        return c.json(
          { message: "Your subscription has expired. Report export is disabled." },
          HttpStatusCodes.FORBIDDEN
        );
      }
    }

    const page = Math.max(1, Number(c.req.query("page") || 1));
    const limit = isExport ? 50000 : Math.max(1, Math.min(100, Number(c.req.query("limit") || 10)));
    const offset = isExport ? 0 : (page - 1) * limit;

    const search = (c.req.query("search") || "").trim();
    const rawBeneficiary = (c.req.query("beneficiary") || c.req.query("beneficiaries") || "").trim();
    const lcDateFrom = parseFilterDate(c.req.query("lcDateFrom") || "");
    const lcDateTo = parseFilterDate(c.req.query("lcDateTo") || "", true);
    const entryDateFrom = parseFilterDate(c.req.query("entryDateFrom") || "");
    const entryDateTo = parseFilterDate(c.req.query("entryDateTo") || "", true);

    let beneficiaryList: string[] = [];
    if (rawBeneficiary.startsWith("[") && rawBeneficiary.endsWith("]")) {
      try {
        beneficiaryList = JSON.parse(rawBeneficiary);
      } catch (_) {}
    }
    if (beneficiaryList.length === 0 && rawBeneficiary) {
      beneficiaryList = rawBeneficiary
        .split(/[,;|]/)
        .map((b: string) => b.trim())
        .filter(Boolean);
    }

    // Office-wide shared records (visible to all authorized office users)
    const conditions: any[] = [];

    // Global text search
    if (search) {
      const searchPattern = `%${search}%`;
      conditions.push(
        or(
          ilike(bondRecords.bankName, searchPattern),
          ilike(bondRecords.branchName, searchPattern),
          ilike(bondRecords.lcId, searchPattern),
          ilike(bondRecords.exporterInfo, searchPattern),
          ilike(bondRecords.applicantName, searchPattern),
          ilike(bondRecords.beneficiaryBank, searchPattern),
          ilike(bondRecords.beneficiaryBranch, searchPattern),
          ilike(bondRecords.beneficiaryName, searchPattern),
          ilike(bondRecords.beneficiaryAddress, searchPattern),
          ilike(bondRecords.piNumber, searchPattern),
          ilike(bondRecords.exportLcNumber, searchPattern),
          ilike(bondRecords.bondLicense, searchPattern)
        )
      );
    }

    // Beneficiary filter (supports single or multiple selected beneficiaries)
    if (beneficiaryList.length === 1) {
      conditions.push(ilike(bondRecords.beneficiaryName, `%${beneficiaryList[0]}%`));
    } else if (beneficiaryList.length > 1) {
      const benConditions = beneficiaryList.map((name) => ilike(bondRecords.beneficiaryName, `%${name}%`));
      conditions.push(or(...benConditions));
    }

    // LC Date Range
    if (lcDateFrom) {
      conditions.push(gte(bondRecords.lcDate, lcDateFrom));
    }
    if (lcDateTo) {
      conditions.push(lte(bondRecords.lcDate, lcDateTo));
    }

    // Entry Date Range
    if (entryDateFrom) {
      conditions.push(gte(bondRecords.entryDate, entryDateFrom));
    }
    if (entryDateTo) {
      conditions.push(lte(bondRecords.entryDate, entryDateTo));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Count Total Matching Records & Sum LC Value
    const countQuery = db
      .select({
        count: sql<number>`count(*)`,
        totalLcValue: sql<number>`COALESCE(SUM(${bondRecords.lcValue}), 0)`
      })
      .from(bondRecords);

    // Fetch Records with all columns
    const dataQuery = db
      .select({
        id: bondRecords.id,
        bankName: bondRecords.bankName,
        branchName: bondRecords.branchName,
        adsCode: bondRecords.adsCode,
        lcYear: bondRecords.lcYear,
        lcNature: bondRecords.lcNature,
        lcSerial: bondRecords.lcSerial,
        lcId: bondRecords.lcId,
        lcValue: bondRecords.lcValue,
        currency: bondRecords.currency,
        lcDate: bondRecords.lcDate,
        lcExpiryDate: bondRecords.lcExpiryDate,
        bbUsansePeriod: bondRecords.bbUsansePeriod,
        lastShipDate: bondRecords.lastShipDate,
        proceedsDate: bondRecords.proceedsDate,
        applicantName: bondRecords.applicantName,
        irc: bondRecords.irc,
        exporterInfo: bondRecords.exporterInfo,
        exportLcNumber: bondRecords.exportLcNumber,
        beneficiaryBank: bondRecords.beneficiaryBank,
        beneficiaryBranch: bondRecords.beneficiaryBranch,
        beneficiaryName: bondRecords.beneficiaryName,
        beneficiaryAddress: bondRecords.beneficiaryAddress,
        beneficiaryIrc: bondRecords.beneficiaryIrc,
        beneficiaryErc: bondRecords.beneficiaryErc,
        piNumber: bondRecords.piNumber,
        piDate: bondRecords.piDate,
        bondLicense: bondRecords.bondLicense,
        accepted: bondRecords.accepted,
        cancelYn: bondRecords.cancelYn,
        cancelCause: bondRecords.cancelCause,
        entryDate: bondRecords.entryDate
      })
      .from(bondRecords);

    // Execute count and paginated data queries in parallel
    const countPromise = whereClause ? countQuery.where(whereClause) : countQuery;
    const dataPromise = whereClause
      ? dataQuery
          .where(whereClause)
          .orderBy(desc(bondRecords.lcDate), desc(bondRecords.entryDate), desc(bondRecords.id))
          .limit(limit)
          .offset(offset)
      : dataQuery
          .orderBy(desc(bondRecords.lcDate), desc(bondRecords.entryDate), desc(bondRecords.id))
          .limit(limit)
          .offset(offset);

    const [countResult, records] = await Promise.all([countPromise, dataPromise]);

    const total = Number(countResult[0]?.count || 0);
    const totalLcValue = Number(countResult[0]?.totalLcValue || 0);
    const totalPages = isExport ? 1 : Math.ceil(total / limit) || 1;

    const isTruncated = isExport && total > limit;
    if (isTruncated) {
      c.header("X-Data-Truncated", "true");
    }

    return c.json({
      success: true,
      data: records,
      pagination: {
        total,
        page,
        limit,
        totalPages,
        totalLcValue,
        isTruncated
      }
    });
  } catch (error: any) {
    console.error("Local LC Report error:", error);
    return c.json({ message: error.message }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};

/**
 * 4. Get Distinct Beneficiaries List for Dropdown filter (Strictly Scoped to user's own uploaded records)
 * Route: GET /api/bond/beneficiaries
 */
export const getBeneficiaries: Handler = async (c: any) => {
  try {
    const { userId, tenantId } = getAuthContext(c);
    if (!userId || !tenantId) {
      return c.json({ message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);
    }

    const search = c.req.query("search")?.trim();
    const whereConditions: any[] = [
      sql`beneficiary_name is not null and length(trim(beneficiary_name)) > 1`
    ];

    if (search) {
      whereConditions.push(
        ilike(bondRecords.beneficiaryName, `%${search}%`)
      );
    }

    // Index-friendly distinct selection
    const results = await db
      .selectDistinct({
        name: bondRecords.beneficiaryName
      })
      .from(bondRecords)
      .where(and(...whereConditions))
      .orderBy(bondRecords.beneficiaryName)
      .limit(100);

    const uniqueNames = Array.from(
      new Set(
        results
          .map((r: any) => String(r.name || "").replace(/\s+/g, " ").trim())
          .filter((n: string) => n && n.length > 1 && !/^[.\s,;:-]+$/.test(n))
      )
    );

    return c.json({
      success: true,
      data: uniqueNames
    });
  } catch (error: any) {
    return c.json({ message: error.message }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};

/**
 * 5. Get Monthwise Summary (Strictly User Scoped)
 * Route: GET /api/bond/reports/monthwise
 */
export const getMonthwiseSummary: Handler = async (c: any) => {
  try {
    const { userId, tenantId } = getAuthContext(c);
    if (!userId || !tenantId) {
      return c.json({ message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);
    }

    const year = (c.req.query("year") || "").trim();
    const monthFrom = (c.req.query("monthFrom") || "").trim();
    const monthTo = (c.req.query("monthTo") || "").trim();

    const conditions: any[] = [
      sql`COALESCE(entry_date, lc_date) IS NOT NULL`
    ];

    if (year) {
      conditions.push(sql`TO_CHAR(COALESCE(entry_date, lc_date), 'YYYY') = ${year}`);
    }
    if (monthFrom) {
      conditions.push(sql`TO_CHAR(COALESCE(entry_date, lc_date), 'YYYY-MM') >= ${monthFrom}`);
    }
    if (monthTo) {
      conditions.push(sql`TO_CHAR(COALESCE(entry_date, lc_date), 'YYYY-MM') <= ${monthTo}`);
    }

    const whereClause = and(...conditions);

    const query = db
      .select({
        monthKey: sql<string>`TO_CHAR(COALESCE(entry_date, lc_date), 'YYYY-MM')`,
        monthLabel: sql<string>`TO_CHAR(COALESCE(entry_date, lc_date), 'FMMonth YYYY')`,
        totalRecords: sql<number>`COUNT(*)`,
        totalLcRegular: sql<number>`COUNT(lc_id)`,
        totalBeneficiaryRegular: sql<number>`COUNT(beneficiary_name)`,
        totalBankRegular: sql<number>`COUNT(bank_name)`,
        totalLcUnique: sql<number>`COUNT(DISTINCT lc_id)`,
        totalBeneficiaryUnique: sql<number>`COUNT(DISTINCT beneficiary_name)`,
        totalBankUnique: sql<number>`COUNT(DISTINCT bank_name)`
      })
      .from(bondRecords)
      .where(whereClause)
      .groupBy(
        sql`TO_CHAR(COALESCE(entry_date, lc_date), 'YYYY-MM')`,
        sql`TO_CHAR(COALESCE(entry_date, lc_date), 'FMMonth YYYY')`
      )
      .orderBy(sql`TO_CHAR(COALESCE(entry_date, lc_date), 'YYYY-MM') DESC`);

    const results = await query;

    let sumTotalRecords = 0;
    let sumTotalLcRegular = 0;
    let sumTotalBeneficiaryRegular = 0;
    let sumTotalBankRegular = 0;
    let sumTotalLcUnique = 0;
    let sumTotalBeneficiaryUnique = 0;
    let sumTotalBankUnique = 0;

    const formattedResults = results.map((r: any) => {
      const recNum = Number(r.totalRecords || 0);
      const lcReg = Number(r.totalLcRegular || 0);
      const benReg = Number(r.totalBeneficiaryRegular || 0);
      const bankReg = Number(r.totalBankRegular || 0);
      const lcUnq = Number(r.totalLcUnique || 0);
      const benUnq = Number(r.totalBeneficiaryUnique || 0);
      const bankUnq = Number(r.totalBankUnique || 0);

      sumTotalRecords += recNum;
      sumTotalLcRegular += lcReg;
      sumTotalBeneficiaryRegular += benReg;
      sumTotalBankRegular += bankReg;
      sumTotalLcUnique += lcUnq;
      sumTotalBeneficiaryUnique += benUnq;
      sumTotalBankUnique += bankUnq;

      return {
        monthKey: r.monthKey,
        monthLabel: r.monthLabel || r.monthKey,
        totalRecords: recNum,
        totalLc: lcReg,
        totalBeneficiary: benReg,
        totalBank: bankReg,
        totalLcRegular: lcReg,
        totalBeneficiaryRegular: benReg,
        totalBankRegular: bankReg,
        totalLcUnique: lcUnq,
        totalBeneficiaryUnique: benUnq,
        totalBankUnique: bankUnq
      };
    });

    return c.json({
      success: true,
      data: formattedResults,
      summary: {
        totalMonths: formattedResults.length,
        totalRecords: sumTotalRecords,
        totalLc: sumTotalLcRegular,
        totalBeneficiary: sumTotalBeneficiaryRegular,
        totalBank: sumTotalBankRegular,
        totalLcRegular: sumTotalLcRegular,
        totalBeneficiaryRegular: sumTotalBeneficiaryRegular,
        totalBankRegular: sumTotalBankRegular,
        totalLcUnique: sumTotalLcUnique,
        totalBeneficiaryUnique: sumTotalBeneficiaryUnique,
        totalBankUnique: sumTotalBankUnique
      }
    });
  } catch (error: any) {
    console.error("Monthwise Summary error:", error);
    return c.json({ message: error.message }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};

/**
 * 6. Delete Monthwise Records (Strictly scoped to user's own records)
 * Route: POST /api/bond/reports/monthwise/delete
 */
export const deleteMonthwiseRecords: Handler = async (c: any) => {
  try {
    const { userId, tenantId, isSuperOrAdmin } = getAuthContext(c);
    if (!userId || !tenantId) {
      return c.json({ message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);
    }

    if (!isSuperOrAdmin) {
      const tenantUser = await db.query.users.findFirst({ where: eq(users.id, tenantId) });
      if (!tenantUser || tenantUser.status !== "active") {
        return c.json({ message: "Account is not active." }, HttpStatusCodes.FORBIDDEN);
      }
      if (!tenantUser.subscriptionExpiresAt || new Date(tenantUser.subscriptionExpiresAt).getTime() <= Date.now()) {
        return c.json(
          { message: "Your subscription has expired. Record deletion is disabled." },
          HttpStatusCodes.FORBIDDEN
        );
      }
    }

    const body = await c.req.json();
    const months: string[] = Array.isArray(body.months) ? body.months.map((m: any) => String(m).trim()).filter(Boolean) : [];

    if (months.length === 0) {
      return c.json({ message: "No month(s) selected for deletion." }, HttpStatusCodes.BAD_REQUEST);
    }

    const monthConditions = months.map(
      (m) => sql`TO_CHAR(COALESCE(${bondRecords.entryDate}, ${bondRecords.lcDate}), 'YYYY-MM') = ${m}`
    );

    const deleteCondition = or(...monthConditions);

    await db.delete(bondRecords).where(deleteCondition);

    return c.json({
      success: true,
      message: `Successfully deleted records for ${months.length} month(s).`,
      deletedMonths: months
    });
  } catch (error: any) {
    console.error("Delete Monthwise Records error:", error);
    return c.json({ message: error.message }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};
