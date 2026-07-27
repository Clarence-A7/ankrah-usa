/*
  Warnings:

  - You are about to alter the column `status` on the `containers` table. The data in that column could be lost. The data in that column will be cast from `Enum(EnumId(1))` to `Enum(EnumId(1))`.
  - You are about to drop the column `amountCollected` on the `invoices` table. All the data in the column will be lost.
  - You are about to drop the column `consignee` on the `invoices` table. All the data in the column will be lost.
  - You are about to drop the column `consigner` on the `invoices` table. All the data in the column will be lost.
  - You are about to drop the column `contact` on the `invoices` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[staffId]` on the table `users` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `consigneeName` to the `invoices` table without a default value. This is not possible if the table is not empty.
  - Added the required column `consigneePhone` to the `invoices` table without a default value. This is not possible if the table is not empty.
  - Added the required column `consignerEmail` to the `invoices` table without a default value. This is not possible if the table is not empty.
  - Added the required column `consignerName` to the `invoices` table without a default value. This is not possible if the table is not empty.
  - Added the required column `consignerPhone` to the `invoices` table without a default value. This is not possible if the table is not empty.
  - Added the required column `status` to the `invoices` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `containers` ADD COLUMN `arrivedAt` DATETIME(3) NULL,
    ADD COLUMN `arrivedById` VARCHAR(191) NULL,
    ADD COLUMN `clearedAt` DATETIME(0) NULL,
    ADD COLUMN `clearedById` VARCHAR(191) NULL,
    ADD COLUMN `sealVerifiedAt` DATETIME(0) NULL,
    ADD COLUMN `tamperFlagged` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `unstuffedAt` DATETIME(3) NULL,
    MODIFY `status` ENUM('In-Transit', 'Arrived', 'Cleared', 'Received At Hub') NULL;

-- AlterTable
ALTER TABLE `invoices` DROP COLUMN `amountCollected`,
    DROP COLUMN `consignee`,
    DROP COLUMN `consigner`,
    DROP COLUMN `contact`,
    ADD COLUMN `amountPaid` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    ADD COLUMN `consigneeName` VARCHAR(191) NOT NULL,
    ADD COLUMN `consigneePhone` VARCHAR(191) NOT NULL,
    ADD COLUMN `consignerEmail` VARCHAR(191) NOT NULL,
    ADD COLUMN `consignerName` VARCHAR(191) NOT NULL,
    ADD COLUMN `consignerPhone` VARCHAR(191) NOT NULL,
    ADD COLUMN `customerCode` VARCHAR(50) NULL DEFAULT 'GUEST',
    ADD COLUMN `deliveredAt` DATETIME(3) NULL,
    ADD COLUMN `deliveryDriver` VARCHAR(50) NULL,
    ADD COLUMN `dispatchedAt` DATETIME(3) NULL,
    ADD COLUMN `pickupCity` VARCHAR(100) NULL,
    ADD COLUMN `pickupDriver` VARCHAR(50) NULL,
    ADD COLUMN `pickupState` VARCHAR(100) NULL,
    ADD COLUMN `pickupStreet` VARCHAR(191) NULL,
    ADD COLUMN `pickupZip` VARCHAR(20) NULL,
    ADD COLUMN `shipmentMode` VARCHAR(20) NULL,
    ADD COLUMN `status` VARCHAR(191) NOT NULL,
    MODIFY `containerId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `items` ADD COLUMN `scannedQuantity` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `users` ADD COLUMN `staffId` VARCHAR(191) NULL,
    MODIFY `role` ENUM('super_admin', 'origin_admin', 'destination_admin', 'o_driver', 'd_driver') NOT NULL DEFAULT 'origin_admin';

-- CreateTable
CREATE TABLE `rates` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `itemName` VARCHAR(120) NOT NULL,
    `basePrice` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `created_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `itemName`(`itemName`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `customers` (
    `id` VARCHAR(191) NOT NULL,
    `customerCode` VARCHAR(20) NOT NULL,
    `firstName` VARCHAR(100) NOT NULL,
    `lastName` VARCHAR(100) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(255) NOT NULL,
    `token` VARCHAR(255) NULL,
    `phone` VARCHAR(20) NOT NULL,
    `streetAddress` VARCHAR(255) NULL,
    `city` VARCHAR(100) NULL,
    `state` VARCHAR(50) NULL,
    `zipCode` VARCHAR(20) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Customer_customerCode_key`(`customerCode`),
    UNIQUE INDEX `Customer_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `statushistory` (
    `id` VARCHAR(191) NOT NULL,
    `invoiceId` VARCHAR(191) NOT NULL,
    `status` VARCHAR(50) NOT NULL,
    `changedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_statusHistory_invoice`(`invoiceId`),
    INDEX `idx_statusHistory_invoice_created`(`invoiceId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `invoices_deliveryDriver_idx` ON `invoices`(`deliveryDriver`);

-- CreateIndex
CREATE INDEX `invoices_assignedDriver_idx` ON `invoices`(`pickupDriver`);

-- CreateIndex
CREATE UNIQUE INDEX `staffId` ON `users`(`staffId`);

-- AddForeignKey
ALTER TABLE `statushistory` ADD CONSTRAINT `fk_statusHistory_invoice` FOREIGN KEY (`invoiceId`) REFERENCES `invoices`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;
