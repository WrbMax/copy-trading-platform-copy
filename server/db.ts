import { and, desc, eq, gte, inArray, like, lt, ne, or, sql, aliasedTable } from "drizzle-orm";
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
  revenueShareRatio?: string;
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
    revenueShareRatio: data.revenueShareRatio ?? "0.00",
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

/**
 * Atomically adjust user balance by a delta amount using SQL relative update.
 * Returns the new balance after adjustment.
 * Prevents concurrent race conditions by never reading then writing.
 */
export async function adjustBalance(userId: number, delta: number): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (delta >= 0) {
    await db.update(users)
      .set({ balance: sql`balance + ${delta.toFixed(8)}` } as any)
      .where(eq(users.id, userId));
  } else {
    // For negative delta, clamp to 0 to prevent negative balance
    await db.update(users)
      .set({ balance: sql`GREATEST(balance + ${delta.toFixed(8)}, 0)` } as any)
      .where(eq(users.id, userId));
  }
  // Read back the new balance
  const [updated] = await db.select({ balance: users.balance }).from(users).where(eq(users.id, userId));
  return updated?.balance ?? "0";
}

/**
 * Atomically deduct balance for a withdrawal using a conditional UPDATE.
 * Uses WHERE balance >= amount to prevent concurrent over-withdrawal (TOCTOU fix).
 * Returns the new balance string if deduction succeeded, or null if balance was insufficient.
 *
 * FIX(2026-04-27): Replaces the previous SELECT-then-UPDATE pattern in submitWithdrawal
 * which was vulnerable to TOCTOU race conditions under concurrent requests.
 */
export async function deductBalanceForWithdrawal(userId: number, amount: number): Promise<string | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const amountStr = amount.toFixed(8);
  // Conditional UPDATE: only deducts if current balance >= amount
  const result = await db.update(users)
    .set({ balance: sql`balance - ${amountStr}` } as any)
    .where(sql`${users.id} = ${userId} AND balance >= ${amountStr}`);
  const affectedRows = (result[0] as any).affectedRows ?? (result[0] as any).rowsAffected ?? 0;
  if (affectedRows === 0) {
    // Balance was insufficient (or user not found)
    return null;
  }
  // Read back the new balance
  const [updated] = await db.select({ balance: users.balance }).from(users).where(eq(users.id, userId));
  return updated?.balance ?? "0";
}

/**
 * Atomically adjust user points by a delta amount using SQL relative update.
 * Returns the new points after adjustment.
 */
export async function adjustPoints(userId: number, delta: number): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (delta >= 0) {
    await db.update(users)
      .set({ points: sql`points + ${delta}` } as any)
      .where(eq(users.id, userId));
  } else {
    await db.update(users)
      .set({ points: sql`GREATEST(points + ${delta}, 0)` } as any)
      .where(eq(users.id, userId));
  }
  const [updated] = await db.select({ points: users.points }).from(users).where(eq(users.id, userId));
  return updated?.points ?? 0;
}

export async function listUsers(
  page = 1,
  limit = 20,
  filters?: {
    pLevel?: number;
    isActive?: boolean;
    sortBy?: "createdAt" | "balance" | "pLevel";
    sortOrder?: "asc" | "desc";
  }
) {
  const db = await getDb();
  if (!db) return { items: [], total: 0 };
  const offset = (page - 1) * limit;
  const conditions: any[] = [];
  if (filters?.pLevel !== undefined) conditions.push(eq(users.pLevel, filters.pLevel));
  if (filters?.isActive !== undefined) conditions.push(eq(users.isActive, filters.isActive));
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  let orderByClause: any;
  const dir = filters?.sortOrder === "asc" ? "asc" : "desc";
  if (filters?.sortBy === "balance") {
    orderByClause = dir === "asc" ? sql`balance ASC` : sql`balance DESC`;
  } else if (filters?.sortBy === "pLevel") {
    orderByClause = dir === "asc" ? sql`pLevel ASC` : sql`pLevel DESC`;
  } else {
    orderByClause = desc(users.createdAt);
  }
  const items = await db.select().from(users).where(whereClause).orderBy(orderByClause).limit(limit).offset(offset);
  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(users).where(whereClause);
  return { items, total: Number(count) };
}

export async function searchUsers(keyword: string, page = 1, limit = 20) {
  const db = await getDb();
  if (!db) return { items: [], total: 0 };
  const offset = (page - 1) * limit;
  const isNumeric = /^\d+$/.test(keyword.trim());
  let where;
  if (isNumeric) {
    where = eq(users.id, parseInt(keyword.trim()));
  } else {
    where = or(
      like(users.name, `%${keyword}%`),
      like(users.email, `%${keyword}%`)
    );
  }
  const items = await db.select().from(users).where(where).orderBy(desc(users.createdAt)).limit(limit).offset(offset);
  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(users).where(where);
  return { items, total: Number(count) };
}

export async function getAdminUser() {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(users).where(eq(users.role, "admin")).limit(1);
  return result[0] ?? null;
}

/**
 * Walk up the referral chain from a given user, returning each ancestor's id and pLevel.
 * Used by the new revenue share engine.
 */
export async function getUserReferralChain(userId: number): Promise<Array<{ id: number; pLevel: number; revenueShareRatio: string }>> {
  const db = await getDb();
  if (!db) return [];
  const chain: Array<{ id: number; pLevel: number; revenueShareRatio: string }> = [];
  const trader = await getUserById(userId);
  if (!trader || !trader.referrerId) return [];
  let currentReferrerId: number | null | undefined = trader.referrerId;
  const visited = new Set<number>();
  while (currentReferrerId) {
    if (visited.has(currentReferrerId)) break;
    visited.add(currentReferrerId);
    const ancestor = await getUserById(currentReferrerId);
    if (!ancestor) break;
    chain.push({
      id: ancestor.id,
      pLevel: ancestor.pLevel ?? 0,
      revenueShareRatio: ancestor.revenueShareRatio,
    });
    currentReferrerId = ancestor.referrerId ?? null;
  }
  return chain;
}

