"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Mail } from "lucide-react";
import { Table } from "../../../components/ui/Table";
import Button from "../../../components/ui/Button";
import styles from "../../styles/dashboard.module.css";
import { CustomerDetailsModal } from "../../../components/CustomerDetailsModal";
import { EmailComposer } from "@/app/components/EmailComposer";
import { useAutoRefresh } from "@/app/lib/hooks/useAutoRefresh";
import { emailCustomers, type UpdatedCustomerResult } from "./actions";

export interface Customer {
  id: string;
  customerCode: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  streetAddress: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  isActive: boolean;
  createdAt: string;
}

export default function CustomersClient({
  initialCustomers,
}: {
  initialCustomers: Customer[];
}) {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null,
  );
  const [emailTarget, setEmailTarget] = useState<Customer | null>(null);
  const [emailAllOpen, setEmailAllOpen] = useState(false);
  const [sentMsg, setSentMsg] = useState<string | null>(null);

  useAutoRefresh(() => router.refresh(), {
    intervalMs: 60_000,
    enabled: !selectedCustomer && !emailTarget && !emailAllOpen,
  });

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const isSearching = normalizedSearch.length > 0;

  const filteredCustomers = useMemo(() => {
    if (!isSearching) return initialCustomers;
    return initialCustomers.filter((c) => {
      const haystack = [
        c.customerCode,
        c.firstName,
        c.lastName,
        c.email,
        c.phone,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }, [initialCustomers, normalizedSearch, isSearching]);

  const getStatusBadge = (isActive: boolean) => (
    <span
      className="px-2.5 py-0.5 text-xs font-semibold rounded-full border"
      style={
        isActive
          ? {
              backgroundColor: "#f0fdf4",
              color: "#15803d",
              borderColor: "#bbf7d0",
            }
          : {
              backgroundColor: "#f3f4f6",
              color: "#6b7280",
              borderColor: "#e5e7eb",
            }
      }
    >
      {isActive ? "Active" : "Inactive"}
    </span>
  );

  const columns = [
    {
      header: "Customer",
      render: (row: Customer) => (
        <button
          className={styles.linkButton}
          onClick={() => setSelectedCustomer(row)}
        >
          {row.firstName} {row.lastName}
        </button>
      ),
    },
    { header: "Code", render: (row: Customer) => row.customerCode },
    { header: "Email", render: (row: Customer) => row.email },
    { header: "Phone", render: (row: Customer) => row.phone },
    {
      header: "Location",
      render: (row: Customer) =>
        [row.city, row.state].filter(Boolean).join(", ") || "—",
    },
    {
      header: "Status",
      render: (row: Customer) => getStatusBadge(row.isActive),
    },
    {
      header: "Action",
      render: (row: Customer) => (
        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
          <Button
            className={styles.actionBtn}
            onClick={() => setSelectedCustomer(row)}
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
          Customers{" "}
          <span className={styles.titleCount}>
            ({filteredCustomers.length} Total)
          </span>
        </h1>
        <div className={styles.actionControls}>
          <input
            type="text"
            placeholder="Search by name, code, email, or phone"
            className={styles.searchInput}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <Button variant="primary" onClick={() => setEmailAllOpen(true)}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
              <Mail size={16} />
              Email All Customers
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
            style={{ background: "none", border: "none", color: "#15803d", cursor: "pointer", fontWeight: 700, fontSize: "1.1rem", lineHeight: 1 }}
          >
            ×
          </button>
        </div>
      )}

      <div className={styles.tableWrapper}>
        <Table columns={columns} data={filteredCustomers} />
      </div>

      <CustomerDetailsModal
        isOpen={selectedCustomer !== null}
        customer={selectedCustomer}
        onClose={() => setSelectedCustomer(null)}
        onUpdated={(updated: UpdatedCustomerResult) => {
          setSelectedCustomer(updated);
          router.refresh();
        }}
      />

      {emailTarget && (
        <EmailComposer
          action={emailCustomers}
          title={`Email ${emailTarget.firstName} ${emailTarget.lastName}`}
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
          action={emailCustomers}
          title="Email all customers"
          mode="group"
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
