<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import axios from "axios";

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();

const isDropdownOpen = ref(false);
const dropdownRef = ref<HTMLElement | null>(null);

const storageData = ref({
  sizeBytes: 0,
  sizePretty: "0 MB",
  sizeMb: "0 MB",
  sizeGb: "0.00 GB",
  sizeGbPrecise: "0.000 GB"
});

const fetchStorageSize = async () => {
  if (!authStore.isAuthenticated) return;
  try {
    const res = await axios.get("/api/bond/storage-size");
    if (res.data && res.data.success && res.data.data) {
      storageData.value = res.data.data;
    }
  } catch (_) {}
};

const handleClickOutside = (e: MouseEvent) => {
  if (dropdownRef.value && !dropdownRef.value.contains(e.target as Node)) {
    isDropdownOpen.value = false;
  }
};

watch(() => route.path, () => {
  fetchStorageSize();
});

onMounted(() => {
  document.addEventListener("click", handleClickOutside);
  fetchStorageSize();
});

onUnmounted(() => {
  document.removeEventListener("click", handleClickOutside);
});

const isAdmin = computed(() => {
  const roleName = String((authStore.user as any)?.role?.name || (authStore.user as any)?.role || "").toLowerCase();
  return roleName === "superadmin" || roleName === "admin";
});

const daysRemaining = computed(() => {
  const user = authStore.user as any;
  if (!user) return 0;
  if (isAdmin.value) return 9999;
  const expiry = user.subscriptionExpiresAt || user.parent?.subscriptionExpiresAt;
  if (expiry) {
    const diff = new Date(expiry).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }
  return Number(user.daysRemaining || 0);
});

const isSuperAdmin = computed(() => {
  const roleName = String((authStore.user as any)?.role?.name || (authStore.user as any)?.role || "").toLowerCase();
  return roleName === "superadmin";
});

// Database Backup & Restore state
const isDownloadingBackup = ref(false);
const isRestoringBackup = ref(false);
const showRestoreConfirmModal = ref(false);
const selectedSqlFile = ref<File | null>(null);
const sqlFileInputRef = ref<HTMLInputElement | null>(null);

