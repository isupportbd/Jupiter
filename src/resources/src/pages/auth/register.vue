<template>
  <div class="auth-page-wrapper min-vh-100 d-flex align-items-center justify-content-center p-3">
    <div class="auth-card-container">
      <div class="auth-glass-card">
        <!-- Brand Header -->
        <div class="brand-header text-center">
          <div class="brand-icon-wrap">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
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
          <h2 class="brand-title">Jupiter</h2>
          <div class="form-badge">
            <span v-if="currentStep === 1">Create New Account</span>
            <span v-else-if="currentStep === 2">Verify Email Address</span>
            <span v-else>Registration Submitted</span>
          </div>
        </div>

        <!-- Alert Message -->
        <div v-if="errorMessage" class="auth-alert alert-error">
          <i class="bi bi-exclamation-triangle-fill flex-shrink-0"></i>
          <span>{{ errorMessage }}</span>
          <button type="button" class="alert-close" @click="errorMessage = ''">&times;</button>
        </div>

        <div v-if="successMessage && currentStep !== 3" class="auth-alert alert-success">
          <i class="bi bi-check-circle-fill flex-shrink-0"></i>
          <span>{{ successMessage }}</span>
          <button type="button" class="alert-close" @click="successMessage = ''">&times;</button>
        </div>

        <!-- ========================================== -->
        <!-- STEP 3: PENDING APPROVAL CONFIRMATION       -->
        <!-- ========================================== -->
        <div v-if="currentStep === 3" class="text-center py-2">
          <div class="pending-icon-wrap mb-3">
            <i class="bi bi-hourglass-split"></i>
          </div>
          <h4 class="fw-bold text-white mb-2">Registration Submitted!</h4>
          <p class="text-secondary small mb-4 px-2">
            Your email <strong class="text-light">{{ email }}</strong> has been verified. Your account is currently awaiting approval by the Administrator. Once approved, your 30-day billing cycle will begin.
          </p>

          <router-link to="/login" class="btn-submit text-decoration-none">
            <i class="bi bi-box-arrow-in-right"></i>
            <span>Go to Sign In</span>
          </router-link>
        </div>

        <!-- ========================================== -->
        <!-- STEP 2: EMAIL OTP VERIFICATION             -->
        <!-- ========================================== -->
        <div v-else-if="currentStep === 2" class="auth-form">
          <div class="text-center mb-3">
            <p class="form-desc mb-1">
              We sent a 6-digit verification code to
            </p>
            <strong class="text-light">{{ email }}</strong>
          </div>

          <form @submit.prevent="onVerifyOtpSubmit" class="auth-form">
            <div class="field-group text-center">
              <label class="field-label">6-Digit Verification Code</label>
              <input
                ref="otpInputRef"
                v-model="otpCode"
                type="text"
                class="login-input otp-code-input"
                placeholder="••••••"
                maxlength="6"
                inputmode="numeric"
                autocomplete="one-time-code"
                required
                autofocus />
              <div class="field-hint text-center mt-1">
                <i class="bi bi-clock-history me-1"></i>
                Code expires in <strong class="text-info">{{ formattedTimeRemaining }}</strong>
              </div>
            </div>

            <button
              type="submit"
              class="btn-submit"
              :disabled="loading || otpCode.length !== 6">
              <span v-if="loading" class="spinner-border spinner-border-sm" role="status"></span>
              <i v-else class="bi bi-shield-check"></i>
              <span>{{ loading ? 'Verifying Code...' : 'Verify Email' }}</span>
            </button>
          </form>

          <!-- Resend Code -->
          <div class="text-center pt-2">
            <button
              type="button"
              class="resend-btn"
              :disabled="resendCooldown > 0 || loading"
              @click="onResendOtp">
              <i class="bi bi-arrow-repeat me-1"></i>
              <span v-if="resendCooldown > 0">Resend Code in {{ resendCooldown }}s</span>
              <span v-else>Didn't receive code? Resend</span>
            </button>
          </div>

          <div class="auth-footer">
            <button type="button" class="back-btn" @click="currentStep = 1">
              <i class="bi bi-arrow-left me-1"></i> Back to Registration Form
            </button>
          </div>
        </div>

        <!-- ========================================== -->
        <!-- STEP 1: REGISTRATION FORM                  -->
        <!-- ========================================== -->
        <form v-else @submit.prevent="onRegisterSubmit" class="auth-form">
          <div class="field-group">
            <label class="field-label">Full Name</label>
            <div class="field-wrap">
              <span class="field-icon"><i class="bi bi-person-fill"></i></span>
              <input
                v-model="name"
                type="text"
                class="login-input"
                placeholder="Enter your full name"
                required
                autofocus />
            </div>
          </div>

          <div class="field-group">
            <label class="field-label">Email Address</label>
            <div class="field-wrap">
              <span class="field-icon"><i class="bi bi-envelope-fill"></i></span>
              <input
                v-model="email"
                type="email"
                class="login-input"
                placeholder="name@company.com"
                required />
            </div>
          </div>

          <div class="field-group">
            <label class="field-label">Password</label>
            <div class="field-wrap">
              <span class="field-icon"><i class="bi bi-lock-fill"></i></span>
              <input
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                class="login-input password-input"
                placeholder="Minimum 6 characters"
                required />
              <button
                type="button"
                class="field-eye-btn"
                @click="showPassword = !showPassword"
                tabindex="-1"
                aria-label="Toggle password visibility">
                <i :class="showPassword ? 'bi bi-eye-slash-fill' : 'bi bi-eye-fill'"></i>
              </button>
            </div>
            <div class="field-hint">Password must be at least 6 characters long</div>
          </div>

          <div class="field-group">
            <label class="field-label">Confirm Password</label>
            <div class="field-wrap">
              <span class="field-icon"><i class="bi bi-shield-lock-fill"></i></span>
              <input
                v-model="passwordConfirmation"
                :type="showPasswordConfirm ? 'text' : 'password'"
                class="login-input password-input"
                placeholder="Re-enter your password"
                required />
              <button
                type="button"
                class="field-eye-btn"
                @click="showPasswordConfirm = !showPasswordConfirm"
                tabindex="-1"
                aria-label="Toggle password visibility">
                <i :class="showPasswordConfirm ? 'bi bi-eye-slash-fill' : 'bi bi-eye-fill'"></i>
              </button>
            </div>
          </div>

          <div class="approval-notice">
            <i class="bi bi-shield-check"></i>
            <span>New accounts are verified via Email OTP and approved by Admin for 30-day access.</span>
          </div>

          <button
            type="submit"
            class="btn-submit"
            :disabled="loading">
            <span v-if="loading" class="spinner-border spinner-border-sm" role="status"></span>
            <i v-else class="bi bi-send-fill"></i>
            <span>{{ loading ? 'Sending Verification Code...' : 'Send Verification Code' }}</span>
          </button>

          <div class="auth-footer">
            <span class="text-secondary small">Already have an account?</span>
            <router-link to="/login" class="auth-link">
              Sign In
            </router-link>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useHead } from "@vueuse/head";
