import { useState } from "react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, AlertCircle, CheckCircle, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

export default function ForgotPassword() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState<"email" | "reset">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState(0);

  const sendCodeMutation = trpc.auth.sendCode.useMutation({
    onSuccess: () => {
      toast.success("验证码已发送");
      setStep("reset");
      let t = 60;
      setCountdown(t);
      const timer = setInterval(() => { t--; setCountdown(t); if (t <= 0) clearInterval(timer); }, 1000);
    },
    onError: (e) => setError(e.message),
  });

  const resetMutation = trpc.auth.resetPassword.useMutation({
    onSuccess: () => { toast.success("密码重置成功，请重新登录"); navigate("/login"); },
    onError: (e) => setError(e.message),
  });

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
            <LineChart className="w-6 h-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-bold">策略平台</h1>
            <p className="text-xs text-muted-foreground">BSC链USDT · 智能策略</p>
          </div>
        </div>
        <Card className="bg-card border-border">
          <CardHeader className="pb-4">
            <CardTitle>重置密码</CardTitle>
            <CardDescription>通过邮箱验证码重置您的密码</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                <AlertCircle className="w-4 h-4" />{error}
              </div>
            )}
            <div className="space-y-2">
              <Label>邮箱</Label>
              <div className="flex gap-2">
                <Input type="email" placeholder="your@email.com" value={email} onChange={(e) => setEmail(e.target.value)} className="bg-input border-border" disabled={step === "reset"} />
                <Button type="button" variant="outline" onClick={() => { setError(""); sendCodeMutation.mutate({ email, type: "reset_password" }); }} disabled={countdown > 0 || sendCodeMutation.isPending || !email} className="whitespace-nowrap bg-transparent">
                  {countdown > 0 ? `${countdown}s` : step === "reset" ? "重新发送" : "发送验证码"}
                </Button>
              </div>
            </div>
            {step === "reset" && (
              <>
                <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/10 text-primary text-sm">
                  <CheckCircle className="w-4 h-4" />验证码已发送至 {email}
                </div>
                <div className="space-y-2">
                  <Label>验证码</Label>
                  <Input placeholder="6位验证码" value={code} onChange={(e) => setCode(e.target.value)} className="bg-input border-border" />
                </div>
                <div className="space-y-2">
                  <Label>新密码</Label>
                  <div className="relative">
                    <Input type={showPwd ? "text" : "password"} placeholder="至少8位" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="bg-input border-border pr-10" />
                    <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowPwd(!showPwd)}>
                      {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <Button className="w-full" onClick={() => { setError(""); if (newPassword.length < 8) { setError("密码至少8位"); return; } resetMutation.mutate({ email, code, newPassword }); }} disabled={resetMutation.isPending}>
                  {resetMutation.isPending ? "重置中..." : "重置密码"}
                </Button>
              </>
            )}
            <p className="text-center text-sm text-muted-foreground">
              <Link href="/login" className="text-primary hover:underline">返回登录</Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
