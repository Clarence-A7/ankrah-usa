"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import styles from "./pay-success.module.css";

type ConfirmResult = {
  status?: string;
  error?: string;
  invoice?: {
    invoiceNumber: string;
    amountPaid: number;
    amountDue: number;
  };
};

export default function PaySuccessClient() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");

  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<ConfirmResult | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setLoading(false);
      setResult({ error: "Missing payment session reference." });
      return;
    }

    fetch(
      `/api/pay/confirm-balance?session_id=${encodeURIComponent(sessionId)}`,
      {
        cache: "no-store",
      },
    )
      .then((res) => res.json())
      .then((data) => setResult(data))
      .catch(() =>
        setResult({ error: "Network error verifying your payment." }),
      )
      .finally(() => setLoading(false));
  }, [sessionId]);

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        {loading && <p className={styles.status}>Verifying your payment…</p>}

        {!loading && result?.status === "success" && result.invoice && (
          <>
            <div className={styles.icon}>✓</div>
            <h1 className={styles.title}>Payment Received</h1>
            <p className={styles.subtitle}>
              Thank you — your payment has been processed.
            </p>
            <div className={styles.details}>
              <div className={styles.row}>
                <span>Invoice</span>
                <strong>{result.invoice.invoiceNumber}</strong>
              </div>
              <div className={styles.row}>
                <span>Amount Paid</span>
                <strong>${result.invoice.amountPaid.toFixed(2)} USD</strong>
              </div>
              <div className={styles.row}>
                <span>Remaining Balance</span>
                <strong>${result.invoice.amountDue.toFixed(2)} USD</strong>
              </div>
            </div>
            <p className={styles.note}>
              A confirmation email with your updated invoice has been sent to
              you.
            </p>
          </>
        )}

        {!loading && (!result || result.status !== "success") && (
          <>
            <div className={`${styles.icon} ${styles.iconError}`}>!</div>
            <h1 className={styles.title}>
              We Couldn&apos;t Verify Your Payment
            </h1>
            <p className={styles.subtitle}>
              {result?.error ||
                "Please contact support with your payment confirmation."}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
