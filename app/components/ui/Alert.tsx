"use client";

import React, { useEffect } from "react";
import { X, AlertTriangle, CheckCircle, Info } from "lucide-react";
import styles from "./styles/Modal.module.css";

export type ModalVariant = "info" | "success" | "warning" | "danger";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm?: () => void;
  title: string;
  // Provide `message` for the default text body, or pass `children` for a
  // custom body (e.g. a form). When children are present they replace message.
  message?: string;
  children?: React.ReactNode;
  variant?: ModalVariant;
  confirmLabel?: string;
  cancelLabel?: string;
  isLoading?: boolean;
}

export function Modal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  children,
  variant = "info",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  isLoading = false,
}: ModalProps) {
  // Close modal on Escape key press and isolate layout document scroll
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleEscape);
    }
    return () => {
      document.body.style.overflow = "unset";
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Variant Mapping purely handling contextual icon presentation elements
  const variantMap = {
    info: {
      icon: <Info className="text-blue-400" size={24} />,
      btnClass: styles.btnInfo,
    },
    success: {
      icon: <CheckCircle className="text-emerald-400" size={24} />,
      btnClass: styles.btnSuccess,
    },
    warning: {
      icon: <AlertTriangle className="text-amber-400" size={24} />,
      btnClass: styles.btnWarning,
    },
    danger: {
      icon: <AlertTriangle className="text-rose-400" size={24} />,
      btnClass: styles.btnDanger,
    },
  };

  const currentVariant = variantMap[variant];
  const isConfirmation = typeof onConfirm === "function";

  return (
    <div className={styles.modalWrapper}>
      {/* Backdrop Overlay */}
      <div
        className={styles.backdrop}
        onClick={isLoading ? undefined : onClose}
      />

      {/* Modal Card Content Container Frame */}
      <div className={styles.modalCardAnimated}>
        {/* Top Close Icon X */}
        {!isLoading && (
          <button onClick={onClose} className={styles.closeXBtn}>
            <X size={18} />
          </button>
        )}

        {/* Modal Layout Body Stack */}
        <div className={styles.bodyStack}>
          <div className={styles.iconContainer}>{currentVariant.icon}</div>
          <div className={styles.textContainer}>
            <h3 className={styles.modalTitle}>{title}</h3>
            {children ?? <p className={styles.modalMessage}>{message}</p>}
          </div>
        </div>

        {/* Interactive Action Control Row */}
        <div className={styles.actionRow}>
          {isConfirmation && (
            <button
              type="button"
              disabled={isLoading}
              onClick={onClose}
              className={styles.cancelBtn}
            >
              {cancelLabel}
            </button>
          )}

          <button
            type="button"
            disabled={isLoading}
            onClick={isConfirmation ? onConfirm : onClose}
            className={currentVariant.btnClass}
          >
            {isLoading && <div className={styles.spinner} />}
            {isConfirmation ? confirmLabel : "Dismiss"}
          </button>
        </div>
      </div>
    </div>
  );
}
