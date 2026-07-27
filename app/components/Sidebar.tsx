"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { useAuth } from "./providers/AuthProvider";
import {
  LayoutDashboard,
  PackageCheck,
  Warehouse,
  Users,
  Contact,
  ShieldUser,
  CreditCard,
  BarChart3,
  Settings,
  LogOut,
  LucideContainer,
  MoreHorizontal,
  DollarSign,
  X,
  ChevronDown,
  Car,
} from "lucide-react";
import styles from "./styles/Sidebar.module.css";

const MAX_MOBILE_TABS = 4;

// Maps a nav item's `name` to the key returned by /api/sidebar-notifications.
// Deliberately separate from the allLinks array so wiring up Containers/
// Deliveries later is just adding two more entries here, not touching
// the nav structure itself.
const NOTIFICATION_KEY_BY_NAV_NAME: Record<string, string> = {
  Pickups: "pickups",
  Vehicles: "vehicles",
  "My Pickups": "my-pickups",
  "My Dispatch": "my-dispatch",
  Payments: "payments",
  // Containers: "containers",  -- add once ContainersClient's "new" definition is confirmed
  // Deliveries: "deliveries",  -- add once DeliveriesClient's "new" definition is confirmed
};

function getNotificationCount(
  counts: Record<string, number>,
  navName: string,
): number {
  const key = NOTIFICATION_KEY_BY_NAV_NAME[navName];
  if (!key) return 0;
  return counts[key] ?? 0;
}

