import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getSession } from "@/app/lib/session";
import { db } from "@/app/lib/db";

function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (session.role !== "super_admin" && session.role !== "origin_admin") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const appBaseUrl = process.env.APP_BASE_URL;
  if (!stripeSecretKey || !appBaseUrl) {
    console.error("STRIPE_SECRET_KEY or APP_BASE_URL missing from Next.js env.");
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  let body: { invoiceNumber?: string; amount?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const invoiceNumber = (body.invoiceNumber || "").trim();
  if (!invoiceNumber || invoiceNumber.length > 20) {
    return NextResponse.json({ error: "Invalid invoice number." }, { status: 400 });
  }

  // Invoice is re-fetched here rather than trusting anything the client
  // sent beyond the invoice number and a chosen amount — customerCode,
  // amountDue, and contact details all come straight from the DB.
  const invoice = await db.invoice.findUnique({
    where: { invoiceNumber },
    select: {
      invoiceNumber: true,
      customerCode: true,
      consignerName: true,
      consignerEmail: true,
      amountDue: true,
    },
  });

  if (!invoice) {
    return NextResponse.json({ error: "No invoice found with that number." }, { status: 404 });
  }

  const amountDue = toNumber(invoice.amountDue);
  if (amountDue <= 0) {
    return NextResponse.json({ error: "This invoice has no outstanding balance." }, { status: 409 });
  }

  const requestedAmount = body.amount !== undefined ? Number(body.amount) : amountDue;
  if (!Number.isFinite(requestedAmount) || requestedAmount <= 0 || requestedAmount > amountDue + 0.01) {
    return NextResponse.json(
      { error: `Amount must be greater than $0 and no more than the outstanding balance of $${amountDue.toFixed(2)}.` },
      { status: 422 }
    );
  }
  const chargeAmount = Math.round(requestedAmount * 100) / 100;
  const chargeAmountCents = Math.round(chargeAmount * 100);

  const stripe = new Stripe(stripeSecretKey);

  try {
    const checkoutSession = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      customer_email: invoice.consignerEmail || undefined,
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `Balance Payment — Invoice #${invoice.invoiceNumber}`,
              description: "Outstanding balance payment for your shipment.",
            },
            unit_amount: chargeAmountCents,
          },
          quantity: 1,
        },
      ],
      success_url: `${appBaseUrl}/pay/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appBaseUrl}/pay/cancelled`,
      metadata: {
        invoiceNumber: invoice.invoiceNumber,
        customerCode: invoice.customerCode ?? "GUEST",
        paymentSource: "dashboard_balance",
        amountToPay: chargeAmount.toFixed(2),
        generatedByAdminId: session.userId,
      },
    });

    if (!checkoutSession.url) {
      throw new Error("Stripe did not return a checkout URL.");
    }

    return NextResponse.json({
      status: "success",
      url: checkoutSession.url,
      sessionId: checkoutSession.id,
      amount: chargeAmount,
      invoiceNumber: invoice.invoiceNumber,
      consignerName: invoice.consignerName,
      consignerEmail: invoice.consignerEmail,
    });
  } catch (err) {
    console.error("Stripe checkout session creation failed:", err);
    return NextResponse.json({ error: "Failed to create payment link." }, { status: 502 });
  }
}