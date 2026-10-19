"use client";

import React, { useState } from "react";
import { MapPin, Plus, Trash2, X } from "lucide-react";
import { getZones, saveZone, deleteZone, type ZoneDTO } from "@/app/actions/zones";

const US_STATES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "District of Columbia",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada",
  NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon",
  PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
  TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia",
  WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

type Banner = { kind: "ok" | "err"; text: string };

export default function ZonesManager({ initialZones }: { initialZones: ZoneDTO[] }) {
  const [zones, setZones] = useState<ZoneDTO[]>(initialZones);
  const [adding, setAdding] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);

  const reload = async () => {
    try {
      setZones(await getZones());
    } catch {
      /* keep current view; banner already shows outcome */
    }
  };

  const handleSaved = async (text: string) => {
    setBanner({ kind: "ok", text });
    setAdding(false);
    await reload();
  };
  const handleError = (text: string) => setBanner({ kind: "err", text });

  return (
    <div style={{ padding: "2rem", maxWidth: 820 }}>
      <h1 style={{ fontSize: "1.5rem", color: "#2e63af", margin: "0 0 0.25rem" }}>
        Settings · Service Zones
      </h1>
      <p style={{ color: "#64748b", fontSize: "0.9rem", margin: "0 0 1.25rem", maxWidth: 640 }}>
        Where pickups can be booked from. The public wizard shows active zones, blocks
        out-of-zone bookings, and captures those leads. Expanding is a data change here —
        no code required.
      </p>

      {banner && (
        <div
          role="status"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "1rem",
            margin: "0 0 1rem",
            padding: "10px 14px",
            borderRadius: 10,
            fontSize: "0.9rem",
            background: banner.kind === "ok" ? "#f0fdf4" : "#fef2f2",
            color: banner.kind === "ok" ? "#15803d" : "#b91c1c",
            border: `1px solid ${banner.kind === "ok" ? "#bbf7d0" : "#fecaca"}`,
          }}
        >
          <span>{banner.text}</span>
          <button
            type="button"
            onClick={() => setBanner(null)}
            aria-label="Dismiss"
            style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontWeight: 700, fontSize: "1.1rem", lineHeight: 1 }}
          >
            ×
          </button>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {zones.map((z) => (
          <ZoneCard key={z.id} zone={z} onSaved={handleSaved} onError={handleError} />
        ))}
        {adding && (
          <ZoneCard
            key="__new"
            onSaved={handleSaved}
            onError={handleError}
            onCancel={() => setAdding(false)}
          />
        )}
      </div>

      {!adding && (
        <button
          type="button"
          onClick={() => {
            setBanner(null);
            setAdding(true);
          }}
          style={{
            marginTop: "1.25rem",
            display: "inline-flex",
            alignItems: "center",
            gap: "0.4rem",
            padding: "0.6rem 1rem",
            borderRadius: 10,
            border: "1px dashed #94a3b8",
            background: "#fff",
            color: "#2e63af",
            fontWeight: 600,
            fontSize: "0.9rem",
            cursor: "pointer",
          }}
        >
          <Plus size={16} /> Add a zone
        </button>
      )}
    </div>
  );
}

