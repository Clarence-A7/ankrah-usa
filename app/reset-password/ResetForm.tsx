"use client";

import { useActionState } from "react";
import Link from "next/link";
import { resetPassword, type ResetState } from "../actions/password-reset";

const initialState: ResetState = { success: false };

const card: React.CSSProperties = {
  width: "100%",
  maxWidth: 420,
  background: "#fff",
  borderRadius: 16,
  padding: "2.5rem 2rem",
  boxShadow: "0 10px 40px rgba(15,23,42,0.08)",
  border: "1px solid #eef2f7",
};
const input: React.CSSProperties = {
  width: "100%", padding: "12px 14px", fontSize: ".95rem",
  border: "1px solid #cbd5e1", borderRadius: 10, outline: "none",
  boxSizing: "border-box",
};
const label: React.CSSProperties = {
  display: "block", fontSize: ".85rem", color: "#475569", margin: "0 0 6px", fontWeight: 600,
};

export default function ResetForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(resetPassword, initialState);

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

        {state.success ? (
          <div style={{ textAlign: "center" }}>
            <h1 style={{ fontSize: "1.25rem", color: "#0f172a", margin: "0 0 .5rem" }}>
              Password updated
            </h1>
            <p style={{ color: "#64748b", fontSize: ".95rem", lineHeight: 1.5 }}>
              Your password has been changed. You can now sign in with it.
            </p>
            <Link
              href="/"
              style={{
                display: "inline-block", marginTop: "1.5rem", padding: "11px 26px",
                background: "#2e63af", color: "#fff", fontWeight: 700,
                borderRadius: 10, textDecoration: "none",
              }}
            >
              Go to sign in
            </Link>
          </div>
        ) : !token ? (
          <div style={{ textAlign: "center" }}>
            <h1 style={{ fontSize: "1.2rem", color: "#0f172a", margin: "0 0 .5rem" }}>
              Invalid reset link
            </h1>
            <p style={{ color: "#64748b", fontSize: ".95rem" }}>
              This link is missing its reset token. Request a new one.
            </p>
            <Link href="/forgot-password" style={{ display: "inline-block", marginTop: "1.25rem", color: "#2e63af", fontWeight: 600, textDecoration: "none" }}>
              Request a new link
            </Link>
          </div>
        ) : (
          <>
            <h1 style={{ fontSize: "1.35rem", color: "#0f172a", margin: "0 0 .35rem", textAlign: "center" }}>
              Set a new password
            </h1>
            <p style={{ color: "#64748b", fontSize: ".92rem", textAlign: "center", margin: "0 0 1.5rem" }}>
              Choose a strong password you don&apos;t use elsewhere.
            </p>

            <form action={formAction}>
              <input type="hidden" name="token" value={token} />

              <label style={label}>New password</label>
              <input name="password" type="password" required minLength={8} autoComplete="new-password" placeholder="At least 8 characters" disabled={pending} style={input} />

              <label style={{ ...label, marginTop: "1rem" }}>Confirm password</label>
              <input name="confirm" type="password" required minLength={8} autoComplete="new-password" placeholder="Re-enter password" disabled={pending} style={input} />

              {state.error && (
                <p style={{ color: "#dc2626", fontSize: ".85rem", margin: ".7rem 0 0" }}>{state.error}</p>
              )}

              <button
                type="submit"
                disabled={pending}
                style={{
                  width: "100%", marginTop: "1.4rem", padding: "12px 14px",
                  background: pending ? "#7f9fd0" : "#2e63af", color: "#fff",
                  fontSize: ".98rem", fontWeight: 700, border: "none",
                  borderRadius: 10, cursor: pending ? "default" : "pointer",
                }}
              >
                {pending ? "Updating…" : "Update password"}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
