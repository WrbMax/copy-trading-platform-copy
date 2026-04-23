import {
  bigint,
  boolean,
  decimal,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

// ─── Core Users ────────────────────────────────────────────────────────────────
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }).unique(),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  passwordHash: varchar("passwordHash", { length: 256 }),
  inviteCode: varchar("inviteCode", { length: 16 }).unique(),
  referrerId: int("referrerId"),
  balance: decimal("balance", { precision: 20, scale: 8 }).default("0").notNull(),
  points: bigint("points", { mode: "number" }).default(0).notNull(),
  totalProfit: decimal("totalProfit", { precision: 20, scale: 8 }).default("0").notNull(),
  totalLoss: decimal("totalLoss", { precision: 20, scale: 8 }).default("0").notNull(),
  lastPointsRedeemMonth: varchar("lastPointsRedeemMonth", { length: 30 }),
  // ─── New revenue share fields ───
  /** P level (0 = no level, 1-7 = P1-P7), auto-calculated from umbrella performance */
  pLevel: int("pLevel").default(0).notNull(),
  /** Cumulative umbrella performance (sum of revenue pool consumed by all downstream users) in USDT */
  umbrellaPerformance: decimal("umbrellaPerformance", { precision: 20, scale: 8 }).default("0").notNull(),
  // ─── Legacy field kept for backward compatibility (no longer used in new logic) ───
  revenueShareRatio: decimal("revenueShareRatio", { precision: 5, scale: 2 }).default("0").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Email Verification Codes ──────────────────────────────────────────────────
export const emailVerificationCodes = mysqlTable("email_verification_codes", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 320 }).notNull(),
  code: varchar("code", { length: 8 }).notNull(),
  type: mysqlEnum("type", ["register", "login", "reset_password"]).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  used: boolean("used").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── Exchange API Bindings ─────────────────────────────────────────────────────
