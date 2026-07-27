// Shared shape for a container row rendered across the admin dashboard.
//
// `status` is kept as a plain string: the raw value comes from the DB
// `ContainerStatus` enum (or null, normalized to a display default upstream),
// and the UI maps it to a badge variant with a fallback. The vocabularies for
// container status are not unified across the app, so a stricter union here
// would misrepresent what actually flows through at runtime.
export interface ContainerData {
  id: string;
  size: number;
  vessel: string;
  eta: string;
  revenue: string;
  status: string;
  originCity: string;
  depatureDate: string;
  collectedRevenue: string;
  loadedBy: string;
  destinationCity: string;
  shippingLine: string;
  totalInvoices: number;
  totalItems: number;
  sealNumber: string;
}
