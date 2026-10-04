<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";

const router = useRouter();
const authStore = useAuthStore();

const isDropdownOpen = ref(false);
const dropdownRef = ref<HTMLElement | null>(null);

const handleClickOutside = (e: MouseEvent) => {
  if (dropdownRef.value && !dropdownRef.value.contains(e.target as Node)) {
    isDropdownOpen.value = false;
  }
};

onMounted(() => {
  document.addEventListener("click", handleClickOutside);
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
      <!-- Left: Brand Logo Only -->
      <div class="d-flex align-items-center" style="min-width: 140px;">
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

      <!-- Center: Subscription Days Remaining Badge in CENTER -->
      <div class="d-flex align-items-center justify-content-center flex-grow-1 px-2">
        <div v-if="!isAdmin && authStore.isAuthenticated" class="d-flex align-items-center justify-content-center">
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
                <span :class="['user-role-badge', isAdmin ? 'role-admin' : 'role-user']">
                  {{ (authStore.user as any)?.role?.name || (authStore.user as any)?.role || (isAdmin ? 'ADMIN' : 'USER') }}
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
