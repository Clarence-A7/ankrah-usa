"use client";

/**
 * DashboardOverview
 * ------------------
 * Role-aware metrics overview for super_admin and origin_admin.
 * Styling lives in DashboardOverview.module.css — plain CSS, no Tailwind
 * dependency, so it renders correctly regardless of your Tailwind setup.
 *
 * Security notes (read before wiring this up):
 * - This component never receives or infers a role from props/client
 *   state. It renders whatever `scope` the server returned, and the
 *   server (`requireDashboardAccess`) is the only place role is decided.
 * - Fetch uses `credentials: "same-origin"` and `cache: "no-store"` — the
 *   session cookie authenticates the request; nothing else needs to be
 *   passed client-side.
 * - A 401/403 from the API renders a plain access-denied state, not a
 *   redirect built from client-controlled data, and never echoes back
 *   response internals.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./styles/DashboardOverview.module.css";

const REFRESH_INTERVAL_MS = 60_000;

const PIPELINE_LABELS: Record<string, string> = {
  "Ready For Pickup": "Ready",
  "Pending Pickup": "Pending",
  Collected: "Collected",
  "Received At Origin": "At Origin",
  "In-Transit": "In-Transit",
  Arrived: "Arrived",
  Cleared: "Cleared",
  "Received At Hub": "At Hub",
  "Out For Delivery": "Out",
  "Returned To Hub": "Returned",
  Delivered: "Delivered",
};

const PIPELINE_COLORS: Record<string, string> = {
  "Ready For Pickup": "var(--muted-text)",
  "Pending Pickup": "var(--muted-text)",
  Collected: "#6C7A94",
  "Received At Origin": "var(--color-primary)",
  "In-Transit": "var(--warning)",
  Arrived: "var(--warning)",
  Cleared: "var(--success)",
  "Received At Hub": "var(--success)",
  "Out For Delivery": "var(--foreground)",
  "Returned To Hub": "var(--danger)",
  Delivered: "var(--success)",
};

interface DailyPoint {
  day: string;
  value: number;
}
interface TrendData {
  series: DailyPoint[];
  weekOverWeekPct: number | null;
}
interface StatusFunnelEntry {
  status: string;
  count: number;
}

interface VehicleMetrics {
  pendingRequests: number;
  quotesSent: number;
  bookedThisMonth: number;
  revenueThisMonth: number;
}

interface SuperAdminMetrics {
  scope: "super_admin";
  revenue: {
    collectedThisMonth: number;
    outstanding: number;
    trend: TrendData;
  };
  statusFunnel: StatusFunnelEntry[];
  containers: {
    inTransit: number;
    arrived: number;
    cleared: number;
    receivedAtHub: number;
    tamperFlagged: number;
  };
  deliveries: {
    deliveredToday: number;
    outForDelivery: number;
    returnedToHub: number;
    trend: TrendData;
  };
  vehicles: VehicleMetrics;
  topDestinations: { city: string; count: number }[];
  recentActivity: {
    invoiceNumber: string;
    status: string;
    changedAt: string;
  }[];
}

interface OriginAdminMetrics {
  scope: "origin_admin";
  pickups: {
    pendingPickup: number;
    collectedToday: number;
    receivedAtOrigin: number;
    trend: TrendData;
  };
  containers: { loading: number; createdToday: number };
  activeDrivers: number;
  recentPickups: {
    invoiceNumber: string;
    status: string;
    pickupDriver: string | null;
    updatedAt: string;
  }[];
}

interface DestinationAdminMetrics {
  scope: "destination_admin";
  containers: {
    arrived: number;
    cleared: number;
    receivedAtHub: number;
  };
  deliveries: {
    deliveredToday: number;
    outForDelivery: number;
    returnedToHub: number;
    trend: TrendData;
  };
  activeDrivers: number;
  recentDeliveries: {
    invoiceNumber: string;
    status: string;
    deliveryDriver: string | null;
    updatedAt: string;
  }[];
}

type Metrics = SuperAdminMetrics | OriginAdminMetrics | DestinationAdminMetrics;

type LoadState =
  | { status: "loading" }
  | { status: "error"; code: number | null }
  | { status: "ready"; data: Metrics; fetchedAt: Date };

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const relativeTime = (iso: string): string => {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
};

const weekdayLabel = (day: string): string =>
  new Date(`${day}T00:00:00`).toLocaleDateString("en-US", { weekday: "short" });

export default function DashboardOverview() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const controllerRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    try {
      const res = await fetch("/api/metrics", {
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
      <div className={styles.container}>
        <Header state={state} onRefresh={load} />

        {state.status === "loading" && <LoadingSkeleton />}
        {state.status === "error" && (
          <ErrorState code={state.code} onRetry={load} />
        )}
        {state.status === "ready" && state.data.scope === "super_admin" && (
          <SuperAdminBoard data={state.data} />
        )}
        {state.status === "ready" && state.data.scope === "origin_admin" && (
          <OriginAdminBoard data={state.data} />
        )}
        {state.status === "ready" &&
          state.data.scope === "destination_admin" && (
            <DestinationAdminBoard data={state.data} />
          )}
      </div>
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
      ? state.data.scope === "super_admin"
        ? "Super Admin"
        : state.data.scope === "origin_admin"
          ? "Origin Admin"
          : "Destination Admin"
      : null;

  return (
    <div className={styles.header}>
      <div>
        <p className={styles.eyebrow}>Ankrah F&amp;L — Operations</p>
        <h1 className={styles.title}>Overview</h1>
      </div>
      <div className={styles.headerActions}>
        {scopeLabel && <span className={styles.scopeBadge}>{scopeLabel}</span>}
        {state.status === "ready" && (
          <span className={styles.updatedAt}>
            Updated {relativeTime(state.fetchedAt.toISOString())}
          </span>
        )}
        <button
          type="button"
          onClick={onRefresh}
          className="btn btn-outline btn-sm"
        >
          Refresh
        </button>
      </div>
    </div>
  );
}

/* ----------------------------------- Sparkline --------------------------------- */

