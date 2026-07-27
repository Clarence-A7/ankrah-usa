"use client";

import React, { useState, useEffect } from "react";
import { Table } from "../../../components/ui/Table";
import { Badge } from "../../../components/ui/Badge";
import Button from "../../../components/ui/Button";

// Direct sub-path imports bypass Turbopack's tree-shaking bundle panic entirely
import Banknote from "lucide-react/dist/esm/icons/banknote";
import Edit3 from "lucide-react/dist/esm/icons/edit-3";
import Trash2 from "lucide-react/dist/esm/icons/trash-2";
import Plus from "lucide-react/dist/esm/icons/plus";
import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw";
import Check from "lucide-react/dist/esm/icons/check";
import Search from "lucide-react/dist/esm/icons/search";
import X from "lucide-react/dist/esm/icons/x";

import styles from "../../styles/dashboard.module.css";

interface RateItem {
  id: number;
  item_name: string;
  rate: number;
}

export default function PricingPage() {
  const [rates, setRates] = useState<RateItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [showAddForm, setShowAddForm] = useState<boolean>(false);

  // ── ADD State ─────────────────────────────────────────────────────────────
  const [addName, setAddName] = useState<string>("");
  const [addRate, setAddRate] = useState<string>("");
  const [isAdding, setIsAdding] = useState<boolean>(false);

  // ── EDIT State ────────────────────────────────────────────────────────────
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState<string>("");
  const [editRate, setEditRate] = useState<string>("");
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // ── API ENDPOINTS ──────────────────────────────────────────────────────────
  // PHP API base is env-driven so the same code runs in local dev and on
  // Vercel; it falls back to the local Laragon path for `next dev`.
  // NOTE: this is a client component, so SECURITY_TOKEN is shipped to the
  // browser (every NEXT_PUBLIC_ value is public). Treat it as a low-value
  // portal key, not a real secret — see the note about proxying admin writes
  // through a Next.js server route so the true gateway token stays server-side.
  const PHP_API_BASE =
    process.env.NEXT_PUBLIC_PHP_API_BASE_URL || "http://localhost/localankrah/api";
  // Filenames are case-sensitive on the production (Linux) host: the file on
  // disk is `adminrates.php`, not `adminRates.php`.
  const READ_API = `${PHP_API_BASE}/pickupRates.php`;
  const WRITE_API = `${PHP_API_BASE}/adminrates.php`;
  const SECURITY_TOKEN =
    process.env.NEXT_PUBLIC_PICKUP_PORTAL_TOKEN || "demo-local-token";

  // ── FETCH ──────────────────────────────────────────────────────────────────
  const fetchRates = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(READ_API, {
        method: "GET",
        headers: { "x-pickup-portal-token": SECURITY_TOKEN },
      });
      if (!response.ok)
        throw new Error(
          `Error ${response.status}: Failed to fetch rate sheets.`,
        );
      const data = await response.json();
      setRates(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.message || "An error occurred while loading rates.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRates();
  }, []);

  // ── ADD ────────────────────────────────────────────────────────────────────
  const handleAddItem = async () => {
    const name = addName.trim();
    const rate = parseFloat(addRate);

    if (!name) {
      alert("Item name is required.");
      return;
    }
    if (!addRate || isNaN(rate) || rate <= 0) {
      alert("Please enter a valid positive price.");
      return;
    }

    setIsAdding(true);
    try {
      const response = await fetch(WRITE_API, {
        method: "POST",
        headers: {
          "x-pickup-portal-token": SECURITY_TOKEN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "add", item_name: name, rate }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          data.detail || data.error || `Server error ${response.status}`,
        );

      setAddName("");
      setAddRate("");
      setShowAddForm(false);
      await fetchRates();
    } catch (err: any) {
      alert(`Add Failed: ${err.message}`);
    } finally {
      setIsAdding(false);
    }
  };

  // ── UPDATE ─────────────────────────────────────────────────────────────────
  const handleUpdateItem = async (id: number) => {
    const name = editName.trim();
    const rate = parseFloat(editRate);

    if (!name) {
      alert("Item name is required.");
      return;
    }
    if (!editRate || isNaN(rate) || rate <= 0) {
      alert("Please enter a valid positive price.");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(WRITE_API, {
        method: "POST",
        headers: {
          "x-pickup-portal-token": SECURITY_TOKEN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "update", id, item_name: name, rate }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          data.detail || data.error || `Server error ${response.status}`,
        );

      cancelEditing();
      await fetchRates();
    } catch (err: any) {
      alert(`Update Failed: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // ── DELETE ─────────────────────────────────────────────────────────────────
  const handleDeleteItem = async (id: number, name: string) => {
    if (
      !confirm(`Deprecate rates for "${name}"? Existing records stay intact.`)
    )
      return;
    try {
      const response = await fetch(WRITE_API, {
        method: "POST",
        headers: {
          "x-pickup-portal-token": SECURITY_TOKEN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "delete", id }),
      });
      if (!response.ok) throw new Error("Deletion failed on server.");
      await fetchRates();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const startEditing = (item: RateItem) => {
    setEditingId(item.id);
    setEditName(item.item_name);
    setEditRate(item.rate.toString());
    setShowAddForm(false);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditName("");
    setEditRate("");
  };

  const filteredRates = rates.filter((r) =>
    r.item_name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  // ── TABLE COLUMNS ──────────────────────────────────────────────────────────
  const columns = [
    {
      header: "System ID",
      render: (item: RateItem) => <span>#{item.id}</span>,
    },
    {
      header: "Item Specification",
      render: (item: RateItem) =>
        editingId === item.id ? (
          <input
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleUpdateItem(item.id);
              if (e.key === "Escape") cancelEditing();
            }}
            className={styles.searchInput}
            style={{ width: "90%", minWidth: "160px" }}
            autoFocus
          />
        ) : (
          <strong>{item.item_name}</strong>
        ),
    },
    {
      header: "Base Cost (USD)",
      render: (item: RateItem) =>
        editingId === item.id ? (
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={editRate}
            onChange={(e) => setEditRate(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleUpdateItem(item.id);
              if (e.key === "Escape") cancelEditing();
            }}
            className={styles.searchInput}
            style={{ width: "110px" }}
          />
        ) : (
          <Badge variant="completed">
            {new Intl.NumberFormat("en-US", {
              style: "currency",
              currency: "USD",
            }).format(item.rate)}
          </Badge>
        ),
    },
    {
      header: "Actions",
      render: (item: RateItem) =>
        editingId === item.id ? (
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              onClick={() => handleUpdateItem(item.id)}
              disabled={isSaving}
              style={{
                padding: "6px 12px",
                borderRadius: "6px",
                backgroundColor: "#2e63af",
                color: "#ffffff",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                cursor: "pointer",
                border: "1px solid #ccc",
              }}
            >
              <Check size={16} /> {isSaving ? "Saving..." : "Save"}
            </button>
            <button
              onClick={cancelEditing}
              style={{
                padding: "6px 12px",
                borderRadius: "6px",
                backgroundColor: "#ef4444",
                color: "#ffffff",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                cursor: "pointer",
                border: "1px solid #ccc",
              }}
            >
              <X size={16} /> Cancel
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              onClick={() => startEditing(item)}
              style={{
                padding: "6px 12px",
                borderRadius: "6px",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                cursor: "pointer",
                border: "1px solid #ccc",
                background: "white",
              }}
            >
              <Edit3 size={14} /> Edit
            </button>
            <button
              onClick={() => handleDeleteItem(item.id, item.item_name)}
              style={{
                padding: "6px 12px",
                borderRadius: "6px",
                display: "inline-flex",
                alignItems: "center",
                color: "#ef4444",
                border: "1px solid #ef4444",
                backgroundColor: "transparent",
                cursor: "pointer",
              }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ),
    },
  ];

  // ── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div className={styles.dashboardContainer}>
      {/* Header */}
      <div className={styles.headerRow}>
        <h1 className={styles.title}>
          Manifest Pricing Matrix{" "}
          <span className={styles.titleCount}>
            ({filteredRates.length} Categories)
          </span>
        </h1>
        <div className={styles.actionControls}>
          <div style={{ position: "relative", display: "inline-block" }}>
            <Search
              size={16}
              style={{
                position: "absolute",
                left: "12px",
                top: "50%",
                transform: "translateY(-50%)",
                color: "#64748b",
                pointerEvents: "none",
              }}
            />
            <input
              type="text"
              placeholder="Search cargo types..."
              className={styles.searchInput}
              style={{ paddingLeft: "36px" }}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <Button
            variant="primary"
            onClick={() => {
              cancelEditing();
              setAddName("");
              setAddRate("");
              setShowAddForm((prev) => !prev);
            }}
            className={styles.filterBtn}
          >
            <Plus size={16} /> Add New Entry
          </Button>
          <Button
            variant="muted"
            onClick={fetchRates}
            className={styles.filterBtn}
          >
            <RefreshCw size={14} />
          </Button>
        </div>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <div
          style={{
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            padding: "1.5rem",
            borderRadius: "8px",
            marginBottom: "1.5rem",
          }}
        >
          <h3
            style={{
              margin: "0 0 1.25rem 0",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <Banknote size={18} /> Register New Shipping Rate Rule
          </h3>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "1rem",
              maxWidth: "500px",
            }}
          >
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "13px",
                  fontWeight: "600",
                  marginBottom: "4px",
                }}
              >
                Item Classification Name{" "}
                <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Industrial Engine Crate"
                className={styles.searchInput}
                style={{ width: "100%" }}
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddItem();
                  if (e.key === "Escape") setShowAddForm(false);
                }}
                autoFocus
              />
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "13px",
                  fontWeight: "600",
                  marginBottom: "4px",
                }}
              >
                Base Price (USD) <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                className={styles.searchInput}
                style={{ width: "180px" }}
                value={addRate}
                onChange={(e) => setAddRate(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddItem();
                  if (e.key === "Escape") setShowAddForm(false);
                }}
              />
            </div>

            {/* Live preview */}
            {addName.trim() && parseFloat(addRate) > 0 && (
              <div
                style={{
                  fontSize: "13px",
                  color: "#0369a1",
                  background: "#e0f2fe",
                  padding: "8px 12px",
                  borderRadius: "6px",
                  display: "inline-block",
                }}
              >
                Will add: <strong>{addName.trim()}</strong> at{" "}
                <strong>${parseFloat(addRate).toFixed(2)}</strong>
              </div>
            )}

            <div style={{ display: "flex", gap: "0.5rem" }}>
              <Button
                onClick={handleAddItem}
                disabled={
                  isAdding || !addName.trim() || !(parseFloat(addRate) > 0)
                }
              >
                {isAdding ? "Adding..." : "Confirm Add"}
              </Button>
              <button
                onClick={() => {
                  setAddName("");
                  setAddRate("");
                  setShowAddForm(false);
                }}
                style={{
                  backgroundColor: "#64748b",
                  color: "#ffffff",
                  padding: "8px 16px",
                  borderRadius: "6px",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Table / Loading / Error */}
      {isLoading ? (
        <div style={{ padding: "3rem", textAlign: "center", color: "#64748b" }}>
          Synchronizing secure ledger values...
        </div>
      ) : error ? (
        <div
          style={{
            padding: "2rem",
            color: "#ef4444",
            background: "#fef2f2",
            border: "1px solid #fee2e2",
            borderRadius: "6px",
          }}
        >
          <strong>Connection Fault:</strong> {error}
          <br />
          <button
            onClick={fetchRates}
            style={{
              marginTop: "0.75rem",
              padding: "6px 14px",
              background: "#ef4444",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
            }}
          >
            Retry
          </button>
        </div>
      ) : (
        <Table columns={columns} data={filteredRates} />
      )}
    </div>
  );
}
