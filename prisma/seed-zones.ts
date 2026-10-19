/**
 * Idempotent service-zone seed. Safe to re-run — upserts by fixed id, so it
 * never duplicates and never touches any other table (unlike the destructive
 * full seed.ts). Expansion is a DATA change: flip `isActive` or edit `states`
 * here, in the DB, or from the admin app — no code change elsewhere.
 *
 * Run:  npx ts-node --compiler-options "{\"module\":\"CommonJS\"}" prisma/seed-zones.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ZONES: Array<{
  id: string;
  name: string;
  states: string[];
  isActive: boolean;
  freeMiles: number;
  perMile: number;
}> = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Zone 1",
    states: ["PA", "NY", "DC", "MD", "VA"],
    isActive: true,
    freeMiles: 20,
    perMile: 2,
  },
  // Placeholders: expand later by setting isActive=true and listing states,
  // rather than rewriting any logic.
  {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Zone 2",
    states: [],
    isActive: false,
    freeMiles: 20,
    perMile: 2,
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    name: "Zone 3",
    states: [],
    isActive: false,
    freeMiles: 20,
    perMile: 2,
  },
];

async function main() {
  console.log("🗺️  Seeding service zones (idempotent)...");
  for (const z of ZONES) {
    await prisma.zones.upsert({
      where: { id: z.id },
      update: { name: z.name, states: z.states, isActive: z.isActive, freeMiles: z.freeMiles, perMile: z.perMile },
      create: z,
    });
    console.log(
      `  ✓ ${z.name} [${z.isActive ? "active" : "inactive"}] → ${JSON.stringify(z.states)}`,
    );
  }
  console.log("🏁 Zones seeded.");
}

main()
  .catch((e) => {
    console.error("❌ Zone seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
