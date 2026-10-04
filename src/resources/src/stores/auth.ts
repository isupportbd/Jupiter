import axios from "axios";
import { defineStore } from "pinia";
import { ref } from "vue";
import { type AuthUser, clearUser, setUser } from "@/composables/useAuth";

type LoginPayload = { email: string; password: string; remember?: boolean };
type VerifyLoginOtpPayload = { email: string; otp: string; remember?: boolean };
type RegisterPayload = {
  name: string;
  email: string;
  password: string;
  password_confirmation: string;
};
type VerifySignupOtpPayload = { email: string; otp: string };
type ResendOtpPayload = { email: string; type: "signup" | "login" | "reset_password" };
type ResetPasswordOtpPayload = {
  email: string;
  otp: string;
  password: string;
  password_confirmation: string;
};

type ApiResponse<T> = {
  message: string;
  data?: T;
  requireOtp?: boolean;
  isPendingApproval?: boolean;
  isSuspended?: boolean;
  isSubscriptionExpired?: boolean;
  email?: string;
  success?: boolean;
};

type AuthData = {
  user: AuthUser;
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
};

async function request<T>(method: "GET" | "POST", path: string, payload?: unknown): Promise<ApiResponse<T>> {
  try {
    const headers: Record<string, string> = {};
    try {
      const token = localStorage.getItem("jupiter_access_token");
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
    } catch {}

    const response = await axios.request<ApiResponse<T>>({
      method,
      url: `/api/auth${path}`,
      data: payload,
      headers
    });

    return response.data;
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      const respData = error.response?.data;
      const err = new Error(String(respData?.message || error.message || "Request failed")) as any;
      err.response = error.response;
      err.data = respData;
      throw err;
    }
    throw new Error("Request failed");
  }
}

export const useAuthStore = defineStore("auth", () => {
  const user = ref<AuthUser | null>(null);
  const isAuthenticated = ref(false);
  const processing = ref(false);
  const initialized = ref(false);

  const syncUser = (value: AuthUser | null) => {
    user.value = value;
    isAuthenticated.value = !!value;
    if (value) {
      setUser(value);
      try { localStorage.setItem("jupiter_auth_user", JSON.stringify(value)); } catch {}
    } else {
      clearUser();
      try {
        localStorage.removeItem("jupiter_auth_user");
        localStorage.removeItem("jupiter_access_token");
        localStorage.removeItem("jupiter_refresh_token");
      } catch {}
    }
  };

  const bootstrap = async (forceRefresh = false) => {
    if (initialized.value && !forceRefresh) return;

    try {
      const cached = localStorage.getItem("jupiter_auth_user");
      if (cached && !user.value) {
        const parsed = JSON.parse(cached);
        user.value = parsed;
        isAuthenticated.value = true;
        setUser(parsed);
      }
    } catch {}

    try {
      const token = localStorage.getItem("jupiter_access_token");
      const headers: Record<string, string> = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      const response = await axios.get<ApiResponse<AuthUser>>("/api/auth/me", { headers });
      if (response.data?.data) {
        syncUser(response.data.data as AuthUser);
      } else {
        syncUser(null);
      }
    } catch (error: unknown) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        syncUser(null);
      }
    }

    initialized.value = true;
  };

  /**
   * 1. Login Request - Verifies credentials and dispatches 2FA Login OTP
   */
  const login = async (payload: LoginPayload) => {
    processing.value = true;
    try {
      const res = await request<AuthData>("POST", "/login", payload);
      // If direct login without OTP
      if (res?.data?.access_token) {
        try { localStorage.setItem("jupiter_access_token", res.data.access_token); } catch {}
        if (res?.data?.refresh_token) {
          try { localStorage.setItem("jupiter_refresh_token", res.data.refresh_token); } catch {}
        }
        syncUser((res?.data?.user || null) as AuthUser | null);
        initialized.value = true;
      }
      return res;
    } finally {
      processing.value = false;
    }
  };

  /**
   * 2. Verify 2FA Login OTP
   */
  const verifyLoginOtp = async (payload: VerifyLoginOtpPayload) => {
    processing.value = true;
    try {
      const res = await request<AuthData>("POST", "/verify-login-otp", payload);
      if (res?.data?.access_token) {
        try { localStorage.setItem("jupiter_access_token", res.data.access_token); } catch {}
      }
      if (res?.data?.refresh_token) {
        try { localStorage.setItem("jupiter_refresh_token", res.data.refresh_token); } catch {}
      }
      syncUser((res?.data?.user || null) as AuthUser | null);
      initialized.value = true;
      return res;
    } finally {
      processing.value = false;
    }
  };

  /**
   * 3. Register Request - Initiates registration and dispatches Email OTP
   */
  const register = async (payload: RegisterPayload) => {
    processing.value = true;
    try {
      const res = await request<AuthData>("POST", "/register", payload);
      return res;
    } finally {
      processing.value = false;
    }
  };

  /**
   * 4. Verify Signup OTP
   */
  const verifySignupOtp = async (payload: VerifySignupOtpPayload) => {
    processing.value = true;
    try {
      const res = await request<AuthData>("POST", "/verify-otp", payload);
      return res;
    } finally {
      processing.value = false;
    }
  };

  /**
   * 5. Resend OTP
   */
  const resendOtp = async (payload: ResendOtpPayload) => {
    processing.value = true;
    try {
      const res = await request<unknown>("POST", "/resend-otp", payload);
      return res.message || "A new code has been sent to your email.";
    } finally {
      processing.value = false;
    }
  };

  /**
   * 6. Forgot Password
   */
  const forgotPassword = async (email: string) => {
    processing.value = true;
    try {
      const res = await request<unknown>("POST", "/forgot-password", { email });
      return res.message || "A 6-digit reset code has been sent to your email.";
    } finally {
      processing.value = false;
    }
  };

  /**
   * 7. Reset Password with OTP
   */
  const resetPasswordWithOtp = async (payload: ResetPasswordOtpPayload) => {
    processing.value = true;
    try {
      const res = await request<unknown>("POST", "/reset-password", payload);
      return res.message || "Password reset successfully.";
    } finally {
      processing.value = false;
    }
  };

  /**
   * 8. Logout
   */
  const logout = async () => {
    processing.value = true;
    try {
      await request<unknown>("POST", "/logout");
    } finally {
      syncUser(null);
      processing.value = false;
      initialized.value = false;
    }
  };

  return {
    user,
    isAuthenticated,
    processing,
    initialized,
    syncUser,
    bootstrap,
    login,
    verifyLoginOtp,
    register,
    verifySignupOtp,
    resendOtp,
    forgotPassword,
    resetPasswordWithOtp,
    logout
  };
});
