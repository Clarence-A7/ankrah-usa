import { redirect } from "next/navigation";
import { getSession } from "@/app/lib/session";
import { db } from "@/app/lib/db";
import DeliveryTableClient from "./DeliveryTableClient";
import { type InvoiceStatus } from "@/app/lib/statuses";

// Must match DB values exactly — natural title case
const DELIVERY_STATUSES: InvoiceStatus[] = [
  "Received At Hub",
  "Returned To Hub",
  "Out For Delivery",
  "Delivered",
];

export default async function DeliveriesPage() {
  // 1. Authentication before any DB work
  const session = await getSession();
  if (!session?.userId) {
    redirect("/login");
  }

  // 2. Role-based authorization in the handler, not just middleware
  if (session.role !== "destination_admin" && session.role !== "super_admin") {
    redirect("/dashboard");
  }

  // 3. Fetch only the fields the table needs
  const invoices = await db.invoice.findMany({
    where: {
      status: { in: [...DELIVERY_STATUSES] },
    },
    select: {
      id: true,
      invoiceNumber: true,
      containerId: true,
      consignerName: true,
      consignerPhone: true,
      consigneeName: true,
      consigneePhone: true,
      destinationCity: true,
      shipmentMode: true,
      amountDue: true,
      amountPaid: true,
      deliveryDriver: true,
      status: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  // 4. Resolve deliveryDriver refs (staffId or user id) to driver names.
  //    One query for all distinct refs — no N+1.
  const driverRefs = [
    ...new Set(
      invoices
        .map((inv) => inv.deliveryDriver)
        .filter((ref): ref is string => Boolean(ref)),
    ),
  ];

  const driverNameByRef = new Map<string, string>();
  if (driverRefs.length > 0) {
    const drivers = await db.user.findMany({
      where: {
        role: "d_driver",
        OR: [{ staffId: { in: driverRefs } }, { id: { in: driverRefs } }],
      },
      select: { id: true, staffId: true, name: true },
    });
    for (const driver of drivers) {
      if (driver.staffId) driverNameByRef.set(driver.staffId, driver.name);
      driverNameByRef.set(driver.id, driver.name);
    }
  }

  // 5. Serialize for the client boundary:
  //    - Prisma Decimal -> number (avoids the string "0" !== 0 bug)
  //    - Date -> ISO string
  const invoicesData = invoices.map((inv) => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    containerId: inv.containerId ?? "—",
    consignerName: inv.consignerName,
    consignerPhone: inv.consignerPhone,
    consigneeName: inv.consigneeName,
    consigneePhone: inv.consigneePhone,
    destinationCity: inv.destinationCity,
    shipmentMode: inv.shipmentMode,
    amountDue: inv.amountDue ? Number(inv.amountDue) : 0,
    amountPaid: inv.amountPaid ? Number(inv.amountPaid) : 0,
    driverName: inv.deliveryDriver
      ? (driverNameByRef.get(inv.deliveryDriver) ?? inv.deliveryDriver)
      : null,
    status: inv.status,
    updatedAt: inv.updatedAt?.toISOString() ?? null,
  }));

  return <DeliveryTableClient invoicesData={invoicesData} />;
}
