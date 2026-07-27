"use client";

import React from "react";
import Button from "./ui/Button";
import { Car, X } from "lucide-react";
import {
  getStatusBadge,
  TITLE_STATUS_LABELS,
  formatMoney,
} from "./vehicleQuoteHelpers";

interface VehicleQuoteDetailsModalProps {
  request: any;
  onClose: () => void;
  onImageClick: (src: string) => void;
}

export default function VehicleQuoteDetailsModal({
  request,
  onClose,
  onImageClick,
}: VehicleQuoteDetailsModalProps) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(15, 23, 42, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "1rem",
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "#ffffff",
          borderRadius: "12px",
          maxWidth: "560px",
          width: "100%",
          maxHeight: "85vh",
          overflowY: "auto",
          boxShadow: "0 20px 40px rgba(0,0,0,0.15)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "1.25rem 1.5rem",
            borderBottom: "1px solid #e5e7eb",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Car size={18} color="#2e63af" />
            <h2
              style={{
                fontSize: "1.05rem",
                fontWeight: 700,
                color: "#0f172a",
                margin: 0,
              }}
            >
              {request.referenceNumber}
            </h2>
            {getStatusBadge(request.status)}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#6b7280",
            }}
          >
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: "1.5rem" }}>
          {request.vehicleImageUrl ? (
            <img
              src={request.vehicleImageUrl}
              alt={`${request.vehicleYear} ${request.vehicleMake} ${request.vehicleModel}`}
              onClick={() => onImageClick(request.vehicleImageUrl)}
              style={{
                width: "100%",
                maxHeight: "220px",
                objectFit: "cover",
                borderRadius: "8px",
                marginBottom: "1.25rem",
                border: "1px solid #e5e7eb",
                cursor: "pointer",
              }}
            />
          ) : null}

          <DetailRow
            label="Vehicle"
            value={`${request.vehicleYear} ${request.vehicleMake} ${request.vehicleModel}`}
          />
          <DetailRow label="VIN" value={request.vin} mono />
          <DetailRow
            label="Mileage"
            value={
              request.mileage !== null
                ? Number(request.mileage).toLocaleString()
                : "Not provided"
            }
          />
          <DetailRow
            label="Title Status"
            value={
              TITLE_STATUS_LABELS[request.titleStatus] || request.titleStatus
            }
          />
          <DetailRow
            label="Left-Hand Drive"
            value={request.isLeftHandDrive ? "Confirmed" : "Not confirmed"}
          />

          <div
            style={{
              height: "1px",
              backgroundColor: "#e5e7eb",
              margin: "1rem 0",
            }}
          />

          <DetailRow label="Requester" value={request.requesterName} />
          <DetailRow label="Email" value={request.requesterEmail} />
          <DetailRow label="Phone" value={request.requesterPhone} />

          <div
            style={{
              height: "1px",
              backgroundColor: "#e5e7eb",
              margin: "1rem 0",
            }}
          />

          <DetailRow
            label="Pickup"
            value={`${request.pickupStreet}, ${request.pickupCity}, ${request.pickupState} ${request.pickupZip}`}
          />
          <DetailRow label="Destination" value={request.destinationCity} />

          {request.notes ? (
            <>
              <div
                style={{
                  height: "1px",
                  backgroundColor: "#e5e7eb",
                  margin: "1rem 0",
                }}
              />
              <DetailRow label="Notes" value={request.notes} />
            </>
          ) : null}

          {request.quotedAmount !== null ? (
            <>
              <div
                style={{
                  height: "1px",
                  backgroundColor: "#e5e7eb",
                  margin: "1rem 0",
                }}
              />
              <DetailRow
                label="Quoted Amount"
                value={formatMoney(Number(request.quotedAmount))}
              />
              {request.quotedAt ? (
                <DetailRow
                  label="Quoted On"
                  value={new Date(request.quotedAt).toLocaleString()}
                />
              ) : null}
            </>
          ) : null}

          {request.bookedInvoiceNumber ? (
            <>
              <div
                style={{
                  height: "1px",
                  backgroundColor: "#e5e7eb",
                  margin: "1rem 0",
                }}
              />
              <DetailRow
                label="Invoice Number"
                value={request.bookedInvoiceNumber}
                mono
              />
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// Only used within this modal -- kept local rather than moved into the
// shared helpers file, since nothing else needs it.
function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: "1rem",
        padding: "0.3rem 0",
        fontSize: "0.875rem",
      }}
    >
      <span style={{ color: "#6b7280" }}>{label}</span>
      <span
        style={{
          color: "#0f172a",
          fontWeight: 500,
          fontFamily: mono ? "monospace" : "inherit",
          textAlign: "right",
        }}
      >
        {value}
      </span>
    </div>
  );
}
