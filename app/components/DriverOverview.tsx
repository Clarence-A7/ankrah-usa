"use client";

/**
 * DriverOverview
 * ---------------
 * Mobile-first, read-only mini-dashboard for o_driver / d_driver.
 * Status changes (Collected / Delivered / etc.) happen on the existing
 * My Pickups / My Dispatch pages — this component never renders an
 * action that mutates data.
 *
 * Security notes:
 * - Fetches /api/dashboard/driver-metrics, which is scoped server-side to
 *   the session's staffId via requireDriverAccess. This component never
 *   receives or sends a staffId itself.
 * - Same same-origin + no-store fetch pattern as the admin overview.
 */

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import styles from "./styles/DriverOverview.module.css";

const REFRESH_INTERVAL_MS = 60_000;

interface DailyPoint {
  day: string;
  value: number;
}
interface TrendData {
  series: DailyPoint[];
  weekOverWeekPct: number | null;
}

interface OriginDriverMetrics {
  scope: "o_driver";
  pendingPickup: number;
  collectedToday: number;
  receivedAtOrigin: number;
  totalAssigned: number;
  totalDelivered: number;
  deliveredThisMonth: number;
  trend: TrendData;
  stops: {
    invoiceNumber: string;
    status: string;
    pickupCity: string | null;
    pickupStreet: string | null;
    fullAddress: string;
    phone: string | null;
    updatedAt: string;
  }[];
}

interface DestinationDriverMetrics {
  scope: "d_driver";
  outForDelivery: number;
  deliveredToday: number;
  returnedToHub: number;
  totalAssigned: number;
  totalDelivered: number;
  deliveredThisMonth: number;
  trend: TrendData;
  stops: {
    invoiceNumber: string;
    status: string;
    destinationCity: string;
    fullAddress: string;
    phone: string | null;
    updatedAt: string;
  }[];
}

type Metrics = OriginDriverMetrics | DestinationDriverMetrics;

type LoadState =
  | { status: "loading" }
  | { status: "error"; code: number | null }
  | { status: "ready"; data: Metrics; fetchedAt: Date };

const STATUS_TONE: Record<string, "amber" | "teal" | "coral" | "default"> = {
  "Pending Pickup": "amber",
  Collected: "teal",
  "Received At Origin": "teal",
  "Out For Delivery": "amber",
  Delivered: "teal",
  "Returned To Hub": "coral",
};

const relativeTime = (iso: string): string => {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
};

export default function DriverOverview() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const controllerRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    try {
      const res = await fetch("/api/metrics/driver-metrics", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        signal: controller.signal,
      });

      if (!res.ok) {
        setState({ status: "error", code: res.status });
        return;
      }

      const body = (await res.json()) as { data: Metrics };
      setState({ status: "ready", data: body.data, fetchedAt: new Date() });
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setState({ status: "error", code: null });
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_INTERVAL_MS);
    return () => {
      clearInterval(id);
      controllerRef.current?.abort();
    };
  }, [load]);

  return (
    <div className={styles.page}>
      <Header state={state} onRefresh={load} />

      {state.status === "loading" && <LoadingSkeleton />}
      {state.status === "error" && (
        <ErrorState code={state.code} onRetry={load} />
      )}
      {state.status === "ready" && state.data.scope === "o_driver" && (
        <OriginDriverBoard data={state.data} />
      )}
      {state.status === "ready" && state.data.scope === "d_driver" && (
        <DestinationDriverBoard data={state.data} />
      )}
    </div>
  );
}

/* ---------------------------------- Header --------------------------------- */

function Header({
  state,
  onRefresh,
}: {
  state: LoadState;
  onRefresh: () => void;
}) {
  const scopeLabel =
    state.status === "ready"
      ? state.data.scope === "o_driver"
        ? "Pickup Route"
        : "Delivery Route"
      : null;

  return (
    <div className={styles.header}>
      <div className={styles.headerTop}>
        <p className={styles.eyebrow}>Ankrah F&amp;L</p>
        {state.status === "ready" && (
          <button
            type="button"
            onClick={onRefresh}
            className={styles.refreshBtn}
          >
            Refresh
          </button>
        )}
      </div>
      <h1 className={styles.title}>{scopeLabel ?? "Today"}</h1>
      {state.status === "ready" && (
        <p className={styles.updatedAt}>
          Updated {relativeTime(state.fetchedAt.toISOString())}
        </p>
      )}
    </div>
  );
}

