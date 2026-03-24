import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Test the differential revenue share calculation logic in isolation.
 * We mock all DB functions to verify the calculation produces correct amounts.
 */

// Track all calls to updateUser and addFundTransaction
let updateUserCalls: Array<{ userId: number; data: any }> = [];
let fundTransactionCalls: Array<any> = [];
let revenueShareRecordsCalls: Array<any[]> = [];
let updateCopyOrderCalls: Array<{ id: number; data: any }> = [];

// Mock user database
let mockUsers: Map<number, any> = new Map();
let mockAdminUser: any = null;
let mockReferralChain: Array<{ id: number; revenueShareRatio: string }> = [];

vi.mock("./db", () => ({
  getUserById: vi.fn(async (id: number) => {
    const user = mockUsers.get(id);
    return user ? { ...user } : null;
  }),
  getAdminUser: vi.fn(async () => mockAdminUser),
  getUserReferralChain: vi.fn(async (_userId: number) => [...mockReferralChain]),
  updateUser: vi.fn(async (userId: number, data: any) => {
    updateUserCalls.push({ userId, data });
    const user = mockUsers.get(userId);
    if (user) {
      mockUsers.set(userId, { ...user, ...data });
    }
  }),
  addFundTransaction: vi.fn(async (data: any) => {
    fundTransactionCalls.push(data);
  }),
  createRevenueShareRecords: vi.fn(async (records: any[]) => {
    revenueShareRecordsCalls.push(records);
  }),
  updateCopyOrder: vi.fn(async (id: number, data: any) => {
    updateCopyOrderCalls.push({ id, data });
  }),
}));

import { processRevenueShare } from "./revenue-share";

beforeEach(() => {
  updateUserCalls = [];
  fundTransactionCalls = [];
  revenueShareRecordsCalls = [];
  updateCopyOrderCalls = [];
  mockUsers = new Map();
  mockAdminUser = null;
  mockReferralChain = [];
});

