import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/app/lib/session";

const PAYMENT_ID_PATTERN = /^[a-f0-9-]{20,36}$/i;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ paymentId: string }> }
) {
  const session = await getSession();
  if (!session?.userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (session.role !== "super_admin" && session.role !== "origin_admin") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { paymentId } = await params;
  if (!PAYMENT_ID_PATTERN.test(paymentId)) {
    return NextResponse.json({ error: "Invalid payment id." }, { status: 400 });
  }

  const baseUrl = process.env.PHP_API_BASE_URL;
  const gatewayToken = process.env.PHP_SECURITY_GATEWAY_TOKEN;
  if (!baseUrl || !gatewayToken) {
    console.error("PHP_API_BASE_URL or PHP_SECURITY_GATEWAY_TOKEN missing from Next.js env.");
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  try {
    const phpResponse = await fetch(`${baseUrl}/admin-get-invoice-pdf.php`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-pickup-portal-token": gatewayToken,
      },
      body: JSON.stringify({ paymentId }),
      cache: "no-store",
    });

    const result = await phpResponse.json();

    if (!phpResponse.ok || result.status !== "success" || !result.pdfBase64) {
      return NextResponse.json(
        { error: result.error || "PDF not available for this payment." },
        { status: phpResponse.status === 404 ? 404 : 502 }
      );
    }

    const pdfBuffer = Buffer.from(result.pdfBase64, "base64");
    const filename = result.filename || `invoice-${paymentId}.pdf`;

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error("Failed to fetch invoice PDF from PHP backend:", err);
    return NextResponse.json({ error: "Failed to retrieve PDF." }, { status: 502 });
  }
}