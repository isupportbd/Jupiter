<template>
  <div class="auth-page-wrapper min-vh-100 d-flex align-items-center justify-content-center p-3">
    <div class="auth-card-container">
      <div class="auth-glass-card text-center">
        <!-- Brand Header -->
        <div class="brand-header text-center">
          <div class="brand-icon-wrap">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="jupResetGrad" x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stop-color="#fbbf24" />
                  <stop offset="45%" stop-color="#f43f5e" />
                  <stop offset="100%" stop-color="#6366f1" />
                </linearGradient>
                <linearGradient id="ringResetGrad" x1="2" y1="10" x2="30" y2="22" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.95" />
                  <stop offset="50%" stop-color="#c084fc" stop-opacity="0.85" />
                  <stop offset="100%" stop-color="#f43f5e" stop-opacity="0.95" />
                </linearGradient>
              </defs>
              <circle cx="16" cy="16" r="9.5" fill="url(#jupResetGrad)" />
              <ellipse cx="16" cy="16" rx="14" ry="5.2" stroke="url(#ringResetGrad)" stroke-width="1.8" transform="rotate(-22 16 16)" stroke-linecap="round" />
            </svg>
          </div>
          <h2 class="brand-title">Jupiter</h2>
          <div class="form-badge">Reset Password</div>
        </div>

        <p class="text-secondary small mb-4">
          Password reset is securely handled via a 6-digit one-time code sent directly to your registered email address.
        </p>

        <router-link to="/forget-password" class="btn-submit text-decoration-none mb-3">
          <i class="bi bi-key-fill"></i>
          <span>Go to Forgot Password</span>
        </router-link>

        <div class="auth-footer">
          <router-link to="/login" class="back-link">
            <i class="bi bi-arrow-left me-1"></i> Back to Sign In
          </router-link>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useHead } from "@vueuse/head";

useHead({ title: "Reset Password - Jupiter" });
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

.btn-submit:hover {
  opacity: 0.95;
}

.auth-footer {
  text-align: center;
  padding-top: 1rem;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.back-link {
  font-size: 0.85rem;
  font-weight: 500;
  color: #94a3b8;
  text-decoration: none;
}

.back-link:hover {
  color: #38bdf8;
}
</style>
