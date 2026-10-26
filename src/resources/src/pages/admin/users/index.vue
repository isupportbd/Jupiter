<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import axios from "axios";
import { useAuthStore } from "@/stores/auth";

const authStore = useAuthStore();

interface UserItem {
  id: number;
  name: string;
  email: string;
  phone?: string | null;
  role: string;
  roleId?: number;
  adminId?: number | null;
  parentName?: string | null;
  parentEmail?: string | null;
  parentPhone?: string | null;
  operatorsCount?: number;
  status: "pending" | "active" | "suspended" | "rejected";
  isExpired: boolean;
  daysRemaining: number;
  billingCycleDays: number;
  subscriptionExpiresAt: string | null;
  approvedAt: string | null;
  approvedBy: number | null;
  createdAt: string;
  totalRecords: number;
}

const usersList = ref<UserItem[]>([]);
const isLoading = ref(false);
const searchQuery = ref("");
const statusFilter = ref<string>("all");
const summary = ref({
  total: 0,
  pendingCount: 0,
  activeCount: 0,
  expiredCount: 0,
  suspendedCount: 0
});

// Feedback toast
const toastMessage = ref<string | null>(null);
const toastType = ref<"success" | "danger">("success");
let toastTimeout: any = null;
const showToast = (msg: string, type: "success" | "danger" = "success") => {
  if (toastTimeout) clearTimeout(toastTimeout);
  toastMessage.value = msg;
  toastType.value = type;
  toastTimeout = setTimeout(() => {
    toastMessage.value = null;
    toastTimeout = null;
  }, 4000);
};

const isCurrentSuperAdmin = computed(() => {
  const user = authStore.user as any;
  const r = (user?.role?.name || user?.role || "").toLowerCase();
  return r === "superadmin";
});

const isCurrentAdmin = computed(() => {
  const user = authStore.user as any;
  const r = (user?.role?.name || user?.role || "").toLowerCase();
  return r === "admin" || r === "superadmin";
});

const currentUserId = computed(() => Number((authStore.user as any)?.id || 0));

// Modals
const showApproveModal = ref(false);
const showRenewModal = ref(false);
const showDeleteModal = ref(false);
const showRoleModal = ref(false);
const selectedUser = ref<UserItem | null>(null);
const selectedRole = ref<string>("user");
const selectedParentAdminId = ref<number | null>(null);
const approvalDays = ref<number>(30);
const renewDays = ref<number>(30);
const isProcessingAction = ref(false);

const potentialParents = computed(() => {
  return usersList.value.filter(
    (u) => u.role !== "superadmin" && u.role !== "operator" && u.id !== selectedUser.value?.id
  );
});

const openRoleModal = (u: UserItem) => {
  selectedUser.value = u;
  selectedRole.value = u.role?.toLowerCase() || "user";
  selectedParentAdminId.value = u.adminId || null;
  showRoleModal.value = true;
};

const confirmChangeRole = async () => {
  if (!selectedUser.value) return;
  isProcessingAction.value = true;
  try {
    const token = localStorage.getItem("jupiter_access_token");
    const res = await axios.post(
      `/api/auth/admin/users/${selectedUser.value.id}/role`,
      {
        role: selectedRole.value,
        adminId: selectedRole.value === "operator" ? selectedParentAdminId.value : null
      },
      { headers: token ? { Authorization: `Bearer ${token}` } : undefined }
    );
    if (res.data?.success) {
      showToast(res.data.message || "User role updated successfully!");
      showRoleModal.value = false;
      fetchUsers();
    }
  } catch (err: any) {
    showToast(err.response?.data?.message || "Failed to update role", "danger");
  } finally {
    isProcessingAction.value = false;
  }
};

const fetchUsers = async () => {
  isLoading.value = true;
  try {
    const token = localStorage.getItem("jupiter_access_token");
    const res = await axios.get("/api/auth/admin/users", {
      params: {
        search: searchQuery.value.trim() || undefined,
        status: statusFilter.value !== "all" ? statusFilter.value : undefined
      },
      headers: token ? { Authorization: `Bearer ${token}` } : undefined
    });

    if (res.data?.success) {
      usersList.value = res.data.data || [];
      if (res.data.summary) {
        summary.value = res.data.summary;
      }
    }
  } catch (err: any) {
    showToast(err.response?.data?.message || "Failed to load users list", "danger");
  } finally {
    isLoading.value = false;
  }
};

const handleSearch = () => {
  fetchUsers();
};

const setFilter = (status: string) => {
  statusFilter.value = status;
  fetchUsers();
};

const canApproveUser = (u: UserItem) => {
  if (u.status !== "pending") return false;
  if (isCurrentSuperAdmin.value) {
    return u.role === "admin";
  }
  return u.role !== "admin" && u.role !== "superadmin";
};

// Approve Flow
const openApproveModal = (u: UserItem) => {
  selectedUser.value = u;
  approvalDays.value = u.role === "admin" ? 3650 : 30;
  showApproveModal.value = true;
};

const confirmApprove = async () => {
  if (!selectedUser.value) return;
  isProcessingAction.value = true;
  try {
    const token = localStorage.getItem("jupiter_access_token");
    const res = await axios.post(
      `/api/auth/admin/users/${selectedUser.value.id}/approve`,
      { days: approvalDays.value },
      { headers: token ? { Authorization: `Bearer ${token}` } : undefined }
    );
    if (res.data?.success) {
      showToast(res.data.message || "User approved successfully!");
      showApproveModal.value = false;
      fetchUsers();
    }
  } catch (err: any) {
    showToast(err.response?.data?.message || "Failed to approve user", "danger");
  } finally {
    isProcessingAction.value = false;
  }
};

// Renew Flow
const openRenewModal = (u: UserItem) => {
  selectedUser.value = u;
  renewDays.value = 30;
  showRenewModal.value = true;
};

const confirmRenew = async () => {
  if (!selectedUser.value) return;
  isProcessingAction.value = true;
  try {
    const token = localStorage.getItem("jupiter_access_token");
    const res = await axios.post(
      `/api/auth/admin/users/${selectedUser.value.id}/renew`,
      { days: renewDays.value },
      { headers: token ? { Authorization: `Bearer ${token}` } : undefined }
    );
    if (res.data?.success) {
      showToast(res.data.message || "Billing cycle renewed successfully!");
      showRenewModal.value = false;
      fetchUsers();
    }
  } catch (err: any) {
    showToast(err.response?.data?.message || "Failed to renew user billing", "danger");
  } finally {
    isProcessingAction.value = false;
  }
};

// Status Toggle
const toggleStatus = async (u: UserItem) => {
  const newStatus = u.status === "active" ? "suspended" : "active";
  try {
    const token = localStorage.getItem("jupiter_access_token");
    const res = await axios.post(
      `/api/auth/admin/users/${u.id}/status`,
      { status: newStatus },
      { headers: token ? { Authorization: `Bearer ${token}` } : undefined }
    );
    if (res.data?.success) {
      showToast(`User status changed to ${newStatus}`);
      fetchUsers();
    }
  } catch (err: any) {
    showToast(err.response?.data?.message || "Failed to update status", "danger");
  }
};

// Delete Flow
const openDeleteModal = (u: UserItem) => {
  selectedUser.value = u;
  showDeleteModal.value = true;
};

