"use server";

import { z } from "zod";
import { db } from "../lib/db";
import { getSession } from "../lib/session";

// Global company settings stored as key/value rows in `app_settings`, shared
// with the PHP pickup endpoints (same DB). First use: the pickup hub origin
// that the distance surcharge measures from. Kept in the DB (not just .env) so
// it can be changed from the admin UI when the company relocates.

export interface CompanyHub {
  address: string;
  lat: string;
  lng: string;
}

type MutationResult = { success: boolean; error?: string };

const HUB_KEYS = {
  address: "hub_address",
  lat: "hub_lat",
  lng: "hub_lng",
} as const;

// AuthN + AuthZ in the action itself — company settings are super-admin only,
// never relying on middleware or the nav hiding the page.
async function requireSuperAdmin(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const session = await getSession();
  if (!session?.userId) return { ok: false, error: "Not authenticated." };
  if (session.role !== "super_admin") {
    return { ok: false, error: "Only a super admin can change company settings." };
  }
  return { ok: true, userId: session.userId };
}

// A coordinate: blank (unset), or a decimal within range. Kept as strings so an
// empty field round-trips cleanly and the PHP side reads the same text.
const latField = z
  .string()
  .trim()
  .max(32)
  .refine((v) => v === "" || (v !== "" && !Number.isNaN(Number(v)) && Math.abs(Number(v)) <= 90), {
    message: "Latitude must be a number between -90 and 90.",
  });
const lngField = z
  .string()
  .trim()
  .max(32)
  .refine((v) => v === "" || (v !== "" && !Number.isNaN(Number(v)) && Math.abs(Number(v)) <= 180), {
    message: "Longitude must be a number between -180 and 180.",
  });

const HubSchema = z
  .object({
    address: z.string().trim().max(200),
    lat: latField,
    lng: lngField,
  })
  // Need something usable as a Distance Matrix origin: an address, or a full
  // coordinate pair. Lat/lng only count when both are present.
  .refine((v) => v.address !== "" || (v.lat !== "" && v.lng !== ""), {
    message: "Enter a hub address, or both latitude and longitude.",
  })
  .refine((v) => (v.lat === "") === (v.lng === ""), {
    message: "Latitude and longitude must be provided together.",
  });

export async function getCompanyHub(): Promise<CompanyHub> {
  const auth = await requireSuperAdmin();
  if (!auth.ok) return { address: "", lat: "", lng: "" };

  const rows = await db.app_settings.findMany({
    where: { key: { in: [HUB_KEYS.address, HUB_KEYS.lat, HUB_KEYS.lng] } },
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    address: map.get(HUB_KEYS.address) ?? "",
    lat: map.get(HUB_KEYS.lat) ?? "",
    lng: map.get(HUB_KEYS.lng) ?? "",
  };
}

export async function saveCompanyHub(input: {
  address: string;
  lat: string;
  lng: string;
}): Promise<MutationResult> {
  const auth = await requireSuperAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const parsed = HubSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid hub location." };
  }

  const entries: Array<[string, string]> = [
    [HUB_KEYS.address, parsed.data.address],
    [HUB_KEYS.lat, parsed.data.lat],
    [HUB_KEYS.lng, parsed.data.lng],
  ];

  try {
    await db.$transaction(
      entries.map(([key, value]) =>
        db.app_settings.upsert({
          where: { key },
          update: { value },
          create: { key, value },
        }),
      ),
    );
    return { success: true };
  } catch (error) {
    console.error("saveCompanyHub failed:", error); // detail server-side only
    return { success: false, error: "Could not save the hub location." };
  }
}
