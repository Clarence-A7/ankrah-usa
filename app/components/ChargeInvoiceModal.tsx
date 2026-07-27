"use client";

import { useState, useEffect, useCallback } from "react";
import styles from "./styles/charge-invoice-modal.module.css";

type Invoice = {
  invoiceNumber: string;
  customerCode: string;
  consignerName: string;
  consignerEmail: string;
  amountDue: number;
  amountPaid: number;
  status: string;
};

type AmountMode = "full" | "custom";

export default function ChargeInvoiceModal({
  onClose,
  onPaymentLinkCreated,
  initialInvoiceNumber,
}: {
  onClose: () => void;
  onPaymentLinkCreated?: () => void;
  initialInvoiceNumber?: string;
}) {
  const [searchInput, setSearchInput] = useState(initialInvoiceNumber ?? "");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [invoice, setInvoice] = useState<Invoice | null>(null);

  const [amountMode, setAmountMode] = useState<AmountMode>("full");
  const [customAmount, setCustomAmount] = useState("");

  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [linkResult, setLinkResult] = useState<{
    url: string;
    amount: number;
  } | null>(null);

  const [emailSending, setEmailSending] = useState(false);
  const [emailStatus, setEmailStatus] = useState<"idle" | "sent" | "error">(
    "idle",
  );
  const [copied, setCopied] = useState(false);

  const [showAddCharge, setShowAddCharge] = useState(false);
  const [chargeDescription, setChargeDescription] = useState("");
  const [chargeAmount, setChargeAmount] = useState("");
  const [addingCharge, setAddingCharge] = useState(false);
  const [addChargeError, setAddChargeError] = useState<string | null>(null);
  const [addChargeSuccess, setAddChargeSuccess] = useState(false);

  function resetForNewInvoice() {
    setLinkResult(null);
    setEmailStatus("idle");
    setCopied(false);
    setShowAddCharge(false);
    setChargeDescription("");
    setChargeAmount("");
    setAddChargeError(null);
    setAddChargeSuccess(false);
    setGenerateError(null);
  }

  const runSearch = useCallback(async (rawValue: string) => {
    const trimmed = rawValue.trim();
    if (!trimmed) return;

    setSearching(true);
    setSearchError(null);
    setInvoice(null);
    resetForNewInvoice();

    try {
      const res = await fetch(
        `/api/admin/payments/lookup-invoice?invoiceNumber=${encodeURIComponent(trimmed)}`,
        {
          cache: "no-store",
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Invoice not found.");
      setInvoice(data.invoice);
      setAmountMode("full");
      setCustomAmount("");
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Invoice not found.");
    } finally {
      setSearching(false);
    }
  }, []);

  // Auto-run the lookup once if this modal was opened from a specific row.
  useEffect(() => {
    if (initialInvoiceNumber) {
      runSearch(initialInvoiceNumber);
    }
    // Only ever intended to run once, on open — not on every prop identity change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    await runSearch(searchInput);
  }

  async function handleAddCharge() {
    if (!invoice) return;
    const amountNum = parseFloat(chargeAmount);
    const description = chargeDescription.trim();

    if (!description) {
      setAddChargeError("Enter a reason for this charge.");
      return;
    }
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setAddChargeError("Enter a valid charge amount.");
      return;
    }

    setAddingCharge(true);
    setAddChargeError(null);
    setAddChargeSuccess(false);

    try {
      const res = await fetch("/api/admin/payments/add-charge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceNumber: invoice.invoiceNumber,
          description,
          amount: amountNum,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add charge.");

      setInvoice({ ...invoice, amountDue: data.amountDue });
      setAddChargeSuccess(true);
      setChargeDescription("");
      setChargeAmount("");
      setAmountMode("full");
      setLinkResult(null);
      setEmailStatus("idle");
    } catch (err) {
      setAddChargeError(
        err instanceof Error ? err.message : "Failed to add charge.",
      );
    } finally {
      setAddingCharge(false);
    }
  }

  async function handleGenerate() {
    if (!invoice) return;
    setGenerating(true);
    setGenerateError(null);
    setLinkResult(null);
    setEmailStatus("idle");
    setCopied(false);

    const amount =
      amountMode === "full" ? invoice.amountDue : parseFloat(customAmount);
    if (amountMode === "custom" && (!Number.isFinite(amount) || amount <= 0)) {
      setGenerateError("Enter a valid amount.");
      setGenerating(false);
      return;
    }

    try {
      const res = await fetch("/api/admin/payments/create-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceNumber: invoice.invoiceNumber, amount }),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error || "Failed to create payment link.");
      setLinkResult({ url: data.url, amount: data.amount });
      onPaymentLinkCreated?.();
    } catch (err) {
      setGenerateError(
        err instanceof Error ? err.message : "Failed to create payment link.",
      );
    } finally {
      setGenerating(false);
    }
  }

  async function handleCopy() {
    if (!linkResult) return;
    try {
      await navigator.clipboard.writeText(linkResult.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can fail silently in some contexts; no action needed.
    }
  }

  async function handleEmail() {
    if (!invoice || !linkResult) return;
    setEmailSending(true);
    setEmailStatus("idle");

    try {
      const res = await fetch("/api/admin/payments/send-link-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceNumber: invoice.invoiceNumber,
          paymentUrl: linkResult.url,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send email.");
      setEmailStatus("sent");
    } catch {
      setEmailStatus("error");
    } finally {
      setEmailSending(false);
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Charge an invoice"
      >
        <div className={styles.header}>
          <div>
            <h2 className={styles.title}>Charge an Invoice</h2>
            <p className={styles.subtitle}>
              Look up an invoice, add charges if needed, and generate a secure
              Stripe payment link.
            </p>
          </div>
          <button
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className={styles.body}>
          <form onSubmit={handleSearch} className={styles.searchForm}>
            <input
              type="text"
              placeholder="Invoice number (e.g. PA73232)"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className={styles.searchInput}
              autoFocus={!initialInvoiceNumber}
            />
            <button
              type="submit"
              disabled={searching}
              className={styles.searchButton}
            >
              {searching ? "Searching…" : "Search"}
            </button>
          </form>

          {searchError && <p className={styles.errorText}>{searchError}</p>}

          {invoice && (
            <div className={styles.invoiceCard}>
              <div className={styles.invoiceHeader}>
                <span className={styles.invoiceNumber}>
                  {invoice.invoiceNumber}
                </span>
                <span className={styles.invoiceStatus}>{invoice.status}</span>
              </div>
              <div className={styles.invoiceRow}>
                <span>Customer</span>
                <strong>{invoice.consignerName}</strong>
              </div>
              <div className={styles.invoiceRow}>
                <span>Email</span>
                <strong>{invoice.consignerEmail}</strong>
              </div>
              <div className={styles.invoiceRow}>
                <span>Amount Paid</span>
                <strong>${invoice.amountPaid.toFixed(2)}</strong>
              </div>
              <div className={styles.invoiceRowHighlight}>
                <span>Balance Due</span>
                <strong>${invoice.amountDue.toFixed(2)}</strong>
              </div>

              <div className={styles.addChargeSection}>
                {!showAddCharge ? (
                  <button
                    type="button"
                    className={styles.addChargeToggle}
                    onClick={() => setShowAddCharge(true)}
                  >
                    + Add a Charge
                  </button>
                ) : (
                  <div className={styles.addChargeBox}>
                    <p className={styles.addChargeLabel}>New charge</p>
                    <input
                      type="text"
                      placeholder="Reason (e.g. Redelivery fee, Damaged packaging)"
                      value={chargeDescription}
                      onChange={(e) => setChargeDescription(e.target.value)}
                      className={styles.chargeDescriptionInput}
                      maxLength={255}
                    />
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      placeholder="Amount (USD)"
                      value={chargeAmount}
                      onChange={(e) => setChargeAmount(e.target.value)}
                      className={styles.chargeAmountInput}
                    />
                    <div className={styles.addChargeActions}>
                      <button
                        type="button"
                        className={styles.addChargeCancelBtn}
                        onClick={() => {
                          setShowAddCharge(false);
                          setChargeDescription("");
                          setChargeAmount("");
                          setAddChargeError(null);
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className={styles.addChargeSubmitBtn}
                        onClick={handleAddCharge}
                        disabled={addingCharge}
                      >
                        {addingCharge ? "Adding…" : "Add Charge"}
                      </button>
                    </div>
                    {addChargeError && (
                      <p className={styles.errorText}>{addChargeError}</p>
                    )}
                    {addChargeSuccess && (
                      <p className={styles.successText}>
                        Charge added — balance updated below.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {invoice.amountDue <= 0 ? (
                <p className={styles.paidNote}>
                  This invoice has no outstanding balance.
                </p>
              ) : (
                <>
                  <div className={styles.amountOptions}>
                    <label className={styles.radioOption}>
                      <input
                        type="radio"
                        checked={amountMode === "full"}
                        onChange={() => setAmountMode("full")}
                      />
                      Charge full balance (${invoice.amountDue.toFixed(2)})
                    </label>
                    <label className={styles.radioOption}>
                      <input
                        type="radio"
                        checked={amountMode === "custom"}
                        onChange={() => setAmountMode("custom")}
                      />
                      Custom amount
                    </label>
                    {amountMode === "custom" && (
                      <input
                        type="number"
                        min="0.01"
                        max={invoice.amountDue}
                        step="0.01"
                        placeholder={`Up to $${invoice.amountDue.toFixed(2)}`}
                        value={customAmount}
                        onChange={(e) => setCustomAmount(e.target.value)}
                        className={styles.customAmountInput}
                      />
                    )}
                  </div>

                  <button
                    onClick={handleGenerate}
                    disabled={generating}
                    className={styles.generateButton}
                  >
                    {generating ? "Generating…" : "Generate Payment Link"}
                  </button>

                  {generateError && (
                    <p className={styles.errorText}>{generateError}</p>
                  )}

                  {linkResult && (
                    <div className={styles.linkResultBox}>
                      <p className={styles.linkResultLabel}>
                        Payment link for ${linkResult.amount.toFixed(2)}:
                      </p>
                      <div className={styles.linkRow}>
                        <input
                          type="text"
                          readOnly
                          value={linkResult.url}
                          className={styles.linkInput}
                        />
                        <button
                          onClick={handleCopy}
                          className={styles.copyButton}
                        >
                          {copied ? "Copied!" : "Copy"}
                        </button>
                      </div>
                      <button
                        onClick={handleEmail}
                        disabled={emailSending}
                        className={styles.emailButton}
                      >
                        {emailSending
                          ? "Sending…"
                          : `Email to ${invoice.consignerEmail}`}
                      </button>
                      {emailStatus === "sent" && (
                        <p className={styles.successText}>
                          Email sent successfully.
                        </p>
                      )}
                      {emailStatus === "error" && (
                        <p className={styles.errorText}>
                          Failed to send email. You can still copy and share the
                          link manually.
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
