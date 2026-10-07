import { and, desc, eq, gte, ilike, lte, or, sql } from "drizzle-orm";
import type { Handler } from "hono";
import { db, HttpStatusCodes } from "@/framework/facade.js";
import { bondRecords } from "@/modules/bond/database/models/bond.js";
import { users } from "@/modules/auth/database/models/user.js";

/**
 * Helper to extract current authenticated user and permissions
 */
function getAuthContext(c: any) {
  const auth = c.get("auth");
  const userId = auth?.id ? Number(auth.id) : null;
  const role = String(auth?.role || "").toLowerCase();
  const isSuperOrAdmin = role === "superadmin" || role === "admin" || auth?.roleId === 1;
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
      const user = await db.query.users.findFirst({ where: eq(users.id, tenantId) });
      if (!user?.subscriptionExpiresAt || new Date(user.subscriptionExpiresAt).getTime() <= Date.now()) {
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

    const rowsToInsert = records.map((r) => ({
      userId: tenantId,
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
      entryDate: parseRecordDate(r.entryDate)
    }));

    // Direct insertion into PostgreSQL in safe sub-batches of 500
    const subBatchSize = 500;
    for (let i = 0; i < rowsToInsert.length; i += subBatchSize) {
      const subBatch = rowsToInsert.slice(i, i + subBatchSize);
      await db.insert(bondRecords).values(subBatch);
    }

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
      .from(bondRecords)
      .where(eq(bondRecords.userId, tenantId));
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
    const { userId, tenantId } = getAuthContext(c);
    if (!userId || !tenantId) {
      return c.json({ message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);
    }

    const isExport = c.req.query("export") === "true";
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

    // Strictly enforce multi-tenant per-account data isolation
    const conditions: any[] = [eq(bondRecords.userId, tenantId)];

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
        count: sql`count(*)`,
        totalLcValue: sql`sum(case when lc_value is not null then cast(lc_value as numeric) else 0 end)`
      })
      .from(bondRecords);

    const countResult = whereClause ? await countQuery.where(whereClause) : await countQuery;
    const total = Number(countResult[0]?.count || 0);
    const totalLcValue = Number(countResult[0]?.totalLcValue || 0);
    const totalPages = isExport ? 1 : Math.ceil(total / limit) || 1;

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

    const records = whereClause
      ? await dataQuery
          .where(whereClause)
          .orderBy(desc(bondRecords.lcDate), desc(bondRecords.entryDate), desc(bondRecords.id))
          .limit(limit)
          .offset(offset)
      : await dataQuery
          .orderBy(desc(bondRecords.lcDate), desc(bondRecords.entryDate), desc(bondRecords.id))
          .limit(limit)
          .offset(offset);

    return c.json({
      success: true,
      data: records,
      pagination: {
        total,
        page,
        limit,
        totalPages,
        totalLcValue
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
      eq(bondRecords.userId, tenantId),
      sql`beneficiary_name is not null and length(trim(beneficiary_name)) > 1 and trim(beneficiary_name) !~ '^[.\\s,;:-]+$'`
    ];

    if (search) {
      whereConditions.push(
        sql`TRIM(beneficiary_name) ILIKE ${`%${search}%`}`
      );
    }

    const results = await db
      .select({
        name: sql<string>`regexp_replace(TRIM(beneficiary_name), '\\s+', ' ', 'g')`
      })
      .from(bondRecords)
      .where(and(...whereConditions))
      .groupBy(sql`regexp_replace(TRIM(beneficiary_name), '\\s+', ' ', 'g')`)
      .orderBy(sql`regexp_replace(TRIM(beneficiary_name), '\\s+', ' ', 'g') ASC`)
      .limit(100);

    const uniqueNames = Array.from(
      new Set(
        results
          .map((r: any) => String(r.name || "").trim())
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
      eq(bondRecords.userId, tenantId),
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
        totalLcRegular: sql<number>`COUNT(CASE WHEN lc_id IS NOT NULL AND TRIM(lc_id) != '' THEN 1 END)`,
        totalBeneficiaryRegular: sql<number>`COUNT(CASE WHEN beneficiary_name IS NOT NULL AND TRIM(beneficiary_name) != '' THEN 1 END)`,
        totalBankRegular: sql<number>`COUNT(CASE WHEN bank_name IS NOT NULL AND TRIM(bank_name) != '' THEN 1 END)`,
        totalLcUnique: sql<number>`COUNT(DISTINCT CASE WHEN lc_id IS NOT NULL AND TRIM(lc_id) != '' THEN TRIM(lc_id) END)`,
        totalBeneficiaryUnique: sql<number>`COUNT(DISTINCT CASE WHEN beneficiary_name IS NOT NULL AND TRIM(beneficiary_name) != '' THEN TRIM(beneficiary_name) END)`,
        totalBankUnique: sql<number>`COUNT(DISTINCT CASE WHEN bank_name IS NOT NULL AND TRIM(bank_name) != '' THEN TRIM(bank_name) END)`
      })
      .from(bondRecords)
      .where(whereClause)
      .groupBy(
        sql`TO_CHAR(COALESCE(entry_date, lc_date), 'YYYY-MM')`,
        sql`TO_CHAR(COALESCE(entry_date, lc_date), 'FMMonth YYYY')`
      )
      .orderBy(sql`TO_CHAR(COALESCE(entry_date, lc_date), 'YYYY-MM') DESC`);

    const [[overallSummary], results] = await Promise.all([
      db
        .select({
          totalRecords: sql<number>`COUNT(*)`,
          totalLcRegular: sql<number>`COUNT(CASE WHEN lc_id IS NOT NULL AND TRIM(lc_id) != '' THEN 1 END)`,
          totalBeneficiaryRegular: sql<number>`COUNT(CASE WHEN beneficiary_name IS NOT NULL AND TRIM(beneficiary_name) != '' THEN 1 END)`,
          totalBankRegular: sql<number>`COUNT(CASE WHEN bank_name IS NOT NULL AND TRIM(bank_name) != '' THEN 1 END)`,
          totalLcUnique: sql<number>`COUNT(DISTINCT CASE WHEN lc_id IS NOT NULL AND TRIM(lc_id) != '' THEN TRIM(lc_id) END)`,
          totalBeneficiaryUnique: sql<number>`COUNT(DISTINCT CASE WHEN beneficiary_name IS NOT NULL AND TRIM(beneficiary_name) != '' THEN TRIM(beneficiary_name) END)`,
          totalBankUnique: sql<number>`COUNT(DISTINCT CASE WHEN bank_name IS NOT NULL AND TRIM(bank_name) != '' THEN TRIM(bank_name) END)`
        })
        .from(bondRecords)
        .where(whereClause),
      query
    ]);

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
        totalRecords: Number(overallSummary?.totalRecords ?? sumTotalRecords),
        totalLc: Number(overallSummary?.totalLcRegular ?? sumTotalLcRegular),
        totalBeneficiary: Number(overallSummary?.totalBeneficiaryRegular ?? sumTotalBeneficiaryRegular),
        totalBank: Number(overallSummary?.totalBankRegular ?? sumTotalBankRegular),
        totalLcRegular: Number(overallSummary?.totalLcRegular ?? sumTotalLcRegular),
        totalBeneficiaryRegular: Number(overallSummary?.totalBeneficiaryRegular ?? sumTotalBeneficiaryRegular),
        totalBankRegular: Number(overallSummary?.totalBankRegular ?? sumTotalBankRegular),
        totalLcUnique: Number(overallSummary?.totalLcUnique ?? sumTotalLcUnique),
        totalBeneficiaryUnique: Number(overallSummary?.totalBeneficiaryUnique ?? sumTotalBeneficiaryUnique),
        totalBankUnique: Number(overallSummary?.totalBankUnique ?? sumTotalBankUnique)
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
    const { userId, tenantId } = getAuthContext(c);
    if (!userId || !tenantId) {
      return c.json({ message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);
    }

    const body = await c.req.json();
    const months: string[] = Array.isArray(body.months) ? body.months.map((m: any) => String(m).trim()).filter(Boolean) : [];

    if (months.length === 0) {
      return c.json({ message: "No month(s) selected for deletion." }, HttpStatusCodes.BAD_REQUEST);
    }

    const monthConditions = months.map(
      (m) => sql`TO_CHAR(COALESCE(${bondRecords.entryDate}, ${bondRecords.lcDate}), 'YYYY-MM') = ${m}`
    );

    const deleteCondition = and(eq(bondRecords.userId, tenantId), or(...monthConditions));

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
