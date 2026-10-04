<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useAuthStore } from "@/stores/auth";
import axios from "axios";
import ExcelJS from "exceljs";

const authStore = useAuthStore();

const isSubscriptionExpired = computed(() => {
  const roleName = String((authStore.user as any)?.role?.name || (authStore.user as any)?.role || "").toLowerCase();
  const isAdmin = roleName === "superadmin" || roleName === "admin";
  if (isAdmin) return false;
  return Number((authStore.user as any)?.daysRemaining || 0) <= 0;
});

type TabType = "local_lc" | "all_data" | "monthwise";
const activeTab = ref<TabType>("local_lc");

// Local LC Report State
const records = ref<any[]>([]);
const isLoading = ref(false);
const isExporting = ref(false);
const error = ref<string | null>(null);

// Pagination State
const currentPage = ref(1);
const pageSize = ref(10);
const totalRecords = ref(0);
const totalPages = ref(1);
const totalLcValue = ref(0);

// Filters State
const searchQuery = ref("");
const beneficiarySearchInput = ref("");
const selectedBeneficiaries = ref<string[]>([]);
const lcDateFrom = ref("");
const lcDateTo = ref("");
const entryDateFrom = ref("");
const entryDateTo = ref("");

// Beneficiary suggestions & Multi-select State
const beneficiaryOptions = ref<string[]>([]);
const localBeneficiarySuggestions = ref<string[]>([]);
const showBeneficiaryDropdown = ref(false);

const beneficiaryPlaceholder = computed(() => {
  if (selectedBeneficiaries.value.length === 0) {
    return "Type to search Beneficiary...";
  }
  if (selectedBeneficiaries.value.length === 1) {
    return selectedBeneficiaries.value[0];
  }
  return `${selectedBeneficiaries.value.length} beneficiaries selected`;
});

const isBeneficiarySelected = (name: string) => {
  return selectedBeneficiaries.value.includes(name);
};

const toggleBeneficiary = (name: string) => {
  const trimmed = (name || "").trim();
  if (!trimmed) return;
  const idx = selectedBeneficiaries.value.indexOf(trimmed);
  if (idx > -1) {
    selectedBeneficiaries.value.splice(idx, 1);
  } else {
    selectedBeneficiaries.value.push(trimmed);
  }
  fetchLocalLcData(1);
};

const clearAllBeneficiaries = () => {
  selectedBeneficiaries.value = [];
  beneficiarySearchInput.value = "";
  showBeneficiaryDropdown.value = false;
  localBeneficiarySuggestions.value = [];
  fetchLocalLcData(1);
};

let localBenSearchTimeout: any = null;
const searchLocalBeneficiariesFromApi = (query: string) => {
  clearTimeout(localBenSearchTimeout);
  const q = (query || "").trim();
  if (!q) {
    localBeneficiarySuggestions.value = [];
    showBeneficiaryDropdown.value = false;
    return;
  }
  const filtered = beneficiaryOptions.value
    .filter((name) => name && name.toLowerCase().includes(q.toLowerCase()))
    .slice(0, 50);
  localBeneficiarySuggestions.value = filtered;
  showBeneficiaryDropdown.value = filtered.length > 0;

  localBenSearchTimeout = setTimeout(async () => {
    try {
      const res = await axios.get("/api/bond/beneficiaries", {
        params: { search: q }
      });
      if (res.data && res.data.success && Array.isArray(res.data.data)) {
        const rawNames: string[] = res.data.data
          .map((item: any) => (typeof item === "string" ? item.trim() : String(item?.name || "").trim()))
          .filter((name: string) => name && name.length > 1 && !/^[.\s,;:-]+$/.test(name));
        const uniqueNames = Array.from(new Set(rawNames));
        if (beneficiarySearchInput.value.trim()) {
          localBeneficiarySuggestions.value = uniqueNames;
          showBeneficiaryDropdown.value = uniqueNames.length > 0;
        }
      }
    } catch (_) {}
  }, 150);
};

const handleBeneficiaryFocus = () => {
  const q = beneficiarySearchInput.value.trim();
  if (q) {
    searchLocalBeneficiariesFromApi(q);
  }
};

const handleBeneficiaryInput = () => {
  const q = beneficiarySearchInput.value.trim();
  if (!q) {
    localBeneficiarySuggestions.value = [];
    showBeneficiaryDropdown.value = false;
  } else {
    searchLocalBeneficiariesFromApi(q);
  }
  if (selectedBeneficiaries.value.length === 0) {
    handleSearchInput();
  }
};

const handleBeneficiaryBlur = () => {
  setTimeout(() => {
    showBeneficiaryDropdown.value = false;
  }, 250);
};

const getBeneficiaryParam = () => {
  if (selectedBeneficiaries.value.length > 0) {
    return JSON.stringify(selectedBeneficiaries.value);
  }
  return beneficiarySearchInput.value.trim() || undefined;
};

let debounceTimer: any = null;

const hasActiveFilters = computed(() => {
  return (
    !!searchQuery.value.trim() ||
    selectedBeneficiaries.value.length > 0 ||
    !!beneficiarySearchInput.value.trim() ||
    !!lcDateFrom.value ||
    !!lcDateTo.value ||
    !!entryDateFrom.value ||
    !!entryDateTo.value
  );
});

const applyPreset = (type: "thisMonth" | "last30" | "thisYear") => {
  const now = new Date();
  if (type === "thisMonth") {
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
    lcDateFrom.value = `${year}-${month}-01`;
    lcDateTo.value = `${year}-${month}-${String(lastDay).padStart(2, "0")}`;
  } else if (type === "last30") {
    const past = new Date();
    past.setDate(now.getDate() - 30);
    lcDateFrom.value = past.toISOString().slice(0, 10);
    lcDateTo.value = now.toISOString().slice(0, 10);
  } else if (type === "thisYear") {
    const year = now.getFullYear();
    lcDateFrom.value = `${year}-01-01`;
    lcDateTo.value = `${year}-12-31`;
  }
  fetchLocalLcData(1);
};

const clearSearch = () => {
  searchQuery.value = "";
  fetchLocalLcData(1);
};

const clearBeneficiary = () => {
  clearAllBeneficiaries();
};

const clearLcDate = () => {
  lcDateFrom.value = "";
  lcDateTo.value = "";
  fetchLocalLcData(1);
};

const clearEntryDate = () => {
  entryDateFrom.value = "";
  entryDateTo.value = "";
  fetchLocalLcData(1);
};

const fetchBeneficiaries = async () => {
  try {
    const res = await axios.get("/api/bond/beneficiaries");
    if (res.data && res.data.success) {
      const raw = res.data.data || [];
      const names: string[] = raw
        .map((item: any) => (typeof item === "string" ? item.trim() : String(item?.name || "").trim()))
        .filter((name: string) => name && name.length > 1 && !/^[.\s,;:-]+$/.test(name));
      beneficiaryOptions.value = Array.from(new Set(names));
    }
  } catch (_) {}
};

const fetchLocalLcData = async (page = 1) => {
  isLoading.value = true;
  error.value = null;
  currentPage.value = page;

  try {
    const res = await axios.get("/api/bond/reports/local-lc", {
      params: {
        page: currentPage.value,
        limit: pageSize.value,
        search: searchQuery.value || undefined,
        beneficiary: getBeneficiaryParam(),
        lcDateFrom: lcDateFrom.value || undefined,
        lcDateTo: lcDateTo.value || undefined,
        entryDateFrom: entryDateFrom.value || undefined,
        entryDateTo: entryDateTo.value || undefined
      }
    });

    if (res.data && res.data.success) {
      records.value = res.data.data || [];
      const pag = res.data.pagination;
      if (pag) {
        totalRecords.value = pag.total || 0;
        totalPages.value = pag.totalPages || 1;
        currentPage.value = pag.page || 1;
        totalLcValue.value = pag.totalLcValue || 0;
      }
    }
  } catch (err: any) {
    error.value = err.response?.data?.message || err.message || "Failed to load Local LC report.";
  } finally {
    isLoading.value = false;
  }
};

const handleSearchInput = () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    fetchLocalLcData(1);
  }, 350);
};

const handleFilterChange = () => {
  fetchLocalLcData(1);
};

const resetFilters = () => {
  searchQuery.value = "";
  beneficiarySearchInput.value = "";
  selectedBeneficiaries.value = [];
  lcDateFrom.value = "";
  lcDateTo.value = "";
  entryDateFrom.value = "";
  entryDateTo.value = "";
  fetchLocalLcData(1);
};