const handleDownloadBackup = async () => {
  if (isDownloadingBackup.value) return;
  isDownloadingBackup.value = true;
  try {
    const token = localStorage.getItem("jupiter_access_token");
    const res = await axios.get("/api/bond/backup/download", {
      responseType: "blob",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined
    });

    const blob = new Blob([res.data], { type: "application/sql" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const nowStr = new Date().toISOString().replace(/[:.]/g, "-");
    link.setAttribute("download", `jupiter_backup_${nowStr}.sql`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  } catch (err: any) {
    console.error("Backup download error:", err);
    alert(err.response?.data?.message || "Failed to download database backup.");
  } finally {
    isDownloadingBackup.value = false;
  }
};

const triggerSqlFileInput = () => {
  if (sqlFileInputRef.value) {
    sqlFileInputRef.value.value = "";
    sqlFileInputRef.value.click();
  }
};

const handleSqlFileSelected = (e: Event) => {
  const target = e.target as HTMLInputElement;
  if (target.files && target.files[0]) {
    selectedSqlFile.value = target.files[0];
    showRestoreConfirmModal.value = true;
  }
};

const confirmRestoreBackup = async () => {
  if (!selectedSqlFile.value) return;
  isRestoringBackup.value = true;
  try {
    const formData = new FormData();
    formData.append("file", selectedSqlFile.value);
    const token = localStorage.getItem("jupiter_access_token");
    const res = await axios.post("/api/bond/backup/restore", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    });

    showRestoreConfirmModal.value = false;
    selectedSqlFile.value = null;
    alert(res.data?.message || "Database successfully restored from SQL backup file!");
    await fetchStorageSize();
    window.location.reload();
  } catch (err: any) {
    console.error("Restore error:", err);
    alert(err.response?.data?.message || "Failed to restore database from SQL backup file.");
  } finally {
    isRestoringBackup.value = false;
  }
};

const handleLogout = async () => {
  isDropdownOpen.value = false;
  await authStore.logout();
  router.push("/login");
};
</script>

<template>
  <header class="jupiter-navbar">
    <div class="jupiter-grid-container h-100 d-flex align-items-center justify-content-between px-3">
      <!-- Left: Brand Logo Only -->
      <div class="d-flex align-items-center" style="min-width: 140px;">
        <router-link :to="isAdmin ? '/users' : '/'" class="jupiter-brand d-flex align-items-center gap-2.5 text-decoration-none">
          <div class="brand-badge-icon">
            <svg width="24" height="24" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="jupGrad" x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stop-color="#fbbf24" />
                  <stop offset="45%" stop-color="#f43f5e" />
                  <stop offset="100%" stop-color="#6366f1" />
                </linearGradient>
                <linearGradient id="ringGrad" x1="2" y1="10" x2="30" y2="22" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.95" />
                  <stop offset="50%" stop-color="#c084fc" stop-opacity="0.85" />
                  <stop offset="100%" stop-color="#f43f5e" stop-opacity="0.95" />
                </linearGradient>
              </defs>
              <circle cx="16" cy="16" r="9.5" fill="url(#jupGrad)" />
              <path d="M7.2 13.8C10.5 12 21.5 12 24.8 13.8" stroke="rgba(255,255,255,0.35)" stroke-width="1.2" stroke-linecap="round" />
              <path d="M6.8 17C10.2 19 21.8 19 25.2 17" stroke="rgba(255,255,255,0.3)" stroke-width="1.2" stroke-linecap="round" />
              <circle cx="19.5" cy="17.8" r="1.4" fill="rgba(255,255,255,0.7)" />
              <ellipse cx="16" cy="16" rx="14" ry="5.2" stroke="url(#ringGrad)" stroke-width="1.8" transform="rotate(-22 16 16)" stroke-linecap="round" />
            </svg>
          </div>
          <div class="d-flex flex-column">
            <span class="fw-bold text-white fs-5 tracking-tight brand-title">Jupiter</span>
          </div>
        </router-link>
      </div>

      <!-- Center: Storage Size & Subscription Status Badges in CENTER -->
      <div class="d-flex align-items-center justify-content-center flex-grow-1 px-2 gap-2.5">
        <!-- DB Storage Used Badge -->
        <div v-if="authStore.isAuthenticated" class="d-flex align-items-center">
          <div
            class="storage-pill-badge font-monospace"
            :title="`Total Database Size: ${storageData.sizePretty} (${storageData.sizeGbPrecise || storageData.sizeGb})`"
          >
            <i class="bi bi-database-fill-gear badge-icon text-cyan"></i>
            <span class="badge-text">
              <span class="text-muted small me-1">DB:</span>
              <strong class="text-white">{{ storageData.sizeGb }}</strong>
            </span>
          </div>
        </div>

        <!-- SuperAdmin Database Backup & Restore Buttons -->
        <template v-if="isSuperAdmin">
          <!-- Download Backup Button -->
          <button
            type="button"
            class="btn-header-backup btn-backup-download font-monospace"
            :disabled="isDownloadingBackup"
            title="Download SQL Database Backup"
            @click="handleDownloadBackup"
          >
            <span v-if="isDownloadingBackup" class="spinner-border spinner-border-sm me-1" role="status"></span>
            <i v-else class="bi bi-download me-1"></i>
            <span>Backup</span>
          </button>

          <!-- Upload / Restore Backup Button -->
          <button
            type="button"
            class="btn-header-backup btn-backup-upload font-monospace"
            :disabled="isRestoringBackup"
            title="Upload and Restore Database from SQL Backup"
            @click="triggerSqlFileInput"
          >
            <span v-if="isRestoringBackup" class="spinner-border spinner-border-sm me-1" role="status"></span>
            <i v-else class="bi bi-upload me-1"></i>
            <span>Restore</span>
          </button>

          <!-- Hidden Native File Input for SQL -->
          <input
            ref="sqlFileInputRef"
            type="file"
            accept=".sql"
            class="d-none"
            @change="handleSqlFileSelected"
          />
        </template>

        <!-- Subscription Days Remaining Badge -->
        <div v-if="!isAdmin && authStore.isAuthenticated" class="d-flex align-items-center">
          <div
            :class="[
              'subscription-pill-badge font-monospace',
              daysRemaining > 5
                ? 'sub-pill-green'
                : daysRemaining > 0
                ? 'sub-pill-amber'
                : 'sub-pill-red'
            ]"
          >
            <i :class="daysRemaining > 0 ? 'bi bi-clock-history' : 'bi bi-exclamation-octagon-fill'" class="badge-icon"></i>
            <span class="badge-text">{{ daysRemaining > 1 ? `${daysRemaining} Days Left` : daysRemaining === 1 ? '1 Day Left' : 'Access Expired' }}</span>
          </div>
        </div>
      </div>

      <!-- Right: User Profile Dropdown -->
      <div class="d-flex align-items-center justify-content-end" style="min-width: 140px;">
        <div ref="dropdownRef" class="position-relative">
          <button
            type="button"
            class="user-profile-btn d-flex align-items-center gap-2"
            @click="isDropdownOpen = !isDropdownOpen"
            title="Account Menu"
          >
            <div class="user-avatar-circle">
              <i class="bi bi-person-fill"></i>
            </div>
            <span class="user-name-text d-none d-md-inline">{{ authStore.user?.name || 'User' }}</span>
            <i class="bi bi-chevron-down dropdown-chevron"></i>
          </button>

          <div
            v-if="isDropdownOpen"
            class="dropdown-menu show dropdown-menu-end position-absolute mt-2 user-dropdown-card"
            style="min-width: 240px; z-index: 1060; right: 0 !important; left: auto !important;"
          >
            <!-- User Info Header -->
            <div class="user-card-header px-3 py-2.5">
              <div class="user-card-name fw-bold text-white text-capitalize">
                {{ authStore.user?.name || 'User' }}
              </div>
              <div v-if="authStore.user?.email" class="user-card-email text-muted small text-truncate">
                {{ authStore.user.email }}
              </div>
              <div class="d-flex align-items-center gap-2 mt-2">
                <span :class="['user-role-badge', isAdmin ? 'role-admin' : (authStore.user as any)?.adminId || (authStore.user as any)?.role === 'operator' ? 'role-operator' : 'role-user']">
                  {{ (authStore.user as any)?.role?.name || (authStore.user as any)?.role || (isAdmin ? 'ADMIN' : (authStore.user as any)?.adminId ? 'OPERATOR' : 'USER') }}
                </span>
              </div>
            </div>

            <div class="user-card-divider"></div>

            <!-- Admin users link -->
            <router-link
              v-if="isAdmin"
              to="/users"
              class="dropdown-item user-card-item d-flex align-items-center gap-2 px-3 py-2"
              @click="isDropdownOpen = false"
            >
              <i class="bi bi-people-fill text-primary"></i>
              <span>User &amp; Billing</span>
            </router-link>

            <!-- Sign Out -->
            <button
              type="button"
              class="dropdown-item user-card-item text-danger d-flex align-items-center gap-2 px-3 py-2"
              @click="handleLogout"
            >
              <i class="bi bi-box-arrow-right"></i>
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Restore Confirmation Modal -->
    <div
      v-if="showRestoreConfirmModal && selectedSqlFile"
      class="custom-modal-backdrop d-flex align-items-center justify-content-center p-3"
      style="position: fixed; inset: 0; background: rgba(0, 0, 0, 0.75); z-index: 2000; backdrop-filter: blur(4px);"
    >
      <div class="custom-modal-card rounded shadow-lg overflow-hidden" style="background: #111827; border: 1px solid #374151; max-width: 460px; width: 100%;">
        <div class="p-3 d-flex align-items-center justify-content-between" style="background: rgba(168, 85, 247, 0.15); border-bottom: 1px solid rgba(168, 85, 247, 0.3);">
          <div class="d-flex align-items-center gap-2">
            <i class="bi bi-database-up fs-5 text-warning"></i>
            <h6 class="modal-title fw-bold text-white mb-0">Confirm Database Restore</h6>
          </div>
          <button type="button" class="btn-close btn-close-white" @click="showRestoreConfirmModal = false"></button>
        </div>

        <div class="p-3.5">
          <div class="p-3 rounded mb-3" style="background: #1f2937; border: 1px solid #374151;">
            <div class="text-white fw-semibold text-truncate mb-1">
              <i class="bi bi-filetype-sql text-info me-1"></i>
              {{ selectedSqlFile.name }}
            </div>
            <div class="text-muted small font-monospace">
              Size: {{ (selectedSqlFile.size / 1024).toFixed(1) }} KB
            </div>
          </div>

          <div class="alert alert-warning py-2 px-3 small font-monospace mb-0" style="background: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.3); color: #fbbf24;">
            <i class="bi bi-exclamation-triangle-fill me-1"></i>
            <strong>Warning:</strong> Restoring this SQL file will execute all statements and update/replace database tables and records.
          </div>
        </div>

        <div class="p-3 d-flex align-items-center justify-content-end gap-2" style="background: #0f172a; border-top: 1px solid #1f2937;">
          <button
            type="button"
            class="btn btn-secondary btn-sm"
            :disabled="isRestoringBackup"
            @click="showRestoreConfirmModal = false; selectedSqlFile = null;"
          >
            Cancel
          </button>
          <button
            type="button"
            class="btn btn-warning btn-sm fw-semibold"
            :disabled="isRestoringBackup"
            @click="confirmRestoreBackup"
          >
            <span v-if="isRestoringBackup" class="spinner-border spinner-border-sm me-1" role="status"></span>
            <i v-else class="bi bi-upload me-1"></i>
            <span>{{ isRestoringBackup ? 'Restoring SQL...' : 'Confirm Restore' }}</span>
          </button>
        </div>
      </div>
    </div>
  </header>
</template>

<style scoped>
.brand-badge-icon {
  width: 38px;
  height: 38px;
  background: linear-gradient(135deg, rgba(251, 191, 36, 0.15), rgba(99, 102, 241, 0.15));
  border: 1px solid rgba(251, 191, 36, 0.35);
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0 12px rgba(251, 191, 36, 0.2);
}

.brand-title {
  letter-spacing: -0.3px;
}

.storage-pill-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 5px 15px;
  border-radius: 9999px;
  background: rgba(14, 165, 233, 0.1);
  border: 1px solid rgba(56, 189, 248, 0.35);
  color: #38bdf8;
  font-size: 0.83rem;
  font-weight: 500;
  line-height: 1.2;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: default;
}

