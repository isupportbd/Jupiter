<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import axios from "axios";
import * as XLSX from "xlsx";

const router = useRouter();
const selectedFile = ref<File | null>(null);
const fileName = ref("");
const fileInputRef = ref<HTMLInputElement | null>(null);
const isProcessing = ref(false);
const isSaving = ref(false);
const saveProgress = ref(0);
const saveStatusText = ref("");
const error = ref<string | null>(null);
const saveSuccess = ref(false);
const savedCount = ref(0);

// Preview Modal State
const showPreviewModal = ref(false);
const allParsedRows = ref<any[]>([]);
const previewRows = ref<any[]>([]);
const totalRecordsInFile = ref(0);

// Helper Functions for parsing
function normalizeHeader(header: any): string {
  return (header || "")
    .toString()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function parseMonth(monStr: string): number {
  const months: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
  };
  return months[monStr.toLowerCase().slice(0, 3)] || 0;
}

function parseExcelDate(val: any): string | undefined {
  if (val === null || val === undefined || val === "") return undefined;

  if (typeof val === "number") {
    try {
      if ((XLSX as any)?.SSF?.parse_date_code) {
        const parsed = (XLSX as any).SSF.parse_date_code(val);
        if (parsed && parsed.y && parsed.m && parsed.d) {
          const y = String(parsed.y).padStart(4, "0");
          const m = String(parsed.m).padStart(2, "0");
          const d = String(parsed.d).padStart(2, "0");
          return `${y}-${m}-${d}`;
        }
      }
    } catch (_) {}

    const date = new Date(Math.round((val - 25569) * 86400 * 1000));
    if (!isNaN(date.getTime())) {
      const y = date.getUTCFullYear();
      const m = String(date.getUTCMonth() + 1).padStart(2, "0");
      const d = String(date.getUTCDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
    return undefined;
  }

  if (val instanceof Date) {
    if (isNaN(val.getTime())) return undefined;
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, "0");
    const d = String(val.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  const str = String(val).trim();
  if (!str || str === "-" || str === "N/A") return undefined;

  const monMatch = str.match(/^(\d{1,2})[-/ ]([A-Za-z]{3,9})[-/ ](\d{2,4})/);
  if (monMatch) {
    const d = monMatch[1].padStart(2, "0");
    const mNum = parseMonth(monMatch[2]);
    let yr = monMatch[3];
    if (yr.length === 2) {
      yr = Number(yr) > 50 ? "19" + yr : "20" + yr;
    }
    if (mNum > 0) {
      return `${yr}-${String(mNum).padStart(2, "0")}-${d}`;
    }
  }

  const ymd = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (ymd) {
    return `${ymd[1]}-${ymd[2].padStart(2, "0")}-${ymd[3].padStart(2, "0")}`;
  }

  const dmy = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  }

  const dmyShort = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})/);
  if (dmyShort) {
    const yr = Number(dmyShort[3]) > 50 ? "19" + dmyShort[3] : "20" + dmyShort[3];
    return `${yr}-${dmyShort[2].padStart(2, "0")}-${dmyShort[1].padStart(2, "0")}`;
  }

  return undefined;
}