function formatNumber(val: any): string {
  const num = Number(val || 0);
  return num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(val: any): string {
  if (!val) return "-";
  const str = String(val).trim();
  if (str.includes("T")) {
    return str.split("T")[0];
  }
  return str;
}

const changePage = (page: number) => {
  if (page < 1 || page > totalPages.value || page === currentPage.value) return;
  fetchLocalLcData(page);
};

// ExcelJS Export function
const exportToExcel = async () => {
  if (isSubscriptionExpired.value) {
    alert("Your subscription has expired. Excel export is disabled. You can continue viewing reports on screen. Please contact the Administrator to renew.");
    return;
  }
  if (totalRecords.value === 0) return;
  isExporting.value = true;

  try {
    // 1. Fetch all matching filtered records from backend
    const res = await axios.get("/api/bond/reports/local-lc", {
      params: {
        export: "true",
        search: searchQuery.value || undefined,
        beneficiary: getBeneficiaryParam(),
        lcDateFrom: lcDateFrom.value || undefined,
        lcDateTo: lcDateTo.value || undefined,
        entryDateFrom: entryDateFrom.value || undefined,
        entryDateTo: entryDateTo.value || undefined
      }
    });

    const exportRows: any[] = res.data?.data || [];
    if (exportRows.length === 0) {
      throw new Error("No data available to export.");
    }

    // 2. Create ExcelJS Workbook and Sheet
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Jupiter";
    workbook.created = new Date();

    const isAllData = activeTab.value === "all_data";
    const sheet = workbook.addWorksheet(isAllData ? "Local LC Report" : "Beneficiary Report", {
      views: [{ showGridLines: true }]
    });

    // 3. Define Columns
    if (isAllData) {
      sheet.columns = [
        { header: "#", key: "sl", width: 6 },
        { header: "BANK_NAME", key: "bankName", width: 25 },
        { header: "BRANCH_NAME", key: "branchName", width: 20 },
        { header: "ADS_CODE", key: "adsCode", width: 14 },
        { header: "LC_YEAR", key: "lcYear", width: 12 },
        { header: "LC_NATURE", key: "lcNature", width: 14 },
        { header: "LC_SERIAL", key: "lcSerial", width: 14 },
        { header: "LC ID", key: "lcId", width: 20 },
        { header: "LC_VALUE", key: "lcValue", width: 18 },
        { header: "CURRENCY", key: "currency", width: 12 },
        { header: "LC_DATE", key: "lcDate", width: 14 },
        { header: "LC_EXPIRY_DATE", key: "lcExpiryDate", width: 16 },
        { header: "BB_USANSE_PERIOD", key: "bbUsansePeriod", width: 18 },
        { header: "LAST_SHIP_DATE", key: "lastShipDate", width: 16 },
        { header: "PROCEEDS_DATE", key: "proceedsDate", width: 16 },
        { header: "APPLICANT_NAME", key: "applicantName", width: 26 },
        { header: "IRC", key: "irc", width: 14 },
        { header: "EXPORTER_INFO", key: "exporterInfo", width: 28 },
        { header: "EXPORT_LC_NUMBER", key: "exportLcNumber", width: 20 },
        { header: "BENEFICIARY_BANK", key: "beneficiaryBank", width: 24 },
        { header: "BENEFICIARY_BRANCH", key: "beneficiaryBranch", width: 20 },
        { header: "BENEFICIARY_NAME", key: "beneficiaryName", width: 28 },
        { header: "BENEFICIARY_ADDRESS", key: "beneficiaryAddress", width: 34 },
        { header: "BENEFICIARY_IRC", key: "beneficiaryIrc", width: 16 },
        { header: "BENEFICIARY_ERC", key: "beneficiaryErc", width: 16 },
        { header: "PI_NUMBER", key: "piNumber", width: 18 },
        { header: "PI_DATE", key: "piDate", width: 14 },
        { header: "BOND_LICENSE", key: "bondLicense", width: 18 },
        { header: "ACCEPTED", key: "accepted", width: 14 },
        { header: "CANCEL_YN", key: "cancelYn", width: 12 },
        { header: "CANCEL_CAUSE", key: "cancelCause", width: 20 },
        { header: "ENTRY_DATE", key: "entryDate", width: 14 }
      ];
    } else {
      sheet.columns = [
        { header: "#", key: "sl", width: 6 },
        { header: "BENEFICIARY_NAME", key: "beneficiaryName", width: 28 },
        { header: "BENEFICIARY_ADDRESS", key: "beneficiaryAddress", width: 34 },
        { header: "BANK_NAME", key: "bankName", width: 28 },
        { header: "BRANCH_NAME", key: "branchName", width: 24 },
        { header: "LC ID", key: "lcId", width: 20 },
        { header: "LC_VALUE", key: "lcValue", width: 18 },
        { header: "LC_DATE", key: "lcDate", width: 14 },
        { header: "LC_EXPIRY_DATE", key: "lcExpiryDate", width: 16 },
        { header: "EXPORTER_INFO", key: "exporterInfo", width: 30 },
        { header: "BENEFICIARY_BANK", key: "beneficiaryBank", width: 28 },
        { header: "ENTRY_DATE", key: "entryDate", width: 14 }
      ];
    }

    // 4. Style Header Row
    const headerRow = sheet.getRow(1);
    headerRow.height = 28;
    const valueColIdx = isAllData ? 9 : 7; // LC_VALUE column index
    headerRow.eachCell((cell, colNumber) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: isAllData ? "581C87" : "1E293B" }
      };
      cell.font = {
        name: "Calibri",
        size: 11,
        bold: true,
        color: { argb: "FFFFFF" }
      };
      cell.alignment = {
        vertical: "middle",
        horizontal: colNumber === valueColIdx ? "right" : colNumber === 1 ? "center" : "left",
        wrapText: false
      };
      cell.border = {
        top: { style: "thin", color: { argb: "334155" } },
        left: { style: "thin", color: { argb: "334155" } },
        bottom: { style: "medium", color: { argb: "475569" } },
        right: { style: "thin", color: { argb: "334155" } }
      };
    });

    // 5. Populate Data Rows
    let sumValue = 0;
    exportRows.forEach((item, index) => {
      const valNum = Number(item.lcValue || 0);
      sumValue += valNum;

      const row = isAllData
        ? sheet.addRow({
            sl: index + 1,
            bankName: item.bankName || "",
            branchName: item.branchName || "",
            adsCode: item.adsCode || "",
            lcYear: item.lcYear || "",
            lcNature: item.lcNature || "",
            lcSerial: item.lcSerial || "",
            lcId: item.lcId || "",
            lcValue: valNum,
            currency: item.currency || "USD",
            lcDate: formatDate(item.lcDate),
            lcExpiryDate: formatDate(item.lcExpiryDate),
            bbUsansePeriod: item.bbUsansePeriod || "",
            lastShipDate: formatDate(item.lastShipDate),
            proceedsDate: formatDate(item.proceedsDate),
            applicantName: item.applicantName || "",
            irc: item.irc || "",
            exporterInfo: item.exporterInfo || "",
            exportLcNumber: item.exportLcNumber || "",
            beneficiaryBank: item.beneficiaryBank || "",
            beneficiaryBranch: item.beneficiaryBranch || "",
            beneficiaryName: item.beneficiaryName || "",
            beneficiaryAddress: item.beneficiaryAddress || "",
            beneficiaryIrc: item.beneficiaryIrc || "",
            beneficiaryErc: item.beneficiaryErc || "",
            piNumber: item.piNumber || "",
            piDate: formatDate(item.piDate),
            bondLicense: item.bondLicense || "",
            accepted: item.accepted || "",
            cancelYn: item.cancelYn || "N",
            cancelCause: item.cancelCause || "",
            entryDate: formatDate(item.entryDate)
          })
        : sheet.addRow({
            sl: index + 1,
            beneficiaryName: item.beneficiaryName || "",
            beneficiaryAddress: item.beneficiaryAddress || "",
            bankName: item.bankName || "",
            branchName: item.branchName || "",
            lcId: item.lcId || "",
            lcValue: valNum,
            lcDate: formatDate(item.lcDate),
            lcExpiryDate: formatDate(item.lcExpiryDate),
            exporterInfo: item.exporterInfo || "",
            beneficiaryBank: item.beneficiaryBank || "",
            entryDate: formatDate(item.entryDate)
          });

      row.height = 20;

      row.eachCell((cell, colNumber) => {
        cell.font = { name: "Calibri", size: 10 };
        cell.alignment = {
          vertical: "middle",
          horizontal: colNumber === valueColIdx ? "right" : colNumber === 1 ? "center" : "left"
        };
        cell.border = {
          top: { style: "thin", color: { argb: "E2E8F0" } },
          left: { style: "thin", color: { argb: "E2E8F0" } },
          bottom: { style: "thin", color: { argb: "E2E8F0" } },
          right: { style: "thin", color: { argb: "E2E8F0" } }
        };

        if (colNumber === valueColIdx) {
          cell.numFmt = "#,##0.00";
        }
      });
    });

    // 6. Add Total Summary Row
    const totalData: any = { sl: "", lcValue: sumValue };
    if (isAllData) {
      totalData.bankName = "Total";
    } else {
      totalData.beneficiaryName = "Total";
    }
    const totalRow = sheet.addRow(totalData);

    totalRow.height = 24;
    totalRow.eachCell((cell, colNumber) => {
      cell.font = { name: "Calibri", size: 11, bold: true };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "F1F5F9" }
      };
      cell.alignment = {
        vertical: "middle",
        horizontal: colNumber === valueColIdx ? "right" : "left"
      };
      cell.border = {
        top: { style: "medium", color: { argb: "475569" } },
        left: { style: "thin", color: { argb: "CBD5E1" } },
        bottom: { style: "double", color: { argb: "0F172A" } },
        right: { style: "thin", color: { argb: "CBD5E1" } }
      };
      if (colNumber === valueColIdx) {
        cell.numFmt = "#,##0.00";
      }
    });

    // 7. Write to buffer & trigger download
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    const todayStr = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = isAllData ? `Local_LC_Report_${todayStr}.xlsx` : `Beneficiary_Report_${todayStr}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  } catch (err: any) {
    alert(err.message || "Failed to export Excel.");
  } finally {
    isExporting.value = false;
  }
};

// 3. Monthwise Summary State
const mwRecords = ref<any[]>([]);
const mwIsLoading = ref(false);
const mwIsExporting = ref(false);
const mwYearFilter = ref("");
const mwMonthFrom = ref("");
const mwMonthTo = ref("");

// Interactive Count Mode State (true = Unique / Default, false = Regular)
const isLcUnique = ref(true);
const isBenUnique = ref(true);
const isBankUnique = ref(true);

const mwSummary = ref<{
  totalMonths: number;
  totalRecords: number;
  totalLc: number;
  totalBeneficiary: number;
  totalBank: number;
  totalLcRegular?: number;
  totalBeneficiaryRegular?: number;
  totalBankRegular?: number;
  totalLcUnique?: number;
  totalBeneficiaryUnique?: number;
  totalBankUnique?: number;
}>({
  totalMonths: 0,
  totalRecords: 0,
  totalLc: 0,
  totalBeneficiary: 0,
  totalBank: 0
});

const displaySummaryTotalLc = computed(() => {
  return isLcUnique.value
    ? (mwSummary.value.totalLcUnique ?? mwSummary.value.totalLc ?? 0)
    : (mwSummary.value.totalLcRegular ?? mwSummary.value.totalLc ?? 0);
});

const displaySummaryTotalBen = computed(() => {
  return isBenUnique.value
    ? (mwSummary.value.totalBeneficiaryUnique ?? mwSummary.value.totalBeneficiary ?? 0)
    : (mwSummary.value.totalBeneficiaryRegular ?? mwSummary.value.totalBeneficiary ?? 0);
});

const displaySummaryTotalBank = computed(() => {
  return isBankUnique.value
    ? (mwSummary.value.totalBankUnique ?? mwSummary.value.totalBank ?? 0)
    : (mwSummary.value.totalBankRegular ?? mwSummary.value.totalBank ?? 0);
});

// Monthwise Selection & Deletion State
const selectedMonthKeys = ref<string[]>([]);
const isDeleting = ref(false);
const showDeleteModal = ref(false);
const deleteTargetMonths = ref<{ key: string; label: string; records: number }[]>([]);
const deleteSuccessMsg = ref<string | null>(null);

const isAllMonthsSelected = computed(() => {
  return mwRecords.value.length > 0 && selectedMonthKeys.value.length === mwRecords.value.length;
});

const isSomeMonthsSelected = computed(() => {
  return selectedMonthKeys.value.length > 0 && selectedMonthKeys.value.length < mwRecords.value.length;
});

const selectedRecordsCount = computed(() => {
  return selectedMonthKeys.value.reduce((acc, k) => {
    const found = mwRecords.value.find((r) => r.monthKey === k);
    return acc + (found ? Number(found.totalRecords || 0) : 0);
  }, 0);
});

const toggleSelectAllMonths = () => {
  if (isAllMonthsSelected.value) {
    selectedMonthKeys.value = [];
  } else {
    selectedMonthKeys.value = mwRecords.value.map((r) => r.monthKey);
  }
};

const toggleSelectMonth = (key: string) => {
  const idx = selectedMonthKeys.value.indexOf(key);
  if (idx > -1) {
    selectedMonthKeys.value.splice(idx, 1);
  } else {
    selectedMonthKeys.value.push(key);
  }
};

const confirmDeleteSingle = (row: any) => {
  deleteTargetMonths.value = [
    { key: row.monthKey, label: row.monthLabel || row.monthKey, records: Number(row.totalRecords || 0) }
  ];
  showDeleteModal.value = true;
};

const confirmBatchDelete = () => {
  if (selectedMonthKeys.value.length === 0) return;
  deleteTargetMonths.value = selectedMonthKeys.value.map((k) => {
    const found = mwRecords.value.find((r) => r.monthKey === k);
    return { key: k, label: found?.monthLabel || k, records: Number(found?.totalRecords || 0) };
  });
  showDeleteModal.value = true;
};

const executeDelete = async () => {
  if (deleteTargetMonths.value.length === 0) return;
  isDeleting.value = true;
  try {
    const monthsToDelete = deleteTargetMonths.value.map((m) => m.key);
    const res = await axios.post("/api/bond/reports/monthwise/delete", {
      months: monthsToDelete
    });

    if (res.data && res.data.success) {
      deleteSuccessMsg.value = `Successfully deleted records for ${monthsToDelete.length} month(s).`;
      setTimeout(() => {
        deleteSuccessMsg.value = null;
      }, 4000);
      selectedMonthKeys.value = selectedMonthKeys.value.filter((k) => !monthsToDelete.includes(k));
      showDeleteModal.value = false;
      await fetchMonthwiseData();
    }
  } catch (err: any) {
    alert(err.response?.data?.message || err.message || "Failed to delete records.");
  } finally {
    isDeleting.value = false;
  }
};

const mwAvailableYears = computed(() => {
  const years: string[] = [];
  const currentYear = new Date().getFullYear();
  for (let y = currentYear + 1; y >= 2020; y--) {
    years.push(String(y));
  }
  return years;
});

const fetchMonthwiseData = async () => {
  mwIsLoading.value = true;
  try {
    const res = await axios.get("/api/bond/reports/monthwise", {
      params: {
        year: mwYearFilter.value || undefined,
        monthFrom: mwMonthFrom.value || undefined,
        monthTo: mwMonthTo.value || undefined
      }
    });

    if (res.data && res.data.success) {
      mwRecords.value = res.data.data || [];
      mwSummary.value = res.data.summary || {
        totalMonths: mwRecords.value.length,
        totalRecords: 0,
        totalLc: 0,
        totalBeneficiary: 0,
        totalBank: 0
      };
      // Filter out any selected keys that no longer exist
      const currentKeys = mwRecords.value.map((r) => r.monthKey);
      selectedMonthKeys.value = selectedMonthKeys.value.filter((k) => currentKeys.includes(k));
    }
  } catch (err: any) {
    console.error("Failed to load Monthwise summary:", err);
  } finally {
    mwIsLoading.value = false;
  }
};

const handleMwFilterChange = () => {
  fetchMonthwiseData();
};

const clearMwMonthRange = () => {
  mwMonthFrom.value = "";
  mwMonthTo.value = "";
  fetchMonthwiseData();
};

const resetMwFilters = () => {
  mwYearFilter.value = "";
  mwMonthFrom.value = "";
  mwMonthTo.value = "";
  selectedMonthKeys.value = [];
  fetchMonthwiseData();
};

const exportMwToExcel = async () => {
  if (mwRecords.value.length === 0) return;
  mwIsExporting.value = true;

  try {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Bond Data Analysis V2";
    const sheet = workbook.addWorksheet("Monthwise Summary", {
      views: [{ showGridLines: true }]
    });

    // Title Header Block
    sheet.mergeCells("A1:F1");
    const titleCell = sheet.getCell("A1");
    titleCell.value = mwYearFilter.value ? `Monthwise LC Summary Report (${mwYearFilter.value})` : "Monthwise LC Summary Report";
    titleCell.font = { name: "Calibri", size: 14, bold: true, color: { argb: "FFFFFF" } };
    titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "0F172A" } };
    titleCell.alignment = { vertical: "middle", horizontal: "center" };
    sheet.getRow(1).height = 30;

    sheet.addRow([]);

    // Table Columns: #, Month, Total Records, Total LC, Total Beneficiary, Total Bank
    const headerLc = isLcUnique.value ? "Total LC (Unique)" : "Total LC";
    const headerBen = isBenUnique.value ? "Total Beneficiary (Unique)" : "Total Beneficiary";
    const headerBank = isBankUnique.value ? "Total Bank (Unique)" : "Total Bank";

    sheet.columns = [
      { header: "#", key: "sl", width: 8 },
      { header: "Month", key: "month", width: 22 },
      { header: "Total Records", key: "totalRecords", width: 18 },
      { header: headerLc, key: "totalLc", width: 22 },
      { header: headerBen, key: "totalBeneficiary", width: 24 },
      { header: headerBank, key: "totalBank", width: 20 }
    ];

    const headerRow = sheet.getRow(3);
    headerRow.height = 24;
    headerRow.eachCell((cell) => {
      cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "1E293B" } };
      cell.alignment = { vertical: "middle", horizontal: "center" };
    });

    mwRecords.value.forEach((item, index) => {
      const lcVal = Number((isLcUnique.value ? item.totalLcUnique : (item.totalLcRegular ?? item.totalLc)) || 0);
      const benVal = Number((isBenUnique.value ? item.totalBeneficiaryUnique : (item.totalBeneficiaryRegular ?? item.totalBeneficiary)) || 0);
      const bankVal = Number((isBankUnique.value ? item.totalBankUnique : (item.totalBankRegular ?? item.totalBank)) || 0);

      const row = sheet.addRow({
        sl: index + 1,
        month: item.monthLabel || item.monthKey,
        totalRecords: Number(item.totalRecords || 0),
        totalLc: lcVal,
        totalBeneficiary: benVal,
        totalBank: bankVal
      });
      row.height = 20;
      row.eachCell((cell, colNumber) => {
        cell.font = { name: "Calibri", size: 10 };
        cell.alignment = {
          vertical: "middle",
          horizontal: colNumber === 1 ? "center" : colNumber === 2 ? "left" : "right"
        };
        cell.border = {
          top: { style: "thin", color: { argb: "E2E8F0" } },
          left: { style: "thin", color: { argb: "E2E8F0" } },
          bottom: { style: "thin", color: { argb: "E2E8F0" } },
          right: { style: "thin", color: { argb: "E2E8F0" } }
        };
        if (colNumber >= 3) {
          cell.numFmt = "#,##0";
        }
      });
    });

    // Total Row
    const totalRow = sheet.addRow({
      sl: "",
      month: "Total",
      totalRecords: mwSummary.value.totalRecords,
      totalLc: displaySummaryTotalLc.value,
      totalBeneficiary: displaySummaryTotalBen.value,
      totalBank: displaySummaryTotalBank.value
    });
    totalRow.height = 24;
    totalRow.eachCell((cell, colNumber) => {
      cell.font = { name: "Calibri", size: 11, bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "F1F5F9" } };
      cell.alignment = {
        vertical: "middle",
        horizontal: colNumber === 1 ? "center" : colNumber === 2 ? "left" : "right"
      };
      cell.border = {
        top: { style: "medium", color: { argb: "475569" } },
        left: { style: "thin", color: { argb: "CBD5E1" } },
        bottom: { style: "double", color: { argb: "0F172A" } },
        right: { style: "thin", color: { argb: "CBD5E1" } }
      };
      if (colNumber >= 3) {
        cell.numFmt = "#,##0";
      }
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    const todayStr = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `Monthwise_Summary_${todayStr}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  } catch (err: any) {
    alert(err.message || "Failed to export Excel.");
  } finally {
    mwIsExporting.value = false;
  }
};

