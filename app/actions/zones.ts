"use server";

import { z } from "zod";
import { db } from "../lib/db";
import { getSession } from "../lib/session";

export interface ZoneDTO {
  id: string;
  name: string;
  states: string[];
  isActive: boolean;
  freeMiles: number;
  perMile: number;
  createdAt: string;
  updatedAt: string;
}

// 50 states + DC. Pickups are US-origin only, so this is the valid set a zone
// may contain. Kept in sync with the wizard's client list (pickup-wizard.js).
const US_STATES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID",
  "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO",
  "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA",
  "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
]);

const ZoneInputSchema = z.object({
  id: z.string().trim().max(64).optional(),
  name: z.string().trim().min(1).max(100),
  states: z.array(z.string()).max(60),
  isActive: z.boolean(),
  // Distance surcharge: free-mile threshold from the hub, then USD per mile.
  freeMiles: z.number().min(0).max(100000),
  perMile: z.number().min(0).max(100000),
});

type MutationResult = { success: boolean; error?: string };

// AuthN + AuthZ in the action itself — zone management is super-admin only,
// never relying on middleware or the nav hiding the page.
async function requireSuperAdmin(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const session = await getSession();
  if (!session?.userId) return { ok: false, error: "Not authenticated." };
  if (session.role !== "super_admin") {
    return { ok: false, error: "Only a super admin can manage service zones." };
  }
  return { ok: true, userId: session.userId };
}

// Prisma returns Json as a deserialized value already; tolerate a string too.
function toStateArray(raw: unknown): string[] {
  const arr = typeof raw === "string" ? safeJson(raw) : raw;
  if (!Array.isArray(arr)) return [];
  return arr.map((s) => String(s).toUpperCase().trim()).filter(Boolean);
}
function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

export async function getZones(): Promise<ZoneDTO[]> {
  const auth = await requireSuperAdmin();
  if (!auth.ok) return [];

  const rows = await db.zones.findMany({ orderBy: { name: "asc" } });
  return rows.map((z) => ({
    id: z.id,
    name: z.name,
    states: toStateArray(z.states),
    isActive: z.isActive,
    freeMiles: Number(z.freeMiles),
    perMile: Number(z.perMile),
    createdAt: z.createdAt.toISOString(),
    updatedAt: z.updatedAt.toISOString(),
  }));
}

export async function saveZone(input: {
  id?: string;
  name: string;
  states: string[];
  isActive: boolean;
  freeMiles: number;
  perMile: number;
}): Promise<MutationResult> {
  const auth = await requireSuperAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const parsed = ZoneInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Please provide a name and valid states." };
  }

  // Normalize, de-dupe, and validate every state against the US set.
  const states = [
    ...new Set(parsed.data.states.map((s) => s.toUpperCase().trim()).filter(Boolean)),
  ];
  const invalid = states.filter((s) => !US_STATES.has(s));
  if (invalid.length) {
    return { success: false, error: `Not valid US state code(s): ${invalid.join(", ")}` };
  }
  // An active zone with no states would silently service nowhere.
  if (parsed.data.isActive && states.length === 0) {
    return { success: false, error: "An active zone must include at least one state." };
  }

  try {
    const pricing = {
      freeMiles: parsed.data.freeMiles,
      perMile: parsed.data.perMile,
    };
    if (parsed.data.id) {
      await db.zones.update({
        where: { id: parsed.data.id },
        data: { name: parsed.data.name, states, isActive: parsed.data.isActive, ...pricing },
      });
    } else {
      await db.zones.create({
        data: {
          id: crypto.randomUUID(),
          name: parsed.data.name,
          states,
          isActive: parsed.data.isActive,
          ...pricing,
        },
      });
    }
    return { success: true };
  } catch (error) {
    console.error("saveZone failed:", error); // detail server-side only
    return { success: false, error: "Could not save the zone." };
  }
}

export async function deleteZone(id: string): Promise<MutationResult> {
  const auth = await requireSuperAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  if (!id || typeof id !== "string") {
    return { success: false, error: "No zone selected." };
  }

  try {
    await db.zones.delete({ where: { id } });
    return { success: true };
  } catch (error) {
    console.error("deleteZone failed:", error);
    return { success: false, error: "Could not delete the zone." };
  }
}
