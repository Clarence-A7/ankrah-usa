"use client";

import React, { useState } from "react";
import { Tag, Loader2 } from "lucide-react";
import { saveDiscountSettings, type DiscountSettings } from "@/app/actions/settings";

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
const fieldCol: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "0.3rem" };

export default function DiscountManager({ initialDiscount }: { initialDiscount: DiscountSettings }) {
  const [enabled, setEnabled] = useState(initialDiscount.enabled);
  const [type, setType] = useState<DiscountSettings["type"]>(initialDiscount.type);
  const [value, setValue] = useState(initialDiscount.value);
  const [label, setLabel] = useState(initialDiscount.label);
  const [minSubtotal, setMinSubtotal] = useState(initialDiscount.minSubtotal);
  const [statesText, setStatesText] = useState(initialDiscount.states.join(", "));
  const [start, setStart] = useState(initialDiscount.start);
  const [end, setEnd] = useState(initialDiscount.end);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);

  const parseStates = (text: string) =>
    text
      .split(/[\s,]+/)
      .map((s) => s.trim().toUpperCase())
      .filter((s) => /^[A-Z]{2}$/.test(s));

  const save = async () => {
    setBusy(true);
    setBanner(null);
    try {
      const res = await saveDiscountSettings({
        enabled,
        type,
        value: value.trim(),
        label: label.trim(),
        minSubtotal: minSubtotal.trim(),
        states: parseStates(statesText),
        start: start.trim(),
        end: end.trim(),
      });
      setBanner(
        res.success
          ? { kind: "ok", text: "Discount rule saved. Matching pickups get it automatically." }
          : { kind: "err", text: res.error ?? "Could not save the discount settings." },
      );
    } catch {
      setBanner({ kind: "err", text: "Could not save the discount settings." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: "2rem", maxWidth: 820, borderBottom: "1px solid #e2e8f0" }}>
      <h1 style={{ fontSize: "1.5rem", color: "#2e63af", margin: "0 0 0.25rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <Tag size={22} /> Settings · Automatic Discount
      </h1>
      <p style={{ color: "#64748b", fontSize: "0.9rem", margin: "0 0 1.25rem", maxWidth: 640 }}>
        One rule, applied automatically at pickup checkout to the item subtotal plus any
        surcharge (before tax). Leave the conditions blank to apply it to every pickup, or
        narrow it to certain states, a minimum order, and/or a date window.
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
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} style={{ width: 18, height: 18 }} />
          <span style={{ ...labelText, fontSize: "0.92rem" }}>Apply this discount automatically</span>
        </label>

        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          <label style={{ ...fieldCol, flex: "1 1 160px" }}>
            <span style={labelText}>Discount type</span>
            <select value={type} onChange={(e) => setType(e.target.value as DiscountSettings["type"])} style={inputStyle}>
              <option value="percent">Percentage (%)</option>
              <option value="flat">Flat amount ($)</option>
            </select>
          </label>
          <label style={{ ...fieldCol, flex: "1 1 160px" }}>
            <span style={labelText}>{type === "flat" ? "Amount ($)" : "Percent (%)"}</span>
            <input type="text" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder={type === "flat" ? "25" : "10"} style={inputStyle} />
          </label>
          <label style={{ ...fieldCol, flex: "1 1 220px" }}>
            <span style={labelText}>Label on the invoice</span>
            <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Holiday Promo" style={inputStyle} />
          </label>
        </div>

        <div style={{ borderTop: "1px dashed #e2e8f0", margin: "0.25rem 0", paddingTop: "0.9rem" }}>
          <p style={{ ...labelText, margin: "0 0 0.6rem", color: "#334155" }}>Conditions (all optional — blank means no limit)</p>
          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
            <label style={{ ...fieldCol, flex: "1 1 160px" }}>
              <span style={labelText}>Minimum order ($)</span>
              <input type="text" inputMode="decimal" value={minSubtotal} onChange={(e) => setMinSubtotal(e.target.value)} placeholder="0" style={inputStyle} />
            </label>
            <label style={{ ...fieldCol, flex: "1 1 220px" }}>
              <span style={labelText}>Only these states (2-letter, comma-separated)</span>
              <input type="text" value={statesText} onChange={(e) => setStatesText(e.target.value)} placeholder="PA, NY" style={inputStyle} />
            </label>
          </div>
          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginTop: "0.9rem" }}>
            <label style={{ ...fieldCol, flex: "1 1 160px" }}>
              <span style={labelText}>Start date</span>
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} style={inputStyle} />
            </label>
            <label style={{ ...fieldCol, flex: "1 1 160px" }}>
              <span style={labelText}>End date</span>
              <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} style={inputStyle} />
            </label>
          </div>
        </div>

        <div>
          <button
            type="button"
            onClick={save}
            disabled={busy}
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
              background: busy ? "#94a3b8" : "#2e63af",
              cursor: busy ? "not-allowed" : "pointer",
            }}
          >
            {busy && <Loader2 size={16} className="spin" />}
            {busy ? "Saving…" : "Save discount rule"}
          </button>
        </div>
      </div>
    </div>
  );
}
