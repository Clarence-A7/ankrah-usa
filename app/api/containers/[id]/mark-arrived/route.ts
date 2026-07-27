// app/api/containers/[id]/mark-arrived/route.ts
// POST — destination admin confirms a container has physically arrived.
// Body: { arrivalDate: string YYYY-MM-DD }
//
// Cascades Container + every In-Transit invoice on it to Arrived, in one
// transaction. This is the step BEFORE seal verification (begin-unstuffing)
// — no seal check here, arrival isn't a tamper-detection point, sealing is.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/app/lib/db";
import { getSession } from "@/app/lib/session";

const BodySchema = z.object({
  arrivalDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Arrival date must be YYYY-MM-DD")
    .refine((s) => !Number.isNaN(new Date(`${s}T00:00:00`).getTime()), "Invalid arrival date")
    .refine((s) => {
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      return new Date(`${s}T00:00:00`) <= today;
    }, "Arrival date cannot be in the future")
    .refine((s) => {
      const floor = new Date();
      floor.setFullYear(floor.getFullYear() - 1);
      return new Date(`${s}T00:00:00`) >= floor;
    }, "Arrival date is too far in the past"),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // 1. AuthN
  const session = await getSession();
  if (!session?.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. AuthZ — destination-side confirmation only
  if (!["destination_admin", "super_admin"].includes(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: containerId } = await params;
  if (!/^[A-Za-z0-9-]{1,64}$/.test(containerId)) {
    return NextResponse.json({ error: "Invalid container id" }, { status: 400 });
  }

  // 3. Body validation
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  // 4. Load + status guard — strict enum, exact match
  const container = await db.container.findUnique({
    where: { id: containerId },
    select: { id: true, status: true },
  });
  if (!container) {
    return NextResponse.json({ error: "Container not found" }, { status: 404 });
  }
  if (container.status !== "In_Transit") {
    return NextResponse.json(
      {
        error:
          container.status === "Arrived" ||
          container.status === "Cleared" ||
          container.status === "Received_At_Hub"
            ? "This container has already been marked arrived."
            : "Container is not currently in transit.",
        code: "INVALID_TRANSITION",
      },
      { status: 409 },
    );
  }

  const arrivedAt = new Date(`${parsed.data.arrivalDate}T00:00:00`);
  let cascaded = 0;

  try {
    await db.$transaction(async (tx) => {
      const updated = await tx.container.updateMany({
        where: { id: containerId, status: "In_Transit" }, // re-assert atomically
        data: { status: "Arrived", arrivedAt, arrivedById: session.userId },
      });
      if (updated.count === 0) {
        throw Object.assign(new Error("CONFLICT"), { code: "CONFLICT" });
      }

      const invoices = await tx.invoice.findMany({
        where: { containerId, status: "In-Transit" },
        select: { id: true },
      });
      cascaded = invoices.length;

      if (invoices.length > 0) {
        await tx.invoice.updateMany({
          where: { id: { in: invoices.map((i) => i.id) } },
          data: { status: "Arrived" },
        });

        await tx.statusHistory.createMany({
          data: invoices.map((i) => ({
            invoiceId: i.id,
            status: "Arrived",
            changedById: session.userId,
            createdAt: arrivedAt,
          })),
        });
      }
    });
  } catch (err: any) {
    if (err?.code === "CONFLICT") {
      return NextResponse.json(
        { error: "This container was already marked arrived by someone else.", code: "CONFLICT" },
        { status: 409 },
      );
    }
    console.error(`[MARK-ARRIVED] Transaction failed — container=${containerId}`, err);
    return NextResponse.json({ error: "Could not record arrival. Try again." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, containerStatus: "Arrived", cascaded });
}