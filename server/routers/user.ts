import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  getAdminDashboardStats,
  getExchangeApisByUserId,
  getMyInvitees,
  getTeamStats,
  getUserById,
  listRevenueShareRecords,
  listUsers,
  searchUsers,
  updateUser,
  listCopyOrders,
  getUserOrderStats,
  listDeposits,
  listWithdrawals,
  listFundTransactions,
} from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { adminProcedure } from "../_core/trpc";

export const userRouter = router({
  profile: protectedProcedure.query(async ({ ctx }) => {
    const user = await getUserById(ctx.user.id);
    if (!user) throw new TRPCError({ code: "NOT_FOUND" });
    // Use real-time stats from copy_orders as single source of truth
    const orderStats = await getUserOrderStats(ctx.user.id);
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      inviteCode: user.inviteCode,
      balance: user.balance,
      points: user.points,
      totalProfit: orderStats.totalProfit.toFixed(8),
      totalLoss: orderStats.totalLoss.toFixed(8),
      lastPointsRedeemMonth: user.lastPointsRedeemMonth,
      pLevel: user.pLevel ?? 0,
      umbrellaPerformance: user.umbrellaPerformance ?? "0",
      revenueShareRatio: user.revenueShareRatio,
      role: user.role,
      createdAt: user.createdAt,
    };
  }),

  teamStats: protectedProcedure.query(async ({ ctx }) => {
    return getTeamStats(ctx.user.id);
  }),

  myRevenueShares: protectedProcedure
    .input(z.object({ page: z.number().default(1), limit: z.number().default(20) }))
    .query(async ({ input, ctx }) => {
      return listRevenueShareRecords(ctx.user.id, input.page, input.limit);
    }),

  myInvitees: protectedProcedure.query(async ({ ctx }) => {
    return getMyInvitees(ctx.user.id);
  }),

  // Legacy: setInviteeRevenueShare is no longer used in the new mechanism
  // Kept as a no-op for backward compatibility if frontend still calls it
  setInviteeRevenueShare: protectedProcedure
    .input(z.object({ inviteeId: z.number(), ratio: z.number().min(0).max(70) }))
    .mutation(async ({ input, ctx }) => {
      // In the new mechanism, revenue share ratios are determined by P levels and direct referral counts
      // This endpoint is deprecated
      return { success: true, deprecated: true };
    }),

  // 查看直推成员的交易记录（只能查看自己直接邀请的人）
  inviteeMemberOrders: protectedProcedure
    .input(z.object({ inviteeId: z.number(), page: z.number().default(1), limit: z.number().default(20) }))
    .query(async ({ input, ctx }) => {
      const invitee = await getUserById(input.inviteeId);
      if (!invitee) throw new TRPCError({ code: "NOT_FOUND", message: "用户不存在" });
      if (invitee.referrerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "您只能查看自己直接邀请的成员" });
      const orders = await listCopyOrders(input.inviteeId, input.page, input.limit);
      const stats = await getUserOrderStats(input.inviteeId);
      return { ...orders, stats, inviteeName: invitee.name || `用户#${invitee.id}` };
    }),

  // Admin
  adminDashboard: adminProcedure.query(async () => {
    return getAdminDashboardStats();
  }),

  adminList: adminProcedure
    .input(z.object({
      page: z.number().default(1),
      limit: z.number().default(20),
      keyword: z.string().optional(),
      pLevel: z.number().optional(),
      isActive: z.boolean().optional(),
      sortBy: z.enum(["createdAt", "balance", "pLevel"]).optional(),
      sortOrder: z.enum(["asc", "desc"]).optional(),
    }))
    .query(async ({ input }) => {
      let result;
      if (input.keyword) {
        result = await searchUsers(input.keyword, input.page, input.limit);
      } else {
        result = await listUsers(input.page, input.limit, {
          pLevel: input.pLevel,
          isActive: input.isActive,
          sortBy: input.sortBy,
          sortOrder: input.sortOrder,
        });
      }
      const { items, total } = result;
      const enriched = await Promise.all(items.map(async (u) => {
        const apis = await getExchangeApisByUserId(u.id);
        return {
          ...u,
          hasExchangeApi: apis.length > 0,
          exchangeApiCount: apis.length,
          exchangeTypes: Array.from(new Set(apis.map((a) => a.exchange))),
        };
      }));
      return { items: enriched, total };
    }),

  adminGetUser: adminProcedure
    .input(z.object({ userId: z.number() }))
    .query(async ({ input }) => {
      const user = await getUserById(input.userId);
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });
      const apis = await getExchangeApisByUserId(input.userId);
      const teamStats = await getTeamStats(input.userId);
      return {
        ...user,
        apis: apis.map((a) => ({ ...a, apiKeyEncrypted: "****", secretKeyEncrypted: "****", passphraseEncrypted: a.passphraseEncrypted ? "****" : null })),
        teamStats,
      };
    }),

  adminGetInvitees: adminProcedure
    .input(z.object({ userId: z.number() }))
    .query(async ({ input }) => {
      return getMyInvitees(input.userId);
    }),

  adminToggleUser: adminProcedure
    .input(z.object({ userId: z.number(), isActive: z.boolean() }))
    .mutation(async ({ input }) => {
      await updateUser(input.userId, { isActive: input.isActive });
      return { success: true };
    }),

  // Admin: manually set user P level (legacy ratio endpoint kept for compatibility)
  adminSetRevenueShareRatio: adminProcedure
    .input(z.object({
      userId: z.number(),
      ratio: z.number().min(0).max(70),
    }))
    .mutation(async ({ input }) => {
      // Legacy endpoint — in new mechanism, P levels are auto-calculated
      // But admin can still manually override
      const user = await getUserById(input.userId);
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });
      await updateUser(input.userId, { revenueShareRatio: input.ratio.toFixed(2) });
      return { success: true };
    }),

  // Admin: manually set user P level
  adminSetUserPLevel: adminProcedure
    .input(z.object({
      userId: z.number(),
      pLevel: z.number().min(0).max(7),
    }))
    .mutation(async ({ input }) => {
      const user = await getUserById(input.userId);
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });
      await updateUser(input.userId, { pLevel: input.pLevel });
      return { success: true };
    }),

  adminRevenueShareRecords: adminProcedure
    .input(z.object({
      page: z.number().default(1),
      limit: z.number().default(20),
      rewardType: z.string().optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      keyword: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const { page, limit, dateFrom, dateTo, ...rest } = input;
      return listRevenueShareRecords(undefined, page, limit, {
        ...rest,
        dateFrom: dateFrom ? new Date(dateFrom) : undefined,
        dateTo: dateTo ? new Date(dateTo) : undefined,
      });
    }),

  // 搜索用户（支持ID、用户名、邮箱）
  adminSearchUsers: adminProcedure
    .input(z.object({ keyword: z.string(), page: z.number().default(1), limit: z.number().default(20) }))
    .query(async ({ input }) => {
      const { items, total } = await searchUsers(input.keyword, input.page, input.limit);
      const enriched = await Promise.all(items.map(async (u) => {
        const apis = await getExchangeApisByUserId(u.id);
        return {
          ...u,
          hasExchangeApi: apis.length > 0,
          exchangeApiCount: apis.length,
          exchangeTypes: Array.from(new Set(apis.map((a) => a.exchange))),
        };
      }));
      return { items: enriched, total };
    }),

  // 查看指定用户的充值记录
  adminGetUserDeposits: adminProcedure
    .input(z.object({ userId: z.number(), page: z.number().default(1), limit: z.number().default(20) }))
    .query(async ({ input }) => {
      return listDeposits(input.userId, input.page, input.limit);
    }),

  // 查看指定用户的提现记录
  adminGetUserWithdrawals: adminProcedure
    .input(z.object({ userId: z.number(), page: z.number().default(1), limit: z.number().default(20) }))
    .query(async ({ input }) => {
      return listWithdrawals(input.userId, input.page, input.limit);
    }),

  // 查看指定用户的资金流水（包含所有类型）
  adminGetUserFundTransactions: adminProcedure
    .input(z.object({ userId: z.number(), page: z.number().default(1), limit: z.number().default(20) }))
    .query(async ({ input }) => {
      return listFundTransactions(input.userId, input.page, input.limit);
    }),

  // 查看指定用户的交易订单
  adminGetUserOrders: adminProcedure
    .input(z.object({ userId: z.number(), page: z.number().default(1), limit: z.number().default(20) }))
    .query(async ({ input }) => {
      const [orders, stats] = await Promise.all([
        listCopyOrders(input.userId, input.page, input.limit),
        getUserOrderStats(input.userId),
      ]);
      return { ...orders, stats };
    }),
});
