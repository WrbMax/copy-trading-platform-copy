import { and, desc, eq, gte, lt, ne, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  copyOrders,
  deposits,
  emailVerificationCodes,
  exchangeApis,
  fundTransactions,
  pointsTransactions,
  revenueShareRecords,
  signalLogs,
  signalSources,
  systemConfig,
  userStrategies,
  users,
  withdrawals,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Users ─────────────────────────────────────────────────────────────────────
export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  type TextField = (typeof textFields)[number];
  const assignNullable = (field: TextField) => {
    const value = user[field];
    if (value === undefined) return;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  };
  textFields.forEach(assignNullable);
  if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
  if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
  else if (user.openId === ENV.ownerOpenId) { values.role = "admin"; updateSet.role = "admin"; }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserByInviteCode(inviteCode: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.inviteCode, inviteCode)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createEmailUser(data: {
  email: string;
  passwordHash: string;
  name: string;
  inviteCode: string;
  referrerId?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const openId = `email_${data.email}_${Date.now()}`;
  await db.insert(users).values({
    openId,
    email: data.email,
    name: data.name,
    passwordHash: data.passwordHash,
    inviteCode: data.inviteCode,
    referrerId: data.referrerId,
    loginMethod: "email",
    role: "user",
    lastSignedIn: new Date(),
  });
  return getUserByEmail(data.email);
}

export async function updateUser(id: number, data: Partial<InsertUser>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set(data).where(eq(users.id, id));
}

export async function listUsers(page = 1, limit = 20) {
  const db = await getDb();
  if (!db) return { items: [], total: 0 };
  const offset = (page - 1) * limit;
  const items = await db.select().from(users).orderBy(desc(users.createdAt)).limit(limit).offset(offset);
  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(users);
  return { items, total: Number(count) };
}

export async function getAdminUser() {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(users).where(eq(users.role, "admin")).limit(1);
  return result[0] ?? null;
}

export async function getUserReferralChain(userId: number): Promise<Array<{ id: number; revenueShareRatio: string }>> {
  const db = await getDb();
  if (!db) return [];
  const chain: Array<{ id: number; revenueShareRatio: string }> = [];
  // Start from the trader's direct referrer and walk up the tree
  const trader = await getUserById(userId);
  if (!trader || !trader.referrerId) return [];
  let currentReferrerId: number | null | undefined = trader.referrerId;
  const visited = new Set<number>();
  while (currentReferrerId) {
    if (visited.has(currentReferrerId)) break;
    visited.add(currentReferrerId);
    const ancestor = await getUserById(currentReferrerId);
    if (!ancestor) break;
    chain.push({ id: ancestor.id, revenueShareRatio: ancestor.revenueShareRatio });
    currentReferrerId = ancestor.referrerId ?? null;
  }
  return chain;
}

// ─── Email Verification ────────────────────────────────────────────────────────
export async function createVerificationCode(email: string, type: "register" | "login" | "reset_password", code: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  await db.insert(emailVerificationCodes).values({ email, code, type, expiresAt });
}

export async function verifyCode(email: string, code: string, type: "register" | "login" | "reset_password") {
  const db = await getDb();
  if (!db) return false;
  const now = new Date();
  const result = await db.select().from(emailVerificationCodes)
    .where(and(
      eq(emailVerificationCodes.email, email),
      eq(emailVerificationCodes.code, code),
      eq(emailVerificationCodes.type, type),
      eq(emailVerificationCodes.used, false),
      gte(emailVerificationCodes.expiresAt, now)
    )).limit(1);
  if (result.length === 0) return false;
  await db.update(emailVerificationCodes).set({ used: true }).where(eq(emailVerificationCodes.id, result[0].id));
  return true;
}

// ─── Exchange APIs ─────────────────────────────────────────────────────────────
export async function getExchangeApisByUserId(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(exchangeApis).where(eq(exchangeApis.userId, userId)).orderBy(desc(exchangeApis.createdAt));
}

export async function getExchangeApiById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(exchangeApis).where(eq(exchangeApis.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createExchangeApi(data: {
  userId: number;
  exchange: "binance" | "okx" | "bybit" | "bitget" | "gate";
  label?: string;
  apiKeyEncrypted: string;
  secretKeyEncrypted: string;
  passphraseEncrypted?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(exchangeApis).values(data);
}

export async function updateExchangeApi(id: number, data: Partial<typeof exchangeApis.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(exchangeApis).set(data).where(eq(exchangeApis.id, id));
}

export async function deleteExchangeApi(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(exchangeApis).where(eq(exchangeApis.id, id));
}

// ─── Signal Sources ────────────────────────────────────────────────────────────
export async function listSignalSources(activeOnly = false) {
  const db = await getDb();
  if (!db) return [];
  if (activeOnly) return db.select().from(signalSources).where(eq(signalSources.isActive, true));
  return db.select().from(signalSources).orderBy(desc(signalSources.createdAt));
}

export async function getSignalSourceById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(signalSources).where(eq(signalSources.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createSignalSource(data: typeof signalSources.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(signalSources).values(data);
}

export async function updateSignalSource(id: number, data: Partial<typeof signalSources.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(signalSources).set(data).where(eq(signalSources.id, id));
}

// ─── User Strategies ───────────────────────────────────────────────────────────
export async function getUserStrategies(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(userStrategies).where(eq(userStrategies.userId, userId));
}

export async function getUserStrategy(userId: number, signalSourceId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(userStrategies)
    .where(and(eq(userStrategies.userId, userId), eq(userStrategies.signalSourceId, signalSourceId))).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function upsertUserStrategy(data: typeof userStrategies.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await getUserStrategy(data.userId!, data.signalSourceId!);
  if (existing) {
    await db.update(userStrategies).set(data).where(eq(userStrategies.id, existing.id));
  } else {
    await db.insert(userStrategies).values(data);
  }
}

export async function disableAllUserStrategies(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(userStrategies).set({ isEnabled: false }).where(eq(userStrategies.userId, userId));
}

export async function getEnabledStrategiesForSignal(signalSourceId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(userStrategies)
    .where(and(eq(userStrategies.signalSourceId, signalSourceId), eq(userStrategies.isEnabled, true)));
}

// ─── Signal Logs ──────────────────────────────────────────────────────────────
export async function createSignalLog(data: typeof signalLogs.$inferInsert): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(signalLogs).values(data);
  return result[0].insertId;
}

export async function updateSignalLog(id: number, data: Partial<typeof signalLogs.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(signalLogs).set(data).where(eq(signalLogs.id, id));
}

export async function listSignalLogs(signalSourceId?: number, page = 1, limit = 20) {
  const db = await getDb();
  if (!db) return { items: [], total: 0 };
  const offset = (page - 1) * limit;
  const where = signalSourceId ? eq(signalLogs.signalSourceId, signalSourceId) : undefined;
  const items = where
    ? await db.select().from(signalLogs).where(where).orderBy(desc(signalLogs.createdAt)).limit(limit).offset(offset)
    : await db.select().from(signalLogs).orderBy(desc(signalLogs.createdAt)).limit(limit).offset(offset);
  const countQuery = where
    ? await db.select({ count: sql<number>`count(*)` }).from(signalLogs).where(where)
    : await db.select({ count: sql<number>`count(*)` }).from(signalLogs);
  return { items, total: Number(countQuery[0].count) };
}

// ─── Copy Orders ──────────────────────────────────────────────────────────────
export async function createCopyOrder(data: typeof copyOrders.$inferInsert): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(copyOrders).values(data).$returningId();
  return result.id;
}

export async function updateCopyOrder(id: number, data: Partial<typeof copyOrders.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(copyOrders).set(data).where(eq(copyOrders.id, id));
}

export async function findUserOpenOrder(userId: number, symbol: string, action: string) {
  const db = await getDb();
  if (!db) return null;
  // For close_long, find the matching open_long order; for close_short, find open_short
  const openAction = action === "close_long" || action === "reduce_long" ? "open_long" : "open_short";
  const results = await db.select().from(copyOrders).where(
    and(
      eq(copyOrders.userId, userId),
      eq(copyOrders.symbol, symbol),
      eq(copyOrders.action, openAction),
      eq(copyOrders.status, "open")
    )
  ).orderBy(desc(copyOrders.createdAt)).limit(1);
  return results[0] || null;
}

export async function listCopyOrdersBySignalLog(signalLogId: number, userId?: number) {
  const db = await getDb();
  if (!db) return [];
  const conditions = userId
    ? and(eq(copyOrders.signalLogId, signalLogId), eq(copyOrders.userId, userId))
    : eq(copyOrders.signalLogId, signalLogId);
  return db.select().from(copyOrders).where(conditions).orderBy(desc(copyOrders.createdAt));
}

export async function listCopyOrders(userId?: number, page = 1, limit = 20) {
  const db = await getDb();
  if (!db) return { items: [], total: 0 };
  const offset = (page - 1) * limit;
  // Filter out cancelled orders — they are cleaned-up duplicates not meant for user display
  const notCancelled = ne(copyOrders.status, "cancelled");
  const where = userId
    ? and(eq(copyOrders.userId, userId), notCancelled)
    : notCancelled;
  const items = await db.select().from(copyOrders).where(where).orderBy(desc(copyOrders.createdAt)).limit(limit).offset(offset);
  const countQuery = await db.select({ count: sql<number>`count(*)` }).from(copyOrders).where(where);
  return { items, total: Number(countQuery[0].count) };
}

export async function listAllCopyOrdersWithUser(page = 1, limit = 30) {
  const db = await getDb();
  if (!db) return { items: [], total: 0 };
  const offset = (page - 1) * limit;
  const items = await db
    .select({
      id: copyOrders.id,
      userId: copyOrders.userId,
      userName: users.name,
      signalSourceId: copyOrders.signalSourceId,
      exchange: copyOrders.exchange,
      symbol: copyOrders.symbol,
      action: copyOrders.action,
      multiplier: copyOrders.multiplier,
      signalQuantity: copyOrders.signalQuantity,
      actualQuantity: copyOrders.actualQuantity,
      openPrice: copyOrders.openPrice,
      closePrice: copyOrders.closePrice,
      openTime: copyOrders.openTime,
      closeTime: copyOrders.closeTime,
      exchangeOrderId: copyOrders.exchangeOrderId,
      realizedPnl: copyOrders.realizedPnl,
      fee: copyOrders.fee,
      netPnl: copyOrders.netPnl,
      status: copyOrders.status,
      errorMessage: copyOrders.errorMessage,
      isAbnormal: copyOrders.isAbnormal,
      abnormalNote: copyOrders.abnormalNote,
      createdAt: copyOrders.createdAt,
      signalSourceName: signalSources.name,
    })
    .from(copyOrders)
    .leftJoin(users, eq(copyOrders.userId, users.id))
    .leftJoin(signalSources, eq(copyOrders.signalSourceId, signalSources.id))
    .where(ne(copyOrders.status, "cancelled"))
    .orderBy(desc(copyOrders.createdAt))
    .limit(limit)
    .offset(offset);
  const countQuery = await db.select({ count: sql<number>`count(*)` }).from(copyOrders).where(ne(copyOrders.status, "cancelled"));
  return { items, total: Number(countQuery[0].count) };
}

export async function getUserOrderStats(userId: number) {
  const db = await getDb();
  if (!db) return { totalProfit: 0, totalLoss: 0, netPnl: 0, totalOrders: 0, openOrders: 0 };
  // Only count open_long/open_short orders to avoid double-counting
  // (close orders share the same PnL as their paired open orders)
  const result = await db.select({
    totalProfit: sql<string>`COALESCE(SUM(CASE WHEN netPnl > 0 THEN netPnl ELSE 0 END), 0)`,
    totalLoss: sql<string>`COALESCE(SUM(CASE WHEN netPnl < 0 THEN ABS(netPnl) ELSE 0 END), 0)`,
    totalOrders: sql<number>`COUNT(*)`,
    openOrders: sql<number>`SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END)`,
  }).from(copyOrders).where(
    and(
      eq(copyOrders.userId, userId),
      ne(copyOrders.status, "cancelled"),
      // Only count open orders to avoid double-counting PnL with close orders
      sql`action IN ('open_long', 'open_short')`
    )
  );
  const row = result[0];
  const totalProfit = parseFloat(row.totalProfit || "0");
  const totalLoss = parseFloat(row.totalLoss || "0");
  return { totalProfit, totalLoss, netPnl: totalProfit - totalLoss, totalOrders: Number(row.totalOrders), openOrders: Number(row.openOrders) };
}

// ─── Revenue Share ─────────────────────────────────────────────────────────────
export async function createRevenueShareRecords(records: typeof revenueShareRecords.$inferInsert[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (records.length === 0) return;
  await db.insert(revenueShareRecords).values(records);
}

export async function listRevenueShareRecords(userId?: number, page = 1, limit = 20) {
  const db = await getDb();
  if (!db) return { items: [], total: 0 };
  const offset = (page - 1) * limit;
  const where = userId ? eq(revenueShareRecords.recipientId, userId) : undefined;
  const items = where
    ? await db.select().from(revenueShareRecords).where(where).orderBy(desc(revenueShareRecords.createdAt)).limit(limit).offset(offset)
    : await db.select().from(revenueShareRecords).orderBy(desc(revenueShareRecords.createdAt)).limit(limit).offset(offset);
  const countQuery = where
    ? await db.select({ count: sql<number>`count(*)` }).from(revenueShareRecords).where(where)
    : await db.select({ count: sql<number>`count(*)` }).from(revenueShareRecords);
  return { items, total: Number(countQuery[0].count) };
}

export async function getUserRevenueShareStats(userId: number) {
  const db = await getDb();
  if (!db) return { totalReceived: 0, totalDeducted: 0 };
  const received = await db.select({ total: sql<string>`COALESCE(SUM(amount), 0)` })
    .from(revenueShareRecords).where(eq(revenueShareRecords.recipientId, userId));
  const deducted = await db.select({ total: sql<string>`COALESCE(SUM(revenueShareDeducted), 0)` })
    .from(copyOrders).where(eq(copyOrders.userId, userId));
  return {
    totalReceived: parseFloat(received[0].total || "0"),
    totalDeducted: parseFloat(deducted[0].total || "0"),
  };
}

// ─── Points ────────────────────────────────────────────────────────────────────
export async function addPointsTransaction(data: typeof pointsTransactions.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(pointsTransactions).values(data);
}

export async function listPointsTransactions(userId: number, page = 1, limit = 20) {
  const db = await getDb();
  if (!db) return { items: [], total: 0 };
  const offset = (page - 1) * limit;
  const items = await db.select().from(pointsTransactions).where(eq(pointsTransactions.userId, userId))
    .orderBy(desc(pointsTransactions.createdAt)).limit(limit).offset(offset);
  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(pointsTransactions).where(eq(pointsTransactions.userId, userId));
  return { items, total: Number(count) };
}

export async function listAllPointsTransactions(page = 1, limit = 20) {
  const db = await getDb();
  if (!db) return { items: [], total: 0 };
  const offset = (page - 1) * limit;
  const items = await db.select().from(pointsTransactions).orderBy(desc(pointsTransactions.createdAt)).limit(limit).offset(offset);
  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(pointsTransactions);
  return { items, total: Number(count) };
}

// ─── Deposits ─────────────────────────────────────────────────────────────────
export async function createDeposit(data: typeof deposits.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(deposits).values(data);
}

export async function listDeposits(userId?: number, page = 1, limit = 20) {
  const db = await getDb();
  if (!db) return { items: [], total: 0 };
  const offset = (page - 1) * limit;
  const where = userId ? eq(deposits.userId, userId) : undefined;
  const items = where
    ? await db.select().from(deposits).where(where).orderBy(desc(deposits.createdAt)).limit(limit).offset(offset)
    : await db.select().from(deposits).orderBy(desc(deposits.createdAt)).limit(limit).offset(offset);
  const countQuery = where
    ? await db.select({ count: sql<number>`count(*)` }).from(deposits).where(where)
    : await db.select({ count: sql<number>`count(*)` }).from(deposits);
  return { items, total: Number(countQuery[0].count) };
}

export async function updateDeposit(id: number, data: Partial<typeof deposits.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(deposits).set(data).where(eq(deposits.id, id));
}

// ─── Withdrawals ──────────────────────────────────────────────────────────────
export async function createWithdrawal(data: typeof withdrawals.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(withdrawals).values(data);
}

export async function listWithdrawals(userId?: number, page = 1, limit = 20) {
  const db = await getDb();
  if (!db) return { items: [], total: 0 };
  const offset = (page - 1) * limit;
  const where = userId ? eq(withdrawals.userId, userId) : undefined;
  const items = where
    ? await db.select().from(withdrawals).where(where).orderBy(desc(withdrawals.createdAt)).limit(limit).offset(offset)
    : await db.select().from(withdrawals).orderBy(desc(withdrawals.createdAt)).limit(limit).offset(offset);
  const countQuery = where
    ? await db.select({ count: sql<number>`count(*)` }).from(withdrawals).where(where)
    : await db.select({ count: sql<number>`count(*)` }).from(withdrawals);
  return { items, total: Number(countQuery[0].count) };
}

export async function updateWithdrawal(id: number, data: Partial<typeof withdrawals.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(withdrawals).set(data).where(eq(withdrawals.id, id));
}

// ─── Fund Transactions ─────────────────────────────────────────────────────────
export async function addFundTransaction(data: typeof fundTransactions.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(fundTransactions).values(data);
}

export async function listFundTransactions(userId?: number, page = 1, limit = 20) {
  const db = await getDb();
  if (!db) return { items: [], total: 0 };
  const offset = (page - 1) * limit;
  const where = userId ? eq(fundTransactions.userId, userId) : undefined;
  const items = where
    ? await db.select().from(fundTransactions).where(where).orderBy(desc(fundTransactions.createdAt)).limit(limit).offset(offset)
    : await db.select().from(fundTransactions).orderBy(desc(fundTransactions.createdAt)).limit(limit).offset(offset);
  const countQuery = where
    ? await db.select({ count: sql<number>`count(*)` }).from(fundTransactions).where(where)
    : await db.select({ count: sql<number>`count(*)` }).from(fundTransactions);
  return { items, total: Number(countQuery[0].count) };
}

// ─── System Config ─────────────────────────────────────────────────────────────
export async function getSystemConfig(key: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(systemConfig).where(eq(systemConfig.key, key)).limit(1);
  return result.length > 0 ? result[0].value : undefined;
}

export async function setSystemConfig(key: string, value: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(systemConfig).values({ key, value }).onDuplicateKeyUpdate({ set: { value } });
}

export async function listSystemConfig() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(systemConfig);
}

// ─── Admin Stats ───────────────────────────────────────────────────────────────
export async function getAdminDashboardStats() {
  const db = await getDb();
  if (!db) return null;
  const [userCount] = await db.select({ count: sql<number>`count(*)` }).from(users);
  const [depositStats] = await db.select({
    total: sql<string>`COALESCE(SUM(amount), 0)`,
    pending: sql<number>`SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END)`,
  }).from(deposits).where(eq(deposits.status, "approved"));
  const [withdrawalStats] = await db.select({
    total: sql<string>`COALESCE(SUM(amount), 0)`,
    pending: sql<number>`SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END)`,
  }).from(withdrawals);
  const [orderStats] = await db.select({
    totalProfit: sql<string>`COALESCE(SUM(CASE WHEN netPnl > 0 THEN netPnl ELSE 0 END), 0)`,
    abnormal: sql<number>`SUM(CASE WHEN isAbnormal = 1 THEN 1 ELSE 0 END)`,
  }).from(copyOrders).where(sql`action IN ('open_long', 'open_short')`);
  const [shareStats] = await db.select({
    total: sql<string>`COALESCE(SUM(amount), 0)`,
  }).from(revenueShareRecords);
  return {
    totalUsers: Number(userCount.count),
    totalDeposits: parseFloat(depositStats.total || "0"),
    pendingDeposits: Number(depositStats.pending || 0),
    totalWithdrawals: parseFloat(withdrawalStats.total || "0"),
    pendingWithdrawals: Number(withdrawalStats.pending || 0),
    totalProfit: parseFloat(orderStats.totalProfit || "0"),
    abnormalOrders: Number(orderStats.abnormal || 0),
    totalRevenueShare: parseFloat(shareStats.total || "0"),
  };
}

export async function getTeamStats(userId: number) {
  const db = await getDb();
  if (!db) return { directCount: 0, totalCount: 0, teamProfit: 0, teamRevenueShare: 0 };
  // Direct referrals count
  const [direct] = await db.select({ count: sql<number>`count(*)` }).from(users).where(eq(users.referrerId, userId));
  // Recursively collect ALL team member IDs across all levels (BFS)
  const allTeamIds: number[] = [];
  let currentLevelIds = (await db.select({ id: users.id }).from(users).where(eq(users.referrerId, userId))).map(m => m.id);
  const directIds = [...currentLevelIds];
  while (currentLevelIds.length > 0) {
    allTeamIds.push(...currentLevelIds);
    const nextLevel = await db.select({ id: users.id }).from(users)
      .where(sql`referrerId IN (${currentLevelIds.join(",")})`);
    currentLevelIds = nextLevel.map(m => m.id);
  }
  const totalCount = allTeamIds.length;
  // Team profit (orders from ALL levels)
  let teamProfit = 0;
  if (allTeamIds.length > 0) {
    const [profitResult] = await db.select({ total: sql<string>`COALESCE(SUM(CASE WHEN netPnl > 0 THEN netPnl ELSE 0 END), 0)` })
      .from(copyOrders).where(sql`userId IN (${allTeamIds.join(",")}) AND action IN ('open_long', 'open_short')`);
    teamProfit = parseFloat(profitResult.total || "0");
  }
  // Revenue share received by this user
  const [shareResult] = await db.select({ total: sql<string>`COALESCE(SUM(amount), 0)` })
    .from(revenueShareRecords).where(eq(revenueShareRecords.recipientId, userId));
  return {
    directCount: Number(direct.count),
    totalCount,
    teamProfit,
    teamRevenueShare: parseFloat(shareResult.total || "0"),
  };
}

export async function getMyInvitees(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: users.id,
    name: users.name,
    email: users.email,
    revenueShareRatio: users.revenueShareRatio,
    isActive: users.isActive,
    createdAt: users.createdAt,
  }).from(users).where(eq(users.referrerId, userId)).orderBy(sql`${users.createdAt} DESC`);
}
