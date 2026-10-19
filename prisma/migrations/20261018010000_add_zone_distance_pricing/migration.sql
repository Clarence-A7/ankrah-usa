-- Per-zone distance surcharge config (free-mile threshold + per-mile rate).
-- Defaults match the former global rule: 20 free miles, then $2.00/mile.
ALTER TABLE `zones`
    ADD COLUMN `freeMiles` DECIMAL(6, 1) NOT NULL DEFAULT 20,
    ADD COLUMN `perMile` DECIMAL(8, 2) NOT NULL DEFAULT 2.00;
