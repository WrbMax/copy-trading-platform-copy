/**
 * Email service - sends verification codes via console in development.
 * In production, integrate with an email provider (e.g., SendGrid, Resend).
 */
export async function sendVerificationEmail(email: string, code: string, type: "register" | "login" | "reset_password"): Promise<void> {
  const typeLabels = {
    register: "注册验证码",
    login: "登录验证码",
    reset_password: "重置密码验证码",
  };
  const label = typeLabels[type];
  // In development, log to console
  console.log(`[Email] Sending ${label} to ${email}: ${code} (valid for 10 minutes)`);
  // TODO: Integrate real email provider in production
  // Example with Resend:
  // await resend.emails.send({
  //   from: 'noreply@yourdomain.com',
  //   to: email,
  //   subject: `策略跟单平台 - ${label}`,
  //   html: `<p>您的${label}是：<strong>${code}</strong>，10分钟内有效。</p>`,
  // });
}
