-- AlterTable
ALTER TABLE `invoice` ADD COLUMN `balance` DOUBLE NOT NULL DEFAULT 0,
    ADD COLUMN `consignerEmail` VARCHAR(191) NULL,
    ADD COLUMN `consignerPhone` VARCHAR(191) NULL;