const setActiveTab = (tab: TabType) => {
  activeTab.value = tab;
  if ((tab === "local_lc" || tab === "all_data") && records.value.length === 0) {
    fetchLocalLcData(1);
  } else if (tab === "monthwise" && mwRecords.value.length === 0) {
    fetchMonthwiseData();
  }
};

onMounted(() => {
  fetchBeneficiaries();
  fetchLocalLcData(1);
});
</script>

<template>
  <div class="reports-page pt-1 pb-3">
    <!-- Centered Tabs (Beneficiary Report, Local LC Report, Monthwise Summary) -->
    <div class="d-flex align-items-center justify-content-center mb-2">
      <div class="reports-tabs-wrapper">
        <ul class="nav nav-tabs reports-tabs border-0" role="tablist">
          <!-- Tab 1: Beneficiary Report (Blue/Cyan Theme) -->
          <li class="nav-item" role="presentation">
            <button
              type="button"
              class="nav-link report-tab-btn tab-local-lc"
              :class="{ active: activeTab === 'local_lc' }"
              @click="setActiveTab('local_lc')"
            >
              <i class="bi bi-file-earmark-text me-2 tab-icon-blue"></i>
              <span>Beneficiary Report</span>
            </button>
          </li>

          <!-- Tab 3: Local LC Report (Purple/Indigo Theme) -->
          <li class="nav-item" role="presentation">
            <button
              type="button"
              class="nav-link report-tab-btn tab-all-data"
              :class="{ active: activeTab === 'all_data' }"
              @click="setActiveTab('all_data')"
            >
              <i class="bi bi-table me-2 tab-icon-purple"></i>
              <span>Local LC Report</span>
            </button>
          </li>

          <!-- Tab 4: Monthwise Summary (Amber/Gold Theme) -->
          <li class="nav-item" role="presentation">
            <button
              type="button"
              class="nav-link report-tab-btn tab-monthwise"
              :class="{ active: activeTab === 'monthwise' }"
              @click="setActiveTab('monthwise')"
            >
              <i class="bi bi-calendar3 me-2 tab-icon-amber"></i>
              <span>Monthwise Summary</span>
            </button>
          </li>
        </ul>
      </div>
    </div>

    <!-- Horizontal Divider Line Under Tabs -->
    <div class="tabs-divider mb-3"></div>

    <!-- Tab Content Area -->
    <div class="tab-content">
      <!-- Beneficiary Report & Local LC Report Content (shared filters) -->
      <div v-if="activeTab === 'local_lc' || activeTab === 'all_data'" class="local-lc-tab-pane">
        <!-- Filter Bar: 4-Column Layout (LC Date Range | Entry Date Range | Beneficiary & Search | Reset & Excel) -->
        <div class="filter-bar mb-3">
          <div class="row g-2 align-items-stretch">
            <!-- 1. LC Date Range -->
            <div class="col-12 col-md-6 col-lg-3">
              <div class="filter-column-box p-2 rounded">
                <div class="d-flex justify-content-between align-items-center mb-1">
                  <span class="filter-label mb-0">
                    <i class="bi bi-calendar-check text-info"></i>
                    <span>LC Date Range</span>
                  </span>
                  <button
                    v-if="lcDateFrom || lcDateTo"
                    type="button"
                    class="btn-clear-date"
                    @click="clearLcDate"
                  >
                    Clear
                  </button>
                </div>
                <div class="d-flex align-items-center gap-1">
                  <input
                    v-model="lcDateFrom"
                    type="date"
                    class="form-control form-control-sm filter-date-input"
                    title="LC Start Date"
                    @change="handleFilterChange"
                  />
                  <span class="text-muted small px-1">to</span>
                  <input
                    v-model="lcDateTo"
                    type="date"
                    class="form-control form-control-sm filter-date-input"
                    :min="lcDateFrom || undefined"
                    title="LC End Date"
                    @change="handleFilterChange"
                  />
                </div>
              </div>
            </div>

            <!-- 2. Entry Date Range -->
            <div class="col-12 col-md-6 col-lg-3">
              <div class="filter-column-box p-2 rounded">
                <div class="d-flex justify-content-between align-items-center mb-1">
                  <span class="filter-label mb-0">
                    <i class="bi bi-clock-history text-info"></i>
                    <span>Entry Date Range</span>
                  </span>
                  <button
                    v-if="entryDateFrom || entryDateTo"
                    type="button"
                    class="btn-clear-date"
                    @click="clearEntryDate"
                  >
                    Clear
                  </button>
                </div>
                <div class="d-flex align-items-center gap-1">
                  <input
                    v-model="entryDateFrom"
                    type="date"
                    class="form-control form-control-sm filter-date-input"
                    title="Entry Start Date"
                    @change="handleFilterChange"
                  />
                  <span class="text-muted small px-1">to</span>
                  <input
                    v-model="entryDateTo"
                    type="date"
                    class="form-control form-control-sm filter-date-input"
                    :min="entryDateFrom || undefined"
                    title="Entry End Date"
                    @change="handleFilterChange"
                  />
                </div>
              </div>
            </div>

            <!-- 3. Beneficiary Name (Top) & Search (Bottom) -->
            <div class="col-12 col-md-6 col-lg">
              <div class="d-flex flex-column justify-content-between h-100 gap-1">
                <!-- Direct Beneficiary Input with Live Search & Dropdown Checkmark Toggle -->
                <div class="position-relative w-100">
                  <div class="input-group input-group-sm">
                    <span class="input-group-text filter-addon" title="Beneficiary Filter">
                      <i class="bi bi-person-badge"></i>
                    </span>
                    <input
                      v-model="beneficiarySearchInput"
                      type="text"
                      class="form-control form-control-sm filter-input"
                      :placeholder="beneficiaryPlaceholder"
                      autocomplete="off"
                      @focus="handleBeneficiaryFocus"
                      @input="handleBeneficiaryInput"
                      @blur="handleBeneficiaryBlur"
                      @keydown.esc="showBeneficiaryDropdown = false"
                    />
                    <button
                      v-if="selectedBeneficiaries.length > 0 || beneficiarySearchInput"
                      type="button"
                      class="btn filter-clear-btn"
                      title="Clear Beneficiary Filter"
                      @click="clearAllBeneficiaries"
                    >
                      <i class="bi bi-x"></i>
                    </button>
                  </div>

                  <!-- Autocomplete Dropdown with Clean Checkmarks (No Box Border, No Inner Search) -->
                  <div
                    v-if="showBeneficiaryDropdown && localBeneficiarySuggestions.length > 0"
                    class="beneficiary-autocomplete-dropdown shadow-lg"
                  >
                    <div
                      v-for="(name, bIdx) in localBeneficiarySuggestions"
                      :key="bIdx"
                      class="ben-dropdown-item d-flex align-items-center gap-2 px-3 py-2 cursor-pointer"
                      :class="{ 'is-selected': isBeneficiarySelected(name) }"
                      @mousedown.prevent="toggleBeneficiary(name)"
                    >
                      <div class="ben-check-slot flex-shrink-0 d-flex align-items-center justify-content-center">
                        <i v-if="isBeneficiarySelected(name)" class="bi bi-check2 text-white fs-6 fw-bold"></i>
                      </div>
                      <span class="ben-item-name text-white small text-truncate">{{ name }}</span>
                    </div>
                  </div>
                </div>

                <!-- Search Input -->
                <div class="input-group input-group-sm">
                  <span class="input-group-text filter-addon" title="Search">
                    <i class="bi bi-search"></i>
                  </span>
                  <input
                    v-model="searchQuery"
                    type="text"
                    class="form-control form-control-sm filter-input"
                    placeholder="Search"
                    @input="handleSearchInput"
                  />
                  <button
                    v-if="searchQuery"
                    type="button"
                    class="btn filter-clear-btn"
                    title="Clear Search"
                    @click="clearSearch"
                  >
                    <i class="bi bi-x"></i>
                  </button>
                </div>
              </div>
            </div>

            <!-- 4. Reset Button (Top) & Excel Button (Bottom) -->
            <div class="col-auto">
              <div class="d-flex flex-column justify-content-between h-100 gap-1">
                <!-- Reset Button -->
                <button
                  type="button"
                  class="btn-reset-filter justify-content-center"
                  title="Clear all filters"
                  @click="resetFilters"
                >
                  <i class="bi bi-arrow-counterclockwise"></i>
                  <span>Reset</span>
                </button>

                <!-- Excel Export Button -->
                <button
                  type="button"
                  class="btn-export-excel justify-content-center"
                  :disabled="isExporting || totalRecords === 0"
                  title="Download formatted Excel file"
                  @click="exportToExcel"
                >
                  <span v-if="isExporting" class="spinner-border spinner-border-sm"></span>
                  <i v-else class="bi bi-file-earmark-excel"></i>
                  <span>{{ isExporting ? 'Exporting...' : 'Excel' }}</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Error Alert -->
        <div v-if="error" class="alert alert-danger p-2 mb-2 small" role="alert">
          <i class="bi bi-exclamation-triangle-fill me-2"></i>
          {{ error }}
        </div>

        <!-- 11-Column Local LC Table Card Container -->
        <div class="table-card-wrapper p-2.5 shadow-sm rounded">
          <div class="jupiter-table-container position-relative">
            <!-- Loading Spinner Overlay -->
            <div v-if="isLoading" class="table-loading-overlay d-flex align-items-center justify-content-center">
              <div class="spinner-border text-info spinner-border-sm me-2" role="status"></div>
              <span class="small text-muted font-monospace">Loading records...</span>
            </div>

            <!-- Tab 1: Curated Beneficiary Report Table (11 Columns) -->
            <table v-if="activeTab === 'local_lc'" class="table jupiter-report-table mb-0 align-middle text-nowrap">
              <thead>
                <tr>
                  <th class="ps-3 text-center" style="width: 45px;">#</th>
                  <th>BENEFICIARY_NAME</th>
                  <th>BENEFICIARY_ADDRESS</th>
                  <th>BANK_NAME</th>
                  <th>BRANCH_NAME</th>
                  <th>LC ID</th>
                  <th class="text-end">LC_VALUE</th>
                  <th>LC_DATE</th>
                  <th>LC_EXPIRY_DATE</th>
                  <th>EXPORTER_INFO</th>
                  <th>BENEFICIARY_BANK</th>
                  <th class="pe-3">ENTRY_DATE</th>
                </tr>
              </thead>
              <tbody>
                <!-- Empty state -->
                <tr v-if="!isLoading && records.length === 0">
                  <td colspan="12" class="text-center py-5 text-muted">
                    <i class="bi bi-inbox display-6 d-block mb-2 text-muted opacity-50"></i>
                    No Beneficiary records matched your search / filters.
                  </td>
                </tr>

                <!-- Data Rows -->
                <tr v-for="(row, idx) in records" :key="row.id || idx">
                  <td class="ps-3 text-center cell-num">
                    {{ (currentPage - 1) * pageSize + idx + 1 }}
                  </td>
                  <td style="max-width: 180px;" class="text-truncate cell-main fw-medium" :title="row.beneficiaryName || ''">
                    {{ row.beneficiaryName || '-' }}
                  </td>
                  <td style="max-width: 200px;" class="text-truncate cell-muted" :title="row.beneficiaryAddress || ''">
                    {{ row.beneficiaryAddress || '-' }}
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
                  <td class="pe-3 cell-muted font-monospace">{{ formatDate(row.entryDate) }}</td>
                </tr>
              </tbody>
            </table>

            <!-- Tab 3: Complete All Data Report Table (All 31 Columns) -->
            <table v-else-if="activeTab === 'all_data'" class="table jupiter-report-table mb-0 align-middle text-nowrap">
              <thead>
                <tr>
                  <th class="ps-3 text-center" style="width: 45px;">#</th>
                  <th>BANK_NAME</th>
                  <th>BRANCH_NAME</th>
                  <th>ADS_CODE</th>
                  <th>LC_YEAR</th>
                  <th>LC_NATURE</th>
                  <th>LC_SERIAL</th>
                  <th>LC ID</th>
                  <th class="text-end">LC_VALUE</th>
                  <th>CURRENCY</th>
                  <th>LC_DATE</th>
                  <th>LC_EXPIRY_DATE</th>
                  <th>BB_USANSE_PERIOD</th>
                  <th>LAST_SHIP_DATE</th>
                  <th>PROCEEDS_DATE</th>
                  <th>APPLICANT_NAME</th>
                  <th>IRC</th>
                  <th>EXPORTER_INFO</th>
                  <th>EXPORT_LC_NUMBER</th>
                  <th>BENEFICIARY_BANK</th>
                  <th>BENEFICIARY_BRANCH</th>
                  <th>BENEFICIARY_NAME</th>
                  <th>BENEFICIARY_ADDRESS</th>
                  <th>BENEFICIARY_IRC</th>
                  <th>BENEFICIARY_ERC</th>
                  <th>PI_NUMBER</th>
                  <th>PI_DATE</th>
                  <th>BOND_LICENSE</th>
                  <th>ACCEPTED</th>
                  <th>CANCEL_YN</th>
                  <th>CANCEL_CAUSE</th>
                  <th class="pe-3">ENTRY_DATE</th>
                </tr>
              </thead>
              <tbody>
                <!-- Empty state -->
                <tr v-if="!isLoading && records.length === 0">
                  <td colspan="32" class="text-center py-5 text-muted">
                    <i class="bi bi-inbox display-6 d-block mb-2 text-muted opacity-50"></i>
                    No LC records matched your search / filters.
                  </td>
                </tr>

                <!-- Data Rows -->
                <tr v-for="(row, idx) in records" :key="row.id || idx">
                  <td class="ps-3 text-center cell-num">{{ (currentPage - 1) * pageSize + idx + 1 }}</td>
                  <td class="cell-main">{{ row.bankName || '-' }}</td>
                  <td class="cell-muted">{{ row.branchName || '-' }}</td>
                  <td class="cell-muted font-monospace">{{ row.adsCode || '-' }}</td>
                  <td class="cell-muted">{{ row.lcYear || '-' }}</td>
                  <td class="cell-muted">{{ row.lcNature || '-' }}</td>
                  <td class="cell-muted font-monospace">{{ row.lcSerial || '-' }}</td>
                  <td class="cell-lc-id font-monospace">{{ row.lcId || '-' }}</td>
                  <td class="text-end cell-val font-monospace">{{ formatNumber(row.lcValue) }}</td>
                  <td class="cell-muted">{{ row.currency || 'USD' }}</td>
                  <td class="cell-muted font-monospace">{{ formatDate(row.lcDate) }}</td>
                  <td class="cell-muted font-monospace">{{ formatDate(row.lcExpiryDate) }}</td>
                  <td class="cell-muted">{{ row.bbUsansePeriod || '-' }}</td>
                  <td class="cell-muted font-monospace">{{ formatDate(row.lastShipDate) }}</td>
                  <td class="cell-muted font-monospace">{{ formatDate(row.proceedsDate) }}</td>
                  <td class="cell-muted" style="max-width: 180px;" :title="row.applicantName || ''">{{ row.applicantName || '-' }}</td>
                  <td class="cell-muted font-monospace">{{ row.irc || '-' }}</td>
                  <td class="cell-muted text-truncate" style="max-width: 180px;" :title="row.exporterInfo || ''">{{ row.exporterInfo || '-' }}</td>
                  <td class="cell-muted font-monospace">{{ row.exportLcNumber || '-' }}</td>
                  <td class="cell-muted">{{ row.beneficiaryBank || '-' }}</td>
                  <td class="cell-muted">{{ row.beneficiaryBranch || '-' }}</td>
                  <td class="cell-main fw-medium text-truncate" style="max-width: 180px;" :title="row.beneficiaryName || ''">{{ row.beneficiaryName || '-' }}</td>
                  <td class="cell-muted text-truncate" style="max-width: 200px;" :title="row.beneficiaryAddress || ''">{{ row.beneficiaryAddress || '-' }}</td>
                  <td class="cell-muted font-monospace">{{ row.beneficiaryIrc || '-' }}</td>
                  <td class="cell-muted font-monospace">{{ row.beneficiaryErc || '-' }}</td>
                  <td class="cell-muted font-monospace">{{ row.piNumber || '-' }}</td>
                  <td class="cell-muted font-monospace">{{ formatDate(row.piDate) }}</td>
                  <td class="cell-muted font-monospace">{{ row.bondLicense || '-' }}</td>
                  <td class="cell-muted">{{ row.accepted || '-' }}</td>
                  <td class="cell-muted text-center font-monospace">{{ row.cancelYn || 'N' }}</td>
                  <td class="cell-muted">{{ row.cancelCause || '-' }}</td>
                  <td class="pe-3 cell-muted font-monospace">{{ formatDate(row.entryDate) }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- 10-per-page Pagination Footer -->
          <div class="d-flex align-items-center justify-content-between flex-wrap gap-3 mt-2 pt-2 border-top-subtle">
            <div class="pagination-info text-muted small">
              Showing
              <span class="text-light fw-medium">
                {{ totalRecords === 0 ? 0 : (currentPage - 1) * pageSize + 1 }}
              </span>
              to
              <span class="text-light fw-medium">
                {{ Math.min(currentPage * pageSize, totalRecords) }}
              </span>
              of
              <span class="text-light fw-medium">{{ totalRecords.toLocaleString() }}</span>
              entries
            </div>

            <!-- Page Buttons -->
            <div class="pagination-controls d-flex align-items-center gap-1">
              <!-- First Page -->
              <button
                type="button"
                class="btn-page"
                :disabled="currentPage <= 1 || isLoading"
                title="First Page"
                @click="changePage(1)"
              >
                <i class="bi bi-chevron-double-left"></i>
              </button>

              <!-- Previous Page -->
              <button
                type="button"
                class="btn-page"
                :disabled="currentPage <= 1 || isLoading"
                title="Previous Page"
                @click="changePage(currentPage - 1)"
              >
                <i class="bi bi-chevron-left"></i>
              </button>

              <!-- Current / Total Page Badge -->
              <span class="page-indicator mx-2">
                Page <strong class="text-white">{{ currentPage }}</strong> of <strong class="text-white">{{ totalPages }}</strong>
              </span>

              <!-- Next Page -->
              <button
                type="button"
                class="btn-page"
                :disabled="currentPage >= totalPages || isLoading"
                title="Next Page"
                @click="changePage(currentPage + 1)"
              >
                <i class="bi bi-chevron-right"></i>
              </button>

              <!-- Last Page -->
              <button
                type="button"
                class="btn-page"
                :disabled="currentPage >= totalPages || isLoading"
                title="Last Page"
                @click="changePage(totalPages)"
              >
                <i class="bi bi-chevron-double-right"></i>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- 3. Monthwise Summary Content -->
      <div v-if="activeTab === 'monthwise'" class="monthwise-tab-pane">
        <!-- Filter Bar: 2 Compact Filters + Reset & Excel (Centered to match top tabs) -->
        <div class="filter-bar mb-3">
          <div class="d-flex flex-wrap justify-content-center align-items-stretch gap-2">
            <!-- 1. Year Filter -->
            <div class="filter-column-box p-2 rounded" style="min-width: 170px; max-width: 200px;">
              <span class="filter-label mb-1 px-0.5">
                <i class="bi bi-calendar-event text-warning"></i>
                <span>Year Filter</span>
              </span>
              <select
                v-model="mwYearFilter"
                class="form-select form-select-sm filter-input"
                @change="handleMwFilterChange"
              >
                <option value="">All Years</option>
                <option v-for="y in mwAvailableYears" :key="y" :value="y">{{ y }}</option>
              </select>
            </div>

            <!-- 2. Month to Month Range Filter -->
            <div class="filter-column-box p-2 rounded" style="min-width: 290px; max-width: 340px;">
              <div class="d-flex justify-content-between align-items-center mb-1 px-0.5">
                <span class="filter-label mb-0">
                  <i class="bi bi-calendar-range text-warning"></i>
                  <span>Month to Month Range</span>
                </span>
                <button
                  v-if="mwMonthFrom || mwMonthTo"
                  type="button"
                  class="btn-clear-date"
                  @click="clearMwMonthRange"
                >
                  Clear
                </button>
              </div>
              <div class="d-flex align-items-center gap-1.5">
                <input
                  v-model="mwMonthFrom"
                  type="month"
                  class="form-control form-control-sm filter-date-input"
                  title="Start Month"
                  @change="handleMwFilterChange"
                />
                <span class="text-muted small px-1">to</span>
                <input
                  v-model="mwMonthTo"
                  type="month"
                  class="form-control form-control-sm filter-date-input"
                  :min="mwMonthFrom || undefined"
                  title="End Month"
                  @change="handleMwFilterChange"
                />
              </div>
            </div>

            <!-- 3. Reset Button (Top) & Excel Button (Bottom) -->
            <div class="d-flex flex-column justify-content-between gap-1">
              <button
                type="button"
                class="btn-reset-filter justify-content-center"
                title="Clear all filters"
                @click="resetMwFilters"
              >
                <i class="bi bi-arrow-counterclockwise"></i>
                <span>Reset</span>
              </button>

              <button
                type="button"
                class="btn-export-excel justify-content-center"
                :disabled="mwIsExporting || mwRecords.length === 0"
                title="Download Monthwise Summary Excel file"
                @click="exportMwToExcel"
              >
                <span v-if="mwIsExporting" class="spinner-border spinner-border-sm"></span>
                <i v-else class="bi bi-file-earmark-excel"></i>
                <span>{{ mwIsExporting ? 'Exporting...' : 'Excel' }}</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Success Alert upon Deletion -->
        <div v-if="deleteSuccessMsg" class="alert alert-success p-2 mb-2 small d-flex align-items-center gap-2" role="alert">
          <i class="bi bi-check-circle-fill fs-5"></i>
          <span>{{ deleteSuccessMsg }}</span>
        </div>

        <!-- Batch Action Bar when Months Selected -->
        <div v-if="selectedMonthKeys.length > 0" class="batch-action-bar d-flex align-items-center justify-content-between p-2 px-3 rounded mb-2.5 shadow-sm">
          <div class="d-flex align-items-center gap-2">
            <i class="bi bi-check2-circle text-warning fs-5"></i>
            <span class="text-white small fw-medium">
              <strong class="text-warning">{{ selectedMonthKeys.length }}</strong> month(s) selected
              <span class="text-muted ms-1">({{ selectedRecordsCount.toLocaleString() }} total records)</span>
            </span>
          </div>
          <div class="d-flex align-items-center gap-2">
            <button type="button" class="btn btn-outline-secondary btn-sm py-1 px-2.5" @click="selectedMonthKeys = []">
              Deselect All
            </button>
            <button type="button" class="btn btn-danger btn-sm py-1 px-3 d-inline-flex align-items-center gap-1.5 shadow-sm" @click="confirmBatchDelete">
              <i class="bi bi-trash3-fill"></i>
              <span>Batch Delete</span>
            </button>
          </div>
        </div>

        <!-- 5-Column Monthwise Table Card Container -->
        <div class="table-card-wrapper p-2.5 shadow-sm rounded">
          <div class="position-relative jupiter-table-container">
            <!-- Loading overlay -->
            <div
              v-if="mwIsLoading"
              class="table-loading-overlay d-flex flex-column align-items-center justify-content-center"
            >
              <div class="spinner-border text-info mb-2" role="status">
                <span class="visually-hidden">Loading...</span>
              </div>
              <span class="text-info fw-medium" style="font-size: 0.85rem;">Loading Monthwise Data...</span>
            </div>

            <table class="jupiter-report-table">
              <thead>
                <tr>
                  <th class="ps-3 text-center" style="width: 44px;">
                    <input
                      type="checkbox"
                      class="form-check-input table-chk"
                      :checked="isAllMonthsSelected"
                      :indeterminate="isSomeMonthsSelected"
                      title="Select all months"
                      @change="toggleSelectAllMonths"
                    />
                  </th>
                  <th class="text-center" style="width: 48px;">#</th>
                  <th style="width: 20%;">Month</th>
                  <th class="text-end" style="width: 15%;">Total Records</th>
                  <th class="text-end" style="width: 16%;">
                    <div class="d-inline-flex align-items-center justify-content-end w-100">
                      <span>Total LC</span>
                      <button
                        type="button"
                        class="btn-icon-toggle ms-2"
                        :class="{ active: isLcUnique }"
                        :title="isLcUnique ? 'Unique Count (Click to switch to Regular Count)' : 'Regular Count (Click to switch to Unique Count)'"
                        @click.stop="isLcUnique = !isLcUnique"
                      >
                        <i :class="isLcUnique ? 'bi bi-fingerprint text-info fs-6' : 'bi bi-list-ol text-secondary opacity-50 fs-6'"></i>
                      </button>
                    </div>
                  </th>
                  <th class="text-end" style="width: 19%;">
                    <div class="d-inline-flex align-items-center justify-content-end w-100">
                      <span>Total Beneficiary</span>
                      <button
                        type="button"
                        class="btn-icon-toggle ms-2"
                        :class="{ active: isBenUnique }"
                        :title="isBenUnique ? 'Unique Count (Click to switch to Regular Count)' : 'Regular Count (Click to switch to Unique Count)'"
                        @click.stop="isBenUnique = !isBenUnique"
                      >
                        <i :class="isBenUnique ? 'bi bi-fingerprint text-info fs-6' : 'bi bi-list-ol text-secondary opacity-50 fs-6'"></i>
                      </button>
                    </div>
                  </th>
                  <th class="text-end" style="width: 15%;">
                    <div class="d-inline-flex align-items-center justify-content-end w-100">
                      <span>Total Bank</span>
                      <button
                        type="button"
                        class="btn-icon-toggle ms-2"
                        :class="{ active: isBankUnique }"
                        :title="isBankUnique ? 'Unique Count (Click to switch to Regular Count)' : 'Regular Count (Click to switch to Unique Count)'"
                        @click.stop="isBankUnique = !isBankUnique"
                      >
                        <i :class="isBankUnique ? 'bi bi-fingerprint text-info fs-6' : 'bi bi-list-ol text-secondary opacity-50 fs-6'"></i>
                      </button>
                    </div>
                  </th>
                  <th class="pe-3 text-center" style="width: 75px;">Action</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="mwRecords.length === 0 && !mwIsLoading">
                  <td colspan="8" class="text-center py-5 text-muted">
                    <i class="bi bi-inbox display-6 d-block mb-2 text-secondary opacity-50"></i>
                    <span>No monthwise summary data found.</span>
                  </td>
                </tr>

                <tr
                  v-for="(row, idx) in mwRecords"
                  :key="row.monthKey || idx"
                  :class="{ 'row-selected': selectedMonthKeys.includes(row.monthKey) }"
                >
                  <td class="ps-3 text-center">
                    <input
                      type="checkbox"
                      class="form-check-input table-chk"
                      :checked="selectedMonthKeys.includes(row.monthKey)"
                      @change="toggleSelectMonth(row.monthKey)"
                    />
                  </td>
                  <td class="text-center cell-num">{{ idx + 1 }}</td>
                  <td class="cell-main fw-medium font-monospace">
                    <i class="bi bi-calendar3 me-2 text-warning opacity-75"></i>
                    {{ row.monthLabel || row.monthKey }}
                  </td>
                  <td class="text-end cell-main font-monospace fw-semibold text-white">
                    {{ Number(row.totalRecords || 0).toLocaleString() }}
                  </td>
                  <td class="text-end cell-lc-id font-monospace fw-bold">
                    {{ Number((isLcUnique ? row.totalLcUnique : (row.totalLcRegular ?? row.totalLc)) || 0).toLocaleString() }}
                  </td>
                  <td class="text-end cell-main font-monospace fw-semibold text-info">
                    {{ Number((isBenUnique ? row.totalBeneficiaryUnique : (row.totalBeneficiaryRegular ?? row.totalBeneficiary)) || 0).toLocaleString() }}
                  </td>
                  <td class="text-end cell-val font-monospace fw-bold">
                    {{ Number((isBankUnique ? row.totalBankUnique : (row.totalBankRegular ?? row.totalBank)) || 0).toLocaleString() }}
                  </td>
                  <td class="pe-3 text-center">
                    <button
                      type="button"
                      class="btn-row-delete"
                      title="Delete this month's records"
                      @click="confirmDeleteSingle(row)"
                    >
                      <i class="bi bi-trash3"></i>
                    </button>
                  </td>
                </tr>
              </tbody>
              <!-- Grand Total Footer Row -->
              <tfoot v-if="mwRecords.length > 0">
                <tr class="table-total-row">
                  <td class="ps-3 text-center text-muted">—</td>
                  <td class="text-center fw-bold text-muted">—</td>
                  <td class="cell-main fw-bold text-white">
                    <i class="bi bi-calculator me-2 text-warning"></i>
                    Total
                  </td>
                  <td class="text-end text-white font-monospace fw-bold fs-6">
                    {{ mwSummary.totalRecords.toLocaleString() }}
                  </td>
                  <td class="text-end cell-lc-id font-monospace fw-bold fs-6">
                    {{ displaySummaryTotalLc.toLocaleString() }}
                  </td>
                  <td class="text-end text-info font-monospace fw-bold fs-6">
                    {{ displaySummaryTotalBen.toLocaleString() }}
                  </td>
                  <td class="text-end cell-val font-monospace fw-bold fs-6">
                    {{ displaySummaryTotalBank.toLocaleString() }}
                  </td>
                  <td class="pe-3 text-center text-muted">—</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal for Delete Confirmation -->
    <div v-if="showDeleteModal" class="custom-modal-backdrop d-flex align-items-center justify-content-center" @click.self="showDeleteModal = false">
      <div class="custom-modal-card shadow-2xl">
        <div class="modal-header-danger d-flex align-items-center gap-2.5 p-3">
          <div class="modal-icon-wrap rounded-circle p-2">
            <i class="bi bi-exclamation-triangle-fill text-danger fs-4"></i>
          </div>
          <div>
            <h5 class="modal-title text-white mb-0 fs-6 fw-bold">Confirm Monthwise Data Deletion</h5>
            <span class="text-muted small">Permanent Database Deletion</span>
          </div>
        </div>

        <div class="modal-body-custom p-3">
          <p class="text-light mb-2 small">
            Are you sure you want to permanently delete records for the following <strong>{{ deleteTargetMonths.length }}</strong> month(s)?
          </p>

          <div class="month-delete-list p-2 rounded mb-3 border border-secondary">
            <div
              v-for="m in deleteTargetMonths"
              :key="m.key"
              class="d-flex justify-content-between align-items-center py-1 px-1 border-bottom border-secondary-subtle"
            >
              <span class="text-warning small fw-medium">
                <i class="bi bi-calendar3 me-1.5 text-warning opacity-75"></i>{{ m.label }}
              </span>
              <span class="badge bg-secondary bg-opacity-50 text-light font-monospace">
                {{ m.records.toLocaleString() }} Records
              </span>
            </div>
          </div>

          <div class="alert alert-danger p-2 mb-0 small d-flex align-items-center gap-2">
            <i class="bi bi-exclamation-octagon-fill fs-5 text-danger"></i>
            <span>
              Total <strong>{{ deleteTargetMonths.reduce((a, b) => a + b.records, 0).toLocaleString() }}</strong> LC records will be permanently removed. This action cannot be undone.
            </span>
          </div>
        </div>

        <div class="modal-footer-custom d-flex justify-content-end gap-2 p-3 border-top border-secondary">
          <button
            type="button"
            class="btn btn-secondary btn-sm px-3"
            :disabled="isDeleting"
            @click="showDeleteModal = false"
          >
            Cancel
          </button>
          <button
            type="button"
            class="btn btn-danger btn-sm px-3 d-inline-flex align-items-center gap-1.5"
            :disabled="isDeleting"
            @click="executeDelete"
          >
            <span v-if="isDeleting" class="spinner-border spinner-border-sm"></span>
            <i v-else class="bi bi-trash3-fill"></i>
            <span>{{ isDeleting ? 'Deleting...' : 'Yes, Delete Permanently' }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.reports-page {
  width: 100%;
}

.border-bottom-subtle {
  border-bottom: 1px solid #1e293b;
}

.tabs-divider {
  border-bottom: 1px solid #1e293b;
  width: 100%;
}

/* Compact Sleek Tabs Styling */
/* Distinct Multi-Color Tabs Styling */
.reports-tabs-wrapper {
  background: #0d131f;
  border: 1px solid #1e293b;
  border-radius: 8px;
  padding: 0.25rem;
}

.reports-tabs {
  display: flex;
  gap: 0.35rem;
}

.report-tab-btn {
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px !important;
  color: #94a3b8;
  font-size: 0.88rem;
  font-weight: 500;
  padding: 0.4rem 1.15rem;
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  height: 36px;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

/* 1. Local LC Report Tab (Cyan/Sky Blue Theme) */
.tab-local-lc .tab-icon-blue {
  color: #38bdf8;
  transition: transform 0.2s ease;
}

.tab-local-lc:hover {
  color: #e0f2fe;
  background: rgba(14, 165, 233, 0.08);
  border-color: rgba(14, 165, 233, 0.2);
}

.tab-local-lc.active {
  background: linear-gradient(135deg, rgba(14, 165, 233, 0.25) 0%, rgba(15, 23, 42, 0.95) 100%) !important;
  color: #38bdf8 !important;
  border-color: #0284c7 !important;
  box-shadow: 0 2px 10px rgba(14, 165, 233, 0.3);
}

.tab-local-lc.active .tab-icon-blue {
  transform: scale(1.1);
  color: #7dd3fc;
}

/* 2. Local LC Report Tab (Purple/Indigo Theme) */
.tab-all-data .tab-icon-purple {
  color: #c084fc;
  transition: transform 0.2s ease;
}

.tab-all-data:hover {
  color: #f3e8ff;
  background: rgba(168, 85, 247, 0.08);
  border-color: rgba(168, 85, 247, 0.2);
}

.tab-all-data.active {
  background: linear-gradient(135deg, rgba(168, 85, 247, 0.25) 0%, rgba(15, 23, 42, 0.95) 100%) !important;
  color: #c084fc !important;
  border-color: #9333ea !important;
  box-shadow: 0 2px 10px rgba(168, 85, 247, 0.3);
}

.tab-all-data.active .tab-icon-purple {
  transform: scale(1.1);
  color: #e9d5ff;
}

/* 4. Monthwise Summary Tab (Amber/Gold Theme) */
.tab-monthwise .tab-icon-amber {
  color: #fbbf24;
  transition: transform 0.2s ease;
}

.tab-monthwise:hover {
  color: #fef3c7;
  background: rgba(245, 158, 11, 0.08);
  border-color: rgba(245, 158, 11, 0.2);
}

.tab-monthwise.active {
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.25) 0%, rgba(15, 23, 42, 0.95) 100%) !important;
  color: #fbbf24 !important;
  border-color: #d97706 !important;
  box-shadow: 0 2px 10px rgba(245, 158, 11, 0.3);
}

.tab-monthwise.active .tab-icon-amber {
  transform: scale(1.1);
  color: #fde68a;
}

.tab-page-title {
  color: #cbd5e1;
  font-size: 0.95rem;
  font-weight: 500;
}

.table-card-wrapper {
  background: #131926;
  border: 1px solid #1e293b;
  border-radius: 8px;
}

/* Tab Content Cards */
.tab-pane-card {
  background: #131926;
  border: 1px solid #1e293b;
  border-radius: 8px;
  padding: 0.85rem 1.1rem !important;
}

.tab-card-title {
  color: #cbd5e1;
  font-size: 0.95rem;
  font-weight: 500;
}

.badge-total-records {
  background: rgba(148, 163, 184, 0.08);
  border: 1px solid #1e293b;
  border-radius: 5px;
  padding: 0.25rem 0.65rem;
  font-size: 0.82rem;
  color: #94a3b8;
}

/* Clean Frameless Filter Bar */
.filter-bar {
  background: transparent;
  border: none;
}

.filter-label {
  color: #94a3b8;
  font-size: 0.82rem;
  font-weight: 500;
  margin-bottom: 0.35rem;
  display: inline-flex;
  align-items: center;
}

.filter-label i {
  display: inline-block;
  font-size: 0.95rem;
  line-height: 1;
  margin-right: 0.45rem !important;
  flex-shrink: 0;
}

.filter-column-box {
  background: #101623;
  border: 1px solid #1e293b;
  border-radius: 6px;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.btn-clear-date {
  background: transparent;
  border: none;
  color: #f87171;
  font-size: 0.75rem;
  font-weight: 500;
  cursor: pointer;
  padding: 0 0.2rem;
  transition: color 0.15s ease;
}

.btn-clear-date:hover {
  color: #ef4444;
  text-decoration: underline;
}

.filter-date-input {
  background: #131926 !important;
  border: 1px solid #283548 !important;
  color: #e2e8f0 !important;
  font-size: 0.8rem !important;
  height: 32px !important;
  min-width: 0 !important;
  width: 100% !important;
  flex: 1 1 0 !important;
  padding: 0.2rem 0.4rem !important;
}

.filter-date-input:focus {
  border-color: #38bdf8 !important;
  box-shadow: 0 0 0 1px rgba(56, 189, 248, 0.3) !important;
}

.filter-input {
  background: #131926 !important;
  border: 1px solid #283548 !important;
  color: #e2e8f0 !important;
  font-size: 0.84rem !important;
  height: 32px !important;
  min-width: 0 !important;
}

.filter-input:focus {
  border-color: #38bdf8 !important;
  box-shadow: 0 0 0 1px rgba(56, 189, 248, 0.3) !important;
}

.filter-addon {
  background: #101623 !important;
  border: 1px solid #283548 !important;
  border-right: none !important;
  color: #7dd3fc !important;
  height: 32px !important;
  padding: 0 0.55rem !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
}

.filter-clear-btn {
  background: #131926 !important;
  border: 1px solid #283548 !important;
  border-left: none !important;
  color: #94a3b8 !important;
  height: 32px !important;
  padding: 0 0.5rem !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
}

.filter-clear-btn:hover {
  color: #f87171 !important;
}

.btn-reset-filter {
  background: #1e293b;
  border: 1px solid #334155;
  color: #cbd5e1;
  font-size: 0.81rem;
  font-weight: 500;
  height: 32px;
  padding: 0 0.75rem;
  min-width: 84px;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-reset-filter:hover {
  background: #283548;
  color: #ffffff;
}

/* Export to Excel Button */
.btn-export-excel {
  background: #166534;
  border: 1px solid #22c55e;
  color: #f0fdf4;
  font-size: 0.81rem;
  font-weight: 500;
  height: 32px;
  padding: 0 0.75rem;
  min-width: 84px;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  transition: all 0.15s ease;
}

.btn-export-excel:hover:not(:disabled) {
  background: #15803d;
  color: #ffffff;
}

.btn-export-excel:disabled {
  background: #1e293b;
  border-color: #334155;
  color: #64748b;
  cursor: not-allowed;
  box-shadow: none;
}

/* Table Container & 11 Columns */
.jupiter-table-container {
  background: #111722;
  border: 1px solid #1e293b;
  border-radius: 6px;
  overflow: auto;
}

.table-loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(17, 23, 34, 0.82);
  z-index: 10;
  backdrop-filter: blur(2px);
}

.jupiter-report-table {
  width: 100%;
  font-size: 0.86rem;
  color: #e2e8f0;
  border-collapse: collapse;
  background: #111722;
}

.jupiter-report-table thead th {
  background: #161e2c;
  color: #94a3b8;
  font-weight: 600;
  font-size: 0.82rem;
  letter-spacing: 0.02em;
  padding: 0.65rem 0.85rem;
  border-bottom: 1px solid #222e42;
  white-space: nowrap;
}

.jupiter-report-table tbody td {
  padding: 0.6rem 0.85rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  background: transparent;
  font-weight: 400;
  font-size: 0.86rem;
}

.jupiter-report-table tbody tr:hover td {
  background: rgba(148, 163, 184, 0.05);
}

.cell-num {
  color: #64748b;
  font-size: 0.84rem;
}

.cell-main {
  color: #e2e8f0;
  font-weight: 400;
}

.cell-muted {
  color: #94a3b8;
  font-weight: 400;
}

.cell-lc-id {
  color: #38bdf8;
  font-weight: 500;
}

.cell-val {
  color: #4ade80;
  font-weight: 600;
}

/* Pagination Controls */
.pagination-info {
  font-size: 0.85rem;
  color: #94a3b8;
}

.btn-page {
  background: #101623;
  border: 1px solid #1e293b;
  color: #cbd5e1;
  width: 32px;
  height: 32px;
  border-radius: 5px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-page:hover:not(:disabled) {
  background: #1e293b;
  border-color: #38bdf8;
  color: #38bdf8;
}

.btn-page:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.page-indicator {
  font-size: 0.85rem;
  color: #94a3b8;
}

.badge-tag {
  background: rgba(56, 189, 248, 0.1);
  color: #7dd3fc;
  border: 1px solid rgba(56, 189, 248, 0.2);
  border-radius: 4px;
  font-size: 0.72rem;
  font-weight: 500;
  padding: 0.2rem 0.55rem;
}

.tab-placeholder-body {
  border: 1px dashed #1e293b;
  border-radius: 6px;
  background: rgba(16, 22, 35, 0.5);
  margin-top: 1rem;
}

/* Interactive Unique/Regular count toggle icon button in Monthwise header */
.btn-icon-toggle {
  background: transparent;
  border: none;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  line-height: 1;
  transition: all 0.15s ease;
}

.btn-icon-toggle:hover i {
  color: #38bdf8 !important;
  opacity: 1 !important;
  transform: scale(1.18);
}

.btn-icon-toggle.active i {
  color: #38bdf8 !important;
  opacity: 1 !important;
  filter: drop-shadow(0 0 5px rgba(56, 189, 248, 0.6));
}

/* Custom Beneficiary Autocomplete Menu */
.beneficiary-autocomplete-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: #0f1624;
  border: 1px solid #283548;
  border-radius: 6px;
  max-height: 250px;
  overflow-y: auto;
  z-index: 1050;
  margin-top: 2px;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.6);
  padding: 4px 0;
}

.ben-dropdown-item {
  transition: background 0.12s ease;
  padding: 0.45rem 0.75rem;
  border-radius: 4px;
  margin: 1px 4px;
  cursor: pointer;
  text-align: left;
}

.ben-dropdown-item:hover {
  background: rgba(255, 255, 255, 0.06);
}

.ben-dropdown-item.is-selected {
  background: #1b2533;
}

.ben-dropdown-item.is-selected:hover {
  background: #233042;
}

.ben-check-slot {
  width: 18px;
  height: 18px;
}

.ben-item-name {
  color: #f1f5f9;
  font-size: 0.83rem;
  font-weight: 500;
}

.chip-clear-all-btn {
  background: transparent;
  border: none;
  color: #f87171;
  font-size: 0.72rem;
  font-weight: 500;
  padding: 0.15rem 0.35rem;
  cursor: pointer;
  border-radius: 3px;
  transition: all 0.15s ease;
  text-decoration: underline;
}

.chip-clear-all-btn:hover {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.1);
}

