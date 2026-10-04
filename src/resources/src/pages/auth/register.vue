<template>
  <div class="auth-page-wrapper min-vh-100 d-flex align-items-center justify-content-center p-3">
    <div class="auth-card-container col-12 col-sm-10 col-md-8 col-lg-5 col-xl-4">
      <div class="card border-0 shadow-lg rounded-4 overflow-hidden bg-white">
        <!-- Brand Header with Premium Gradient -->
        <div class="text-center py-4 px-4" style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);">
          <div class="d-inline-flex align-items-center justify-content-center rounded-circle p-2 shadow-sm mb-2" style="width: 52px; height: 52px; background: rgba(251, 191, 36, 0.15); border: 1px solid rgba(251, 191, 36, 0.35);">
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="jupRegGrad" x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stop-color="#fbbf24" />
                  <stop offset="45%" stop-color="#f43f5e" />
                  <stop offset="100%" stop-color="#6366f1" />
                </linearGradient>
                <linearGradient id="ringRegGrad" x1="2" y1="10" x2="30" y2="22" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.95" />
                  <stop offset="50%" stop-color="#c084fc" stop-opacity="0.85" />
                  <stop offset="100%" stop-color="#f43f5e" stop-opacity="0.95" />
                </linearGradient>
              </defs>
              <circle cx="16" cy="16" r="9.5" fill="url(#jupRegGrad)" />
              <ellipse cx="16" cy="16" rx="14" ry="5.2" stroke="url(#ringRegGrad)" stroke-width="1.8" transform="rotate(-22 16 16)" stroke-linecap="round" />
            </svg>
          </div>
          <h4 class="fw-bold text-white mb-1">Jupiter</h4>
          <p class="text-white-50 small mb-0">{{ isPendingStep ? 'Registration Submitted' : 'Create New Account' }}</p>
        </div>

        <div class="card-body p-4">
          <!-- Alert Message -->
          <div v-if="errorMessage" class="alert alert-danger alert-dismissible fade show small py-2 px-3 mb-3 d-flex align-items-center gap-2" role="alert">
            <i class="bi bi-exclamation-triangle-fill fs-6 flex-shrink-0"></i>
            <div>{{ errorMessage }}</div>
            <button type="button" class="btn-close btn-sm ms-auto" @click="errorMessage = ''"></button>
          </div>

          <div v-if="successMessage && !isPendingStep" class="alert alert-success alert-dismissible fade show small py-2 px-3 mb-3 d-flex align-items-center gap-2" role="alert">
            <i class="bi bi-check-circle-fill fs-6 flex-shrink-0 text-success"></i>
            <div>{{ successMessage }}</div>
            <button type="button" class="btn-close btn-sm ms-auto" @click="successMessage = ''"></button>
          </div>

          <!-- ========================================== -->
          <!-- PENDING APPROVAL CONFIRMATION SCREEN       -->
          <!-- ========================================== -->
          <div v-if="isPendingStep" class="text-center py-3">
            <div class="d-inline-flex p-3 rounded-circle bg-warning bg-opacity-15 text-warning mb-3">
              <i class="bi bi-hourglass-split display-5"></i>
            </div>
            <h5 class="fw-bold text-dark mb-2">Registration Submitted!</h5>
            <p class="text-muted small mb-4 px-2">
              Your account for <strong class="text-dark">{{ email }}</strong> has been registered and is awaiting approval by the Administrator. Once approved, your 30-day billing cycle will be activated.
            </p>

            <router-link to="/login" class="btn btn-primary w-100 py-2 fw-semibold d-inline-flex align-items-center justify-content-center gap-2 rounded-3 shadow-sm">
              <i class="bi bi-box-arrow-in-right"></i>
              <span>Go to Sign In</span>
            </router-link>
          </div>

          <!-- ========================================== -->
          <!-- STEP 1: REGISTRATION FORM                  -->
          <!-- ========================================== -->
          <form v-else @submit.prevent="onRegisterSubmit">
            <div class="mb-3">
              <label class="form-label small fw-semibold text-dark">Full Name</label>
              <div class="input-group">
                <span class="input-group-text bg-light border-end-0"><i class="bi bi-person text-muted"></i></span>
                <input
                  v-model="name"
                  type="text"
                  class="form-control border-start-0"
                  placeholder="Enter your full name"
                  required
                  autofocus />
              </div>
            </div>

            <div class="mb-3">
              <label class="form-label small fw-semibold text-dark">Email Address</label>
              <div class="input-group">
                <span class="input-group-text bg-light border-end-0"><i class="bi bi-envelope text-muted"></i></span>
                <input
                  v-model="email"
                  type="email"
                  class="form-control border-start-0"
                  placeholder="name@company.com"
                  required />
              </div>
            </div>

            <div class="mb-3">
              <label class="form-label small fw-semibold text-dark">Password</label>
              <div class="input-group">
                <span class="input-group-text bg-light border-end-0"><i class="bi bi-lock text-muted"></i></span>
                <input
                  v-model="password"
                  :type="showPassword ? 'text' : 'password'"
                  class="form-control border-start-0 border-end-0"
                  placeholder="Minimum 6 characters"
                  required />
                <button
                  type="button"
                  class="input-group-text bg-white border-start-0 text-muted"
                  @click="showPassword = !showPassword">
                  <i :class="showPassword ? 'bi bi-eye-slash' : 'bi bi-eye'"></i>
                </button>
              </div>
              <div class="form-text small text-muted">Password must be at least 6 characters long</div>
            </div>

            <div class="mb-4">
              <label class="form-label small fw-semibold text-dark">Confirm Password</label>
              <div class="input-group">
                <span class="input-group-text bg-light border-end-0"><i class="bi bi-lock-fill text-muted"></i></span>
                <input
                  v-model="passwordConfirmation"
                  :type="showPasswordConfirm ? 'text' : 'password'"
                  class="form-control border-start-0 border-end-0"
                  placeholder="Re-enter your password"
                  required />
                <button
                  type="button"
                  class="input-group-text bg-white border-start-0 text-muted"
                  @click="showPasswordConfirm = !showPasswordConfirm">
                  <i :class="showPasswordConfirm ? 'bi bi-eye-slash' : 'bi bi-eye'"></i>
                </button>
              </div>
            </div>

            <div class="alert alert-info py-2 px-3 small mb-3 border-0 bg-light d-flex align-items-center gap-2">
              <i class="bi bi-shield-lock text-primary fs-5"></i>
              <span class="text-muted" style="font-size: 0.8rem;">New accounts are approved by Admin with a 30-day renewable billing cycle.</span>
            </div>

            <button
              type="submit"
              class="btn btn-primary w-100 py-2 fw-semibold d-flex align-items-center justify-content-center gap-2 shadow-sm rounded-3"
              :disabled="loading">
              <span v-if="loading" class="spinner-border spinner-border-sm" role="status"></span>
              <i v-else class="bi bi-person-plus"></i>
              <span>{{ loading ? 'Submitting Application...' : 'Create Account' }}</span>
            </button>

            <div class="text-center mt-4 pt-2 border-top">
              <span class="text-muted small">Already have an account?</span>
              <router-link to="/login" class="ms-1 small fw-semibold text-primary text-decoration-none">
                Sign In
              </router-link>
            </div>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useHead } from "@vueuse/head";
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";