function parseNumeric(val: any, defaultVal = 0): number {
  if (val === null || val === undefined || val === "") return defaultVal;
  if (typeof val === "number") return isNaN(val) ? defaultVal : val;
  const cleaned = String(val).replace(/,/g, "").replace(/[^0-9.-]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? defaultVal : num;
}

function formatNumber(val: any): string {
  const num = Number(val || 0);
  return num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(val: any): string {
  if (!val) return "-";
  return String(val);
}

const handleFileChange = (event: Event) => {
  const target = event.target as HTMLInputElement;
  if (target.files && target.files.length > 0) {
    const file = target.files[0];
    selectedFile.value = file;
    fileName.value = file.name;
    error.value = null;
    saveSuccess.value = false;
  } else {
    selectedFile.value = null;
    fileName.value = "";
  }
};

const triggerFileInput = () => {
  fileInputRef.value?.click();
};

const clearFile = (e: Event) => {
  e.stopPropagation();
  selectedFile.value = null;
  fileName.value = "";
  previewRows.value = [];
  allParsedRows.value = [];
  showPreviewModal.value = false;
  totalRecordsInFile.value = 0;
  error.value = null;
  if (fileInputRef.value) {
    fileInputRef.value.value = "";
  }
};

const handlePreview = async () => {
  if (!selectedFile.value) return;
  isProcessing.value = true;
  error.value = null;
  saveSuccess.value = false;

  const startTime = Date.now();

  try {
    const buffer = await selectedFile.value.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      throw new Error("No sheets found in the uploaded workbook.");
    }

    const worksheet = workbook.Sheets[firstSheetName];
    const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: true }) as any[][];

    if (!rawRows || rawRows.length === 0) {
      throw new Error("The selected file is empty.");
    }

    // Auto-detect Header Row
    let headerRowIndex = -1;
    const headerMap: Record<number, string> = {};

    for (let r = 0; r < Math.min(rawRows.length, 25); r++) {
      const row = rawRows[r];
      if (!Array.isArray(row)) continue;

      let matchCount = 0;
      const tempMap: Record<number, string> = {};

      row.forEach((cellVal, colIdx) => {
        if (cellVal !== undefined && cellVal !== null) {
          const norm = normalizeHeader(cellVal);
          tempMap[colIdx] = norm;

          if (
            norm.includes("BANKNAME") ||
            norm.includes("BRANCHNAME") ||
            norm.includes("LCID") ||
            norm.includes("LCVALUE") ||
            norm.includes("LCDATE") ||
            norm.includes("BENEFICIARY") ||
            norm.includes("EXPORTER")
          ) {
            matchCount++;
          }
        }
      });

      if (matchCount >= 2) {
        headerRowIndex = r;
        Object.assign(headerMap, tempMap);
        break;
      }
    }

    if (headerRowIndex === -1) {
      throw new Error("Could not find table header row (e.g. BANK_NAME, LC ID, LC_VALUE).");
    }

    const rows: any[] = [];

    for (let r = headerRowIndex + 1; r < rawRows.length; r++) {
      const row = rawRows[r];
      if (!Array.isArray(row) || row.length === 0) continue;

      let bankName = "";
      let branchName = "";
      let adsCode = "";
      let lcYear = "";
      let lcNature = "";
      let lcSerial = "";
      let lcId = "";
      let lcValue = 0;
      let currency = "USD";
      let lcDate: string | undefined;
      let lcExpiryDate: string | undefined;
      let bbUsansePeriod = "";
      let lastShipDate: string | undefined;
      let proceedsDate: string | undefined;
      let irc = "";
      let exporterInfo = "";
      let applicantName = "";
      let exportLcNumber = "";
      let beneficiaryBank = "";
      let beneficiaryBranch = "";
      let beneficiaryName = "";
      let beneficiaryAddress = "";
      let beneficiaryIrc = "";
      let beneficiaryErc = "";
      let piNumber = "";
      let piDate: string | undefined;
      let bondLicense = "";
      let accepted = "";
      let cancelYn = "N";
      let cancelCause = "";
      let entryDate: string | undefined;

      row.forEach((val, colIdx) => {
        const key = headerMap[colIdx];
        if (!key) return;

        if (key === "BANKNAME" || key.includes("BANKNAME")) {
          bankName = String(val || "").trim();
        } else if (key === "BRANCHNAME") {
          branchName = String(val || "").trim();
        } else if (key === "ADSCODE") {
          adsCode = String(val || "").trim();
        } else if (key === "LCYEAR") {
          lcYear = String(val || "").trim();
        } else if (key === "LCNATURE") {
          lcNature = String(val || "").trim();
        } else if (key === "LCSERIAL") {
          lcSerial = String(val || "").trim();
        } else if (key === "LCID") {
          lcId = String(val || "").trim();
        } else if (key === "LCVALUE" || key.includes("VALUE")) {
          lcValue = parseNumeric(val, 0);
        } else if (key === "CURRENCY") {
          currency = String(val || "USD").trim().toUpperCase();
        } else if (key === "LCDATE") {
          lcDate = parseExcelDate(val);
        } else if (key === "LCEXPIRYDATE" || key.includes("EXPIRY")) {
          lcExpiryDate = parseExcelDate(val);
        } else if (key === "BBUSANSEPERIOD" || key.includes("USANSE") || key.includes("USANCE")) {
          bbUsansePeriod = String(val || "").trim();
        } else if (key === "LASTSHIPDATE" || key.includes("SHIP")) {
          lastShipDate = parseExcelDate(val);
        } else if (key === "PROCEEDSDATE" || key.includes("PROCEEDS")) {
          proceedsDate = parseExcelDate(val);
        } else if (key === "IRC") {
          irc = String(val || "").trim();
        } else if (key === "EXPORTERINFO" || key.includes("EXPORTER")) {
          exporterInfo = String(val || "").trim();
        } else if (key === "APPLICANTNAME" || key.includes("APPLICANT")) {
          applicantName = String(val || "").trim();
        } else if (key === "EXPORTLCNUMBER" || key.includes("EXPORTLC")) {
          exportLcNumber = String(val || "").trim();
        } else if (key === "BENEFICIARYBANK") {
          beneficiaryBank = String(val || "").trim();
        } else if (key === "BENIFICIARYBRANCH" || key === "BENEFICIARYBRANCH") {
          beneficiaryBranch = String(val || "").trim();
        } else if (key === "BENEFICIARYNAME" || key.includes("BENEFICIARYNAME")) {
          beneficiaryName = String(val || "").trim();
        } else if (key === "BENEFICIARYADDRESS") {
          beneficiaryAddress = String(val || "").trim();
        } else if (key === "BENEFICIARYIRC") {
          beneficiaryIrc = String(val || "").trim();
        } else if (key === "BENEFICIARYERC") {
          beneficiaryErc = String(val || "").trim();
        } else if (key === "PINUMBER" || key.includes("PINUM")) {
          piNumber = String(val || "").trim();
        } else if (key === "PIDATE") {
          piDate = parseExcelDate(val);
        } else if (key === "BONDLICENSE" || key.includes("BONDLIC")) {
          bondLicense = String(val || "").trim();
        } else if (key === "ACCEPTED") {
          accepted = String(val || "").trim();
        } else if (key === "CANCELYN" || key.includes("CANCELYN")) {
          cancelYn = String(val || "N").trim().toUpperCase();
        } else if (key === "CANCELCAUSE" || key.includes("CAUSE")) {
          cancelCause = String(val || "").trim();
        } else if (key === "ENTRYDATE") {
          entryDate = parseExcelDate(val);
        }
      });

      // Strict Filter: Rows without valid BANK_NAME are skipped
      if (!bankName || bankName.trim() === "" || bankName.toLowerCase().startsWith("total") || bankName.toLowerCase().startsWith("grand")) {
        continue;
      }

      if (!lcId) {
        lcId = lcSerial ? `LC-${lcSerial}` : `LC-ROW-${r + 1}`;
      }

      rows.push({
        bankName,
        branchName,
        adsCode,
        lcYear,
        lcNature: lcNature || "General",
        lcSerial,
        lcId,
        lcValue,
        currency,
        lcDate,
        lcExpiryDate,
        bbUsansePeriod,
        lastShipDate,
        proceedsDate,
        irc,
        exporterInfo,
        applicantName: applicantName || "Unknown Applicant",
        exportLcNumber,
        beneficiaryBank,
        beneficiaryBranch,
        beneficiaryName,
        beneficiaryAddress,
        beneficiaryIrc,
        beneficiaryErc,
        piNumber,
        piDate,
        bondLicense: bondLicense || "N/A",
        accepted: accepted || "Y",
        cancelYn: cancelYn === "Y" ? "Y" : "N",
        cancelCause,
        entryDate
      });
    }

    if (rows.length === 0) {
      throw new Error("No valid data rows with BANK_NAME found in the file.");
    }

    // Freeze for at least 3 seconds (3000ms) with spinner animation
    const elapsed = Date.now() - startTime;
    if (elapsed < 3000) {
      await new Promise((resolve) => setTimeout(resolve, 3000 - elapsed));
    }

    allParsedRows.value = rows;
    totalRecordsInFile.value = rows.length;
    // Extract first 10 sample records for modal preview
    previewRows.value = rows.slice(0, 10);
    showPreviewModal.value = true;
  } catch (err: any) {
    // Keep 3s feedback even on failure
    const elapsed = Date.now() - startTime;
    if (elapsed < 1000) {
      await new Promise((resolve) => setTimeout(resolve, 1000 - elapsed));
    }
    error.value = err.message || "Failed to parse file for preview.";
    allParsedRows.value = [];
    previewRows.value = [];
    totalRecordsInFile.value = 0;
    showPreviewModal.value = false;
  } finally {
    isProcessing.value = false;
  }
};

