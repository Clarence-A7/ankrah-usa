"use client";

import React, { useState } from "react";
import { Mail, Lock, Eye, EyeOff } from "lucide-react";
import styles from "./styles/login.module.css";
import { authenticateUser } from "./login/actions";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const formData = new FormData();
      formData.append("email", email);
      formData.append("password", password);

      const result = await authenticateUser(null, formData);

      if (result.success && result.user) {
        const role = result.user.role;
        if (role === "o_driver") {
          router.push("/dashboard/drivers/origin");
        } else if (role === "d_driver") {
          router.push("/dashboard/drivers/destination");
        } else {
          router.push("/dashboard");
        }
        router.refresh();
      } else {
        setErrorMessage(
          result.error || "An unexpected validation failure occurred.",
        );
      }
    } catch (error) {
      console.error("Login client exception:", error);
      setErrorMessage(
        "A network routing fault blocked processing. Please try again.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className={styles.page}>
      {/* LEFT — login card */}
      <section className={styles.left}>
        <div className={styles.card}>
          <div className={styles.brand}>
            <h1 className={styles.title}>Sign in</h1>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Ankrah F&L" className={styles.logo} />
          </div>

          {errorMessage && <div className={styles.errorBanner}>{errorMessage}</div>}

          <form onSubmit={handleLoginSubmit} className={styles.form}>
            <div className={styles.field}>
              <label className={styles.label}>Work email</label>
              <div className={styles.inputWrap}>
                <span className={styles.icon}>
                  <Mail size={18} />
                </span>
                <input
                  type="email"
                  required
                  placeholder="name@ankrahfl.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={styles.input}
                  disabled={isLoading}
                  autoComplete="email"
                  inputMode="email"
                />
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Password</label>
              <div className={styles.inputWrap}>
                <span className={styles.icon}>
                  <Lock size={18} />
                </span>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={styles.input}
                  disabled={isLoading}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className={styles.toggle}
                  disabled={isLoading}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <div className={styles.forgotRow}>
                <a href="/forgot-password" className={styles.forgot}>
                  Forgot password?
                </a>
              </div>
            </div>

            <button type="submit" className={styles.submit} disabled={isLoading}>
              {isLoading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>

        <p className={styles.credit}>Built by DiaT LLC</p>
      </section>

      {/* RIGHT — brand / tagline panel (desktop only) */}
      <aside className={styles.right}>
        <div className={styles.rightGlow} aria-hidden="true" />
        <div className={styles.rightInner}>
          <h2 className={styles.tagline}>
            Freight &amp; logistics management — consolidation to delivery.
          </h2>
          <p className={styles.taglineSub}>
            Manifests, live tracking, dispatch, and reporting — one platform,
            from first-mile pickup to final delivery.
          </p>
        </div>
      </aside>
    </main>
  );
}
