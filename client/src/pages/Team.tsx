import { useState } from "react";
import UserLayout from "@/components/UserLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, TrendingUp, UserPlus, Award, BarChart2, ChevronLeft, ChevronRight, Eye, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatShortDateTime, formatDate } from "@/lib/time";
import { useLang } from "@/contexts/LangContext";

const P_LEVEL_NAMES: Record<number, string> = {
  0: "无身份", 1: "P1", 2: "P2", 3: "P3", 4: "P4", 5: "P5", 6: "P6", 7: "P7",
};
const P_LEVEL_NAMES_EN: Record<number, string> = {
  0: "None", 1: "P1", 2: "P2", 3: "P3", 4: "P4", 5: "P5", 6: "P6", 7: "P7",
};

const P_LEVEL_COLORS: Record<number, string> = {
  0: "bg-muted text-muted-foreground",
  1: "bg-blue-500/15 text-blue-400",
  2: "bg-cyan-500/15 text-cyan-400",
  3: "bg-emerald-500/15 text-emerald-400",
  4: "bg-amber-500/15 text-amber-400",
  5: "bg-orange-500/15 text-orange-400",
  6: "bg-rose-500/15 text-rose-400",
  7: "bg-purple-500/15 text-purple-400",
};

function PnlCell({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="text-muted-foreground text-xs">-</span>;
  const n = parseFloat(value);
  if (isNaN(n)) return <span className="text-muted-foreground text-xs">-</span>;
  if (n > 0) return <span className="text-profit font-semibold text-xs">+{n.toFixed(4)}</span>;
  if (n < 0) return <span className="text-loss font-semibold text-xs">{n.toFixed(4)}</span>;
  return <span className="text-muted-foreground text-xs">0.0000</span>;
}

const formatTime = formatShortDateTime;

const EXCHANGE_LABELS: Record<string, string> = {
  okx: "OKX", binance: "Binance", bybit: "Bybit", bitget: "Bitget", gate: "Gate.io",
};

function MemberOrdersDialog({
  inviteeId, open, onClose,
}: {
  inviteeId: number | null; open: boolean; onClose: () => void;
}) {
  const { lang } = useLang();
  const isZh = lang === "zh";

  const ACTION_META: Record<string, { label: string; colorClass: string }> = {
    open_long:   { label: isZh ? "开多" : "Long", colorClass: "bg-profit/20 text-profit" },
    open_short:  { label: isZh ? "开空" : "Short", colorClass: "bg-loss/20 text-loss" },
    close_long:  { label: isZh ? "平多" : "Close Long", colorClass: "bg-profit/10 text-profit/70" },
    close_short: { label: isZh ? "平空" : "Close Short", colorClass: "bg-loss/10 text-loss/70" },
    close_all:   { label: isZh ? "全平" : "Close All", colorClass: "bg-muted text-muted-foreground" },
  };

  const [page, setPage] = useState(1);
  const { data, isLoading } = trpc.user.inviteeMemberOrders.useQuery(
    { inviteeId: inviteeId ?? 0, page, limit: 20 },
    { enabled: open && inviteeId !== null }
  );

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 20);
  const stats = data?.stats;
  const inviteeName = data?.inviteeName ?? "";

  const handleOpenChange = (v: boolean) => {
    if (!v) { onClose(); setPage(1); }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-5xl w-full max-h-[90vh] flex flex-col bg-card border-border">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <BarChart2 className="w-4 h-4 text-primary" />
            {isZh ? `${inviteeName} 的交易记录` : `${inviteeName}'s Trade History`}
          </DialogTitle>
        </DialogHeader>

        {stats && (
          <div className="grid grid-cols-4 gap-3 shrink-0">
            {[
              { label: isZh ? "总交易笔数" : "Total Trades", value: stats.totalOrders, unit: isZh ? "笔" : "" },
              { label: isZh ? "持仓中" : "Open", value: stats.openOrders, unit: isZh ? "笔" : "", color: "text-primary" },
              { label: isZh ? "累计盈利" : "Total Profit", value: stats.totalProfit.toFixed(2), unit: "USDT", color: "text-profit" },
              { label: isZh ? "净盈亏" : "Net PnL", value: `${stats.netPnl >= 0 ? "+" : ""}${stats.netPnl.toFixed(4)}`, unit: "USDT", color: stats.netPnl >= 0 ? "text-profit" : "text-loss" },
            ].map((s) => (
              <div key={s.label} className="bg-secondary/30 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className={`text-lg font-bold mt-0.5 ${s.color ?? "text-foreground"}`}>
                  {s.value} <span className="text-xs font-normal text-muted-foreground">{s.unit}</span>
                </p>
              </div>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-auto min-h-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <BarChart2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">{isZh ? "暂无交易记录" : "No trade records"}</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card z-10">
                <tr className="border-b border-border bg-secondary/20">
                  <th className="text-left px-3 py-2.5 text-muted-foreground font-medium text-xs">{isZh ? "交易对" : "Pair"}</th>
                  <th className="text-left px-3 py-2.5 text-muted-foreground font-medium text-xs">{isZh ? "方向" : "Side"}</th>
                  <th className="text-left px-3 py-2.5 text-muted-foreground font-medium text-xs">{isZh ? "交易所" : "Exchange"}</th>
                  <th className="text-right px-3 py-2.5 text-muted-foreground font-medium text-xs">{isZh ? "倍数" : "Mult."}</th>
                  <th className="text-right px-3 py-2.5 text-muted-foreground font-medium text-xs">{isZh ? "数量" : "Qty"}</th>
                  <th className="text-right px-3 py-2.5 text-muted-foreground font-medium text-xs">{isZh ? "成交价" : "Price"}</th>
                  <th className="text-right px-3 py-2.5 text-muted-foreground font-medium text-xs">{isZh ? "手续费" : "Fee"}</th>
                  <th className="text-right px-3 py-2.5 text-muted-foreground font-medium text-xs">{isZh ? "已实现盈亏" : "Realized PnL"}</th>
                  <th className="text-right px-3 py-2.5 text-muted-foreground font-medium text-xs">{isZh ? "净盈亏" : "Net PnL"}</th>
                  <th className="text-center px-3 py-2.5 text-muted-foreground font-medium text-xs">{isZh ? "状态" : "Status"}</th>
                  <th className="text-right px-3 py-2.5 text-muted-foreground font-medium text-xs">{isZh ? "时间" : "Time"}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((order: any) => {
                  const meta = ACTION_META[order.action] ?? { label: order.action, colorClass: "bg-muted text-muted-foreground" };
                  const isOpen = order.action === "open_long" || order.action === "open_short";
                  const price = isOpen ? order.openPrice : order.closePrice;
                  const time = isOpen ? (order.openTime ?? order.createdAt) : (order.closeTime ?? order.createdAt);
                  return (
                    <tr key={order.id} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                      <td className="px-3 py-2 font-mono text-xs font-medium text-foreground">{order.symbol}</td>
                      <td className="px-3 py-2"><span className={`text-xs px-2 py-0.5 rounded font-medium ${meta.colorClass}`}>{meta.label}</span></td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{EXCHANGE_LABELS[order.exchange] || order.exchange || "-"}</td>
                      <td className="px-3 py-2 text-right text-xs text-muted-foreground">{order.multiplier ? `${parseFloat(order.multiplier).toFixed(1)}x` : "-"}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{parseFloat(order.actualQuantity || "0").toFixed(4)}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">{price ? parseFloat(price).toFixed(2) : "-"}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">{order.fee ? parseFloat(order.fee).toFixed(4) : "-"}</td>
                      <td className="px-3 py-2 text-right">{isOpen ? <span className="text-muted-foreground text-xs">-</span> : <PnlCell value={order.realizedPnl} />}</td>
                      <td className="px-3 py-2 text-right">
                        {isOpen
                          ? (order.status === "open" ? <span className="text-muted-foreground text-xs">{isZh ? "持仓中" : "Open"}</span> : <span className="text-muted-foreground text-xs">-</span>)
                          : <PnlCell value={order.netPnl} />}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {order.status === "open" ? (
                          <Badge className="bg-primary/15 text-primary border-0 text-xs">
                            <span className="w-1.5 h-1.5 bg-primary rounded-full mr-1 animate-pulse inline-block" />
                            {isZh ? "持仓中" : "Open"}
                          </Badge>
                        ) : order.status === "closed" ? (
                          <Badge variant="secondary" className="text-xs">{isZh ? "已平仓" : "Closed"}</Badge>
                        ) : order.status === "failed" ? (
                          <Badge variant="destructive" className="text-xs">{isZh ? "失败" : "Failed"}</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">{order.status}</Badge>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right text-xs text-muted-foreground whitespace-nowrap">{formatTime(time)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 shrink-0 pt-2 border-t border-border">
            <Button variant="outline" size="sm" className="bg-transparent h-7 w-7 p-0"
              onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
            <Button variant="outline" size="sm" className="bg-transparent h-7 w-7 p-0"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function Team() {
  const { lang } = useLang();
  const isZh = lang === "zh";

  const { data: stats } = trpc.user.teamStats.useQuery(undefined, { staleTime: 0, refetchOnWindowFocus: true });
  const { data: profile } = trpc.user.profile.useQuery(undefined, { staleTime: 0, refetchOnWindowFocus: true });
  const { data: invitees } = trpc.user.myInvitees.useQuery();
  const { data: directBonusData } = trpc.strategy.myDirectBonusRecords.useQuery({ page: 1, limit: 20 });
  const { data: levelBonusData } = trpc.strategy.myLevelBonusRecords.useQuery({ page: 1, limit: 20 });

  const [viewingInviteeId, setViewingInviteeId] = useState<number | null>(null);

  const myPLevel = stats?.pLevel ?? profile?.pLevel ?? 0;
  const directValidCount = stats?.directValidCount ?? 0;
  const umbrellaPerformance = stats?.umbrellaPerformance ?? 0;
  const bigZonePerformance = stats?.bigZonePerformance ?? 0;
  const smallZonePerformance = stats?.smallZonePerformance ?? 0;

  let currentDirectRatio = "0%";
  if (directValidCount >= 9) currentDirectRatio = "15%";
  else if (directValidCount >= 6) currentDirectRatio = "10%";
  else if (directValidCount >= 3) currentDirectRatio = "8%";

  const nextDirectTarget = directValidCount >= 9 ? 9 : directValidCount >= 6 ? 9 : directValidCount >= 3 ? 6 : 3;

  const pLevelName = isZh ? (P_LEVEL_NAMES[myPLevel] || "无身份") : (P_LEVEL_NAMES_EN[myPLevel] || "None");

  return (
    <UserLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{isZh ? "系统收益" : "Team Earnings"}</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {isZh ? "查看您的系统规模、身份与收益分润信息" : "View your team size, rank, and revenue share info"}
            </p>
          </div>
          <Button asChild size="sm">
            <Link href="/invite" className="flex items-center gap-1">
              <UserPlus className="w-4 h-4" />{isZh ? "邀请成员" : "Invite"}
            </Link>
          </Button>
        </div>

        {/* Core stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            {
              label: isZh ? "我的身份" : "My Rank",
              value: pLevelName, unit: "", icon: Crown,
              desc: isZh
                ? `大区业绩：${bigZonePerformance.toFixed(2)} USDT　小区业绩：${smallZonePerformance.toFixed(2)} USDT`
                : `Big zone: ${bigZonePerformance.toFixed(2)} USDT  Small zone: ${smallZonePerformance.toFixed(2)} USDT`,
            },
            {
              label: isZh ? "分享有效人数" : "Valid Referrals",
              value: directValidCount,
              unit: `/ ${nextDirectTarget}${isZh ? " 人" : ""}`,
              icon: UserPlus,
              desc: directValidCount >= 9
                ? (isZh ? "已达最高档 15%" : "Max tier 15% reached")
                : (isZh
                  ? `再邀 ${nextDirectTarget - directValidCount} 人解锁${nextDirectTarget === 3 ? "8%" : nextDirectTarget === 6 ? "10%" : "15%"}分享奖`
                  : `${nextDirectTarget - directValidCount} more to unlock ${nextDirectTarget === 3 ? "8%" : nextDirectTarget === 6 ? "10%" : "15%"} bonus`),
            },
            {
              label: isZh ? "系统总人数" : "Total Team",
              value: stats?.totalCount ?? 0,
              unit: isZh ? "人" : "",
              icon: Users,
            },
            {
              label: isZh ? "系统业绩" : "Team Volume",
              value: `${umbrellaPerformance.toFixed(2)}`,
              unit: "USDT",
              icon: TrendingUp,
            },
          ].map((s) => (
            <Card key={s.label} className="bg-card border-border">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                    <p className="text-2xl font-bold text-foreground mt-1">{s.value} <span className="text-sm font-normal text-muted-foreground">{s.unit}</span></p>
                    {(s as any).desc && <p className="text-xs text-muted-foreground/60 mt-0.5">{(s as any).desc}</p>}
                  </div>
                  <s.icon className="w-5 h-5 text-primary opacity-60" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Bonus records */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Direct bonus */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-400" />
                {isZh ? "分享奖流水" : "Referral Bonus History"}
                <Badge className="ml-auto bg-blue-500/15 text-blue-400 border-0 text-xs">
                  {isZh ? "当前比例" : "Current"} {currentDirectRatio}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {!directBonusData?.items || directBonusData.items.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">{isZh ? "暂无记录" : "No records"}</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {directBonusData.items.map((record: any) => (
                    <div key={record.id} className="flex items-center justify-between px-5 py-3">
                      <div>
                        <p className="text-xs text-muted-foreground">{formatShortDateTime(record.createdAt)}</p>
                        <p className="text-sm text-foreground mt-0.5">
                          {isZh ? "来自" : "From"} {record.traderName ?? (isZh ? `用户#${record.traderId}` : `User #${record.traderId}`)}
                        </p>
                      </div>
                      <span className="text-sm font-semibold text-profit">+{Number(record.amount).toFixed(4)} USDT</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Level bonus */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-400" />
                {isZh ? "身份奖流水" : "Rank Bonus History"}
                <Badge className={`ml-auto border-0 text-xs ${P_LEVEL_COLORS[myPLevel] ?? "bg-muted text-muted-foreground"}`}>
                  {pLevelName}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {!levelBonusData?.items || levelBonusData.items.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Award className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">{isZh ? "暂无记录" : "No records"}</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {levelBonusData.items.map((record: any) => (
                    <div key={record.id} className="flex items-center justify-between px-5 py-3">
                      <div>
                        <p className="text-xs text-muted-foreground">
                          {formatShortDateTime(record.createdAt)}
                          <span className={`ml-2 px-1.5 py-0.5 rounded text-xs ${record.rewardType === 'same_rank' ? 'bg-purple-500/20 text-purple-400' : 'bg-amber-500/20 text-amber-400'}`}>
                            {record.rewardType === 'same_rank' ? (isZh ? '平级奖' : 'Same-Rank') : (isZh ? '身份奖' : 'Rank')}
                          </span>
                        </p>
                        <p className="text-sm text-foreground mt-0.5">
                          {isZh ? "来自" : "From"} {record.traderName ?? (isZh ? `用户#${record.traderId}` : `User #${record.traderId}`)}
                        </p>
                      </div>
                      <span className="text-sm font-semibold text-profit">+{Number(record.amount).toFixed(4)} USDT</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Team earnings */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="bg-card border-border">
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">{isZh ? "系统总盈利" : "Team Total Profit"}</p>
              <p className={`text-2xl font-bold mt-1 ${(stats?.teamProfit ?? 0) >= 0 ? "text-profit" : "text-loss"}`}>
                {(stats?.teamProfit ?? 0).toFixed(2)} USDT
              </p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">{isZh ? "我获得的分成" : "My Revenue Share"}</p>
              <p className="text-2xl font-bold mt-1 text-profit">
                +{(stats?.teamRevenueShare ?? 0).toFixed(4)} USDT
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Invitee List */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" /> {isZh ? "我邀请的成员" : "My Referrals"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!invitees || invitees.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <UserPlus className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">{isZh ? "暂无邀请成员" : "No referrals yet"}</p>
                <p className="text-xs mt-1">{isZh ? "分享您的邀请链接来邀请新成员" : "Share your invite link to invite new members"}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      {(isZh
                        ? ["成员", "邮箱", "余额", "身份", "直接业绩", "伞下总业绩", "伞下总人数", "状态", "加入时间", "操作"]
                        : ["Member", "Email", "Balance", "Rank", "Direct Perf.", "Total Perf.", "Total Members", "Status", "Joined", "Action"]
                      ).map((h) => (
                        <th key={h} className="text-left px-4 py-3 text-muted-foreground font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                      {invitees.map((inv: any) => {
                      const invBalance = parseFloat(inv.balance || "0");
                      const isValid = true; // All registered users are valid
                      const invPLevel = inv.pLevel ?? 0;
                      return (
                        <tr key={inv.id} className="border-b border-border/50 hover:bg-secondary/30">
                          <td className="px-4 py-3 text-foreground font-medium">{inv.name || (isZh ? `用户#${inv.id}` : `User #${inv.id}`)}</td>
                          <td className="px-4 py-3 text-muted-foreground text-xs">{inv.email}</td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-medium ${isValid ? "text-emerald-400" : "text-muted-foreground"}`}>
                              {invBalance.toFixed(2)} USDT
                              {isValid && <span className="ml-1 text-emerald-500">{isZh ? "(有效)" : "(valid)"}</span>}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs ${P_LEVEL_COLORS[invPLevel]}`}>
                              {isZh ? P_LEVEL_NAMES[invPLevel] : P_LEVEL_NAMES_EN[invPLevel]}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs">
                            <span className="text-amber-400 font-medium">
                              {(inv.directPerformance ?? 0).toFixed(2)} USDT
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs">
                            <span className="text-sky-400 font-medium">
                              {(inv.umbrellaTotalPerformance ?? 0).toFixed(2)} USDT
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs">
                            <span className="text-purple-400 font-medium">
                              {inv.umbrellaTotalCount ?? 0} {isZh ? "人" : ""}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs ${inv.isActive ? "bg-emerald-500/15 text-emerald-500" : "bg-red-500/15 text-red-500"}`}>
                              {inv.isActive ? (isZh ? "正常" : "Active") : (isZh ? "已禁用" : "Disabled")}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(inv.createdAt)}</td>
                          <td className="px-4 py-3">
                            <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground hover:text-foreground"
                              onClick={() => setViewingInviteeId(inv.id)}>
                              <Eye className="w-3.5 h-3.5 mr-1" />
                              {isZh ? "交易记录" : "Orders"}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <MemberOrdersDialog
        inviteeId={viewingInviteeId}
        open={viewingInviteeId !== null}
        onClose={() => setViewingInviteeId(null)}
      />
    </UserLayout>
  );
}
