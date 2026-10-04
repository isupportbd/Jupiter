<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const isDropdownOpen = ref(false);

const isAdmin = computed(() => {
  const roleName = String((authStore.user as any)?.role?.name || (authStore.user as any)?.role || "").toLowerCase();
  return roleName === "superadmin" || roleName === "admin";
});

const daysRemaining = computed(() => {
  return Number((authStore.user as any)?.daysRemaining || 0);
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
      <!-- Left: Brand & Navigation Links -->
      <div class="d-flex align-items-center gap-4">
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

        <!-- Navigation Links ONLY for Standard Users (Dashboard & Reports) -->
        <nav v-if="!isAdmin" class="d-none d-md-flex align-items-center gap-1.5 ms-2">
          <router-link
            to="/"
            :class="['nav-link-tab', { active: route.path === '/' }]"
          >
            <i class="bi bi-speedometer2"></i>
            <span>Dashboard</span>
          </router-link>

          <router-link
            to="/reports"
            :class="['nav-link-tab', { active: route.path.startsWith('/reports') }]"
          >
            <i class="bi bi-file-earmark-bar-graph"></i>
            <span>Reports</span>
          </router-link>
        </nav>
      </div>

      <!-- Right: Subscription Status & User Profile Dropdown -->
      <div class="d-flex align-items-center gap-3">
        <!-- 30-Day Billing Access Indicator for standard users -->
        <div v-if="!isAdmin && authStore.isAuthenticated" class="d-none d-sm-flex align-items-center">
          <div
            :class="[
              'subscription-pill-badge d-flex align-items-center gap-1.5 px-2.5 py-1 rounded font-monospace',
              daysRemaining > 5
                ? 'sub-pill-green'
                : daysRemaining > 0
                ? 'sub-pill-amber'
                : 'sub-pill-red'
            ]"
            style="font-size: 0.78rem;"
          >
            <i :class="daysRemaining > 0 ? 'bi bi-clock-history' : 'bi bi-exclamation-octagon-fill'"></i>
            <span>{{ daysRemaining > 0 ? `${daysRemaining} Days Access` : 'Access Expired' }}</span>
          </div>
        </div>

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

            <!-- Mobile navigation items inside dropdown ONLY for Standard Users -->
            <template v-if="!isAdmin">
              <router-link to="/" class="dropdown-item d-md-none text-light d-flex align-items-center gap-2" @click="isDropdownOpen = false">
                <i class="bi bi-speedometer2 text-primary"></i> Dashboard
              </router-link>
              <router-link to="/reports" class="dropdown-item d-md-none text-light d-flex align-items-center gap-2" @click="isDropdownOpen = false">
                <i class="bi bi-file-earmark-bar-graph text-info"></i> Reports
              </router-link>
              <div class="dropdown-divider border-secondary d-md-none"></div>
            </template>

            <button
              type="button"
              class="dropdown-item text-danger d-flex align-items-center gap-2"
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
.idp-navbar {
  height: 64px;
  background: rgba(15, 23, 42, 0.94);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  position: sticky;
  top: 0;
  z-index: 1030;
}

.idp-brand {
  color: #fff;
  transition: opacity 0.2s ease;
}
.idp-brand:hover {
  opacity: 0.9;
}

.brand-badge-icon {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  background: linear-gradient(135deg, rgba(251, 191, 36, 0.15), rgba(99, 102, 241, 0.15));
  border: 1px solid rgba(251, 191, 36, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0 15px rgba(251, 191, 36, 0.15);
}

.brand-title {
  letter-spacing: -0.02em;
}

.nav-link-tab {
  color: #94a3b8;
  font-size: 0.85rem;
  font-weight: 500;
  text-decoration: none;
  padding: 0.4rem 0.8rem;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  transition: all 0.15s ease;
}

.nav-link-tab:hover {
  color: #f1f5f9;
  background: rgba(255, 255, 255, 0.05);
}

.nav-link-tab.active {
  color: #38bdf8;
  background: rgba(56, 189, 248, 0.12);
  border: 1px solid rgba(56, 189, 248, 0.25);
}

.nav-link-admin.active {
  color: #fbbf24 !important;
  background: rgba(245, 158, 11, 0.12) !important;
  border-color: rgba(245, 158, 11, 0.3) !important;
}

.subscription-pill-badge {
  line-height: 1.2;
}

.sub-pill-green {
  background: rgba(34, 197, 94, 0.14) !important;
  color: #4ade80 !important;
  border: 1px solid rgba(34, 197, 94, 0.3) !important;
}

.sub-pill-amber {
  background: rgba(245, 158, 11, 0.14) !important;
  color: #fbbf24 !important;
  border: 1px solid rgba(245, 158, 11, 0.3) !important;
}

.sub-pill-red {
  background: rgba(239, 68, 68, 0.14) !important;
  color: #f87171 !important;
  border: 1px solid rgba(239, 68, 68, 0.3) !important;
}

.user-avatar-circle {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: rgba(59, 130, 246, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.85rem;
}
</style>