const confirmDelete = async () => {
  if (!selectedUser.value) return;
  isProcessingAction.value = true;
  try {
    const token = localStorage.getItem("jupiter_access_token");
    const res = await axios.delete(`/api/auth/admin/users/${selectedUser.value.id}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined
    });
    if (res.data?.success) {
      showToast(res.data.message || "User deleted permanently");
      showDeleteModal.value = false;
      fetchUsers();
    }
  } catch (err: any) {
    showToast(err.response?.data?.message || "Failed to delete user", "danger");
  } finally {
    isProcessingAction.value = false;
  }
};

// Phone Edit Flow
const showPhoneModal = ref(false);
const phoneInput = ref("");

const openPhoneModal = (u: UserItem) => {
  selectedUser.value = u;
  phoneInput.value = u.phone || "";
  showPhoneModal.value = true;
};

const confirmUpdatePhone = async () => {
  if (!selectedUser.value) return;
  isProcessingAction.value = true;
  try {
    const token = localStorage.getItem("jupiter_access_token");
    const res = await axios.post(
      `/api/auth/admin/users/${selectedUser.value.id}/phone`,
      { phone: phoneInput.value.trim() },
      { headers: token ? { Authorization: `Bearer ${token}` } : undefined }
    );
    if (res.data?.success) {
      showToast(res.data.message || "Phone number updated successfully");
      showPhoneModal.value = false;
      fetchUsers();
    }
  } catch (err: any) {
    showToast(err.response?.data?.message || "Failed to update phone number", "danger");
  } finally {
    isProcessingAction.value = false;
  }
};

function formatDate(val: string | null): string {
  if (!val) return "—";
  try {
    const d = new Date(val);
    return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return val;
  }
}

onMounted(() => {
  fetchUsers();
});
</script>

<template>
  <div class="users-admin-page">
    <!-- Toast Notification -->
    <div
      v-if="toastMessage"
      :class="['alert', toastType === 'success' ? 'toast-success' : 'toast-danger', 'custom-toast shadow-lg']"
    >
      <i :class="toastType === 'success' ? 'bi bi-check-circle-fill' : 'bi bi-exclamation-triangle-fill'"></i>
      <span>{{ toastMessage }}</span>
    </div>

    <!-- Page Header & Actions Bar -->
    <div class="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-3">
      <div>
        <h4 class="text-white fw-bold mb-0 d-flex align-items-center gap-2">
          <i class="bi bi-people-fill text-warning"></i> User Setup & 30-Day Billing
        </h4>
        <p class="text-muted small mb-0">Manage user registrations, 30-day billing cycle activations, and access controls.</p>
      </div>

      <button type="button" class="btn-refresh-users" @click="fetchUsers">
        <i class="bi bi-arrow-clockwise" :class="{ 'spin-icon': isLoading }"></i>
        <span>Refresh Users</span>
      </button>
    </div>

    <!-- Filter Tabs & Search Bar (Standalone, no card container) -->
    <div class="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-3">
      <!-- Status Filter Tabs -->
      <div class="d-flex flex-wrap align-items-center gap-2">
        <button
          type="button"
          :class="['filter-tab-pill', { active: statusFilter === 'all' }]"
          @click="setFilter('all')"
        >
          <span>All Users</span>
          <span class="tab-count">{{ summary.total }}</span>
        </button>

        <button
          type="button"
          :class="['filter-tab-pill pill-warning', { active: statusFilter === 'pending' }]"
          @click="setFilter('pending')"
        >
          <i class="bi bi-clock-history"></i>
          <span>Pending Approval</span>
          <span class="tab-count count-amber">{{ summary.pendingCount }}</span>
        </button>

        <button
          type="button"
          :class="['filter-tab-pill pill-success', { active: statusFilter === 'active' }]"
          @click="setFilter('active')"
        >
          <i class="bi bi-check2-circle"></i>
          <span>Active</span>
          <span class="tab-count count-green">{{ summary.activeCount }}</span>
        </button>

        <button
          type="button"
          :class="['filter-tab-pill pill-danger', { active: statusFilter === 'expired' }]"
          @click="setFilter('expired')"
        >
          <i class="bi bi-exclamation-octagon"></i>
          <span>Expired</span>
          <span class="tab-count count-red">{{ summary.expiredCount }}</span>
        </button>

        <button
          type="button"
          :class="['filter-tab-pill pill-muted', { active: statusFilter === 'suspended' }]"
          @click="setFilter('suspended')"
        >
          <span>Suspended</span>
          <span class="tab-count count-muted">{{ summary.suspendedCount }}</span>
        </button>
      </div>

      <!-- Search Input -->
      <div class="search-box-wrap">
        <i class="bi bi-search search-icon"></i>
        <input
          v-model="searchQuery"
          type="text"
          class="form-control form-control-sm search-input"
          placeholder="Search by name or email..."
          @input="handleSearch"
        />
        <button v-if="searchQuery" class="btn-clear-search" @click="searchQuery = ''; handleSearch()">
          <i class="bi bi-x"></i>
        </button>
      </div>
    </div>

    <!-- Users Table Card -->
    <div class="table-card-wrapper rounded shadow-sm">
      <div class="table-responsive position-relative">
        <!-- Loading Overlay -->
        <div v-if="isLoading" class="table-loading-overlay d-flex align-items-center justify-content-center">
          <div class="spinner-border text-info spinner-border-sm me-2"></div>
          <span class="text-muted small">Loading user directory...</span>
        </div>

        <table class="users-custom-table mb-0">
          <thead>
            <tr>
              <th class="ps-3 text-center" style="width: 48px;">#</th>
              <th style="min-width: 240px;">User Name & Email</th>
              <th class="text-center" style="width: 110px;">Role</th>
              <th class="text-center" style="width: 160px;">Status</th>
              <th style="min-width: 220px;">30-Day Billing Cycle</th>
              <th class="text-end" style="width: 120px;">Uploaded Records</th>
              <th style="width: 130px;">Registered</th>
              <th class="pe-3 text-end" style="width: 180px;">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="usersList.length === 0 && !isLoading">
              <td colspan="8" class="text-center py-5 text-muted">
                <i class="bi bi-people display-6 d-block mb-2 text-secondary opacity-40"></i>
                <span>No users found matching current filter.</span>
              </td>
            </tr>

            <tr
              v-for="(u, idx) in usersList"
              :key="u.id"
              :class="['table-row-item', { 'row-is-pending': u.status === 'pending' }]"
            >
              <!-- # -->
              <td class="ps-3 text-center cell-num font-monospace">{{ idx + 1 }}</td>

              <!-- User Info -->
              <td>
                <div class="user-info-wrap">
                  <div class="user-avatar-badge">
                    {{ u.name ? u.name.charAt(0).toUpperCase() : 'U' }}
                  </div>
                  <div class="d-flex flex-column">
                    <div class="user-name-text">{{ u.name }}</div>
                    <div class="user-email-text font-monospace">{{ u.email }}</div>
                    <div v-if="u.phone" class="text-warning small font-monospace mt-0.5" style="font-size: 0.72rem;">
                      <i class="bi bi-telephone-fill me-1"></i>{{ u.phone }}
                    </div>
                  </div>
                </div>
              </td>

              <!-- Role -->
              <td class="text-center">
                <span
                  v-if="u.role === 'superadmin' || u.role === 'admin'"
                  class="badge-role-admin"
                >
                  {{ u.role.toUpperCase() }}
                </span>
                <div
                  v-else-if="u.role === 'operator' || u.adminId"
                  class="d-flex flex-column align-items-center"
                >
                  <span class="badge-role-operator" :title="u.parentName ? `Under: ${u.parentName} (${u.parentEmail})` : 'Operator'">
                    <i class="bi bi-person-badge me-1"></i> OPERATOR
                  </span>
                  <span v-if="u.parentName" class="text-muted text-truncate font-monospace mt-1" style="font-size: 0.68rem; max-width: 120px;" :title="`Parent User: ${u.parentName} (${u.parentEmail})`">
                    ↳ {{ u.parentName }}
                  </span>
                </div>
                <div v-else class="d-flex flex-column align-items-center">
                  <span class="badge-role-user">
                    USER
                  </span>
                  <span v-if="u.operatorsCount && u.operatorsCount > 0" class="badge bg-secondary bg-opacity-25 text-info mt-1 font-monospace" style="font-size: 0.65rem;">
                    {{ u.operatorsCount }} operator{{ u.operatorsCount > 1 ? 's' : '' }}
                  </span>
                </div>
              </td>

              <!-- Status -->
              <td class="text-center">
                <span v-if="u.status === 'pending'" class="status-pill status-pending">
                  <i class="bi bi-hourglass-split me-1"></i>
                  <span>Pending</span>
                </span>
                <span v-else-if="u.isExpired && u.status === 'active'" class="status-pill status-expired">
                  <i class="bi bi-exclamation-octagon-fill me-1"></i>
                  <span>Expired</span>
                </span>
                <span v-else-if="u.status === 'active'" class="status-pill status-active">
                  <i class="bi bi-check-circle-fill me-1"></i>
                  <span>Active</span>
                </span>
                <span v-else class="status-pill status-suspended">
                  <i class="bi bi-pause-circle-fill me-1"></i>
                  <span>Suspended</span>
                </span>
              </td>

              <!-- 30-Day Billing Cycle -->
              <td>
                <div v-if="u.role === 'superadmin'" class="d-flex align-items-center text-info small font-monospace">
                  <i class="bi bi-infinity fs-6 me-2"></i>
                  <span>Unlimited Access (Owner)</span>
                </div>
                <div v-else-if="u.status === 'pending'" class="text-warning-muted small font-monospace d-flex align-items-center">
                  <i class="bi bi-clock-history me-2 text-warning opacity-75"></i>
                  <span>Awaiting 30-day activation</span>
                </div>
                <div v-else class="d-flex flex-column gap-1">
                  <div class="d-flex align-items-center">
                    <span
                      :class="[
                        'cycle-pill-badge font-monospace',
                        u.daysRemaining > 5
                          ? 'cycle-green'
                          : u.daysRemaining > 0
                          ? 'cycle-amber'
                          : 'cycle-red'
                      ]"
                    >
                      <i :class="u.daysRemaining > 0 ? 'bi bi-clock-history me-1' : 'bi bi-x-circle me-1'"></i>
                      <span>{{ u.daysRemaining > 0 ? `${u.daysRemaining} Days Left` : 'Expired' }}</span>
                    </span>
                    <span v-if="u.role === 'admin'" class="badge bg-primary bg-opacity-25 text-info ms-2 font-monospace" style="font-size: 0.65rem;">
                      Office Plan
                    </span>
                  </div>
                  <span class="text-muted font-monospace mt-0.5" style="font-size: 0.74rem;">
                    Expires: {{ formatDate(u.subscriptionExpiresAt) }}
                  </span>
                </div>
              </td>

              <!-- Own Records -->
              <td class="text-end font-monospace">
                <span class="fw-semibold text-white">{{ Number(u.totalRecords || 0).toLocaleString() }}</span>
                <span class="text-muted small ms-1">rows</span>
              </td>

              <!-- Created Date -->
              <td class="text-muted small font-monospace">
                {{ formatDate(u.createdAt) }}
              </td>

              <!-- Actions -->
              <td class="pe-3 text-end">
                <div class="d-inline-flex align-items-center gap-1.5">
                  <!-- Approve Button: SuperAdmin approves Admin; Admin approves User/Operator -->
                  <template v-if="u.status === 'pending'">
                    <button
                      v-if="canApproveUser(u)"
                      type="button"
                      class="btn-action-approve"
                      :title="u.role === 'admin' ? 'Approve Office Admin Account' : 'Approve user and activate 30-day billing cycle'"
                      @click="openApproveModal(u)"
                    >
                      <i class="bi bi-check2"></i>
                      <span>{{ u.role === 'admin' ? 'Approve Admin' : 'Approve (30d)' }}</span>
                    </button>
                    <span v-else class="text-muted font-monospace" style="font-size: 0.72rem;">
                      {{ u.role === 'admin' ? 'Awaiting SuperAdmin' : 'Awaiting Admin' }}
                    </span>
                  </template>

                  <!-- Renew Button (for active/expired users) -->
                  <button
                    v-if="u.status === 'active' && u.role !== 'superadmin' && (u.role !== 'admin' || isCurrentSuperAdmin)"
                    type="button"
                    class="btn-action-renew"
                    :title="u.role === 'admin' ? 'SuperAdmin: Renew Office Admin Billing (+30d)' : 'Renew/extend billing cycle by +30 days'"
                    @click="openRenewModal(u)"
                  >
                    <i class="bi bi-arrow-repeat"></i>
                    <span>Renew (+30d)</span>
                  </button>

                  <!-- Edit Phone Button -->
                  <button
                    v-if="isCurrentSuperAdmin || (isCurrentAdmin && u.role !== 'superadmin') || u.id === currentUserId"
                    type="button"
                    class="btn-action-role"
                    title="Edit Mobile Number"
                    @click="openPhoneModal(u)"
                  >
                    <i class="bi bi-telephone"></i>
                  </button>

                  <!-- Change Role Button -->
                  <button
                    v-if="u.id !== currentUserId && (u.role !== 'superadmin' || isCurrentSuperAdmin)"
                    type="button"
                    class="btn-action-role"
                    title="Change Role (SuperAdmin, Admin, User, Operator)"
                    @click="openRoleModal(u)"
                  >
                    <i class="bi bi-person-gear"></i>
                  </button>

                  <!-- Suspend/Activate toggle -->
                  <button
                    v-if="u.status !== 'pending' && u.id !== currentUserId && (u.role !== 'superadmin' || isCurrentSuperAdmin)"
                    type="button"
                    :class="['btn-action-toggle', u.status === 'active' ? 'toggle-pause' : 'toggle-play']"
                    :title="u.status === 'active' ? 'Suspend User Access' : 'Activate User'"
                    @click="toggleStatus(u)"
                  >
                    <i :class="u.status === 'active' ? 'bi bi-pause-fill' : 'bi bi-play-fill'"></i>
                  </button>

                  <!-- Delete Button -->
                  <button
                    v-if="u.id !== currentUserId && (u.role !== 'superadmin' || isCurrentSuperAdmin)"
                    type="button"
                    class="btn-action-delete"
                    title="Delete User and their data permanently"
                    @click="openDeleteModal(u)"
                  >
                    <i class="bi bi-trash3"></i>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 1. Approve User Modal -->
    <div v-if="showApproveModal && selectedUser" class="custom-modal-backdrop d-flex align-items-center justify-content-center p-3">
      <div class="custom-modal-card">
        <div class="modal-header-amber p-3 d-flex align-items-center justify-content-between">
          <div class="d-flex align-items-center gap-2.5">
            <div class="modal-icon-wrap icon-amber rounded">
              <i class="bi bi-patch-check-fill fs-5"></i>
            </div>
            <div>
              <h6 class="modal-title fw-bold text-white mb-0">
                {{ selectedUser.role === 'admin' ? 'Approve Office Admin Account' : 'Approve User Account' }}
              </h6>
              <span class="text-muted small">
                {{ selectedUser.role === 'admin' ? 'Grant administrator privileges to manage office users & data' : 'Grant access & activate 30-day billing cycle' }}
              </span>
            </div>
          </div>
          <button type="button" class="btn-close btn-close-white" @click="showApproveModal = false"></button>
        </div>

        <div class="p-3.5">
          <div class="user-preview-box p-2.5 rounded mb-3">
            <div class="d-flex align-items-center justify-content-between">
              <div>
                <div class="fw-semibold text-white">{{ selectedUser.name }}</div>
                <div class="text-muted small font-monospace">{{ selectedUser.email }}</div>
              </div>
              <span :class="selectedUser.role === 'admin' ? 'badge-role-admin' : 'badge-role-user'">
                {{ selectedUser.role.toUpperCase() }}
              </span>
            </div>
          </div>

          <div class="mb-3">
            <label class="form-label text-light small fw-medium">Initial Billing Cycle Duration</label>
            <div class="d-flex gap-2">
              <button
                type="button"
                :class="['btn-choice-pill flex-fill', { active: approvalDays === 30 }]"
                @click="approvalDays = 30"
              >
                30 Days (Standard)
              </button>
              <button
                type="button"
                :class="['btn-choice-pill flex-fill', { active: approvalDays === 60 }]"
                @click="approvalDays = 60"
              >
                60 Days (2 Months)
              </button>
              <button
                type="button"
                :class="['btn-choice-pill flex-fill', { active: approvalDays === 90 }]"
                @click="approvalDays = 90"
              >
                90 Days (Quarterly)
              </button>
            </div>
          </div>

          <div v-if="selectedUser.role === 'admin'" class="alert alert-info py-2 px-3 small font-monospace mb-3">
            <i class="bi bi-shield-lock-fill me-1"></i>
            Approving this account designates this user as the <strong>Office Admin</strong>. Office users will depend on this billing cycle.
          </div>

          <p class="text-muted small mb-0">
            Upon approval, user status will change to <strong class="text-success">Active</strong> and they will be able to log in immediately.
          </p>
        </div>

        <div class="p-3 modal-footer-custom d-flex align-items-center justify-content-end gap-2">
          <button type="button" class="btn btn-secondary btn-sm" :disabled="isProcessingAction" @click="showApproveModal = false">
            Cancel
          </button>
          <button type="button" class="btn-modal-confirm-amber" :disabled="isProcessingAction" @click="confirmApprove">
            <span v-if="isProcessingAction" class="spinner-border spinner-border-sm me-1"></span>
            <i v-else class="bi bi-check2-circle me-1"></i>
            <span>{{ selectedUser.role === 'admin' ? 'Confirm Admin Approval' : `Confirm Approval (${approvalDays} Days)` }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- 2. Renew Billing Cycle Modal -->
    <div v-if="showRenewModal && selectedUser" class="custom-modal-backdrop d-flex align-items-center justify-content-center p-3">
      <div class="custom-modal-card">
        <div class="modal-header-green p-3 d-flex align-items-center justify-content-between">
          <div class="d-flex align-items-center gap-2.5">
            <div class="modal-icon-wrap icon-green rounded">
              <i class="bi bi-arrow-repeat fs-5"></i>
            </div>
            <div>
              <h6 class="modal-title fw-bold text-white mb-0">Renew Billing Subscription</h6>
              <span class="text-muted small">Extend user access by 30 days</span>
            </div>
          </div>
          <button type="button" class="btn-close btn-close-white" @click="showRenewModal = false"></button>
        </div>

        <div class="p-3.5">
          <div class="user-preview-box p-2.5 rounded mb-3">
            <div class="fw-semibold text-white">{{ selectedUser.name }}</div>
            <div class="text-muted small font-monospace">{{ selectedUser.email }}</div>
            <div class="text-muted small mt-1">
              Current Expiration: <strong class="text-white">{{ formatDate(selectedUser.subscriptionExpiresAt) }}</strong>
              <span v-if="selectedUser.daysRemaining > 0" class="text-success ms-1 font-monospace">({{ selectedUser.daysRemaining }} days left)</span>
              <span v-else class="text-danger ms-1 font-monospace">(Expired)</span>
            </div>
          </div>

          <div class="mb-3">
            <label class="form-label text-light small fw-medium">Extend Access Duration</label>
            <div class="d-flex gap-2">
              <button
                type="button"
                :class="['btn-choice-pill flex-fill', { active: renewDays === 30 }]"
                @click="renewDays = 30"
              >
                +30 Days (1 Month)
              </button>
              <button
                type="button"
                :class="['btn-choice-pill flex-fill', { active: renewDays === 60 }]"
                @click="renewDays = 60"
              >
                +60 Days (2 Months)
              </button>
              <button
                type="button"
                :class="['btn-choice-pill flex-fill', { active: renewDays === 365 }]"
                @click="renewDays = 365"
              >
                +365 Days (1 Year)
              </button>
            </div>
          </div>
        </div>

        <div class="p-3 modal-footer-custom d-flex align-items-center justify-content-end gap-2">
          <button type="button" class="btn btn-secondary btn-sm" :disabled="isProcessingAction" @click="showRenewModal = false">
            Cancel
          </button>
          <button type="button" class="btn-modal-confirm-green" :disabled="isProcessingAction" @click="confirmRenew">
            <span v-if="isProcessingAction" class="spinner-border spinner-border-sm me-1"></span>
            <i v-else class="bi bi-arrow-repeat me-1"></i>
            <span>Confirm +{{ renewDays }} Days Renewal</span>
          </button>
        </div>
      </div>
    </div>

    <!-- 3. Delete Confirmation Modal -->
    <div v-if="showDeleteModal && selectedUser" class="custom-modal-backdrop d-flex align-items-center justify-content-center p-3">
      <div class="custom-modal-card">
        <div class="modal-header-danger p-3 d-flex align-items-center justify-content-between">
          <div class="d-flex align-items-center gap-2.5">
            <div class="modal-icon-wrap icon-red rounded">
              <i class="bi bi-trash3-fill fs-5"></i>
            </div>
            <div>
              <h6 class="modal-title fw-bold text-white mb-0">Delete User Account</h6>
              <span class="text-danger small">Permanent & Irreversible Action</span>
            </div>
          </div>
          <button type="button" class="btn-close btn-close-white" @click="showDeleteModal = false"></button>
        </div>

        <div class="p-3.5">
          <p class="text-light mb-2">
            Are you sure you want to permanently delete <strong class="text-white">{{ selectedUser.name }}</strong> (<span class="font-monospace text-muted">{{ selectedUser.email }}</span>)?
          </p>
          <div v-if="selectedUser.adminId" class="alert alert-warning py-2 px-3 small mb-0 border-0">
            <i class="bi bi-info-circle-fill me-1 text-warning"></i>
            This is an operator account. Deleting it will remove the operator's access without affecting the parent account's data.
          </div>
          <div v-else class="alert alert-danger py-2 px-3 small mb-0 border-0" style="background: rgba(239, 68, 68, 0.12); color: #fca5a5;">
            <i class="bi bi-exclamation-triangle-fill me-1 text-danger"></i>
            This will permanently erase this user and all <strong>{{ selectedUser.totalRecords }}</strong> associated bond records.
          </div>
        </div>

        <div class="p-3 modal-footer-custom d-flex align-items-center justify-content-end gap-2">
          <button type="button" class="btn btn-secondary btn-sm" :disabled="isProcessingAction" @click="showDeleteModal = false">
            Cancel
          </button>
          <button type="button" class="btn btn-danger btn-sm px-3 fw-bold d-inline-flex align-items-center gap-1.5" :disabled="isProcessingAction" @click="confirmDelete">
            <span v-if="isProcessingAction" class="spinner-border spinner-border-sm"></span>
            <i v-else class="bi bi-trash3-fill"></i>
            <span>Delete User Permanently</span>
          </button>
        </div>
      </div>
    </div>

    <!-- 4. Change User Role Modal (Redesigned) -->
    <div v-if="showRoleModal && selectedUser" class="custom-modal-backdrop d-flex align-items-center justify-content-center p-3">
      <div class="custom-modal-card role-modal-card">
        <!-- Header -->
        <div class="role-modal-header p-3 d-flex align-items-center justify-content-between">
          <div class="d-flex align-items-center gap-2.5">
            <div class="role-modal-icon-badge">
              <i class="bi bi-person-gear"></i>
            </div>
            <div>
              <h6 class="role-modal-title mb-0.5">Change User Role</h6>
              <p class="role-modal-subtitle mb-0">Update account permissions and access tier</p>
            </div>
          </div>
          <button type="button" class="role-modal-close-btn" @click="showRoleModal = false">
            <i class="bi bi-x-lg"></i>
          </button>
        </div>

        <!-- Body -->
        <div class="role-modal-body p-3.5">
          <!-- User Banner Preview -->
          <div class="role-user-banner mb-3">
            <div class="d-flex align-items-center justify-content-between">
              <div class="d-flex align-items-center gap-2.5">
                <div class="role-avatar-circle">
                  {{ selectedUser.name ? selectedUser.name.charAt(0).toUpperCase() : 'U' }}
                </div>
                <div>
                  <div class="role-user-name">{{ selectedUser.name }}</div>
                  <div class="role-user-email">
                    <i class="bi bi-envelope me-1"></i>{{ selectedUser.email }}
                  </div>
                </div>
              </div>
              <div class="text-end">
                <div class="role-current-label">CURRENT ROLE</div>
                <span class="role-current-pill" :class="`pill-${selectedUser.role.toLowerCase()}`">
                  {{ selectedUser.role.toUpperCase() }}
                </span>
              </div>
            </div>
          </div>

          <!-- Select Role Options Label -->
          <label class="role-section-label mb-2">
            <i class="bi bi-shield-check me-1.5 text-info"></i>
            <span>Select New Role</span>
          </label>

          <!-- Role Cards Container -->
          <div class="role-cards-container d-flex flex-column gap-2 mb-3">
            <!-- 1. USER -->
            <div
              :class="['role-option-card', { 'is-selected role-user-selected': selectedRole === 'user' }]"
              @click="selectedRole = 'user'"
            >
              <div class="d-flex align-items-center gap-3 flex-grow-1">
                <div class="role-card-icon-box role-icon-user">
                  <i class="bi bi-person-fill"></i>
                </div>
                <div class="role-card-text">
                  <div class="role-card-heading">
                    <span class="role-name">User</span>
                    <span class="role-tag tag-user">PRIMARY ACCOUNT</span>
                  </div>
                  <div class="role-card-desc">
                    Can upload data, generate reports, and manage operators.
                  </div>
                </div>
              </div>
              <div class="custom-radio-circle" :class="{ checked: selectedRole === 'user' }">
                <div class="radio-core-dot"></div>
              </div>
            </div>

            <!-- 2. OPERATOR -->
            <div
              :class="['role-option-card', { 'is-selected role-operator-selected': selectedRole === 'operator' }]"
              @click="selectedRole = 'operator'"
            >
              <div class="d-flex align-items-center gap-3 flex-grow-1">
                <div class="role-card-icon-box role-icon-operator">
                  <i class="bi bi-person-badge-fill"></i>
                </div>
                <div class="role-card-text">
                  <div class="role-card-heading">
                    <span class="role-name">Operator</span>
                    <span class="role-tag tag-operator">SUB-ACCOUNT</span>
                  </div>
                  <div class="role-card-desc">
                    Shares parent user's data &amp; quota. Cannot manage other users.
                  </div>
                </div>
              </div>
              <div class="custom-radio-circle" :class="{ checked: selectedRole === 'operator' }">
                <div class="radio-core-dot"></div>
              </div>
            </div>

            <!-- 3. ADMIN -->
            <div
              :class="['role-option-card', { 'is-selected role-admin-selected': selectedRole === 'admin' }]"
              @click="selectedRole = 'admin'"
            >
              <div class="d-flex align-items-center gap-3 flex-grow-1">
                <div class="role-card-icon-box role-icon-admin">
                  <i class="bi bi-shield-lock-fill"></i>
                </div>
                <div class="role-card-text">
                  <div class="role-card-heading">
                    <span class="role-name">Admin</span>
                    <span class="role-tag tag-admin">OFFICE ADMIN</span>
                  </div>
                  <div class="role-card-desc">
                    Access to office users, signup approval &amp; billing controls.
                  </div>
                </div>
              </div>
              <div class="custom-radio-circle" :class="{ checked: selectedRole === 'admin' }">
                <div class="radio-core-dot"></div>
              </div>
            </div>

            <!-- 4. SUPERADMIN (Only if current SuperAdmin) -->
            <div
              v-if="isCurrentSuperAdmin"
              :class="['role-option-card', { 'is-selected role-superadmin-selected': selectedRole === 'superadmin' }]"
              @click="selectedRole = 'superadmin'"
            >
              <div class="d-flex align-items-center gap-3 flex-grow-1">
                <div class="role-card-icon-box role-icon-superadmin">
                  <i class="bi bi-stars"></i>
                </div>
                <div class="role-card-text">
                  <div class="role-card-heading">
                    <span class="role-name">Superadmin</span>
                    <span class="role-tag tag-superadmin">PLATFORM OWNER</span>
                  </div>
                  <div class="role-card-desc">
                    Unlimited platform access, database backup/restore &amp; master control.
                  </div>
                </div>
              </div>
              <div class="custom-radio-circle" :class="{ checked: selectedRole === 'superadmin' }">
                <div class="radio-core-dot"></div>
              </div>
            </div>
          </div>

          <!-- If Operator role selected, choose Parent User -->
          <div v-if="selectedRole === 'operator'" class="operator-parent-select-box p-3 rounded-3 mb-3">
            <label class="form-label text-light small fw-medium mb-1.5 d-flex align-items-center gap-1.5">
              <i class="bi bi-diagram-3-fill text-info"></i>
              <span>Assign Under Master User</span>
              <span class="text-danger">*</span>
            </label>
            <select v-model="selectedParentAdminId" class="form-select form-select-sm jupiter-input">
              <option :value="null">-- Select Parent Account Owner --</option>
              <option v-for="p in potentialParents" :key="p.id" :value="p.id">
                {{ p.name }} ({{ p.email }})
              </option>
            </select>
            <div class="text-muted small mt-1.5 font-monospace" style="font-size: 0.72rem;">
              <i class="bi bi-info-circle me-1"></i>
              The operator will share the database &amp; subscription of the selected master user.
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="role-modal-footer p-3 d-flex align-items-center justify-content-end gap-2.5">
          <button
            type="button"
            class="btn-role-cancel"
            :disabled="isProcessingAction"
            @click="showRoleModal = false"
          >
            Cancel
          </button>
          <button
            type="button"
            class="btn-role-submit"
            :disabled="isProcessingAction || (selectedRole === 'operator' && !selectedParentAdminId)"
            @click="confirmChangeRole"
          >
            <span v-if="isProcessingAction" class="spinner-border spinner-border-sm me-1.5"></span>
            <i v-else class="bi bi-check-circle-fill me-1.5"></i>
            <span>Update Role to {{ selectedRole.toUpperCase() }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- 5. Edit Mobile Number Modal -->
    <div v-if="showPhoneModal && selectedUser" class="custom-modal-backdrop d-flex align-items-center justify-content-center p-3">
      <div class="custom-modal-card" style="max-width: 440px;">
        <div class="modal-header-cyan p-3 d-flex align-items-center justify-content-between">
          <div class="d-flex align-items-center gap-2.5">
            <div class="modal-icon-wrap icon-cyan rounded">
              <i class="bi bi-telephone-fill fs-5"></i>
            </div>
            <div>
              <h6 class="modal-title fw-bold text-white mb-0">Update Mobile Number</h6>
              <span class="text-muted small">Subscription renewal & contact number</span>
            </div>
          </div>
          <button type="button" class="btn-close btn-close-white" @click="showPhoneModal = false"></button>
        </div>

        <div class="p-3.5">
          <div class="user-preview-box p-2.5 rounded mb-3">
            <div class="d-flex align-items-center justify-content-between">
              <div>
                <div class="fw-semibold text-white">{{ selectedUser.name }}</div>
                <div class="text-muted small font-monospace">{{ selectedUser.email }}</div>
              </div>
              <span :class="selectedUser.role === 'admin' ? 'badge-role-admin' : 'badge-role-user'">
                {{ selectedUser.role.toUpperCase() }}
              </span>
            </div>
          </div>

          <div class="mb-3">
            <label class="form-label text-light small fw-medium">Mobile / Phone Number</label>
            <div class="input-group">
              <span class="input-group-text bg-dark border-secondary border-opacity-50 text-warning">
                <i class="bi bi-telephone"></i>
              </span>
              <input
                v-model="phoneInput"
                type="tel"
                class="form-control jupiter-input"
                placeholder="e.g. 01712345678"
                autofocus
                @keydown.enter="confirmUpdatePhone"
              />
            </div>
            <div class="form-text text-muted small mt-1">
              মেয়াদ শেষ হলে ইউজাররা লগইন করার সময় এই মোবাইল নম্বরটি দেখতে পাবে।
            </div>
          </div>
        </div>

        <div class="p-3 modal-footer-custom d-flex align-items-center justify-content-end gap-2">
          <button type="button" class="btn btn-secondary btn-sm" :disabled="isProcessingAction" @click="showPhoneModal = false">
            Cancel
          </button>
          <button
            type="button"
            class="btn-modal-confirm-cyan"
            :disabled="isProcessingAction"
            @click="confirmUpdatePhone"
          >
            <span v-if="isProcessingAction" class="spinner-border spinner-border-sm me-1"></span>
            <i v-else class="bi bi-check2-circle me-1"></i>
            <span>Save Number</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.users-admin-page {
  width: 100%;
}

/* Toast */
.custom-toast {
  position: fixed;
  top: 80px;
  right: 24px;
  z-index: 1200;
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.75rem 1.25rem;
  font-size: 0.88rem;
  border-radius: 8px;
  animation: slideIn 0.25s ease;
}

.toast-success {
  background: #064e3b !important;
  color: #6ee7b7 !important;
  border: 1px solid #059669 !important;
}

.toast-danger {
  background: #7f1d1d !important;
  color: #fca5a5 !important;
  border: 1px solid #dc2626 !important;
}

@keyframes slideIn {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

.btn-refresh-users {
  background: #1e293b;
  border: 1px solid #334155;
  color: #cbd5e1;
  font-size: 0.82rem;
  font-weight: 500;
  padding: 0.4rem 0.85rem;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-refresh-users:hover {
  background: #283548;
  color: #ffffff;
  border-color: #475569;
}

/* Stat Cards */
.stat-card {
  background: #111726;
  border: 1px solid #1e293b;
  border-radius: 8px;
  padding: 0.85rem 1rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.stat-card:hover {
  transform: translateY(-2px);
  border-color: #334155;
  background: #151d2e;
}

.stat-card.card-active-blue {
  border-color: #38bdf8;
  background: rgba(56, 189, 248, 0.08);
}

.stat-card.card-active-amber {
  border-color: #f59e0b;
  background: rgba(245, 158, 11, 0.08);
}

.stat-card.card-active-green {
  border-color: #22c55e;
  background: rgba(34, 197, 94, 0.08);
}

.stat-card.card-active-red {
  border-color: #ef4444;
  background: rgba(239, 68, 68, 0.08);
}

.stat-card.has-pending {
  border-color: rgba(245, 158, 11, 0.5);
}

.stat-label {
  color: #94a3b8;
  font-size: 0.76rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  margin-bottom: 0.25rem;
}

.stat-value {
  color: #f1f5f9;
  font-size: 1.55rem;
  font-weight: 700;
  line-height: 1.1;
}

.stat-icon-box {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.35rem;
  flex-shrink: 0;
}

.icon-blue {
  background: rgba(56, 189, 248, 0.12) !important;
  color: #38bdf8 !important;
  border: 1px solid rgba(56, 189, 248, 0.28) !important;
}

.icon-amber {
  background: rgba(245, 158, 11, 0.12) !important;
  color: #fbbf24 !important;
  border: 1px solid rgba(245, 158, 11, 0.28) !important;
}

.icon-green {
  background: rgba(34, 197, 94, 0.12) !important;
  color: #4ade80 !important;
  border: 1px solid rgba(34, 197, 94, 0.28) !important;
}

.icon-red {
  background: rgba(239, 68, 68, 0.12) !important;
  color: #f87171 !important;
  border: 1px solid rgba(239, 68, 68, 0.28) !important;
}

/* Standalone Filter Tabs */
.filter-tab-pill {
  background: #111726;
  border: 1px solid #1e293b;
  color: #94a3b8;
  font-size: 0.82rem;
  font-weight: 500;
  padding: 0.42rem 0.85rem;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  transition: all 0.15s ease;
  user-select: none;
}

.filter-tab-pill:hover {
  color: #f1f5f9;
  border-color: #334155;
  background: #161e2e;
}

.filter-tab-pill.active {
  background: rgba(56, 189, 248, 0.12);
  border-color: #38bdf8;
  color: #38bdf8;
  font-weight: 600;
}

.filter-tab-pill.pill-warning.active {
  background: rgba(245, 158, 11, 0.14);
  border-color: #f59e0b;
  color: #fbbf24;
  font-weight: 600;
}

.filter-tab-pill.pill-success.active {
  background: rgba(34, 197, 94, 0.14);
  border-color: #22c55e;
  color: #4ade80;
  font-weight: 600;
}

.filter-tab-pill.pill-danger.active {
  background: rgba(239, 68, 68, 0.14);
  border-color: #ef4444;
  color: #f87171;
  font-weight: 600;
}

.filter-tab-pill.pill-muted.active {
  background: rgba(148, 163, 184, 0.14);
  border-color: #94a3b8;
  color: #f1f5f9;
  font-weight: 600;
}

.tab-count {
  background: rgba(255, 255, 255, 0.08);
  color: #94a3b8;
  padding: 0.1rem 0.45rem;
  border-radius: 4px;
  font-size: 0.72rem;
  font-family: monospace;
  font-weight: 600;
}

.count-amber {
  background: rgba(245, 158, 11, 0.2);
  color: #fbbf24;
}

.count-green {
  background: rgba(34, 197, 94, 0.2);
  color: #4ade80;
}

.count-red {
  background: rgba(239, 68, 68, 0.2);
  color: #f87171;
}

.count-muted {
  background: rgba(148, 163, 184, 0.2);
  color: #cbd5e1;
}

.filter-tab-pill.active .tab-count {
  background: rgba(255, 255, 255, 0.12);
  color: currentColor;
}

/* Search Box */
.search-box-wrap {
  position: relative;
  min-width: 260px;
}

.search-icon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: #64748b;
  font-size: 0.85rem;
  pointer-events: none;
}

.search-input {
  background: #131926 !important;
  border: 1px solid #283548 !important;
  color: #e2e8f0 !important;
  font-size: 0.82rem !important;
  height: 32px !important;
  padding-left: 30px !important;
  padding-right: 28px !important;
  border-radius: 5px !important;
}

.search-input:focus {
  border-color: #38bdf8 !important;
  box-shadow: 0 0 0 1px rgba(56, 189, 248, 0.3) !important;
}

.btn-clear-search {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 0.85rem;
  cursor: pointer;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-clear-search:hover {
  color: #f87171;
}

/* Table Card & Full Dark Force Override */
.table-card-wrapper {
  background: #0f1523 !important;
  border: 1px solid #1e293b;
  overflow: auto;
}

.users-custom-table {
  width: 100%;
  color: #cbd5e1 !important;
  background-color: #0f1523 !important;
  font-size: 0.84rem;
  border-collapse: collapse;
}

.users-custom-table thead th {
  background-color: #151d2b !important;
  color: #94a3b8 !important;
  font-weight: 600;
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  padding: 0.75rem 0.85rem;
  border-bottom: 1px solid #222e42 !important;
  border-top: none !important;
  white-space: nowrap;
}

.users-custom-table tbody tr {
  background-color: #0f1523 !important;
  color: #cbd5e1 !important;
  transition: background-color 0.15s ease;
}

.users-custom-table tbody tr:hover td {
  background-color: #161e2e !important;
}

.users-custom-table tbody td {
  background-color: #0f1523 !important;
  color: #cbd5e1 !important;
  padding: 0.75rem 0.85rem;
  border-bottom: 1px solid #1e293b !important;
  border-top: none !important;
  vertical-align: middle;
}

.users-custom-table tbody tr.row-is-pending td {
  background-color: rgba(245, 158, 11, 0.03) !important;
}

.users-custom-table tbody tr.row-is-pending:hover td {
  background-color: rgba(245, 158, 11, 0.07) !important;
}

.cell-num {
  color: #64748b;
  font-size: 0.82rem;
}

.user-info-wrap {
  display: flex;
  align-items: center;
  gap: 14px;
}

.user-avatar-badge {
  width: 34px;
  height: 34px;
  min-width: 34px;
  background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
  color: #38bdf8;
  border: 1px solid #475569;
  border-radius: 8px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.9rem;
  flex-shrink: 0;
}

.user-name-text {
  color: #f1f5f9;
  font-weight: 600;
  font-size: 0.86rem;
  line-height: 1.25;
}

.user-email-text {
  color: #94a3b8;
  font-size: 0.76rem;
  line-height: 1.2;
}

/* Role Badges */
.badge-role-admin {
  background: rgba(168, 85, 247, 0.12) !important;
  color: #d8b4fe !important;
  border: 1px solid rgba(168, 85, 247, 0.35) !important;
  font-family: monospace;
  font-size: 0.7rem;
  font-weight: 700;
  padding: 0.2rem 0.55rem;
  border-radius: 4px;
  display: inline-block;
}

.badge-role-user {
  background: rgba(100, 116, 139, 0.15) !important;
  color: #cbd5e1 !important;
  border: 1px solid rgba(100, 116, 139, 0.3) !important;
  font-family: monospace;
  font-size: 0.7rem;
  font-weight: 600;
  padding: 0.2rem 0.55rem;
  border-radius: 4px;
  display: inline-block;
}

/* Status Badges */
.status-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  padding: 0.22rem 0.65rem;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
}

.status-pending {
  background: rgba(245, 158, 11, 0.14) !important;
  color: #fbbf24 !important;
  border: 1px solid rgba(245, 158, 11, 0.35) !important;
}

.status-active {
  background: rgba(34, 197, 94, 0.14) !important;
  color: #4ade80 !important;
  border: 1px solid rgba(34, 197, 94, 0.35) !important;
}

.status-expired {
  background: rgba(239, 68, 68, 0.14) !important;
  color: #f87171 !important;
  border: 1px solid rgba(239, 68, 68, 0.35) !important;
}

.status-suspended {
  background: rgba(148, 163, 184, 0.14) !important;
  color: #94a3b8 !important;
  border: 1px solid rgba(148, 163, 184, 0.35) !important;
}

.text-warning-muted {
  color: #d97706;
}

/* Cycle Badges */
.cycle-pill-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.18rem 0.55rem;
  border-radius: 4px;
  font-size: 0.73rem;
  font-weight: 600;
}

.cycle-green {
  background: rgba(34, 197, 94, 0.14);
  color: #4ade80;
  border: 1px solid rgba(34, 197, 94, 0.3);
}

.cycle-amber {
  background: rgba(245, 158, 11, 0.14);
  color: #fbbf24;
  border: 1px solid rgba(245, 158, 11, 0.3);
}

.cycle-red {
  background: rgba(239, 68, 68, 0.14);
  color: #f87171;
  border: 1px solid rgba(239, 68, 68, 0.3);
}

/* Action Buttons */
.btn-action-approve {
  background: #f59e0b;
  border: none;
  color: #0b0f19;
  font-size: 0.77rem;
  font-weight: 700;
  padding: 0.3rem 0.7rem;
  border-radius: 5px;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.btn-action-approve:hover {
  background: #fbbf24;
  color: #000000;
  box-shadow: 0 0 10px rgba(245, 158, 11, 0.4);
}

.btn-action-renew {
  background: rgba(34, 197, 94, 0.15);
  border: 1px solid rgba(34, 197, 94, 0.4);
  color: #4ade80;
  font-size: 0.77rem;
  font-weight: 600;
  padding: 0.28rem 0.65rem;
  border-radius: 5px;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.btn-action-renew:hover {
  background: #16a34a;
  border-color: #22c55e;
  color: #ffffff;
}

.btn-action-toggle {
  background: transparent;
  border: 1px solid #334155;
  color: #94a3b8;
  width: 28px;
  height: 28px;
  border-radius: 5px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-action-toggle:hover {
  background: #283548;
  color: #ffffff;
}

.toggle-play {
  color: #4ade80 !important;
  border-color: rgba(34, 197, 94, 0.3) !important;
}

.toggle-play:hover {
  background: rgba(34, 197, 94, 0.2) !important;
}

.btn-action-delete {
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

.btn-action-delete:hover {
  background: rgba(239, 68, 68, 0.2);
  border-color: #ef4444;
  color: #ffffff;
}

/* Modals */
.custom-modal-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(10, 15, 26, 0.82);
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
    transform: scale(0.96) translateY(8px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.modal-header-amber {
  background: rgba(245, 158, 11, 0.08);
  border-bottom: 1px solid rgba(245, 158, 11, 0.2);
}

.modal-header-green {
  background: rgba(34, 197, 94, 0.08);
  border-bottom: 1px solid rgba(34, 197, 94, 0.2);
}

.modal-header-danger {
  background: rgba(239, 68, 68, 0.08);
  border-bottom: 1px solid rgba(239, 68, 68, 0.2);
}

.modal-icon-wrap {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.user-preview-box {
  background: #090e17;
  border: 1px solid #1e293b;
}

.btn-choice-pill {
  background: #131926;
  border: 1px solid #283548;
  color: #94a3b8;
  font-size: 0.78rem;
  font-weight: 500;
  padding: 0.4rem 0.5rem;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-choice-pill:hover {
  color: #ffffff;
  border-color: #475569;
}

.btn-choice-pill.active {
  background: #f59e0b;
  border-color: #f59e0b;
  color: #0b0f19;
  font-weight: 700;
}

.modal-footer-custom {
  background: #090e17;
  border-top: 1px solid #1e293b;
}

.btn-modal-confirm-amber {
  background: #f59e0b;
  border: none;
  color: #0b0f19;
  font-size: 0.82rem;
  font-weight: 700;
  padding: 0.35rem 0.85rem;
  border-radius: 5px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-modal-confirm-amber:hover {
  background: #fbbf24;
}

.btn-modal-confirm-green {
  background: #16a34a;
  border: 1px solid #22c55e;
  color: #ffffff;
  font-size: 0.82rem;
  font-weight: 600;
  padding: 0.35rem 0.85rem;
  border-radius: 5px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-modal-confirm-green:hover {
  background: #15803d;
}

.modal-header-cyan {
  background: rgba(14, 165, 233, 0.08);
  border-bottom: 1px solid rgba(14, 165, 233, 0.2);
}

.icon-cyan {
  color: #38bdf8;
  background: rgba(14, 165, 233, 0.15);
  border: 1px solid rgba(14, 165, 233, 0.3);
}

.btn-modal-confirm-cyan {
  background: #0284c7;
  border: 1px solid #38bdf8;
  color: #ffffff;
  font-size: 0.82rem;
  font-weight: 600;
  padding: 0.35rem 0.85rem;
  border-radius: 5px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-modal-confirm-cyan:hover:not(:disabled) {
  background: #0369a1;
}

.btn-modal-confirm-cyan:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.badge-role-operator {
  background: rgba(14, 165, 233, 0.12) !important;
  color: #38bdf8 !important;
  border: 1px solid rgba(14, 165, 233, 0.35) !important;
  font-family: monospace;
  font-size: 0.7rem;
  font-weight: 700;
  padding: 0.2rem 0.55rem;
  border-radius: 4px;
  display: inline-block;
}

.btn-action-role {
  background: rgba(56, 189, 248, 0.12);
  border: 1px solid rgba(56, 189, 248, 0.35);
  color: #38bdf8;
  width: 28px;
  height: 28px;
  border-radius: 5px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-action-role:hover {
  background: rgba(56, 189, 248, 0.25);
  color: #ffffff;
}

.role-select-box {
  cursor: pointer;
  transition: all 0.15s ease;
}

.table-loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(15, 21, 35, 0.85);
  z-index: 10;
  backdrop-filter: blur(2px);
}

.spin-icon {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  100% {
    transform: rotate(360deg);
  }
}

/* =========================================================
   Redesigned Role Modal Styles
   ========================================================= */
.role-modal-card {
  max-width: 500px !important;
  border: 1px solid rgba(255, 255, 255, 0.12) !important;
  background: #0d131f !important;
  border-radius: 14px !important;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.85) !important;
}

.role-modal-header {
  background: linear-gradient(180deg, rgba(30, 41, 59, 0.5) 0%, rgba(15, 23, 42, 0) 100%);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.role-modal-icon-badge {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: linear-gradient(135deg, rgba(56, 189, 248, 0.2), rgba(99, 102, 241, 0.2));
  border: 1px solid rgba(56, 189, 248, 0.4);
  color: #38bdf8;
  font-size: 1.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

.role-modal-title {
  font-size: 1.05rem;
  font-weight: 700;
  color: #f8fafc;
}

.role-modal-subtitle {
  font-size: 0.76rem;
  color: #94a3b8;
}

.role-modal-close-btn {
  background: transparent;
  border: none;
  color: #94a3b8;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
}

.role-modal-close-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #ffffff;
}

/* User Banner */
.role-user-banner {
  background: linear-gradient(135deg, rgba(15, 23, 42, 0.9), rgba(30, 41, 59, 0.4));
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 0.85rem 1rem;
}

.role-avatar-circle {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  background: linear-gradient(135deg, #0284c7, #6366f1);
  color: #ffffff;
  font-weight: 700;
  font-size: 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

.role-user-name {
  font-weight: 700;
  color: #f8fafc;
  font-size: 0.95rem;
}

.role-user-email {
  font-size: 0.76rem;
  color: #94a3b8;
  font-family: monospace;
}

.role-current-label {
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  color: #64748b;
  margin-bottom: 2px;
}

.role-current-pill {
  font-size: 0.68rem;
  font-weight: 700;
  font-family: monospace;
  padding: 0.18rem 0.55rem;
  border-radius: 6px;
  display: inline-block;
}

.pill-admin {
  background: rgba(245, 158, 11, 0.15);
  color: #fbbf24;
  border: 1px solid rgba(245, 158, 11, 0.35);
}

.pill-user {
  background: rgba(59, 130, 246, 0.15);
  color: #60a5fa;
  border: 1px solid rgba(59, 130, 246, 0.35);
}

.pill-superadmin {
  background: rgba(244, 63, 94, 0.15);
  color: #fb7185;
  border: 1px solid rgba(244, 63, 94, 0.35);
}

.pill-operator {
  background: rgba(6, 182, 212, 0.15);
  color: #38bdf8;
  border: 1px solid rgba(6, 182, 212, 0.35);
}

.role-section-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: #cbd5e1;
  display: flex;
  align-items: center;
}

/* Option Cards */
.role-option-card {
  background: #111726;
  border: 1.5px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 0.7rem 0.95rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  user-select: none;
}

.role-option-card:hover {
  background: #151e32;
  border-color: rgba(255, 255, 255, 0.22);
  transform: translateY(-1px);
}

.role-user-selected {
  background: rgba(59, 130, 246, 0.12) !important;
  border-color: #3b82f6 !important;
  box-shadow: 0 0 16px rgba(59, 130, 246, 0.22);
}

.role-operator-selected {
  background: rgba(6, 182, 212, 0.12) !important;
  border-color: #06b6d4 !important;
  box-shadow: 0 0 16px rgba(6, 182, 212, 0.22);
}

.role-admin-selected {
  background: rgba(245, 158, 11, 0.12) !important;
  border-color: #f59e0b !important;
  box-shadow: 0 0 16px rgba(245, 158, 11, 0.22);
}

.role-superadmin-selected {
  background: rgba(244, 63, 94, 0.12) !important;
  border-color: #f43f5e !important;
  box-shadow: 0 0 16px rgba(244, 63, 94, 0.22);
}

.role-card-icon-box {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.05rem;
  flex-shrink: 0;
}

.role-icon-user {
  background: rgba(59, 130, 246, 0.15);
  color: #60a5fa;
  border: 1px solid rgba(59, 130, 246, 0.3);
}

.role-icon-operator {
  background: rgba(6, 182, 212, 0.15);
  color: #38bdf8;
  border: 1px solid rgba(6, 182, 212, 0.3);
}

.role-icon-admin {
  background: rgba(245, 158, 11, 0.15);
  color: #fbbf24;
  border: 1px solid rgba(245, 158, 11, 0.3);
}

.role-icon-superadmin {
  background: rgba(244, 63, 94, 0.15);
  color: #fb7185;
  border: 1px solid rgba(244, 63, 94, 0.3);
}

.role-card-heading {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 2px;
}

.role-name {
  font-weight: 700;
  color: #f8fafc;
  font-size: 0.88rem;
}

.role-tag {
  font-size: 0.6rem;
  font-weight: 700;
  font-family: monospace;
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
}

.tag-user {
  background: rgba(59, 130, 246, 0.2);
  color: #93c5fd;
}

.tag-operator {
  background: rgba(6, 182, 212, 0.2);
  color: #7dd3fc;
}

.tag-admin {
  background: rgba(245, 158, 11, 0.2);
  color: #fde047;
}

.tag-superadmin {
  background: rgba(244, 63, 94, 0.2);
  color: #fda4af;
}

.role-card-desc {
  font-size: 0.73rem;
  color: #94a3b8;
  line-height: 1.35;
}

/* Custom Circular Radio */
.custom-radio-circle {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid #475569;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-left: 0.75rem;
  transition: all 0.2s ease;
}

.custom-radio-circle.checked {
  border-color: #38bdf8;
  background: rgba(56, 189, 248, 0.15);
}

.radio-core-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #38bdf8;
  opacity: 0;
  transform: scale(0.3);
  transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.custom-radio-circle.checked .radio-core-dot {
  opacity: 1;
  transform: scale(1);
}

/* Operator parent selector box */
.operator-parent-select-box {
  background: #090e17;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

/* Modal Footer */
.role-modal-footer {
  background: #090e17;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.btn-role-cancel {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #cbd5e1;
  font-size: 0.82rem;
  font-weight: 600;
  padding: 0.45rem 1rem;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-role-cancel:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #ffffff;
}

.btn-role-submit {
  background: linear-gradient(135deg, #0284c7, #2563eb);
  border: 1px solid rgba(56, 189, 248, 0.5);
  color: #ffffff;
  font-size: 0.82rem;
  font-weight: 600;
  padding: 0.45rem 1.15rem;
  border-radius: 6px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  box-shadow: 0 4px 12px rgba(2, 132, 199, 0.3);
  transition: all 0.15s ease;
}

.btn-role-submit:hover:not(:disabled) {
  background: linear-gradient(135deg, #0369a1, #1d4ed8);
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(2, 132, 199, 0.45);
}

.btn-role-submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
