import "server-only";

/**
 * Fire the driver dispatch-manifest PDF + email.
 *
 * Called after invoices are dispatched to a driver (origin pickup run or
 * destination delivery run). Delegates to the PHP endpoint that renders the
 * branded PDF (dompdf + invoice letterhead) and emails it to the driver.
 *
 * This NEVER throws: the dispatch has already committed by the time we get
 * here, so a mail/PDF hiccup must not fail the caller. Problems are logged.
 */

type DispatchSide = "origin" | "destination";

interface DispatchManifestArgs {
  side: DispatchSide;
  invoiceNumbers: string[];
  driver: { name: string; email: string | null; phone: string | null };
  /** Display name of the admin who performed the dispatch. */
  dispatchedBy: string;
}

export async function sendDispatchManifest(args: DispatchManifestArgs): Promise<void> {
  const baseUrl = process.env.PHP_API_BASE_URL;
  const token = process.env.PHP_SECURITY_GATEWAY_TOKEN;

  if (!baseUrl || !token) {
    console.error(
      "[dispatch-manifest] PHP_API_BASE_URL or PHP_SECURITY_GATEWAY_TOKEN missing — skipping manifest email.",
    );
    return;
  }
  if (!args.invoiceNumbers.length) return;
  if (!args.driver.email) {
    console.warn(
      `[dispatch-manifest] driver "${args.driver.name}" has no email on file — manifest not sent.`,
    );
    return;
  }

  try {
    const res = await fetch(`${baseUrl}/generate-dispatch-manifest.php`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-pickup-portal-token": token,
      },
      body: JSON.stringify({
        side: args.side,
        invoiceNumbers: args.invoiceNumbers,
        driverEmail: args.driver.email,
        driverName: args.driver.name,
        driverPhone: args.driver.phone ?? "",
        dispatchedBy: args.dispatchedBy,
      }),
      cache: "no-store",
    });

    const json = (await res.json().catch(() => null)) as
      | { status?: string; emailed?: boolean; error?: string }
      | null;

    if (!res.ok || json?.status !== "success") {
      console.error(
        `[dispatch-manifest] endpoint returned ${res.status}:`,
        json?.error ?? "unknown error",
      );
    } else if (!json.emailed) {
      console.warn(
        "[dispatch-manifest] PDF generated but email was not sent (check the driver's email address).",
      );
    }
  } catch (err) {
    console.error("[dispatch-manifest] failed to reach PHP endpoint:", err);
  }
}
