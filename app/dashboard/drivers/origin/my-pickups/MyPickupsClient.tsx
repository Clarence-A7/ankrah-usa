"use client";

import React, { useMemo, useState } from "react";
import {
  PackageCheck,
  Check,
  Search,
  MapPin,
  Phone,
  Boxes,
} from "lucide-react";
import styles from "../../../styles/my-pickups.module.css";
import CollectConfirmModal from "../../../../components/CollectConfirmModal";

interface ShipmentItem {
  id: string;
  itemType: string;
  quantity: number;
}

interface Shipment {
  id: string;
  invoiceNumber: string;
  status: string;
  shipmentMode: string;
  containerId: string | null;
  pickupStreet: string;
  pickupCity: string;
  pickupState: string;
  pickupZip: string;
  destinationCity: string;
  consignerName: string;
  consignerPhone: string;
  consignerEmail: string;
  consigneeName: string;
  consigneePhone: string;
  amountPaid: number;
  amountDue: number;
  createdAt: string;
  updatedAt: string;
  items: ShipmentItem[];
}

interface MyPickupsClientProps {
  shipmentsData: Shipment[];
}

// Canonical status tabs. The `match` values are normalized (upper snake/space
// insensitive) so "PENDING PICKUP" and "PENDING_PICKUP" both work depending
// on how the API serializes the enum.
const STATUS_TABS = [
  { key: "PENDING_PICKUP", label: "PENDING" },
  { key: "COLLECTED", label: "PICKED" },
  { key: "READY_FOR_SHIPMENT", label: "DELIVERED" },
] as const;

type StatusTabKey = (typeof STATUS_TABS)[number]["key"];

// Full pipeline order, oldest to newest stage. Used to determine "how far
// along" a shipment is, rather than relying on exact string matches — this
// is what lets the DELIVERED tab show Received At Origin *and everything
// after it*, instead of only shipments sitting in exactly one status.
const STATUS_PIPELINE = [
  "BOOKED",
  "READY_FOR_PICKUP",
  "PENDING_PICKUP",
  "COLLECTED",
  "RECEIVED_AT_ORIGIN",
  "READY_FOR_SHIPMENT",
  "IN_TRANSIT",
  "ARRIVED",
  "CLEARED",
  "READY_FOR_DELIVERY",
  "RETURNED TO HUB",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
] as const;

type PipelineStatus = (typeof STATUS_PIPELINE)[number];

const COLLECTED_INDEX = STATUS_PIPELINE.indexOf("COLLECTED");
const RECEIVED_AT_ORIGIN_INDEX = STATUS_PIPELINE.indexOf("RECEIVED_AT_ORIGIN");

function normalizeStatus(status: string): string {
  return status
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}

// -1 if the status isn't a known pipeline stage (unmapped/legacy value).
function pipelineIndex(status: string): number {
  return STATUS_PIPELINE.indexOf(normalizeStatus(status) as PipelineStatus);
}

// PENDING and PICKED are exact-match on their own stage. DELIVERED means
// "has reached origin, or is anywhere further along" — a shipment doesn't
// vanish from the driver's view just because ops advances it past receiving.
function matchesTab(status: string, tabKey: StatusTabKey): boolean {
  if (tabKey === "READY_FOR_SHIPMENT") {
    const idx = pipelineIndex(status);
    return idx !== -1 && idx >= RECEIVED_AT_ORIGIN_INDEX;
  }
  return normalizeStatus(status) === tabKey;
}

// Maps a raw status string (however the API formats it: "Ready For Pickup",
// "READY_FOR_PICKUP", "ready-for-pickup") to the camelCase CSS Modules class
// that carries its pill color. Falls back to "" (default grey) if the
// status doesn't match a known pipeline stage.
const STATUS_CLASS_MAP: Record<string, string> = {
  READY_FOR_PICKUP: "readyForPickup",
  PENDING_PICKUP: "pendingPickup",
  COLLECTED: "collected",
  RECEIVED_AT_ORIGIN: "receivedAtOrigin",
  READY_FOR_SHIPMENT: "readyForShipment",
  IN_TRANSIT: "inTransit",
  ARRIVED: "arrived",
  CLEARED: "cleared",
  READY_FOR_DELIVERY: "readyForDelivery",
  OUT_FOR_DELIVERY: "outForDelivery",
  DELIVERED: "delivered",
  RETURNED_TO_HUB: "returnedToHub",
};

function statusToClassKey(status: string): string {
  return STATUS_CLASS_MAP[normalizeStatus(status)] || "";
}

// Client-side only, purely cosmetic filtering of a driver's own already-
// authorized dataset — no new data is fetched or exposed here.
function matchesSearch(shipment: Shipment, query: string): boolean {
  if (!query.trim()) return true;
  const q = query.trim().toLowerCase();
  return (
    shipment.invoiceNumber.toLowerCase().includes(q) ||
    shipment.consignerName.toLowerCase().includes(q) ||
    shipment.consigneeName.toLowerCase().includes(q) ||
    shipment.pickupCity.toLowerCase().includes(q) ||
    shipment.pickupStreet.toLowerCase().includes(q)
  );
}