.jupiter-report-table tfoot .table-total-row td {
  background: #151d2b !important;
  border-top: 1px solid #334155 !important;
  border-bottom: 2px solid #38bdf8 !important;
  padding: 0.75rem 0.85rem !important;
}

/* Monthwise Deletion & Batch Action Styles */
.batch-action-bar {
  background: rgba(30, 41, 59, 0.75);
  border: 1px solid rgba(245, 158, 11, 0.35);
  backdrop-filter: blur(8px);
}

.table-chk {
  cursor: pointer;
  width: 14px !important;
  height: 14px !important;
  min-width: 14px !important;
  max-width: 14px !important;
  background-color: #0b111c !important;
  border: 1px solid #475569 !important;
  border-radius: 0px !important;
  margin: 0 auto !important;
  display: block;
  flex-shrink: 0;
  appearance: none;
  -webkit-appearance: none;
  position: relative;
  transition: all 0.1s ease;
}

.table-chk:hover {
  border-color: #f59e0b !important;
}

.table-chk:checked {
  background-color: #f59e0b !important;
  border-color: #f59e0b !important;
}

.table-chk:checked::after {
  content: "";
  position: absolute;
  top: 1px;
  left: 4px;
  width: 4px;
  height: 8px;
  border: solid #090e17;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}

.table-chk:indeterminate {
  background-color: #f59e0b !important;
  border-color: #f59e0b !important;
}

.table-chk:indeterminate::after {
  content: "";
  position: absolute;
  top: 5px;
  left: 2px;
  width: 8px;
  height: 2px;
  background: #090e17;
}

.table-chk:focus {
  outline: none !important;
  box-shadow: 0 0 0 1px rgba(245, 158, 11, 0.4) !important;
}

.row-selected td {
  background: rgba(245, 158, 11, 0.08) !important;
}

.btn-row-delete {
  background: transparent;
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #f87171;
  width: 28px;
  height: 28px;
  border-radius: 5px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.82rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-row-delete:hover {
  background: rgba(239, 68, 68, 0.2);
  border-color: #ef4444;
  color: #ffffff;
}

/* Custom Modal Backdrop & Card */
.custom-modal-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(10, 15, 26, 0.78);
  backdrop-filter: blur(6px);
  z-index: 1100;
}

.custom-modal-card {
  background: #0f1624;
  border: 1px solid #334155;
  border-radius: 10px;
  width: 100%;
  max-width: 480px;
  box-shadow: 0 20px 45px -10px rgba(0, 0, 0, 0.8);
  overflow: hidden;
  animation: modalFadeIn 0.2s ease-out;
}

@keyframes modalFadeIn {
  from {
    opacity: 0;
    transform: scale(0.96) translateY(10px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.modal-header-danger {
  background: rgba(239, 68, 68, 0.08);
  border-bottom: 1px solid rgba(239, 68, 68, 0.2);
}

.modal-icon-wrap {
  width: 42px;
  height: 42px;
  background: rgba(239, 68, 68, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
}

.month-delete-list {
  background: #090e17;
  max-height: 180px;
  overflow-y: auto;
}
</style>
