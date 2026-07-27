import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/app/lib/session";

// Server-side proxy for the PHP pricing endpoints. The browser never sees the
// gateway token — it authenticates with its session cookie, and this route
// attaches the real SECURITY_GATEWAY_TOKEN server-side (same pattern as
// app/api/reports/export). Reads are allowed for any signed-in staff member;
// writes are restricted to origin/super admins.
const WRITE_ROLES = new Set(["super_admin", "origin_admin"]);

function phpConfig(): { baseUrl: string; token: string } | null {
  const baseUrl = process.env.PHP_API_BASE_URL;
  const token = process.env.PHP_SECURITY_GATEWAY_TOKEN;
  if (!baseUrl || !token) {
    console.error("pricing proxy: PHP_API_BASE_URL or PHP_SECURITY_GATEWAY_TOKEN missing.");
    return null;
  }
  return { baseUrl, token };
}

export async function GET() {
  const session = await getSession();
  if (!session?.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cfg = phpConfig();
  if (!cfg) return NextResponse.json({ error: "Server configuration error." }, { status: 500 });

  try {
    const res = await fetch(`${cfg.baseUrl}/pickupRates.php`, {
      method: "GET",
      headers: { "x-pickup-portal-token": cfg.token },
      cache: "no-store",
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return NextResponse.json({ error: "Failed to load rates." }, { status: 502 });
    }
    return NextResponse.json(Array.isArray(data) ? data : []);
  } catch (err) {
    console.error("pricing proxy GET: failed to reach PHP endpoint:", err);
    return NextResponse.json({ error: "Failed to reach pricing service." }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!WRITE_ROLES.has(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const action = String(body?.action ?? "");
  if (!["add", "update", "delete"].includes(action)) {
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  }

  // Re-validate every field server-side — client checks are for UX only.
  const payload: Record<string, unknown> = { action };

  if (action === "add" || action === "update") {
    const itemName = String(body?.item_name ?? "").trim();
    const rate = Number(body?.rate);
    if (!itemName) {
      return NextResponse.json({ error: "Item name is required." }, { status: 400 });
    }
    if (itemName.length > 200) {
      return NextResponse.json({ error: "Item name is too long." }, { status: 400 });
    }
    if (!Number.isFinite(rate) || rate <= 0) {
      return NextResponse.json({ error: "Rate must be a positive number." }, { status: 400 });
    }
    payload.item_name = itemName;
    payload.rate = rate;
  }

  if (action === "update" || action === "delete") {
    const id = Number(body?.id);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "A valid item id is required." }, { status: 400 });
    }
    payload.id = id;
  }

  const cfg = phpConfig();
  if (!cfg) return NextResponse.json({ error: "Server configuration error." }, { status: 500 });

  try {
    const res = await fetch(`${cfg.baseUrl}/adminrates.php`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-pickup-portal-token": cfg.token },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(
        { error: data?.detail || data?.error || "Write failed." },
        { status: 502 },
      );
    }
    return NextResponse.json(data ?? { success: true });
  } catch (err) {
    console.error("pricing proxy POST: failed to reach PHP endpoint:", err);
    return NextResponse.json({ error: "Failed to reach pricing service." }, { status: 502 });
  }
}