// Inline pill badge for the desktop rail and the mobile "More" sheet --
// sits beside the label, not overlaid on an icon.
// Pinned exactly like .navItem's own ::before accent bar already is
// (top: 50%, translateY(-50%), within a position:relative ancestor) --
// deliberately kept OUT of the row's normal flex flow rather than placed
// as a sibling competing for space with navItemLeft/chevronIcon. That
// earlier approach broke chevronIcon's own margin-left:auto self-pinning
// (it stopped being a direct child of navItemContent) and left vertical
// centering dependent on flex behavior that wasn't actually the problem.
function NotificationBadge({
  count,
  rightOffset = "0.85rem",
}: {
  count: number;
  rightOffset?: string;
}) {
  if (!count || count <= 0) return null;
  return (
    <span
      aria-label={`${count} new`}
      style={{
        position: "absolute",
        top: "50%",
        right: rightOffset,
        transform: "translateY(-50%)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: "18px",
        height: "18px",
        padding: "0 5px",
        borderRadius: "9999px",
        backgroundColor: "#ef4444",
        color: "#ffffff",
        fontSize: "0.6875rem",
        fontWeight: 700,
        lineHeight: 1,
        pointerEvents: "none",
      }}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

// Small overlay dot for the mobile tab bar, where icons stack above a
// label and there's no room for an inline pill -- standard mobile-app
// convention of a badge sitting on the icon's top-right corner.
function MobileNotificationDot({ count }: { count: number }) {
  if (!count || count <= 0) return null;
  return (
    <span
      aria-label={`${count} new`}
      style={{
        position: "absolute",
        top: -4,
        right: -6,
        minWidth: "16px",
        height: "16px",
        padding: "0 4px",
        borderRadius: "9999px",
        backgroundColor: "#ef4444",
        color: "#ffffff",
        fontSize: "0.625rem",
        fontWeight: 700,
        lineHeight: "16px",
        textAlign: "center",
      }}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

// Shared by all three avatar spots below (desktop rail, mobile tab bar,
// mobile profile sheet) — real photo when the user has one, an initials
// circle otherwise. Centralized here instead of tripling the same
// conditional three times.
function Avatar({
  avatarUrl,
  name,
  imgClassName,
  fallbackClassName,
  alt,
}: {
  avatarUrl: string | null;
  name: string;
  imgClassName: string;
  fallbackClassName: string;
  alt: string;
}) {
  if (avatarUrl) {
    return <img src={avatarUrl} alt={alt} className={imgClassName} />;
  }
  return (
    <div className={fallbackClassName} aria-hidden>
      {name ? name.charAt(0).toUpperCase() : "?"}
    </div>
  );
}

export const Sidebar: React.FC = () => {
  const pathname = usePathname();
  const { user, isLoading, logout } = useAuth();
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isPickupsOpen, setIsPickupsOpen] = useState(false);
  const [notificationCounts, setNotificationCounts] = useState<
    Record<string, number>
  >({});

  // Polls /api/sidebar-notifications every 60s. A failed fetch just leaves
  // counts as they were -- a stale or missing badge is harmless, so this
  // never surfaces an error or blocks anything else in the sidebar.
  useEffect(() => {
    let cancelled = false;

    async function fetchCounts() {
      try {
        const res = await fetch("/api/sidebar-notifications");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setNotificationCounts(data);
      } catch {
        // Silent -- see comment above.
      }
    }

    fetchCounts();
    const interval = setInterval(fetchCounts, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const allLinks = [
    {
      name: "Dashboard",
      icon: LayoutDashboard,
      href: "/dashboard",
      roles: ["origin_admin", "destination_admin", "super_admin"],
    },
    {
      name: "Overview",
      icon: LayoutDashboard,
      href: "/dashboard/drivers/origin",
      roles: ["o_driver"],
    },
    {
      name: "Overview",
      icon: LayoutDashboard,
      href: "/dashboard/drivers/destination",
      roles: ["d_driver"],
    },
    {
      name: "My Dispatch",
      icon: PackageCheck,
      href: "/dashboard/drivers/destination/my-dispatch",
      roles: ["d_driver"],
    },
    {
      name: "My Pickups",
      icon: PackageCheck,
      href: "/dashboard/drivers/origin/my-pickups",
      roles: ["o_driver"],
    },
    {
      name: "Pickups",
      icon: PackageCheck,
      roles: ["origin_admin", "super_admin"],
      subItems: [
        { name: "Ghana", href: "/dashboard/admins/pickups/ghana" },
        { name: "Nigeria", href: "/dashboard/admins/pickups/nigeria" },
        { name: "Kenya", href: "/dashboard/admins/pickups/kenya" },
      ],
    },

    {
      name: "Vehicles",
      icon: Car,
      href: "/dashboard/admins/vehicles",
      roles: ["origin_admin", "super_admin"],
    },
    {
      name: "Containers",
      icon: LucideContainer,
      href: "/dashboard/admins/containers",
      roles: ["origin_admin", "destination_admin", "super_admin"],
    },
    {
      name: "Deliveries",
      icon: Warehouse,
      href: "/dashboard/admins/deliveries",
      roles: ["destination_admin", "super_admin"],
    },
    {
      name: "Staff",
      icon: ShieldUser,
      href: "/dashboard/admins/users",
      roles: ["origin_admin", "super_admin", "destination_admin"],
    },
    //{
    // // name: "Drivers",
    //  icon: Contact,
    //  href: "/dashboard/drivers",
    //  roles: ["origin_admin", "destination_admin", "super_admin"],
    //},
    {
      name: "Customers",
      icon: Users,
      href: "/dashboard/admins/customers",
      roles: ["origin_admin", "super_admin"],
    },
    {
      name: "Pricing",
      icon: DollarSign,
      href: "/dashboard/admins/pricing",
      roles: ["origin_admin", "super_admin"],
    },
    {
      name: "Payments",
      icon: CreditCard,
      href: "/dashboard/admins/payments",
      roles: ["origin_admin", "super_admin"],
    },
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
      roles: ["origin_admin", "super_admin"],
    },
  ];

  if (isLoading) {
    return (
      <aside className={styles.sidebar}>
        <div className={styles.loader}>Loading Hub Matrix...</div>
      </aside>
    );
  }

  if (!user) return null;

  const allowedMenuItems = allLinks.filter((item) =>
    item.roles.includes(user.role),
  );

  const primaryMobileItems = allowedMenuItems.slice(0, MAX_MOBILE_TABS);
  const overflowMobileItems = allowedMenuItems.slice(MAX_MOBILE_TABS);
  const hasOverflow = overflowMobileItems.length > 0;

  // Sum of notification counts across whatever landed in the overflow
  // list, so a badge on an item tucked inside "More" is still discoverable
  // from the tab bar itself instead of silently going unseen.
  const overflowNotificationTotal = overflowMobileItems.reduce(
    (sum, item) => sum + getNotificationCount(notificationCounts, item.name),
    0,
  );

  const getRoleLabel = (role: string) => {
    if (role === "origin_admin") return "Origin Controller";
    if (role === "destination_admin") return "Destination Controller";
    if (role === "d_driver") return "Driver At Destination";
    if (role === "o_driver") return "Driver At Origin";
    return "Super Admin";
  };

  const closeSheets = () => {
    setIsMoreOpen(false);
    setIsProfileOpen(false);
  };

  return (
    <>
      {/* Desktop / tablet sidebar */}
      <aside className={styles.sidebar}>
        <div className={styles.brandWrapper}>
          <Image
            src="/ankrahWhite.svg"
            alt="Ankrah Logo"
            width={100}
            height={36}
            priority
            className={styles.brandLogo}
          />
        </div>

        {/* Nav Menu */}
        <nav className={styles.navMenu}>
          {allowedMenuItems.map((item) => {
            const hasSubItems = !!item.subItems;
            const isSubItemActive =
              hasSubItems &&
              item.subItems?.some((sub) => pathname === sub.href);
            const isActive = hasSubItems
              ? isSubItemActive
              : pathname === item.href;
            const badgeCount = getNotificationCount(
              notificationCounts,
              item.name,
            );

            if (hasSubItems) {
              return (
                <div key={item.name} className={styles.dropdownWrapper}>
                  <button
                    type="button"
                    onClick={() => setIsPickupsOpen(!isPickupsOpen)}
                    className={`${styles.navItem} ${isActive ? styles.activeItem : ""}`}
                  >
                    <div className={styles.navItemContent}>
                      <div className={styles.navItemLeft}>
                        <item.icon
                          className={`${styles.navIcon} ${isActive ? styles.activeIcon : ""}`}
                        />
                        <span>{item.name}</span>
                      </div>
                      {/* <ChevronDown
                        size={14}
                        className={styles.chevronIcon}
                        style={{
                          transform: isPickupsOpen
                            ? "rotate(180deg)"
                            : "rotate(0deg)",
                        }}
                      />*/}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.5rem",
                        }}
                      >
                        <NotificationBadge count={badgeCount} />
                      </div>
                    </div>
                  </button>

                  {/* Render Nested Sub-navigation */}
                  {isPickupsOpen && (
                    <div className={styles.subnavContainer}>
                      {item.subItems?.map((sub) => {
                        const isSubActive = pathname === sub.href;
                        return (
                          <Link
                            key={sub.name}
                            href={sub.href}
                            className={`${styles.navItem} ${styles.subnavItem} ${isSubActive ? styles.activeItem : ""}`}
                          >
                            <span>{sub.name}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            return (
              <Link
                key={item.name}
                href={item.href || "#"}
                className={`${styles.navItem} ${isActive ? styles.activeItem : ""}`}
              >
                <div className={styles.navItemContent}>
                  <div className={styles.navItemLeft}>
                    <item.icon
                      className={`${styles.navIcon} ${isActive ? styles.activeIcon : ""}`}
                    />
                    <span>{item.name}</span>
                  </div>
                  <NotificationBadge count={badgeCount} />
                </div>
              </Link>
            );
          })}
        </nav>

        {/* User Section */}
        <div className={styles.profileSection}>
          <div className={styles.profileInfo}>
            <Avatar
              avatarUrl={user.avatarUrl}
              name={user.name}
              alt="User avatar"
              imgClassName={styles.avatar}
              fallbackClassName={styles.avatarFallback}
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
            onClick={logout}
            className={styles.logoutBtn}
            title="Logout of Terminal Gateway"
            aria-label="Logout"
          >
            <LogOut className={styles.logoutIcon} />
          </button>
        </div>
      </aside>

      {/* Mobile bottom tab bar */}
      <nav className={styles.mobileTabBar} aria-label="Primary">
        {primaryMobileItems.map((item) => {
          const hasSubItems = !!item.subItems;
          const isSubItemActive =
            hasSubItems && item.subItems?.some((sub) => pathname === sub.href);
          const isActive = hasSubItems
            ? isSubItemActive
            : pathname === item.href;
          const badgeCount = getNotificationCount(
            notificationCounts,
            item.name,
          );

          if (hasSubItems) {
            return (
              <button
                key={item.name}
                type="button"
                className={`${styles.mobileTabItem} ${isActive ? styles.mobileTabActive : ""}`}
                onClick={() => {
                  setIsPickupsOpen(!isPickupsOpen);
                  setIsMoreOpen(true);
                }}
              >
                <div style={{ position: "relative", display: "inline-flex" }}>
                  <item.icon className={styles.mobileTabIcon} />
                  <MobileNotificationDot count={badgeCount} />
                </div>
                <span className={styles.mobileTabLabel}>{item.name}</span>
              </button>
            );
          }

          return (
            <Link
              key={item.name}
              href={item.href || "#"}
              className={`${styles.mobileTabItem} ${isActive ? styles.mobileTabActive : ""}`}
            >
              <div style={{ position: "relative", display: "inline-flex" }}>
                <item.icon className={styles.mobileTabIcon} />
                <MobileNotificationDot count={badgeCount} />
              </div>
              <span className={styles.mobileTabLabel}>{item.name}</span>
            </Link>
          );
        })}

        {hasOverflow && (
          <button
            type="button"
            className={styles.mobileTabItem}
            onClick={() => setIsMoreOpen(true)}
            aria-label="More navigation options"
          >
            <div style={{ position: "relative", display: "inline-flex" }}>
              <MoreHorizontal className={styles.mobileTabIcon} />
              <MobileNotificationDot count={overflowNotificationTotal} />
            </div>
            <span className={styles.mobileTabLabel}>More</span>
          </button>
        )}

        <button
          type="button"
          className={styles.mobileTabItem}
          onClick={() => setIsProfileOpen(true)}
          aria-label="Profile and logout"
        >
          <Avatar
            avatarUrl={user.avatarUrl}
            name={user.name}
            alt=""
            imgClassName={styles.mobileTabAvatar}
            fallbackClassName={styles.mobileTabAvatarFallback}
          />
          <span className={styles.mobileTabLabel}>Profile</span>
        </button>
      </nav>

      {/* "More" sheet */}
      {isMoreOpen && (
        <div className={styles.sheetOverlay} onClick={closeSheets}>
          <div
            className={styles.sheet}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="More navigation options"
          >
            <div className={styles.sheetHeader}>
              <span className={styles.sheetTitle}>Navigation Options</span>
              <button
                type="button"
                className={styles.sheetCloseBtn}
                onClick={closeSheets}
                aria-label="Close"
              >
                <X className={styles.sheetCloseIcon} />
              </button>
            </div>

            <div className={styles.sheetNavList}>
              {isPickupsOpen && (
                <div className={styles.mobileSubheader}>
                  <div className={styles.mobileSubheaderLabel}>
                    Pickups sub-pages
                  </div>
                  {allLinks
                    .find((i) => i.name === "Pickups")
                    ?.subItems?.map((sub) => (
                      <Link
                        key={sub.name}
                        href={sub.href}
                        className={`${styles.navItem} ${styles.subnavItem} ${pathname === sub.href ? styles.activeItem : ""}`}
                        onClick={closeSheets}
                      >
                        <div className={styles.navItemContent}>
                          <span>{sub.name}</span>
                        </div>
                      </Link>
                    ))}
                </div>
              )}

              {overflowMobileItems.map((item) => {
                const isActive = pathname === item.href;
                const badgeCount = getNotificationCount(
                  notificationCounts,
                  item.name,
                );
                return (
                  <Link
                    key={item.name}
                    href={item.href || "#"}
                    className={`${styles.navItem} ${isActive ? styles.activeItem : ""}`}
                    onClick={closeSheets}
                  >
                    <div className={styles.navItemContent}>
                      <div className={styles.navItemLeft}>
                        <item.icon
                          className={`${styles.navIcon} ${isActive ? styles.activeIcon : ""}`}
                        />
                        <span>{item.name}</span>
                      </div>
                      <NotificationBadge count={badgeCount} />
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Profile sheet */}
      {isProfileOpen && (
        <div className={styles.sheetOverlay} onClick={closeSheets}>
          <div
            className={styles.sheet}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Profile"
          >
            <div className={styles.sheetHeader}>
              <span className={styles.sheetTitle}>Profile</span>
              <button
                type="button"
                className={styles.sheetCloseBtn}
                onClick={closeSheets}
                aria-label="Close"
              >
                <X className={styles.sheetCloseIcon} />
              </button>
            </div>

            <div className={styles.sheetProfileInfo}>
              <Avatar
                avatarUrl={user.avatarUrl}
                name={user.name}
                alt="User avatar"
                imgClassName={styles.sheetAvatar}
                fallbackClassName={styles.sheetAvatarFallback}
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
              onClick={() => {
                closeSheets();
                logout();
              }}
              className={styles.sheetLogoutBtn}
            >
              <LogOut size={16} />
              <span>Log Out</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
};