useHead({ title: "Create Account - Jupiter" });

const router = useRouter();
const auth = useAuthStore();

const name = ref("");
const email = ref("");
const password = ref("");
const passwordConfirmation = ref("");
const showPassword = ref(false);
const showPasswordConfirm = ref(false);

const isPendingStep = ref(false);
const loading = ref(false);
const errorMessage = ref("");
const successMessage = ref("");

async function onRegisterSubmit() {
  errorMessage.value = "";
  successMessage.value = "";

  if (password.value !== passwordConfirmation.value) {
    errorMessage.value = "Password confirmation does not match.";
    return;
  }

  loading.value = true;

  try {
    const res = await auth.register({
      name: name.value.trim(),
      email: email.value.trim(),
      password: password.value,
      password_confirmation: passwordConfirmation.value
    });

    isPendingStep.value = true;
    successMessage.value = res || "Registration successful! Your account has been created.";
  } catch (err: any) {
    errorMessage.value = err.message || "Failed to register account.";
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.auth-page-wrapper {
  background: #f1f5f9;
}

.auth-card-container {
  max-width: 440px;
  width: 100%;
}

.tracking-widest {
  letter-spacing: 0.35em;
}

.otp-input {
  font-family: monospace;
  background-color: #f8fafc;
  border: 2px solid #cbd5e1;
  transition: all 0.2s ease;
}

.otp-input:focus {
  background-color: #ffffff;
  border-color: #2563eb;
  box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.15);
}
</style>
