<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import axios from "axios";

const props = defineProps<{
  show: boolean;
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();

interface OperatorItem {
  id: number;
  name: string;
  email: string;
  role: string;
  status: "active" | "suspended";
  createdAt: string;
}

const operators = ref<OperatorItem[]>([]);
const isLoading = ref(false);
const isSaving = ref(false);
const isDeleting = ref(false);
const showAddForm = ref(false);
const editingOperator = ref<OperatorItem | null>(null);

// Form state
const formName = ref("");
const formEmail = ref("");
const formPassword = ref("");
const showPassword = ref(false);

// Reset password modal state
const showPasswordResetModal = ref(false);
const targetOperator = ref<OperatorItem | null>(null);
const newPassword = ref("");
const isResettingPassword = ref(false);

// Delete modal state
const showDeleteConfirmModal = ref(false);
const operatorToDelete = ref<OperatorItem | null>(null);

// Toast notification
const toastMessage = ref<string | null>(null);
const toastType = ref<"success" | "danger">("success");

const triggerToast = (msg: string, type: "success" | "danger" = "success") => {
  toastMessage.value = msg;
  toastType.value = type;
  setTimeout(() => {
    toastMessage.value = null;
  }, 4000);
};

const resetForm = () => {
  formName.value = "";
  formEmail.value = "";
  formPassword.value = "";
  showPassword.value = false;
  editingOperator.value = null;
  showAddForm.value = false;
};

const fetchOperators = async () => {
  isLoading.value = true;
  try {
    const res = await axios.get("/api/auth/operators");
    if (res.data?.success) {
      operators.value = res.data.data || [];
    }
  } catch (err: any) {
    triggerToast(err.response?.data?.message || "Failed to load operators list", "danger");
  } finally {
    isLoading.value = false;
  }
};

const handleSaveOperator = async () => {
  if (!formName.value.trim()) {
    triggerToast("Please enter a valid operator name", "danger");
    return;
  }
  if (!editingOperator.value && !formEmail.value.trim()) {
    triggerToast("Please enter a valid email address", "danger");
    return;
  }
  if (!editingOperator.value && (!formPassword.value || formPassword.value.length < 6)) {
    triggerToast("Password must be at least 6 characters long", "danger");
    return;
  }

  isSaving.value = true;
  try {
    if (editingOperator.value) {
      // Update
      const payload: any = {
        name: formName.value.trim()
      };
      if (formPassword.value) {
        payload.password = formPassword.value;
      }
      const res = await axios.put(`/api/auth/operators/${editingOperator.value.id}`, payload);
      if (res.data?.success) {
        triggerToast(`Operator "${formName.value}" updated successfully!`, "success");
        resetForm();
        fetchOperators();
      }
    } else {
      // Create
      const res = await axios.post("/api/auth/operators", {
        name: formName.value.trim(),
        email: formEmail.value.trim().toLowerCase(),
        password: formPassword.value
      });
      if (res.data?.success) {
        triggerToast(`Operator "${formName.value}" added successfully!`, "success");
        resetForm();
        fetchOperators();
      }
    }
  } catch (err: any) {
    triggerToast(err.response?.data?.message || "Failed to save operator", "danger");
  } finally {
    isSaving.value = false;
  }
};

const startEdit = (op: OperatorItem) => {
  editingOperator.value = op;
  formName.value = op.name;
  formEmail.value = op.email;
  formPassword.value = "";
  showAddForm.value = true;
};

const handleToggleStatus = async (op: OperatorItem) => {
  const newStatus = op.status === "active" ? "suspended" : "active";
  try {
    const res = await axios.patch(`/api/auth/operators/${op.id}/status`, { status: newStatus });
    if (res.data?.success) {
      op.status = newStatus;
      triggerToast(`Operator status set to ${newStatus}`, "success");
    }
  } catch (err: any) {
    triggerToast(err.response?.data?.message || "Failed to change operator status", "danger");
  }
};

const openPasswordReset = (op: OperatorItem) => {
  targetOperator.value = op;
  newPassword.value = "";
  showPasswordResetModal.value = true;
};

const confirmPasswordReset = async () => {
  if (!targetOperator.value || !newPassword.value || newPassword.value.length < 6) {
    triggerToast("New password must be at least 6 characters", "danger");
    return;
  }
  isResettingPassword.value = true;
  try {
    const res = await axios.put(`/api/auth/operators/${targetOperator.value.id}`, {
      password: newPassword.value
    });
    if (res.data?.success) {
      triggerToast(`Password for "${targetOperator.value.name}" reset successfully!`, "success");
      showPasswordResetModal.value = false;
      targetOperator.value = null;
      newPassword.value = "";
    }
  } catch (err: any) {
    triggerToast(err.response?.data?.message || "Failed to reset password", "danger");
  } finally {
    isResettingPassword.value = false;
  }
};

const openDeleteConfirm = (op: OperatorItem) => {
  operatorToDelete.value = op;
  showDeleteConfirmModal.value = true;
};

const confirmDelete = async () => {
  if (!operatorToDelete.value) return;
  isDeleting.value = true;
  try {
    const res = await axios.delete(`/api/auth/operators/${operatorToDelete.value.id}`);
    if (res.data?.success) {
      triggerToast("Operator deleted successfully", "success");
      showDeleteConfirmModal.value = false;
      operatorToDelete.value = null;
      fetchOperators();
    }
  } catch (err: any) {
    triggerToast(err.response?.data?.message || "Failed to delete operator", "danger");
  } finally {
    isDeleting.value = false;
  }
};

watch(
  () => props.show,
  (val) => {
    if (val) {
      fetchOperators();
    } else {
      resetForm();
    }
  }
);

onMounted(() => {
  if (props.show) {
    fetchOperators();
  }
});
</script>

<template>
  <div v-if="show" class="jupiter-modal-backdrop d-flex align-items-center justify-content-center p-3">
    <div class="jupiter-modal-dialog">
      <div class="jupiter-modal-content shadow-lg">
        
        <!-- Modal Header -->
        <div class="jupiter-modal-header d-flex align-items-center justify-content-between px-4 py-3">
          <div class="d-flex align-items-center">
            <div class="modal-badge-icon me-3">
              <i class="bi bi-people-fill"></i>
            </div>
            <div>
              <h6 class="modal-title-text mb-0">Operator Management</h6>
              <span class="modal-subtitle-text">
                Manage accounts that have shared access to your bond analysis workspace
              </span>
            </div>
          </div>
          <button
            type="button"
            class="btn-close btn-close-white"
            title="Close"
            @click="emit('close')"
          ></button>
        </div>

        <!-- Modal Scrollable Body -->
        <div class="jupiter-modal-body px-4 py-3">
          
          <!-- Inner Notification Toast -->
          <div
            v-if="toastMessage"
            :class="['alert', toastType === 'success' ? 'alert-success bg-success bg-opacity-10 text-success border-success' : 'alert-danger bg-danger bg-opacity-10 text-danger border-danger', 'py-2 px-3 small rounded d-flex align-items-center justify-content-between mb-3']"
          >
            <div class="d-flex align-items-center">
              <i :class="[toastType === 'success' ? 'bi bi-check-circle-fill' : 'bi bi-exclamation-triangle-fill', 'me-2']"></i>
              <span>{{ toastMessage }}</span>
            </div>
            <button type="button" class="btn-close btn-close-white small" style="transform: scale(0.8);" @click="toastMessage = null"></button>
          </div>

          <!-- Top Toolbar: Stats & Add Button -->
          <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
            <div class="d-flex align-items-center gap-2">
              <span class="badge-stat">
                Total: <strong class="text-white">{{ operators.length }}</strong>
              </span>
              <span class="badge-stat badge-stat-active">
                Active: <strong>{{ operators.filter(o => o.status === 'active').length }}</strong>
              </span>
            </div>

            <button
              type="button"
              :class="['btn btn-sm d-inline-flex align-items-center gap-2 px-3 py-1.5 rounded fw-medium', showAddForm ? 'btn-outline-secondary' : 'btn-jupiter-primary']"
              @click="showAddForm ? resetForm() : (showAddForm = true)"
            >
              <i :class="showAddForm ? 'bi bi-x-lg' : 'bi bi-person-plus-fill'"></i>
              <span>{{ showAddForm ? 'Cancel' : 'Add New Operator' }}</span>
            </button>
          </div>

          <!-- Add / Edit Operator Form Card -->
          <div v-if="showAddForm" class="operator-form-card p-3 mb-3 rounded">
            <div class="form-card-title mb-3 d-flex align-items-center">
              <i class="bi bi-person-badge text-info me-2"></i>
              <span>{{ editingOperator ? `Edit Operator: ${editingOperator.name}` : 'Create New Operator' }}</span>
            </div>

            <form @submit.prevent="handleSaveOperator" class="row g-3">
              <!-- Name -->
              <div class="col-md-4">
                <label class="form-label field-label mb-1">Full Name <span class="text-danger">*</span></label>
                <input
                  v-model="formName"
                  type="text"
                  class="form-control form-control-sm jupiter-input"
                  placeholder="e.g. Rahim Ali"
                  required
                />
              </div>

              <!-- Email -->
              <div class="col-md-4">
                <label class="form-label field-label mb-1">Email Address <span class="text-danger">*</span></label>
                <input
                  v-model="formEmail"
                  type="email"
                  class="form-control form-control-sm jupiter-input"
                  placeholder="e.g. operator@company.com"
                  :disabled="!!editingOperator"
                  required
                />
              </div>

              <!-- Password -->
              <div class="col-md-4">
                <label class="form-label field-label mb-1">
                  {{ editingOperator ? 'New Password (optional)' : 'Password' }} <span v-if="!editingOperator" class="text-danger">*</span>
                </label>
                <div class="position-relative">
                  <input
                    v-model="formPassword"
                    :type="showPassword ? 'text' : 'password'"
                    class="form-control form-control-sm jupiter-input pe-4"
                    :placeholder="editingOperator ? 'Leave blank to keep current' : 'Min 6 characters'"
                    :required="!editingOperator"
                  />
                  <button
                    type="button"
                    class="btn-toggle-eye position-absolute top-50 end-0 translate-middle-y me-2 border-0 bg-transparent text-muted"
                    @click="showPassword = !showPassword"
                  >
                    <i :class="showPassword ? 'bi bi-eye-slash' : 'bi bi-eye'"></i>
                  </button>
                </div>
              </div>

              <!-- Action Buttons -->
              <div class="col-12 d-flex justify-content-end gap-2 mt-3 pt-2 border-top border-secondary border-opacity-10">
                <button type="button" class="btn btn-sm btn-outline-secondary px-3" @click="resetForm">
                  Cancel
                </button>
                <button
                  type="submit"
                  class="btn btn-sm btn-jupiter-primary px-3 fw-medium d-inline-flex align-items-center gap-2"
                  :disabled="isSaving"
                >
                  <span v-if="isSaving" class="spinner-border spinner-border-sm"></span>
                  <i v-else :class="editingOperator ? 'bi bi-check-lg' : 'bi bi-plus-lg'"></i>
                  <span>{{ editingOperator ? 'Save Changes' : 'Create Operator' }}</span>
                </button>
              </div>
            </form>
          </div>

          <!-- Operators Table Container -->
          <div class="jupiter-table-container">
            <table class="table jupiter-table mb-0 align-middle">
              <thead>
                <tr>
                  <th style="width: 45px;" class="ps-3 text-center">#</th>
                  <th>OPERATOR NAME &amp; EMAIL</th>
                  <th style="width: 110px;">ROLE</th>
                  <th style="width: 110px;">STATUS</th>
                  <th style="width: 130px;">CREATED DATE</th>
                  <th style="width: 130px;" class="text-end pe-3">ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                <!-- Loading State -->
                <tr v-if="isLoading">
                  <td colspan="6" class="text-center py-4 text-muted">
                    <span class="spinner-border spinner-border-sm me-2 text-info"></span>
                    Loading operators...
                  </td>
                </tr>

                <!-- Empty State -->
                <tr v-else-if="operators.length === 0">
                  <td colspan="6" class="text-center py-5">
                    <div class="d-flex flex-column align-items-center justify-content-center py-2">
                      <div class="empty-icon-circle mb-3">
                        <i class="bi bi-people fs-4 text-muted"></i>
                      </div>
                      <div class="fw-medium text-white mb-1">No Operators Added Yet</div>
                      <p class="small text-muted mb-3" style="max-width: 320px; font-size: 0.78rem;">
                        Add staff or data entry operators to share your account's bond analysis workspace.
                      </p>
                      <button
                        type="button"
                        class="btn btn-sm btn-jupiter-primary px-3 rounded d-inline-flex align-items-center gap-2"
                        @click="showAddForm = true"
                      >
                        <i class="bi bi-plus-lg"></i>
                        <span>Add First Operator</span>
                      </button>
                    </div>
                  </td>
                </tr>

                <!-- Operators List Rows -->
                <tr v-for="(op, idx) in operators" :key="op.id">
                  <td class="ps-3 text-center cell-num">{{ idx + 1 }}</td>
                  <td>
                    <div class="d-flex align-items-center">
                      <div class="operator-avatar me-2.5">
                        {{ op.name ? op.name.charAt(0).toUpperCase() : 'O' }}
                      </div>
                      <div>
                        <div class="cell-main">{{ op.name }}</div>
                        <div class="cell-muted font-monospace" style="font-size: 0.74rem;">{{ op.email }}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span class="badge-role-op">
                      <i class="bi bi-person-badge me-1"></i> Operator
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      :class="['btn btn-xs status-toggle-btn d-inline-flex align-items-center gap-1.5 px-2 py-0.5 rounded font-monospace', op.status === 'active' ? 'status-btn-active' : 'status-btn-suspended']"
                      :title="`Click to ${op.status === 'active' ? 'suspend' : 'activate'}`"
                      @click="handleToggleStatus(op)"
                    >
                      <span class="status-dot"></span>
                      <span>{{ op.status === 'active' ? 'Active' : 'Suspended' }}</span>
                    </button>
                  </td>
                  <td class="cell-muted font-monospace" style="font-size: 0.76rem;">
                    {{ op.createdAt ? new Date(op.createdAt).toLocaleDateString() : '-' }}
                  </td>
                  <td class="text-end pe-3">
                    <div class="d-flex align-items-center justify-content-end gap-1.5">
                      <!-- Edit Info -->
                      <button
                        type="button"
                        class="btn-icon-action btn-action-edit"
                        title="Edit Operator"
                        @click="startEdit(op)"
                      >
                        <i class="bi bi-pencil"></i>
                      </button>

                      <!-- Reset Password -->
                      <button
                        type="button"
                        class="btn-icon-action btn-action-key"
                        title="Reset Password"
                        @click="openPasswordReset(op)"
                      >
                        <i class="bi bi-key"></i>
                      </button>

                      <!-- Delete Operator -->
                      <button
                        type="button"
                        class="btn-icon-action btn-action-delete"
                        title="Delete Operator"
                        @click="openDeleteConfirm(op)"
                      >
                        <i class="bi bi-trash"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Modal Footer (Fixed at Bottom) -->
        <div class="jupiter-modal-footer px-4 py-2.5 d-flex align-items-center justify-content-between">
          <div class="text-muted small d-flex align-items-center" style="font-size: 0.76rem;">
            <i class="bi bi-shield-check text-success me-1.5"></i>
            <span>All operators share your uploaded files, reports and database seamlessly.</span>
          </div>
          <button type="button" class="btn btn-secondary btn-sm px-4" @click="emit('close')">
            Close
          </button>
        </div>
      </div>
    </div>

    <!-- Password Reset Sub-Modal -->
    <div v-if="showPasswordResetModal" class="sub-modal-backdrop d-flex align-items-center justify-content-center p-3">
      <div class="sub-modal-card p-4 rounded shadow-lg">
        <div class="d-flex align-items-center mb-2">
          <i class="bi bi-key-fill text-warning me-2 fs-5"></i>
          <h6 class="text-white fw-bold mb-0">Reset Operator Password</h6>
        </div>
        <p class="text-muted small mb-3" style="font-size: 0.78rem;">
          Set a new login password for <strong>{{ targetOperator?.name }}</strong> ({{ targetOperator?.email }}).
        </p>

        <div class="mb-3">
          <label class="form-label field-label mb-1">New Password</label>
          <input
            v-model="newPassword"
            type="text"
            class="form-control form-control-sm jupiter-input font-monospace"
            placeholder="Min 6 characters"
            required
          />
        </div>

        <div class="d-flex justify-content-end gap-2">
          <button type="button" class="btn btn-sm btn-outline-secondary px-3" @click="showPasswordResetModal = false">
            Cancel
          </button>
          <button
            type="button"
            class="btn btn-sm btn-warning px-3 fw-medium d-inline-flex align-items-center gap-1.5"
            :disabled="isResettingPassword || !newPassword || newPassword.length < 6"
            @click="confirmPasswordReset"
          >
            <span v-if="isResettingPassword" class="spinner-border spinner-border-sm"></span>
            <span>Update Password</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Delete Confirmation Sub-Modal -->
    <div v-if="showDeleteConfirmModal" class="sub-modal-backdrop d-flex align-items-center justify-content-center p-3">
      <div class="sub-modal-card p-4 rounded shadow-lg">
        <div class="d-flex align-items-center mb-2">
          <i class="bi bi-exclamation-octagon-fill text-danger me-2 fs-5"></i>
          <h6 class="text-white fw-bold mb-0">Delete Operator Account?</h6>
        </div>
        <p class="text-muted small mb-3" style="font-size: 0.78rem;">
          Are you sure you want to remove <strong>{{ operatorToDelete?.name }}</strong>? They will no longer be able to log in. Your shared bond data will remain safe.
        </p>

        <div class="d-flex justify-content-end gap-2">
          <button type="button" class="btn btn-sm btn-outline-secondary px-3" @click="showDeleteConfirmModal = false">
            Cancel
          </button>
          <button
            type="button"
            class="btn btn-sm btn-danger px-3 fw-medium d-inline-flex align-items-center gap-1.5"
            :disabled="isDeleting"
            @click="confirmDelete"
          >
            <span v-if="isDeleting" class="spinner-border spinner-border-sm"></span>
            <span>Yes, Delete</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Modal Backdrop & Container matching Jupiter Clean Theme */
.jupiter-modal-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(4, 8, 16, 0.85);
  backdrop-filter: blur(8px);
  z-index: 1050;
  animation: fadeIn 0.2s ease-out;
}

