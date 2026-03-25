import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  getAdminDashboardStats,
  getExchangeApisByUserId,
  getSystemConfig,
  getMyInvitees,
  getTeamStats,
  getUserById,
  listRevenueShareRecords,
  listUsers,
  updateUser,
} from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { adminProcedure } from "../_core/trpc";

export const userRouter = router({
  profile: protectedProcedure.query(async ({ ctx }) => {
    const user = await getUserById(ctx.user.id);
    if (!user) throw new TRPCError({ code: "NOT_FOUND" });
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      inviteCode: user.inviteCode,
      balance: user.balance,
      points: user.points,
      totalProfit: user.totalProfit,
      totalLoss: user.totalLoss,
      lastPointsRedeemMonth: user.lastPointsRedeemMonth,
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

  setInviteeRevenueShare: protectedProcedure
    .input(z.object({ inviteeId: z.number(), ratio: z.number().min(0).max(70) }))
    .mutation(async ({ input, ctx }) => {
      // Verify the invitee is actually invited by this user
      const invitee = await getUserById(input.inviteeId);
      if (!invitee) throw new TRPCError({ code: "NOT_FOUND", message: "用户不存在" });
      if (invitee.referrerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "您只能给自己邀请的人设置分成比例" });
      // Invitee's ratio must be >= user's own ratio and <= 70%
      const currentUser = await getUserById(ctx.user.id);
      const myRatio = parseFloat(currentUser?.revenueShareRatio || "0");
      if (input.ratio < myRatio) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `分成比例不能低于您自己的比例 (${myRatio}%)` });
      }
      if (input.ratio > 70) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "分成比例不能超过70%" });
      }
      await updateUser(input.inviteeId, { revenueShareRatio: input.ratio.toFixed(2) });
      return { success: true };
    }),

  // Admin
  adminDashboard: adminProcedure.query(async () => {
    return getAdminDashboardStats();
  }),

  adminList: adminProcedure
    .input(z.object({ page: z.number().default(1), limit: z.number().default(20) }))
    .query(async ({ input }) => {
      const { items, total } = await listUsers(input.page, input.limit);
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

  adminSetRevenueShareRatio: adminProcedure
    .input(z.object({
      userId: z.number(),
      ratio: z.number().min(0).max(70),
    }))
    .mutation(async ({ input }) => {
      if (input.ratio > 70) throw new TRPCError({ code: "BAD_REQUEST", message: "分成比例不能超过70%" });

      const user = await getUserById(input.userId);
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });

      await updateUser(input.userId, { revenueShareRatio: input.ratio.toFixed(2) });
      return { success: true };
    }),

  adminRevenueShareRecords: adminProcedure
    .input(z.object({ page: z.number().default(1), limit: z.number().default(20) }))
    .query(async ({ input }) => {
      return listRevenueShareRecords(undefined, input.page, input.limit);
    }),
});
