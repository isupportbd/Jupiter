<script setup lang="ts">
import { ref, computed, onUnmounted, nextTick } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { useToast } from "@/composables/useToast";
import axios from "axios";

const router = useRouter();
const authStore = useAuthStore();
const toast = useToast();

const loginId = ref("");
const password = ref("");
const showPassword = ref(false);
const isSubmitting = ref(false);

// OTP Verification Step for Login
const isOtpStep = ref(false);
const loginOtp = ref("");
const otpInputRef = ref<HTMLInputElement | null>(null);

// OTP Timers
const otpSecondsRemaining = ref(300);
let otpTimer: any = null;
const resendCooldown = ref(0);
let cooldownTimer: any = null;

const formattedTimeRemaining = computed(() => {
  const m = Math.floor(otpSecondsRemaining.value / 60);
  const s = otpSecondsRemaining.value % 60;
  return `${m}:${s < 10 ? "0" : ""}${s}`;
});

function startOtpCountdown() {
  stopOtpCountdown();
  otpSecondsRemaining.value = 300;
  otpTimer = setInterval(() => {
    if (otpSecondsRemaining.value > 0) {
      otpSecondsRemaining.value--;
    } else {
      stopOtpCountdown();
      toast.error("Login code expired. Please request a new code.");
    }
  }, 1000);
}

function stopOtpCountdown() {
  if (otpTimer) {
    clearInterval(otpTimer);
    otpTimer = null;
  }
}

function startResendCooldown() {
  resendCooldown.value = 60;
  if (cooldownTimer) clearInterval(cooldownTimer);
  cooldownTimer = setInterval(() => {
    if (resendCooldown.value > 0) {
      resendCooldown.value--;
    } else {
      clearInterval(cooldownTimer);
      cooldownTimer = null;
    }
  }, 1000);
}

onUnmounted(() => {
  stopOtpCountdown();
  if (cooldownTimer) clearInterval(cooldownTimer);
});

// Platform stats
const platformStats = ref({
  records: "238K+",
  banks: "55+",
  beneficiaries: "3.2K+"
});

// Forgot password workflow
const isForgotPassword = ref(false);
const resetStep = ref<1 | 2>(1);
const resetEmail = ref("");
const resetOtp = ref("");
const newPassword = ref("");
const showNewPassword = ref(false);
const isSendingOtp = ref(false);

const handleLogin = async () => {
  if (!loginId.value || !password.value) {
    toast.error("Please enter both Email and Password.");
    return;
  }
  isSubmitting.value = true;
  try {
    const res = await authStore.login({
      email: loginId.value.trim(),
      password: password.value,
      remember: true
    });

    if (res.requireOtp) {
      isOtpStep.value = true;
      loginOtp.value = "";
      toast.info(res.message || "A 6-digit login security code has been sent to your email.");
      startOtpCountdown();
      startResendCooldown();
      nextTick(() => {
        otpInputRef.value?.focus();
      });
      return;
    }

    completeLoginSuccess();
  } catch (err: any) {
    toast.error(err?.message || "Invalid email or password. Please check your credentials.");
  } finally {
    isSubmitting.value = false;
  }
};

const handleVerifyLoginOtp = async () => {
  const code = loginOtp.value.trim();
  if (!code || code.length !== 6) {
    toast.error("Please enter the complete 6-digit security code.");
    return;
  }
  isSubmitting.value = true;
  try {
    await authStore.verifyLoginOtp({
      email: loginId.value.trim(),
      otp: code,
      remember: true
    });

    stopOtpCountdown();
    completeLoginSuccess();
  } catch (err: any) {
    toast.error(err?.message || "Invalid or expired security code.");
  } finally {
    isSubmitting.value = false;
  }
};