function ZoneCard({
  zone,
  onSaved,
  onError,
  onCancel,
}: {
  zone?: ZoneDTO;
  onSaved: (text: string) => void | Promise<void>;
  onError: (text: string) => void;
  onCancel?: () => void;
}) {
  const isNew = !zone;
  const [name, setName] = useState(zone?.name ?? "");
  const [states, setStates] = useState<string[]>(zone?.states ?? []);
  const [isActive, setIsActive] = useState(zone?.isActive ?? false);
  const [freeMiles, setFreeMiles] = useState<string>(zone ? String(zone.freeMiles) : "20");
  const [perMile, setPerMile] = useState<string>(zone ? String(zone.perMile) : "2");
  const [busy, setBusy] = useState(false);

  const available = Object.keys(US_STATES)
    .filter((c) => !states.includes(c))
    .sort((a, b) => US_STATES[a].localeCompare(US_STATES[b]));

  const addStateCode = (code: string) => {
    if (code && !states.includes(code)) setStates([...states, code]);
  };
  const removeState = (code: string) => setStates(states.filter((s) => s !== code));

  const save = async () => {
    setBusy(true);
    const res = await saveZone({
      id: zone?.id,
      name: name.trim(),
      states,
      isActive,
      freeMiles: parseFloat(freeMiles) || 0,
      perMile: parseFloat(perMile) || 0,
    });
    setBusy(false);
    if (res.success) {
      await onSaved(isNew ? `Zone "${name.trim()}" created.` : `"${name.trim()}" saved.`);
    } else {
      onError(res.error || "Could not save the zone.");
    }
  };

  const remove = async () => {
    if (!zone) return;
    if (!window.confirm(`Delete "${zone.name}"? This can't be undone.`)) return;
    setBusy(true);
    const res = await deleteZone(zone.id);
    setBusy(false);
    if (res.success) await onSaved(`Zone "${zone.name}" deleted.`);
    else onError(res.error || "Could not delete the zone.");
  };

  return (
    <div
      style={{
        border: "1px solid #e2e8f0",
        borderRadius: 12,
        padding: "1rem 1.1rem",
        background: isActive ? "#fff" : "#f8fafc",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
        <MapPin size={18} color={isActive ? "#15803d" : "#94a3b8"} />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Zone name (e.g. Zone 1)"
          maxLength={100}
          style={{
            flex: "1 1 180px",
            padding: "0.5rem 0.6rem",
            border: "1px solid #cbd5e1",
            borderRadius: 8,
            fontSize: "0.95rem",
            fontWeight: 600,
            color: "#0f172a",
          }}
        />
        <label style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", fontSize: "0.9rem", color: "#334155", cursor: "pointer" }}>
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Active
        </label>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", margin: "0.85rem 0" }}>
        {states.length === 0 && (
          <span style={{ fontSize: "0.85rem", color: "#94a3b8" }}>No states yet — add some below.</span>
        )}
        {states.map((code) => (
          <span
            key={code}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.3rem",
              padding: "4px 6px 4px 10px",
              background: "#eff6ff",
              border: "1px solid #bfdbfe",
              borderRadius: 999,
              fontSize: "0.82rem",
              color: "#1d4ed8",
            }}
          >
            {US_STATES[code] || code} ({code})
            <button
              type="button"
              onClick={() => removeState(code)}
              aria-label={`Remove ${code}`}
              style={{ display: "inline-flex", background: "none", border: "none", color: "#1d4ed8", cursor: "pointer", padding: 0 }}
            >
              <X size={14} />
            </button>
          </span>
        ))}
      </div>

      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "flex-end", margin: "0 0 0.9rem", paddingTop: "0.6rem", borderTop: "1px dashed #e2e8f0" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "#475569" }}>Free miles (included)</span>
          <input
            type="number"
            min="0"
            step="1"
            value={freeMiles}
            onChange={(e) => setFreeMiles(e.target.value)}
            style={{ width: 120, padding: "0.45rem 0.6rem", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: "0.9rem" }}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "#475569" }}>Surcharge per mile ($)</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={perMile}
            onChange={(e) => setPerMile(e.target.value)}
            style={{ width: 120, padding: "0.45rem 0.6rem", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: "0.9rem" }}
          />
        </label>
        <p style={{ margin: 0, color: "#94a3b8", fontSize: "0.8rem", lineHeight: 1.4 }}>
          First {freeMiles || 0} mi from the hub included, then ${perMile || 0}/mi.
        </p>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
        <select
          value=""
          onChange={(e) => addStateCode(e.target.value)}
          disabled={available.length === 0}
          style={{ padding: "0.45rem 0.6rem", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: "0.88rem", background: "#fff", color: "#334155" }}
        >
          <option value="">+ Add state…</option>
          {available.map((c) => (
            <option key={c} value={c}>
              {US_STATES[c]} ({c})
            </option>
          ))}
        </select>

        <div style={{ display: "flex", gap: "0.5rem" }}>
          {isNew ? (
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              style={btnStyle("#fff", "#475569", "1px solid #cbd5e1")}
            >
              Cancel
            </button>
          ) : (
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              style={{ ...btnStyle("#fff", "#b91c1c", "1px solid #fecaca"), display: "inline-flex", alignItems: "center", gap: "0.3rem" }}
            >
              <Trash2 size={15} /> Delete
            </button>
          )}
          <button
            type="button"
            onClick={save}
            disabled={busy || !name.trim()}
            style={btnStyle(busy ? "#93c5fd" : "#2563eb", "#fff", "none")}
          >
            {busy ? "Saving…" : isNew ? "Create zone" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function btnStyle(bg: string, color: string, border: string): React.CSSProperties {
  return {
    padding: "0.5rem 1rem",
    borderRadius: 8,
    border,
    background: bg,
    color,
    fontSize: "0.875rem",
    fontWeight: 600,
    cursor: "pointer",
  };
}
