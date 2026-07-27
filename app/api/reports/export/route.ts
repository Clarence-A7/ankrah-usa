import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/app/lib/session";

const VALID_TYPES = ["revenue", "unpaid", "customers", "vehicle", "demography"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Streams a branded report PDF for the reporting page. Super-admin only.
 * Delegates rendering to the PHP dompdf endpoint (same pattern as the invoice
 * and dispatch-manifest PDFs).
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const reportType = String(body?.reportType ?? "");
  const from = String(body?.from ?? "");
  const to = String(body?.to ?? "");

  if (!VALID_TYPES.includes(reportType)) {
    return NextResponse.json({ error: "Invalid report type." }, { status: 400 });
  }
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
    return NextResponse.json({ error: "Invalid date range." }, { status: 400 });
  }

  const baseUrl = process.env.PHP_API_BASE_URL;
  const token = process.env.PHP_SECURITY_GATEWAY_TOKEN;
  if (!baseUrl || !token) {
    console.error("reports/export: PHP_API_BASE_URL or PHP_SECURITY_GATEWAY_TOKEN missing.");
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  try {
    const res = await fetch(`${baseUrl}/generate-report-pdf.php`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-pickup-portal-token": token },
      body: JSON.stringify({ reportType, from, to }),
      cache: "no-store",
    });

    const json = (await res.json().catch(() => null)) as
      | { status?: string; pdfBase64?: string; filename?: string; error?: string }
      | null;

    if (!res.ok || json?.status !== "success" || !json.pdfBase64) {
      return NextResponse.json(
        { error: json?.error || "Failed to generate report." },
        { status: 502 },
      );
    }

    const pdf = Buffer.from(json.pdfBase64, "base64");
    return new NextResponse(pdf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${json.filename || "report.pdf"}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error("reports/export: failed to reach PHP endpoint:", err);
    return NextResponse.json({ error: "Failed to reach report service." }, { status: 502 });
  }
}
