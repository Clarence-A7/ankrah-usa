import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/app/lib/session";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (session.role !== "super_admin" && session.role !== "origin_admin") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const baseUrl = process.env.PHP_API_BASE_URL;
  const gatewayToken = process.env.PHP_SECURITY_GATEWAY_TOKEN;
  if (!baseUrl || !gatewayToken) {
    console.error("PHP_API_BASE_URL or PHP_SECURITY_GATEWAY_TOKEN missing from Next.js env.");
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  let body: { invoiceNumber?: string; paymentUrl?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const invoiceNumber = (body.invoiceNumber || "").trim();
  const paymentUrl = (body.paymentUrl || "").trim();

  if (!invoiceNumber || !paymentUrl.startsWith("https://checkout.stripe.com/")) {
    return NextResponse.json({ error: "Invalid invoice number or payment link." }, { status: 400 });
  }

  try {
    const phpResponse = await fetch(`${baseUrl}/send-payment-link-email.php`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-pickup-portal-token": gatewayToken,
      },
      body: JSON.stringify({ invoiceNumber, paymentUrl }),
      cache: "no-store",
    });

    const result = await phpResponse.json();
    if (!phpResponse.ok || result.status !== "success") {
      return NextResponse.json({ error: result.error || "Failed to send email." }, { status: 502 });
    }

    return NextResponse.json({ status: "success" });
  } catch (err) {
    console.error("Failed to reach PHP mail endpoint:", err);
    return NextResponse.json({ error: "Failed to send email." }, { status: 502 });
  }
}