const handleResendLoginOtp = async () => {
  if (resendCooldown.value > 0 || isSubmitting.value) return;
  isSubmitting.value = true;
  try {
    const msg = await authStore.resendOtp({
      email: loginId.value.trim(),
      type: "login"
    });
    toast.success(msg || "A fresh security code has been sent to your email.");
    loginOtp.value = "";
    startOtpCountdown();
    startResendCooldown();
  } catch (err: any) {
    toast.error(err?.message || "Failed to resend security code.");
  } finally {
    isSubmitting.value = false;
  }
};

function completeLoginSuccess() {
  toast.success("Signed in successfully!");
  const roleName = String((authStore.user as any)?.role?.name || (authStore.user as any)?.role || "").toLowerCase();
  const isAdmin = roleName === "superadmin" || roleName === "admin";
  const defaultPath = isAdmin ? "/users" : "/";
  const redirectPath = (router.currentRoute.value.query.redirect as string) || defaultPath;
  router.push(isAdmin ? "/users" : redirectPath);
}

const handleRequestOtp = async () => {
  if (!resetEmail.value) {
    toast.error("Please enter your registered email address.");
    return;
  }
  isSendingOtp.value = true;
  try {
    const msg = await authStore.forgotPassword(resetEmail.value.trim());
    toast.success(msg || "Reset code sent to your email!");
    resetOtp.value = "";
    newPassword.value = "";
    resetStep.value = 2;
  } catch (err: any) {
    toast.error(err?.message || "Error requesting reset code.");
  } finally {
    isSendingOtp.value = false;
  }
};

const handleResetPassword = async () => {
  const otpClean = resetOtp.value.trim();
  if (!otpClean || otpClean.length !== 6) {
    toast.error("Please enter the 6-digit OTP code received in your email.");
    return;
  }
  if (!newPassword.value || newPassword.value.length < 6) {
    toast.error("Password must be at least 6 characters.");
    return;
  }
  isSubmitting.value = true;
  try {
    const msg = await authStore.resetPasswordWithOtp({
      email: resetEmail.value.trim(),
      otp: otpClean,
      password: newPassword.value,
      password_confirmation: newPassword.value
    });
    toast.success(msg || "Password reset successfully! Please sign in.");
    isForgotPassword.value = false;
    resetStep.value = 1;
    resetOtp.value = "";
    newPassword.value = "";
    password.value = "";
  } catch (err: any) {
    toast.error(err?.message || "Invalid OTP or reset failed.");
  } finally {
    isSubmitting.value = false;
  }
};
</script>

