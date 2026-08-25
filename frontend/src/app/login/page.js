"use client";

import { useMemo, useState } from "react";

import { useRouter, useSearchParams } from "next/navigation";

import { Loader2, LogIn, ShieldCheck } from "lucide-react";

import { authServiceApi } from "@/lib/api";

import { setAuthSession } from "@/lib/authStorage";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const returnTo = useMemo(
    () => searchParams.get("returnTo") || "/workspace",
    [searchParams]
  );

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();

    setLoading(true);
    setError("");

    try {
      // ==================================================
      // 1. NORMAL AUTHENTICATION
      // ==================================================
      const { data } = await authServiceApi.post("/login", {
        email,
        password
      });

      const token = data?.data?.token || "";
      const user = data?.data?.user || null;

      if (!token) {
        throw new Error(
          "Login succeeded, but no authentication token was returned."
        );
      }

      // ==================================================
      // 2. STORE THE NORMAL USER SESSION
      // ==================================================
      setAuthSession({
        token,
        user
      });

      try {
        window.localStorage.setItem(
          "internlabs_admin_token",
          token
        );
      } catch {
        // Ignore localStorage errors.
      }

      // ==================================================
      // 3. CHECK ADMIN ACCESS
      //
      // The normal login token is used to ask the backend
      // whether this account is an approved administrator.
      // ==================================================
      let isAdmin = false;
      let adminToken = "";

      try {
        const adminResponse = await authServiceApi.post(
          "/admin/check",
          {},
          {
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        );

        isAdmin =
          adminResponse?.data?.isAdmin === true;

        adminToken =
          adminResponse?.data?.adminToken || "";

        console.log(
          "[LOGIN] Admin access check:",
          {
            isAdmin,
            email: user?.email || email
          }
        );
      } catch (adminError) {
        console.log(
          "[LOGIN] Account is not an approved admin. Continuing as a normal user.",
          adminError?.response?.data ||
            adminError?.message
        );

        isAdmin = false;
      }

      // ==================================================
      // 4. ADMIN USER
      //
      // Approved administrators go directly to the
      // admin journey management page.
      // ==================================================
      if (isAdmin) {
        if (adminToken) {
          try {
            window.localStorage.setItem(
              "skillzage_admin_token",
              adminToken
            );
          } catch {
            // Ignore localStorage errors.
          }
        }

        console.log(
          "[LOGIN] Approved admin detected. Redirecting to /adminJourney."
        );

        router.replace("/adminJourney");
        return;
      }

      // ==================================================
      // 5. NORMAL USER
      //
      // Non-admin accounts continue to the requested
      // workspace or the default workspace.
      // ==================================================
      console.log(
        "[LOGIN] Normal account detected. Redirecting to:",
        returnTo
      );

      router.replace(returnTo);
    } catch (err) {
      console.error(
        "[LOGIN] Authentication failed:",
        err?.response?.data || err
      );

      setError(
        err?.response?.data?.message ||
          err?.response?.data?.detail ||
          err?.message ||
          "We couldn't sign you in. Please check your email and password and try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(255,127,41,0.18),transparent_30%),linear-gradient(135deg,#fffaf4_0%,#fffdf9_50%,#fff2e1_100%)]">
      <div className="mx-auto grid min-h-screen max-w-6xl items-center gap-10 px-4 py-8 lg:grid-cols-[1.05fr_0.95fr] lg:px-8">

        {/* =====================================================
            LEFT SIDE
        ===================================================== */}

        <div className="relative overflow-hidden rounded-[2.5rem] border border-white/70 bg-white/85 p-8 shadow-[0_28px_90px_-58px_rgba(15,23,42,0.42)] backdrop-blur">

          <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-orange-100/70 blur-2xl" />

          <div className="absolute -bottom-20 -left-16 h-56 w-56 rounded-full bg-[#fff0e4] blur-2xl" />

          <p className="text-[10px] font-black uppercase tracking-[0.36em] text-orange-500">
            SkillzAge Access
          </p>

          <h1 className="mt-3 max-w-xl text-4xl font-black tracking-tight text-slate-950 sm:text-5xl">
            Welcome back to your SkillzAge journey.
          </h1>

          <p className="mt-4 max-w-xl text-base font-medium leading-7 text-slate-600">
            Sign in with your SkillzAge account to continue
            where you left off. Your account type determines
            which part of the platform you enter.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">

            {[
              [
                "Your journey",
                "Continue working through your startup journey with your existing account."
              ],
              [
                "Your progress",
                "Your profile and journey context stay connected to your account."
              ],
              [
                "Workspace",
                "Regular users are taken directly to their SkillzAge workspace."
              ],
              [
                "Admin access",
                "Approved administrators are taken directly to the journey management area."
              ]
            ].map(([title, body]) => (
              <div
                key={title}
                className="rounded-3xl border border-slate-200 bg-white px-4 py-4"
              >
                <p className="text-sm font-black text-slate-950">
                  {title}
                </p>

                <p className="mt-1 text-sm leading-6 text-slate-600">
                  {body}
                </p>
              </div>
            ))}

          </div>
        </div>

        {/* =====================================================
            RIGHT SIDE
        ===================================================== */}

        <div className="rounded-[2.5rem] border border-white/70 bg-white/92 p-6 shadow-[0_28px_90px_-58px_rgba(15,23,42,0.42)] backdrop-blur sm:p-8">

          <div className="flex items-center gap-3">

            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-orange-500 text-white shadow-[0_18px_32px_-18px_rgba(249,115,22,0.9)]">
              <ShieldCheck className="h-5 w-5" />
            </div>

            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-400">
                Secure Access
              </p>

              <h2 className="text-2xl font-black text-slate-950">
                Sign in
              </h2>
            </div>

          </div>

          <form
            onSubmit={handleSubmit}
            className="mt-8 grid gap-4"
          >

            {/* EMAIL */}

            <label className="grid gap-2">

              <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                Email address
              </span>

              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-orange-300 focus:bg-white"
                autoComplete="email"
              />

            </label>

            {/* PASSWORD */}

            <label className="grid gap-2">

              <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                Password
              </span>

              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-orange-300 focus:bg-white"
                autoComplete="current-password"
              />

            </label>

            {/* ERROR */}

            {error ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                {error}
              </div>
            ) : null}

            {/* SUBMIT */}

            <button
              type="submit"
              disabled={
                loading ||
                !email.trim() ||
                !password.trim()
              }
              className="mt-2 inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3.5 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LogIn className="h-4 w-4" />
              )}

              {loading
                ? "Checking your account..."
                : "Sign in"}
            </button>

          </form>

          {/* INFORMATION */}

          <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-600">
            After signing in, SkillzAge automatically takes
            you to the right place for your account. Regular
            users continue to the workspace, while approved
            administrators are taken directly to the admin
            journey manager.
          </div>

        </div>
      </div>
    </main>
  );
}