import type { Metadata } from "next";
import { Sidebar } from "./../components/Sidebar";
import { AuthProvider } from "./../components/providers/AuthProvider";
import styles from "./layout.module.css";

export const metadata: Metadata = {
  title: "Ankrah F&L | Logistics Management",
  description: "Global Freight and Logistics Tracking System",
};

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <AuthProvider>
      <div className={styles.layoutWrapper}>
        <Sidebar />
        <main className={styles.mainContent}>{children}</main>
      </div>
    </AuthProvider>
  );
}
