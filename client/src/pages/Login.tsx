import { useState } from "react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Eye, EyeOff, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { AlphaRouteBrand } from "@/components/AlphaRouteLogo";
import { useLang } from "@/contexts/LangContext";

export default function Login() {
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState("");
  const { lang, setLang } = useLang();

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: () => { toast.success(lang === "zh" ? "登录成功" : "Login successful"); navigate("/"); },
    onError: (e) => setError(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email || !password) {
      setError(lang === "zh" ? "请填写邮箱和密码" : "Please enter email and password");
      return;
    }
    loginMutation.mutate({ email, password });
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
              {lang === "zh" ? "欢迎回来" : "Welcome Back"}
            </CardTitle>
            <CardDescription>
              {lang === "zh"
                ? "使用邮箱和密码登录您的账户"
                : "Sign in to your AlphaRoute account"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">{lang === "zh" ? "邮箱" : "Email"}</Label>
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
                <Label htmlFor="password">{lang === "zh" ? "密码" : "Password"}</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPwd ? "text" : "password"}
                    placeholder={lang === "zh" ? "请输入密码" : "Enter your password"}
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
              <div className="flex justify-end">
                <Link href="/forgot-password" className="text-sm text-primary hover:underline">
                  {lang === "zh" ? "忘记密码？" : "Forgot password?"}
                </Link>
              </div>
              <Button type="submit" className="w-full" disabled={loginMutation.isPending}>
                {loginMutation.isPending
                  ? (lang === "zh" ? "登录中..." : "Signing in...")
                  : (lang === "zh" ? "登录" : "Sign In")}
              </Button>
            </form>
            <p className="text-center text-sm text-muted-foreground mt-4">
              {lang === "zh" ? "还没有账户？" : "Don't have an account? "}
              <Link href="/register" className="text-primary hover:underline font-medium">
                {lang === "zh" ? "立即注册" : "Sign Up"}
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
