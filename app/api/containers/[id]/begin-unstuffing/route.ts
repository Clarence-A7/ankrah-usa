// app/api/containers/[id]/begin-unstuffing/route.ts
// POST — validates the origin-recorded seal number + clearance date and, on
// match, moves the container + all its ARRIVED invoices to CLEARED in one
// transaction. clearedAt stores the admin-entered customs clearance date;
// sealVerifiedAt stores the actual moment of verification.

import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import { z } from "zod";
import { db } from "@/app/lib/db";
import { getSession } from "@/app/lib/session";

// ---------- Input validation ----------
const BodySchema = z.object({
  sealNumber: z
    .string()
    .trim()
    .min(3, "Seal number too short")
    .max(32, "Seal number too long")
    .regex(/^[A-Za-z0-9-]+$/, "Seal number contains invalid characters"),
  clearanceDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Clearance date must be YYYY-MM-DD")
    .refine((s) => {
      const d = new Date(`${s}T00:00:00`);
      return !Number.isNaN(d.getTime());
    }, "Invalid clearance date")
    .refine((s) => {
      // Not in the future (compare date-only, tolerant of timezone)
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      return new Date(`${s}T00:00:00`) <= today;
    }, "Clearance date cannot be in the future")
    .refine((s) => {
      // Sanity floor — no clearance dates years in the past
      const floor = new Date();
      floor.setFullYear(floor.getFullYear() - 1);
      return new Date(`${s}T00:00:00`) >= floor;
    }, "Clearance date is too far in the past"),
});

// ---------- Rate limiting (in-memory; swap for Redis/Upstash if you ever
// run multiple server instances) ----------
const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now > entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_ATTEMPTS;
}

// ---------- Constant-time comparison ----------
function sealsMatch(submitted: string, stored: string): boolean {
  const a = createHash("sha256").update(submitted.toUpperCase()).digest();
  const b = createHash("sha256").update(stored.toUpperCase()).digest();
  return timingSafeEqual(a, b);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // 1. AuthN
  const session = await getSession();
  if (!session?.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. AuthZ
  if (!["destination_admin", "super_admin"].includes(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: containerId } = await params;
  if (!/^[A-Za-z0-9-]{1,64}$/.test(containerId)) {
    return NextResponse.json(
      { error: "Invalid container id" },
      { status: 400 },
    );
  }

  // 3. Body validation
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  // 4. Rate limit seal attempts per admin+container
  const rlKey = `${session.userId}:${containerId}`;
  if (isRateLimited(rlKey)) {
    console.warn(
      `[SECURITY] Seal attempt rate limit hit — user=${session.userId} container=${containerId}`,
    );
    return NextResponse.json(
      { error: "Too many attempts. Try again in 15 minutes." },
      { status: 429 },
    );
  }

  // 5. Load container (seal stays server-side only)
  const container = await db.container.findUnique({
    where: { id: containerId },
    select: { id: true, status: true, sealNumber: true },
  });

  if (!container) {
    return NextResponse.json(
      { error: "Container not found" },
      { status: 404 },
    );
  }

  // 6. Status guard
  const status = container.status?.toUpperCase().replace(/[\s-]/g, "_");
  if (status !== "ARRIVED") {
    return NextResponse.json(
      { error: "Container is not in Arrived status." },
      { status: 409 },
    );
  }

  if (!container.sealNumber) {
    console.error(`[SECURITY] Container ${containerId} has no seal on record.`);
    return NextResponse.json(
      { error: "No seal on record for this container. Contact a super admin." },
      { status: 409 },
    );
  }

  // 7. Constant-time seal check
  if (!sealsMatch(parsed.data.sealNumber, container.sealNumber)) {
    console.warn(
      `[SECURITY] SEAL MISMATCH — container=${containerId} user=${session.userId}`,
    );
    await db.container.update({
      where: { id: containerId },
      data: { tamperFlagged: true },
    });
    return NextResponse.json(
      {
        error:
          "Seal number does not match the seal recorded at origin. Unstuffing is blocked — escalate to a super admin.",
        code: "SEAL_MISMATCH",
      },
      { status: 409 },
    );
  }

  // 8. Cascade in a single transaction
  const now = new Date();
  const clearedAt = new Date(`${parsed.data.clearanceDate}T00:00:00`);

  await db.$transaction(async (tx) => {
    await tx.container.update({
      where: { id: containerId },
      data: {
        status: "Cleared",
        clearedAt, // admin-entered customs clearance date
        sealVerifiedAt: now, // actual verification moment (audit)
        clearedById: session.userId,
      },
    });

    const invoices = await tx.invoice.findMany({
      where: { containerId, status: "Arrived" },
      select: { id: true },
    });

    if (invoices.length > 0) {
      await tx.invoice.updateMany({
        where: { id: { in: invoices.map((i) => i.id) } },
        data: { status: "Cleared" },
      });

      await tx.statusHistory.createMany({
        data: invoices.map((i) => ({
          invoiceId: i.id,
          status: "Cleared",
          changedById: session.userId,
          createdAt: clearedAt, // timeline shows the real clearance date
        })),
      });
    }
  });

  attempts.delete(rlKey);

  return NextResponse.json({ ok: true, containerStatus: "Cleared" });
}