/* ----------------------------- Shared primitives ---------------------------- */

function StatTile({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number | string;
  tone?: "default" | "amber" | "teal" | "coral";
}) {
  const toneClass =
    tone === "amber"
      ? styles.statValueAmber
      : tone === "teal"
        ? styles.statValueTeal
        : tone === "coral"
          ? styles.statValueCoral
          : "";

  return (
    <div className={styles.statTile}>
      <p className={`${styles.statValue} ${toneClass}`}>{value}</p>
      <p className={styles.statLabel}>{label}</p>
    </div>
  );
}

function DeltaBadge({ pct }: { pct: number | null }) {
  if (pct === null) {
    return (
      <span className={`${styles.deltaBadge} ${styles.deltaBadgeNeutral}`}>
        no baseline yet
      </span>
    );
  }
  const up = pct >= 0;
  return (
    <span
      className={`${styles.deltaBadge} ${up ? styles.deltaBadgeUp : styles.deltaBadgeDown}`}
    >
      <span aria-hidden>{up ? "\u2191" : "\u2193"}</span>
      {Math.abs(pct).toFixed(0)}% vs last week
    </span>
  );
}

function TrendCard({
  eyebrow,
  value,
  trend,
}: {
  eyebrow: string;
  value: string;
  trend: TrendData;
}) {
  return (
    <div className={styles.trendCard}>
      <p className={styles.eyebrow}>{eyebrow}</p>
      <div className={styles.trendTop}>
        <p className={styles.trendValue}>{value}</p>
        <DeltaBadge pct={trend.weekOverWeekPct} />
      </div>
    </div>
  );
}

function OverallStats({
  totalAssigned,
  totalDelivered,
  deliveredThisMonth,
}: {
  totalAssigned: number;
  totalDelivered: number;
  deliveredThisMonth: number;
}) {
  return (
    <div>
      <SectionLabel>Overall</SectionLabel>
      <div className={styles.statGrid}>
        <StatTile label="Total Assigned" value={totalAssigned} />
        <StatTile label="Total Delivered" value={totalDelivered} tone="teal" />
        <StatTile
          label="Delivered This Month"
          value={deliveredThisMonth}
          tone="teal"
        />
      </div>
    </div>
  );
}

