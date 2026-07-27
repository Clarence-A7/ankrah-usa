"use server";

import { db } from "../lib/db";

export interface DriverOption {
  staffId: string;
  name: string;
  phone: string | null;
}

export async function getAvailableDrivers(): Promise<DriverOption[]> {
  const drivers = await db.user.findMany({
    where: { role: "d_driver" },
    select: {
      staffId: true,
      name: true,
      phone: true,
    },
    orderBy: { name: "asc" },
  });

  // A driver with no staffId can't be a dispatch target (staffId is the key we
  // dispatch against), so drop them rather than surfacing a null-id option.
  return drivers.flatMap((d) =>
    d.staffId ? [{ staffId: d.staffId, name: d.name, phone: d.phone ?? null }] : [],
  );
}

export async function dispatchInvoices(
  invoiceNumbers: string[],
  staffId: string,
): Promise<{ success: boolean; error?: string }> {
  if (!invoiceNumbers.length || !staffId) {
    return { success: false, error: "Missing invoice numbers or driver ID." };
  }

  try {
    await db.invoice.updateMany({
      where: { invoiceNumber: { in: invoiceNumbers } },
      data: {
        deliveryDriver: staffId,
        status: "Out_For_Delivery",
      },
    });

    return { success: true };
  } catch (error) {
    console.error("Dispatch failed:", error);
    return { success: false, error: "Failed to assign driver to invoices." };
  }
}