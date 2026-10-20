-- Track the 60%-deposit Stripe Checkout session alongside the full-payment one,
-- so re-quoting a vehicle request can void BOTH outstanding payment links.
ALTER TABLE `vehicle_quote_requests`
    ADD COLUMN `stripeDepositSessionId` VARCHAR(255) NULL;
