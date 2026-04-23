import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  addPointsTransaction,
  adjustPoints,
  getUserById,
  getUserByInviteCode,
  listPointsTransactions,
  listAllPointsTransactions,
} from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { adminProcedure } from "../_core/trpc";

export const pointsRouter = router({
  myBalance: protectedProcedure.query(async ({ ctx }) => {
    const user = await getUserById(ctx.user.id);
    return { points: user?.points ?? 0 };
  }),

  myTransactions: protectedProcedure
    .input(z.object({ page: z.number().default(1), limit: z.number().default(20) }))
    .query(async ({ input, ctx }) => {
      return listPointsTransactions(ctx.user.id, input.page, input.limit);
    }),

  // Transfer by invite code (more user-friendly than numeric userId)
  transfer: protectedProcedure
    .input(z.object({
      toInviteCode: z.string().min(1),
      amount: z.number().int().positive(),
    }))
    .mutation(async ({ input, ctx }) => {
      const sender = await getUserById(ctx.user.id);
      if (!sender) throw new TRPCError({ code: "NOT_FOUND" });

      // Find receiver by invite code
      const receiver = await getUserByInviteCode(input.toInviteCode.trim());
      if (!receiver) throw new TRPCError({ code: "NOT_FOUND", message: "未找到该邀请码对应的用户" });
      if (receiver.id === ctx.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "不能转给自己" });
      if ((sender.points ?? 0) < input.amount) throw new TRPCError({ code: "BAD_REQUEST", message: "Route 余额不足" });

      // Atomically adjust points to prevent concurrent race conditions
      const senderNew = await adjustPoints(ctx.user.id, -input.amount);
      const receiverNew = await adjustPoints(receiver.id, input.amount);

      await addPointsTransaction({
        userId: ctx.user.id, type: "transfer_out", amount: -input.amount, balanceAfter: senderNew,
        relatedUserId: receiver.id, note: `转出 Route 给 ${receiver.name || receiver.email}（邀请码 ${input.toInviteCode}）`,
      });
      await addPointsTransaction({
        userId: receiver.id, type: "transfer_in", amount: input.amount, balanceAfter: receiverNew,
        relatedUserId: ctx.user.id, note: `收到来自 ${sender.name || sender.email} 的 Route`,
      });

      return { success: true, receiverName: receiver.name || receiver.email };
    }),

  adminAdjust: adminProcedure
    .input(z.object({
      userId: z.number(),
      amount: z.number().int(),
      note: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const user = await getUserById(input.userId);
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });
      // Atomically adjust points
      const newPoints = await adjustPoints(input.userId, input.amount);
      await addPointsTransaction({
        userId: input.userId,
        type: input.amount > 0 ? "admin_add" : "admin_deduct",
        amount: input.amount,
        balanceAfter: newPoints,
        note: input.note ?? (input.amount > 0 ? "管理员增加 Route" : "管理员扣减 Route"),
      });
      return { success: true, newBalance: newPoints };
    }),

  adminAllTransactions: adminProcedure
    .input(z.object({ page: z.number().default(1), limit: z.number().default(20) }))
    .query(async ({ input }) => {
      return listAllPointsTransactions(input.page, input.limit);
    }),
});
