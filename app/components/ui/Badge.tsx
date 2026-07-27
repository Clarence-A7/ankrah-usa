import React from "react";
import styles from "./styles/Badge.module.css";

export type BadgeVariant = "completed" | "transit" | "arrived" | "cleared";

interface BadgeProps {
  children: React.ReactNode;
  variant: BadgeVariant;
}

export const Badge: React.FC<BadgeProps> = ({ children, variant }) => {
  return (
    <span className={`${styles.badge} ${styles[variant]}`}>{children}</span>
  );
};
