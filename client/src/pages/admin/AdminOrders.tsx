import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { AlertTriangle, ChevronLeft, ChevronRight, Info } from "lucide-react";
import { toast } from "sonner";

const ACTION_LABELS: Record<string, string> = {
  open_long: "开多", open_short: "开空", close_long: "平多", close_short: "平空", close_all: "全平",
};

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  pending: { label: "待执行", className: "bg-yellow-500/15 text-yellow-500 border-0" },
  open: { label: "持仓中", className: "bg-primary/15 text-primary border-0" },
  closed: { label: "已平仓", className: "bg-muted text-muted-foreground border-0" },
  failed: { label: "失败", className: "bg-loss/15 text-loss border-0" },
  cancelled: { label: "已取消", className: "bg-muted text-muted-foreground border-0" },
};

const EXCHANGE_LABELS: Record<string, string> = {
  binance: "Binance", okx: "OKX", bybit: "Bybit", bitget: "Bitget", gate: "Gate.io",
};

export default function AdminOrders() {
  const utils = trpc.useUtils();
  const [page, setPage] = useState(1);
  const [showAbnormal, setShowAbnormal] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const { data } = trpc.strategy.adminAllOrders.useQuery({ page, limit: 30 });
  const allItems = data?.items ?? [];
  const items = showAbnormal ? allItems.filter((o: any) => o.isAbnormal) : allItems;
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 30);

  const markMutation = trpc.strategy.adminMarkAbnormal.useMutation({
    onSuccess: () => { toast.success("已标记"); utils.strategy.adminAllOrders.invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">订单监控</h1>
            <p className="text-muted-foreground text-sm mt-1">监控所有用户的跟单订单状态（共 {total} 条）</p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">仅看异常</span>
            <Switch checked={showAbnormal} onCheckedChange={setShowAbnormal} />
          </div>
        </div>

        <Card className="bg-card border-border">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {["用户", "信号源", "交易所", "交易对", "方向", "数量", "倍数", "净盈亏", "状态", "异常", "时间"].map((h) => (
                      <th key={h} className="text-left px-3 py-3 text-muted-foreground font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((order: any) => {
                    const st = STATUS_LABELS[order.status] ?? { label: order.status, className: "" };
                    const isExpanded = expandedId === order.id;
                    return (
                      <>
                        <tr
                          key={order.id}
                          className={`border-b border-border/50 hover:bg-secondary/30 cursor-pointer ${order.isAbnormal ? "bg-yellow-500/5" : ""}`}
                          onClick={() => setExpandedId(isExpanded ? null : order.id)}
                        >
                          <td className="px-3 py-2.5">
                            <div className="flex flex-col">
                              <span className="font-medium text-foreground">{order.userName || "未知"}</span>
                              <span className="text-xs text-muted-foreground">ID:{order.userId}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-xs text-muted-foreground">{order.signalSourceName || "-"}</td>
                          <td className="px-3 py-2.5">
                            <span className="text-xs font-medium">{EXCHANGE_LABELS[order.exchange] || order.exchange}</span>
                          </td>
                          <td className="px-3 py-2.5 font-medium text-foreground">{order.symbol}</td>
                          <td className="px-3 py-2.5">
                            <span className={`text-xs px-1.5 py-0.5 rounded ${order.action?.includes("long") ? "bg-profit/20 text-profit" : "bg-loss/20 text-loss"}`}>
                              {ACTION_LABELS[order.action] || order.action}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-muted-foreground font-mono text-xs">{parseFloat(order.actualQuantity || "0").toFixed(4)}</td>
                          <td className="px-3 py-2.5 text-muted-foreground text-xs">{parseFloat(order.multiplier || "1").toFixed(1)}x</td>
                          <td className="px-3 py-2.5">
                            {order.netPnl ? (
                              <span className={parseFloat(order.netPnl) >= 0 ? "text-profit font-semibold" : "text-loss font-semibold"}>
                                {parseFloat(order.netPnl) >= 0 ? "+" : ""}{parseFloat(order.netPnl).toFixed(2)}
                              </span>
                            ) : "-"}
                          </td>
                          <td className="px-3 py-2.5">
                            <Badge className={`text-xs ${st.className}`}>{st.label}</Badge>
                          </td>
                          <td className="px-3 py-2.5">
                            <button
                              onClick={(e) => { e.stopPropagation(); markMutation.mutate({ orderId: order.id, isAbnormal: !order.isAbnormal }); }}
                              className={`p-1 rounded ${order.isAbnormal ? "text-yellow-500" : "text-muted-foreground hover:text-yellow-500"}`}
                            >
                              <AlertTriangle className="w-4 h-4" />
                            </button>
                          </td>
                          <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                            {order.createdAt ? new Date(order.createdAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }) : "-"}
                          </td>
                        </tr>
                        {/* Expanded detail row */}
                        {isExpanded && (
                          <tr key={`${order.id}-detail`} className="bg-secondary/20">
                            <td colSpan={11} className="px-4 py-3">
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                                <div>
                                  <p className="text-muted-foreground">开仓价</p>
                                  <p className="font-semibold">{order.openPrice ? parseFloat(order.openPrice).toFixed(4) : "-"}</p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">平仓价</p>
                                  <p className="font-semibold">{order.closePrice ? parseFloat(order.closePrice).toFixed(4) : "-"}</p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">信号数量</p>
                                  <p className="font-semibold">{parseFloat(order.signalQuantity || "0").toFixed(4)}</p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">交易所订单号</p>
                                  <p className="font-mono">{order.exchangeOrderId || "-"}</p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">手续费</p>
                                  <p className="font-semibold">{order.fee ? parseFloat(order.fee).toFixed(4) : "-"}</p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">已实现盈亏</p>
                                  <p className="font-semibold">{order.realizedPnl ? parseFloat(order.realizedPnl).toFixed(4) : "-"}</p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">开仓时间</p>
                                  <p>{order.openTime ? new Date(order.openTime).toLocaleString("zh-CN") : "-"}</p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">平仓时间</p>
                                  <p>{order.closeTime ? new Date(order.closeTime).toLocaleString("zh-CN") : "-"}</p>
                                </div>
                              </div>
                              {order.errorMessage && (
                                <div className="mt-2 flex items-start gap-2 p-2 rounded bg-loss/10 text-loss text-xs">
                                  <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                  <span>{order.errorMessage}</span>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
              {items.length === 0 && <p className="text-center py-12 text-muted-foreground">暂无订单数据</p>}
            </div>
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
    </AdminLayout>
  );
}