const handleCommitToDatabase = async () => {
  if (allParsedRows.value.length === 0) return;

  isSaving.value = true;
  saveProgress.value = 5;
  saveStatusText.value = "Starting database save...";
  const total = allParsedRows.value.length;
  const chunkSize = 1000;
  const totalChunks = Math.ceil(total / chunkSize);

  try {
    for (let cIdx = 0; cIdx < totalChunks; cIdx++) {
      const start = cIdx * chunkSize;
      const chunkRecords = allParsedRows.value.slice(start, start + chunkSize);
      saveStatusText.value = `Saving chunk ${cIdx + 1} of ${totalChunks} (${chunkRecords.length} rows)...`;

      await axios.post("/api/bond/upload/chunk", {
        chunkIndex: cIdx + 1,
        totalChunks,
        records: chunkRecords
      });

      saveProgress.value = Math.round(((cIdx + 1) / totalChunks) * 100);
    }

    savedCount.value = total;
    saveSuccess.value = true;
    showPreviewModal.value = false;
    clearFile(new Event("clear"));

    setTimeout(() => {
      saveSuccess.value = false;
    }, 1000);
  } catch (err: any) {
    error.value = err.response?.data?.message || err.message || "Failed to save data to database.";
    setTimeout(() => {
      error.value = null;
    }, 2500);
  } finally {
    isSaving.value = false;
    saveProgress.value = 0;
    saveStatusText.value = "";
  }
};

