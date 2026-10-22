import React from "react";
import { getCurrentUserSession } from "@/app/actions/auth";
import styles from "../styles/dashboard.module.css";
import { getZones } from "@/app/actions/zones";
import { getCompanyHub, getTaxSettings, getDiscountSettings } from "@/app/actions/settings";
import ZonesManager from "./ZonesManager";
import HubManager from "./HubManager";
import TaxManager from "./TaxManager";
import DiscountManager from "./DiscountManager";

export default async function SettingsPage() {
  const session = await getCurrentUserSession();

  if (!session || !session.id) {
    return (
      <div className={styles.container}>
        <p>Access Denied: Please log in.</p>
      </div>
    );
  }

  // Zone management is a super-admin capability. Enforced here in addition to
  // the server actions, so the page never leaks zone data to a lower role.
  if (session.role !== "super_admin") {
    return (
      <div className={styles.container}>
        <p>Access Unauthorized: Settings are restricted to super admins.</p>
      </div>
    );
  }

  const [zones, hub, tax, discount] = await Promise.all([
    getZones(),
    getCompanyHub(),
    getTaxSettings(),
    getDiscountSettings(),
  ]);

  return (
    <div className={styles.container}>
      <HubManager initialHub={hub} />
      <TaxManager initialTax={tax} />
      <DiscountManager initialDiscount={discount} />
      <ZonesManager initialZones={zones} />
    </div>
  );
}
