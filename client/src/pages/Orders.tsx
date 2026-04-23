import UserLayout from "@/components/UserLayout";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, ChevronLeft, ChevronRight, Clock, BarChart2 } from "lucide-react";
import { formatShortDateTime } from "@/lib/time";
import { useLang } from "@/contexts/LangContext";

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

export default function Orders() {
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
  const { data, isLoading } = trpc.strategy.orders.useQuery({ page, limit: 20 });
  const { data: stats } = trpc.strategy.orderStats.useQuery();

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  return (
    <UserLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{isZh ? "订单记录" : "Order History"}</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {isZh
              ? "每笔开仓和平仓均单独展示，与交易所历史成交一一对应"
              : "Each open and close is shown individually, matching exchange trade history"}
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: isZh ? "总交易笔数" : "Total Trades", value: stats?.totalOrders ?? 0, unit: isZh ? "笔" : "", icon: <BarChart2 className="w-4 h-4" /> },
            { label: isZh ? "持仓中" : "Open", value: stats?.openOrders ?? 0, unit: isZh ? "笔" : "", color: "text-primary", icon: <TrendingUp className="w-4 h-4" /> },
            { label: isZh ? "累计盈利" : "Total Profit", value: (stats?.totalProfit ?? 0).toFixed(2), unit: "USDT", color: "text-profit", icon: <TrendingUp className="w-4 h-4" /> },
            { label: isZh ? "净盈亏" : "Net PnL", value: `${(stats?.netPnl ?? 0) >= 0 ? "+" : ""}${(stats?.netPnl ?? 0).toFixed(4)}`, unit: "USDT", color: (stats?.netPnl ?? 0) >= 0 ? "text-profit" : "text-loss", icon: (stats?.netPnl ?? 0) >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" /> },
          ].map((s) => (
            <Card key={s.label} className="bg-card border-border">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <span className={`${s.color || "text-muted-foreground"} opacity-60`}>{s.icon}</span>
                </div>
                <p className={`text-xl font-bold ${s.color || "text-foreground"}`}>
                  {s.value} {s.unit && <span className="text-sm font-normal text-muted-foreground">{s.unit}</span>}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Orders Table */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              {isZh ? "订单列表" : "Orders"}
              {total > 0 && <span className="text-xs text-muted-foreground font-normal ml-1">
                {isZh ? `共 ${total} 条` : `${total} total`}
              </span>}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : items.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <BarChart2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>{isZh ? "暂无订单记录" : "No orders yet"}</p>
                <p className="text-xs mt-1">
                  {isZh ? "订阅策略后，跟单订单将在此显示" : "Copy trade orders will appear here after activating a strategy"}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-secondary/20">
                      <th className="text-left px-4 py-3 text-muted-foreground font-medium text-xs">{isZh ? "交易对" : "Pair"}</th>
                      <th className="text-left px-4 py-3 text-muted-foreground font-medium text-xs">{isZh ? "方向" : "Side"}</th>
                      <th className="text-left px-4 py-3 text-muted-foreground font-medium text-xs">{isZh ? "交易所" : "Exchange"}</th>
                      <th className="text-right px-4 py-3 text-muted-foreground font-medium text-xs">{isZh ? "倍数" : "Mult."}</th>
                      <th className="text-right px-4 py-3 text-muted-foreground font-medium text-xs">{isZh ? "数量 (ETH)" : "Qty (ETH)"}</th>
                      <th className="text-right px-4 py-3 text-muted-foreground font-medium text-xs">{isZh ? "成交价" : "Price"}</th>
                      <th className="text-right px-4 py-3 text-muted-foreground font-medium text-xs">{isZh ? "手续费" : "Fee"}</th>
                      <th className="text-right px-4 py-3 text-muted-foreground font-medium text-xs">{isZh ? "已实现盈亏" : "Realized PnL"}</th>
                      <th className="text-right px-4 py-3 text-muted-foreground font-medium text-xs">{isZh ? "净盈亏" : "Net PnL"}</th>
                      <th className="text-center px-4 py-3 text-muted-foreground font-medium text-xs">{isZh ? "状态" : "Status"}</th>
                      <th className="text-right px-4 py-3 text-muted-foreground font-medium text-xs">{isZh ? "时间" : "Time"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((order) => {
                      const meta = ACTION_META[order.action] ?? { label: order.action, colorClass: "bg-muted text-muted-foreground" };
                      const isOpen = order.action === "open_long" || order.action === "open_short";
                      const price = isOpen ? order.openPrice : order.closePrice;
                      const time = isOpen ? (order.openTime ?? order.createdAt) : (order.closeTime ?? order.createdAt);

                      return (
                        <tr key={order.id} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                          <td className="px-4 py-2.5 font-mono text-xs font-medium text-foreground">{order.symbol}</td>
                          <td className="px-4 py-2.5">
                            <span className={`text-xs px-2 py-0.5 rounded font-medium ${meta.colorClass}`}>
                              {meta.label}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground">
                            {EXCHANGE_LABELS[order.exchange] || order.exchange || "-"}
                          </td>
                          <td className="px-4 py-2.5 text-right text-xs text-muted-foreground">
                            {order.multiplier ? `${parseFloat(order.multiplier).toFixed(1)}x` : "-"}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-xs">
                            {parseFloat(order.actualQuantity || "0").toFixed(4)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-xs text-muted-foreground">
                            {price ? parseFloat(price).toFixed(2) : "-"}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-xs text-muted-foreground">
                            {order.fee ? parseFloat(order.fee).toFixed(4) : "-"}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            {isOpen ? <span className="text-muted-foreground text-xs">-</span> : <PnlCell value={order.realizedPnl} />}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            {isOpen
                              ? (order.status === "open"
                                  ? <span className="text-muted-foreground text-xs">{isZh ? "持仓中" : "Open"}</span>
                                  : <span className="text-muted-foreground text-xs">-</span>)
                              : <PnlCell value={order.netPnl} />
                            }
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            {order.status === "open" ? (
                              <Badge className="bg-primary/15 text-primary border-0 text-xs">
                                <span className="w-1.5 h-1.5 bg-primary rounded-full mr-1 animate-pulse inline-block" />
                                {isZh ? "持仓中" : "Open"}
                              </Badge>
                            ) : order.status === "closed" ? (
                              isOpen
                                ? <Badge variant="secondary" className="text-xs">{isZh ? "已开仓" : "Opened"}</Badge>
                                : <Badge variant="secondary" className="text-xs">{isZh ? "已平仓" : "Closed"}</Badge>
                            ) : order.status === "failed" ? (
                              <Badge variant="destructive" className="text-xs">{isZh ? "失败" : "Failed"}</Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs">{order.status}</Badge>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right text-xs text-muted-foreground whitespace-nowrap">
                            {formatTime(time)}
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

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3">
            <Button variant="outline" size="sm" className="bg-transparent" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
            <Button variant="outline" size="sm" className="bg-transparent" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>
    </UserLayout>
  );
}
