// app/dashboard/drivers/origin/my-pickups/page.tsx
import React from "react";
import { db } from "../../../../lib/db";
import { getCurrentUserSession } from "@/app/actions/auth";
import styles from "../../../styles/my-pickups.module.css";
import Image from "next/image";
import MyPickupsClient from "./MyDispatchClient";

// PII on a completed dispatch (Delivered — the COMPLETED tab) is stripped
// server-side so it never reaches the driver's browser. Mirrors the client's
// redaction, so the card and the payload agree.
function isDeliveredStatus(status: string): boolean {
  return status.trim().toUpperCase().replace(/[\s-]+/g, "_") === "DELIVERED";
}

async function getDriverAssignedPickups(staffIdString: string) {
  try {
    if (!staffIdString) return [];
    const cleanStaffId = staffIdString.trim();

    const shipments = await db.invoice.findMany({
      where: {
        deliveryDriver: cleanStaffId,
      },
      include: {
        // Cargo only — surcharge/tax/discount are money, not manifest items.
        items: { where: { isCharge: false } },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return shipments.map((shipment) => {
      const status = shipment.status || "Booked";
      const redact = isDeliveredStatus(status);
      return {
        id: shipment.id,
        invoiceNumber: shipment.invoiceNumber,
        status,
        shipmentMode: redact ? "" : shipment.shipmentMode || "OCEAN",
        containerId: shipment.containerId || null,
        pickupStreet: redact ? "" : shipment.pickupStreet || "",
        pickupCity: redact ? "" : shipment.pickupCity || "",
        pickupState: redact ? "" : shipment.pickupState || "",
        pickupZip: redact ? "" : shipment.pickupZip || "",
        destinationCity: redact ? "" : shipment.destinationCity || "Ghana",
        consignerName: redact ? "" : shipment.consignerName || "",
        consignerPhone: redact ? "" : shipment.consignerPhone || "",
        consignerEmail: redact ? "" : shipment.consignerEmail || "",
        consigneeName: redact ? "" : shipment.consigneeName || "",
        consigneePhone: redact ? "" : shipment.consigneePhone || "",
        amountPaid: redact ? 0 : shipment.amountPaid ? Number(shipment.amountPaid) : 0,
        amountDue: redact ? 0 : shipment.amountDue ? Number(shipment.amountDue) : 0,
        createdAt: shipment.createdAt.toISOString(),
        updatedAt: shipment.updatedAt.toISOString(),
        items: redact
          ? []
          : (shipment.items || []).map((item: any) => ({
              id: item.id,
              itemType: item.itemType,
              quantity: item.quantity,
            })),
      };
    });
  } catch (error) {
    console.error(
      "Database operational fault inside driver pickups lookup query:",
      error,
    );
    return [];
  }
}

export default async function MyPickupsPage() {
  const session = await getCurrentUserSession();

  if (!session || !session.id) {
    return (
      <div className={styles.appViewContainer}>
        <div className={styles.emptyManifestNotice}>
          <p>Access Denied: Please log in to view assigned driver manifests.</p>
        </div>
      </div>
    );
  }

  if (
    session.role !== "o_driver" &&
    session.role !== "d_driver" &&
    session.role !== "DRIVER" &&
    session.role !== "origin_admin" &&
    session.role !== "super_admin" &&
    session.role !== "ADMIN"
  ) {
    return (
      <div className={styles.appViewContainer}>
        <div className={styles.emptyManifestNotice}>
          <p>
            Access Unauthorized: Profile role does not possess driver routing
            access.
          </p>
        </div>
      </div>
    );
  }

  const userProfile = await db.user.findUnique({
    where: { id: session.id },
    select: { staffId: true },
  });

  if (!userProfile || !userProfile.staffId) {
    return (
      <div className={styles.appViewContainer}>
        <div className={styles.emptyManifestNotice}>
          <p>
            Error: Driver profile is missing a registered Staff ID tracking
            code.
          </p>
        </div>
      </div>
    );
  }

  const shipmentsData = await getDriverAssignedPickups(userProfile.staffId);

  return (
    <div className={styles.appViewContainer}>
      <div className={styles.dashboardActionHeadingRow}>
        {/*<div className={styles.brandWrapper}>
          <Image
            src="/ankrahWhite.svg"
            alt="Ankrah Logo"
            width={50} // Adjust width to fit your sidebar design
            height={50} // Adjust height to scale proportionally
            priority // Ensures the logo loads immediately without flashing
            className={styles.brandLogo}
          />
        </div>*/}
        <h2 className={styles.viewSectionTitle}>My Dispatches</h2>
      </div>

      {shipmentsData.length === 0 ? (
        <div className={styles.emptyManifestNotice}>
          <p>
            No cargo shipments currently assigned to your Staff ID (
            {userProfile.staffId}).
          </p>
        </div>
      ) : (
        <div className={styles.pageData}>
          <MyPickupsClient shipmentsData={shipmentsData} />
        </div>
      )}
    </div>
  );
}
