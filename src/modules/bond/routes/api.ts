import { createRouter } from "@/framework/facade.js";
import { authMiddleware } from "@/middlewares/auth-middleware.js";
import { subscriptionMiddleware } from "@/middlewares/subscription-middleware.js";
import {
  deleteMonthwiseRecords,
  getBeneficiaries,
  getDatabaseStorageSize,
  getLocalLcReport,
  getMonthwiseSummary,
  getSummary,
  processUploadChunk
} from "@/modules/bond/controllers/bond.controller.js";
import {
  downloadDatabaseBackup,
  restoreDatabaseBackup
} from "@/modules/bond/controllers/backup.controller.js";

const router = createRouter();

// Enforce authentication & subscription middlewares across bond data endpoints
router.use("*", authMiddleware);
router.use("*", subscriptionMiddleware);

// 1. Chunked Upload Endpoint (POST /api/bond/upload/chunk)
router.post("/upload/chunk", processUploadChunk);

// 2. Summary & Counts Endpoint (GET /api/bond/summary & GET /api/bond/storage-size)
router.get("/summary", getSummary);
router.get("/storage-size", getDatabaseStorageSize);

// 2.1 Database Backup & Restore Endpoints (SuperAdmin only)
router.get("/backup/download", downloadDatabaseBackup);
router.post("/backup/restore", restoreDatabaseBackup);

// 3. Local LC Report Endpoint (GET /api/bond/reports/local-lc)
router.get("/reports/local-lc", getLocalLcReport);

// 4. Monthwise Summary Report Endpoints (GET /api/bond/reports/monthwise & POST /api/bond/reports/monthwise/delete)
router.get("/reports/monthwise", getMonthwiseSummary);
router.post("/reports/monthwise/delete", deleteMonthwiseRecords);

// 5. Beneficiaries List (GET /api/bond/beneficiaries)
router.get("/beneficiaries", getBeneficiaries);

export default router;



