-- Per-item ORIGIN loading tally, so a half-loaded container can be saved and
-- resumed later. Independent of scannedQuantity (destination receive count).
-- Existing rows default to 0.

-- AlterTable
ALTER TABLE `items` ADD COLUMN `loadedQuantity` INTEGER NOT NULL DEFAULT 0;
