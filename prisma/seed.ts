import { PrismaClient, UserRole } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🚀 Starting database seeding with split-shipment test cases...");

  // 1. Clean up lingering records sequentially to preserve foreign key cascades
  await prisma.manifestItem.deleteMany({});
  await prisma.invoice.deleteMany({});
  await prisma.container.deleteMany({});
  await prisma.user.deleteMany({});

  // 2. Insert Super Admin Operator Profile
  const admin = await prisma.user.create({
    data: {
      email: "admin@ankrahfl.com",
      name: "Clarence Ankrah",
      password: "hashed_password_here", 
      role: UserRole.super_admin,
    },
  });
  console.log(`👤 Created terminal operator: ${admin.email}`);

  // 3. Create a clean Container profile to serve as your active sandbox terminal target
  const testContainer = await prisma.container.create({
    data: {
      id: "CLHU897654", // 👈 Alphanumeric primary key string
      size: 40,
      vessel: "Evergreen Apex",
      departureDate: new Date("2026-06-10T08:00:00Z"),
      eta: new Date("2026-06-15T18:00:00Z"),
      shippingLine: "Evergreen Marine",
      sealNumber: "EMC-E391024",
      originCity: "Hanoi, VN",
      destinationCity: "Accra, GH",
      // status left null → container is still open/loading at the origin hub
      // (the ContainerStatus enum has no "Booked" member).
      loadedBy: "Clarence Ankrah",
    },
  });
  console.log(`📦 Created baseline sandbox container target: ${testContainer.id}`);

  // 4. Seed Invoice #1: Standard Mixed Freight Booking
  const invoice1 = await prisma.invoice.create({
    data: {
      invoiceNumber: "INV-2026-05001",
      consignerName: "Vina Tech Manufacturing",
      pickupStreet:"12 Noibai Industrial Zone, Hanoi, Vietnam",
      consignerPhone: "+84912345678",
      consignerEmail: "shipping@vinatech.vn",
      consigneeName: "Ankrah Freight & Logistics HQ",
      consigneePhone: "+233244123456",
      destinationCity: "Accra, GH",
      amountDue: 3500.00,
      amountPaid:3500.00, 
      status: "Paid_Pending_Pickup",
      loadStatus: "Pending", // Set to Pending initially so scanner can change it to Partial/Full
      containerId: null, 
      items: {
        create: [
          { itemType: "Barrel", quantity: 1 },
          { itemType: "Box", quantity: 2 },
        ],
      },
    },
  });
  console.log(`📝 Seeded Mixed Freight: ${invoice1.invoiceNumber}`);

  // 5. Seed Invoice #2: Standard Single-Item Bulk Box Booking
  const invoice2 = await prisma.invoice.create({
    data: {
      invoiceNumber: "INV-2026-05002",
      consignerName: "Nguyen Hoang",
      pickupStreet:"245 Tay Ho District, Hanoi, Vietnam",
      consignerPhone: "+84987654321",
      consignerEmail: "hoang96@gmail.com",
      consigneeName: "Nadia Adu",
      consigneePhone: "+233201112223",
      destinationCity: "Tema, GH",
      amountDue: 1800.00,
      amountPaid:800.00, 
      status: "Partial_Pending_Pickup",
      loadStatus: "Pending",
      containerId: null, 
      items: {
        create: [
          { itemType: "Box", quantity: 5 },
        ],
      },
    },
  });
  console.log(`📝 Seeded Bulk Box Booking: ${invoice2.invoiceNumber}`);

  // 6. 🌟 Seed Invoice #3: Dedicated Split-Shipment Testing Matrix
  const invoiceSplit = await prisma.invoice.create({
    data: {
      invoiceNumber: "INV-2026-SPLIT",
      consignerName: "Hanoi Agro-Export Corp",
      pickupStreet:"88 Logistics Way, Long Bien, Hanoi",
      consignerPhone: "+84900111222",
      consignerEmail: "export@hanoiagro.vn",
      consigneeName: "Ankrah Holdings Depot",
      consigneePhone: "+233244999888",
      destinationCity: "Accra, GH",
      amountDue: 5000.00,
      amountPaid:5000.00,
      status: "Paid_Pending_Pickup",
      loadStatus: "Pending",
      containerId: null,
      items: {
        create: [
          { itemType: "Barrel", quantity: 5 }, // 👈 Backed by 5 barrels to test partial cutoffs
        ],
      },
    },
  });
  console.log(`🧪 Seeded dedicated split-shipment baseline logic target: ${invoiceSplit.invoiceNumber}`);

  console.log("🏁 Database seeding completed successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Seeding script failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });