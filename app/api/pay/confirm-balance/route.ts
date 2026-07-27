import { NextRequest, NextResponse } from "next/server";

const SESSION_ID_PATTERN = /^cs_[a-zA-Z0-9_]+$/;

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("session_id")?.trim();
  if (!sessionId || !SESSION_ID_PATTERN.test(sessionId)) {
    return NextResponse.json({ error: "Invalid session identifier." }, { status: 400 });
  }

  const baseUrl = process.env.PHP_API_BASE_URL;
  const gatewayToken = process.env.PHP_SECURITY_GATEWAY_TOKEN;
  if (!baseUrl || !gatewayToken) {
    console.error("PHP_API_BASE_URL or PHP_SECURITY_GATEWAY_TOKEN missing from Next.js env.");
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  try {
    const phpResponse = await fetch(`${baseUrl}/confirm_dashboard_payment.php`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-pickup-portal-token": gatewayToken,
      },
      body: JSON.stringify({ session_id: sessionId }),
      cache: "no-store",
    });

    const result = await phpResponse.json();
    return NextResponse.json(result, { status: phpResponse.status });
  } catch (err) {
    console.error("Failed to reach confirm-balance-payment.php:", err);
    return NextResponse.json({ error: "Unable to verify payment right now." }, { status: 502 });
  }
}