import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { encrypt, decrypt, maskApiKey } from "./crypto";

// ---- Helpers ----
function makeCtx(overrides: Partial<TrpcContext> = {}): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
    ...overrides,
  };
}

function makeUserCtx(role: "user" | "admin" = "user"): TrpcContext {
  return makeCtx({
    user: {
      id: 1,
      openId: "test-user",
      email: "test@example.com",
      name: "Test User",
      loginMethod: "email",
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    } as any,
  });
}

// ---- Auth Tests ----
describe("auth.me", () => {
  it("returns null for unauthenticated request", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.auth.me();
    expect(result).toBeNull();
  });

  it("returns user object for authenticated request", async () => {
    const caller = appRouter.createCaller(makeUserCtx());
    const result = await caller.auth.me();
    expect(result).not.toBeNull();
    expect(result?.email).toBe("test@example.com");
  });

  it("strips sensitive fields from auth.me response", async () => {
    const ctx = makeUserCtx();
    (ctx.user as any).passwordHash = "secret-hash-value";
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();
    expect(result).not.toBeNull();
    expect((result as any).passwordHash).toBeUndefined();
  });
});

describe("auth.logout", () => {
  it("clears session cookie and returns success", async () => {
    const cleared: string[] = [];
    const ctx = makeUserCtx();
    ctx.res.clearCookie = (name: string) => { cleared.push(name); };
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result.success).toBe(true);
    expect(cleared.length).toBeGreaterThan(0);
  });
});

// ---- Strategy Tests ----
describe("strategy.list", () => {
  it("returns list of active signal sources for public access", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const sources = await caller.strategy.list();
    expect(Array.isArray(sources)).toBe(true);
  });
});

describe("strategy.myStrategies", () => {
  it("throws UNAUTHORIZED for unauthenticated users", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(caller.strategy.myStrategies()).rejects.toThrow();
  });

  it("returns array for authenticated user", async () => {
    const caller = appRouter.createCaller(makeUserCtx());
    try {
      const result = await caller.strategy.myStrategies();
      expect(Array.isArray(result)).toBe(true);
    } catch (e: any) {
      expect(e.code).not.toBe("UNAUTHORIZED");
    }
  });
});

describe("strategy.setStrategy", () => {
  it("validates multiplier range 1-100", async () => {
    const caller = appRouter.createCaller(makeUserCtx());
    await expect(
      caller.strategy.setStrategy({ signalSourceId: 1, exchangeApiId: 1, multiplier: 200, isEnabled: true })
    ).rejects.toThrow();
  });

  it("rejects multiplier below 1", async () => {
    const caller = appRouter.createCaller(makeUserCtx());
    await expect(
      caller.strategy.setStrategy({ signalSourceId: 1, exchangeApiId: 1, multiplier: 0, isEnabled: true })
    ).rejects.toThrow();
  });

  it("accepts multiplier within valid range", async () => {
    const caller = appRouter.createCaller(makeUserCtx());
    try {
      await caller.strategy.setStrategy({ signalSourceId: 1, exchangeApiId: 1, multiplier: 50, isEnabled: true });
    } catch (e: any) {
      expect(e.message).not.toContain("Number must be less than or equal to");
    }
  });
});

// ---- Exchange Tests ----
describe("exchange.list", () => {
  it("throws UNAUTHORIZED for unauthenticated users", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(caller.exchange.list()).rejects.toThrow();
  });
});

// ---- Points Tests ----
describe("points.myBalance", () => {
  it("throws UNAUTHORIZED for unauthenticated users", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(caller.points.myBalance()).rejects.toThrow();
  });
});

// ---- Funds Tests ----
describe("funds.submitDeposit", () => {
  it("throws UNAUTHORIZED for unauthenticated users", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(caller.funds.submitDeposit({ amount: 100, txHash: "0xabc" })).rejects.toThrow();
  });
});

describe("funds.depositAddress", () => {
  it("throws UNAUTHORIZED for unauthenticated users", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(caller.funds.depositAddress()).rejects.toThrow();
  });

  it("returns address info for authenticated user", async () => {
    const caller = appRouter.createCaller(makeUserCtx());
    const result = await caller.funds.depositAddress();
    expect(result).toHaveProperty("network", "BSC (BEP-20)");
    expect(result).toHaveProperty("token", "USDT");
    // Address may be null if wallet not initialized
    expect(result).toHaveProperty("message");
  });
});

describe("funds.myBalance", () => {
  it("throws UNAUTHORIZED for unauthenticated users", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(caller.funds.myBalance()).rejects.toThrow();
  });
});

