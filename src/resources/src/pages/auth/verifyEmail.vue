<template>
  <div class="container position-absolute start-50 top-50 translate-middle">
    <div class="auth col-12 col-sm-9 col-md-7 col-lg-5 col-xl-4 mx-auto py-5">
      <div class="card card-body border-0 shadow-lg" style="background: #131926; border-radius: 12px;">
        <div class="d-block mb-2 text-center">
          <img src="@/assets/images/logo.png" alt="Jupiter" style="max-height: 60px;" />
        </div>
        <h4 class="text-center text-white">Email Verification</h4>
        <div class="text-center mt-3">
          <router-link to="/login" class="btn btn-primary px-4">
            <span>Back to Sign In</span>
          </router-link>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useHead } from "@vueuse/head";
import { useRoute, useRouter } from "vue-router";
import { useGum } from "@/plugins/gum";
import { useToast } from "@/composables/useToast";

useHead({ title: "Verify Email - Jupiter" });

const route = useRoute();
const router = useRouter();
const toast = useToast();

const email = String(route.query.email || "").trim();
const token = String(route.query.token || "").trim();

const { post } = useGum();

const verify = async () => {
  if (!email || !token) {
    toast.error("Invalid verification link. Please request a new one.");
    return;
  }

  await post(
    "/api/auth/verify-email",
    { email, token },
    {
      onSuccess: () => {
        toast.success("Email verified successfully. You can now login.");
        setTimeout(() => router.push("/login"), 1000);
      },
      onError: (_errors, error) => {
        toast.error(error instanceof Error ? error.message : "Failed to verify email");
      }
    }
  );
};

void verify();
</script>

<style lang="scss" scoped></style>
