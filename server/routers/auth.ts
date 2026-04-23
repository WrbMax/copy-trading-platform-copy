import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  createEmailUser,
  createVerificationCode,
  getUserByEmail,
  getUserByInviteCode,
  updateUser,
  verifyCode,
} from "../db";
import {
  generateInviteCode,
  generateVerificationCode,
  hashPassword,
  verifyPassword,
} from "../crypto";
import { sendVerificationEmail } from "../email";
import { publicProcedure, router } from "../_core/trpc";
import { COOKIE_NAME } from "../../shared/const";
import { getSessionCookieOptions } from "../_core/cookies";
import { SignJWT } from "jose";
import { ENV } from "../_core/env";

export const authRouter = router({
  me: publicProcedure.query((opts) => {
    if (!opts.ctx.user) return null;
    // Strip sensitive fields
    const { passwordHash, ...safeUser } = opts.ctx.user;
    return safeUser;
  }),

  logout: publicProcedure.mutation(({ ctx }) => {
    const cookieOptions = getSessionCookieOptions(ctx.req);
    ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    return { success: true } as const;
  }),

  sendCode: publicProcedure
    .input(z.object({
      email: z.string().email(),
      type: z.enum(["register", "login", "reset_password"]),
    }))
    .mutation(async ({ input }) => {
      const code = generateVerificationCode();
      await createVerificationCode(input.email, input.type, code);
      await sendVerificationEmail(input.email, code, input.type);
      return { success: true };
    }),

  register: publicProcedure
    .input(z.object({
      email: z.string().email(),
      password: z.string().min(8),
      name: z.string().min(1).max(50),
      inviteCode: z.string().min(1, "邀请码为必填项"),
    }))
    .mutation(async ({ input, ctx }) => {
      // Check email not taken
      const existing = await getUserByEmail(input.email);
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "该邮箱已注册" });

      // Resolve referrer (required)
      const referrer = await getUserByInviteCode(input.inviteCode);
      if (!referrer) throw new TRPCError({ code: "BAD_REQUEST", message: "邀请码无效" });
      const referrerId = referrer.id;

      const passwordHash = hashPassword(input.password);
      const myInviteCode = generateInviteCode();
      const user = await createEmailUser({
        email: input.email,
        passwordHash,
        name: input.name,
        inviteCode: myInviteCode,
        referrerId,
        revenueShareRatio: "50.00",
      });
      if (!user) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "注册失败" });

      // Issue session cookie (include appId and name for verifySession compatibility)
      const token = await new SignJWT({ id: user.id, openId: user.openId, role: user.role, appId: ENV.appId, name: user.name ?? "" })
        .setProtectedHeader({ alg: "HS256" })
        .setExpirationTime("30d")
        .sign(new TextEncoder().encode(ENV.cookieSecret));
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: 30 * 24 * 60 * 60 * 1000 });

      return { success: true, user: { id: user.id, email: user.email, name: user.name } };
    }),

  login: publicProcedure
    .input(z.object({
      email: z.string().email(),
      password: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const user = await getUserByEmail(input.email);
      if (!user || !user.passwordHash) throw new TRPCError({ code: "UNAUTHORIZED", message: "邮箱或密码错误" });
      if (!user.isActive) throw new TRPCError({ code: "FORBIDDEN", message: "账户已被禁用" });

      const valid = verifyPassword(input.password, user.passwordHash);
      if (!valid) throw new TRPCError({ code: "UNAUTHORIZED", message: "邮箱或密码错误" });

      await updateUser(user.id, { lastSignedIn: new Date() });

      const token = await new SignJWT({ id: user.id, openId: user.openId, role: user.role, appId: ENV.appId, name: user.name ?? "" })
        .setProtectedHeader({ alg: "HS256" })
        .setExpirationTime("30d")
        .sign(new TextEncoder().encode(ENV.cookieSecret));
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: 30 * 24 * 60 * 60 * 1000 });

      return { success: true, user: { id: user.id, email: user.email, name: user.name, role: user.role } };
    }),

  resetPassword: publicProcedure
    .input(z.object({
      email: z.string().email(),
      code: z.string().min(6),
      newPassword: z.string().min(8),
    }))
    .mutation(async ({ input }) => {
      const valid = await verifyCode(input.email, input.code, "reset_password");
      if (!valid) throw new TRPCError({ code: "BAD_REQUEST", message: "验证码无效或已过期" });
      const user = await getUserByEmail(input.email);
      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "用户不存在" });
      await updateUser(user.id, { passwordHash: hashPassword(input.newPassword) });
      return { success: true };
    }),
});