.jupiter-modal-dialog {
  width: 100%;
  max-width: 900px;
  max-height: 88vh;
  display: flex;
  flex-direction: column;
}

.jupiter-modal-content {
  background: #101623;
  border: 1px solid #1e293b;
  border-radius: 10px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  max-height: 88vh;
}

.jupiter-modal-header {
  background: #101623;
  border-bottom: 1px solid #1e293b;
  flex-shrink: 0;
}

.modal-badge-icon {
  width: 34px;
  height: 34px;
  border-radius: 6px;
  background: rgba(56, 189, 248, 0.12);
  border: 1px solid rgba(56, 189, 248, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1rem;
  color: #38bdf8;
  flex-shrink: 0;
}

.modal-title-text {
  font-size: 0.95rem;
  font-weight: 500;
  color: #cbd5e1;
  letter-spacing: 0.01em;
}

.modal-subtitle-text {
  font-size: 0.76rem;
  color: #64748b;
  display: block;
}

/* Modal Scrollable Body */
.jupiter-modal-body {
  background: #0d121c;
  overflow-y: auto;
  flex: 1 1 auto;
  max-height: calc(88vh - 120px);
}

.jupiter-modal-footer {
  background: #101623;
  border-top: 1px solid #1e293b;
  flex-shrink: 0;
}

/* Stats Badges */
.badge-stat {
  background: #161e2c;
  border: 1px solid #222e42;
  color: #94a3b8;
  font-size: 0.75rem;
  padding: 0.3rem 0.65rem;
  border-radius: 4px;
  font-family: monospace;
}

.badge-stat-active {
  background: rgba(16, 185, 129, 0.08);
  border-color: rgba(16, 185, 129, 0.25);
  color: #34d399;
}

/* Button Jupiter Primary */
.btn-jupiter-primary {
  background: #1e3a8a;
  border: 1px solid #2563eb;
  color: #ffffff;
  font-size: 0.82rem;
  padding: 0.35rem 0.85rem;
  border-radius: 5px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-jupiter-primary:hover:not(:disabled) {
  background: #2563eb;
  border-color: #3b82f6;
  color: #ffffff;
}

.btn-jupiter-primary:disabled {
  background: #1e293b;
  border-color: #334155;
  color: #64748b;
  cursor: not-allowed;
}

/* Operator Form Card */
.operator-form-card {
  background: #131b29;
  border: 1px solid #1e293b;
}

.form-card-title {
  color: #cbd5e1;
  font-size: 0.86rem;
  font-weight: 500;
}

.field-label {
  color: #78889b;
  font-size: 0.76rem;
}

.jupiter-input {
  background: #0b0f17 !important;
  border: 1px solid #233044 !important;
  color: #cbd5e1 !important;
  border-radius: 5px !important;
  font-size: 0.82rem !important;
}

.jupiter-input:focus {
  border-color: #38bdf8 !important;
  box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.15) !important;
}

/* Table styling */
.jupiter-table-container {
  background: #111722;
  border: 1px solid #1e293b;
  border-radius: 6px;
  overflow: hidden;
}

.jupiter-table {
  width: 100%;
  font-size: 0.81rem;
  color: #cbd5e1;
  border-collapse: collapse;
}

.jupiter-table thead th {
  background: #161e2c !important;
  color: #78889b !important;
  font-weight: 500;
  font-size: 0.73rem;
  letter-spacing: 0.02em;
  padding: 0.6rem 0.75rem;
  border-bottom: 1px solid #222e42 !important;
  white-space: nowrap;
}

.jupiter-table tbody td {
  padding: 0.55rem 0.75rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.035);
  background: transparent;
  color: #cbd5e1;
}

