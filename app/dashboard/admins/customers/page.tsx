import { redirect } from "next/navigation";
import { getSession } from "@/app/lib/session";
import { db } from "@/app/lib/db";
import CustomersClient from "./CustomersClient";

export default async function CustomersPage() {
  const session = await getSession();

  if (!session?.userId) {
    redirect("/login");
  }

  if (session.role !== "origin_admin" && session.role !== "super_admin") {
    redirect("/unauthorized");
  }

  // passwordHash and token are deliberately excluded — neither should ever
  // leave the server, regardless of how this select list changes later.
  const customers = await db.customers.findMany({
    select: {
      id: true,
      customerCode: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      streetAddress: true,
      city: true,
      state: true,
      zipCode: true,
      isActive: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const initialCustomers = customers.map((c) => ({
    ...c,
    createdAt: c.createdAt.toISOString(),
  }));

  return <CustomersClient initialCustomers={initialCustomers} />;
}