<template>
  <div class="login-root">
    <div class="login-wrapper">
      <!-- Left Branding Panel -->
      <div class="login-left">
        <div class="login-left-inner">
          <!-- Logo -->
          <div class="brand-logo">
            <div class="brand-planet-icon">
              <svg width="34" height="34" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <linearGradient id="jupLogGrad" x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stop-color="#fbbf24" />
                    <stop offset="45%" stop-color="#f43f5e" />
                    <stop offset="100%" stop-color="#6366f1" />
                  </linearGradient>
                  <linearGradient id="ringLogGrad" x1="2" y1="10" x2="30" y2="22" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.95" />
                    <stop offset="50%" stop-color="#c084fc" stop-opacity="0.85" />
                    <stop offset="100%" stop-color="#f43f5e" stop-opacity="0.95" />
                  </linearGradient>
                </defs>
                <circle cx="16" cy="16" r="9.5" fill="url(#jupLogGrad)" />
                <path d="M7.2 13.8C10.5 12 21.5 12 24.8 13.8" stroke="rgba(255,255,255,0.35)" stroke-width="1.2" stroke-linecap="round" />
                <path d="M6.8 17C10.2 19 21.8 19 25.2 17" stroke="rgba(255,255,255,0.3)" stroke-width="1.2" stroke-linecap="round" />
                <circle cx="19.5" cy="17.8" r="1.4" fill="rgba(255,255,255,0.7)" />
                <ellipse cx="16" cy="16" rx="14" ry="5.2" stroke="url(#ringLogGrad)" stroke-width="1.8" transform="rotate(-22 16 16)" stroke-linecap="round" />
              </svg>
            </div>
            <div>
              <div class="brand-name">Jupiter</div>
              <div class="brand-sub">Analytics &amp; Intelligence</div>
            </div>
          </div>

          <!-- Headline -->
          <div class="brand-headline">
            <h1>Intelligent Analytics &amp;<br/>Portfolio Management</h1>
          </div>

          <!-- Feature list -->
          <ul class="feature-list">
            <li>
              <span class="feature-dot dot-blue"></span>
              <span>Fast 230K+ Row Dataset Excel Streaming</span>
            </li>
            <li>
              <span class="feature-dot dot-purple"></span>
              <span>Realtime Beneficiary &amp; Issuing Bank Aggregation</span>
            </li>
            <li>
              <span class="feature-dot dot-cyan"></span>
              <span>Automated Local LC &amp; Monthly Summary Reports</span>
            </li>
            <li>
              <span class="feature-dot dot-emerald"></span>
              <span>Direct PostgreSQL Multi-Chunk Analytics</span>
            </li>
          </ul>

          <!-- Bottom stat strip -->
          <div class="stat-strip">
            <div class="stat-item">
              <span class="stat-value val-cyan">{{ platformStats.records }}</span>
              <span class="stat-label">Records</span>
            </div>
            <div class="stat-divider"></div>
            <div class="stat-item">
              <span class="stat-value val-warning">{{ platformStats.banks }}</span>
              <span class="stat-label">Major Banks</span>
            </div>
            <div class="stat-divider"></div>
            <div class="stat-item">
              <span class="stat-value val-success">{{ platformStats.beneficiaries }}</span>
              <span class="stat-label">Beneficiaries</span>
            </div>
            <div class="stat-divider"></div>
            <div class="stat-item">
              <span class="stat-value val-purple">V2</span>
              <span class="stat-label">Engine</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Center Divider -->
      <div class="login-center-divider" aria-hidden="true"></div>

      <!-- Right Form Panel -->
      <div class="login-right">
        <!-- Mobile Brand Header -->
        <div class="mobile-brand-header">
          <div class="d-inline-flex align-items-center gap-2 mb-1">
            <span class="brand-name-sm">Jupiter</span>
          </div>
          <p class="text-muted fs-8 mb-2">Analytics &amp; Reporting Portal</p>
        </div>

        <div class="form-panel">
          <!-- ========================================== -->
          <!-- STEP 2: 2FA LOGIN OTP VERIFICATION         -->
          <!-- ========================================== -->
          <template v-if="isOtpStep">
            <div class="form-header text-center">
              <div class="form-step-badge">2FA Security</div>
              <h2>Enter Security Code</h2>
              <p>We sent a 6-digit code to <strong class="text-light">{{ loginId }}</strong></p>
            </div>

            <form @submit.prevent="handleVerifyLoginOtp" class="login-form">
              <div class="field-group text-center">
                <input
                  ref="otpInputRef"
                  v-model="loginOtp"
                  type="text"
                  class="login-input otp-input"
                  placeholder="••••••"
                  maxlength="6"
                  autocomplete="one-time-code"
                  inputmode="numeric"
                  required
                  autofocus
                />
                <div class="field-hint text-center mt-1">
                  <i class="bi bi-clock-history me-1"></i>
                  Code expires in <strong class="text-info">{{ formattedTimeRemaining }}</strong>
                </div>
              </div>

              <button
                type="submit"
                class="btn-login"
                :disabled="isSubmitting || loginOtp.length !== 6"
              >
                <span v-if="isSubmitting" class="spinner-border spinner-border-sm me-2" role="status"></span>
                <i v-else class="bi bi-shield-check-fill me-2"></i>
                {{ isSubmitting ? 'Verifying...' : 'Verify & Sign In' }}
              </button>

              <div class="text-center pt-1">
                <button
                  type="button"
                  class="resend-link-btn"
                  :disabled="resendCooldown > 0 || isSubmitting"
                  @click="handleResendLoginOtp"
                >
                  <i class="bi bi-arrow-repeat me-1"></i>
                  <span v-if="resendCooldown > 0">Resend Code in {{ resendCooldown }}s</span>
                  <span v-else>Didn't receive code? Resend</span>
                </button>
              </div>

              <button
                type="button"
                class="back-btn"
                @click="isOtpStep = false; loginOtp = ''; stopOtpCountdown();"
              >
                <i class="bi bi-arrow-left me-1"></i> Back to Email &amp; Password
              </button>
            </form>
          </template>

          <!-- ========================================== -->
          <!-- STEP 1: REGULAR LOGIN FORM                 -->
          <!-- ========================================== -->
          <template v-else-if="!isForgotPassword">
            <div class="form-header">
              <div class="form-step-badge">Secure System</div>
              <h2>Welcome back</h2>
              <p>Sign in to your dashboard</p>
            </div>

            <form @submit.prevent="handleLogin" class="login-form">
              <!-- Email Field -->
              <div class="field-group">
                <label class="field-label">Email address</label>
                <div class="field-wrap">
                  <span class="field-icon"><i class="bi bi-envelope-fill"></i></span>
                  <input
                    v-model="loginId"
                    type="email"
                    class="login-input"
                    placeholder="admin@example.com"
                    autocomplete="username"
                    required
                  />
                </div>
              </div>

              <!-- Password Field -->
              <div class="field-group">
                <div class="field-label-row">
                  <label class="field-label">Password</label>
                  <a
                    href="javascript:void(0)"
                    class="forgot-link"
                    @click="isForgotPassword = true; resetStep = 1; resetOtp = ''; newPassword = '';"
                  >Forgot password?</a>
                </div>
                <div class="field-wrap">
                  <span class="field-icon"><i class="bi bi-lock-fill"></i></span>
                  <input
                    v-model="password"
                    :type="showPassword ? 'text' : 'password'"
                    class="login-input login-input-password"
                    placeholder="••••••••"
                    autocomplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    class="field-eye-btn"
                    :title="showPassword ? 'Hide password' : 'View password'"
                    @click="showPassword = !showPassword"
                    tabindex="-1"
                  >
                    <i :class="showPassword ? 'bi bi-eye-slash-fill' : 'bi bi-eye-fill'"></i>
                  </button>
                </div>
              </div>

              <!-- Submit -->
              <button
                type="submit"
                class="btn-login"
                :disabled="isSubmitting"
              >
                <span v-if="isSubmitting" class="spinner-border spinner-border-sm me-2" role="status"></span>
                <i v-else class="bi bi-arrow-right-circle-fill me-2"></i>
                {{ isSubmitting ? 'Signing in...' : 'Sign In' }}
              </button>

              <div class="text-center mt-3 pt-2">
                <span class="text-muted small">Don't have an account? </span>
                <router-link to="/register" class="fw-semibold text-primary text-decoration-none small">
                  Register Now
                </router-link>
              </div>
            </form>
          </template>

          <!-- ========================================== -->
          <!-- FORGOT PASSWORD WORKFLOW                   -->
          <!-- ========================================== -->
          <template v-else>
            <div class="form-header">
              <div class="form-step-badge">{{ resetStep === 1 ? 'Step 1 of 2' : 'Step 2 of 2' }}</div>
              <h2>Reset Password</h2>
              <p>{{ resetStep === 1 ? 'Enter your registered email address' : 'Enter the OTP sent to your email' }}</p>
            </div>

            <!-- Step 1: Email -->
            <div v-if="resetStep === 1" class="login-form">
              <div class="field-group">
                <label class="field-label">Registered Email</label>
                <div class="field-wrap">
                  <span class="field-icon"><i class="bi bi-envelope-fill"></i></span>
                  <input
                    v-model="resetEmail"
                    type="email"
                    class="login-input"
                    placeholder="you@example.com"
                    autocomplete="email"
                    required
                  />
                </div>
              </div>
              <button
                type="button"
                class="btn-login"
                :disabled="isSendingOtp"
                @click="handleRequestOtp"
              >
                <span v-if="isSendingOtp" class="spinner-border spinner-border-sm me-2"></span>
                <i v-else class="bi bi-send-fill me-2"></i>
                Send OTP
              </button>
            </div>

            <!-- Step 2: OTP + New Password -->
            <div v-else class="login-form">
              <div class="field-group">
                <label class="field-label" style="text-align:center; display:block;">6-Digit OTP</label>
                <input
                  v-model="resetOtp"
                  type="text"
                  class="login-input otp-input"
                  placeholder="••••••"
                  maxlength="6"
                  autocomplete="one-time-code"
                  inputmode="numeric"
                  required
                />
              </div>
              <div class="field-group">
                <label class="field-label">New Password</label>
                <div class="field-wrap">
                  <span class="field-icon"><i class="bi bi-lock-fill"></i></span>
                  <input
                    v-model="newPassword"
                    :type="showNewPassword ? 'text' : 'password'"
                    class="login-input login-input-password"
                    placeholder="Minimum 6 characters"
                    autocomplete="new-password"
                    required
                  />
                  <button
                    type="button"
                    class="field-eye-btn"
                    :title="showNewPassword ? 'Hide password' : 'View password'"
                    @click="showNewPassword = !showNewPassword"
                    tabindex="-1"
                  >
                    <i :class="showNewPassword ? 'bi bi-eye-slash-fill' : 'bi bi-eye-fill'"></i>
                  </button>
                </div>
              </div>
              <button
                type="button"
                class="btn-login"
                :disabled="isSubmitting"
                @click="handleResetPassword"
              >
                <span v-if="isSubmitting" class="spinner-border spinner-border-sm me-2"></span>
                <i v-else class="bi bi-shield-check-fill me-2"></i>
                Reset Password
              </button>
            </div>

            <button
              type="button"
              class="back-btn"
              @click="isForgotPassword = false; resetStep = 1; resetOtp = ''; newPassword = '';"
            >
              <i class="bi bi-arrow-left me-1"></i> Back to Sign In
            </button>
          </template>
        </div>

        <!-- Footer note -->
        <div class="login-footer-note">
          <i class="bi bi-shield-check text-success me-1"></i>
          Protected by Enterprise TLS 1.3 encryption
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

