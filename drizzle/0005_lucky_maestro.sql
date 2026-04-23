CREATE TABLE `deposit_addresses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`address` varchar(128) NOT NULL,
	`derivationIndex` int NOT NULL,
	`network` varchar(32) NOT NULL DEFAULT 'BSC',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `deposit_addresses_id` PRIMARY KEY(`id`),
	CONSTRAINT `deposit_addresses_address_unique` UNIQUE(`address`)
);
--> statement-breakpoint
ALTER TABLE `copy_orders` MODIFY COLUMN `exchange` enum('binance','okx','bybit','bitget','gate') NOT NULL;--> statement-breakpoint
ALTER TABLE `exchange_apis` MODIFY COLUMN `exchange` enum('binance','okx','bybit','bitget','gate') NOT NULL;--> statement-breakpoint
ALTER TABLE `signal_logs` ADD `totalUsers` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `signal_logs` ADD `successCount` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `signal_logs` ADD `failCount` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `signal_logs` ADD `executionTimeMs` int;--> statement-breakpoint
ALTER TABLE `signal_sources` ADD `exchange` varchar(20) DEFAULT 'okx' NOT NULL;--> statement-breakpoint
ALTER TABLE `signal_sources` ADD `passphraseEncrypted` text;