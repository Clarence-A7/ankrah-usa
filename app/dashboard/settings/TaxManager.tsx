"use client";

import React, { useState } from "react";
import { Receipt, Loader2 } from "lucide-react";
import { saveTaxSettings, type TaxSettings } from "@/app/actions/settings";

type Banner = { kind: "ok" | "err"; text: string };

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.55rem 0.7rem",
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  fontSize: "0.92rem",
  boxSizing: "border-box",
};
const labelText: React.CSSProperties = { fontSize: "0.8rem", fontWeight: 600, color: "#475569" };

export default function TaxManager({ initialTax }: { initialTax: TaxSettings }) {
  const [enabled, setEnabled] = useState(initialTax.enabled);
  const [rate, setRate] = useState(initialTax.rate);
  const [label, setLabel] = useState(initialTax.label);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);

  const dirty =
    enabled !== initialTax.enabled || rate !== initialTax.rate || label !== initialTax.label;

  const save = async () => {
    setBusy(true);
    setBanner(null);
    try {
      const res = await saveTaxSettings({ enabled, rate: rate.trim(), label: label.trim() });
      setBanner(
        res.success
          ? { kind: "ok", text: "Tax settings saved. New pickups are taxed at this rate." }
          : { kind: "err", text: res.error ?? "Could not save the tax settings." },
      );
    } catch {
      setBanner({ kind: "err", text: "Could not save the tax settings." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: "2rem", maxWidth: 820, borderBottom: "1px solid #e2e8f0" }}>
      <h1 style={{ fontSize: "1.5rem", color: "#2e63af", margin: "0 0 0.25rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <Receipt size={22} /> Settings · Sales Tax
      </h1>
      <p style={{ color: "#64748b", fontSize: "0.9rem", margin: "0 0 1.25rem", maxWidth: 640 }}>
        Charged at pickup checkout on the item subtotal plus any distance surcharge, shown
        as its own line on the quote and the invoice. Leave it off to charge no tax.
      </p>

      {banner && (
        <div
          role="status"
          style={{
            margin: "0 0 1rem",
            padding: "10px 14px",
            borderRadius: 10,
            fontSize: "0.9rem",
            background: banner.kind === "ok" ? "#f0fdf4" : "#fef2f2",
            color: banner.kind === "ok" ? "#15803d" : "#b91c1c",
            border: `1px solid ${banner.kind === "ok" ? "#bbf7d0" : "#fecaca"}`,
          }}
        >
          {banner.text}
        </div>
      )}

      <div
        style={{
          border: "1px solid #e2e8f0",
          borderRadius: 12,
          padding: "1.25rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.9rem",
          background: "#fff",
        }}
      >
        <label style={{ display: "flex", alignItems: "center", gap: "0.6rem", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            style={{ width: 18, height: 18 }}
          />
          <span style={{ ...labelText, fontSize: "0.92rem" }}>Charge sales tax on pickups</span>
        </label>

        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: "0.3rem", flex: "1 1 160px" }}>
            <span style={labelText}>Tax rate (%)</span>
            <input
              type="text"
              inputMode="decimal"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              placeholder="6"
              style={inputStyle}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: "0.3rem", flex: "1 1 260px" }}>
            <span style={labelText}>Label on the invoice</span>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="PA Sales Tax"
              style={inputStyle}
            />
          </label>
        </div>

        <p style={{ margin: 0, color: "#94a3b8", fontSize: "0.8rem", lineHeight: 1.5 }}>
          Pennsylvania state sales tax is 6%. Enter the whole number — e.g. <code>6</code> for 6%.
          The rate shows next to the label automatically, so &quot;PA Sales Tax&quot; appears as
          &quot;PA Sales Tax (6%)&quot;.
        </p>

        <div>
          <button
            type="button"
            onClick={save}
            disabled={busy || !dirty}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.6rem 1.1rem",
              borderRadius: 8,
              border: "none",
              fontSize: "0.92rem",
              fontWeight: 600,
              color: "#fff",
              background: busy || !dirty ? "#94a3b8" : "#2e63af",
              cursor: busy || !dirty ? "not-allowed" : "pointer",
            }}
          >
            {busy && <Loader2 size={16} className="spin" />}
            {busy ? "Saving…" : "Save tax settings"}
          </button>
        </div>
      </div>
    </div>
  );
}