import { ref, computed, onUnmounted, nextTick } from "vue";
import { useAuthStore } from "@/stores/auth";

useHead({ title: "Create Account - Jupiter" });

const auth = useAuthStore();

const name = ref("");
const email = ref("");
const password = ref("");
const passwordConfirmation = ref("");
const showPassword = ref(false);
const showPasswordConfirm = ref(false);

const currentStep = ref(1); // 1 = Form, 2 = OTP, 3 = Pending
const otpCode = ref("");
const loading = ref(false);
const errorMessage = ref("");
const successMessage = ref("");

const otpInputRef = ref<HTMLInputElement | null>(null);

// Countdown Timer (10 mins = 600s)
const secondsRemaining = ref(600);
let timerInterval: any = null;

const resendCooldown = ref(0);
let cooldownInterval: any = null;

const formattedTimeRemaining = computed(() => {
  const m = Math.floor(secondsRemaining.value / 60);
  const s = secondsRemaining.value % 60;
  return `${m}:${s < 10 ? "0" : ""}${s}`;
});

function startCountdown() {
  stopCountdown();
  secondsRemaining.value = 600;
  timerInterval = setInterval(() => {
    if (secondsRemaining.value > 0) {
      secondsRemaining.value--;
    } else {
      stopCountdown();
      errorMessage.value = "Verification code has expired. Please request a new code.";
    }
  }, 1000);
}

