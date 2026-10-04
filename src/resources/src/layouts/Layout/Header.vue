<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";

const router = useRouter();
const authStore = useAuthStore();

const isDropdownOpen = ref(false);

const isAdmin = computed(() => {
  const roleName = String((authStore.user as any)?.role?.name || (authStore.user as any)?.role || "").toLowerCase();
  return roleName === "superadmin" || roleName === "admin";
});

const daysRemaining = computed(() => {
  const user = authStore.user as any;
  if (!user) return 0;
  if (isAdmin.value) return 9999;
  if (user.subscriptionExpiresAt) {
    const diff = new Date(user.subscriptionExpiresAt).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }
  return Number(user.daysRemaining || 0);
});

const handleLogout = async () => {
  isDropdownOpen.value = false;
  await authStore.logout();
  router.push("/login");
};
</script>

<template>
  <header class="idp-navbar">
    <div class="idp-grid-container h-100 d-flex align-items-center justify-content-between px-3">
      <!-- Left: Brand Logo Only (NO MENU TABS) -->
      <div class="d-flex align-items-center">
        <router-link :to="isAdmin ? '/users' : '/'" class="idp-brand d-flex align-items-center gap-2.5 text-decoration-none">
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

      <!-- Right: Subscription Countdown & User Profile Dropdown -->
      <div class="d-flex align-items-center gap-3">
        <!-- Exact Subscription Days Remaining Pill (Approved from 30 Days) -->
        <div v-if="!isAdmin && authStore.isAuthenticated" class="d-flex align-items-center">
          <div
            :class="[
              'subscription-pill-badge d-flex align-items-center gap-1.5 px-3 py-1 rounded-pill font-monospace',
              daysRemaining > 5
                ? 'sub-pill-green'
                : daysRemaining > 0
                ? 'sub-pill-amber'
                : 'sub-pill-red'
            ]"
            style="font-size: 0.8rem; font-weight: 600;"
          >
            <i :class="daysRemaining > 0 ? 'bi bi-clock-history' : 'bi bi-exclamation-octagon-fill'"></i>
            <span>{{ daysRemaining > 1 ? `${daysRemaining} Days Left` : daysRemaining === 1 ? '1 Day Left' : 'Access Expired' }}</span>
          </div>
        </div>

        <!-- User Dropdown -->
        <div class="position-relative" @click.stop>
          <button
            type="button"
            class="btn btn-dark border border-secondary p-1 px-2.5 rounded d-flex align-items-center gap-2"
            @click="isDropdownOpen = !isDropdownOpen"
            title="Account Menu"
          >
            <div class="user-avatar-circle">
              <i class="bi bi-person-fill text-primary"></i>
            </div>
            <span class="text-white small fw-medium d-none d-md-inline">{{ authStore.user?.name || 'User' }}</span>
            <i class="bi bi-chevron-down text-muted small"></i>
          </button>

          <div
            v-if="isDropdownOpen"
            class="dropdown-menu show dropdown-menu-end position-absolute mt-2 shadow-lg"
            style="min-width: 230px; z-index: 1060; right: 0 !important; left: auto !important;"
          >
            <div class="px-3 py-2 border-bottom border-secondary mb-1">
              <div class="fw-bold text-white text-capitalize">
                {{ authStore.user?.name || 'User' }}
              </div>
              <div class="text-muted small text-truncate">
                {{ authStore.user?.email || '' }}
              </div>
              <div class="d-flex align-items-center gap-1.5 mt-1.5">
                <span class="badge bg-primary text-white border border-primary font-monospace" style="font-size: 0.65rem; padding: 2px 6px;">
                  {{ (authStore.user as any)?.role?.name || (authStore.user as any)?.role || 'User' }}
                </span>
                <span
                  v-if="!isAdmin && daysRemaining > 0"
                  class="badge bg-success bg-opacity-20 text-success border border-success border-opacity-30 font-monospace"
                  style="font-size: 0.65rem; padding: 2px 6px;"
                >
                  {{ daysRemaining }}d left
                </span>
              </div>
            </div>

            <!-- Admin users link -->
            <router-link
              v-if="isAdmin"
              to="/users"
              class="dropdown-item text-light d-flex align-items-center gap-2"
              @click="isDropdownOpen = false"
            >
              <i class="bi bi-people-fill text-primary"></i> User &amp; Billing
            </router-link>

            <button
              type="button"
              class="dropdown-item text-danger d-flex align-items-center gap-2 mt-1"
              @click="handleLogout"
            >
              <i class="bi bi-box-arrow-right"></i> Sign Out
            </button>
          </div>
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

.subscription-pill-badge {
  border: 1px solid transparent;
  transition: all 0.2s ease;
}

.sub-pill-green {
  background: rgba(34, 197, 94, 0.12);
  border-color: rgba(34, 197, 94, 0.35);
  color: #4ade80;
}

.sub-pill-amber {
  background: rgba(245, 158, 11, 0.12);
  border-color: rgba(245, 158, 11, 0.35);
  color: #fbbf24;
}

.sub-pill-red {
  background: rgba(239, 68, 68, 0.15);
  border-color: rgba(239, 68, 68, 0.35);
  color: #f87171;
}

.user-avatar-circle {
  width: 24px;
  height: 24px;
  background: rgba(56, 189, 248, 0.15);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.85rem;
}

.dropdown-menu {
  background: #131926 !important;
  border: 1px solid #1e293b !important;
}

.dropdown-item {
  color: #cbd5e1 !important;
  padding: 0.5rem 1rem;
  font-size: 0.85rem;
}

.dropdown-item:hover {
  background: #1e293b !important;
  color: #ffffff !important;
}
</style>