.jupiter-table tbody tr:hover td {
  background: rgba(148, 163, 184, 0.04);
}

.cell-num {
  color: #556579;
  font-size: 0.78rem;
}

.cell-main {
  color: #cbd5e1;
  font-weight: 500;
  font-size: 0.82rem;
}

.cell-muted {
  color: #718296;
}

.operator-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(56, 189, 248, 0.15);
  border: 1px solid rgba(56, 189, 248, 0.3);
  color: #38bdf8;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.78rem;
  flex-shrink: 0;
}

.badge-role-op {
  background: rgba(56, 189, 248, 0.08);
  border: 1px solid rgba(56, 189, 248, 0.2);
  color: #38bdf8;
  font-size: 0.72rem;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
}

/* Status Button */
.status-toggle-btn {
  border: 1px solid transparent;
  font-size: 0.72rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.status-btn-active {
  background: rgba(16, 185, 129, 0.1);
  border-color: rgba(16, 185, 129, 0.25);
  color: #34d399;
}

.status-btn-active:hover {
  background: rgba(16, 185, 129, 0.2);
}

.status-btn-suspended {
  background: rgba(239, 68, 68, 0.1);
  border-color: rgba(239, 68, 68, 0.25);
  color: #f87171;
}

.status-btn-suspended:hover {
  background: rgba(239, 68, 68, 0.2);
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

/* Action Icons */
.btn-icon-action {
  width: 26px;
  height: 26px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  font-size: 0.78rem;
  border: 1px solid transparent;
  background: transparent;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-action-edit {
  color: #94a3b8;
  border-color: #263447;
}

.btn-action-edit:hover {
  color: #ffffff;
  background: #1e293b;
  border-color: #334155;
}

.btn-action-key {
  color: #f59e0b;
  border-color: rgba(245, 158, 11, 0.25);
}

.btn-action-key:hover {
  background: rgba(245, 158, 11, 0.15);
  color: #fbbf24;
}

.btn-action-delete {
  color: #ef4444;
  border-color: rgba(239, 68, 68, 0.25);
}

.btn-action-delete:hover {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
}

.empty-icon-circle {
  width: 46px;
  height: 46px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.03);
  border: 1px dashed rgba(255, 255, 255, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Sub-modal */
.sub-modal-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(4px);
  z-index: 1100;
}

.sub-modal-card {
  background: #111722;
  border: 1px solid #1e293b;
  max-width: 420px;
  width: 100%;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
</style>
