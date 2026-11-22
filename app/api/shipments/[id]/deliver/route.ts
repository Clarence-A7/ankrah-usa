// app/api/shipments/[id]/deliver/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "./../../../../lib/db";
import { getSession } from "@/app/lib/session";
import { sendMail } from "@/app/lib/mail";

const ADMIN_ROLES = new Set(["super_admin", "origin_admin", "destination_admin"]);
const DRIVER_ROLES = new Set(["o_driver", "d_driver"]);

// Proof of delivery is required. Accept a reasonably-sized, compressed image
// data URI only (the client resizes before upload, so this is generous headroom).
const PHOTO_RE = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/;
const MAX_PHOTO_BYTES = 6 * 1024 * 1024;

function escapeHtml(s: string): string {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!),
  );
}

// Inner HTML for the delivery confirmation — wrapped in the branded card by
// sendMail. The POD photo is referenced as an inline cid image (attached by the
// caller), because Gmail/Outlook strip <img src="data:...">.
function deliveryEmailHtml(d: {
  consignerName: string;
  invoiceNumber: string;
  consigneeName: string;
  destinationCity: string;
  deliveredOn: string;
  podCid: string;
}): string {
  return `
    <h2 style="color:#0f172a;font-size:1.3rem;margin:0 0 4px;text-align:center;">Delivered &#10003;</h2>
    <p style="text-align:center;color:#16a34a;font-weight:600;margin:0 0 22px;">Your shipment has arrived.</p>
    <p style="margin:0 0 12px;">Hi <strong>${escapeHtml(d.consignerName)}</strong>,</p>
    <p style="margin:0 0 12px;">Good news — your shipment <strong>#${escapeHtml(d.invoiceNumber)}</strong> was delivered to <strong>${escapeHtml(d.consigneeName)}</strong> in ${escapeHtml(d.destinationCity)} on ${escapeHtml(d.deliveredOn)}.</p>
    <p style="margin:22px 0 8px;font-weight:600;color:#0f172a;">Proof of delivery</p>
    <img src="cid:${d.podCid}" alt="Proof of delivery photo" style="width:100%;max-width:520px;border-radius:10px;border:1px solid #e2e8f0;display:block;" />
    <p style="font-size:0.82rem;color:#94a3b8;margin:8px 0 0;">Photo taken by our delivery team at the time of delivery.</p>
    <p style="margin:22px 0 0;">Thank you for shipping with Ankrah F&amp;L.</p>`;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }, // ← Promise type
) {
  const { id } = await params; // ← await it

  if (!id) {
    return NextResponse.json({ error: "Shipment ID is required" }, { status: 400 });
  }

  // --- Authorization -------------------------------------------------------
  // /api/* is NOT covered by the middleware matcher, so this route guards
  // itself. Only signed-in admins or drivers may mark a delivery, and a driver
  // may only complete a shipment assigned to them.
  const session = await getSession();
  if (!session?.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isAdmin = ADMIN_ROLES.has(session.role);
  const isDriver = DRIVER_ROLES.has(session.role);
  if (!isAdmin && !isDriver) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // --- Proof-of-delivery photo (required) ----------------------------------
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const photo =
    body && typeof body === "object" && typeof (body as { photo?: unknown }).photo === "string"
      ? (body as { photo: string }).photo
      : "";

  const match = photo.match(PHOTO_RE);
  if (!match) {
    return NextResponse.json(
      { error: "A delivery photo is required to confirm delivery." },
      { status: 400 },
    );
  }
  if ((match[2].length * 3) / 4 > MAX_PHOTO_BYTES) {
    return NextResponse.json(
      { error: "The delivery photo is too large. Please retake it." },
      { status: 400 },
    );
  }

  const shipment = await db.invoice.findUnique({
    where: { id },
    select: {
      id: true,
      deliveryDriver: true,
      invoiceNumber: true,
      consignerEmail: true,
      consignerName: true,
      consigneeName: true,
      destinationCity: true,
    },
  });

  if (!shipment) {
    return NextResponse.json({ error: "Shipment not found" }, { status: 404 });
  }

  if (isDriver && !isAdmin) {
    if (!session.staffId || session.staffId !== shipment.deliveryDriver) {
      return NextResponse.json(
        { error: "This shipment is not assigned to you" },
        { status: 403 },
      );
    }
  }

  try {
    const capturedBy = session.staffId ?? session.userId;
    const now = new Date();

    await db.$transaction([
      db.invoice.update({
        where: { id },
        data: { status: "Delivered", deliveredAt: now },
      }),
      db.deliveryProof.upsert({
        where: { invoiceId: id },
        update: { photo, capturedBy, capturedAt: now },
        create: { invoiceId: id, photo, capturedBy },
      }),
      db.statusHistory.create({
        data: { invoiceId: id, status: "Delivered", changedById: session.userId },
      }),
    ]);

    // Delivery is recorded. Email the booking customer a branded confirmation
    // with the POD photo embedded — best-effort, in its own try/catch so a mail
    // failure never fails or undoes the delivery. consignerEmail is present for
    // guests and registered customers alike.
    try {
      const email = (shipment.consignerEmail || "").trim();
      if (email) {
        const mimeSub = match[1]; // jpeg | png | webp
        const podCid = `pod-${id}@ankrahfl`;
        const deliveredOn = now.toLocaleString("en-US", {
          dateStyle: "long",
          timeStyle: "short",
          timeZone: "America/New_York",
        });
        await sendMail({
          to: email,
          subject: `Delivered — Invoice #${shipment.invoiceNumber}`,
          bodyHtml: deliveryEmailHtml({
            consignerName: shipment.consignerName,
            invoiceNumber: shipment.invoiceNumber,
            consigneeName: shipment.consigneeName,
            destinationCity: shipment.destinationCity,
            deliveredOn,
            podCid,
          }),
          attachments: [
            {
              filename: `delivery-photo-${shipment.invoiceNumber}.${mimeSub === "jpeg" ? "jpg" : mimeSub}`,
              content: match[2],
              encoding: "base64",
              contentType: `image/${mimeSub}`,
              cid: podCid,
              contentDisposition: "inline",
            },
          ],
        });
      }
    } catch (mailErr) {
      console.error(
        `Delivery confirmation email failed for ${shipment.invoiceNumber}:`,
        mailErr,
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to mark shipment as delivered:", error);
    return NextResponse.json(
      { error: "Failed to update shipment status" },
      { status: 500 },
    );
  }
}