.storage-pill-badge:hover {
  background: rgba(14, 165, 233, 0.18);
  border-color: rgba(56, 189, 248, 0.55);
  box-shadow: 0 0 12px rgba(56, 189, 248, 0.25);
}

.btn-header-backup {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 5px 13px;
  border-radius: 9999px;
  font-size: 0.8rem;
  font-weight: 600;
  line-height: 1.2;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
  outline: none;
}

.btn-backup-download {
  background: rgba(16, 185, 129, 0.12);
  border: 1px solid rgba(16, 185, 129, 0.4);
  color: #34d399;
}

.btn-backup-download:hover:not(:disabled) {
  background: rgba(16, 185, 129, 0.24);
  border-color: rgba(52, 211, 153, 0.65);
  color: #6ee7b7;
  box-shadow: 0 0 12px rgba(16, 185, 129, 0.3);
  transform: translateY(-1px);
}

.btn-backup-upload {
  background: rgba(168, 85, 247, 0.12);
  border: 1px solid rgba(168, 85, 247, 0.4);
  color: #c084fc;
}

.btn-backup-upload:hover:not(:disabled) {
  background: rgba(168, 85, 247, 0.24);
  border-color: rgba(192, 132, 252, 0.65);
  color: #e9d5ff;
  box-shadow: 0 0 12px rgba(168, 85, 247, 0.3);
  transform: translateY(-1px);
}

