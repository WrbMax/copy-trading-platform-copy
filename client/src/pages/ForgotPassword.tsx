import { useState } from "react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, CheckCircle, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { AlphaRouteBrand } from "@/components/AlphaRouteLogo";
import { useLang } from "@/contexts/LangContext";

export default function ForgotPassword() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState<"email" | "reset">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState(0);
  const { lang, setLang } = useLang();

  const sendCodeMutation = trpc.auth.sendCode.useMutation({
    onSuccess: () => {
      toast.success(lang === "zh" ? "验证码已发送" : "Verification code sent");
      setStep("reset");
      let t = 60;
      setCountdown(t);
      const timer = setInterval(() => { t--; setCountdown(t); if (t <= 0) clearInterval(timer); }, 1000);
    },
    onError: (e) => setError(e.message),
  });

  const resetMutation = trpc.auth.resetPassword.useMutation({
    onSuccess: () => {
      toast.success(lang === "zh" ? "密码重置成功，请重新登录" : "Password reset successful");
      navigate("/login");
    },
    onError: (e) => setError(e.message),
  });

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Brand header */}
        <div className="flex flex-col items-center gap-4 mb-8">
          <AlphaRouteBrand
            logoSize={44}
            showSubtitle
            subtitle={lang === "zh" ? "专业 AI 策略平台" : "Professional AI Strategy"}
            onClick={() => navigate("/landing")}
            className="scale-110"
          />
          {/* Language toggle */}
          <div className="flex items-center gap-2 text-xs">
            <button
              onClick={() => setLang("zh")}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                lang === "zh"
                  ? "bg-primary/20 text-primary font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              中文
            </button>
            <span className="text-muted-foreground/40">|</span>
            <button
              onClick={() => setLang("en")}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                lang === "en"
                  ? "bg-primary/20 text-primary font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              English
            </button>
          </div>
        </div>

        <Card className="bg-card border-border">
          <CardHeader className="pb-4">
            <CardTitle>
              {lang === "zh" ? "重置密码" : "Reset Password"}
            </CardTitle>
            <CardDescription>
              {lang === "zh"
                ? "通过邮箱验证码重置您的密码"
                : "Reset your password via email verification code"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                <AlertCircle className="w-4 h-4" />{error}
              </div>
            )}
            <div className="space-y-2">
              <Label>{lang === "zh" ? "邮箱" : "Email"}</Label>
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-input border-border"
                  disabled={step === "reset"}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => { setError(""); sendCodeMutation.mutate({ email, type: "reset_password" }); }}
                  disabled={countdown > 0 || sendCodeMutation.isPending || !email}
                  className="whitespace-nowrap bg-transparent"
                >
                  {countdown > 0
                    ? `${countdown}s`
                    : step === "reset"
                      ? (lang === "zh" ? "重新发送" : "Resend")
                      : (lang === "zh" ? "发送验证码" : "Send Code")}
                </Button>
              </div>
            </div>
            {step === "reset" && (
              <>
                <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/10 text-primary text-sm">
                  <CheckCircle className="w-4 h-4" />
                  {lang === "zh" ? `验证码已发送至 ${email}` : `Code sent to ${email}`}
                </div>
                <div className="space-y-2">
                  <Label>{lang === "zh" ? "验证码" : "Verification Code"}</Label>
                  <Input
                    placeholder={lang === "zh" ? "6位验证码" : "6-digit code"}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="bg-input border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label>{lang === "zh" ? "新密码" : "New Password"}</Label>
                  <div className="relative">
                    <Input
                      type={showPwd ? "text" : "password"}
                      placeholder={lang === "zh" ? "至少8位" : "At least 8 characters"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="bg-input border-border pr-10"
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                      onClick={() => setShowPwd(!showPwd)}
                    >
                      {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <Button
                  className="w-full"
                  onClick={() => {
                    setError("");
                    if (newPassword.length < 8) {
                      setError(lang === "zh" ? "密码至少8位" : "Password must be at least 8 characters");
                      return;
                    }
                    resetMutation.mutate({ email, code, newPassword });
                  }}
                  disabled={resetMutation.isPending}
                >
                  {resetMutation.isPending
                    ? (lang === "zh" ? "重置中..." : "Resetting...")
                    : (lang === "zh" ? "重置密码" : "Reset Password")}
                </Button>
              </>
            )}
            <p className="text-center text-sm text-muted-foreground">
              <Link href="/login" className="text-primary hover:underline">
                {lang === "zh" ? "返回登录" : "Back to Sign In"}
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