/**
 * Count the number of DIRECT referrals of a user who are "valid users".
 * Valid user definition (updated 2026-04-23): cumulative approved deposits >= minDepositAmount (100 USDT).
 * Previously: platform balance >= 100 USDT.
 */
export async function getDirectReferralCount(userId: number, minDepositAmount: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  // A valid user is one whose cumulative approved deposits >= minDepositAmount
  const [result] = await db.select({ count: sql<number>`count(DISTINCT ${users.id})` })
    .from(users)
    .innerJoin(
      deposits,
      and(
        eq(deposits.userId, users.id),
        eq(deposits.status, "approved")
      )
    )
    .where(
      and(
        eq(users.referrerId, userId),
        sql`(
          SELECT COALESCE(SUM(CAST(${deposits.amount} AS DECIMAL(20,8))), 0)
          FROM deposits d2
          WHERE d2.userId = ${users.id} AND d2.status = 'approved'
        ) >= ${minDepositAmount}`
      )
    );
  return Number(result.count);
}

/**
 * Get the sum of all exchange account balances (USDT) for a single user.
 * Reads all active, verified exchange APIs and calls each exchange's balance endpoint.
 * Returns the total USDT balance across all exchanges.
 */
export async function getUserExchangeBalanceSum(
  userId: number,
  decryptFn: (encrypted: string) => string,
  exchangeClients: {
    getBinanceBalance: (creds: { apiKey: string; secretKey: string }) => Promise<{ totalWalletBalance: string }>;
    getOkxBalance: (creds: { apiKey: string; secretKey: string; passphrase: string }) => Promise<{ totalEq: string }>;
    getBybitBalance?: (creds: { apiKey: string; secretKey: string }) => Promise<{ totalWalletBalance: string }>;
    getBitgetBalance?: (creds: { apiKey: string; secretKey: string; passphrase: string }) => Promise<{ totalWalletBalance: string }>;
    getGateBalance?: (creds: { apiKey: string; secretKey: string }) => Promise<{ totalWalletBalance: string }>;
  }
): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const apis = await db.select().from(exchangeApis)
    .where(and(eq(exchangeApis.userId, userId), eq(exchangeApis.isActive, true)));
  let total = 0;
  for (const api of apis) {
    try {
      const apiKey = decryptFn(api.apiKeyEncrypted);
      const secretKey = decryptFn(api.secretKeyEncrypted);
      const passphrase = api.passphraseEncrypted ? decryptFn(api.passphraseEncrypted) : "";
      const exchange = (api.exchange || "binance").toLowerCase();
      let balance = 0;
      if (exchange === "binance") {
        const res = await exchangeClients.getBinanceBalance({ apiKey, secretKey });
        balance = parseFloat(res.totalWalletBalance || "0");
      } else if (exchange === "okx") {
        const res = await exchangeClients.getOkxBalance({ apiKey, secretKey, passphrase });
        balance = parseFloat(res.totalEq || "0");
      } else if (exchange === "bybit" && exchangeClients.getBybitBalance) {
        const res = await exchangeClients.getBybitBalance({ apiKey, secretKey });
        balance = parseFloat(res.totalWalletBalance || "0");
      } else if (exchange === "bitget" && exchangeClients.getBitgetBalance) {
        const res = await exchangeClients.getBitgetBalance({ apiKey, secretKey, passphrase });
        balance = parseFloat(res.totalWalletBalance || "0");
      } else if (exchange === "gate" && exchangeClients.getGateBalance) {
        const res = await exchangeClients.getGateBalance({ apiKey, secretKey });
        balance = parseFloat(res.totalWalletBalance || "0");
      }
      if (balance > 0) total += balance;
    } catch (e: any) {
      // Log but don't fail the whole job if one exchange API errors
      console.warn(`[PerformanceUpdate] Failed to get balance for user #${userId} exchange ${api.exchange}: ${e.message}`);
    }
  }
  return total;
}

/**
 * Get all active users who have at least one active exchange API.
 * Used by the daily performance update job.
 */
export async function getUsersWithActiveExchangeApis(): Promise<Array<{ id: number; referrerId: number | null }>> {
  const db = await getDb();
  if (!db) return [];
  const result = await db
    .selectDistinct({ id: users.id, referrerId: users.referrerId })
    .from(users)
    .innerJoin(exchangeApis, and(eq(exchangeApis.userId, users.id), eq(exchangeApis.isActive, true)))
    .where(eq(users.isActive, true));
  return result;
}

/**
 * Get all descendant user IDs (BFS) for a given user.
 * Returns an array of all user IDs in the user's entire downstream network.
 */
export async function getAllDescendantIds(userId: number): Promise<number[]> {
  const db = await getDb();
  if (!db) return [];
  const allIds: number[] = [];
  let currentLevelIds = (await db.select({ id: users.id }).from(users).where(eq(users.referrerId, userId))).map(m => m.id);
  while (currentLevelIds.length > 0) {
    allIds.push(...currentLevelIds);
    // Ensure all IDs are integers to prevent SQL injection
    const safeIds = currentLevelIds.map(id => parseInt(String(id), 10)).filter(id => !isNaN(id));
    if (safeIds.length === 0) break;
    const nextLevel = await db.select({ id: users.id }).from(users)
      .where(sql`referrerId IN (${sql.raw(safeIds.join(","))})`);
    currentLevelIds = nextLevel.map(m => m.id);
  }
  return allIds;
}


/**
 * Calculate the "small zone" performance for a user (去大区取小区).
 *
 * P-level qualification rule (updated 2026-04-22):
 * qualifying_performance = sum of all direct branch performances - largest branch performance
 *
 * Each "branch performance" = that direct referral's umbrellaPerformance,
 * which accumulates the total 40% deductions from their entire subtree.
 *
 * Example: A has direct referrals B(1000), C(2000), D(3000)
 * → small zone = (1000 + 2000 + 3000) - 3000 = 3000 → qualifies for P2
 *
 * Special cases:
 * - 0 direct referrals → returns 0
 * - 1 direct referral → only one branch = big zone → small zone = 0
 *
 * @param userId - The user whose small-zone performance to calculate
 * @returns Small-zone performance value in USDT
 */
