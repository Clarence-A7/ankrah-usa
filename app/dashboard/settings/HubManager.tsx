"use client";

import React, { useState } from "react";
import { MapPin, Loader2 } from "lucide-react";
import { saveCompanyHub, type CompanyHub } from "@/app/actions/settings";

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

export default function HubManager({ initialHub }: { initialHub: CompanyHub }) {
  const [address, setAddress] = useState(initialHub.address);
  const [lat, setLat] = useState(initialHub.lat);
  const [lng, setLng] = useState(initialHub.lng);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);

  const dirty =
    address !== initialHub.address || lat !== initialHub.lat || lng !== initialHub.lng;

  const save = async () => {
    setBusy(true);
    setBanner(null);
    try {
      const res = await saveCompanyHub({
        address: address.trim(),
        lat: lat.trim(),
        lng: lng.trim(),
      });
      setBanner(
        res.success
          ? { kind: "ok", text: "Hub location saved. New pickups price from here." }
          : { kind: "err", text: res.error ?? "Could not save the hub location." },
      );
    } catch {
      setBanner({ kind: "err", text: "Could not save the hub location." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: "2rem", maxWidth: 820, borderBottom: "1px solid #e2e8f0" }}>
      <h1 style={{ fontSize: "1.5rem", color: "#2e63af", margin: "0 0 0.25rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <MapPin size={22} /> Settings · Company Hub
      </h1>
      <p style={{ color: "#64748b", fontSize: "0.9rem", margin: "0 0 1.25rem", maxWidth: 640 }}>
        The pickup origin. The distance surcharge measures miles from here to each
        customer&apos;s address, so update it whenever the company relocates. Distance
        is estimated from free address lookups — no map API key needed.
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
        <label style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
          <span style={labelText}>Hub address</span>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="123 Warehouse Rd, Philadelphia, PA 19019"
            style={inputStyle}
          />
        </label>

        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: "0.3rem", flex: "1 1 180px" }}>
            <span style={labelText}>Latitude (optional)</span>
            <input
              type="text"
              inputMode="decimal"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              placeholder="39.9526"
              style={inputStyle}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: "0.3rem", flex: "1 1 180px" }}>
            <span style={labelText}>Longitude (optional)</span>
            <input
              type="text"
              inputMode="decimal"
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              placeholder="-75.1652"
              style={inputStyle}
            />
          </label>
        </div>

        <p style={{ margin: 0, color: "#94a3b8", fontSize: "0.8rem", lineHeight: 1.5 }}>
          Lat/lng is the most precise origin — in Google Maps, right-click your location
          and click the coordinates to copy them. Leave both blank to geocode from the
          address instead.
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
            {busy ? "Saving…" : "Save hub location"}
          </button>
        </div>
      </div>
    </div>
  );
}
