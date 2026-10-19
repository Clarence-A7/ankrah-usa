-- Service zones (single company). `states` is a JSON array of 2-letter codes.
CREATE TABLE `zones` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `states` JSON NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Out-of-zone demand capture from the public wizard.
CREATE TABLE `waitlist_signups` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(255) NULL,
    `phone` VARCHAR(30) NULL,
    `rawAddress` VARCHAR(255) NULL,
    `state` VARCHAR(2) NULL,
    `zip` VARCHAR(20) NULL,
    `zoneCheckResult` VARCHAR(50) NULL,
    `submittedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    INDEX `waitlist_signups_submittedAt_idx`(`submittedAt`),
    INDEX `waitlist_signups_state_idx`(`state`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Admin-set first-mile pickup scheduling on invoices.
ALTER TABLE `invoices`
    ADD COLUMN `scheduledPickupAt` DATETIME(3) NULL,
    ADD COLUMN `scheduledPickupBy` VARCHAR(50) NULL,
    ADD COLUMN `scheduledPickupSetAt` DATETIME(3) NULL;
