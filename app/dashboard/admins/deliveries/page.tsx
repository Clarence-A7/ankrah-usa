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
      customerCode: true,
      consignerName: true,
      consignerPhone: true,
      consignerEmail: true,
      consigneeName: true,
      consigneePhone: true,
      destinationCity: true,
      pickupStreet: true,
      pickupCity: true,
      pickupState: true,
      pickupZip: true,
      shipmentMode: true,
      amountDue: true,
      amountPaid: true,
      pickupDriver: true,
      deliveryDriver: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      // Cargo only — the modal's item list shows physical pieces, not charges.
      items: {
        where: { isCharge: false },
        select: { id: true, itemType: true, quantity: true },
      },
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

  // 4a. Resolve pickupDriver refs (origin driver) -> names, for the modal's
  //     "Picked up by" line. Separate from delivery drivers (different role).
  const pickupRefs = [
    ...new Set(
      invoices
        .map((inv) => inv.pickupDriver)
        .filter((ref): ref is string => Boolean(ref)),
    ),
  ];
  const pickupDriverNameByRef = new Map<string, string>();
  if (pickupRefs.length > 0) {
    const pickers = await db.user.findMany({
      where: {
        role: "o_driver",
        OR: [{ staffId: { in: pickupRefs } }, { id: { in: pickupRefs } }],
      },
      select: { id: true, staffId: true, name: true },
    });
    for (const p of pickers) {
      if (p.staffId) pickupDriverNameByRef.set(p.staffId, p.name);
      pickupDriverNameByRef.set(p.id, p.name);
    }
  }

  // 4b. Proof-of-delivery existence. Best-effort: a not-yet-created
  //     delivery_proofs table must never break the deliveries dashboard.
  const podByInvoice = new Map<string, string>();
  try {
    const proofs = await db.deliveryProof.findMany({
      where: { invoiceId: { in: invoices.map((i) => i.id) } },
      select: { invoiceId: true, capturedAt: true },
    });
    for (const p of proofs) podByInvoice.set(p.invoiceId, p.capturedAt.toISOString());
  } catch (e) {
    console.error("POD lookup failed (delivery_proofs table may not exist yet):", e);
  }

  // 5. Serialize for the client boundary:
  //    - Prisma Decimal -> number (avoids the string "0" !== 0 bug)
  //    - Date -> ISO string
  const invoicesData = invoices.map((inv) => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    containerId: inv.containerId ?? "—",
    customerCode: inv.customerCode ?? null,
    consignerName: inv.consignerName,
    consignerPhone: inv.consignerPhone,
    consignerEmail: inv.consignerEmail ?? null,
    consigneeName: inv.consigneeName,
    consigneePhone: inv.consigneePhone,
    destinationCity: inv.destinationCity,
    pickupStreet: inv.pickupStreet ?? null,
    pickupCity: inv.pickupCity ?? null,
    pickupState: inv.pickupState ?? null,
    pickupZip: inv.pickupZip ?? null,
    shipmentMode: inv.shipmentMode,
    amountDue: inv.amountDue ? Number(inv.amountDue) : 0,
    amountPaid: inv.amountPaid ? Number(inv.amountPaid) : 0,
    driverName: inv.deliveryDriver
      ? (driverNameByRef.get(inv.deliveryDriver) ?? inv.deliveryDriver)
      : null,
    pickupDriver: inv.pickupDriver ?? null,
    pickupDriverName: inv.pickupDriver
      ? (pickupDriverNameByRef.get(inv.pickupDriver) ?? inv.pickupDriver)
      : null,
    status: inv.status,
    createdAt: inv.createdAt?.toISOString() ?? null,
    updatedAt: inv.updatedAt?.toISOString() ?? null,
    items: inv.items ?? [],
    hasPod: podByInvoice.has(inv.id),
    podCapturedAt: podByInvoice.get(inv.id) ?? null,
  }));

  return <DeliveryTableClient invoicesData={invoicesData} />;
}
