import UserLayout from "@/components/UserLayout";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, TrendingUp, ArrowDownRight, Users, Award, Crown } from "lucide-react";
import { formatDate } from "@/lib/time";
import { useLang } from "@/contexts/LangContext";

export default function Earnings() {
  const { lang } = useLang();
  const isZh = lang === "zh";

  const REWARD_TYPE_META: Record<string, { label: string; icon: any; colorClass: string }> = {
    direct: { label: isZh ? "分享奖" : "Referral Bonus", icon: Users, colorClass: "text-blue-400" },
    rank: { label: isZh ? "身份奖" : "Rank Bonus", icon: Award, colorClass: "text-amber-400" },
    same_rank: { label: isZh ? "平级奖" : "Same-Rank Bonus", icon: Crown, colorClass: "text-purple-400" },
  };

  const [page, setPage] = useState(1);
  const { data: stats } = trpc.strategy.revenueShareStats.useQuery();
  const { data } = trpc.user.myRevenueShares.useQuery({ page, limit: 20 });
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  return (
    <UserLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{isZh ? "我的收益" : "My Earnings"}</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {isZh ? "收益分成收入与扣减明细" : "Revenue share income and deduction details"}
          </p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-card border-border">
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">
                {isZh ? "累计收益分成收入" : "Total Revenue Share Income"}
              </p>
              <p className="text-2xl font-bold text-profit mt-1">+{(stats?.totalReceived ?? 0).toFixed(4)} USDT</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">
                {isZh ? "累计被扣收益分成（40%）" : "Total Revenue Share Deducted (40%)"}
              </p>
              <p className={`text-2xl font-bold mt-1 ${(stats?.totalDeducted ?? 0) > 0 ? "text-loss" : "text-muted-foreground"}`}>
                {(stats?.totalDeducted ?? 0) > 0 ? "-" : ""}{(stats?.totalDeducted ?? 0).toFixed(4)} USDT
              </p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">
                {isZh ? "净收益分成" : "Net Revenue Share"}
              </p>
              <p className={`text-2xl font-bold mt-1 ${
                ((stats?.totalReceived ?? 0) - (stats?.totalDeducted ?? 0)) > 0
                  ? "text-profit"
                  : ((stats?.totalReceived ?? 0) - (stats?.totalDeducted ?? 0)) < 0
                  ? "text-loss"
                  : "text-muted-foreground"
              }`}>
                {((stats?.totalReceived ?? 0) - (stats?.totalDeducted ?? 0)) > 0 ? "+" : ""}
                {((stats?.totalReceived ?? 0) - (stats?.totalDeducted ?? 0)).toFixed(4)} USDT
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Reward type breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-card border-border">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-1">
                <Users className="w-4 h-4 text-blue-400" />
                <p className="text-sm text-muted-foreground">{isZh ? "分享奖收入" : "Referral Bonus"}</p>
              </div>
              <p className="text-xl font-bold text-blue-400">+{(stats?.directReward ?? 0).toFixed(4)} USDT</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-1">
                <Award className="w-4 h-4 text-amber-400" />
                <p className="text-sm text-muted-foreground">{isZh ? "身份奖收入" : "Rank Bonus"}</p>
              </div>
              <p className="text-xl font-bold text-amber-400">+{(stats?.rankReward ?? 0).toFixed(4)} USDT</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-1">
                <Crown className="w-4 h-4 text-purple-400" />
                <p className="text-sm text-muted-foreground">{isZh ? "平级奖收入" : "Same-Rank Bonus"}</p>
              </div>
              <p className="text-xl font-bold text-purple-400">+{(stats?.sameRankReward ?? 0).toFixed(4)} USDT</p>
            </CardContent>
          </Card>
        </div>

        {/* Detail table */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{isZh ? "分成明细" : "Revenue Details"}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {items.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                {isZh ? "暂无收益分成记录" : "No revenue share records"}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left px-4 py-3 text-muted-foreground font-medium">{isZh ? "奖励类型" : "Type"}</th>
                      <th className="text-left px-4 py-3 text-muted-foreground font-medium">{isZh ? "关联用户" : "Related User"}</th>
                      <th className="text-right px-4 py-3 text-muted-foreground font-medium">{isZh ? "分成比例" : "Ratio"}</th>
                      <th className="text-right px-4 py-3 text-muted-foreground font-medium">{isZh ? "金额" : "Amount"}</th>
                      <th className="text-right px-4 py-3 text-muted-foreground font-medium">{isZh ? "时间" : "Time"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((r: any) => {
                      const meta = REWARD_TYPE_META[r.rewardType] || REWARD_TYPE_META.rank;
                      const Icon = meta.icon;
                      return (
                        <tr key={r.id} className="border-b border-border/50 hover:bg-secondary/30">
                          <td className="px-4 py-3">
                            <span className={`flex items-center gap-1 text-xs ${meta.colorClass}`}>
                              <Icon className="w-3.5 h-3.5" />
                              {meta.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {r.traderName ?? (isZh ? `用户 #${r.traderId}` : `User #${r.traderId}`)}
                          </td>
                          <td className="px-4 py-3 text-right text-muted-foreground">{parseFloat(r.ratio).toFixed(2)}%</td>
                          <td className="px-4 py-3 text-right font-semibold text-profit">+{parseFloat(r.amount).toFixed(4)}</td>
                          <td className="px-4 py-3 text-right text-xs text-muted-foreground">{formatDate(r.createdAt)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3">
            <Button variant="outline" size="sm" className="bg-transparent" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}><ChevronLeft className="w-4 h-4" /></Button>
            <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
            <Button variant="outline" size="sm" className="bg-transparent" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}><ChevronRight className="w-4 h-4" /></Button>
          </div>
        )}
      </div>
    </UserLayout>
  );
}
