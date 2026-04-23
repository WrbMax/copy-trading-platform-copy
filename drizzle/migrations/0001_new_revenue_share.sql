-- Migration: New Revenue Share Mechanism (三线分润：直推奖 + 级别奖 + 平级奖)
-- Date: 2026-04-15
-- Description:
--   1. Add pLevel and umbrellaPerformance columns to users table
--   2. Add rewardType column to revenue_share_records table
--   3. Reset revenueShareRatio default to 0 (legacy field, no longer used in new logic)

-- ─── Users Table: Add P-Level and Umbrella Performance ────────────────────────

ALTER TABLE `users`
  ADD COLUMN `pLevel` INT NOT NULL DEFAULT 0 COMMENT 'P level (0=no level, 1-7=P1-P7)' AFTER `lastPointsRedeemMonth`,
  ADD COLUMN `umbrellaPerformance` DECIMAL(20, 8) NOT NULL DEFAULT 0 COMMENT 'Cumulative umbrella performance (sum of revenue pool consumed by all downstream users) in USDT' AFTER `pLevel`;

-- Update revenueShareRatio default to 0 for new users (legacy field)
ALTER TABLE `users`
  ALTER COLUMN `revenueShareRatio` SET DEFAULT 0;

-- ─── Revenue Share Records: Add Reward Type ──────────────────────────────────

ALTER TABLE `revenue_share_records`
  ADD COLUMN `rewardType` ENUM('direct', 'rank', 'same_rank') NOT NULL DEFAULT 'rank' COMMENT 'Reward type: direct=直推奖, rank=级别奖, same_rank=平级奖' AFTER `level`;

-- ─── Indexes for Performance ──────────────────────────────────────────────────

-- Index for querying valid direct referrals (balance >= 100)
CREATE INDEX `idx_users_referrerId_balance` ON `users` (`referrerId`, `balance`);

-- Index for querying revenue share records by reward type
CREATE INDEX `idx_rsr_recipientId_rewardType` ON `revenue_share_records` (`recipientId`, `rewardType`);

-- Index for umbrella performance lookups
CREATE INDEX `idx_users_pLevel` ON `users` (`pLevel`);
