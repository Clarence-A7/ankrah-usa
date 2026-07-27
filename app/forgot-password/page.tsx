"use client";

import { useActionState } from "react";
import Link from "next/link";
import {
  requestPasswordReset,
  type RequestResetState,
} from "../actions/password-reset";

const initialState: RequestResetState = { done: false };

const card: React.CSSProperties = {
  width: "100%",
  maxWidth: 420,
  background: "#fff",
  borderRadius: 16,
  padding: "2.5rem 2rem",
  boxShadow: "0 10px 40px rgba(15,23,42,0.08)",
  border: "1px solid #eef2f7",
};

export default function ForgotPasswordPage() {
  const [state, formAction, pending] = useActionState(
    requestPasswordReset,
    initialState,
  );

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: "1.5rem",
        background: "linear-gradient(160deg,#eef3fb 0%,#f8fafc 100%)",
      }}
    >
      <div style={card}>
        <div style={{ textAlign: "center", marginBottom: "1.25rem" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Ankrah F&L" style={{ height: 52, width: "auto" }} />
        </div>

        {state.done ? (
          <div style={{ textAlign: "center" }}>
            <h1 style={{ fontSize: "1.25rem", color: "#0f172a", margin: "0 0 .5rem" }}>
              Check your email
            </h1>
            <p style={{ color: "#64748b", fontSize: ".95rem", lineHeight: 1.5 }}>
              If an account exists for that email, we&apos;ve sent a link to reset
              your password. It expires in 1 hour.
            </p>
            <Link
              href="/"
              style={{ display: "inline-block", marginTop: "1.5rem", color: "#2e63af", fontWeight: 600, textDecoration: "none" }}
            >
              ← Back to sign in
            </Link>
          </div>
        ) : (
          <>
            <h1 style={{ fontSize: "1.35rem", color: "#0f172a", margin: "0 0 .35rem", textAlign: "center" }}>
              Forgot your password?
            </h1>
            <p style={{ color: "#64748b", fontSize: ".92rem", textAlign: "center", margin: "0 0 1.5rem" }}>
              Enter your account email and we&apos;ll send you a reset link.
            </p>

            <form action={formAction}>
              <label style={{ display: "block", fontSize: ".85rem", color: "#475569", marginBottom: 6, fontWeight: 600 }}>
                Email address
              </label>
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                disabled={pending}
                style={{
                  width: "100%", padding: "12px 14px", fontSize: ".95rem",
                  border: "1px solid #cbd5e1", borderRadius: 10, outline: "none",
                  boxSizing: "border-box",
                }}
              />
              {state.error && (
                <p style={{ color: "#dc2626", fontSize: ".85rem", margin: ".6rem 0 0" }}>
                  {state.error}
                </p>
              )}

              <button
                type="submit"
                disabled={pending}
                style={{
                  width: "100%", marginTop: "1.25rem", padding: "12px 14px",
                  background: pending ? "#7f9fd0" : "#2e63af", color: "#fff",
                  fontSize: ".98rem", fontWeight: 700, border: "none",
                  borderRadius: 10, cursor: pending ? "default" : "pointer",
                }}
              >
                {pending ? "Sending…" : "Send reset link"}
              </button>
            </form>

            <div style={{ textAlign: "center", marginTop: "1.25rem" }}>
              <Link href="/" style={{ color: "#2e63af", fontWeight: 600, textDecoration: "none", fontSize: ".9rem" }}>
                ← Back to sign in
              </Link>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