function StopCard({
  invoiceNumber,
  status,
  location,
  address,
  phone,
  updatedAt,
}: {
  invoiceNumber: string;
  status: string;
  location: string;
  address: string;
  phone: string | null;
  updatedAt: string;
}) {
  const tone = STATUS_TONE[status] ?? "default";
  const toneClass =
    tone === "amber"
      ? styles.stopStatusAmber
      : tone === "teal"
        ? styles.stopStatusTeal
        : tone === "coral"
          ? styles.stopStatusCoral
          : styles.stopStatusDefault;

  const navHref = address
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`
    : null;
  const telDigits = phone ? phone.replace(/[^\d+]/g, "") : "";
  const telHref = telDigits ? `tel:${telDigits}` : null;

  return (
    <div className={styles.stopCard}>
      <div className={styles.stopTop}>
        <p className={styles.stopInvoice}>{invoiceNumber}</p>
        <span className={`${styles.stopStatus} ${toneClass}`}>{status}</span>
      </div>
      <p className={styles.stopLocation}>{location}</p>
      <p className={styles.stopTime}>{relativeTime(updatedAt)}</p>

      {(navHref || telHref) && (
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          {navHref && (
            <a
              href={navHref}
              target="_blank"
              rel="noopener noreferrer"
              style={stopActionStyle("#eff6ff", "#1d4ed8")}
            >
              <span aria-hidden>↗</span> Navigate
            </a>
          )}
          {telHref && (
            <a href={telHref} style={stopActionStyle("#f0fdf4", "#15803d")}>
              <span aria-hidden>☎</span> Call
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function stopActionStyle(bg: string, color: string): CSSProperties {
  return {
    flex: 1,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: "9px 10px",
    borderRadius: 10,
    background: bg,
    color,
    fontSize: "0.82rem",
    fontWeight: 600,
    textDecoration: "none",
  };
}

function StopList({
  children,
  emptyText,
}: {
  children: React.ReactNode;
  emptyText: string;
}) {
  const hasChildren = Array.isArray(children)
    ? children.length > 0
    : Boolean(children);
  if (!hasChildren) {
    return <p className={styles.emptyText}>{emptyText}</p>;
  }
  return <div className={styles.stopList}>{children}</div>;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h2 className={styles.sectionLabel}>{children}</h2>;
}

/* -------------------------------- Origin driver -------------------------------- */

function OriginDriverBoard({ data }: { data: OriginDriverMetrics }) {
  return (
    <div className={styles.stack}>
      <div className={styles.statGrid}>
        <StatTile
          label="Pending Pickup"
          value={data.pendingPickup}
          tone="amber"
        />
        <StatTile
          label="Collected Today"
          value={data.collectedToday}
          tone="teal"
        />
        <StatTile label="At Origin" value={data.receivedAtOrigin} tone="teal" />
      </div>

      <TrendCard
        eyebrow="Collected — 14-day trend"
        value={data.collectedToday.toString()}
        trend={data.trend}
      />

      <OverallStats
        totalAssigned={data.totalAssigned}
        totalDelivered={data.totalDelivered}
        deliveredThisMonth={data.deliveredThisMonth}
      />

      <div>
        <SectionLabel>Your Stops</SectionLabel>
        <StopList emptyText="No pickups assigned right now.">
          {data.stops.map((s) => (
            <StopCard
              key={`${s.invoiceNumber}-${s.updatedAt}`}
              invoiceNumber={s.invoiceNumber}
              status={s.status}
              location={
                [s.pickupStreet, s.pickupCity].filter(Boolean).join(", ") ||
                "No address on file"
              }
              address={s.fullAddress}
              phone={s.phone}
              updatedAt={s.updatedAt}
            />
          ))}
        </StopList>
      </div>
    </div>
  );
}

/* ------------------------------ Destination driver ----------------------------- */

function DestinationDriverBoard({ data }: { data: DestinationDriverMetrics }) {
  return (
    <div className={styles.stack}>
      <div className={styles.statGrid}>
        <StatTile
          label="Out For Delivery"
          value={data.outForDelivery}
          tone="amber"
        />
        <StatTile
          label="Delivered Today"
          value={data.deliveredToday}
          tone="teal"
        />
        <StatTile
          label="Returned To Hub"
          value={data.returnedToHub}
          tone={data.returnedToHub > 0 ? "coral" : "default"}
        />
      </div>

      <TrendCard
        eyebrow="Delivered — 14-day trend"
        value={data.deliveredToday.toString()}
        trend={data.trend}
      />

      <OverallStats
        totalAssigned={data.totalAssigned}
        totalDelivered={data.totalDelivered}
        deliveredThisMonth={data.deliveredThisMonth}
      />

      <div className={styles.stopsStack}>
        <SectionLabel>Your Stops</SectionLabel>
        <StopList emptyText="No deliveries assigned right now.">
          {data.stops.map((s) => (
            <StopCard
              key={`${s.invoiceNumber}-${s.updatedAt}`}
              invoiceNumber={s.invoiceNumber}
              status={s.status}
              location={s.destinationCity}
              address={s.fullAddress}
              phone={s.phone}
              updatedAt={s.updatedAt}
            />
          ))}
        </StopList>
      </div>
    </div>
  );
}

/* ---------------------------------- States ------------------------------------ */

function LoadingSkeleton() {
  return (
    <div className={styles.skeleton} aria-busy="true" aria-live="polite">
      <div className={styles.statGrid}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className={`${styles.skeletonBlock} ${styles.skeletonTile}`}
          />
        ))}
      </div>
      <div className={`${styles.skeletonBlock} ${styles.skeletonTrend}`} />
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className={`${styles.skeletonBlock} ${styles.skeletonStop}`}
        />
      ))}
    </div>
  );
}

function ErrorState({
  code,
  onRetry,
}: {
  code: number | null;
  onRetry: () => void;
}) {
  const message =
    code === 401
      ? "Your session has expired. Sign in again."
      : code === 403
        ? "Your account doesn't have access to this view."
        : "Couldn't load your route.";

  return (
    <div className={styles.errorCard}>
      <p className={styles.errorText}>{message}</p>
      {code !== 401 && code !== 403 && (
        <button type="button" onClick={onRetry} className={styles.retryBtn}>
          Try again
        </button>
      )}
    </div>
  );
}
