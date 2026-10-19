-- Global key/value settings, shared between the Next.js admin and the PHP
-- pickup endpoints. First use: the pickup hub origin (hub_address/hub_lat/hub_lng).
CREATE TABLE `app_settings` (
    `key` VARCHAR(64) NOT NULL,
    `value` TEXT NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    PRIMARY KEY (`key`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;