export default function MyPickupsClient({
  shipmentsData,
}: MyPickupsClientProps) {
  // Local copy so a successful collection can flip the badge immediately,
  // without waiting on a full page refetch.
  const [shipments, setShipments] = useState(shipmentsData);
  const [collectingShipment, setCollectingShipment] = useState<Shipment | null>(
    null,
  );
  const [activeTab, setActiveTab] = useState<StatusTabKey>("PENDING_PICKUP");
  const [searchQuery, setSearchQuery] = useState("");

  const handleCollected = (shipmentId: string) => {
    setShipments((prev) =>
      prev.map((s) =>
        s.id === shipmentId ? { ...s, status: "Collected" } : s,
      ),
    );
  };

  const counts = useMemo(() => {
    const tally: Record<string, number> = {};
    for (const tab of STATUS_TABS) {
      tally[tab.key] = shipments.filter((s) =>
        matchesTab(s.status, tab.key),
      ).length;
    }
    return tally;
  }, [shipments]);

  const filteredShipments = useMemo(
    () =>
      shipments
        .filter((s) => matchesTab(s.status, activeTab))
        .filter((s) => matchesSearch(s, searchQuery)),
    [shipments, activeTab, searchQuery],
  );

  return (
    <div className={styles.pageData}>
      <div className={styles.controlsBar}>
        <div className={styles.searchWrapper}>
          <Search className={styles.searchIcon} aria-hidden="true" />
          <input
            type="text"
            inputMode="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search invoice, name, or address"
            className={styles.searchInput}
            aria-label="Search assigned pickups"
          />
        </div>

        <div
          className={styles.statusTabs}
          role="tablist"
          aria-label="Shipment status"
        >
          {STATUS_TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            const count = counts[tab.key] || 0;

            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`${styles.statusTab} ${isActive ? styles.statusTabActive : ""}`}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
                <span className={styles.statusTabCount}>{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {filteredShipments.length === 0 ? (
        <div className={styles.emptyState}>
          <Boxes className={styles.emptyStateIcon} aria-hidden="true" />
          <p>
            {searchQuery
              ? "No pickups match your search."
              : "No shipments in this category right now."}
          </p>
        </div>
      ) : (
        <div className={styles.pickupCardGrid}>
          {filteredShipments.map((shipment) => {
            // Disabled once the shipment has reached Collected or any later
            // stage — not just an exact "COLLECTED" match — so a shipment
            // that's already progressed to Received At Origin (and beyond)
            // never shows an active "Collect" button again.
            const shipmentStageIndex = pipelineIndex(shipment.status);
            const isCollected =
              shipmentStageIndex !== -1 &&
              shipmentStageIndex >= COLLECTED_INDEX;

            return (
              <div key={shipment.id} className={styles.pickupCard}>
                <div className={styles.pickupCardHeader}>
                  <div>
                    <h3 className={styles.pickupCardInvoice}>
                      {shipment.invoiceNumber}
                    </h3>
                    {shipment.shipmentMode && (
                      <span className={styles.pickupCardMode}>
                        {shipment.shipmentMode}
                      </span>
                    )}
                  </div>
                  <span
                    className={`${styles.statusBadge} ${styles[statusToClassKey(shipment.status)] || ""}`}
                  >
                    {shipment.status}
                  </span>
                </div>

                <div className={styles.pickupCardBody}>
                  <div className={styles.pickupCardColumn}>
                    <span className={styles.pickupCardLabel}>Pickup</span>
                    <p className={styles.pickupCardName}>
                      {shipment.consignerName}
                    </p>
                    <p className={styles.pickupCardAddress}>
                      <MapPin
                        className={styles.inlineIcon}
                        aria-hidden="true"
                      />
                      <span>
                        {shipment.pickupStreet}, {shipment.pickupCity},{" "}
                        {shipment.pickupState} {shipment.pickupZip}
                      </span>
                    </p>
                    <a
                      href={`tel:${shipment.consignerPhone}`}
                      className={styles.pickupCardPhoneLink}
                    >
                      <Phone className={styles.inlineIcon} aria-hidden="true" />
                      {shipment.consignerPhone}
                    </a>
                  </div>

                  <div className={styles.pickupCardColumn}>
                    {shipment.amountDue === 0 ? (
                      <span className={styles.fullyPaidBadge}>
                        <Check className={styles.fullyPaidIcon} />
                        Fully Paid
                      </span>
                    ) : (
                      <span className={styles.pickupCardDue}>
                        Due: ${shipment.amountDue.toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>

                <div className={styles.pickupCardDivider} />

                <div className={styles.pickupCardItems}>
                  <span className={styles.pickupCardLabel}>Manifest Items</span>
                  <ul className={styles.pickupCardItemList}>
                    {shipment.items.map((item) => (
                      <li key={item.id} className={styles.pickupCardItem}>
                        <span>{item.itemType}</span>
                        <span className={styles.pickupCardItemQty}>
                          Qty: {item.quantity}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                <button
                  type="button"
                  className={styles.collectBtn}
                  onClick={() => setCollectingShipment(shipment)}
                  disabled={isCollected}
                >
                  <PackageCheck className={styles.collectBtnIcon} />
                  {isCollected ? "Collected" : "Collect"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {collectingShipment && (
        <CollectConfirmModal
          invoiceNumber={collectingShipment.invoiceNumber}
          shipmentId={collectingShipment.id}
          items={collectingShipment.items}
          onClose={() => setCollectingShipment(null)}
          onCollected={() => handleCollected(collectingShipment.id)}
        />
      )}
    </div>
  );
}
