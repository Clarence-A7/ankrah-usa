"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Mail } from "lucide-react";
import { Table } from "../../../components/ui/Table";
import Button from "../../../components/ui/Button";
import styles from "../../styles/dashboard.module.css";
import { StaffDetailsModal } from "../../../components/StaffDetailsModal";
import { EmailComposer, type GroupOption } from "@/app/components/EmailComposer";
import { emailStaff, type UpdatedStaffResult } from "./actions";
import { useAutoRefresh } from "@/app/lib/hooks/useAutoRefresh";

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: string;
  staffId: string | null;
  phone: string | null;
  address: string | null;
  avatarUrl: string | null;
  createdAt: string;
}

const ROLE_LABELS: Record<string, string> = {
  origin_admin: "Origin Admin",
  destination_admin: "Destination Admin",
  super_admin: "Super Admin",
  o_driver: "Driver — Origin",
  d_driver: "Driver — Destination",
};

const ROLE_COLORS: Record<
  string,
  { bg: string; text: string; border: string }
> = {
  origin_admin: { bg: "#eff6ff", text: "#1d4ed8", border: "#bfdbfe" },
  destination_admin: { bg: "#f0fdf4", text: "#15803d", border: "#bbf7d0" },
  super_admin: { bg: "#fef2f2", text: "#b91c1c", border: "#fecaca" },
  o_driver: { bg: "#fff7ed", text: "#c2410c", border: "#fed7aa" },
  d_driver: { bg: "#faf5ff", text: "#7e22ce", border: "#e9d5ff" },
};