const handleGoToReports = () => {
  router.push("/reports");
};
</script>

<template>
  <div class="dashboard-page py-4 position-relative">
    <!-- 3-Second Processing & Page Freeze Overlay -->
    <div
      v-if="isProcessing"
      class="preview-freeze-overlay d-flex flex-column align-items-center justify-content-center"
    >
      <div class="freeze-card d-flex flex-column align-items-center p-4">
        <div class="spinner-border text-info mb-3" style="width: 2.8rem; height: 2.8rem; border-width: 3px;" role="status">
          <span class="visually-hidden">Loading...</span>
        </div>
        <div class="freeze-title mb-1">Processing Workbook Data...</div>
        <div class="freeze-subtitle text-muted small">Please wait while the records are being parsed and validated</div>
      </div>
    </div>

    <!-- Hidden native file input -->
    <input
      ref="fileInputRef"
      type="file"
      accept=".xlsx, .xls, .csv"
      class="d-none"
      @change="handleFileChange"
    />

    <!-- Centered Upload Bar -->
    <div class="d-flex align-items-center justify-content-center gap-3 flex-wrap mb-4">
      <!-- File Picker Group -->
      <div class="custom-file-input-group d-flex align-items-center">
        <!-- Choose File Button -->
        <button
          type="button"
          class="btn-choose-file"
          @click="triggerFileInput"
        >
          Choose File
        </button>

        <!-- Readonly File Name Display Field -->
        <div class="file-name-display d-flex align-items-center justify-content-between">
          <span v-if="fileName" class="text-white text-truncate font-monospace" :title="fileName">
            {{ fileName }}
          </span>
          <span v-else class="text-muted"></span>

          <button
            v-if="selectedFile"
            type="button"
            class="btn-clear-file"
            title="Clear file"
            @click="clearFile"
          >
            <i class="bi bi-x"></i>
          </button>
        </div>
      </div>

      <!-- Preview Button -->
      <button
        type="button"
        class="btn-sketch-add"
        :disabled="!selectedFile || isProcessing"
        @click="handlePreview"
      >
        <span v-if="isProcessing" class="spinner-border spinner-border-sm"></span>
        <span>{{ isProcessing ? 'Processing...' : 'Preview' }}</span>
      </button>

      <!-- Go to Reports Button -->
      <button
        type="button"
        class="btn-sketch-reports"
        @click="handleGoToReports"
      >
        <i class="bi bi-file-earmark-bar-graph"></i>
        <span>Go to Reports</span>
      </button>
    </div>

    <!-- Floating Toast Notifications (Top Right) -->
    <div class="toast-container position-fixed top-0 end-0 p-4" style="z-index: 2100;">
      <!-- Success Toast -->
      <div
        v-if="saveSuccess"
        class="custom-toast custom-toast-success d-flex align-items-center justify-content-between p-3 mb-2"
        role="alert"
      >
        <div class="d-flex align-items-center gap-3">
          <div class="toast-icon-wrapper success">
            <i class="bi bi-check2-circle"></i>
          </div>
          <div>
            <div class="toast-title">Successfully Saved to Database!</div>
            <div class="toast-subtitle">{{ savedCount.toLocaleString() }} records committed to database</div>
          </div>
        </div>
        <button
          type="button"
          class="btn-close-toast ms-3"
          title="Close"
          @click="saveSuccess = false"
        >
          <i class="bi bi-x"></i>
        </button>
      </div>

      <!-- Error Toast -->
      <div
        v-if="error"
        class="custom-toast custom-toast-error d-flex align-items-center justify-content-between p-3 mb-2"
        role="alert"
      >
        <div class="d-flex align-items-center gap-3">
          <div class="toast-icon-wrapper error">
            <i class="bi bi-exclamation-triangle"></i>
          </div>
          <div>
            <div class="toast-title">Operation Failed</div>
            <div class="toast-subtitle">{{ error }}</div>
          </div>
        </div>
        <button
          type="button"
          class="btn-close-toast ms-3"
          title="Close"
          @click="error = null"
        >
          <i class="bi bi-x"></i>
        </button>
      </div>
    </div>

    <!-- DATA PREVIEW POPUP / MODAL (IDP-V2 Clean Standard Theme) -->
    <div
      v-if="showPreviewModal"
      class="modal-backdrop-custom d-flex align-items-center justify-content-center"
      tabindex="-1"
    >
      <div class="modal-dialog-custom">
        <div class="modal-content-custom shadow-lg">
          <!-- Modal Top Header with "Add to Database" and Title -->
          <div class="modal-header-custom d-flex align-items-center justify-content-between p-3 px-4">
            <div class="d-flex align-items-center gap-3">
              <div class="modal-badge-icon">
                <i class="bi bi-eye-fill text-muted"></i>
              </div>
              <div>
                <h6 class="modal-title-text mb-0">
                  Data Preview (First 10 Sample Rows)
                </h6>
                <span class="modal-subtitle-text">
                  Total <span class="modal-count-highlight">{{ totalRecordsInFile.toLocaleString() }}</span> valid records detected in file
                </span>
              </div>
            </div>

            <!-- Top Action Buttons: Add to Database & Close -->
            <div class="d-flex align-items-center gap-3">
              <button
                type="button"
                class="btn btn-idp-save"
                :disabled="isSaving"
                @click="handleCommitToDatabase"
              >
                <span v-if="isSaving" class="spinner-border spinner-border-sm"></span>
                <i v-else class="bi bi-cloud-arrow-up"></i>
                <span>{{ isSaving ? `Saving (${saveProgress}%)` : 'Add to Database' }}</span>
              </button>

              <button
                type="button"
                class="btn-close btn-close-white"
                :disabled="isSaving"
                title="Close preview"
                @click="showPreviewModal = false"
              ></button>
            </div>
          </div>

          <!-- Live Progress Bar when Saving -->
          <div v-if="isSaving" class="px-4 pt-2">
            <div class="progress" style="height: 5px; background: #1a2234;">
              <div
                class="progress-bar progress-bar-striped progress-bar-animated bg-info"
                role="progressbar"
                :style="{ width: saveProgress + '%' }"
              ></div>
            </div>
            <div class="text-muted small mt-1 text-center font-monospace" style="font-size: 0.75rem; color: #78889b !important;">
              {{ saveStatusText }}
            </div>
          </div>

          <!-- Modal Body: Bluish Dark Theme Table -->
          <div class="modal-body-custom p-3 px-4">
            <div class="idp-table-container">
              <table class="table idp-preview-table mb-0 align-middle text-nowrap">
                <thead>
                  <tr>
                    <th class="ps-3 text-center" style="width: 45px;">#</th>
                    <th>BANK_NAME</th>
                    <th>BRANCH_NAME</th>
                    <th>LC ID</th>
                    <th class="text-end">LC_VALUE</th>
                    <th>LC_DATE</th>
                    <th>LC_EXPIRY_DATE</th>
                    <th>EXPORTER_INFO</th>
                    <th>BENEFICIARY_BANK</th>
                    <th>BENEFICIARY_NAME</th>
                    <th>BENEFICIARY_ADDRESS</th>
                    <th class="pe-3">ENTRY_DATE</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(row, idx) in previewRows" :key="idx">
                    <td class="ps-3 text-center cell-num">
                      {{ idx + 1 }}
                    </td>
                    <td class="cell-main">{{ row.bankName || '-' }}</td>
                    <td class="cell-muted">{{ row.branchName || '-' }}</td>
                    <td class="cell-lc-id font-monospace">{{ row.lcId || '-' }}</td>
                    <td class="text-end cell-val font-monospace">{{ formatNumber(row.lcValue) }}</td>
                    <td class="cell-muted font-monospace">{{ formatDate(row.lcDate) }}</td>
                    <td class="cell-muted font-monospace">{{ formatDate(row.lcExpiryDate) }}</td>
                    <td style="max-width: 180px;" class="text-truncate cell-muted" :title="row.exporterInfo || ''">
                      {{ row.exporterInfo || '-' }}
                    </td>
                    <td class="cell-muted">{{ row.beneficiaryBank || '-' }}</td>
                    <td style="max-width: 180px;" class="text-truncate cell-main" :title="row.beneficiaryName || ''">
                      {{ row.beneficiaryName || '-' }}
                    </td>
                    <td style="max-width: 200px;" class="text-truncate cell-muted" :title="row.beneficiaryAddress || ''">
                      {{ row.beneficiaryAddress || '-' }}
                    </td>
                    <td class="pe-3 cell-muted font-monospace">{{ formatDate(row.entryDate) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dashboard-page {
  width: 100%;
}

/* File Input Group */
.custom-file-input-group {
  display: inline-flex;
  align-items: center;
  border: 1px solid #475569;
  border-radius: 4px;
  background: #131926;
  height: 38px;
  overflow: hidden;
}

/* Actual Choose File Button */
.btn-choose-file {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 1.25rem;
  height: 100%;
  font-size: 0.9rem;
  font-weight: 500;
  color: #f8fafc;
  background: #1e293b;
  border: none;
  border-right: 1px solid #475569;
  cursor: pointer;
  white-space: nowrap;
  transition: background-color 0.15s ease;
}

.btn-choose-file:hover {
  background: #28354d;
  color: #38bdf8;
}

.btn-choose-file:active {
  background: #172030;
}

/* Display Field (Non-clickable text field) */
.file-name-display {
  width: 280px;
  height: 100%;
  padding: 0 0.85rem;
  font-size: 0.88rem;
  background: #0f172a;
  cursor: default;
  user-select: text;
}

.btn-clear-file {
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 1.2rem;
  line-height: 1;
  padding: 0;
  cursor: pointer;
  display: flex;
  align-items: center;
}

.btn-clear-file:hover {
  color: #ef4444;
}

/* Solid Cyan/Blue Preview Button */
.btn-sketch-add {
  background: #38bdf8;
  border: 1px solid #38bdf8;
  color: #041322;
  font-weight: 600;
  font-size: 0.9rem;
  height: 38px;
  padding: 0 1.5rem;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.btn-sketch-add:hover:not(:disabled) {
  background: #0ea5e9;
  border-color: #0ea5e9;
  color: #ffffff;
}

.btn-sketch-add:disabled {
  background: #1e293b;
  border-color: #334155;
  color: #64748b;
  cursor: not-allowed;
}

/* Go to Reports Button */
.btn-sketch-reports {
  background: #1e293b;
  border: 1px solid #475569;
  color: #f8fafc;
  font-weight: 500;
  font-size: 0.9rem;
  height: 38px;
  padding: 0 1.25rem;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.btn-sketch-reports:hover {
  background: #334155;
  border-color: #38bdf8;
  color: #38bdf8;
}

/* Modal / Popup Styles (Deep Navy / Bluish Dark Theme) */
.modal-backdrop-custom {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(4, 8, 16, 0.82);
  backdrop-filter: blur(6px);
  z-index: 1050;
  padding: 1.5rem;
}

.modal-dialog-custom {
  width: 100%;
  max-width: 1380px;
  max-height: 92vh;
  display: flex;
  flex-direction: column;
}

.modal-content-custom {
  background: #101623;
  border: 1px solid #334155;
  border-radius: 10px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.modal-header-custom {
  background: #101623;
  border-bottom: 1px solid #1e293b;
}

.modal-badge-icon {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  background: rgba(148, 163, 184, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1rem;
  color: #94a3b8;
}

.modal-title-text {
  font-size: 0.92rem;
  font-weight: 500;
  color: #cbd5e1;
  letter-spacing: 0.01em;
}

.modal-subtitle-text {
  font-size: 0.76rem;
  color: #64748b;
}

.modal-count-highlight {
  color: #94a3b8;
  font-weight: 500;
}

/* Add to Database Button */
.btn-idp-save {
  background: #1b6342;
  border: 1px solid #267c55;
  color: #e2e8f0;
  font-weight: 500;
  font-size: 0.84rem;
  padding: 0.42rem 1.1rem;
  border-radius: 5px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  transition: all 0.15s ease;
}

.btn-idp-save:hover:not(:disabled) {
  background: #237c54;
  border-color: #2e9365;
  color: #ffffff;
}

.btn-idp-save:disabled {
  background: #1e293b;
  border-color: #334155;
  color: #64748b;
  cursor: not-allowed;
  box-shadow: none;
}

.modal-body-custom {
  overflow-y: auto;
  max-height: calc(92vh - 80px);
}

/* Table Container & Rows */
.idp-table-container {
  background: #111722;
  border: 1px solid #1e293b;
  border-radius: 6px;
  overflow: auto;
}

.idp-preview-table {
  width: 100%;
  font-size: 0.81rem;
  color: #cbd5e1;
  border-collapse: collapse;
}

.idp-preview-table thead th {
  background: #161e2c;
  color: #78889b;
  font-weight: 500;
  font-size: 0.73rem;
  letter-spacing: 0.02em;
  padding: 0.6rem 0.75rem;
  border-bottom: 1px solid #222e42;
  white-space: nowrap;
}

.idp-preview-table tbody td {
  padding: 0.52rem 0.75rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.035);
  background: transparent;
  font-weight: 400;
}

.idp-preview-table tbody tr:hover td {
  background: rgba(148, 163, 184, 0.04);
}

.cell-num {
  color: #556579;
  font-size: 0.78rem;
}

.cell-main {
  color: #cbd5e1;
  font-weight: 400;
}

.cell-muted {
  color: #718296;
  font-weight: 400;
}

.cell-lc-id {
  color: #7dd3fc;
  font-weight: 500;
}

.cell-val {
  color: #6ee7b7;
  font-weight: 500;
}

/* Page Freeze Overlay during 3s Preview Processing */
.preview-freeze-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(11, 15, 25, 0.78);
  backdrop-filter: blur(4px);
  z-index: 2000;
  cursor: wait;
  user-select: none;
}

.freeze-card {
  background: #111722;
  border: 1px solid #1e293b;
  border-radius: 12px;
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.6);
  text-align: center;
  min-width: 320px;
}

.freeze-title {
  color: #cbd5e1;
  font-size: 0.95rem;
  font-weight: 500;
  letter-spacing: 0.01em;
}

.freeze-subtitle {
  color: #78889b !important;
  font-size: 0.78rem;
}

/* Floating Toast Notifications (Dark IDP Style) */
.custom-toast {
  background: #111722;
  border: 1px solid #1e293b;
  border-radius: 8px;
  min-width: 320px;
  max-width: 420px;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.55);
  animation: toastSlideIn 0.25s ease forwards;
}

.custom-toast-success {
  border-left: 3px solid #10b981;
}

.custom-toast-error {
  border-left: 3px solid #ef4444;
}

.toast-icon-wrapper {
  width: 30px;
  height: 30px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.15rem;
  flex-shrink: 0;
}

.toast-icon-wrapper.success {
  background: rgba(16, 185, 129, 0.12);
  color: #34d399;
}

.toast-icon-wrapper.error {
  background: rgba(239, 68, 68, 0.12);
  color: #f87171;
}

.toast-title {
  color: #cbd5e1;
  font-size: 0.85rem;
  font-weight: 500;
  line-height: 1.3;
}

.toast-subtitle {
  color: #78889b;
  font-size: 0.75rem;
  line-height: 1.3;
}

.btn-close-toast {
  background: transparent;
  border: none;
  color: #64748b;
  font-size: 1.15rem;
  cursor: pointer;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.15s ease;
}

.btn-close-toast:hover {
  color: #cbd5e1;
}

@keyframes toastSlideIn {
  from {
    opacity: 0;
    transform: translateX(30px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}
</style>