describe("processRevenueShare - differential calculation", () => {
  it("should not process if netPnl <= 0", async () => {
    mockUsers.set(1, { id: 1, balance: "100", revenueShareRatio: "30" });
    await processRevenueShare({ copyOrderId: 1, traderId: 1, netPnl: -10 });
    expect(updateUserCalls).toHaveLength(0);
  });

  it("should not process if trader has no revenue share ratio", async () => {
    mockUsers.set(1, { id: 1, balance: "100", revenueShareRatio: "0" });
    await processRevenueShare({ copyOrderId: 1, traderId: 1, netPnl: 100 });
    expect(updateUserCalls).toHaveLength(0);
  });

  it("2-level chain: A(10%) → B(10%) → C(30%), C profits 100U", async () => {
    // C = trader (id=3, ratio=30%)
    // B = C's referrer (id=2, ratio=10%)
    // A = B's referrer / admin (id=1, ratio=10%)
    mockUsers.set(3, { id: 3, balance: "200", revenueShareRatio: "30" });
    mockUsers.set(2, { id: 2, balance: "50", revenueShareRatio: "10" });
    mockUsers.set(1, { id: 1, balance: "100", revenueShareRatio: "10" });

    // Chain from C: [B, A]
    mockReferralChain = [
      { id: 2, revenueShareRatio: "10" },
      { id: 1, revenueShareRatio: "10" },
    ];

    await processRevenueShare({ copyOrderId: 100, traderId: 3, netPnl: 100 });

    // Revenue share records should be created
    expect(revenueShareRecordsCalls).toHaveLength(1);
    const records = revenueShareRecordsCalls[0];

    // B should receive: 100 × (30% - 10%) = 20U
    const bRecord = records.find((r: any) => r.recipientId === 2);
    expect(bRecord).toBeDefined();
    expect(parseFloat(bRecord.amount)).toBeCloseTo(20, 4);
    expect(parseFloat(bRecord.ratio)).toBeCloseTo(20, 2);

    // A should receive: 100 × (10% - 0%) = 10U (since A has no parent, diff = 10% - 0%)
    // Wait - A's ratio is 10%, and A is the top of chain. 
    // childRatio for A = B's ratio = 10%, A's ownRatio = 10%, diff = 0
    // Actually A should receive 0 in this case because B's ratio equals A's ratio!
    // Let me reconsider... 
    // 
    // The chain is [B(ratio=10%), A(ratio=10%)]
    // childRatio starts at traderRatio = 30%
    // B: diff = 30% - 10% = 20%, B gets 20U, childRatio becomes 10%
    // A: diff = 10% - 10% = 0%, A gets 0U
    //
    // Total distributed = 20U, total deducted from C = 30U
    // The remaining 10U goes to... nobody? This is the platform's share.
    // This is correct because A set B's ratio to 10%, and A's own ratio is also 10%,
    // meaning A doesn't earn from this chain. The 10U is "lost" (platform income).
    const aRecord = records.find((r: any) => r.recipientId === 1);
    expect(aRecord).toBeUndefined(); // A gets nothing because diff = 0

    // C should be deducted 30U total
    const traderDeduction = fundTransactionCalls.find(
      (t: any) => t.userId === 3 && t.type === "revenue_share_out"
    );
    expect(traderDeduction).toBeDefined();
    expect(parseFloat(traderDeduction.amount)).toBeCloseTo(-30, 4);
  });

  it("2-level chain: A(0%) → B(10%) → C(30%), C profits 100U", async () => {
    // A is admin with ratio 0% (top level, doesn't get charged by anyone)
    mockUsers.set(3, { id: 3, balance: "200", revenueShareRatio: "30" });
    mockUsers.set(2, { id: 2, balance: "50", revenueShareRatio: "10" });
    mockUsers.set(1, { id: 1, balance: "100", revenueShareRatio: "0" });

    mockReferralChain = [
      { id: 2, revenueShareRatio: "10" },
      { id: 1, revenueShareRatio: "0" },
    ];

    await processRevenueShare({ copyOrderId: 101, traderId: 3, netPnl: 100 });

    const records = revenueShareRecordsCalls[0];

    // B: diff = 30% - 10% = 20%, gets 20U
    const bRecord = records.find((r: any) => r.recipientId === 2);
    expect(bRecord).toBeDefined();
    expect(parseFloat(bRecord.amount)).toBeCloseTo(20, 4);

    // A: diff = 10% - 0% = 10%, gets 10U
    const aRecord = records.find((r: any) => r.recipientId === 1);
    expect(aRecord).toBeDefined();
    expect(parseFloat(aRecord.amount)).toBeCloseTo(10, 4);

    // Total distributed = 30U = total deducted from C
    // C deducted 30U
    const traderDeduction = fundTransactionCalls.find(
      (t: any) => t.userId === 3 && t.type === "revenue_share_out"
    );
    expect(parseFloat(traderDeduction.amount)).toBeCloseTo(-30, 4);
  });

  it("1-level chain: B(10%) → C(30%), C profits 100U", async () => {
    mockUsers.set(3, { id: 3, balance: "200", revenueShareRatio: "30" });
    mockUsers.set(2, { id: 2, balance: "50", revenueShareRatio: "10" });

    mockReferralChain = [
      { id: 2, revenueShareRatio: "10" },
    ];

    await processRevenueShare({ copyOrderId: 102, traderId: 3, netPnl: 100 });

    const records = revenueShareRecordsCalls[0];

    // B: diff = 30% - 10% = 20%, gets 20U
    const bRecord = records.find((r: any) => r.recipientId === 2);
    expect(bRecord).toBeDefined();
    expect(parseFloat(bRecord.amount)).toBeCloseTo(20, 4);

    // C deducted 30U, but only 20U distributed to B
    // The remaining 10U is platform income (not explicitly tracked to anyone)
    const traderDeduction = fundTransactionCalls.find(
      (t: any) => t.userId === 3 && t.type === "revenue_share_out"
    );
    expect(parseFloat(traderDeduction.amount)).toBeCloseTo(-30, 4);
  });

  it("3-level chain: A(0%) → B(5%) → C(15%) → D(40%), D profits 200U", async () => {
    mockUsers.set(4, { id: 4, balance: "500", revenueShareRatio: "40" });
    mockUsers.set(3, { id: 3, balance: "100", revenueShareRatio: "15" });
    mockUsers.set(2, { id: 2, balance: "50", revenueShareRatio: "5" });
    mockUsers.set(1, { id: 1, balance: "1000", revenueShareRatio: "0" });

    mockReferralChain = [
      { id: 3, revenueShareRatio: "15" },
      { id: 2, revenueShareRatio: "5" },
      { id: 1, revenueShareRatio: "0" },
    ];

    await processRevenueShare({ copyOrderId: 103, traderId: 4, netPnl: 200 });

    const records = revenueShareRecordsCalls[0];

    // D deducted: 200 × 40% = 80U
    // C: diff = 40% - 15% = 25%, gets 200 × 25% = 50U
    // B: diff = 15% - 5% = 10%, gets 200 × 10% = 20U
    // A: diff = 5% - 0% = 5%, gets 200 × 5% = 10U
    // Total distributed: 50 + 20 + 10 = 80U = total deducted ✓

    const cRecord = records.find((r: any) => r.recipientId === 3);
    expect(cRecord).toBeDefined();
    expect(parseFloat(cRecord.amount)).toBeCloseTo(50, 4);

    const bRecord = records.find((r: any) => r.recipientId === 2);
    expect(bRecord).toBeDefined();
    expect(parseFloat(bRecord.amount)).toBeCloseTo(20, 4);

    const aRecord = records.find((r: any) => r.recipientId === 1);
    expect(aRecord).toBeDefined();
    expect(parseFloat(aRecord.amount)).toBeCloseTo(10, 4);

    const traderDeduction = fundTransactionCalls.find(
      (t: any) => t.userId === 4 && t.type === "revenue_share_out"
    );
    expect(parseFloat(traderDeduction.amount)).toBeCloseTo(-80, 4);
  });

  it("no referral chain, falls back to admin", async () => {
    mockUsers.set(3, { id: 3, balance: "200", revenueShareRatio: "30" });
    mockAdminUser = { id: 1, revenueShareRatio: "0" };
    mockUsers.set(1, { id: 1, balance: "500", revenueShareRatio: "0" });
    mockReferralChain = [];

    await processRevenueShare({ copyOrderId: 104, traderId: 3, netPnl: 100 });

    const records = revenueShareRecordsCalls[0];

    // Admin (ratio=0%): diff = 30% - 0% = 30%, gets 100 × 30% = 30U
    const adminRecord = records.find((r: any) => r.recipientId === 1);
    expect(adminRecord).toBeDefined();
    expect(parseFloat(adminRecord.amount)).toBeCloseTo(30, 4);
  });

  it("no referral chain and no admin — deducts as platform income", async () => {
    mockUsers.set(3, { id: 3, balance: "200", revenueShareRatio: "30" });
    mockAdminUser = null;
    mockReferralChain = [];

    await processRevenueShare({ copyOrderId: 105, traderId: 3, netPnl: 100 });

    // Should still deduct from trader
    const traderDeduction = fundTransactionCalls.find(
      (t: any) => t.userId === 3 && t.type === "revenue_share_out"
    );
    expect(traderDeduction).toBeDefined();
    expect(parseFloat(traderDeduction.amount)).toBeCloseTo(-30, 4);
    expect(traderDeduction.note).toContain("归平台");

    // No revenue share records created (no recipients)
    expect(revenueShareRecordsCalls).toHaveLength(0);
  });

  it("balance check: trader balance should not go below 0", async () => {
    mockUsers.set(3, { id: 3, balance: "10", revenueShareRatio: "30" }); // Only 10U balance
    mockUsers.set(2, { id: 2, balance: "50", revenueShareRatio: "0" });
    mockReferralChain = [{ id: 2, revenueShareRatio: "0" }];

    await processRevenueShare({ copyOrderId: 106, traderId: 3, netPnl: 100 });

    // Trader should be deducted 30U but balance capped at 0
    const traderUpdate = updateUserCalls.find((c) => c.userId === 3);
    expect(traderUpdate).toBeDefined();
    expect(parseFloat(traderUpdate.data.balance)).toBe(0); // Max(0, 10 - 30) = 0
  });
});
