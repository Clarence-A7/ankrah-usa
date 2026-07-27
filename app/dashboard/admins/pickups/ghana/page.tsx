import React from "react";
import { db } from "../../../../lib/db";
import { getCurrentUserSession } from "@/app/actions/auth";
import styles from "../../../styles/dashboard.module.css";
import PickupsTableClient from "./PickupsTableClient";

const prisma = db;

async function getInvoicesManifest() {
  try {
    const invoices = await prisma.invoice.findMany({
      include: { items: true },
      orderBy: { createdAt: "desc" },
    });

    const driverStaffIds = Array.from(
      new Set(
        invoices
          .map((invoice) => invoice.pickupDriver)
          .filter((id): id is string => Boolean(id)),
      ),
    );

    const drivers = driverStaffIds.length
      ? await prisma.user.findMany({
          where: { staffId: { in: driverStaffIds } },
          select: { staffId: true, name: true },
        })
      : [];

    const driverNameByStaffId = new Map(
      drivers.map((driver) => [driver.staffId, driver.name]),
    );

    return invoices.map((invoice) => ({
      ...invoice,
      amountPaid: invoice.amountPaid ? Number(invoice.amountPaid) : 0,
      amountDue: invoice.amountDue ? Number(invoice.amountDue) : 0,
      items: invoice.items.map((item: any) => ({
        ...item,
        unitPrice: item.unitPrice ? Number(item.unitPrice) : 0,
        price: item.unitPrice ? Number(item.unitPrice) : 0,
      })),
      createdAt: invoice.createdAt.toISOString(),
      updatedAt: invoice.updatedAt.toISOString(),
      driverName: invoice.pickupDriver
        ? (driverNameByStaffId.get(invoice.pickupDriver) ??
          invoice.pickupDriver)
        : null,
    }));
  } catch (error) {
    console.error("Failed to fetch invoices:", error);
    return [];
  }
}

export default async function PickupsDashboardPage() {
  const session = await getCurrentUserSession();

  if (!session || !session.id) {
    return (
      <div className={styles.container}>
        <p>Access Denied: Please log in.</p>
      </div>
    );
  }

  if (
    session.role !== "origin_admin" &&
    session.role !== "super_admin" &&
    session.role !== "ADMIN"
  ) {
    return (
      <div className={styles.container}>
        <p>
          Access Unauthorized: This dashboard is restricted to origin admins.
        </p>
      </div>
    );
  }

  const invoicesData = await getInvoicesManifest();

  return (
    <div className={styles.container}>
      <PickupsTableClient invoicesData={invoicesData} />
    </div>
  );
}