function stopCountdown() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function startResendCooldown() {
  resendCooldown.value = 60;
  if (cooldownInterval) clearInterval(cooldownInterval);
  cooldownInterval = setInterval(() => {
    if (resendCooldown.value > 0) {
      resendCooldown.value--;
    } else {
      clearInterval(cooldownInterval);
      cooldownInterval = null;
    }
  }, 1000);
}

onUnmounted(() => {
  stopCountdown();
  if (cooldownInterval) clearInterval(cooldownInterval);
});

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

    currentStep.value = 2;
    otpCode.value = "";
    successMessage.value = res.message || "A 6-digit verification code has been sent to your email.";
    startCountdown();
    startResendCooldown();

    nextTick(() => {
      otpInputRef.value?.focus();
    });
  } catch (err: any) {
    errorMessage.value = err.message || "Failed to initiate registration.";
  } finally {
    loading.value = false;
  }
}

async function onVerifyOtpSubmit() {
  if (otpCode.value.length !== 6) {
    errorMessage.value = "Please enter the complete 6-digit code.";
    return;
  }

  errorMessage.value = "";
  successMessage.value = "";
  loading.value = true;

  try {
    const res = await auth.verifySignupOtp({
      email: email.value.trim(),
      otp: otpCode.value.trim()
    });

    stopCountdown();
    currentStep.value = 3;
    successMessage.value = res.message || "Email verified! Awaiting Administrator approval.";
  } catch (err: any) {
    errorMessage.value = err.message || "Invalid or expired verification code.";
  } finally {
    loading.value = false;
  }
}

