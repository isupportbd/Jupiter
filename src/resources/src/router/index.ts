import { createRouter, createWebHistory, type RouteLocationNormalized } from "vue-router";
import { useAuthStore } from "@/stores/auth";

export const routes = [
  {
    path: "/login",
    name: "login",
    component: () => import("@/pages/auth/login.vue"),
    meta: { guestOnly: true, title: "Sign In" }
  },
  {
    path: "/register",
    name: "register",
    component: () => import("@/pages/auth/register.vue"),
    meta: { guestOnly: true, title: "Create Account" }
  },
  {
    path: "/forget-password",
    name: "forget-password",
    component: () => import("@/pages/auth/forgetPassword.vue"),
    meta: { guestOnly: true, title: "Forgot Password" }
  },
  {
    path: "/reset-password",
    name: "reset-password",
    component: () => import("@/pages/auth/resetPassword.vue"),
    meta: { guestOnly: true, title: "Reset Password" }
  },
  {
    path: "/verify-email",
    name: "verify-email",
    component: () => import("@/pages/auth/verifyEmail.vue"),
    meta: { guestOnly: true, title: "Verify Email" }
  },
  {
    path: "/",
    component: () => import("@/layouts/Layout/index.vue"),
    meta: { requiresAuth: true },
    children: [
      {
        path: "",
        name: "dashboard",
        component: () => import("@/pages/dashboard/index.vue"),
        meta: { title: "Dashboard" }
      },
      {
        path: "reports",
        name: "reports",
        component: () => import("@/pages/reports/index.vue"),
        meta: { title: "Reports" }
      },
      {
        path: "users",
        name: "users",
        component: () => import("@/pages/admin/users/index.vue"),
        meta: { title: "Users & Billing" }
      }
    ]
  },
  {
    path: "/:pathMatch(.*)*",
    redirect: "/"
  }
];

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(_to, _from, savedPosition) {
    if (savedPosition) {
      return savedPosition;
    }
    return { top: 0 };
  }
});

router.beforeEach(async (to: RouteLocationNormalized) => {
  const authStore = useAuthStore();

  if (!authStore.initialized) {
    await authStore.bootstrap();
  }

  const isAuthenticated = authStore.isAuthenticated;
  const roleName = String((authStore.user as any)?.role?.name || (authStore.user as any)?.role || "").toLowerCase();
  const isAdmin = roleName === "superadmin" || roleName === "admin";

  if (to.meta.guestOnly && isAuthenticated) {
    return { path: isAdmin ? "/users" : "/" };
  }

  if (to.meta.requiresAuth && !isAuthenticated) {
    const query = to.fullPath !== "/" ? { redirect: to.fullPath } : {};
    return { path: "/login", query };
  }

  // Admin should NOT access user pages (Dashboard or Reports) - only /users
  if (isAuthenticated && isAdmin && (to.path === "/" || to.path.startsWith("/reports"))) {
    return { path: "/users" };
  }

  // Regular user should NOT access /users (Admin only)
  if (isAuthenticated && !isAdmin && to.path.startsWith("/users")) {
    return { path: "/" };
  }

  if (to.meta.title) {
    document.title = `${to.meta.title} - Jupiter`;
  } else {
    document.title = "Jupiter";
  }
});

export default router;
