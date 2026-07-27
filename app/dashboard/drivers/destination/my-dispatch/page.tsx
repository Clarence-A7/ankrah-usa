// app/dashboard/drivers/origin/my-pickups/page.tsx
import React from "react";
import { db } from "../../../../lib/db";
import { getCurrentUserSession } from "@/app/actions/auth";
import styles from "../../../styles/my-pickups.module.css";
import Image from "next/image";
import MyPickupsClient from "./MyDispatchClient";

async function getDriverAssignedPickups(staffIdString: string) {
  try {
    if (!staffIdString) return [];
    const cleanStaffId = staffIdString.trim();

    const shipments = await db.invoice.findMany({
      where: {
        deliveryDriver: cleanStaffId,
      },
      include: {
        items: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return shipments.map((shipment) => ({
      id: shipment.id,
      invoiceNumber: shipment.invoiceNumber,
      status: shipment.status || "Booked",
      shipmentMode: shipment.shipmentMode || "OCEAN",
      containerId: shipment.containerId || null,
      pickupStreet: shipment.pickupStreet || "",
      pickupCity: shipment.pickupCity || "",
      pickupState: shipment.pickupState || "",
      pickupZip: shipment.pickupZip || "",
      destinationCity: shipment.destinationCity || "Ghana",
      consignerName: shipment.consignerName || "",
      consignerPhone: shipment.consignerPhone || "",
      consignerEmail: shipment.consignerEmail || "",
      consigneeName: shipment.consigneeName || "",
      consigneePhone: shipment.consigneePhone || "",
      amountPaid: shipment.amountPaid ? Number(shipment.amountPaid) : 0,
      amountDue: shipment.amountDue ? Number(shipment.amountDue) : 0,
      createdAt: shipment.createdAt.toISOString(),
      updatedAt: shipment.updatedAt.toISOString(),
      items: (shipment.items || []).map((item: any) => ({
        id: item.id,
        itemType: item.itemType,
        quantity: item.quantity,
      })),
    }));
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
