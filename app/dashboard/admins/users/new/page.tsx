"use client";

import React, { useRef, useState } from "react";
import { UserRound, User, Mail, Lock, ChevronDown } from "lucide-react";
import { createUser } from "../actions";
import { resizeImageToDataUrl } from "@/app/lib/image";
import styles from "../users.module.css"; // Ensure this matches your directory setup

export default function CreateUserPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("origin_admin");
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    isError: boolean;
    text: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarError(null);
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      setAvatarDataUrl(dataUrl);
    } catch (err) {
      setAvatarError(
        err instanceof Error ? err.message : "Couldn't process that image.",
      );
    } finally {
      // Reset so selecting the same file again still fires onChange
      e.target.value = "";
    }
  };

  const handleRemoveAvatar = () => {
    setAvatarDataUrl(null);
    setAvatarError(null);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setStatusMessage(null);

    try {
      const formData = new FormData();
      formData.append("name", name);
      formData.append("email", email);
      formData.append("password", password);
      formData.append("role", role);
      if (avatarDataUrl) {
        formData.append("avatarUrl", avatarDataUrl);
      }

      const result = await createUser(null, formData);

      if (result.success) {
        setStatusMessage({
          isError: false,
          text: result.message || "User inserted successfully!",
        });
        // Reset form inputs upon successful registration
        setName("");
        setEmail("");
        setPassword("");
        setRole("origin_admin");
        setAvatarDataUrl(null);
        setAvatarError(null);
      } else {
        setStatusMessage({
          isError: true,
          text: result.error || "A processing exception occurred.",
        });
      }
    } catch (error) {
      console.error("Client management submission loop fault:", error);
      setStatusMessage({
        isError: true,
        text: "A communication layer fault blocked processing.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.managementContainer}>
      <div className={styles.formWrapper}>
        <div className={styles.headerBlock}>
          <h1 className={styles.titleText}>Provision Platform Node User</h1>
        </div>

        {statusMessage && (
          <div
            className={
              statusMessage.isError ? styles.errorAlert : styles.successAlert
            }
          >
            {statusMessage.isError ? "⚠️ " : "✅ "} {statusMessage.text}
          </div>
        )}

        <form onSubmit={handleFormSubmit} className={styles.creationForm}>
          <div className={styles.avatarSection}>
            <div className={styles.avatarPreviewWrap}>
              {avatarDataUrl ? (
                <img
                  src={avatarDataUrl}
                  alt=""
                  className={styles.avatarPreviewImg}
                />
              ) : (
                <div className={styles.avatarPreviewPlaceholder} aria-hidden>
                  {name ? (
                    name.charAt(0).toUpperCase()
                  ) : (
                    <UserRound size={22} />
                  )}
                </div>
              )}
            </div>

            <div className={styles.avatarActions}>
              <div className={styles.avatarButtonRow}>
                <button
                  type="button"
                  className={styles.avatarUploadBtn}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoading}
                >
                  {avatarDataUrl ? "Change Photo" : "Upload Photo"}
                </button>
                {avatarDataUrl && (
                  <button
                    type="button"
                    className={styles.avatarRemoveBtn}
                    onClick={handleRemoveAvatar}
                    disabled={isLoading}
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
                className={styles.avatarFileInput}
                style={{ display: "none" }}
              />
              <p className={styles.avatarHint}>
                JPG or PNG, up to 8MB. Optional.
              </p>
              {avatarError && (
                <p className={styles.avatarErrorText}>{avatarError}</p>
              )}
            </div>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.inputLabel}>Full Name</label>
            <div className={styles.inputWithIcon}>
              <User size={16} className={styles.inputIcon} aria-hidden />
              <input
                type="text"
                required
                placeholder="e.g. John Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={styles.inputControl}
                disabled={isLoading}
              />
            </div>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.inputLabel}>Work Email Address</label>
            <div className={styles.inputWithIcon}>
              <Mail size={16} className={styles.inputIcon} aria-hidden />
              <input
                type="email"
                required
                placeholder="name@ankrahfl.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={styles.inputControl}
                disabled={isLoading}
              />
            </div>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.inputLabel}>Temporary Password</label>
            <div className={styles.inputWithIcon}>
              <Lock size={16} className={styles.inputIcon} aria-hidden />
              <input
                type="password"
                required
                minLength={8}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={styles.inputControl}
                disabled={isLoading}
              />
            </div>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.inputLabel}>
              Platform Operational Role Designation
            </label>
            <div className={styles.selectWrapper}>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className={styles.selectControl}
                disabled={isLoading}
              >
                <option value="origin_admin">
                  Origin Admin (Freight Sorting &amp; Loading)
                </option>
                <option value="destination_admin">
                  Destination Admin (Customs Clearing Hub)
                </option>
                <option value="super_admin">Super Admin</option>
                <option value="o_driver">Driver At Origin</option>
                <option value="d_driver">Driver At Destination</option>
              </select>
              <ChevronDown
                size={16}
                className={styles.selectChevron}
                aria-hidden
              />
            </div>
          </div>

          <button
            type="submit"
            className={`btn btn-primary btn-lg ${styles.submitButton}`}
            disabled={isLoading}
          >
            {isLoading ? "Provisioning Asset..." : "Insert User Into Database"}
          </button>
        </form>
      </div>
    </div>
  );
}
