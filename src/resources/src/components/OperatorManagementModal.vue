<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
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

// Toast
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

onMounted(() => {
  if (props.show) {
    fetchOperators();
  }
});
</script>

<template>
  <div v-if="show" class="operator-modal-backdrop d-flex align-items-center justify-content-center">
    <div class="operator-modal-dialog">
      <div class="operator-modal-content">
        <!-- Modal Header -->
        <div class="operator-modal-header d-flex align-items-center justify-content-between px-4 py-3 border-bottom border-secondary border-opacity-25">
          <div class="d-flex align-items-center gap-2.5">
            <div class="modal-icon-badge">
              <i class="bi bi-people-fill text-primary"></i>
            </div>
            <div>
              <h5 class="modal-title text-white fw-bold mb-0 fs-5">Operator Settings</h5>
              <p class="text-muted small mb-0" style="font-size: 0.78rem;">
                Manage operators who have shared data access under your account
              </p>
            </div>
          </div>
          <button
            type="button"
            class="btn-close-modal"
            title="Close"
            @click="emit('close')"
          >
            <i class="bi bi-x-lg"></i>
          </button>
        </div>

        <!-- Modal Body -->
        <div class="operator-modal-body p-4">
          <!-- Notification Toast inside modal -->
          <div
            v-if="toastMessage"
            :class="['alert', toastType === 'success' ? 'alert-success bg-success bg-opacity-10 text-success border-success' : 'alert-danger bg-danger bg-opacity-10 text-danger border-danger', 'py-2 px-3 small rounded-3 d-flex align-items-center justify-content-between mb-3']"
          >
            <div class="d-flex align-items-center gap-2">
              <i :class="toastType === 'success' ? 'bi bi-check-circle-fill' : 'bi bi-exclamation-triangle-fill'"></i>
              <span>{{ toastMessage }}</span>
            </div>
            <button type="button" class="btn-close btn-close-white small" style="transform: scale(0.8);" @click="toastMessage = null"></button>
          </div>

          <!-- Top Toolbar: Stats & Add Button -->
          <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
            <div class="d-flex align-items-center gap-2">
              <span class="badge bg-dark border border-secondary text-white px-2.5 py-1.5 rounded-pill font-monospace" style="font-size: 0.75rem;">
                Total: <strong>{{ operators.length }}</strong>
              </span>
              <span class="badge bg-success bg-opacity-10 border border-success border-opacity-25 text-success px-2.5 py-1.5 rounded-pill font-monospace" style="font-size: 0.75rem;">
                Active: <strong>{{ operators.filter(o => o.status === 'active').length }}</strong>
              </span>
            </div>

            <button
              type="button"
              :class="['btn btn-sm d-inline-flex align-items-center gap-2 px-3 py-1.5 rounded-3 fw-semibold', showAddForm ? 'btn-outline-secondary' : 'btn-primary']"
              @click="showAddForm ? resetForm() : (showAddForm = true)"
            >
              <i :class="showAddForm ? 'bi bi-x-circle' : 'bi bi-person-plus-fill'"></i>
              <span>{{ showAddForm ? 'Cancel' : 'Add New Operator' }}</span>
            </button>
          </div>

          <!-- Form Area (Add / Edit) -->
          <div v-if="showAddForm" class="operator-form-card p-3 mb-3 rounded-3 border border-primary border-opacity-25">
            <div class="fw-bold text-white fs-6 mb-2 d-flex align-items-center gap-2">
              <i class="bi bi-person-badge text-primary"></i>
              <span>{{ editingOperator ? `Edit Operator: ${editingOperator.name}` : 'Create New Operator' }}</span>
            </div>

            <form @submit.prevent="handleSaveOperator" class="row g-3">
              <!-- Name -->
              <div class="col-md-4">
                <label class="form-label text-muted small mb-1">Full Name <span class="text-danger">*</span></label>
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
                <label class="form-label text-muted small mb-1">Email Address <span class="text-danger">*</span></label>
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
                <label class="form-label text-muted small mb-1">
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

              <!-- Form Buttons -->
              <div class="col-12 d-flex justify-content-end gap-2 mt-2">
                <button type="button" class="btn btn-sm btn-outline-secondary px-3" @click="resetForm">
                  Cancel
                </button>
                <button
                  type="submit"
                  class="btn btn-sm btn-primary px-3 fw-semibold d-inline-flex align-items-center gap-1.5"
                  :disabled="isSaving"
                >
                  <span v-if="isSaving" class="spinner-border spinner-border-sm"></span>
                  <span>{{ editingOperator ? 'Save Changes' : 'Create Operator' }}</span>
                </button>
              </div>
            </form>
          </div>

          <!-- Operators Table -->
          <div class="table-responsive operator-table-wrapper rounded-3 border border-secondary border-opacity-25">
            <table class="table table-dark table-hover mb-0 align-middle">
              <thead>
                <tr class="table-header-row text-muted small">
                  <th style="width: 50px;" class="ps-3">#</th>
                  <th>Operator Name &amp; Email</th>
                  <th style="width: 110px;">Role</th>
                  <th style="width: 110px;">Status</th>
                  <th style="width: 130px;">Created Date</th>
                  <th style="width: 140px;" class="text-end pe-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                <!-- Loading State -->
                <tr v-if="isLoading">
                  <td colspan="6" class="text-center py-4 text-muted">
                    <span class="spinner-border spinner-border-sm me-2 text-primary"></span>
                    Loading operators...
                  </td>
                </tr>

                <!-- Empty State -->
                <tr v-else-if="operators.length === 0">
                  <td colspan="6" class="text-center py-5">
                    <div class="d-flex flex-column align-items-center justify-content-center text-muted">
                      <div class="empty-icon-circle mb-2">
                        <i class="bi bi-people fs-3"></i>
                      </div>
                      <div class="fw-semibold text-white mb-1">No Operators Added Yet</div>
                      <p class="small text-muted mb-3" style="max-width: 320px;">
                        Add staff or data entry operators to share your account's bond analysis workspace.
                      </p>
                      <button
                        type="button"
                        class="btn btn-sm btn-primary px-3 rounded-pill"
                        @click="showAddForm = true"
                      >
                        <i class="bi bi-plus-lg me-1"></i> Add First Operator
                      </button>
                    </div>
                  </td>
                </tr>

                <!-- Operator Row -->
                <tr v-for="(op, idx) in operators" :key="op.id">
                  <td class="ps-3 text-muted font-monospace small">{{ idx + 1 }}</td>
                  <td>
                    <div class="d-flex align-items-center gap-2.5">
                      <div class="operator-avatar">
                        {{ op.name ? op.name.charAt(0).toUpperCase() : 'O' }}
                      </div>
                      <div>
                        <div class="text-white fw-bold small">{{ op.name }}</div>
                        <div class="text-muted font-monospace" style="font-size: 0.75rem;">{{ op.email }}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span class="badge bg-info bg-opacity-10 text-info border border-info border-opacity-25 px-2 py-1 rounded-pill" style="font-size: 0.72rem;">
                      <i class="bi bi-person-badge me-1"></i> Operator
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      :class="['btn btn-xs status-toggle-btn d-inline-flex align-items-center gap-1.5 px-2 py-1 rounded-pill font-monospace', op.status === 'active' ? 'status-btn-active' : 'status-btn-suspended']"
                      :title="`Click to ${op.status === 'active' ? 'suspend' : 'activate'}`"
                      @click="handleToggleStatus(op)"
                    >
                      <span class="status-dot"></span>
                      <span>{{ op.status === 'active' ? 'Active' : 'Suspended' }}</span>
                    </button>
                  </td>
                  <td class="text-muted small font-monospace">
                    {{ op.createdAt ? new Date(op.createdAt).toLocaleDateString() : '-' }}
                  </td>
                  <td class="text-end pe-3">
                    <div class="d-flex align-items-center justify-content-end gap-1.5">
                      <!-- Edit Info -->
                      <button
                        type="button"
                        class="btn btn-icon-action btn-outline-light"
                        title="Edit Operator"
                        @click="startEdit(op)"
                      >
                        <i class="bi bi-pencil"></i>
                      </button>

                      <!-- Reset Password -->
                      <button
                        type="button"
                        class="btn btn-icon-action btn-outline-warning"
                        title="Reset Password"
                        @click="openPasswordReset(op)"
                      >
                        <i class="bi bi-key"></i>
                      </button>

                      <!-- Delete Operator -->
                      <button
                        type="button"
                        class="btn btn-icon-action btn-outline-danger"
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

        <!-- Modal Footer -->
        <div class="operator-modal-footer px-4 py-3 border-top border-secondary border-opacity-25 d-flex align-items-center justify-content-between">
          <div class="text-muted small" style="font-size: 0.75rem;">
            <i class="bi bi-shield-check text-success me-1"></i> All operators share your database &amp; reports seamlessly.
          </div>
          <button type="button" class="btn btn-secondary btn-sm px-4" @click="emit('close')">
            Done
          </button>
        </div>
      </div>
    </div>

    <!-- Password Reset Sub-Modal -->
    <div v-if="showPasswordResetModal" class="sub-modal-backdrop d-flex align-items-center justify-content-center">
      <div class="sub-modal-card p-4 rounded-3 border border-warning shadow-lg">
        <h6 class="text-white fw-bold mb-1 d-flex align-items-center gap-2">
          <i class="bi bi-key-fill text-warning"></i> Reset Operator Password
        </h6>
        <p class="text-muted small mb-3">
          Set a new login password for <strong>{{ targetOperator?.name }}</strong> ({{ targetOperator?.email }}).
        </p>

        <div class="mb-3">
          <label class="form-label text-muted small mb-1">New Password</label>
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
            class="btn btn-sm btn-warning px-3 fw-semibold d-inline-flex align-items-center gap-1.5"
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
    <div v-if="showDeleteConfirmModal" class="sub-modal-backdrop d-flex align-items-center justify-content-center">
      <div class="sub-modal-card p-4 rounded-3 border border-danger shadow-lg">
        <h6 class="text-white fw-bold mb-1 d-flex align-items-center gap-2">
          <i class="bi bi-exclamation-octagon-fill text-danger"></i> Delete Operator Account?
        </h6>
        <p class="text-muted small mb-3">
          Are you sure you want to remove <strong>{{ operatorToDelete?.name }}</strong>? They will no longer be able to log in. Your shared bond data will remain safe.
        </p>

        <div class="d-flex justify-content-end gap-2">
          <button type="button" class="btn btn-sm btn-outline-secondary px-3" @click="showDeleteConfirmModal = false">
            Cancel
          </button>
          <button
            type="button"
            class="btn btn-sm btn-danger px-3 fw-semibold d-inline-flex align-items-center gap-1.5"
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
.operator-modal-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(4, 7, 13, 0.82);
  backdrop-filter: blur(6px);
  z-index: 2050;
  animation: fadeIn 0.2s ease-out;
}

