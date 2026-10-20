import { NextRequest, NextResponse } from "next/server";
import { db } from "@/app/lib/db";
import { getCurrentUserSession } from "@/app/actions/auth";
import Stripe from "stripe";
import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";

// Requires `npm install stripe nodemailer` (+ `npm install -D @types/nodemailer`)
// if these aren't already dependencies in this project.

// Stripe is constructed INSIDE the handler, not here at module scope.
// Constructing it at module load time means a missing STRIPE_SECRET_KEY
// crashes the entire route file the moment Next.js imports it -- a hard,
// opaque failure that can take down the whole page instead of one request.
// Checking for the key at request time and returning a clean JSON error
// keeps that failure contained and actually diagnosable.

export async function POST(request: NextRequest) {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    return NextResponse.json(
      { error: "Stripe is not configured on the server (STRIPE_SECRET_KEY is missing from this project's .env)." },
      { status: 500 },
    );
  }
  const stripe = new Stripe(stripeSecretKey);

  const session = await getCurrentUserSession();
  if (!session || !session.id) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  if (session.role !== "origin_admin" && session.role !== "super_admin") {
    return NextResponse.json(
      { error: "You don't have permission to send vehicle quotes." },
      { status: 403 },
    );
  }

  const body = await request.json();
  const requestId = body.requestId as string;
  const quotedAmount = Number(body.quotedAmount);

  if (!requestId || !Number.isFinite(quotedAmount) || quotedAmount <= 0) {
    return NextResponse.json(
      { error: "Enter a valid quote amount greater than zero." },
      { status: 422 },
    );
  }

  const vehicleRequest = await db.vehicleQuoteRequest.findUnique({
    where: { id: requestId },
  });
  if (!vehicleRequest) {
    return NextResponse.json(
      { error: "Vehicle quote request not found." },
      { status: 404 },
    );
  }

  // Allow re-quoting a request that's already been quoted (editing a typo,
  // adjusting price, etc). Anything past "quoted" -- i.e. booked or
  // declined -- is locked: a real Stripe payment/invoice already exists
  // for "booked", and re-quoting a declined request should go through a
  // separate re-open flow, not this endpoint.
  const isEdit = vehicleRequest.status === "quoted";
  if (
    vehicleRequest.status !== "new" &&
    vehicleRequest.status !== "contacted" &&
    !isEdit
  ) {
    return NextResponse.json(
      { error: "This request can no longer be quoted (already booked or declined)." },
      { status: 409 },
    );
  }

  const cleanState = vehicleRequest.pickupState || "US";
  const statePrefix =
    cleanState.length >= 2 ? cleanState.slice(0, 2).toUpperCase() : "US";
  // Same convention as pickup.php: state prefix + random 5-digit number.
  const invoiceNumber = `${statePrefix}${Math.floor(10000 + Math.random() * 90000)}`;
  const vehicleDescription =
    `${vehicleRequest.vehicleYear} ${vehicleRequest.vehicleMake} ${vehicleRequest.vehicleModel}`.trim();

  // 60% deposit option: customer pays 60% up front; the remaining 40% is due
  // on arrival of the vehicle at the destination port.
  const DEPOSIT_RATE = 0.6;
  const depositAmount = Math.round(quotedAmount * DEPOSIT_RATE * 100) / 100;
  const balanceAmount = Math.round((quotedAmount - depositAmount) * 100) / 100;

  const successUrl =
    process.env.VEHICLE_PAYMENT_RETURN_URL ||
    `${process.env.PHP_SITE_BASE_URL || "http://localhost/localankrah"}/vehicle-payment-success.html?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl =
    process.env.VEHICLE_PAYMENT_CANCEL_URL ||
    `${process.env.PHP_SITE_BASE_URL || "http://localhost/localankrah"}/vehicle-quote.html#cancelled`;

  // 1. On a re-quote, void BOTH previous payment links (full + deposit) so a
  // customer can't pay a stale amount through either one.
  if (isEdit) {
    for (const sid of [vehicleRequest.stripeSessionId, vehicleRequest.stripeDepositSessionId]) {
      if (!sid) continue;
      try {
        await stripe.checkout.sessions.expire(sid);
      } catch (err: any) {
        console.warn(
          `Could not expire prior Stripe session ${sid} for ${vehicleRequest.referenceNumber}:`,
          err.message,
        );
      }
    }
  }

  // 2. Two Checkout sessions for the same invoice: pay in full, or a 60%
  // deposit. The customer uses whichever link they choose; once one is paid,
  // confirm-vehicle-payment.php voids the sibling so they can't pay twice.
  // metadata.quotedTotal = the full quote; amountPaid = what THIS link charges.
  // Stripe's amount_total stays authoritative for the money at confirm time.
  const createVehicleCheckout = (
    plan: "full" | "deposit",
    chargeAmount: number,
    balance: number,
  ): Promise<Stripe.Checkout.Session> =>
    stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      customer_email: vehicleRequest!.requesterEmail,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name:
                plan === "deposit"
                  ? `Vehicle Shipment - 60% Deposit - Invoice #${invoiceNumber}`
                  : `Vehicle Shipment Payment - Invoice #${invoiceNumber}`,
              description:
                `${vehicleDescription} (VIN: ${vehicleRequest!.vin}) - freight to ${vehicleRequest!.destinationCity}` +
                (plan === "deposit"
                  ? ` - remaining $${balance.toFixed(2)} due on arrival at destination port`
                  : ""),
            },
            unit_amount: Math.round(chargeAmount * 100),
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        source: "vehicle_quote",
        vehicleQuoteRefNum: vehicleRequest!.referenceNumber,
        invoiceNumber,
        paymentPlan: plan,
        quotedTotal: String(quotedAmount),
        amountDue: String(quotedAmount),
        amountPaid: String(chargeAmount),
        balanceDue: String(balance),
        consignerName: vehicleRequest!.requesterName,
        consignerEmail: vehicleRequest!.requesterEmail,
        consignerPhone: vehicleRequest!.requesterPhone,
        destinationCity: vehicleRequest!.destinationCity,
        pickupStreet: vehicleRequest!.pickupStreet,
        pickupCity: vehicleRequest!.pickupCity,
        pickupState: cleanState,
        pickupZip: vehicleRequest!.pickupZip,
        vehicleYear: String(vehicleRequest!.vehicleYear),
        vehicleMake: vehicleRequest!.vehicleMake,
        vehicleModel: vehicleRequest!.vehicleModel,
        vin: vehicleRequest!.vin,
      },
    });

  let fullSession: Stripe.Checkout.Session;
  let depositSession: Stripe.Checkout.Session;
  try {
    fullSession = await createVehicleCheckout("full", quotedAmount, 0);
    depositSession = await createVehicleCheckout("deposit", depositAmount, balanceAmount);
  } catch (err: any) {
    return NextResponse.json(
      { error: `Stripe session creation failed: ${err.message}` },
      { status: 500 },
    );
  }

  // 3. Email the customer: quote amount, Pay Now link, scope disclaimer.
  // Subject/intro line differ for an edit so the customer isn't confused
  // by receiving what looks like a second, unrelated "quote ready" email.
  let emailSent = false;
  try {
    const mailPort = Number(process.env.MAIL_PORT || 587);
    const transporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST || "smtp.gmail.com",
      port: mailPort,
      secure: mailPort === 465,
      auth: {
        user: process.env.MAIL_USER || "",
        pass: process.env.MAIL_PASS || "",
      },
    });

    const fmt2 = (n: number) =>
      n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const formattedAmount = fmt2(quotedAmount);
    const formattedDeposit = fmt2(depositAmount);
    const formattedBalance = fmt2(balanceAmount);

    const introLine = isEdit
      ? `We've updated your quote for your ${vehicleDescription} (VIN: ${vehicleRequest.vin}). Your revised quote is below -- please use the new Pay Now link, as any previous payment link for this request is no longer valid.`
      : `We've reviewed your ${vehicleDescription} (VIN: ${vehicleRequest.vin}) and your quote is ready:`;

    // Embed the logo via CID rather than a data: URI -- data URIs get
    // stripped by Gmail/Outlook/most clients, CID attachments don't.
    // Falls back to a plain text header if the file isn't found, so a
    // missing/renamed logo can never break the send.
    const logoPath = path.join(process.cwd(), "public", "logo.png");
    let logoHtml = `<h2 style="color:#2e63af;text-align:center;margin:0 0 8px;">Ankrah F&amp;L</h2>`;
    const attachments: { filename: string; path: string; cid: string }[] = [];
    if (fs.existsSync(logoPath)) {
      attachments.push({ filename: "logo.png", path: logoPath, cid: "ankrahlogo" });
      logoHtml = `<img src="cid:ankrahlogo" alt="Ankrah F&L" style="max-width:170px;width:100%;height:auto;display:block;margin:0 auto 10px;">`;
    }

    await transporter.sendMail({
      from: `"${process.env.MAIL_FROM_NAME || "Ankrah F&L"}" <${process.env.MAIL_USER}>`,
      to: vehicleRequest.requesterEmail,
      subject: isEdit
        ? `Your Vehicle Shipping Quote Has Been Updated - ${vehicleRequest.referenceNumber}`
        : `Your Vehicle Shipping Quote is Ready - ${vehicleRequest.referenceNumber}`,
      attachments,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; border: 1px solid #e2e8f0; border-radius: 12px;">
          ${logoHtml}
          <p style="text-align: center; color: #64748b; margin-top: 0;">${isEdit ? "Your Updated Vehicle Shipping Quote" : "Your Vehicle Shipping Quote"}</p>
          <p>Hi ${vehicleRequest.requesterName},</p>
          <p>${introLine}</p>
          <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #e2e8f0; text-align: center;">
            <div style="font-size: 0.85rem; color: #64748b; text-transform: uppercase;">Total Amount</div>
            <div style="font-size: 1.8rem; font-weight: 700; color: #0f172a;">$${formattedAmount} USD</div>
          </div>
          <p style="text-align: center; margin: 0 0 8px;">
            <a href="${fullSession.url}" style="display:inline-block;background-color:#2e63af;color:#ffffff;text-decoration:none;padding:12px 28px;font-weight:bold;border-radius:8px;">Pay Full Amount &mdash; $${formattedAmount}</a>
          </p>
          <p style="text-align: center; color:#94a3b8; font-size:0.85rem; margin: 6px 0;">&mdash; or &mdash;</p>
          <p style="text-align: center; margin: 0;">
            <a href="${depositSession.url}" style="display:inline-block;background-color:#ffffff;color:#2e63af;text-decoration:none;padding:11px 26px;font-weight:bold;border-radius:8px;border:2px solid #2e63af;">Pay 60% Deposit &mdash; $${formattedDeposit}</a>
          </p>
          <p style="text-align: center; color:#475569; font-size:0.82rem; margin: 10px 0 0;">Choose the deposit to reserve your shipment now &mdash; the remaining <strong>$${formattedBalance} (40%)</strong> is due upon arrival of your vehicle at the destination port.</p>
          <div style="background: #fffbeb; border: 1px solid #fcd34d; border-radius: 8px; padding: 14px 18px; margin: 24px 0; font-size: 0.82rem; color: #92400e; line-height: 1.6;">
            <strong>What this quote covers:</strong> This price covers ocean freight for
            your vehicle from our origin yard to the port of destination in Ghana only.
            It does <strong>not</strong> include Ghana Customs duty, import taxes, port
            clearance fees, or any charges at the destination port. It also does not
            include pickup of the vehicle from its origin location -- the vehicle must
            be dropped off at our origin yard. Our team will follow up separately with
            details on destination clearance and any applicable pickup arrangements.
          </div>
          <p style="font-size: 0.85rem; color: #94a3b8;">Once payment is received, we'll be in touch to coordinate next steps.</p>
        </div>
      `,
    });
    emailSent = true;
  } catch (err: any) {
    console.error(
      `Vehicle quote email failed for ${vehicleRequest.referenceNumber}:`,
      err.message,
    );
    // The Stripe session already exists regardless -- don't fail the whole
    // request over an email hiccup. emailSent stays false so the frontend
    // can surface this instead of silently pretending it worked.
  }
  // 4. Only now, after Stripe succeeded (email is best-effort), commit
  // the DB update -- a failure above this line never leaves a request
  // looking "quoted" when nothing was actually created.
  await db.vehicleQuoteRequest.update({
    where: { id: requestId },
    data: {
      quotedAmount,
      quotedAt: new Date(),
      quotedById: session.id,
      status: "quoted",
      stripeSessionId: fullSession.id,
      stripeDepositSessionId: depositSession.id,
    },
  });

  return NextResponse.json({
    success: true,
    invoiceNumber,
    stripeSessionUrl: fullSession.url,
    depositSessionUrl: depositSession.url,
    emailSent,
    isEdit,
  });
}