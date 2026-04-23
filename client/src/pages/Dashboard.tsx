import UserLayout from "@/components/UserLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  TrendingUp, TrendingDown, Wallet, Zap, Users, CreditCard, Gift,
  ArrowUpRight, ArrowDownRight, BarChart3, Activity
} from "lucide-react";
import { useLang } from "@/contexts/LangContext";

function StatCard({ title, value, sub, icon: Icon, trend, color = "primary" }: {
  title: string; value: string; sub?: string; icon: any; trend?: "up" | "down" | "neutral"; color?: string;
}) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground mb-1">{title}</p>
            <p className="text-2xl font-bold text-foreground">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
            color === "primary" ? "bg-primary/15 text-primary" :
            color === "profit" ? "bg-profit text-profit" :
            color === "loss" ? "bg-loss text-loss" :
            "bg-secondary text-secondary-foreground"
          }`}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
        {trend && (
          <div className={`flex items-center gap-1 mt-2 text-xs ${trend === "up" ? "text-profit" : trend === "down" ? "text-loss" : "text-muted-foreground"}`}>
            {trend === "up" ? <ArrowUpRight className="w-3 h-3" /> : trend === "down" ? <ArrowDownRight className="w-3 h-3" /> : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { lang } = useLang();
  const isZh = lang === "zh";

  const { data: profile } = trpc.user.profile.useQuery();
  const { data: orderStats } = trpc.strategy.orderStats.useQuery();
  const { data: teamStats } = trpc.user.teamStats.useQuery();
  const { data: strategies } = trpc.strategy.myStrategies.useQuery();
  const { data: revenueStats } = trpc.strategy.revenueShareStats.useQuery();

  const balance = parseFloat(profile?.balance || "0");
  const totalProfit = orderStats?.totalProfit ?? 0;
  const totalLoss = orderStats?.totalLoss ?? 0;
  const netPnl = totalProfit - totalLoss;
  const enabledStrategies = strategies?.filter((s) => s.isEnabled) ?? [];

  return (
    <UserLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              {isZh ? "我的账户" : "My Account"}
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              {isZh ? `欢迎回来，${profile?.name || "用户"}` : `Welcome back, ${profile?.name || "User"}`}
            </p>
          </div>
          <div className="flex gap-2">
            <Button asChild size="sm" variant="outline" className="bg-transparent">
              <Link href="/funds" className="flex items-center gap-1">
                <CreditCard className="w-4 h-4" />{isZh ? "充值" : "Deposit"}
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/invite" className="flex items-center gap-1">
                <Gift className="w-4 h-4" />{isZh ? "邀请" : "Invite"}
              </Link>
            </Button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title={isZh ? "平台余额" : "Balance"} value={`${balance.toFixed(2)} USDT`} icon={Wallet} color="primary" />
          <StatCard title={isZh ? "累计盈利" : "Total Profit"} value={`${totalProfit.toFixed(2)} USDT`} icon={TrendingUp} color="profit" trend="up" />
          <StatCard title={isZh ? "累计亏损" : "Total Loss"} value={`${totalLoss.toFixed(2)} USDT`} icon={TrendingDown} color="loss" trend="down" />
          <StatCard title={isZh ? "净盈亏" : "Net PnL"} value={`${netPnl >= 0 ? "+" : ""}${netPnl.toFixed(2)} USDT`} icon={BarChart3} color={netPnl >= 0 ? "profit" : "loss"} />
        </div>

        {/* Second row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title={isZh ? "收益分成收入" : "Revenue Share Income"} value={`${(revenueStats?.totalReceived ?? 0).toFixed(2)} USDT`} icon={Activity} color="primary" />
          <StatCard title={isZh ? "被扣收益分成" : "Revenue Share Deducted"} value={`${(revenueStats?.totalDeducted ?? 0).toFixed(2)} USDT`} icon={ArrowDownRight} />
          <StatCard title={isZh ? "Route 余额" : "Route Balance"} value={`${profile?.points ?? 0} Route`} icon={Zap} color="primary" />
          <StatCard
            title={isZh ? "系统人数" : "Team Size"}
            value={isZh ? `${teamStats?.totalCount ?? 0} 人` : `${teamStats?.totalCount ?? 0}`}
            sub={isZh ? `分享 ${teamStats?.directCount ?? 0} 人` : `Direct: ${teamStats?.directCount ?? 0}`}
            icon={Users}
          />
        </div>

        {/* Active Strategies */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                {isZh ? "启用中的策略" : "Active Strategies"}
              </CardTitle>
              <Button asChild variant="ghost" size="sm" className="text-primary text-xs">
                <Link href="/strategy">{isZh ? "管理策略 →" : "Manage →"}</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {enabledStrategies.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Zap className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">{isZh ? "暂无启用的策略" : "No active strategies"}</p>
                <Button asChild size="sm" className="mt-3">
                  <Link href="/strategy">{isZh ? "去开启策略" : "Activate Strategy"}</Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {enabledStrategies.map((s) => (
                  <div key={s.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 border border-border">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-primary/15 rounded-lg flex items-center justify-center text-primary text-xs font-bold">
                        {s.signalSource?.symbol?.slice(0, 3) || "?"}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{s.signalSource?.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {s.signalSource?.tradingPair} · {isZh ? "倍数" : "Mult."} {s.multiplier}x
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/15 text-primary text-xs">
                        <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
                        {isZh ? "运行中" : "Running"}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {isZh ? "预期月化" : "Est. Monthly"} {s.signalSource?.expectedMonthlyReturnMin}~{s.signalSource?.expectedMonthlyReturnMax}%
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { href: "/strategy", icon: Zap, label: isZh ? "策略中心" : "Strategies", desc: isZh ? "开启/关闭策略" : "Manage strategies" },
            { href: "/orders", icon: BarChart3, label: isZh ? "订单记录" : "Orders", desc: isZh ? "查看历史订单" : "View order history" },
            { href: "/earnings", icon: TrendingUp, label: isZh ? "我的收益" : "Earnings", desc: isZh ? "收益分成明细" : "Revenue share details" },
            { href: "/funds", icon: CreditCard, label: isZh ? "充值提现" : "Funds", desc: isZh ? "资金管理" : "Manage funds" },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block p-4 rounded-xl bg-card border border-border hover:border-primary/50 hover:bg-primary/5 transition-all group"
            >
              <item.icon className="w-6 h-6 text-primary mb-2 group-hover:scale-110 transition-transform" />
              <p className="text-sm font-medium text-foreground">{item.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
            </Link>
          ))}
        </div>
      </div>
    </UserLayout>
  );
}
