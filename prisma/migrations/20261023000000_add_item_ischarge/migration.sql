-- Distinguish money lines (distance surcharge, sales tax, discount) from
-- physical cargo on an invoice. Charges ride on the invoice for billing but
-- must never appear in a manifest, inflate a piece count, or gate a scan.
-- Existing rows default to cargo (false); the booking flow and a one-off
-- backfill set this to true for the money lines.

-- AlterTable
ALTER TABLE `items` ADD COLUMN `isCharge` BOOLEAN NOT NULL DEFAULT false;
