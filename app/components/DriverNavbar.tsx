"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "./providers/AuthProvider"; // Import the context engine
import {
  LayoutDashboard,
  Truck,
  PackageCheck,
  Warehouse,
  Users,
  User,
  CreditCard,
  BarChart3,
  Settings,
  LogOut,
  LucideContainer,
} from "lucide-react";
import styles from "./styles/DriverNavbar.module.css";

export const Sidebar: React.FC = () => {
  const pathname = usePathname();
  const { user, isLoading, logout } = useAuth(); // Hook into live platform session state

  const allLinks = [
    {
      name: "Dashboard",
      icon: LayoutDashboard,
      href: "/dashboard",
      roles: ["o_driver", "d_driver"],
    },
    {
      name: "My Dispatch",
      icon: PackageCheck,
      href: "/dashboard/drivers/dispatch",
      roles: ["o_driver", "d_driver"],
    },
    /*
      name: "Containers",
      icon: LucideContainer,
      href: "/dashboard/admins/containers",
      roles: ["origin_admin", "destination_admin", "super_admin"],
    },
    {
      name: "Arrivals & Clearing",
      icon: Warehouse,
      href: "/dashboard/admins/destination",
      roles: ["destination_admin", "super_admin"],
    },
    {
      name: "Drivers",
      icon: Users,
      href: "/dashboard/drivers",
      roles: ["origin_admin", "destination_admin", "super_admin"],
    },
    {
      name: "Customers",
      icon: User,
      href: "/dashboard/customers",
      roles: ["origin_admin", "super_admin"],
    },
    {
      name: "Payments",
      icon: CreditCard,
      href: "/dashboard/payments",
      roles: ["super_admin"],
    },
    */
    {
      name: "Reporting",
      icon: BarChart3,
      href: "/dashboard/admins/reporting",
      roles: ["super_admin"],
    },
    {
      name: "Settings",
      icon: Settings,
      href: "/dashboard/settings",
      roles: ["o_driver", "d_driver"],
    },
  ];

  // Prevent UI rendering jumps while the server session handshake resolves
  if (isLoading) {
    return (
      <aside className={styles.sidebar}>
        <div className={styles.loader}>Loading Hub Matrix...</div>
      </aside>
    );
  }

  // Fallback fallback view if route middleware validation drops out
  if (!user) return null;

  // Dynamically filter menu entries based on the live user's validated database role
  const allowedMenuItems = allLinks.filter((item) =>
    item.roles.includes(user.role),
  );

  const getRoleLabel = (role: string) => {
    if (role === "origin_admin") return "Origin Controller";
    if (role === "destination_admin") return "Destination Controller";
    return "Super Admin";
  };

  return (
    <aside className={styles.sidebar}>
      {/* Brand Logo */}
      <div className={styles.brandWrapper}>
        <Truck className={styles.brandIcon} />
        <span className={styles.brandText}>
          Logi<span className={styles.brandHighlight}>Track</span>
        </span>
      </div>

      {/* Nav Menu */}
      <nav className={styles.navMenu}>
        {allowedMenuItems.map((item) => {
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.name}
              href={item.href}
              className={`${styles.navItem} ${isActive ? styles.activeItem : ""}`}
            >
              <div className={styles.navItemContent}>
                <item.icon
                  className={`${styles.navIcon} ${isActive ? styles.activeIcon : ""}`}
                />
                <span>{item.name}</span>
              </div>
            </Link>
          );
        })}
      </nav>

      {/* User Login/Logout Profile Action Section */}
      <div className={styles.profileSection}>
        <div className={styles.profileInfo}>
          <img
            src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80"
            alt="User avatar"
            className={styles.avatar}
          />
          <div className={styles.metaText}>
            <span className={styles.profileName}>
              {user.name || "Station Operator"}
            </span>
            <span className={styles.profileRole}>
              {getRoleLabel(user.role)}
            </span>
          </div>
        </div>

        <button
          onClick={logout} // Calls our server-backed secure logout routine
          className={styles.logoutBtn}
          title="Logout of Terminal Gateway"
          aria-label="Logout"
        >
          <LogOut className={styles.logoutIcon} />
        </button>
      </div>
    </aside>
  );
};