export async function getSmallZonePerformance(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  // Get all direct referrals of this user
  const directReferrals = await db
    .select({ id: users.id, umbrellaPerformance: users.umbrellaPerformance })
    .from(users)
    .where(eq(users.referrerId, userId));

  if (directReferrals.length === 0) return 0;
  if (directReferrals.length === 1) return 0; // Only big zone, no small zone

  // Collect each branch's performance (= direct referral's umbrellaPerformance)
  const branchPerformances = directReferrals.map(ref =>
    parseFloat(ref.umbrellaPerformance || "0")
  );

  // Find the largest branch (big zone) and subtract it
  const maxPerf = Math.max(...branchPerformances);
  const totalPerf = branchPerformances.reduce((sum, p) => sum + p, 0);
  const smallZonePerf = totalPerf - maxPerf;

  return Math.max(0, smallZonePerf);
}


// ─── Email Verification ────────────────────────────────────────────────────────
export async function createVerificationCode(email: string, type: "register" | "login" | "reset_password", code: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await db.insert(emailVerificationCodes).values({ email, code, type, expiresAt });
}

export async function verifyCode(email: string, code: string, type: "register" | "login" | "reset_password") {
  const db = await getDb();
  if (!db) return false;
  const now = new Date();
  // Atomic: mark as used only if still unused & not expired; check affected rows
  const result = await db.update(emailVerificationCodes)
    .set({ used: true })
    .where(and(
      eq(emailVerificationCodes.email, email),
      eq(emailVerificationCodes.code, code),
      eq(emailVerificationCodes.type, type),
      eq(emailVerificationCodes.used, false),
      gte(emailVerificationCodes.expiresAt, now)
    ));
  // Drizzle mysql2 returns [ResultSetHeader, ...]; affectedRows indicates success
  const affectedRows = (result as any)?.[0]?.affectedRows ?? 0;
  return affectedRows > 0;
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
    // Only update the fields that are being changed, keyed by existing row id
    await db.update(userStrategies).set({
      exchangeApiId: data.exchangeApiId,
      multiplier: data.multiplier,
      isEnabled: data.isEnabled,
    }).where(eq(userStrategies.id, existing.id));
  } else {
    await db.insert(userStrategies).values(data);
  }
}

export async function disableAllUserStrategies(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(userStrategies).set({ isEnabled: false }).where(eq(userStrategies.userId, userId));
}

export async function disableStrategiesByExchangeApiId(exchangeApiId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(userStrategies).set({ isEnabled: false }).where(eq(userStrategies.exchangeApiId, exchangeApiId));
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

export async function getCopyOrderById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(copyOrders).where(eq(copyOrders.id, id)).limit(1);
  return result[0] || null;
}

export async function updateCopyOrder(id: number, data: Partial<typeof copyOrders.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(copyOrders).set(data).where(eq(copyOrders.id, id));
}

