"use client";

import React, { useEffect, useState } from "react";
import { X, Pencil } from "lucide-react";
import {
  updateCustomer,
  type UpdatedCustomerResult,
} from "@/app/dashboard/admins/customers/actions";
import styles from "./styles/CustomerDetailsModal.module.css";

export interface CustomerDetailsData {
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

interface CustomerDetailsModalProps {
  isOpen: boolean;
  customer: CustomerDetailsData | null;
  onClose: () => void;
  onUpdated: (updated: UpdatedCustomerResult) => void;
}

type Mode = "view" | "edit";

export function CustomerDetailsModal({
  isOpen,
  customer,
  onClose,
  onUpdated,
}: CustomerDetailsModalProps) {
  const [mode, setMode] = useState<Mode>("view");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [streetAddress, setStreetAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [password, setPassword] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  useEffect(() => {
    setMode("view");
    setSaveError(null);
    setSaveSuccess(null);
  }, [customer?.id]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !customer) return null;

  const joined = new Date(customer.createdAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const enterEditMode = () => {
    setFirstName(customer.firstName);
    setLastName(customer.lastName);
    setEmail(customer.email);
    setPhone(customer.phone);
    setStreetAddress(customer.streetAddress || "");
    setCity(customer.city || "");
    setState(customer.state || "");
    setZipCode(customer.zipCode || "");
    setIsActive(customer.isActive);
    setPassword("");
    setSaveError(null);
    setSaveSuccess(null);
    setMode("edit");
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveError(null);

    try {
      const fd = new FormData();
      fd.append("id", customer.id);
      fd.append("firstName", firstName);
      fd.append("lastName", lastName);
      fd.append("email", email);
      fd.append("phone", phone);
      fd.append("streetAddress", streetAddress);
      fd.append("city", city);
      fd.append("state", state);
      fd.append("zipCode", zipCode);
      fd.append("isActive", isActive ? "true" : "false");
      if (password) fd.append("password", password);

      const result = await updateCustomer(null, fd);

      if (result.success && result.customer) {
        setSaveSuccess(result.message || "Updated.");
        setMode("view");
        onUpdated(result.customer);
      } else {
        setSaveError(result.error || "Couldn't save changes.");
      }
    } catch (err) {
      console.error("Customer update submission failed:", err);
      setSaveError("Something went wrong. Try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Customer details for ${customer.firstName} ${customer.lastName}`}
      >
        <div className={styles.header}>
          <h2 className={styles.title}>
            {mode === "edit" ? "Edit Customer" : "Customer Details"}
          </h2>
          <div className={styles.headerActions}>
            {mode === "view" && (
              <button
                type="button"
                className={styles.editBtn}
                onClick={enterEditMode}
              >
                <Pencil size={14} /> Edit
              </button>
            )}
            <button
              type="button"
              className={styles.closeBtn}
              onClick={onClose}
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {saveSuccess && mode === "view" && (
          <div className={styles.successBanner}>{saveSuccess}</div>
        )}

        {mode === "view" ? (
          <>
            <div className={styles.identity}>
              <div className={styles.avatarPlaceholder} aria-hidden>
                {customer.firstName.charAt(0).toUpperCase()}
              </div>
              <div className={styles.identityText}>
                <p className={styles.name}>
                  {customer.firstName} {customer.lastName}
                </p>
                <p className={styles.code}>{customer.customerCode}</p>
              </div>
              <span
                className={styles.statusPill}
                style={
                  customer.isActive
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
                {customer.isActive ? "Active" : "Inactive"}
              </span>
            </div>

            <dl className={styles.fieldList}>
              <div className={styles.field}>
                <dt>Email</dt>
                <dd>{customer.email}</dd>
              </div>
              <div className={styles.field}>
                <dt>Phone</dt>
                <dd>{customer.phone}</dd>
              </div>
              <div className={styles.field}>
                <dt>Address</dt>
                <dd>
                  {[
                    customer.streetAddress,
                    customer.city,
                    customer.state,
                    customer.zipCode,
                  ]
                    .filter(Boolean)
                    .join(", ") || "—"}
                </dd>
              </div>
              <div className={styles.field}>
                <dt>Joined</dt>
                <dd>{joined}</dd>
              </div>
            </dl>
          </>
        ) : (
          <form onSubmit={handleSave} className={styles.editForm}>
            {saveError && <div className={styles.errorBanner}>{saveError}</div>}

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.inputLabel}>First Name</label>
                <input
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className={styles.inputControl}
                  disabled={isSaving}
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.inputLabel}>Last Name</label>
                <input
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className={styles.inputControl}
                  disabled={isSaving}
                />
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.inputLabel}>Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={styles.inputControl}
                disabled={isSaving}
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.inputLabel}>Phone</label>
              <input
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={styles.inputControl}
                disabled={isSaving}
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.inputLabel}>Street Address</label>
              <input
                value={streetAddress}
                onChange={(e) => setStreetAddress(e.target.value)}
                className={styles.inputControl}
                disabled={isSaving}
              />
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.inputLabel}>City</label>
                <input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className={styles.inputControl}
                  disabled={isSaving}
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.inputLabel}>State</label>
                <input
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  className={styles.inputControl}
                  disabled={isSaving}
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.inputLabel}>ZIP</label>
                <input
                  value={zipCode}
                  onChange={(e) => setZipCode(e.target.value)}
                  className={styles.inputControl}
                  disabled={isSaving}
                />
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  disabled={isSaving}
                />
                Account active
              </label>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.inputLabel}>
                New Password{" "}
                <span className={styles.fieldHintInline}>
                  (leave blank to keep current)
                </span>
              </label>
              <input
                type="password"
                minLength={8}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={styles.inputControl}
                disabled={isSaving}
              />
            </div>

            <div className={styles.formActions}>
              <button
                type="button"
                className={styles.cancelBtn}
                onClick={() => setMode("view")}
                disabled={isSaving}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={styles.saveBtn}
                disabled={isSaving}
              >
                {isSaving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
