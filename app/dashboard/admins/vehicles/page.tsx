import React from "react";
import { db } from "./../../../lib/db";
import { getCurrentUserSession } from "@/app/actions/auth";
import styles from "../../styles/dashboard.module.css";
import VehicleQuotesTableClient from "./VehicleQuotesTableClient";

const prisma = db;

function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

async function getVehicleQuoteRequests() {
  try {
    const requests = await prisma.vehicleQuoteRequest.findMany({
      orderBy: { createdAt: "desc" },
    });

    // Safely extract all linked invoice numbers
    const bookedInvoiceNumbers = requests
      .map((r) => r.bookedInvoiceNumber)
      .filter((n): n is string => Boolean(n));

    // Batch query linked invoices to map states. items included -- this is
    // the piece PrintInvoiceQRModal needs (id, itemType, quantity per
    // invoice) to actually render the QR label instead of showing "No
    // manifest items to print."
    const linkedInvoices = bookedInvoiceNumbers.length
      ? await prisma.invoice.findMany({
          where: { invoiceNumber: { in: bookedInvoiceNumbers } },
          select: {
            id: true,
            invoiceNumber: true,
            status: true,
            items: { select: { id: true, itemType: true, quantity: true } },
          },
        })
      : [];

    const invoiceByNumber = new Map(
      linkedInvoices.map((inv) => [inv.invoiceNumber, inv]),
    );

    return requests.map((request) => {
      const linkedInvoice = request.bookedInvoiceNumber
        ? invoiceByNumber.get(request.bookedInvoiceNumber)
        : undefined;

      const rawInvoiceStatus = linkedInvoice?.status ?? null;
      const normalizedInvoiceStatus = rawInvoiceStatus
        ? toTitleCase(rawInvoiceStatus)
        : null;

      return {
        ...request,
        status: request.status ? request.status.toLowerCase() : "new",
        quotedAmount:
          request.quotedAmount !== null ? Number(request.quotedAmount) : null,
        createdAt: request.createdAt.toISOString(),
        updatedAt: request.updatedAt.toISOString(),
        quotedAt: request.quotedAt ? request.quotedAt.toISOString() : null,
        linkedInvoiceId: linkedInvoice?.id ?? null,
        linkedInvoiceStatus: normalizedInvoiceStatus,
        linkedInvoiceItems: linkedInvoice?.items ?? [],
      };
    });
  } catch (error) {
    console.error("Failed to fetch vehicle quote requests:", error);
    return [];
  }
}

export default async function VehicleQuotesDashboardPage() {
  const session = await getCurrentUserSession();

  if (!session || !session.id) {
    return (
      <div className={styles.container}>
        <p>Access Denied: Please log in.</p>
      </div>
    );
  }

  if (session.role !== "origin_admin" && session.role !== "super_admin") {
    return (
      <div className={styles.container}>
        <p>
          Access Unauthorized: This dashboard is restricted to origin admins.
        </p>
      </div>
    );
  }

  const vehicleQuoteRequests = await getVehicleQuoteRequests();

  return (
    <div className={styles.container}>
      <VehicleQuotesTableClient vehicleQuoteRequests={vehicleQuoteRequests} />
    </div>
  );
}