export const exchangeApis = mysqlTable("exchange_apis", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  exchange: mysqlEnum("exchange", ["binance", "okx", "bybit", "bitget", "gate"]).notNull(),
  label: varchar("label", { length: 64 }),
  apiKeyEncrypted: text("apiKeyEncrypted").notNull(),
  secretKeyEncrypted: text("secretKeyEncrypted").notNull(),
  passphraseEncrypted: text("passphraseEncrypted"),
  isActive: boolean("isActive").default(true).notNull(),
  isVerified: boolean("isVerified").default(false).notNull(),
  lastTestedAt: timestamp("lastTestedAt"),
  testStatus: mysqlEnum("testStatus", ["success", "failed", "pending"]).default("pending"),
  testMessage: text("testMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── Signal Sources ──────────────────────────────────────────────────────────
export const signalSources = mysqlTable("signal_sources", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  symbol: varchar("symbol", { length: 20 }).notNull(),
  tradingPair: varchar("tradingPair", { length: 32 }).notNull(),
  referencePosition: decimal("referencePosition", { precision: 20, scale: 8 }).notNull(),
  expectedMonthlyReturnMin: decimal("expectedMonthlyReturnMin", { precision: 5, scale: 2 }).notNull(),
  expectedMonthlyReturnMax: decimal("expectedMonthlyReturnMax", { precision: 5, scale: 2 }).notNull(),
  description: text("description"),
  apiKeyEncrypted: text("apiKeyEncrypted"),
  apiSecretEncrypted: text("apiSecretEncrypted"),
  webhookSecret: text("webhookSecret"),
  exchange: varchar("exchange", { length: 20 }).default("okx").notNull(),
  passphraseEncrypted: text("passphraseEncrypted"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── User Strategy Subscriptions ──────────────────────────────────────────────
export const userStrategies = mysqlTable("user_strategies", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  signalSourceId: int("signalSourceId").notNull(),
  exchangeApiId: int("exchangeApiId").notNull(),
  multiplier: decimal("multiplier", { precision: 10, scale: 2 }).default("1").notNull(),
  isEnabled: boolean("isEnabled").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── Signal Logs ──────────────────────────────────────────────────────────────
export const signalLogs = mysqlTable("signal_logs", {
  id: int("id").autoincrement().primaryKey(),
  signalSourceId: int("signalSourceId").notNull(),
  action: mysqlEnum("action", ["open_long", "open_short", "close_long", "close_short", "close_all"]).notNull(),
  symbol: varchar("symbol", { length: 20 }).notNull(),
  quantity: decimal("quantity", { precision: 20, scale: 8 }).notNull(),
  price: decimal("price", { precision: 20, scale: 8 }),
  rawPayload: text("rawPayload"),
  processedAt: timestamp("processedAt"),
  totalUsers: int("totalUsers").default(0),
  successCount: int("successCount").default(0),
  failCount: int("failCount").default(0),
  executionTimeMs: int("executionTimeMs"),
  status: mysqlEnum("status", ["pending", "processing", "completed", "failed"]).default("pending").notNull(),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── Copy Trade Orders ─────────────────────────────────────────────────────────
export const copyOrders = mysqlTable("copy_orders", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  signalLogId: int("signalLogId").notNull(),
  signalSourceId: int("signalSourceId").notNull(),
  exchangeApiId: int("exchangeApiId").notNull(),
  exchange: mysqlEnum("exchange", ["binance", "okx", "bybit", "bitget", "gate"]).notNull(),
  symbol: varchar("symbol", { length: 20 }).notNull(),
  action: mysqlEnum("action", ["open_long", "open_short", "close_long", "close_short", "close_all"]).notNull(),
  multiplier: decimal("multiplier", { precision: 10, scale: 2 }).notNull(),
  signalQuantity: decimal("signalQuantity", { precision: 20, scale: 8 }).notNull(),
  actualQuantity: decimal("actualQuantity", { precision: 20, scale: 8 }).notNull(),
  openPrice: decimal("openPrice", { precision: 20, scale: 8 }),
  closePrice: decimal("closePrice", { precision: 20, scale: 8 }),
  openTime: timestamp("openTime"),
  closeTime: timestamp("closeTime"),
  exchangeOrderId: varchar("exchangeOrderId", { length: 128 }),
  closeOrderId: varchar("closeOrderId", { length: 128 }),
  realizedPnl: decimal("realizedPnl", { precision: 20, scale: 8 }),
  fee: decimal("fee", { precision: 20, scale: 8 }),
  netPnl: decimal("netPnl", { precision: 20, scale: 8 }),
  revenueShareDeducted: decimal("revenueShareDeducted", { precision: 20, scale: 8 }).default("0"),
  status: mysqlEnum("status", ["pending", "open", "closed", "failed", "cancelled"]).default("pending").notNull(),
  errorMessage: text("errorMessage"),
  isAbnormal: boolean("isAbnormal").default(false).notNull(),
  abnormalNote: text("abnormalNote"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── Revenue Share Records ─────────────────────────────────────────────────────
export const revenueShareRecords = mysqlTable("revenue_share_records", {
  id: int("id").autoincrement().primaryKey(),
  copyOrderId: int("copyOrderId").notNull(),
  traderId: int("traderId").notNull(),
  recipientId: int("recipientId").notNull(),
  level: int("level").notNull(),
  /** Reward type: direct = 直推奖, rank = 级别奖, same_rank = 平级奖 */
  rewardType: mysqlEnum("rewardType", ["direct", "rank", "same_rank"]).default("rank").notNull(),
  traderPnl: decimal("traderPnl", { precision: 20, scale: 8 }).notNull(),
  ratio: decimal("ratio", { precision: 5, scale: 2 }).notNull(),
  amount: decimal("amount", { precision: 20, scale: 8 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── Deposit Addresses (HD Wallet derived) ────────────────────────────────────
export const depositAddresses = mysqlTable("deposit_addresses", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  address: varchar("address", { length: 128 }).notNull().unique(),
  derivationIndex: int("derivationIndex").notNull(),
  network: varchar("network", { length: 32 }).default("BSC").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── Deposits ─────────────────────────────────────────────────────────────────
export const deposits = mysqlTable("deposits", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  amount: decimal("amount", { precision: 20, scale: 8 }).notNull(),
  txHash: varchar("txHash", { length: 128 }),
  fromAddress: varchar("fromAddress", { length: 128 }),
  toAddress: varchar("toAddress", { length: 128 }),
  proofNote: text("proofNote"),
  status: mysqlEnum("status", ["pending", "approved", "rejected"]).default("pending").notNull(),
  reviewedBy: int("reviewedBy"),
  reviewNote: text("reviewNote"),
  reviewedAt: timestamp("reviewedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── Withdrawals ──────────────────────────────────────────────────────────────
export const withdrawals = mysqlTable("withdrawals", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  amount: decimal("amount", { precision: 20, scale: 8 }).notNull(),
  fee: decimal("fee", { precision: 20, scale: 8 }).default("0").notNull(),
  netAmount: decimal("netAmount", { precision: 20, scale: 8 }).notNull(),
  toAddress: varchar("toAddress", { length: 128 }).notNull(),
  network: varchar("network", { length: 32 }).default("BSC").notNull(),
  txHash: varchar("txHash", { length: 128 }),
  status: mysqlEnum("status", ["pending", "approved", "rejected", "processing", "completed"]).default("pending").notNull(),
  reviewedBy: int("reviewedBy"),
  reviewNote: text("reviewNote"),
  reviewedAt: timestamp("reviewedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── Fund Transactions (ledger) ────────────────────────────────────────────────
export const fundTransactions = mysqlTable("fund_transactions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  type: mysqlEnum("type", ["deposit", "withdrawal", "revenue_share_in", "revenue_share_out", "admin_adjust"]).notNull(),
  amount: decimal("amount", { precision: 20, scale: 8 }).notNull(),
  balanceAfter: decimal("balanceAfter", { precision: 20, scale: 8 }).notNull(),
  relatedId: int("relatedId"),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── Points Transactions ───────────────────────────────────────────────────────
export const pointsTransactions = mysqlTable("points_transactions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  type: mysqlEnum("type", ["redeem", "transfer_out", "transfer_in", "admin_add", "admin_deduct"]).notNull(),
  amount: bigint("amount", { mode: "number" }).notNull(),
  balanceAfter: bigint("balanceAfter", { mode: "number" }).notNull(),
  relatedUserId: int("relatedUserId"),
  note: text("note"),
  redeemMonth: varchar("redeemMonth", { length: 7 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── System Config ─────────────────────────────────────────────────────────────
export const systemConfig = mysqlTable("system_config", {
  id: int("id").autoincrement().primaryKey(),
  key: varchar("key", { length: 64 }).notNull().unique(),
  value: text("value").notNull(),
  description: text("description"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
