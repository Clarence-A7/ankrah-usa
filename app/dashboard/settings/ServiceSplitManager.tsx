"use client";

import React, { useState } from "react";
import { SplitSquareHorizontal, Loader2 } from "lucide-react";
import { saveServiceSplit, type ServiceSplit } from "@/app/actions/settings";

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

export default function ServiceSplitManager({ initialSplit }: { initialSplit: ServiceSplit }) {
  const [pickup, setPickup] = useState(initialSplit.pickup);
  const [ocean, setOcean] = useState(initialSplit.ocean);
  const [lastmile, setLastmile] = useState(initialSplit.lastmile);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);

  const nums = [pickup, ocean, lastmile].map((v) => Number(v));
  const allNumeric = nums.every((n) => !Number.isNaN(n) && n >= 0 && n <= 100) &&
    [pickup, ocean, lastmile].every((v) => v.trim() !== "");
  const sum = allNumeric ? nums.reduce((a, b) => a + b, 0) : NaN;
  const sumsTo100 = allNumeric && Math.abs(sum - 100) < 0.01;

  const dirty =
    pickup !== initialSplit.pickup ||
    ocean !== initialSplit.ocean ||
    lastmile !== initialSplit.lastmile;

  const save = async () => {
    setBusy(true);
    setBanner(null);
    try {
      const res = await saveServiceSplit({
        pickup: pickup.trim(),
        ocean: ocean.trim(),
        lastmile: lastmile.trim(),
      });
      setBanner(
        res.success
          ? { kind: "ok", text: "Service split saved. New receipts and quotes use these shares." }
          : { kind: "err", text: res.error ?? "Could not save the service split." },
      );
    } catch {
      setBanner({ kind: "err", text: "Could not save the service split." });
    } finally {
      setBusy(false);
    }
  };

  const field = (
    name: string,
    value: string,
    setter: (v: string) => void,
    placeholder: string,
  ) => (
    <label style={{ display: "flex", flexDirection: "column", gap: "0.3rem", flex: "1 1 180px" }}>
      <span style={labelText}>{name} (%)</span>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => setter(e.target.value)}
        placeholder={placeholder}
        style={inputStyle}
      />
    </label>
  );

  const canSave = !busy && dirty && sumsTo100;

  return (
    <div style={{ padding: "2rem", maxWidth: 820, borderBottom: "1px solid #e2e8f0" }}>
      <h1
        style={{
          fontSize: "1.5rem",
          color: "#2e63af",
          margin: "0 0 0.25rem",
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
        }}
      >
        <SplitSquareHorizontal size={22} /> Settings · Service Split
      </h1>
      <p style={{ color: "#64748b", fontSize: "0.9rem", margin: "0 0 1.25rem", maxWidth: 660 }}>
        How each shipment&#39;s service charge is itemised on the receipt and checkout into the
        three compliance lines. Applied to the service base (the total minus tax and discount), so
        the three lines always reconcile to the amount owed. The shares must add up to 100%.
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
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          {field("USA Pickup / Consolidation", pickup, setPickup, "15")}
          {field("Ocean / Port charges", ocean, setOcean, "70")}
          {field("Last-mile delivery", lastmile, setLastmile, "15")}
        </div>

        <p
          style={{
            margin: 0,
            fontSize: "0.85rem",
            fontWeight: 600,
            color: sumsTo100 ? "#15803d" : "#b91c1c",
          }}
        >
          {allNumeric
            ? `Total: ${sum.toFixed(2).replace(/\.00$/, "")}%${sumsTo100 ? " ✓" : " — must equal 100%"}`
            : "Enter a number (0–100) for each share."}
        </p>

        <p style={{ margin: 0, color: "#94a3b8", fontSize: "0.8rem", lineHeight: 1.5 }}>
          Example: <code>15 / 70 / 15</code>. On a $516 service base that shows as $77.40 pickup,
          $361.20 ocean and $77.40 last-mile. The last-mile line absorbs any rounding so the lines
          sum exactly.
        </p>

        <div>
          <button
            type="button"
            onClick={save}
            disabled={!canSave}
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
              background: !canSave ? "#94a3b8" : "#2e63af",
              cursor: !canSave ? "not-allowed" : "pointer",
            }}
          >
            {busy && <Loader2 size={16} className="spin" />}
            {busy ? "Saving…" : "Save service split"}
          </button>
        </div>
      </div>
    </div>
  );
}
