import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Users, CreditCard, TrendingUp, TrendingDown, ListOrdered, Wallet, ArrowDownLeft, ArrowUpRight, RefreshCw, Activity, Cpu, Database, Zap, Droplets } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function AdminDashboard() {
  const { data: stats, refetch: refetchStats } = trpc.user.adminDashboard.useQuery();
  const { data: engineStatus, refetch: refetchEngine } = trpc.strategy.adminEngineStatus.useQuery();
  const { data: liquidityData, refetch: refetchLiquidity } = trpc.funds.adminGetLiquidityPool.useQuery();

  const [showAdjustPool, setShowAdjustPool] = useState(false);
  const [poolAdjustAmount, setPoolAdjustAmount] = useState("");
  const [poolAdjustNote, setPoolAdjustNote] = useState("");

  const adjustPoolMutation = trpc.funds.adminAdjustLiquidityPool.useMutation({
    onSuccess: () => {
      toast.success("流动性池调整成功");
      refetchLiquidity();
      setShowAdjustPool(false);
      setPoolAdjustAmount("");
      setPoolAdjustNote("");
    },
    onError: (e) => toast.error(e.message),
  });

  const handleRefresh = () => {
    refetchStats();
    refetchEngine();
    refetchLiquidity();
  };

  const handleAdjustPool = () => {
    const amount = parseFloat(poolAdjustAmount);
    if (isNaN(amount) || amount === 0) return toast.error("请输入有效金额（正数为增加，负数为减少）");
    if (!poolAdjustNote.trim()) return toast.error("请填写操作备注");
    adjustPoolMutation.mutate({ amount, note: poolAdjustNote });
  };

  // 平台收入
  const revenueCards = [
    {
      label: "平台服务费收入",
      value: `${(stats?.totalDeducted ?? 0).toFixed(2)}`,
      unit: "USDT",
      icon: Wallet,
      color: "text-profit",
      desc: "从用户余额扣除的服务费总额（40%）",
    },
    {
      label: "多级分润支出",
      value: `${(stats?.totalRevenueShare ?? 0).toFixed(2)}`,
      unit: "USDT",
      icon: ArrowUpRight,
      color: "text-yellow-500",
      desc: "分配给各级邀请人的分成总额（20%）",
    },
    {
      label: "平台净收入",
      value: `${(stats?.platformNetRevenue ?? 0).toFixed(2)}`,
      unit: "USDT",
      icon: TrendingUp,
      color: "text-primary",
      desc: "服务费收入 − 多级分润支出",
    },
  ];

  // 用户数据
  const userCards = [
    { label: "注册用户总数", value: stats?.totalUsers ?? 0, unit: "人", icon: Users, color: "text-primary" },
    { label: "用户累计盈利", value: `${(stats?.totalProfit ?? 0).toFixed(2)}`, unit: "USDT", icon: TrendingUp, color: "text-profit" },
    { label: "用户累计亏损", value: `${(stats?.totalLoss ?? 0).toFixed(2)}`, unit: "USDT", icon: TrendingDown, color: "text-loss" },
    { label: "异常订单", value: stats?.abnormalOrders ?? 0, unit: "笔", icon: ListOrdered, color: "text-loss" },
  ];

  // 资金数据
  const fundCards = [
    { label: "总充值金额", value: `${(stats?.totalDeposits ?? 0).toFixed(2)}`, unit: "USDT", icon: ArrowDownLeft, color: "text-profit" },
    { label: "总提现金额", value: `${(stats?.totalWithdrawals ?? 0).toFixed(2)}`, unit: "USDT", icon: ArrowUpRight, color: "text-primary" },
    { label: "待审充值", value: stats?.pendingDeposits ?? 0, unit: "笔", icon: CreditCard, color: "text-yellow-500" },
    { label: "待审提现", value: stats?.pendingWithdrawals ?? 0, unit: "笔", icon: CreditCard, color: "text-yellow-500" },
  ];

  // 引擎状态
  const engineSources = engineStatus ?? [];
  const totalSources = engineSources.length;
  const activeSources = engineSources.filter((s: any) => s.isActive).length;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">仪表盘</h1>
            <p className="text-muted-foreground text-sm mt-1">平台整体运营数据概览</p>
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh} className="gap-2">
            <RefreshCw className="w-4 h-4" />
            刷新数据
          </Button>
        </div>

        {/* 平台收入 */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">平台收入</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {revenueCards.map((c) => (
              <Card key={c.label} className="bg-card border-border">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">{c.label}</p>
                      <p className={`text-2xl font-bold mt-1 ${c.color}`}>{c.value}</p>
                      <p className="text-xs text-muted-foreground">{c.unit}</p>
                      <p className="text-xs text-muted-foreground/60 mt-1">{c.desc}</p>
                    </div>
                    <c.icon className={`w-5 h-5 ${c.color} opacity-60`} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* 流动性池 */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">流动性池</h2>
          <Card className="bg-card border-border">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <Droplets className="w-8 h-8 text-blue-400" />
                    <div>
                      <p className="text-xs text-muted-foreground">当前流动性池余额</p>
                      <p className="text-3xl font-bold text-blue-400 mt-0.5">
                        {(liquidityData?.balance ?? 0).toFixed(2)}
                        <span className="text-sm font-normal text-muted-foreground ml-1">USDT</span>
                      </p>
                      <p className="text-xs text-muted-foreground/60 mt-1">每笔盈利订单平仓时自动累积（服务费 40% 中的 20%，即盈利的 20%）</p>
                    </div>
                  </div>

                  {showAdjustPool ? (
                    <div className="mt-4 space-y-3 max-w-sm">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">调整金额（正数为增加，负数为减少）</p>
                        <Input
                          type="number"
                          placeholder="例如：100 或 -50"
                          value={poolAdjustAmount}
                          onChange={(e) => setPoolAdjustAmount(e.target.value)}
                          className="h-9 text-sm"
                        />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">操作备注</p>
                        <Input
                          placeholder="请填写操作原因"
                          value={poolAdjustNote}
                          onChange={(e) => setPoolAdjustNote(e.target.value)}
                          className="h-9 text-sm"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={handleAdjustPool} disabled={adjustPoolMutation.isPending}>
                          {adjustPoolMutation.isPending ? "提交中..." : "确认调整"}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => { setShowAdjustPool(false); setPoolAdjustAmount(""); setPoolAdjustNote(""); }}>
                          取消
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button size="sm" variant="outline" className="mt-4" onClick={() => setShowAdjustPool(true)}>
                      手动调整池子余额
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 用户数据 */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">用户数据</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {userCards.map((c) => (
              <Card key={c.label} className="bg-card border-border">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">{c.label}</p>
                      <p className={`text-2xl font-bold mt-1 ${c.color}`}>{c.value}</p>
                      <p className="text-xs text-muted-foreground">{c.unit}</p>
                    </div>
                    <c.icon className={`w-5 h-5 ${c.color} opacity-60`} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* 资金数据 */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">资金数据</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {fundCards.map((c) => (
              <Card key={c.label} className="bg-card border-border">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">{c.label}</p>
                      <p className={`text-2xl font-bold mt-1 ${c.color}`}>{c.value}</p>
                      <p className="text-xs text-muted-foreground">{c.unit}</p>
                    </div>
                    <c.icon className={`w-5 h-5 ${c.color} opacity-60`} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {/* 快速操作 */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-3"><CardTitle className="text-base">快速操作</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {[
                { href: "/admin/funds", label: "审核充值申请", badge: stats?.pendingDeposits ?? 0 },
                { href: "/admin/funds", label: "审核提现申请", badge: stats?.pendingWithdrawals ?? 0 },
                { href: "/admin/signals", label: "管理信号源" },
                { href: "/admin/users", label: "用户管理" },
                { href: "/admin/orders", label: "订单监控" },
                { href: "/admin/revenue-share", label: "分润记录" },
              ].map((item) => (
                <a key={item.label} href={item.href} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors">
                  <span className="text-sm text-foreground">{item.label}</span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-500 text-xs font-medium">{item.badge} 待处理</span>
                  )}
                </a>
              ))}
            </CardContent>
          </Card>

          {/* 系统状态 */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="w-4 h-4" />
                系统状态
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* 数据库 */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground flex items-center gap-2">
                  <Database className="w-3.5 h-3.5" />
                  数据库连接
                </span>
                <span className="text-xs font-medium text-profit flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                  正常
                </span>
              </div>

              {/* 信号接收 */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground flex items-center gap-2">
                  <Zap className="w-3.5 h-3.5" />
                  信号接收
                </span>
                <span className="text-xs font-medium text-profit flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                  就绪
                </span>
              </div>

              {/* 跟单引擎 */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground flex items-center gap-2">
                  <Cpu className="w-3.5 h-3.5" />
                  跟单引擎
                </span>
                {engineStatus ? (
                  <span className="text-xs font-medium text-profit flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                    {activeSources}/{totalSources} 信号源运行中
                  </span>
                ) : (
                  <span className="text-xs font-medium text-muted-foreground">加载中...</span>
                )}
              </div>

              {/* 收益分成 */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground flex items-center gap-2">
                  <TrendingUp className="w-3.5 h-3.5" />
                  收益分成
                </span>
                <span className="text-xs font-medium text-profit flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                  自动结算
                </span>
              </div>

              {/* 信号源详情 */}
              {engineSources.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border space-y-1">
                  <p className="text-xs text-muted-foreground mb-2">信号源详情</p>
                  {engineSources.map((s: any) => (
                    <div key={s.id} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground truncate max-w-[150px]">{s.name}</span>
                      <Badge variant={s.isActive ? "default" : "secondary"} className="text-xs h-5">
                        {s.isActive ? "运行中" : "已停止"}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
