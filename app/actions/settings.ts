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

// ── Sales tax ────────────────────────────────────────────────────────────────
// Applied to pickups at checkout (items + distance surcharge). Rate is a
// percentage string so an empty field round-trips cleanly and the PHP pickup
// endpoints read the same text from `app_settings`.

export interface TaxSettings {
  enabled: boolean;
  rate: string; // percent, e.g. "6"
  label: string;
}

const TAX_KEYS = {
  enabled: "tax_enabled",
  rate: "tax_rate",
  label: "tax_label",
} as const;

const TRUTHY = ["1", "true", "on", "yes"];

const TaxSchema = z.object({
  enabled: z.boolean(),
  rate: z
    .string()
    .trim()
    .max(8)
    .refine(
      (v) => v === "" || (!Number.isNaN(Number(v)) && Number(v) >= 0 && Number(v) <= 100),
      { message: "Tax rate must be a number between 0 and 100." },
    ),
  label: z.string().trim().max(60),
});

export async function getTaxSettings(): Promise<TaxSettings> {
  const auth = await requireSuperAdmin();
  if (!auth.ok) return { enabled: false, rate: "", label: "Sales Tax" };

  const rows = await db.app_settings.findMany({
    where: { key: { in: [TAX_KEYS.enabled, TAX_KEYS.rate, TAX_KEYS.label] } },
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    enabled: TRUTHY.includes((map.get(TAX_KEYS.enabled) ?? "").toLowerCase()),
    rate: map.get(TAX_KEYS.rate) ?? "",
    label: map.get(TAX_KEYS.label) ?? "Sales Tax",
  };
}

export async function saveTaxSettings(input: {
  enabled: boolean;
  rate: string;
  label: string;
}): Promise<MutationResult> {
  const auth = await requireSuperAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const parsed = TaxSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid tax settings." };
  }
  // Enabling tax with no positive rate makes no sense — guard it.
  if (parsed.data.enabled && (parsed.data.rate === "" || Number(parsed.data.rate) <= 0)) {
    return { success: false, error: "Enter a tax rate above 0 to enable tax." };
  }

  const entries: Array<[string, string]> = [
    [TAX_KEYS.enabled, parsed.data.enabled ? "1" : "0"],
    [TAX_KEYS.rate, parsed.data.rate],
    [TAX_KEYS.label, parsed.data.label || "Sales Tax"],
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
    console.error("saveTaxSettings failed:", error); // detail server-side only
    return { success: false, error: "Could not save the tax settings." };
  }
}

// ── Automatic discount rule ──────────────────────────────────────────────────
// A single rule applied at pickup checkout: a percent or flat amount off the
// items + surcharge subtotal, optionally limited to certain states, a minimum
// order, and/or a date window. Shared with the PHP pickup endpoints.

export interface DiscountSettings {
  enabled: boolean;
  type: "percent" | "flat";
  value: string; // percent or dollars
  label: string;
  minSubtotal: string; // dollars; "" or "0" = no minimum
  states: string[]; // [] = all states
  start: string; // 'YYYY-MM-DD' or ''
  end: string; // 'YYYY-MM-DD' or ''
}

const DISCOUNT_KEYS = {
  enabled: "discount_enabled",
  type: "discount_type",
  value: "discount_value",
  label: "discount_label",
  minSubtotal: "discount_min_subtotal",
  states: "discount_states",
  start: "discount_start",
  end: "discount_end",
} as const;

const dateField = z
  .string()
  .trim()
  .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), { message: "Dates must be YYYY-MM-DD." });

const DiscountSchema = z
  .object({
    enabled: z.boolean(),
    type: z.enum(["percent", "flat"]),
    value: z
      .string()
      .trim()
      .max(10)
      .refine((v) => v === "" || (!Number.isNaN(Number(v)) && Number(v) >= 0), {
        message: "Discount value must be a positive number.",
      }),
    label: z.string().trim().max(60),
    minSubtotal: z
      .string()
      .trim()
      .max(12)
      .refine((v) => v === "" || (!Number.isNaN(Number(v)) && Number(v) >= 0), {
        message: "Minimum order must be a positive number.",
      }),
    states: z.array(z.string().trim().length(2)).max(60),
    start: dateField,
    end: dateField,
  })
  .refine((v) => v.type !== "percent" || v.value === "" || Number(v.value) <= 100, {
    message: "A percentage discount can't exceed 100%.",
  })
  .refine((v) => v.start === "" || v.end === "" || v.start <= v.end, {
    message: "The start date must be on or before the end date.",
  });

export async function getDiscountSettings(): Promise<DiscountSettings> {
  const blank: DiscountSettings = {
    enabled: false,
    type: "percent",
    value: "",
    label: "Discount",
    minSubtotal: "",
    states: [],
    start: "",
    end: "",
  };
  const auth = await requireSuperAdmin();
  if (!auth.ok) return blank;

  const rows = await db.app_settings.findMany({
    where: { key: { in: Object.values(DISCOUNT_KEYS) } },
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));

  let states: string[] = [];
  try {
    const parsed = JSON.parse(map.get(DISCOUNT_KEYS.states) ?? "[]");
    if (Array.isArray(parsed)) states = parsed.map((s) => String(s).toUpperCase());
  } catch {
    states = [];
  }

  return {
    enabled: TRUTHY.includes((map.get(DISCOUNT_KEYS.enabled) ?? "").toLowerCase()),
    type: map.get(DISCOUNT_KEYS.type) === "flat" ? "flat" : "percent",
    value: map.get(DISCOUNT_KEYS.value) ?? "",
    label: map.get(DISCOUNT_KEYS.label) ?? "Discount",
    minSubtotal: map.get(DISCOUNT_KEYS.minSubtotal) ?? "",
    states,
    start: map.get(DISCOUNT_KEYS.start) ?? "",
    end: map.get(DISCOUNT_KEYS.end) ?? "",
  };
}

export async function saveDiscountSettings(input: DiscountSettings): Promise<MutationResult> {
  const auth = await requireSuperAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const normalized: DiscountSettings = {
    ...input,
    states: (input.states ?? []).map((s) => s.trim().toUpperCase()).filter((s) => /^[A-Z]{2}$/.test(s)),
  };

  const parsed = DiscountSchema.safeParse(normalized);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid discount settings." };
  }
  if (parsed.data.enabled && (parsed.data.value === "" || Number(parsed.data.value) <= 0)) {
    return { success: false, error: "Enter a discount value above 0 to enable the discount." };
  }

  const entries: Array<[string, string]> = [
    [DISCOUNT_KEYS.enabled, parsed.data.enabled ? "1" : "0"],
    [DISCOUNT_KEYS.type, parsed.data.type],
    [DISCOUNT_KEYS.value, parsed.data.value],
    [DISCOUNT_KEYS.label, parsed.data.label || "Discount"],
    [DISCOUNT_KEYS.minSubtotal, parsed.data.minSubtotal],
    [DISCOUNT_KEYS.states, JSON.stringify(parsed.data.states)],
    [DISCOUNT_KEYS.start, parsed.data.start],
    [DISCOUNT_KEYS.end, parsed.data.end],
  ];

  try {
    await db.$transaction(
      entries.map(([key, value]) =>
        db.app_settings.upsert({ where: { key }, update: { value }, create: { key, value } }),
      ),
    );
    return { success: true };
  } catch (error) {
    console.error("saveDiscountSettings failed:", error); // detail server-side only
    return { success: false, error: "Could not save the discount settings." };
  }
}