.btn-header-backup:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.text-cyan {
  color: #38bdf8 !important;
}

.subscription-pill-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 6px 18px;
  border-radius: 9999px;
  border: 1px solid transparent;
  font-size: 0.84rem;
  font-weight: 600;
  line-height: 1.2;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
  transition: all 0.2s ease;
}

.badge-icon {
  font-size: 0.95rem;
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
}

.badge-text {
  display: inline-block;
  white-space: nowrap;
}

.sub-pill-green {
  background: rgba(34, 197, 94, 0.12);
  border-color: rgba(34, 197, 94, 0.4);
  color: #4ade80;
}

.sub-pill-amber {
  background: rgba(245, 158, 11, 0.12);
  border-color: rgba(245, 158, 11, 0.4);
  color: #fbbf24;
}

.sub-pill-red {
  background: rgba(239, 68, 68, 0.15);
  border-color: rgba(239, 68, 68, 0.4);
  color: #f87171;
}

.user-profile-btn {
  background: rgba(19, 25, 38, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 9999px;
  padding: 4px 12px 4px 5px;
  cursor: pointer;
  transition: all 0.2s ease;
  outline: none;
}

.user-profile-btn:hover {
  background: #1e293b;
  border-color: rgba(56, 189, 248, 0.35);
  box-shadow: 0 0 10px rgba(56, 189, 248, 0.15);
}

.user-avatar-circle {
  width: 28px;
  height: 28px;
  background: linear-gradient(135deg, rgba(56, 189, 248, 0.2), rgba(99, 102, 241, 0.2));
  border: 1px solid rgba(56, 189, 248, 0.35);
  color: #38bdf8;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.85rem;
}

.user-name-text {
  font-size: 0.85rem;
  font-weight: 500;
  color: #f1f5f9;
}

.dropdown-chevron {
  font-size: 0.72rem;
  color: #64748b;
  transition: transform 0.2s ease;
}

.user-profile-btn:hover .dropdown-chevron {
  color: #94a3b8;
}

.user-dropdown-card {
  background: #131926 !important;
  border: 1px solid #1e293b !important;
  border-radius: 12px !important;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.6), 0 0 1px 1px rgba(255, 255, 255, 0.05) !important;
  padding: 6px !important;
  overflow: hidden;
}

