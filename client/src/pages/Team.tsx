import UserLayout from "@/components/UserLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, TrendingUp, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

export default function Team() {
  const { data: stats } = trpc.user.teamStats.useQuery();
  const { data: profile } = trpc.user.profile.useQuery();

  return (
    <UserLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">团队数据</h1>
            <p className="text-muted-foreground text-sm mt-1">查看您的团队规模和收益分成情况</p>
          </div>
          <Button asChild size="sm">
            <Link href="/invite" className="flex items-center gap-1"><UserPlus className="w-4 h-4" />邀请成员</Link>
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "团队总人数", value: stats?.totalCount ?? 0, unit: "人", icon: Users },
            { label: "直属下级", value: stats?.directCount ?? 0, unit: "人", icon: UserPlus },
            { label: "团队总盈利", value: `${(stats?.teamProfit ?? 0).toFixed(2)}`, unit: "USDT", icon: TrendingUp },
            { label: "我的分成比例", value: `${parseFloat(profile?.revenueShareRatio || "0").toFixed(1)}`, unit: "%", icon: TrendingUp },
          ].map((s) => (
            <Card key={s.label} className="bg-card border-border">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                    <p className="text-2xl font-bold text-foreground mt-1">{s.value} <span className="text-sm font-normal text-muted-foreground">{s.unit}</span></p>
                  </div>
                  <s.icon className="w-5 h-5 text-primary opacity-60" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="bg-card border-border">
          <CardHeader className="pb-3"><CardTitle className="text-base">多级收益分成说明</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>系统采用差额分账机制：对真实盈利订单按净盈亏差额进行多级分成。</p>
            <div className="p-4 rounded-lg bg-secondary/50 space-y-2">
              <p className="font-medium text-foreground">示例：</p>
              <p>假设 A → B → C（您），您的分成比例为30%，B的比例为10%</p>
              <p>当您的订单净盈利100 USDT时：</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>您被扣除：100 × 30% = <span className="text-loss">30 USDT</span></li>
                <li>B 获得：100 × (30% - 10%) = <span className="text-profit">20 USDT</span></li>
                <li>A 获得：100 × 10% = <span className="text-profit">10 USDT</span></li>
              </ul>
            </div>
            <p>分成比例由管理员设置，层级越高比例越低（差额递减）。</p>
          </CardContent>
        </Card>
      </div>
    </UserLayout>
  );
}