export default function StaffClient({
  initialStaff,
  viewerRole,
}: {
  initialStaff: StaffMember[];
  viewerRole: string;
}) {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);
  const [emailTarget, setEmailTarget] = useState<StaffMember | null>(null);
  const [emailAllOpen, setEmailAllOpen] = useState(false);
  const [sentMsg, setSentMsg] = useState<string | null>(null);

  const isDestinationAdmin = viewerRole === "destination_admin";
  const canAddStaff = viewerRole === "origin_admin" || viewerRole === "super_admin";
  const staffGroups: GroupOption[] = isDestinationAdmin
    ? [{ value: "destination", label: "All destination staff" }]
    : [
        { value: "all", label: "All staff" },
        { value: "drivers", label: "Drivers only" },
        { value: "origin", label: "Origin staff" },
        { value: "destination", label: "Destination staff" },
      ];

  // initialStaff is used directly below (via useMemo), never copied into
  // its own useState — same pattern as PickupsTableClient and
  // DeliveriesTableClient — so no prop-sync effect is needed. Paused while
  // the details modal is open so the table doesn't shift underneath it.
  useAutoRefresh(() => router.refresh(), {
    intervalMs: 60_000,
    enabled: !selectedStaff && !emailTarget && !emailAllOpen,
  });

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const isSearching = normalizedSearch.length > 0;

  const filteredStaff = useMemo(() => {
    if (!isSearching) return initialStaff;
    return initialStaff.filter((s) => {
      const haystack = [
        s.name,
        s.email,
        s.staffId,
        ROLE_LABELS[s.role] || s.role,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }, [initialStaff, normalizedSearch, isSearching]);

  const handleAddStaff = () => {
    router.push("/dashboard/admins/users/new");
  };

  const getRoleBadge = (role: string) => {
    const colors = ROLE_COLORS[role] || {
      bg: "#f3f4f6",
      text: "#374151",
      border: "#e5e7eb",
    };
    return (
      <span
        className="px-2.5 py-0.5 text-xs font-semibold rounded-full border"
        style={{
          backgroundColor: colors.bg,
          color: colors.text,
          borderColor: colors.border,
        }}
      >
        {ROLE_LABELS[role] || role}
      </span>
    );
  };

  const columns = [
    {
      header: "Name",
      render: (row: StaffMember) => (
        <button
          className={styles.linkButton}
          onClick={() => setSelectedStaff(row)}
          style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}
        >
          {row.avatarUrl ? (
            <img
              src={row.avatarUrl}
              alt=""
              style={{
                width: "1.75rem",
                height: "1.75rem",
                borderRadius: "9999px",
                objectFit: "cover",
                flexShrink: 0,
              }}
            />
          ) : (
            <span
              aria-hidden
              style={{
                width: "1.75rem",
                height: "1.75rem",
                borderRadius: "9999px",
                background: "var(--color-primary)",
                color: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "0.75rem",
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {row.name.charAt(0).toUpperCase()}
            </span>
          )}
          {row.name}
        </button>
      ),
    },
    { header: "Email", render: (row: StaffMember) => row.email },
    { header: "Role", render: (row: StaffMember) => getRoleBadge(row.role) },
    {
      header: "Staff ID",
      render: (row: StaffMember) => row.staffId || "—",
    },
    {
      header: "Phone",
      render: (row: StaffMember) => row.phone || "—",
    },
    {
      header: "Action",
      render: (row: StaffMember) => (
        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
          <Button
            className={styles.actionBtn}
            onClick={() => setSelectedStaff(row)}
          >
            View
          </Button>
          <Button
            className={styles.actionBtn}
            onClick={() => setEmailTarget(row)}
          >
            Email
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className={styles.dashboardContainer}>
      <div className={styles.headerRow}>
        <h1 className={styles.title}>
          Staff{" "}
          <span className={styles.titleCount}>
            ({filteredStaff.length} Total)
          </span>
        </h1>

        <div className={styles.actionControls}>
          <input
            type="text"
            placeholder="Search by name, email, or staff ID"
            className={styles.searchInput}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <Button variant="primary" onClick={() => setEmailAllOpen(true)}>
            <span
              style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
            >
              <Mail size={16} />
              {isDestinationAdmin ? "Email Destination Staff" : "Email All Staff"}
            </span>
          </Button>
        </div>
      </div>

      {sentMsg && (
        <div
          style={{
            background: "#f0fdf4",
            color: "#15803d",
            border: "1px solid #bbf7d0",
            borderRadius: 10,
            padding: "10px 14px",
            margin: "0 0 1rem",
            fontSize: "0.9rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "1rem",
          }}
        >
          <span>{sentMsg}</span>
          <button
            type="button"
            onClick={() => setSentMsg(null)}
            aria-label="Dismiss"
            style={{
              background: "none",
              border: "none",
              color: "#15803d",
              cursor: "pointer",
              fontWeight: 700,
              fontSize: "1.1rem",
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
      )}

      <div className={styles.tableWrapper}>
        <Table columns={columns} data={filteredStaff} />
      </div>

      {canAddStaff && (
        <Button
          variant="accent"
          className={styles.floatingActionBtn}
          onClick={handleAddStaff}
          title="Add New Staff"
        >
          <Plus className={styles.fabIcon} />
          <span>Add New Staff</span>
        </Button>
      )}

      <StaffDetailsModal
        isOpen={selectedStaff !== null}
        staff={selectedStaff}
        viewerRole={viewerRole}
        onClose={() => setSelectedStaff(null)}
        onUpdated={(updated: UpdatedStaffResult) => {
          // Immediate feedback in the modal itself; the table underneath
          // catches up via router.refresh() rather than needing its own
          // local copy of the list (same reasoning as the rest of this
          // component staying on the direct-prop pattern, not a state copy).
          setSelectedStaff(updated);
          router.refresh();
        }}
      />

      {emailTarget && (
        <EmailComposer
          action={emailStaff}
          title={`Email ${emailTarget.name}`}
          mode="individual"
          targetId={emailTarget.id}
          targetLabel={emailTarget.email}
          onClose={() => setEmailTarget(null)}
          onSent={(m) => {
            setEmailTarget(null);
            setSentMsg(m);
          }}
        />
      )}
      {emailAllOpen && (
        <EmailComposer
          action={emailStaff}
          title="Email staff"
          mode="group"
          groups={staffGroups}
          defaultGroup={isDestinationAdmin ? "destination" : "all"}
          onClose={() => setEmailAllOpen(false)}
          onSent={(m) => {
            setEmailAllOpen(false);
            setSentMsg(m);
          }}
        />
      )}
    </div>
  );
}