.operator-modal-dialog {
  width: 100%;
  max-width: 860px;
  max-height: 90vh;
  display: flex;
  margin: 1.5rem;
}

.operator-modal-content {
  width: 100%;
  background: #111827;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 14px;
  box-shadow: 0 20px 45px rgba(0, 0, 0, 0.7);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal-icon-badge {
  width: 36px;
  height: 36px;
  border-radius: 9px;
  background: rgba(56, 189, 248, 0.12);
  border: 1px solid rgba(56, 189, 248, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
}

.btn-close-modal {
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 1.1rem;
  padding: 4px 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-close-modal:hover {
  color: #ffffff;
  background: rgba(255, 255, 255, 0.08);
}

.operator-form-card {
  background: rgba(15, 23, 42, 0.7);
}

.jupiter-input {
  background: #0b0f19 !important;
  border: 1px solid rgba(255, 255, 255, 0.15) !important;
  color: #f8fafc !important;
  border-radius: 6px !important;
}

.jupiter-input:focus {
  border-color: #38bdf8 !important;
  box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.2) !important;
}

.operator-table-wrapper {
  background: #0b0f19;
  max-height: 380px;
  overflow-y: auto;
}

.table-header-row th {
  background: #131d2e !important;
  font-size: 0.76rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 600;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1) !important;
}

.operator-avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: linear-gradient(135deg, rgba(56, 189, 248, 0.25), rgba(99, 102, 241, 0.25));
  border: 1px solid rgba(56, 189, 248, 0.4);
  color: #38bdf8;
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.82rem;
  flex-shrink: 0;
}

.status-toggle-btn {
  border: 1px solid transparent;
  font-size: 0.72rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.status-btn-active {
  background: rgba(34, 197, 94, 0.12);
  border-color: rgba(34, 197, 94, 0.35);
  color: #4ade80;
}

.status-btn-active:hover {
  background: rgba(34, 197, 94, 0.22);
}

.status-btn-suspended {
  background: rgba(239, 68, 68, 0.12);
  border-color: rgba(239, 68, 68, 0.35);
  color: #f87171;
}

.status-btn-suspended:hover {
  background: rgba(239, 68, 68, 0.22);
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.btn-icon-action {
  width: 28px;
  height: 28px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  font-size: 0.8rem;
  transition: all 0.15s ease;
}

.empty-icon-circle {
  width: 54px;
  height: 54px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.04);
  border: 1px dashed rgba(255, 255, 255, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
}

.sub-modal-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.75);
  z-index: 2200;
}

.sub-modal-card {
  background: #111827;
  max-width: 420px;
  width: 90%;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
</style>
