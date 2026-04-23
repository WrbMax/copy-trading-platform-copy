CREATE TABLE `copy_orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`signalLogId` int NOT NULL,
	`signalSourceId` int NOT NULL,
	`exchangeApiId` int NOT NULL,
	`exchange` enum('binance','okx') NOT NULL,
	`symbol` varchar(20) NOT NULL,
	`action` enum('open_long','open_short','close_long','close_short','close_all') NOT NULL,
	`multiplier` decimal(10,2) NOT NULL,
	`signalQuantity` decimal(20,8) NOT NULL,
	`actualQuantity` decimal(20,8) NOT NULL,
	`openPrice` decimal(20,8),
	`closePrice` decimal(20,8),
	`openTime` timestamp,
	`closeTime` timestamp,
	`exchangeOrderId` varchar(128),
	`closeOrderId` varchar(128),
	`realizedPnl` decimal(20,8),
	`fee` decimal(20,8),
	`netPnl` decimal(20,8),
	`revenueShareDeducted` decimal(20,8) DEFAULT '0',
	`status` enum('pending','open','closed','failed','cancelled') NOT NULL DEFAULT 'pending',
	`errorMessage` text,
	`isAbnormal` boolean NOT NULL DEFAULT false,
	`abnormalNote` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `copy_orders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `deposits` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`amount` decimal(20,8) NOT NULL,
	`txHash` varchar(128),
	`fromAddress` varchar(128),
	`toAddress` varchar(128),
	`proofNote` text,
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`reviewedBy` int,
	`reviewNote` text,
	`reviewedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `deposits_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `email_verification_codes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(320) NOT NULL,
	`code` varchar(8) NOT NULL,
	`type` enum('register','login','reset_password') NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`used` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `email_verification_codes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `exchange_apis` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`exchange` enum('binance','okx') NOT NULL,
	`label` varchar(64),
	`apiKeyEncrypted` text NOT NULL,
	`secretKeyEncrypted` text NOT NULL,
	`passphraseEncrypted` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`isVerified` boolean NOT NULL DEFAULT false,
	`lastTestedAt` timestamp,
	`testStatus` enum('success','failed','pending') DEFAULT 'pending',
	`testMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `exchange_apis_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fund_transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`type` enum('deposit','withdrawal','revenue_share_in','revenue_share_out','admin_adjust') NOT NULL,
	`amount` decimal(20,8) NOT NULL,
	`balanceAfter` decimal(20,8) NOT NULL,
	`relatedId` int,
	`note` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `fund_transactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `points_transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`type` enum('redeem','transfer_out','transfer_in','admin_add','admin_deduct') NOT NULL,
	`amount` bigint NOT NULL,
	`balanceAfter` bigint NOT NULL,
	`relatedUserId` int,
	`note` text,
	`redeemMonth` varchar(7),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `points_transactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `revenue_share_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`copyOrderId` int NOT NULL,
	`traderId` int NOT NULL,
	`recipientId` int NOT NULL,
	`level` int NOT NULL,
	`traderPnl` decimal(20,8) NOT NULL,
	`ratio` decimal(5,2) NOT NULL,
	`amount` decimal(20,8) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `revenue_share_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `signal_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`signalSourceId` int NOT NULL,
	`action` enum('open_long','open_short','close_long','close_short','close_all') NOT NULL,
	`symbol` varchar(20) NOT NULL,
	`quantity` decimal(20,8) NOT NULL,
	`price` decimal(20,8),
	`rawPayload` text,
	`processedAt` timestamp,
	`status` enum('pending','processing','completed','failed') NOT NULL DEFAULT 'pending',
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `signal_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `signal_sources` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`symbol` varchar(20) NOT NULL,
	`tradingPair` varchar(32) NOT NULL,
	`referencePosition` decimal(20,8) NOT NULL,
	`expectedMonthlyReturnMin` decimal(5,2) NOT NULL,
	`expectedMonthlyReturnMax` decimal(5,2) NOT NULL,
	`description` text,
	`apiKeyEncrypted` text,
	`apiSecretEncrypted` text,
	`webhookSecret` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `signal_sources_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `system_config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`key` varchar(64) NOT NULL,
	`value` text NOT NULL,
	`description` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `system_config_id` PRIMARY KEY(`id`),
	CONSTRAINT `system_config_key_unique` UNIQUE(`key`)
);
--> statement-breakpoint
CREATE TABLE `user_strategies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`signalSourceId` int NOT NULL,
	`exchangeApiId` int NOT NULL,
	`multiplier` decimal(10,2) NOT NULL DEFAULT '1',
	`isEnabled` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_strategies_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `withdrawals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`amount` decimal(20,8) NOT NULL,
	`fee` decimal(20,8) NOT NULL DEFAULT '0',
	`netAmount` decimal(20,8) NOT NULL,
	`toAddress` varchar(128) NOT NULL,
	`network` varchar(32) NOT NULL DEFAULT 'BSC',
	`txHash` varchar(128),
	`status` enum('pending','approved','rejected','processing','completed') NOT NULL DEFAULT 'pending',
	`reviewedBy` int,
	`reviewNote` text,
	`reviewedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `withdrawals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `passwordHash` varchar(256);--> statement-breakpoint
ALTER TABLE `users` ADD `inviteCode` varchar(16);--> statement-breakpoint
ALTER TABLE `users` ADD `referrerId` int;--> statement-breakpoint
ALTER TABLE `users` ADD `balance` decimal(20,8) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `points` bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `totalProfit` decimal(20,8) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `totalLoss` decimal(20,8) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `lastPointsRedeemMonth` varchar(7);--> statement-breakpoint
ALTER TABLE `users` ADD `revenueShareRatio` decimal(5,2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `isActive` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_email_unique` UNIQUE(`email`);--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_inviteCode_unique` UNIQUE(`inviteCode`);