.user-card-header {
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.03);
}

.user-card-name {
  font-size: 0.92rem;
  color: #f8fafc;
  line-height: 1.3;
}

.user-card-email {
  font-size: 0.78rem;
  color: #94a3b8 !important;
  margin-top: 2px;
}

.user-card-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.08);
  margin: 6px 0;
}

.user-role-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
  border-radius: 6px;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.user-role-badge.role-user {
  background: rgba(56, 189, 248, 0.12);
  border: 1px solid rgba(56, 189, 248, 0.35);
  color: #38bdf8;
}

.user-role-badge.role-operator {
  background: rgba(14, 165, 233, 0.15);
  border: 1px solid rgba(14, 165, 233, 0.4);
  color: #38bdf8;
}

.user-role-badge.role-admin {
  background: rgba(245, 158, 11, 0.12);
  border: 1px solid rgba(245, 158, 11, 0.35);
  color: #fbbf24;
}

.user-card-item {
  color: #cbd5e1 !important;
  border-radius: 6px;
  font-size: 0.84rem;
  font-weight: 500;
  transition: all 0.15s ease-in-out;
}

.user-card-item:hover {
  background: rgba(255, 255, 255, 0.07) !important;
  color: #ffffff !important;
}

.user-card-item.text-danger:hover {
  background: rgba(239, 68, 68, 0.15) !important;
  color: #f87171 !important;
}
</style>
