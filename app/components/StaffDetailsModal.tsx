"use client";

import React, { useEffect, useRef, useState } from "react";
import { X, Pencil } from "lucide-react";
import {
  updateUser,
  type UpdatedStaffResult,
} from "@/app/dashboard/admins/users/actions";
import { resizeImageToDataUrl } from "@/app/lib/image";
import styles from "./styles/StaffDetailsModal.module.css";

export interface StaffDetailsData {
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

const ALL_ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: "origin_admin", label: "Origin Admin (Freight Sorting & Loading)" },
  {
    value: "destination_admin",
    label: "Destination Admin (Customs Clearing Hub)",
  },
  { value: "super_admin", label: "Super Admin" },
  { value: "o_driver", label: "Driver At Origin" },
  { value: "d_driver", label: "Driver At Destination" },
];

interface StaffDetailsModalProps {
  isOpen: boolean;
  staff: StaffDetailsData | null;
  /** The signed-in viewer's own role — drives which fields they're allowed
   *  to touch client-side. The server action re-checks all of this
   *  independently; this only controls what the UI offers. */
  viewerRole: string;
  onClose: () => void;
  onUpdated: (updated: UpdatedStaffResult) => void;
}

type Mode = "view" | "edit";

export function StaffDetailsModal({
  isOpen,
  staff,
  viewerRole,
  onClose,
  onUpdated,
}: StaffDetailsModalProps) {
  const [mode, setMode] = useState<Mode>("view");

  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formRole, setFormRole] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formAddress, setFormAddress] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | null>(null); // a newly-selected replacement photo
  const [avatarRemoved, setAvatarRemoved] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Always land back on the read-only view when a different person's
  // record is opened — never carry over an in-progress edit from whoever
  // was previously selected.
  useEffect(() => {
    setMode("view");
    setSaveError(null);
    setSaveSuccess(null);
  }, [staff?.id]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !staff) return null;

  const joined = new Date(staff.createdAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // A super_admin record can only be edited by another super_admin — mirrors
  // the server-side rule in updateUser. Hiding Edit entirely here is a UX
  // convenience; the action re-checks this regardless of what the client sends.
  const canEditThisRecord =
    staff.role !== "super_admin" || viewerRole === "super_admin";

  const canAssignSuperAdmin = viewerRole === "super_admin";
  const roleOptions = canAssignSuperAdmin
    ? ALL_ROLE_OPTIONS
    : ALL_ROLE_OPTIONS.filter((r) => r.value !== "super_admin");

  const enterEditMode = () => {
    setFormName(staff.name);
    setFormEmail(staff.email);
    setFormRole(staff.role);
    setFormPhone(staff.phone || "");
    setFormAddress(staff.address || "");
    setFormPassword("");
    setAvatarDataUrl(null);
    setAvatarRemoved(false);
    setAvatarError(null);
    setSaveError(null);
    setSaveSuccess(null);
    setMode("edit");
  };

  const cancelEdit = () => {
    setMode("view");
    setSaveError(null);
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarError(null);
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      setAvatarDataUrl(dataUrl);
      setAvatarRemoved(false);
    } catch (err) {
      setAvatarError(
        err instanceof Error ? err.message : "Couldn't process that image.",
      );
    } finally {
      e.target.value = "";
    }
  };

  const handleRemoveAvatar = () => {
    setAvatarDataUrl(null);
    setAvatarRemoved(true);
    setAvatarError(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveError(null);

    try {
      const fd = new FormData();
      fd.append("id", staff.id);
      fd.append("name", formName);
      fd.append("email", formEmail);
      fd.append("role", formRole);
      fd.append("phone", formPhone);
      fd.append("address", formAddress);
      if (formPassword) fd.append("password", formPassword);
      if (avatarDataUrl) fd.append("avatarUrl", avatarDataUrl);
      if (avatarRemoved) fd.append("removeAvatar", "true");

      const result = await updateUser(null, fd);

      if (result.success && result.user) {
        setSaveSuccess(result.message || "Updated.");
        setMode("view");
        onUpdated(result.user);
      } else {
        setSaveError(result.error || "Couldn't save changes.");
      }
    } catch (err) {
      console.error("Staff update submission failed:", err);
      setSaveError("Something went wrong. Try again.");
    } finally {
      setIsSaving(false);
    }
  };

  // Preview reflects, in priority order: a freshly-picked photo, an
  // explicit removal, or the existing stored photo.
  const previewUrl = avatarRemoved ? null : avatarDataUrl || staff.avatarUrl;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Staff details for ${staff.name}`}
      >
        <div className={styles.header}>
          <h2 className={styles.title}>
            {mode === "edit" ? "Edit Staff" : "Staff Details"}
          </h2>
          <div className={styles.headerActions}>
            {mode === "view" && canEditThisRecord && (
              <button
                type="button"
                className={styles.editBtn}
                onClick={enterEditMode}
                aria-label="Edit"
              >
                <Pencil size={14} />
                Edit
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
              {staff.avatarUrl ? (
                <img
                  src={staff.avatarUrl}
                  alt=""
                  className={styles.avatarPhoto}
                />
              ) : (
                <div className={styles.avatarPlaceholder} aria-hidden>
                  {staff.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <p className={styles.name}>{staff.name}</p>
                <p className={styles.role}>
                  {ROLE_LABELS[staff.role] || staff.role}
                </p>
              </div>
            </div>

            <dl className={styles.fieldList}>
              <div className={styles.field}>
                <dt>Email</dt>
                <dd>{staff.email}</dd>
              </div>
              <div className={styles.field}>
                <dt>Staff ID</dt>
                <dd>{staff.staffId || "—"}</dd>
              </div>
              <div className={styles.field}>
                <dt>Phone</dt>
                <dd>{staff.phone || "—"}</dd>
              </div>
              <div className={styles.field}>
                <dt>Address</dt>
                <dd>{staff.address || "—"}</dd>
              </div>
              <div className={styles.field}>
                <dt>Joined</dt>
                <dd>{joined}</dd>
              </div>
            </dl>
          </>
        ) : (
          <form onSubmit={handleSave} className={styles.editForm}>
            <div className={styles.avatarEditRow}>
              {previewUrl ? (
                <img src={previewUrl} alt="" className={styles.avatarPhoto} />
              ) : (
                <div className={styles.avatarPlaceholder} aria-hidden>
                  {formName ? formName.charAt(0).toUpperCase() : "?"}
                </div>
              )}
              <div className={styles.avatarEditActions}>
                <div className={styles.avatarButtonRow}>
                  <button
                    type="button"
                    className={styles.avatarUploadBtn}
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isSaving}
                  >
                    Change Photo
                  </button>
                  {previewUrl && (
                    <button
                      type="button"
                      className={styles.avatarRemoveBtn}
                      onClick={handleRemoveAvatar}
                      disabled={isSaving}
                    >
                      Remove
                    </button>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarChange}
                  style={{ display: "none" }}
                />
                {avatarError && (
                  <p className={styles.avatarErrorText}>{avatarError}</p>
                )}
              </div>
            </div>

            {saveError && <div className={styles.errorBanner}>{saveError}</div>}

            <div className={styles.formGroup}>
              <label className={styles.inputLabel}>Full Name</label>
              <input
                type="text"
                required
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className={styles.inputControl}
                disabled={isSaving}
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.inputLabel}>Email</label>
              <input
                type="email"
                required
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                className={styles.inputControl}
                disabled={isSaving}
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.inputLabel}>Phone</label>
              <input
                type="text"
                value={formPhone}
                onChange={(e) => setFormPhone(e.target.value)}
                className={styles.inputControl}
                disabled={isSaving}
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.inputLabel}>Address</label>
              <input
                type="text"
                value={formAddress}
                onChange={(e) => setFormAddress(e.target.value)}
                className={styles.inputControl}
                disabled={isSaving}
              />
            </div>

            {canEditThisRecord && (
              <div className={styles.formGroup}>
                <label className={styles.inputLabel}>Role</label>
                <select
                  value={formRole}
                  onChange={(e) => setFormRole(e.target.value)}
                  className={styles.selectControl}
                  disabled={isSaving}
                >
                  {roleOptions.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
                {!canAssignSuperAdmin && (
                  <p className={styles.fieldHint}>
                    Only a super admin can grant the super admin role.
                  </p>
                )}
              </div>
            )}

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
                value={formPassword}
                onChange={(e) => setFormPassword(e.target.value)}
                className={styles.inputControl}
                disabled={isSaving}
              />
            </div>

            <div className={styles.fieldStatic}>
              <span className={styles.inputLabel}>Staff ID</span>
              <span className={styles.staticValue}>{staff.staffId || "—"}</span>
            </div>

            <div className={styles.formActions}>
              <button
                type="button"
                className={styles.cancelBtn}
                onClick={cancelEdit}
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