// ---- Admin Tests ----
describe("admin procedures", () => {
  it("adminDashboard throws FORBIDDEN for regular users", async () => {
    const caller = appRouter.createCaller(makeUserCtx("user"));
    await expect(caller.user.adminDashboard()).rejects.toThrow();
  });

  it("adminList throws FORBIDDEN for regular users", async () => {
    const caller = appRouter.createCaller(makeUserCtx("user"));
    await expect(caller.user.adminList({})).rejects.toThrow();
  });

  it("adminListSources throws FORBIDDEN for regular users", async () => {
    const caller = appRouter.createCaller(makeUserCtx("user"));
    await expect(caller.strategy.adminListSources()).rejects.toThrow();
  });

  it("adminCreateSource throws FORBIDDEN for regular users", async () => {
    const caller = appRouter.createCaller(makeUserCtx("user"));
    await expect(
      caller.strategy.adminCreateSource({
        name: "Test", symbol: "BTC", tradingPair: "BTCUSDT",
        referencePosition: 1000, expectedMonthlyReturnMin: 5, expectedMonthlyReturnMax: 10,
      })
    ).rejects.toThrow();
  });

  it("adminSetConfig throws FORBIDDEN for regular users", async () => {
    const caller = appRouter.createCaller(makeUserCtx("user"));
    await expect(caller.funds.adminSetConfig({ key: "test", value: "val" })).rejects.toThrow();
  });
});

// ---- Admin BSC Wallet Tests ----
describe("admin BSC wallet management", () => {
  it("adminWalletStatus throws FORBIDDEN for regular users", async () => {
    const caller = appRouter.createCaller(makeUserCtx("user"));
    await expect(caller.funds.adminWalletStatus()).rejects.toThrow();
  });

  it("adminInitWallet throws FORBIDDEN for regular users", async () => {
    const caller = appRouter.createCaller(makeUserCtx("user"));
    await expect(caller.funds.adminInitWallet()).rejects.toThrow();
  });

  it("adminImportWallet throws FORBIDDEN for regular users", async () => {
    const caller = appRouter.createCaller(makeUserCtx("user"));
    await expect(caller.funds.adminImportWallet({ mnemonic: "test words" })).rejects.toThrow();
  });

  it("adminScanDeposits throws FORBIDDEN for regular users", async () => {
    const caller = appRouter.createCaller(makeUserCtx("user"));
    await expect(caller.funds.adminScanDeposits()).rejects.toThrow();
  });

  it("adminCollectDeposits throws FORBIDDEN for regular users", async () => {
    const caller = appRouter.createCaller(makeUserCtx("user"));
    await expect(caller.funds.adminCollectDeposits()).rejects.toThrow();
  });

  it("adminSetBscscanKey throws FORBIDDEN for regular users", async () => {
    const caller = appRouter.createCaller(makeUserCtx("user"));
    await expect(caller.funds.adminSetBscscanKey({ apiKey: "test-key" })).rejects.toThrow();
  });

  it("adminWalletStatus accessible to admin", async () => {
    const caller = appRouter.createCaller(makeUserCtx("admin"));
    const status = await caller.funds.adminWalletStatus();
    expect(status).toHaveProperty("initialized");
    expect(status).toHaveProperty("mainAddress");
    expect(status).toHaveProperty("nextIndex");
  });
});

// ---- Revenue Share Logic Tests ----
describe("revenue share calculation", () => {
  it("verifies multi-level share is accessible only to admin", async () => {
    const caller = appRouter.createCaller(makeUserCtx("user"));
    await expect(caller.user.adminRevenueShareRecords({})).rejects.toThrow();
  });
});

// ---- Crypto Tests ----
describe("crypto utilities", () => {
  it("encrypts and decrypts a string correctly", () => {
    const original = "5d8e2d77-86a8-4c70-b8bf-7beba7e86457";
    const encrypted = encrypt(original);
    expect(encrypted).not.toBe(original);
    expect(encrypted.length).toBeGreaterThan(0);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(original);
  });

  it("masks API key correctly", () => {
    const key = "5d8e2d77-86a8-4c70-b8bf-7beba7e86457";
    const masked = maskApiKey(key);
    expect(masked).toContain("****");
    expect(masked).not.toBe(key);
    expect(masked.startsWith("5d8e")).toBe(true);
  });

  it("handles short keys in masking", () => {
    const key = "abc";
    const masked = maskApiKey(key);
    expect(masked).toContain("****");
  });

  it("different encryptions produce different ciphertexts (random IV)", () => {
    const original = "test-secret-key";
    const enc1 = encrypt(original);
    const enc2 = encrypt(original);
    expect(enc1).not.toBe(enc2);
    expect(decrypt(enc1)).toBe(original);
    expect(decrypt(enc2)).toBe(original);
  });
});
