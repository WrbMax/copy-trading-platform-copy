import { useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Eye, EyeOff, AlertCircle } from "lucide-react";
import { toast } from "sonner";

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

  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: () => { toast.success("注册成功！"); navigate("/"); },
    onError: (e) => setError(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!name) { setError("请输入用户名"); return; }
    if (!email) { setError("请输入邮箱"); return; }
    if (password.length < 8) { setError("密码至少8位"); return; }
    if (password !== confirmPassword) { setError("两次密码不一致"); return; }
    if (!inviteCode.trim()) { setError("请填写邀请码"); return; }
    registerMutation.mutate({ email, password, name, inviteCode });
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
            <LineChart className="w-6 h-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">策略平台</h1>
            <p className="text-xs text-muted-foreground">BSC链USDT · 智能策略</p>
          </div>
        </div>

        <Card className="bg-card border-border">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl">创建账户</CardTitle>
            <CardDescription>填写信息完成注册</CardDescription>
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
                <Label htmlFor="name">用户名</Label>
                <Input id="name" placeholder="您的昵称" value={name} onChange={(e) => setName(e.target.value)} className="bg-input border-border" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">邮箱地址</Label>
                <Input id="email" type="email" placeholder="your@email.com" value={email} onChange={(e) => setEmail(e.target.value)} className="bg-input border-border" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">设置密码</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPwd ? "text" : "password"}
                    placeholder="至少8位"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="bg-input border-border pr-10"
                  />
                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowPwd(!showPwd)}>
                    {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">确认密码</Label>
                <Input id="confirmPassword" type="password" placeholder="再次输入密码" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="bg-input border-border" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="inviteCode">邀请码 <span className="text-destructive">*</span></Label>
                <Input id="inviteCode" placeholder="请输入邀请码（必填）" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} className="bg-input border-border" />
                <p className="text-xs text-muted-foreground">没有邀请码无法注册，请联系推荐人获取</p>
              </div>
              <Button type="submit" className="w-full" disabled={registerMutation.isPending}>
                {registerMutation.isPending ? "注册中..." : "完成注册"}
              </Button>
            </form>

            <p className="text-center text-sm text-muted-foreground mt-4">
              已有账户？{" "}
              <Link href="/login" className="text-primary hover:underline font-medium">立即登录</Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