function Sparkline({
  series,
  color = "#101526",
}: {
  series: DailyPoint[];
  color?: string;
}) {
  const width = 280;
  const height = 56;
  const values = series.map((p) => p.value);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const stepX = width / Math.max(series.length - 1, 1);

  const points = series
    .map((p, i) => {
      const x = i * stepX;
      const y = height - ((p.value - min) / range) * (height - 6) - 3;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const areaPoints = `0,${height} ${points} ${width},${height}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={styles.sparkline}
      preserveAspectRatio="none"
      role="img"
      aria-label={`14-day trend, values from ${min} to ${max}`}
    >
      <polygon points={areaPoints} fill={color} opacity={0.08} />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
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

function HeroTrendCard({
  eyebrow,
  value,
  trend,
  color,
  caption,
}: {
  eyebrow: string;
  value: string;
  trend: TrendData;
  color: string;
  caption: string;
}) {
  return (
    <div className={`${styles.card} ${styles.cardLg}`}>
      <div className={styles.heroTop}>
        <div>
          <p className={styles.eyebrow}>{eyebrow}</p>
          <p className={styles.heroValue} style={{ color }}>
            {value}
          </p>
          <p className={styles.heroCaption}>{caption}</p>
        </div>
        <DeltaBadge pct={trend.weekOverWeekPct} />
      </div>
      <div className={styles.heroChart}>
        <Sparkline series={trend.series} color={color} />
        <div className={styles.sparklineLabels}>
          <span>{weekdayLabel(trend.series[0]?.day ?? "")}</span>
          <span>
            {weekdayLabel(trend.series[trend.series.length - 1]?.day ?? "")}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- Pipeline rail ------------------------------- */

function PipelineRail({ entries }: { entries: StatusFunnelEntry[] }) {
  const total = entries.reduce((sum, e) => sum + e.count, 0);

  return (
    <div className={styles.card}>
      <div className={styles.pipelineHeader}>
        <h2 className={styles.pipelineTitle}>Invoice Pipeline</h2>
        <span className={styles.pipelineTotal}>
          {total.toLocaleString()} total
        </span>
      </div>

      <div
        className={styles.pipelineBar}
        role="img"
        aria-label={`Invoice pipeline: ${entries.map((e) => `${e.count} ${e.status}`).join(", ")}`}
      >
        {entries.map((e) => {
          const pct = total > 0 ? (e.count / total) * 100 : 0;
          if (pct <= 0) return null;
          return (
            <div
              key={e.status}
              style={{
                width: `${pct}%`,
                backgroundColor: PIPELINE_COLORS[e.status] ?? "#9AA3B2",
              }}
              className={styles.pipelineSegment}
              title={`${e.status}: ${e.count}`}
            />
          );
        })}
      </div>

      <div className={styles.pipelineLegend}>
        {entries.map((e) => (
          <div key={e.status} className={styles.legendItem}>
            <span
              className={styles.legendDot}
              style={{
                backgroundColor: PIPELINE_COLORS[e.status] ?? "#9AA3B2",
              }}
              aria-hidden
            />
            <span className={styles.legendLabel}>
              {PIPELINE_LABELS[e.status] ?? e.status}
            </span>
            <span className={styles.legendCount}>{e.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* --------------------------------- Alert bar ----------------------------------- */

function AlertBar({ items }: { items: { label: string; count: number }[] }) {
  const active = items.filter((i) => i.count > 0);

  if (active.length === 0) {
    return (
      <div className={styles.alertBar}>
        <span className={styles.alertDot} aria-hidden />
        <p className={styles.alertText}>
          No exceptions — everything is moving on schedule.
        </p>
      </div>
    );
  }

  return (
    <div className={`${styles.alertBar} ${styles.alertBarActive}`}>
      {active.map((i) => (
        <div key={i.label} className={styles.alertItem}>
          <span
            className={`${styles.alertDot} ${styles.alertDotActive}`}
            aria-hidden
          />
          <p className={styles.alertItemText}>
            <span className={styles.alertItemCount}>{i.count}</span> {i.label}
          </p>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------- Metric primitives ---------------------------- */

function MetricCard({
  eyebrow,
  value,
  caption,
  tone = "default",
}: {
  eyebrow: string;
  value: string | number;
  caption?: string;
  tone?: "default" | "amber" | "teal" | "coral";
}) {
  const toneClass =
    tone === "amber"
      ? styles.metricValueAmber
      : tone === "teal"
        ? styles.metricValueTeal
        : tone === "coral"
          ? styles.metricValueCoral
          : "";

  return (
    <div className={styles.card}>
      <p className={styles.metricEyebrow}>{eyebrow}</p>
      <p className={`${styles.metricValue} ${toneClass}`}>{value}</p>
      {caption && <p className={styles.metricCaption}>{caption}</p>}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h3 className={styles.sectionLabel}>{children}</h3>;
}

/* -------------------------------- Vehicles section ----------------------------- */

function VehiclesSection({ data }: { data: VehicleMetrics }) {
  return (
    <div>
      <SectionLabel>Vehicle Shipping</SectionLabel>
      <div className={`${styles.metricGrid} ${styles.metricGrid4}`}>
        <MetricCard
          eyebrow="Pending Requests"
          value={data.pendingRequests}
          tone={data.pendingRequests > 0 ? "amber" : "default"}
          caption={data.pendingRequests > 0 ? "needs review" : undefined}
        />
        <MetricCard
          eyebrow="Quotes Sent"
          value={data.quotesSent}
          caption="awaiting customer payment"
        />
        <MetricCard
          eyebrow="Booked This Month"
          value={data.bookedThisMonth}
          tone="teal"
        />
        <MetricCard
          eyebrow="Revenue This Month"
          value={currency.format(data.revenueThisMonth)}
          tone="teal"
        />
      </div>
    </div>
  );
}

/* --------------------------------- Super admin -------------------------------- */

function SuperAdminBoard({ data }: { data: SuperAdminMetrics }) {
  return (
    <div className={styles.stack}>
      <AlertBar
        items={[
          {
            label: "shipments returned to hub, need redispatch",
            count: data.deliveries.returnedToHub,
          },
          {
            label: "containers flagged for tampering",
            count: data.containers.tamperFlagged,
          },
          {
            label: "vehicle quote requests awaiting review",
            count: data.vehicles?.pendingRequests ?? 0,
          },
        ]}
      />

      <div className={styles.grid2}>
        <HeroTrendCard
          eyebrow="Revenue — this month"
          value={currency.format(data.revenue.collectedThisMonth)}
          trend={data.revenue.trend}
          color="var(--color-primary)"
          caption={`${currency.format(data.revenue.outstanding)} outstanding across all invoices`}
        />
        <HeroTrendCard
          eyebrow="Deliveries — 14-day trend"
          value={data.deliveries.deliveredToday.toString()}
          trend={data.deliveries.trend}
          color="var(--success)"
          caption="Delivered today"
        />
      </div>

      <PipelineRail entries={data.statusFunnel} />

      <div>
        <SectionLabel>Containers</SectionLabel>
        <div className={`${styles.metricGrid} ${styles.metricGrid4}`}>
          <MetricCard
            eyebrow="In-Transit"
            value={data.containers.inTransit}
            tone="amber"
          />
          <MetricCard eyebrow="Arrived" value={data.containers.arrived} />
          <MetricCard
            eyebrow="Cleared"
            value={data.containers.cleared}
            tone="teal"
          />
          <MetricCard
            eyebrow="Received At Hub"
            value={data.containers.receivedAtHub}
            tone="teal"
          />
        </div>
      </div>

      <div>
        <SectionLabel>Deliveries</SectionLabel>
        <div className={`${styles.metricGrid} ${styles.metricGrid3}`}>
          <MetricCard
            eyebrow="Out For Delivery"
            value={data.deliveries.outForDelivery}
          />
          <MetricCard
            eyebrow="Returned To Hub"
            value={data.deliveries.returnedToHub}
            tone={data.deliveries.returnedToHub > 0 ? "coral" : "default"}
            caption={
              data.deliveries.returnedToHub > 0 ? "needs redispatch" : undefined
            }
          />
          <MetricCard
            eyebrow="Delivered Today"
            value={data.deliveries.deliveredToday}
            tone="teal"
          />
        </div>
      </div>

      {data.vehicles && <VehiclesSection data={data.vehicles} />}

      <div className={styles.bottomGrid}>
        <div className={styles.card}>
          <SectionLabel>Top Destinations</SectionLabel>
          <ul className={styles.destinationList}>
            {data.topDestinations.length === 0 && (
              <li className={styles.emptyText}>No invoices yet.</li>
            )}
            {data.topDestinations.map((d) => {
              const max = Math.max(
                ...data.topDestinations.map((x) => x.count),
                1,
              );
              const pct = (d.count / max) * 100;
              return (
                <li key={d.city}>
                  <div className={styles.destinationRow}>
                    <span className={styles.destinationCity}>{d.city}</span>
                    <span className={styles.destinationCount}>{d.count}</span>
                  </div>
                  <div className={styles.destinationTrack}>
                    <div
                      className={styles.destinationFill}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <div className={styles.card}>
          <SectionLabel>Recent Activity</SectionLabel>
          <ActivityList
            items={data.recentActivity.map((a) => ({
              key: `${a.invoiceNumber}-${a.changedAt}`,
              invoiceNumber: a.invoiceNumber,
              status: a.status,
              timestamp: a.changedAt,
            }))}
          />
        </div>
      </div>
    </div>
  );
}

/* -------------------------------- Origin admin -------------------------------- */

function OriginAdminBoard({ data }: { data: OriginAdminMetrics }) {
  const pickupFunnel: StatusFunnelEntry[] = [
    { status: "Pending Pickup", count: data.pickups.pendingPickup },
    { status: "Collected", count: data.pickups.collectedToday },
    { status: "Received At Origin", count: data.pickups.receivedAtOrigin },
  ];

  return (
    <div className={styles.stack}>
      <div className={styles.grid2}>
        <HeroTrendCard
          eyebrow="Collected — 14-day trend"
          value={data.pickups.collectedToday.toString()}
          trend={data.pickups.trend}
          color="var(--color-primary)"
          caption="Collected today"
        />
        <div className={`${styles.card} ${styles.cardLg}`}>
          <p className={styles.eyebrow}>Hub Snapshot</p>
          <div className={styles.hubGrid}>
            <div>
              <p
                className={styles.hubStatValue}
                style={{ color: "var(--warning)" }}
              >
                {data.containers.loading}
              </p>
              <p className={styles.hubStatLabel}>Containers loading</p>
            </div>
            <div>
              <p className={styles.hubStatValue}>{data.activeDrivers}</p>
              <p className={styles.hubStatLabel}>Active drivers today</p>
            </div>
          </div>
        </div>
      </div>

      <PipelineRail entries={pickupFunnel} />

      <div>
        <SectionLabel>Pickups</SectionLabel>
        <div className={`${styles.metricGrid} ${styles.metricGrid3}`}>
          <MetricCard
            eyebrow="Pending Pickup"
            value={data.pickups.pendingPickup}
          />
          <MetricCard
            eyebrow="Collected Today"
            value={data.pickups.collectedToday}
            tone="teal"
          />
          <MetricCard
            eyebrow="Received At Origin"
            value={data.pickups.receivedAtOrigin}
            tone="teal"
          />
        </div>
      </div>

      <div>
        <SectionLabel>Containers</SectionLabel>
        <div className={`${styles.metricGrid} ${styles.metricGrid3}`}>
          <MetricCard
            eyebrow="Loading"
            value={data.containers.loading}
            tone="amber"
          />
          <MetricCard
            eyebrow="Opened Today"
            value={data.containers.createdToday}
          />
        </div>
      </div>

      <div className={styles.card}>
        <SectionLabel>Recent Pickups</SectionLabel>
        <ActivityList
          items={data.recentPickups.map((p) => ({
            key: `${p.invoiceNumber}-${p.updatedAt}`,
            invoiceNumber: p.invoiceNumber,
            status: p.status,
            timestamp: p.updatedAt,
            driver: p.pickupDriver ?? undefined,
          }))}
        />
      </div>
    </div>
  );
}

/* ------------------------------ Destination admin ------------------------------ */

function DestinationAdminBoard({ data }: { data: DestinationAdminMetrics }) {
  const deliveryFunnel: StatusFunnelEntry[] = [
    { status: "Arrived", count: data.containers.arrived },
    { status: "Cleared", count: data.containers.cleared },
    { status: "Out For Delivery", count: data.deliveries.outForDelivery },
    { status: "Delivered", count: data.deliveries.deliveredToday },
  ];

  return (
    <div className={styles.stack}>
      <AlertBar
        items={[
          {
            label: "shipments returned to hub, need redispatch",
            count: data.deliveries.returnedToHub,
          },
        ]}
      />

      <div className={styles.grid2}>
        <HeroTrendCard
          eyebrow="Delivered — 14-day trend"
          value={data.deliveries.deliveredToday.toString()}
          trend={data.deliveries.trend}
          color="var(--success)"
          caption="Delivered today"
        />
        <div className={`${styles.card} ${styles.cardLg}`}>
          <p className={styles.eyebrow}>Hub Snapshot</p>
          <div className={styles.hubGrid}>
            <div>
              <p
                className={styles.hubStatValue}
                style={{ color: "var(--warning)" }}
              >
                {data.containers.receivedAtHub}
              </p>
              <p className={styles.hubStatLabel}>Containers at hub</p>
            </div>
            <div>
              <p className={styles.hubStatValue}>{data.activeDrivers}</p>
              <p className={styles.hubStatLabel}>Active drivers today</p>
            </div>
          </div>
        </div>
      </div>

      <PipelineRail entries={deliveryFunnel} />

      <div>
        <SectionLabel>Containers</SectionLabel>
        <div className={`${styles.metricGrid} ${styles.metricGrid3}`}>
          <MetricCard eyebrow="Arrived" value={data.containers.arrived} />
          <MetricCard
            eyebrow="Cleared"
            value={data.containers.cleared}
            tone="teal"
          />
          <MetricCard
            eyebrow="Received At Hub"
            value={data.containers.receivedAtHub}
            tone="teal"
          />
        </div>
      </div>

      <div>
        <SectionLabel>Deliveries</SectionLabel>
        <div className={`${styles.metricGrid} ${styles.metricGrid3}`}>
          <MetricCard
            eyebrow="Out For Delivery"
            value={data.deliveries.outForDelivery}
          />
          <MetricCard
            eyebrow="Returned To Hub"
            value={data.deliveries.returnedToHub}
            tone={data.deliveries.returnedToHub > 0 ? "coral" : "default"}
            caption={
              data.deliveries.returnedToHub > 0 ? "needs redispatch" : undefined
            }
          />
          <MetricCard
            eyebrow="Delivered Today"
            value={data.deliveries.deliveredToday}
            tone="teal"
          />
        </div>
      </div>

      <div className={styles.card}>
        <SectionLabel>Recent Deliveries</SectionLabel>
        <ActivityList
          items={data.recentDeliveries.map((d) => ({
            key: `${d.invoiceNumber}-${d.updatedAt}`,
            invoiceNumber: d.invoiceNumber,
            status: d.status,
            timestamp: d.updatedAt,
            driver: d.deliveryDriver ?? undefined,
          }))}
        />
      </div>
    </div>
  );
}

/* --------------------------------- Shared list --------------------------------- */

function ActivityList({
  items,
}: {
  items: {
    key: string;
    invoiceNumber: string;
    status: string;
    timestamp: string;
    driver?: string;
  }[];
}) {
  if (items.length === 0) {
    return <p className={styles.emptyText}>No recent activity.</p>;
  }

  return (
    <ul className={styles.activityList}>
      {items.map((item) => (
        <li key={item.key} className={styles.activityItem}>
          <div className={styles.activityInfo}>
            <p className={styles.activityInvoice}>{item.invoiceNumber}</p>
            <p className={styles.activityStatus}>
              {item.status}
              {item.driver ? ` · ${item.driver}` : ""}
            </p>
          </div>
          <span className={styles.activityTime}>
            {relativeTime(item.timestamp)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ---------------------------------- States ------------------------------------ */

function LoadingSkeleton() {
  return (
    <div className={styles.skeleton} aria-busy="true" aria-live="polite">
      <div className={styles.grid2}>
        <div className={`${styles.skeletonBlock} ${styles.skeletonHero}`} />
        <div className={`${styles.skeletonBlock} ${styles.skeletonHero}`} />
      </div>
      <div className={`${styles.skeletonBlock} ${styles.skeletonBar}`} />
      <div className={styles.skeletonGrid}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className={`${styles.skeletonBlock} ${styles.skeletonCard}`}
          />
        ))}
      </div>
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
      ? "Your session has expired. Sign in again to view the dashboard."
      : code === 403
        ? "Your account doesn't have access to this dashboard."
        : "Couldn't load dashboard metrics.";

  return (
    <div className={styles.errorCard}>
      <p className={styles.errorText}>{message}</p>
      {code !== 401 && code !== 403 && (
        <button
          type="button"
          onClick={onRetry}
          className="btn btn-outline btn-sm"
        >
          Try again
        </button>
      )}
    </div>
  );
}