export async function findUserOpenOrder(userId: number, symbol: string, action: string) {
  const db = await getDb();
  if (!db) return null;
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

// Optional signalSourceId filters results to a specific signal source,
// preventing cross-source order pollution when multiple sources trade the same symbol.
export async function findAllUserOpenOrders(userId: number, symbol: string, action: string, signalSourceId?: number) {
  const db = await getDb();
  if (!db) return [];
  const openAction = action === "close_long" || action === "reduce_long" ? "open_long" : "open_short";
  const conditions = [
    eq(copyOrders.userId, userId),
    eq(copyOrders.symbol, symbol),
    eq(copyOrders.action, openAction),
    eq(copyOrders.status, "open"),
  ];
  if (signalSourceId !== undefined) {
    conditions.push(eq(copyOrders.signalSourceId, signalSourceId));
  }
  const results = await db.select().from(copyOrders).where(and(...conditions)).orderBy(copyOrders.createdAt);
  return results;
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
  const where = userId
    ? and(eq(copyOrders.userId, userId), ne(copyOrders.status, "cancelled"))
    : ne(copyOrders.status, "cancelled");
  const items = await db.select().from(copyOrders).where(where).orderBy(desc(copyOrders.createdAt)).limit(limit).offset(offset);
  const countQuery = await db.select({ count: sql<number>`count(*)` }).from(copyOrders).where(where);
  return { items, total: Number(countQuery[0].count) };
}

export async function listAllCopyOrdersWithUser(
  page = 1,
  limit = 30,
  filters?: {
    userId?: number;
    signalSourceId?: number;
    exchange?: string;
    symbol?: string;
    action?: string;
    status?: string;
    isAbnormal?: boolean;
    dateFrom?: Date;
    dateTo?: Date;
    keyword?: string;
  }
) {
  const db = await getDb();
  if (!db) return { items: [], total: 0, stats: { totalProfit: 0, totalLoss: 0, netPnl: 0, abnormalCount: 0, totalOrders: 0 } };
  const offset = (page - 1) * limit;
  const conditions: any[] = [];
  if (!filters?.status) conditions.push(ne(copyOrders.status, "cancelled"));
  if (filters?.userId) conditions.push(eq(copyOrders.userId, filters.userId));
  if (filters?.signalSourceId) conditions.push(eq(copyOrders.signalSourceId, filters.signalSourceId));
  if (filters?.exchange) conditions.push(eq(copyOrders.exchange, filters.exchange as "binance" | "okx" | "bybit" | "bitget" | "gate"));
  if (filters?.symbol) conditions.push(like(copyOrders.symbol, `%${filters.symbol}%`));
  if (filters?.action) conditions.push(eq(copyOrders.action, filters.action as any));
  if (filters?.status) conditions.push(eq(copyOrders.status, filters.status as any));
  if (filters?.isAbnormal !== undefined) conditions.push(eq(copyOrders.isAbnormal, filters.isAbnormal));
  if (filters?.dateFrom) conditions.push(gte(copyOrders.createdAt, filters.dateFrom));
  if (filters?.dateTo) conditions.push(lt(copyOrders.createdAt, filters.dateTo));
  if (filters?.keyword) conditions.push(like(users.name, `%${filters.keyword}%`));
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
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
      revenueShareDeducted: copyOrders.revenueShareDeducted,
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
    .where(whereClause)
    .orderBy(desc(copyOrders.createdAt))
    .limit(limit)
    .offset(offset);
  const countQuery = await db
    .select({ count: sql<number>`count(*)` })
    .from(copyOrders)
    .leftJoin(users, eq(copyOrders.userId, users.id))
    .where(whereClause);
  const statsConditions = [...conditions, sql`${copyOrders.action} IN ('close_long', 'close_short')`];
  const statsWhere = and(...statsConditions);
  const [statsResult] = await db
    .select({
      totalProfit: sql<string>`COALESCE(SUM(CASE WHEN netPnl > 0 THEN netPnl ELSE 0 END), 0)`,
      totalLoss: sql<string>`COALESCE(SUM(CASE WHEN netPnl < 0 THEN ABS(netPnl) ELSE 0 END), 0)`,
      abnormalCount: sql<number>`SUM(CASE WHEN isAbnormal = 1 THEN 1 ELSE 0 END)`,
    })
    .from(copyOrders)
    .leftJoin(users, eq(copyOrders.userId, users.id))
    .where(statsWhere);
  const totalProfit = parseFloat(statsResult?.totalProfit || "0");
  const totalLoss = parseFloat(statsResult?.totalLoss || "0");
  return {
    items,
    total: Number(countQuery[0].count),
    stats: {
      totalProfit,
      totalLoss,
      netPnl: totalProfit - totalLoss,
      abnormalCount: Number(statsResult?.abnormalCount || 0),
      totalOrders: Number(countQuery[0].count),
    },
  };
}

export async function getUserOrderStats(userId: number) {
  const db = await getDb();
  if (!db) return { totalProfit: 0, totalLoss: 0, netPnl: 0, totalOrders: 0, openOrders: 0, totalRevenueShare: 0 };
  const closeResult = await db.select({
    totalProfit: sql<string>`COALESCE(SUM(CASE WHEN netPnl > 0 THEN netPnl ELSE 0 END), 0)`,
    totalLoss: sql<string>`COALESCE(SUM(CASE WHEN netPnl < 0 THEN ABS(netPnl) ELSE 0 END), 0)`,
    totalOrders: sql<number>`COUNT(*)`,
    totalRevenueShare: sql<string>`COALESCE(SUM(COALESCE(revenueShareDeducted, 0)), 0)`,
  }).from(copyOrders).where(
    and(
      eq(copyOrders.userId, userId),
      ne(copyOrders.status, "cancelled"),
      sql`action IN ('close_long', 'close_short')`
    )
  );
  const openResult = await db.select({
    openOrders: sql<number>`COUNT(*)`,
  }).from(copyOrders).where(
    and(
      eq(copyOrders.userId, userId),
      eq(copyOrders.status, "open"),
      sql`action IN ('open_long', 'open_short')`
    )
  );
  const row = closeResult[0];
  const totalProfit = parseFloat(row.totalProfit || "0");
  const totalLoss = parseFloat(row.totalLoss || "0");
  const totalRevenueShare = parseFloat(row.totalRevenueShare || "0");
  return { totalProfit, totalLoss, netPnl: totalProfit - totalLoss, totalOrders: Number(row.totalOrders), openOrders: Number(openResult[0].openOrders), totalRevenueShare };
}

// ─── Revenue Share ─────────────────────────────────────────────────────────────
export async function createRevenueShareRecords(records: typeof revenueShareRecords.$inferInsert[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (records.length === 0) return;
  await db.insert(revenueShareRecords).values(records);
}

export async function listRevenueShareRecords(
  userId?: number,
  page = 1,
  limit = 20,
  filters?: {
    rewardType?: string;
    rewardTypes?: string[]; // filter by multiple reward types
    dateFrom?: Date;
    dateTo?: Date;
    keyword?: string; // search by recipient name
  }
) {
  const db = await getDb();
  if (!db) return { items: [], total: 0, totalAmount: 0 };
  const offset = (page - 1) * limit;
  const conditions: any[] = [];
  if (userId) conditions.push(eq(revenueShareRecords.recipientId, userId));
  if (filters?.rewardTypes && filters.rewardTypes.length > 0) {
    conditions.push(inArray(revenueShareRecords.rewardType, filters.rewardTypes as any[]));
  } else if (filters?.rewardType) {
    conditions.push(eq(revenueShareRecords.rewardType, filters.rewardType as any));
  }
  if (filters?.dateFrom) conditions.push(gte(revenueShareRecords.createdAt, filters.dateFrom));
  if (filters?.dateTo) conditions.push(lt(revenueShareRecords.createdAt, filters.dateTo));
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  // Alias tables for recipient and trader joins
  const recipientUsers = aliasedTable(users, "recipient_users");
  const traderUsers = aliasedTable(users, "trader_users");
  // If keyword filter, join with users table
  let items: any[];
  let countResult: any[];
  let totalAmountResult: any[];
  if (filters?.keyword) {
    const keywordCondition = like(recipientUsers.name, `%${filters.keyword}%`);
    const fullWhere = whereClause ? and(whereClause, keywordCondition) : keywordCondition;
    items = await db.select({
      id: revenueShareRecords.id,
      recipientId: revenueShareRecords.recipientId,
      recipientName: recipientUsers.name,
      traderId: revenueShareRecords.traderId,
      traderName: traderUsers.name,
      copyOrderId: revenueShareRecords.copyOrderId,
      amount: revenueShareRecords.amount,
      ratio: revenueShareRecords.ratio,
      level: revenueShareRecords.level,
      rewardType: revenueShareRecords.rewardType,
      createdAt: revenueShareRecords.createdAt,
    }).from(revenueShareRecords)
      .leftJoin(recipientUsers, eq(revenueShareRecords.recipientId, recipientUsers.id))
      .leftJoin(traderUsers, eq(revenueShareRecords.traderId, traderUsers.id))
      .where(fullWhere)
      .orderBy(desc(revenueShareRecords.createdAt)).limit(limit).offset(offset);
    countResult = await db.select({ count: sql<number>`count(*)` }).from(revenueShareRecords)
      .leftJoin(recipientUsers, eq(revenueShareRecords.recipientId, recipientUsers.id)).where(fullWhere);
    totalAmountResult = await db.select({ total: sql<string>`COALESCE(SUM(${revenueShareRecords.amount}), 0)` }).from(revenueShareRecords)
      .leftJoin(recipientUsers, eq(revenueShareRecords.recipientId, recipientUsers.id)).where(fullWhere);
  } else {
    items = await db.select({
      id: revenueShareRecords.id,
      recipientId: revenueShareRecords.recipientId,
      recipientName: recipientUsers.name,
      traderId: revenueShareRecords.traderId,
      traderName: traderUsers.name,
      copyOrderId: revenueShareRecords.copyOrderId,
      amount: revenueShareRecords.amount,
      ratio: revenueShareRecords.ratio,
      level: revenueShareRecords.level,
      rewardType: revenueShareRecords.rewardType,
      createdAt: revenueShareRecords.createdAt,
    }).from(revenueShareRecords)
      .leftJoin(recipientUsers, eq(revenueShareRecords.recipientId, recipientUsers.id))
      .leftJoin(traderUsers, eq(revenueShareRecords.traderId, traderUsers.id))
      .where(whereClause)
      .orderBy(desc(revenueShareRecords.createdAt)).limit(limit).offset(offset);
    countResult = await db.select({ count: sql<number>`count(*)` }).from(revenueShareRecords).where(whereClause);
    totalAmountResult = await db.select({ total: sql<string>`COALESCE(SUM(amount), 0)` }).from(revenueShareRecords).where(whereClause);
  }
  // Aggregate stats by reward type (for admin dashboard)
  const statsResult = await db.select({
    totalAmount: sql<string>`COALESCE(SUM(${revenueShareRecords.amount}), 0)`,
    directAmount: sql<string>`COALESCE(SUM(CASE WHEN ${revenueShareRecords.rewardType} = 'direct' THEN ${revenueShareRecords.amount} ELSE 0 END), 0)`,
    rankAmount: sql<string>`COALESCE(SUM(CASE WHEN ${revenueShareRecords.rewardType} = 'rank' THEN ${revenueShareRecords.amount} ELSE 0 END), 0)`,
    sameRankAmount: sql<string>`COALESCE(SUM(CASE WHEN ${revenueShareRecords.rewardType} = 'same_rank' THEN ${revenueShareRecords.amount} ELSE 0 END), 0)`,
  }).from(revenueShareRecords).where(whereClause);
  const statsRow = statsResult[0];
  return {
    items,
    total: Number(countResult[0].count),
    totalAmount: parseFloat(totalAmountResult[0].total || "0"),
    stats: {
      totalAmount: parseFloat(statsRow?.totalAmount || "0"),
      directAmount: parseFloat(statsRow?.directAmount || "0"),
      rankAmount: parseFloat(statsRow?.rankAmount || "0"),
      sameRankAmount: parseFloat(statsRow?.sameRankAmount || "0"),
    },
  };
}
export async function getUserRevenueShareStats(userId: number) {
  const db = await getDb();
  if (!db) return { totalReceived: 0, totalDeducted: 0, directReward: 0, rankReward: 0, sameRankReward: 0 };
  // Total received by reward type
  const received = await db.select({
    total: sql<string>`COALESCE(SUM(amount), 0)`,
    directTotal: sql<string>`COALESCE(SUM(CASE WHEN rewardType = 'direct' THEN amount ELSE 0 END), 0)`,
    rankTotal: sql<string>`COALESCE(SUM(CASE WHEN rewardType = 'rank' THEN amount ELSE 0 END), 0)`,
    sameRankTotal: sql<string>`COALESCE(SUM(CASE WHEN rewardType = 'same_rank' THEN amount ELSE 0 END), 0)`,
  }).from(revenueShareRecords).where(eq(revenueShareRecords.recipientId, userId));
  // Total deducted from this user's orders
  const deducted = await db.select({ total: sql<string>`COALESCE(SUM(revenueShareDeducted), 0)` })
    .from(copyOrders).where(
      and(
        eq(copyOrders.userId, userId),
        sql`action IN ('close_long', 'close_short')`,
        eq(copyOrders.status, 'closed')
      )
    );
  return {
    totalReceived: parseFloat(received[0].total || "0"),
    totalDeducted: parseFloat(deducted[0].total || "0"),
    directReward: parseFloat(received[0].directTotal || "0"),
    rankReward: parseFloat(received[0].rankTotal || "0"),
    sameRankReward: parseFloat(received[0].sameRankTotal || "0"),
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

export async function listDeposits(
  userId?: number,
  page = 1,
  limit = 20,
  filters?: {
    status?: string;
    dateFrom?: Date;
    dateTo?: Date;
    keyword?: string;
  }
) {
  const db = await getDb();
  if (!db) return { items: [], total: 0, pendingCount: 0 };
  const offset = (page - 1) * limit;
  const conditions: any[] = [];
  if (userId) conditions.push(eq(deposits.userId, userId));
  if (filters?.status) conditions.push(eq(deposits.status, filters.status as any));
  if (filters?.dateFrom) conditions.push(gte(deposits.createdAt, filters.dateFrom));
  if (filters?.dateTo) conditions.push(lt(deposits.createdAt, filters.dateTo));
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  let items: any[];
  let countResult: any[];
  if (filters?.keyword) {
    const keywordCondition = like(users.name, `%${filters.keyword}%`);
    const fullWhere = whereClause ? and(whereClause, keywordCondition) : keywordCondition;
    items = await db.select({
      id: deposits.id,
      userId: deposits.userId,
      userName: users.name,
      amount: deposits.amount,
      txHash: deposits.txHash,
      fromAddress: deposits.fromAddress,
      toAddress: deposits.toAddress,
      status: deposits.status,
      reviewedAt: deposits.reviewedAt,
      createdAt: deposits.createdAt,
    }).from(deposits).leftJoin(users, eq(deposits.userId, users.id)).where(fullWhere)
      .orderBy(desc(deposits.createdAt)).limit(limit).offset(offset);
    countResult = await db.select({ count: sql<number>`count(*)` }).from(deposits)
      .leftJoin(users, eq(deposits.userId, users.id)).where(fullWhere);
  } else {
    items = await db.select({
      id: deposits.id,
      userId: deposits.userId,
      userName: users.name,
      amount: deposits.amount,
      txHash: deposits.txHash,
      fromAddress: deposits.fromAddress,
      toAddress: deposits.toAddress,
      status: deposits.status,
      reviewedAt: deposits.reviewedAt,
      createdAt: deposits.createdAt,
    }).from(deposits).leftJoin(users, eq(deposits.userId, users.id)).where(whereClause)
      .orderBy(desc(deposits.createdAt)).limit(limit).offset(offset);
    countResult = await db.select({ count: sql<number>`count(*)` }).from(deposits).where(whereClause);
  }
  const [pendingResult] = await db.select({ count: sql<number>`count(*)` }).from(deposits)
    .where(eq(deposits.status, "pending"));
  // Stats based on current filter conditions (for filtered view)
  // Note: keyword filter requires JOIN with users table
  const statsConditions = [...conditions];
  let filteredStats: any;
  if (filters?.keyword) {
    const keywordCondition = like(users.name, `%${filters.keyword}%`);
    const statsWithKeyword = statsConditions.length > 0 ? and(and(...statsConditions), keywordCondition) : keywordCondition;
    [filteredStats] = await db.select({
      confirmedAmount: sql<string>`COALESCE(SUM(CASE WHEN ${deposits.status} = 'approved' THEN CAST(${deposits.amount} AS DECIMAL) ELSE 0 END), 0)`,
      pendingAmount: sql<string>`COALESCE(SUM(CASE WHEN ${deposits.status} = 'pending' THEN CAST(${deposits.amount} AS DECIMAL) ELSE 0 END), 0)`,
      pendingCount: sql<number>`SUM(CASE WHEN ${deposits.status} = 'pending' THEN 1 ELSE 0 END)`,
    }).from(deposits).leftJoin(users, eq(deposits.userId, users.id)).where(statsWithKeyword);
  } else {
    const statsWhere = statsConditions.length > 0 ? and(...statsConditions) : undefined;
    [filteredStats] = await db.select({
      confirmedAmount: sql<string>`COALESCE(SUM(CASE WHEN status = 'approved' THEN CAST(amount AS DECIMAL) ELSE 0 END), 0)`,
      pendingAmount: sql<string>`COALESCE(SUM(CASE WHEN status = 'pending' THEN CAST(amount AS DECIMAL) ELSE 0 END), 0)`,
      pendingCount: sql<number>`SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END)`,
    }).from(deposits).where(statsWhere);
  }
  return {
    items,
    total: Number(countResult[0].count),
    pendingCount: Number(pendingResult.count),
    stats: {
      pendingCount: Number(filteredStats?.pendingCount || 0),
      confirmedAmount: parseFloat(filteredStats?.confirmedAmount || "0"),
      pendingAmount: parseFloat(filteredStats?.pendingAmount || "0"),
    },
  };
}
export async function getDepositById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(deposits).where(eq(deposits.id, id)).limit(1);
  return result[0] || null;
}

export async function getWithdrawalById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(withdrawals).where(eq(withdrawals.id, id)).limit(1);
  return result[0] || null;
}

export async function updateDeposit(id: number, data: Partial<typeof deposits.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(deposits).set(data).where(eq(deposits.id, id));
}

// ─── Withdrawals ──────────────────────────────────────────────────────────────
export async function createWithdrawal(data: typeof withdrawals.$inferInsert): Promise<{ id: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(withdrawals).values(data);
  return { id: (result[0] as any).insertId as number };
}

export async function listWithdrawals(
  userId?: number,
  page = 1,
  limit = 20,
  filters?: {
    status?: string;
    dateFrom?: Date;
    dateTo?: Date;
    keyword?: string;
  }
) {
  const db = await getDb();
  if (!db) return { items: [], total: 0, pendingCount: 0 };
  const offset = (page - 1) * limit;
  const conditions: any[] = [];
  if (userId) conditions.push(eq(withdrawals.userId, userId));
  if (filters?.status) conditions.push(eq(withdrawals.status, filters.status as any));
  if (filters?.dateFrom) conditions.push(gte(withdrawals.createdAt, filters.dateFrom));
  if (filters?.dateTo) conditions.push(lt(withdrawals.createdAt, filters.dateTo));
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  let items: any[];
  let countResult: any[];
  if (filters?.keyword) {
    const keywordCondition = like(users.name, `%${filters.keyword}%`);
    const fullWhere = whereClause ? and(whereClause, keywordCondition) : keywordCondition;
    items = await db.select({
      id: withdrawals.id,
      userId: withdrawals.userId,
      userName: users.name,
      amount: withdrawals.amount,
      fee: withdrawals.fee,
      netAmount: withdrawals.netAmount,
      address: withdrawals.toAddress,
      status: withdrawals.status,
      txHash: withdrawals.txHash,
      reviewedAt: withdrawals.reviewedAt,
      createdAt: withdrawals.createdAt,
    }).from(withdrawals).leftJoin(users, eq(withdrawals.userId, users.id)).where(fullWhere)
      .orderBy(desc(withdrawals.createdAt)).limit(limit).offset(offset);
    countResult = await db.select({ count: sql<number>`count(*)` }).from(withdrawals)
      .leftJoin(users, eq(withdrawals.userId, users.id)).where(fullWhere);
  } else {
    items = await db.select({
      id: withdrawals.id,
      userId: withdrawals.userId,
      userName: users.name,
      amount: withdrawals.amount,
      fee: withdrawals.fee,
      netAmount: withdrawals.netAmount,
      address: withdrawals.toAddress,
      status: withdrawals.status,
      txHash: withdrawals.txHash,
      reviewedAt: withdrawals.reviewedAt,
      createdAt: withdrawals.createdAt,
    }).from(withdrawals).leftJoin(users, eq(withdrawals.userId, users.id)).where(whereClause)
      .orderBy(desc(withdrawals.createdAt)).limit(limit).offset(offset);
    countResult = await db.select({ count: sql<number>`count(*)` }).from(withdrawals).where(whereClause);
  }
  const [pendingResult] = await db.select({ count: sql<number>`count(*)` }).from(withdrawals)
    .where(eq(withdrawals.status, "pending"));
  // Stats based on current filter conditions (for filtered view)
  const statsConditions = [...conditions];
  let filteredStats: any;
  if (filters?.keyword) {
    const keywordCondition = like(users.name, `%${filters.keyword}%`);
    const statsWithKeyword = statsConditions.length > 0 ? and(and(...statsConditions), keywordCondition) : keywordCondition;
    [filteredStats] = await db.select({
      completedAmount: sql<string>`COALESCE(SUM(CASE WHEN ${withdrawals.status} = 'completed' THEN CAST(${withdrawals.amount} AS DECIMAL) ELSE 0 END), 0)`,
      pendingAmount: sql<string>`COALESCE(SUM(CASE WHEN ${withdrawals.status} = 'pending' THEN CAST(${withdrawals.amount} AS DECIMAL) ELSE 0 END), 0)`,
      pendingCount: sql<number>`SUM(CASE WHEN ${withdrawals.status} = 'pending' THEN 1 ELSE 0 END)`,
    }).from(withdrawals).leftJoin(users, eq(withdrawals.userId, users.id)).where(statsWithKeyword);
  } else {
    const statsWhere = statsConditions.length > 0 ? and(...statsConditions) : undefined;
    [filteredStats] = await db.select({
      completedAmount: sql<string>`COALESCE(SUM(CASE WHEN status = 'completed' THEN CAST(amount AS DECIMAL) ELSE 0 END), 0)`,
      pendingAmount: sql<string>`COALESCE(SUM(CASE WHEN status = 'pending' THEN CAST(amount AS DECIMAL) ELSE 0 END), 0)`,
      pendingCount: sql<number>`SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END)`,
    }).from(withdrawals).where(statsWhere);
  }
  return {
    items,
    total: Number(countResult[0].count),
    pendingCount: Number(pendingResult.count),
    stats: {
      pendingCount: Number(filteredStats?.pendingCount || 0),
      completedAmount: parseFloat(filteredStats?.completedAmount || "0"),
      pendingAmount: parseFloat(filteredStats?.pendingAmount || "0"),
    },
  };
}
export async function updateWithdrawal(id: number, data: Partial<typeof withdrawals.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(withdrawals).set(data).where(eq(withdrawals.id, id));
}

/**
 * Atomically claim a withdrawal for processing by changing status from 'pending' to 'processing'.
 * Uses a conditional UPDATE (WHERE status='pending') to prevent race conditions.
 * Returns true if the claim succeeded (this process owns it), false if already claimed by another.
 *
 * This is the core idempotency guard for auto-payout:
 *   1. claimWithdrawalForProcessing(id) → true  → proceed with on-chain transfer
 *   2. claimWithdrawalForProcessing(id) → false → another process already owns it, skip
 */
export async function claimWithdrawalForProcessing(id: number): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.update(withdrawals)
    .set({ status: "processing" })
    .where(and(eq(withdrawals.id, id), eq(withdrawals.status, "pending")));
  // MySQL: affectedRows > 0 means the row was actually updated
  const affectedRows = (result[0] as any).affectedRows ?? (result[0] as any).rowsAffected ?? 0;
  return affectedRows > 0;
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

export async function deleteSystemConfigByPrefix(prefix: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(systemConfig).where(like(systemConfig.key, `${prefix}%`));
}

/**
 * Execute a callback inside a MySQL transaction.
 * All DB operations within the callback share the same connection and are
 * committed atomically. On any error the entire transaction is rolled back.
 *
 * FIX(2026-04-22): Added to support atomic revenue-share processing.
 * Usage:
 *   await runInTransaction(async (tx) => {
 *     await tx.update(users).set(...).where(...);
 *     await tx.insert(fundTransactions).values(...);
 *   });
 */
export async function runInTransaction<T>(
  callback: (tx: NonNullable<Awaited<ReturnType<typeof getDb>>>) => Promise<T>
): Promise<T> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return (db as any).transaction(callback);
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
    total: sql<string>`COALESCE(SUM(CASE WHEN status='approved' THEN CAST(amount AS DECIMAL) ELSE 0 END), 0)`,
    pending: sql<number>`SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END)`,
  }).from(deposits);
  const [withdrawalStats] = await db.select({
    total: sql<string>`COALESCE(SUM(CASE WHEN status='completed' THEN CAST(amount AS DECIMAL) ELSE 0 END), 0)`,
    pending: sql<number>`SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END)`,
  }).from(withdrawals);
  const [orderStats] = await db.select({
    totalProfit: sql<string>`COALESCE(SUM(CASE WHEN netPnl > 0 THEN netPnl ELSE 0 END), 0)`,
    totalLoss: sql<string>`COALESCE(SUM(CASE WHEN netPnl < 0 THEN ABS(netPnl) ELSE 0 END), 0)`,
    totalDeducted: sql<string>`COALESCE(SUM(revenueShareDeducted), 0)`,
    abnormal: sql<number>`SUM(CASE WHEN isAbnormal = 1 THEN 1 ELSE 0 END)`,
  }).from(copyOrders).where(sql`action IN ('close_long', 'close_short') AND status = 'closed'`);
  const [shareStats] = await db.select({
    total: sql<string>`COALESCE(SUM(${revenueShareRecords.amount}), 0)`,
  }).from(revenueShareRecords)
    .innerJoin(copyOrders, eq(revenueShareRecords.copyOrderId, copyOrders.id))
    .where(sql`${copyOrders.action} IN ('close_long', 'close_short') AND ${copyOrders.status} = 'closed'`);
  const totalDeducted = parseFloat(orderStats.totalDeducted || "0");
  const totalRevenueShare = parseFloat(shareStats.total || "0");
  return {
    totalUsers: Number(userCount.count),
    totalDeposits: parseFloat(depositStats.total || "0"),
    pendingDeposits: Number(depositStats.pending || 0),
    totalWithdrawals: parseFloat(withdrawalStats.total || "0"),
    pendingWithdrawals: Number(withdrawalStats.pending || 0),
    totalProfit: parseFloat(orderStats.totalProfit || "0"),
    totalLoss: parseFloat(orderStats.totalLoss || "0"),
    totalDeducted,
    totalRevenueShare,
    platformNetRevenue: totalDeducted - totalRevenueShare,
    abnormalOrders: Number(orderStats.abnormal || 0),
  };
}

