// app/components/ui/Button.tsx
"use client";

import React from "react";

type Variant =
  | "primary"
  | "accent"
  | "secondary"
  | "outline"
  | "accentline"
  | "muted"
  | "success";
type Size = "sm" | "md" | "lg";
type IconPosition = "left" | "right";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: IconPosition;
}

export default function Button({
  children,
  variant = "primary",
  size = "md",
  fullWidth = false,
  loading = false,
  icon,
  iconPosition = "left",
  className = "",
  disabled,
  ...props
}: ButtonProps) {
  // Dynamic design token fallback mapper
  const getVariantStyles = () => {
    switch (variant) {
      case "primary":
        return {
          backgroundColor: "var(--color-primary)",
          color: "var(--color-text-inverse)",
        };
      case "secondary":
        return { backgroundColor: "var(--color-secondary)", color: "#0f172a" };
      case "accent":
        return {
          backgroundColor: "var(--color-accent)",
          color: "var(--color-accent-text)",
          boxShadow: "var(--shadow-accent)",
        };
      case "outline":
        return {
          backgroundColor: "transparent",
          border: "1px solid var(--color-primary)",
          color: "var(--color-primary)",
        };
      case "muted":
        return {
          backgroundColor: "#e2e8f0",
          color: "#1e293b",
          borderColor: "#cbd5e1",
        };
      case "success":
        return {
          backgroundColor: "var(--color-success, #16a34a)",
          color: "#ffffff",
        };
      default:
        return {
          backgroundColor: "var(--color-primary)",
          color: "var(--color-text-inverse)",
        };
    }
  };

  const getSizeStyles = () => {
    switch (size) {
      case "sm":
        return { padding: "8px 14px", fontSize: "13px" };
      case "lg":
        return { padding: "16px 24px", fontSize: "17px" };
      case "md":
      default:
        return { padding: "12px 20px", fontSize: "15px" };
    }
  };

  // Hardcoded core layout configurations to guarantee rendering
  const coreStructure: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    borderRadius: "var(--radius-button, 0.5rem)",
    fontWeight: "600",
    cursor: disabled || loading ? "not-allowed" : "pointer",
    transition: "var(--transition-fast, 0.2s ease)",
    border: variant === "outline" ? undefined : "1px solid transparent",
    whiteSpace: "nowrap",
    width: fullWidth ? "100%" : "auto",
    opacity: disabled || loading ? 0.5 : 1,
    ...getVariantStyles(),
    ...getSizeStyles(),
  };

  return (
    <button
      style={coreStructure}
      className={className}
      disabled={disabled || loading}
      {...props}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "8px",
          width: "100%",
        }}
      >
        {!loading && icon && iconPosition === "left" && (
          <span
            style={{ display: "flex", alignItems: "center", flexShrink: 0 }}
          >
            {icon}
          </span>
        )}
        <span>{loading ? "Loading..." : children}</span>
        {!loading && icon && iconPosition === "right" && (
          <span
            style={{ display: "flex", alignItems: "center", flexShrink: 0 }}
          >
            {icon}
          </span>
        )}
      </span>
    </button>
  );
}
