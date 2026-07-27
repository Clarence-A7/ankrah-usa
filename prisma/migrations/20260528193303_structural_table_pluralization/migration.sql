/*
  Warnings:

  - You are about to drop the `container` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `invoice` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `item` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `user` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `invoice` DROP FOREIGN KEY `Invoice_containerId_fkey`;

-- DropForeignKey
ALTER TABLE `item` DROP FOREIGN KEY `Item_invoiceId_fkey`;

-- DropTable
DROP TABLE `container`;

-- DropTable
DROP TABLE `invoice`;

-- DropTable
DROP TABLE `item`;

-- DropTable
DROP TABLE `user`;

-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `password` VARCHAR(191) NOT NULL,
    `role` ENUM('super_admin', 'origin_admin', 'destination_admin') NOT NULL DEFAULT 'origin_admin',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `containers` (
    `id` VARCHAR(191) NOT NULL,
    `size` INTEGER NOT NULL,
    `vessel` VARCHAR(191) NOT NULL,
    `departureDate` DATETIME(3) NOT NULL,
    `eta` DATETIME(3) NOT NULL,
    `shippingLine` VARCHAR(191) NOT NULL,
    `sealNumber` VARCHAR(191) NOT NULL,
    `originCity` VARCHAR(191) NOT NULL,
    `destinationCity` VARCHAR(191) NOT NULL,
    `status` ENUM('Booked', 'Collected', 'Containerized', 'In-Transit', 'Arrived', 'Cleared', 'Delivered') NOT NULL DEFAULT 'Booked',
    `loadedBy` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `containers_sealNumber_key`(`sealNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `invoices` (
    `id` VARCHAR(191) NOT NULL,
    `invoiceNumber` VARCHAR(191) NOT NULL,
    `consigner` VARCHAR(191) NOT NULL,
    `consignee` VARCHAR(191) NOT NULL,
    `destinationCity` VARCHAR(191) NOT NULL,
    `contact` VARCHAR(191) NOT NULL,
    `amountDue` DECIMAL(10, 2) NOT NULL,
    `amountCollected` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `loadStatus` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `containerId` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `invoices_invoiceNumber_key`(`invoiceNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `items` (
    `id` VARCHAR(191) NOT NULL,
    `itemType` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `invoiceId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_containerId_fkey` FOREIGN KEY (`containerId`) REFERENCES `containers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `items` ADD CONSTRAINT `items_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `invoices`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