export async function getTeamStats(userId: number) {
  const db = await getDb();
  if (!db) return { directCount: 0, directValidCount: 0, totalCount: 0, teamProfit: 0, teamRevenueShare: 0, umbrellaPerformance: 0, pLevel: 0 };
  // Direct referrals count (all)
  const [direct] = await db.select({ count: sql<number>`count(*)` }).from(users).where(eq(users.referrerId, userId));
  // Direct valid referrals (balance >= 100)
  const [directValid] = await db.select({ count: sql<number>`count(*)` })
    .from(users)
    .where(and(eq(users.referrerId, userId), gte(users.balance, "100")));
  // Recursively collect ALL team member IDs across all levels (BFS)
  const allTeamIds: number[] = [];
  let currentLevelIds = (await db.select({ id: users.id }).from(users).where(eq(users.referrerId, userId))).map(m => m.id);
  while (currentLevelIds.length > 0) {
    allTeamIds.push(...currentLevelIds);
    // Ensure all IDs are integers to prevent SQL injection
    const safeIds = currentLevelIds.map(id => parseInt(String(id), 10)).filter(id => !isNaN(id));
    if (safeIds.length === 0) break;
    const nextLevel = await db.select({ id: users.id }).from(users)
      .where(sql`referrerId IN (${sql.raw(safeIds.join(","))})`);
    currentLevelIds = nextLevel.map(m => m.id);
  }
  const totalCount = allTeamIds.length;
  let teamProfit = 0;
  if (allTeamIds.length > 0) {
    const safeTeamIds = allTeamIds.map(id => parseInt(String(id), 10)).filter(id => !isNaN(id));
    const [profitResult] = await db.select({ total: sql<string>`COALESCE(SUM(netPnl), 0)` })
      .from(copyOrders).where(sql`userId IN (${sql.raw(safeTeamIds.join(","))}) AND action IN ('close_long', 'close_short') AND status = 'closed'`);
    teamProfit = parseFloat(profitResult.total || "0");
  }
  // Revenue share received
  const [shareResult] = await db.select({ total: sql<string>`COALESCE(SUM(${revenueShareRecords.amount}), 0)` })
    .from(revenueShareRecords)
    .innerJoin(copyOrders, eq(revenueShareRecords.copyOrderId, copyOrders.id))
    .where(
      and(
        eq(revenueShareRecords.recipientId, userId),
        sql`${copyOrders.action} IN ('close_long', 'close_short')`,
        eq(copyOrders.status, 'closed')
      )
    );
  // Get user's own pLevel and umbrella performance
  const user = await getUserById(userId);

  // Calculate big-zone and small-zone performance (去大区取小区)
  // Get all direct referrals with their umbrellaPerformance
  const directRefs = await db
    .select({ id: users.id, umbrellaPerformance: users.umbrellaPerformance })
    .from(users)
    .where(eq(users.referrerId, userId));

  let bigZonePerformance = 0;
  let smallZonePerformance = 0;
  if (directRefs.length >= 2) {
    const branchPerfs = directRefs.map(r => parseFloat(r.umbrellaPerformance || "0"));
    const maxPerf = Math.max(...branchPerfs);
    const totalPerf = branchPerfs.reduce((sum, p) => sum + p, 0);
    bigZonePerformance = maxPerf;
    smallZonePerformance = Math.max(0, totalPerf - maxPerf);
  } else if (directRefs.length === 1) {
    bigZonePerformance = parseFloat(directRefs[0].umbrellaPerformance || "0");
    smallZonePerformance = 0;
  }

  return {
    directCount: Number(direct.count),
    directValidCount: Number(directValid.count),
    totalCount,
    teamProfit,
    teamRevenueShare: parseFloat(shareResult.total || "0"),
    umbrellaPerformance: parseFloat(user?.umbrellaPerformance || "0"),
    pLevel: user?.pLevel ?? 0,
    bigZonePerformance,
    smallZonePerformance,
  };
}

export async function getMyInvitees(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: users.id,
    name: users.name,
    email: users.email,
    balance: users.balance,
    pLevel: users.pLevel,
    isActive: users.isActive,
    createdAt: users.createdAt,
  }).from(users).where(eq(users.referrerId, userId)).orderBy(sql`${users.createdAt} DESC`);
}
