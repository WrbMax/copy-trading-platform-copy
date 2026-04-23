import { useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Eye, EyeOff, AlertCircle, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { AlphaRouteBrand } from "@/components/AlphaRouteLogo";
import { AgreementModal } from "@/components/AgreementModal";
import { useLang } from "@/contexts/LangContext";

export default function Register() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const defaultInvite = params.get("ref") || "";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [inviteCode, setInviteCode] = useState(defaultInvite);
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [agreementOpen, setAgreementOpen] = useState(false);
  const { lang, setLang } = useLang();

  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: () => {
      toast.success(lang === "zh" ? "注册成功！" : "Registration successful!");
      navigate("/");
    },
    onError: (e) => setError(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!name) { setError(lang === "zh" ? "请输入用户名" : "Please enter a username"); return; }
    if (!email) { setError(lang === "zh" ? "请输入邮箱" : "Please enter your email"); return; }
    if (password.length < 8) { setError(lang === "zh" ? "密码至少8位" : "Password must be at least 8 characters"); return; }
    if (password !== confirmPassword) { setError(lang === "zh" ? "两次密码不一致" : "Passwords do not match"); return; }
    if (!inviteCode.trim()) { setError(lang === "zh" ? "请填写邀请码" : "Please enter an invite code"); return; }
    if (!agreed) {
      setError(lang === "zh"
        ? "请阅读并同意《用户服务协议》与《风险披露声明》"
        : "Please read and agree to the Terms of Service and Risk Disclosure");
      return;
    }
    registerMutation.mutate({ email, password, name, inviteCode });
  };

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
            <CardTitle className="text-xl">
              {lang === "zh" ? "创建账户" : "Create Account"}
            </CardTitle>
            <CardDescription>
              {lang === "zh" ? "填写信息完成注册" : "Fill in your details to get started"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm mb-4">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">{lang === "zh" ? "用户名" : "Username"}</Label>
                <Input
                  id="name"
                  placeholder={lang === "zh" ? "您的昵称" : "Your nickname"}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="bg-input border-border"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">{lang === "zh" ? "邮箱地址" : "Email Address"}</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-input border-border"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">{lang === "zh" ? "设置密码" : "Password"}</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPwd ? "text" : "password"}
                    placeholder={lang === "zh" ? "至少8位" : "At least 8 characters"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
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
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">
                  {lang === "zh" ? "确认密码" : "Confirm Password"}
                </Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder={lang === "zh" ? "再次输入密码" : "Re-enter your password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="bg-input border-border"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="inviteCode">
                  {lang === "zh" ? "邀请码" : "Invite Code"}{" "}
                  <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="inviteCode"
                  placeholder={lang === "zh" ? "请输入邀请码（必填）" : "Enter invite code (required)"}
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  className="bg-input border-border"
                />
                <p className="text-xs text-muted-foreground">
                  {lang === "zh"
                    ? "没有邀请码无法注册，请联系推荐人获取"
                    : "An invite code is required. Please contact your referrer."}
                </p>
              </div>

              {/* ── Agreement Checkbox ── */}
              <div className={`rounded-xl border p-4 transition-colors ${
                agreed
                  ? "border-primary/40 bg-primary/5"
                  : "border-border bg-secondary/30"
              }`}>
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="agreement"
                    checked={agreed}
                    onCheckedChange={(v) => setAgreed(!!v)}
                    className="mt-0.5 flex-shrink-0"
                  />
                  <div className="space-y-1.5">
                    <label
                      htmlFor="agreement"
                      className="text-sm leading-snug cursor-pointer select-none"
                    >
                      {lang === "zh" ? (
                        <>
                          我已阅读并同意{" "}
                          <button
                            type="button"
                            onClick={() => setAgreementOpen(true)}
                            className="text-primary hover:underline font-medium"
                          >
                            《用户服务协议》与《风险披露声明》
                          </button>
                        </>
                      ) : (
                        <>
                          I have read and agree to the{" "}
                          <button
                            type="button"
                            onClick={() => setAgreementOpen(true)}
                            className="text-primary hover:underline font-medium"
                          >
                            Terms of Service & Risk Disclosure
                          </button>
                        </>
                      )}
                    </label>
                    {/* Risk summary bullets */}
                    <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                      <ShieldCheck className="w-3.5 h-3.5 mt-0.5 text-primary/60 flex-shrink-0" />
                      <span>
                        {lang === "zh"
                          ? "数字资产交易存在本金损失风险，AlphaRoute 不对交易亏损承担任何赔偿责任"
                          : "Digital asset trading involves risk of principal loss. AlphaRoute bears no liability for trading losses."}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Read full text link */}
                <button
                  type="button"
                  onClick={() => setAgreementOpen(true)}
                  className="mt-3 ml-7 text-xs text-primary/70 hover:text-primary underline underline-offset-2 transition-colors"
                >
                  {lang === "zh" ? "阅读完整协议全文 →" : "Read full agreement →"}
                </button>
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={registerMutation.isPending || !agreed}
              >
                {registerMutation.isPending
                  ? (lang === "zh" ? "注册中..." : "Registering...")
                  : (lang === "zh" ? "完成注册" : "Create Account")}
              </Button>
            </form>

            <p className="text-center text-sm text-muted-foreground mt-4">
              {lang === "zh" ? "已有账户？" : "Already have an account? "}
              <Link href="/login" className="text-primary hover:underline font-medium">
                {lang === "zh" ? "立即登录" : "Sign In"}
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Agreement full-text modal */}
      <AgreementModal
        open={agreementOpen}
        onClose={() => {
          setAgreementOpen(false);
          setAgreed(true);
        }}
        lang={lang}
      />
    </div>
  );
}