async function onResendOtp() {
  if (resendCooldown.value > 0 || loading.value) return;
  errorMessage.value = "";
  successMessage.value = "";
  loading.value = true;

  try {
    const msg = await auth.resendOtp({
      email: email.value.trim(),
      type: "signup"
    });
    successMessage.value = msg || "A fresh verification code has been sent to your email.";
    otpCode.value = "";
    startCountdown();
    startResendCooldown();
  } catch (err: any) {
    errorMessage.value = err.message || "Failed to resend verification code.";
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.auth-page-wrapper {
  background: radial-gradient(circle at top right, #1e293b 0%, #0f172a 50%, #020617 100%);
  min-height: 100vh;
}

.auth-card-container {
  max-width: 440px;
  width: 100%;
}

.auth-glass-card {
  background: rgba(15, 23, 42, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 20px;
  padding: 2.2rem 2rem;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(16px);
}

.brand-header {
  margin-bottom: 1.5rem;
}

.brand-icon-wrap {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: rgba(251, 191, 36, 0.12);
  border: 1px solid rgba(251, 191, 36, 0.3);
  box-shadow: 0 0 20px rgba(251, 191, 36, 0.2);
  margin-bottom: 0.75rem;
}

.brand-title {
  font-size: 1.6rem;
  font-weight: 800;
  color: #f8fafc;
  letter-spacing: -0.5px;
  margin: 0 0 0.4rem 0;
}

.form-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 12px;
  background: rgba(56, 189, 248, 0.12);
  border: 1px solid rgba(56, 189, 248, 0.25);
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 600;
  color: #38bdf8;
  letter-spacing: 0.4px;
  text-transform: uppercase;
}

.form-desc {
  font-size: 0.83rem;
  color: #94a3b8;
  line-height: 1.5;
  margin-bottom: 0.5rem;
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 1.15rem;
}

.field-group {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.field-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.field-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.field-icon {
  position: absolute;
  left: 12px;
  color: #64748b;
  font-size: 0.95rem;
  pointer-events: none;
}

.login-input {
  width: 100%;
  background: rgba(2, 6, 23, 0.6) !important;
  border: 1px solid rgba(255, 255, 255, 0.12) !important;
  border-radius: 10px !important;
  padding: 0.68rem 1rem 0.68rem 2.4rem !important;
  color: #f8fafc !important;
  font-size: 0.9rem !important;
  outline: none;
  box-sizing: border-box;
}

.login-input::placeholder {
  color: #475569 !important;
}

.login-input:focus {
  border-color: #38bdf8 !important;
  background: rgba(2, 6, 23, 0.85) !important;
  box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.2) !important;
}

.password-input {
  padding-right: 2.5rem !important;
}

.otp-code-input {
  padding: 0.75rem !important;
  font-family: monospace;
  font-size: 1.5rem !important;
  font-weight: 800;
  text-align: center;
  letter-spacing: 0.45em;
  color: #38bdf8 !important;
}

.field-eye-btn {
  position: absolute;
  right: 10px;
  background: none;
  border: none;
  color: #94a3b8;
  padding: 4px 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1rem;
}

.field-eye-btn:hover {
  color: #38bdf8;
}

.field-hint {
  font-size: 0.72rem;
  color: #64748b;
  margin-top: 2px;
}

.approval-notice {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0.75rem 1rem;
  background: rgba(56, 189, 248, 0.08);
  border: 1px solid rgba(56, 189, 248, 0.2);
  border-radius: 10px;
  color: #cbd5e1;
  font-size: 0.78rem;
  line-height: 1.4;
}

.approval-notice i {
  color: #38bdf8;
  font-size: 1.2rem;
  flex-shrink: 0;
}

.btn-submit {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0.75rem 1.2rem;
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 10px;
  color: #ffffff;
  font-size: 0.92rem;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(37, 99, 235, 0.35);
  transition: opacity 0.2s ease;
}

.btn-submit:hover:not(:disabled) {
  opacity: 0.95;
}

.btn-submit:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.resend-btn {
  background: none;
  border: none;
  color: #38bdf8;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
}

.resend-btn:hover:not(:disabled) {
  text-decoration: underline;
}

.resend-btn:disabled {
  color: #64748b;
  cursor: not-allowed;
}

.back-btn {
  background: none;
  border: none;
  color: #94a3b8;
  font-size: 0.82rem;
  cursor: pointer;
}

.back-btn:hover {
  color: #38bdf8;
}

.auth-footer {
  text-align: center;
  padding-top: 1rem;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.auth-link {
  margin-left: 6px;
  font-size: 0.85rem;
  font-weight: 600;
  color: #38bdf8;
  text-decoration: none;
}

.auth-link:hover {
  text-decoration: underline;
}

.auth-alert {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0.65rem 0.9rem;
  border-radius: 10px;
  font-size: 0.82rem;
  margin-bottom: 1.1rem;
}

.alert-error {
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #fca5a5;
}

.alert-success {
  background: rgba(34, 197, 94, 0.15);
  border: 1px solid rgba(34, 197, 94, 0.3);
  color: #86efac;
}

.alert-close {
  margin-left: auto;
  background: none;
  border: none;
  color: currentColor;
  font-size: 1.2rem;
  line-height: 1;
  cursor: pointer;
  padding: 0 4px;
}

.pending-icon-wrap {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: rgba(251, 191, 36, 0.15);
  border: 1px solid rgba(251, 191, 36, 0.3);
  color: #fbbf24;
  font-size: 2rem;
}
</style>