.login-root {
  min-height: 100vh;
  width: 100%;
  background-color: #0b0f19;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  position: relative;
  overflow-x: hidden;
}

.login-wrapper {
  display: flex;
  width: 100%;
  max-width: 1100px;
  margin: 0 auto;
  padding: 3rem 2rem;
  align-items: center;
  justify-content: space-between;
  position: relative;
  z-index: 1;
}

.login-left {
  flex: 1.15;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  padding: 1rem 2rem 1rem 1rem;
}

.login-left-inner {
  max-width: 440px;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.brand-logo {
  display: flex;
  align-items: center;
  gap: 14px;
}
.brand-planet-icon {
  width: 48px;
  height: 48px;
  background: linear-gradient(135deg, rgba(251, 191, 36, 0.15), rgba(99, 102, 241, 0.15));
  border: 1px solid rgba(251, 191, 36, 0.35);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0 20px rgba(251, 191, 36, 0.2);
}
.brand-name {
  font-size: 1.65rem;
  font-weight: 800;
  color: #f8fafc;
  line-height: 1.1;
  letter-spacing: -0.5px;
}
.brand-sub {
  font-size: 0.78rem;
  font-weight: 600;
  color: #38bdf8;
  letter-spacing: 0.8px;
  text-transform: uppercase;
}

.brand-headline h1 {
  font-size: 1.85rem;
  font-weight: 800;
  color: #f8fafc;
  line-height: 1.25;
  letter-spacing: -0.5px;
  margin: 0;
}

.feature-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}
.feature-list li {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 0.88rem;
  color: #94a3b8;
  font-weight: 500;
}
.feature-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.dot-blue    { background: #38bdf8; box-shadow: 0 0 8px #38bdf8; }
.dot-purple  { background: #c084fc; box-shadow: 0 0 8px #c084fc; }
.dot-cyan    { background: #22d3ee; box-shadow: 0 0 8px #22d3ee; }
.dot-emerald { background: #34d399; box-shadow: 0 0 8px #34d399; }

.stat-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.85rem 1rem;
  background: rgba(15, 23, 42, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  max-width: 440px;
  width: 100%;
}
.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  flex: 1;
  text-align: center;
}
.stat-value {
  font-size: 1.15rem;
  font-weight: 800;
  line-height: 1.1;
  letter-spacing: -0.2px;
  white-space: nowrap;
}
.val-cyan    { color: #38bdf8; }
.val-warning { color: #fbbf24; }
.val-success { color: #34d399; }
.val-purple  { color: #c084fc; }

.stat-label {
  font-size: 0.68rem;
  color: #64748b;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.stat-divider {
  width: 1px;
  height: 36px;
  background: rgba(255, 255, 255, 0.1);
  flex-shrink: 0;
}

.login-center-divider {
  width: 1px;
  height: 380px;
  background: rgba(255, 255, 255, 0.1);
  align-self: center;
  flex-shrink: 0;
}

.login-right {
  flex: 0.85;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 1rem 0.5rem 1rem 2.5rem;
  gap: 1.25rem;
}

.mobile-brand-header {
  display: none;
  text-align: center;
  margin-bottom: 1rem;
}
.brand-name-sm {
  font-size: 1.15rem;
  font-weight: 800;
  color: #f8fafc;
}

.form-panel {
  width: 100%;
  max-width: 380px;
  background: rgba(15, 23, 42, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 16px;
  padding: 2.2rem 2rem;
  box-shadow: 0 20px 40px rgba(0,0,0,0.5);
  backdrop-filter: blur(12px);
}

.form-header {
  margin-bottom: 1.5rem;
}
.form-step-badge {
  display: inline-flex;
  align-items: center;
  padding: 2.5px 9px;
  background: rgba(59, 130, 246, 0.15);
  border: 1px solid rgba(59, 130, 246, 0.3);
  border-radius: 999px;
  font-size: 0.68rem;
  font-weight: 600;
  color: #38bdf8;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  margin-bottom: 0.65rem;
}
.form-header h2 {
  font-size: 1.45rem;
  font-weight: 700;
  color: #f8fafc;
  margin: 0 0 0.35rem 0;
}
.form-header p {
  font-size: 0.85rem;
  color: #64748b;
  margin: 0;
}

.login-form {
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
  font-size: 0.78rem;
  font-weight: 600;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.field-label-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.forgot-link {
  font-size: 0.75rem;
  color: #38bdf8;
  text-decoration: none;
}
.forgot-link:hover {
  text-decoration: underline;
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
  font-size: 0.9rem;
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

.login-input-password {
  padding-right: 2.5rem !important;
}

.otp-input {
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
  right: 8px;
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
}

.btn-login {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.72rem 1.2rem;
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
.btn-login:hover:not(:disabled) {
  opacity: 0.95;
}
.btn-login:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.resend-link-btn {
  background: none;
  border: none;
  color: #38bdf8;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
}
.resend-link-btn:hover:not(:disabled) {
  text-decoration: underline;
}
.resend-link-btn:disabled {
  color: #64748b;
  cursor: not-allowed;
}

.back-btn {
  background: none;
  border: none;
  color: #94a3b8;
  font-size: 0.82rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}
.back-btn:hover {
  color: #38bdf8;
}

.login-footer-note {
  font-size: 0.75rem;
  color: #64748b;
  display: flex;
  align-items: center;
}

@media (max-width: 900px) {
  .login-left { display: none; }
  .login-center-divider { display: none; }
  .login-right {
    flex: 1;
    padding: 1rem;
    width: 100%;
  }
  .mobile-brand-header { display: block; }
}
</style>
