// app/dashboard/drivers/origin/my-pickups/MyPickupsClient.tsx
"use client";

import React, { useMemo, useState } from "react";
import { Truck, Check } from "lucide-react";
import styles from "../../../styles/my-pickups.module.css";
import DeliveryModal from "../../../../components/DeliveryModal";

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

const STATUS_TABS = [
  { key: "OUT_FOR_DELIVERY", label: "PENDING" },
  { key: "DELIVERED", label: "COMPLETED" },
] as const;

type StatusTabKey = (typeof STATUS_TABS)[number]["key"];

function normalizeStatus(status: string): string {
  return status
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}

const STATUS_CLASS_MAP: Record<string, string> = {
  READY_FOR_PICKUP: "readyForPickup",
  PENDING_PICKUP: "pendingPickup",
  COLLECTED: "collected",
  READY_FOR_SHIPMENT: "readyForShipment",
  IN_TRANSIT: "inTransit",
  ARRIVED: "arrived",
  CLEARED: "cleared",
  READY_FOR_DELIVERY: "readyForDelivery",
  OUT_FOR_DELIVERY: "outForDelivery",
  DELIVERED: "delivered",
};

function statusToClassKey(status: string): string {
  return STATUS_CLASS_MAP[normalizeStatus(status)] || "";
}

export default function MyPickupsClient({
  shipmentsData,
}: MyPickupsClientProps) {
  const [shipments, setShipments] = useState(shipmentsData);
  const [deliveringShipment, setDeliveringShipment] = useState<Shipment | null>(
    null,
  );
  const [activeTab, setActiveTab] = useState<StatusTabKey>("OUT_FOR_DELIVERY");

  const handleDelivered = (shipmentId: string) => {
    setShipments((prev) =>
      prev.map((s) =>
        s.id === shipmentId ? { ...s, status: "DELIVERED" } : s,
      ),
    );
  };

  const counts = useMemo(() => {
    const tally: Record<string, number> = {};
    for (const s of shipments) {
      const key = normalizeStatus(s.status);
      tally[key] = (tally[key] || 0) + 1;
    }
    return tally;
  }, [shipments]);

  const filteredShipments = useMemo(
    () => shipments.filter((s) => normalizeStatus(s.status) === activeTab),
    [shipments, activeTab],
  );

  return (
    <div className={styles.pageData}>
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

      {filteredShipments.length === 0 ? (
        <p className={styles.emptyState}>
          No shipments in this category right now.
        </p>
      ) : (
        <div className={styles.pickupCardGrid}>
          {filteredShipments.map((shipment) => {
            const isDelivered =
              normalizeStatus(shipment.status) === "DELIVERED";

            return (
              <div key={shipment.id} className={styles.pickupCard}>
                <div className={styles.pickupCardHeader}>
                  <h3 className={styles.pickupCardInvoice}>
                    {shipment.invoiceNumber}
                  </h3>
                  <span
                    className={`${styles.statusBadge} ${styles[statusToClassKey(shipment.status)] || ""}`}
                  >
                    {shipment.status}
                  </span>
                </div>

                <div className={styles.pickupCardBody}>
                  <div className={styles.pickupCardColumn}>
                    <span className={styles.pickupCardLabel}>Delivery</span>
                    <p className={styles.pickupCardName}>
                      Name: {shipment.consigneeName}
                    </p>
                    <p className={styles.pickupCardAddress}>
                      {shipment.destinationCity}
                      <br />
                    </p>
                    <a
                      href={`tel:${shipment.consigneePhone}`}
                      className={styles.pickupCardPhoneLink}
                    >
                      {shipment.consigneePhone}
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
                  onClick={() => setDeliveringShipment(shipment)}
                  disabled={isDelivered}
                >
                  <Truck className={styles.collectBtnIcon} />
                  {isDelivered ? "Delivered" : "Confirm Delivery"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {deliveringShipment && (
        <DeliveryModal
          invoiceNumber={deliveringShipment.invoiceNumber}
          shipmentId={deliveringShipment.id}
          items={deliveringShipment.items}
          onClose={() => setDeliveringShipment(null)}
          onDelivered={() => {
            handleDelivered(deliveringShipment.id);
            setDeliveringShipment(null);
          }}
        />
      )}
    </div>
  );
}
