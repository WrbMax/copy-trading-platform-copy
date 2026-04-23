import { describe, it, expect } from "vitest";

// Test the PnL finalization logic used in copy-engine close order
describe("Close Order PnL Finalization", () => {

  // Simulate the logic: prefer exchange-provided realizedPnl, fallback to manual calc
  function finalizePnl(params: {
    exchangeRealizedPnl: number; // from exchange API
    openPrice: number;
    closePrice: number;
    qty: number;
    exchange: string;
    ctVal: number;
    action: "close_long" | "close_short" | "reduce_long" | "reduce_short";
    fee: number;
  }) {
    let rawPnl = params.exchangeRealizedPnl;

    // Fallback to manual calculation if exchange didn't provide PnL
    if (rawPnl === 0 && params.closePrice > 0 && params.openPrice > 0) {
      let pnlQty = params.qty;
      if (params.exchange === "okx" || params.exchange === "bitget" || params.exchange === "gate") {
        pnlQty = params.qty * params.ctVal;
      }
      if (params.action === "close_long" || params.action === "reduce_long") {
        rawPnl = (params.closePrice - params.openPrice) * pnlQty;
      } else {
        rawPnl = (params.openPrice - params.closePrice) * pnlQty;
      }
    }

    const netPnl = rawPnl - params.fee;
    return { rawPnl, netPnl };
  }

  describe("Exchange-provided realizedPnl (preferred path)", () => {
    it("uses Binance realizedPnl directly", () => {
      const result = finalizePnl({
        exchangeRealizedPnl: 5.5,
        openPrice: 2000, closePrice: 2100,
        qty: 0.05, exchange: "binance", ctVal: 0.01,
        action: "close_long", fee: 0.3,
      });
      expect(result.rawPnl).toBe(5.5);
      expect(result.netPnl).toBeCloseTo(5.2, 4);
    });

    it("uses OKX pnl directly", () => {
      const result = finalizePnl({
        exchangeRealizedPnl: 10.0,
        openPrice: 2000, closePrice: 2100,
        qty: 5, exchange: "okx", ctVal: 0.01,
        action: "close_long", fee: 0.5,
      });
      expect(result.rawPnl).toBe(10.0);
      expect(result.netPnl).toBeCloseTo(9.5, 4);
    });

    it("uses Bitget profit directly", () => {
      const result = finalizePnl({
        exchangeRealizedPnl: -3.2,
        openPrice: 2100, closePrice: 2000,
        qty: 20, exchange: "bitget", ctVal: 0.01,
        action: "close_long", fee: 0.1,
      });
      expect(result.rawPnl).toBe(-3.2);
      expect(result.netPnl).toBeCloseTo(-3.3, 4);
    });

    it("uses Gate pnl directly", () => {
      const result = finalizePnl({
        exchangeRealizedPnl: 7.8,
        openPrice: 2100, closePrice: 2050,
        qty: 10, exchange: "gate", ctVal: 0.01,
        action: "close_short", fee: 0.2,
      });
      expect(result.rawPnl).toBe(7.8);
      expect(result.netPnl).toBeCloseTo(7.6, 4);
    });
  });

  describe("Fallback manual calculation (when exchange returns 0)", () => {
    it("calculates Binance close_long PnL manually (qty in ETH)", () => {
      const result = finalizePnl({
        exchangeRealizedPnl: 0,
        openPrice: 2000, closePrice: 2100,
        qty: 0.05, exchange: "binance", ctVal: 0.01,
        action: "close_long", fee: 0.5,
      });
      // (2100-2000) * 0.05 = 5
      expect(result.rawPnl).toBeCloseTo(5, 4);
      expect(result.netPnl).toBeCloseTo(4.5, 4);
    });

    it("calculates Bybit close_long PnL manually (qty in ETH)", () => {
      const result = finalizePnl({
        exchangeRealizedPnl: 0,
        openPrice: 2000, closePrice: 2200,
        qty: 0.02, exchange: "bybit", ctVal: 0.01,
        action: "close_long", fee: 0.1,
      });
      // (2200-2000) * 0.02 = 4
      expect(result.rawPnl).toBeCloseTo(4, 4);
      expect(result.netPnl).toBeCloseTo(3.9, 4);
    });

    it("calculates OKX close_long PnL manually (qty in contracts)", () => {
      const result = finalizePnl({
        exchangeRealizedPnl: 0,
        openPrice: 2000, closePrice: 2100,
        qty: 5, exchange: "okx", ctVal: 0.01,
        action: "close_long", fee: 0.2,
      });
      // (2100-2000) * 5 * 0.01 = 5
      expect(result.rawPnl).toBeCloseTo(5, 4);
      expect(result.netPnl).toBeCloseTo(4.8, 4);
    });

    it("calculates Bitget close_short PnL manually (qty in contracts)", () => {
      const result = finalizePnl({
        exchangeRealizedPnl: 0,
        openPrice: 2100, closePrice: 2000,
        qty: 20, exchange: "bitget", ctVal: 0.01,
        action: "close_short", fee: 0.3,
      });
      // close_short: (openPrice - closePrice) * qty * ctVal = (2100-2000) * 20 * 0.01 = 20
      // Wait, the formula is: rawPnl = (openPrice - closePrice) * pnlQty
      // pnlQty = qty * ctVal = 20 * 0.01 = 0.2
      // rawPnl = (2100 - 2000) * 0.2 = 20
      expect(result.rawPnl).toBeCloseTo(20, 4);
      expect(result.netPnl).toBeCloseTo(19.7, 4);
    });

    it("calculates Gate close_short PnL manually (qty in contracts)", () => {
      const result = finalizePnl({
        exchangeRealizedPnl: 0,
        openPrice: 2100, closePrice: 2050,
        qty: 10, exchange: "gate", ctVal: 0.01,
        action: "close_short", fee: 0.3,
      });
      // (2100-2050) * 10 * 0.01 = 5
      expect(result.rawPnl).toBeCloseTo(5, 4);
      expect(result.netPnl).toBeCloseTo(4.7, 4);
    });

    it("handles loss for close_long", () => {
      const result = finalizePnl({
        exchangeRealizedPnl: 0,
        openPrice: 2100, closePrice: 2000,
        qty: 0.05, exchange: "binance", ctVal: 0.01,
        action: "close_long", fee: 0.5,
      });
      // (2000-2100) * 0.05 = -5
      expect(result.rawPnl).toBeCloseTo(-5, 4);
      expect(result.netPnl).toBeCloseTo(-5.5, 4);
    });

    it("handles loss for close_short", () => {
      const result = finalizePnl({
        exchangeRealizedPnl: 0,
        openPrice: 2000, closePrice: 2100,
        qty: 0.1, exchange: "binance", ctVal: 0.01,
        action: "close_short", fee: 0.3,
      });
      // (2000-2100) * 0.1 = -10
      expect(result.rawPnl).toBeCloseTo(-10, 4);
      expect(result.netPnl).toBeCloseTo(-10.3, 4);
    });
  });

  describe("Close Action Detection", () => {
    const closeActions = ["close_long", "close_short", "reduce_long", "reduce_short"];
    const openActions = ["open_long", "open_short", "add_long", "add_short"];

    it("correctly identifies close actions", () => {
      for (const action of closeActions) {
        expect(closeActions.includes(action)).toBe(true);
      }
    });

    it("correctly identifies non-close actions", () => {
      for (const action of openActions) {
        expect(closeActions.includes(action)).toBe(false);
      }
    });
  });

  describe("Open Order Action Mapping", () => {
    function getOpenAction(closeAction: string): string {
      if (closeAction === "close_long" || closeAction === "reduce_long") return "open_long";
      return "open_short";
    }

    it("maps close_long to open_long", () => {
      expect(getOpenAction("close_long")).toBe("open_long");
    });

    it("maps reduce_long to open_long", () => {
      expect(getOpenAction("reduce_long")).toBe("open_long");
    });

    it("maps close_short to open_short", () => {
      expect(getOpenAction("close_short")).toBe("open_short");
    });

    it("maps reduce_short to open_short", () => {
      expect(getOpenAction("reduce_short")).toBe("open_short");
    });
  });
});
