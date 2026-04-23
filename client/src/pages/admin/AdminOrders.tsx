import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, ChevronLeft, ChevronRight, Info, Search, X, TrendingUp, TrendingDown, BarChart2 } from "lucide-react";
import { formatShortDateTime } from "@/lib/time";
import { toast } from "sonner";

const ACTION_META: Record<string, { label: string; colorClass: string }> = {
  open_long:   { label: "开多", colorClass: "bg-profit/20 text-profit" },
  open_short:  { label: "开空", colorClass: "bg-loss/20 text-loss" },
  close_long:  { label: "平多", colorClass: "bg-profit/10 text-profit/70" },
  close_short: { label: "平空", colorClass: "bg-loss/10 text-loss/70" },
  close_all:   { label: "全平", colorClass: "bg-muted text-muted-foreground" },
};

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  pending:   { label: "待执行", className: "bg-yellow-500/15 text-yellow-500 border-0" },
  open:      { label: "持仓中", className: "bg-primary/15 text-primary border-0" },
  closed:    { label: "已平仓", className: "bg-muted text-muted-foreground border-0" },
  failed:    { label: "失败",   className: "bg-loss/15 text-loss border-0" },
  cancelled: { label: "已取消", className: "bg-muted text-muted-foreground border-0" },
};

const EXCHANGE_LABELS: Record<string, string> = {
  binance: "Binance", okx: "OKX", bybit: "Bybit", bitget: "Bitget", gate: "Gate.io",
};

export default function AdminOrders() {
  const utils = trpc.useUtils();
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // 筛选状态
  const [keyword, setKeyword] = useState("");
  const [exchange, setExchange] = useState<string>("");
  const [action, setAction] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [isAbnormal, setIsAbnormal] = useState<string>("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [symbol, setSymbol] = useState("");

  // 构建查询参数
  const queryParams = {
    page,
    limit: 30,
    keyword: keyword || undefined,
    exchange: exchange || undefined,
    action: action || undefined,
    status: status || undefined,
    isAbnormal: isAbnormal === "true" ? true : isAbnormal === "false" ? false : undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo ? new Date(new Date(dateTo).getTime() + 86400000).toISOString() : undefined,
    symbol: symbol || undefined,
  };

  const { data } = trpc.strategy.adminAllOrders.useQuery(queryParams);
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const stats = data?.stats;
  const totalPages = Math.ceil(total / 30);

  const markMutation = trpc.strategy.adminMarkAbnormal.useMutation({
    onSuccess: () => { toast.success("已标记"); utils.strategy.adminAllOrders.invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const handleSearch = () => { setPage(1); };
  const handleReset = () => {
    setKeyword(""); setExchange(""); setAction(""); setStatus("");
    setIsAbnormal(""); setDateFrom(""); setDateTo(""); setSymbol("");
    setPage(1);
  };

  const hasFilters = keyword || exchange || action || status || isAbnormal || dateFrom || dateTo || symbol;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">订单监控</h1>
            <p className="text-muted-foreground text-sm mt-1">每笔开仓和平仓均单独展示，与交易所历史成交一一对应（共 {total} 条）</p>
          </div>
        </div>

        {/* 统计卡片 */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-card border-border">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">总订单数</p>
                    <p className="text-xl font-bold text-foreground mt-1">{stats.totalOrders}</p>
                  </div>
                  <BarChart2 className="w-5 h-5 text-primary opacity-60" />
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card border-border">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">总盈利</p>
                    <p className="text-xl font-bold text-profit mt-1">+{stats.totalProfit.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">USDT</p>
                  </div>
                  <TrendingUp className="w-5 h-5 text-profit opacity-60" />
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card border-border">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">总亏损</p>
                    <p className="text-xl font-bold text-loss mt-1">-{stats.totalLoss.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">USDT</p>
                  </div>
                  <TrendingDown className="w-5 h-5 text-loss opacity-60" />
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card border-border">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">净盈亏</p>
                    <p className={`text-xl font-bold mt-1 ${stats.netPnl >= 0 ? "text-profit" : "text-loss"}`}>
                      {stats.netPnl >= 0 ? "+" : ""}{stats.netPnl.toFixed(2)}
                    </p>
                    <p className="text-xs text-muted-foreground">USDT</p>
                  </div>
                  <AlertTriangle className={`w-5 h-5 opacity-60 ${stats.abnormalCount > 0 ? "text-yellow-500" : "text-muted-foreground"}`} />
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* 筛选栏 */}
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
              <div className="col-span-2 relative">
                <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="搜索用户名..."
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  className="pl-8 bg-secondary/50 border-border text-sm h-9"
                />
              </div>
              <Input
                placeholder="交易对 (如 ETHUSDT)"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                className="bg-secondary/50 border-border text-sm h-9"
              />
              <Select value={exchange} onValueChange={(v) => { setExchange(v === "all" ? "" : v); setPage(1); }}>
                <SelectTrigger className="bg-secondary/50 border-border text-sm h-9">
                  <SelectValue placeholder="交易所" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部交易所</SelectItem>
                  <SelectItem value="binance">Binance</SelectItem>
                  <SelectItem value="okx">OKX</SelectItem>
                  <SelectItem value="bybit">Bybit</SelectItem>
                  <SelectItem value="bitget">Bitget</SelectItem>
                  <SelectItem value="gate">Gate.io</SelectItem>
                </SelectContent>
              </Select>
              <Select value={action} onValueChange={(v) => { setAction(v === "all" ? "" : v); setPage(1); }}>
                <SelectTrigger className="bg-secondary/50 border-border text-sm h-9">
                  <SelectValue placeholder="方向" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部方向</SelectItem>
                  <SelectItem value="open_long">开多</SelectItem>
                  <SelectItem value="open_short">开空</SelectItem>
                  <SelectItem value="close_long">平多</SelectItem>
                  <SelectItem value="close_short">平空</SelectItem>
                </SelectContent>
              </Select>
              <Select value={status} onValueChange={(v) => { setStatus(v === "all" ? "" : v); setPage(1); }}>
                <SelectTrigger className="bg-secondary/50 border-border text-sm h-9">
                  <SelectValue placeholder="状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部状态</SelectItem>
                  <SelectItem value="open">持仓中</SelectItem>
                  <SelectItem value="closed">已平仓</SelectItem>
                  <SelectItem value="failed">失败</SelectItem>
                  <SelectItem value="pending">待执行</SelectItem>
                </SelectContent>
              </Select>
              <Select value={isAbnormal} onValueChange={(v) => { setIsAbnormal(v === "all" ? "" : v); setPage(1); }}>
                <SelectTrigger className="bg-secondary/50 border-border text-sm h-9">
                  <SelectValue placeholder="异常" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部</SelectItem>
                  <SelectItem value="true">仅异常</SelectItem>
                  <SelectItem value="false">正常</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSearch} className="h-9 flex-1">搜索</Button>
                {hasFilters && (
                  <Button size="sm" variant="outline" onClick={handleReset} className="h-9 px-2 bg-transparent">
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground whitespace-nowrap">开始日期</span>
                <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="bg-secondary/50 border-border text-sm h-9" />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground whitespace-nowrap">结束日期</span>
                <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="bg-secondary/50 border-border text-sm h-9" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {["用户", "信号源", "交易所", "交易对", "方向", "数量 (ETH)", "倍数", "成交价", "手续费", "已实现盈亏", "净盈亏", "状态", "异常", "时间"].map((h) => (
                      <th key={h} className="text-left px-3 py-3 text-muted-foreground font-medium whitespace-nowrap text-xs">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((order: any) => {
                    const st = STATUS_LABELS[order.status] ?? { label: order.status, className: "" };
                    const meta = ACTION_META[order.action] ?? { label: order.action, colorClass: "bg-muted text-muted-foreground" };
                    const isOpen = order.action === "open_long" || order.action === "open_short";
                    const price = isOpen ? order.openPrice : order.closePrice;
                    const time = isOpen ? (order.openTime ?? order.createdAt) : (order.closeTime ?? order.createdAt);
                    const isExpanded = expandedId === order.id;
                    const netPnl = order.netPnl ? parseFloat(order.netPnl) : null;
                    const realizedPnl = order.realizedPnl ? parseFloat(order.realizedPnl) : null;

                    return (
                      <>
                        <tr
                          key={order.id}
                          className={`border-b border-border/50 hover:bg-secondary/30 cursor-pointer ${order.isAbnormal ? "bg-yellow-500/5" : ""}`}
                          onClick={() => setExpandedId(isExpanded ? null : order.id)}
                        >
                          <td className="px-3 py-2.5">
                            <div className="flex flex-col">
                              <span className="font-medium text-foreground text-xs">{order.userName || "未知"}</span>
                              <span className="text-xs text-muted-foreground">ID:{order.userId}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-xs text-muted-foreground">{order.signalSourceName || "-"}</td>
                          <td className="px-3 py-2.5 text-xs font-medium">{EXCHANGE_LABELS[order.exchange] || order.exchange}</td>
                          <td className="px-3 py-2.5 font-mono text-xs text-foreground">{order.symbol}</td>
                          <td className="px-3 py-2.5">
                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${meta.colorClass}`}>
                              {meta.label}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">
                            {parseFloat(order.actualQuantity || "0").toFixed(4)}
                          </td>
                          <td className="px-3 py-2.5 text-xs text-muted-foreground">
                            {parseFloat(order.multiplier || "1").toFixed(1)}x
                          </td>
                          <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">
                            {price ? parseFloat(price).toFixed(2) : "-"}
                          </td>
                          <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">
                            {order.fee ? parseFloat(order.fee).toFixed(4) : "-"}
                          </td>
                          <td className="px-3 py-2.5">
                            {isOpen ? (
                              <span className="text-xs text-muted-foreground">-</span>
                            ) : realizedPnl !== null ? (
                              <span className={`font-semibold text-xs ${realizedPnl >= 0 ? "text-profit" : "text-loss"}`}>
                                {realizedPnl >= 0 ? "+" : ""}{realizedPnl.toFixed(4)}
                              </span>
                            ) : <span className="text-xs text-muted-foreground">-</span>}
                          </td>
                          <td className="px-3 py-2.5">
                            {isOpen ? (
                              order.status === "open"
                                ? <span className="text-xs text-muted-foreground">持仓中</span>
                                : <span className="text-xs text-muted-foreground">-</span>
                            ) : netPnl !== null ? (
                              <span className={`font-semibold text-xs ${netPnl >= 0 ? "text-profit" : "text-loss"}`}>
                                {netPnl >= 0 ? "+" : ""}{netPnl.toFixed(4)}
                              </span>
                            ) : <span className="text-xs text-muted-foreground">-</span>}
                          </td>
                          <td className="px-3 py-2.5">
                            <Badge className={`text-xs ${st.className}`}>
                              {isOpen && order.status === "closed" ? "已开仓" : st.label}
                            </Badge>
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
                            {formatShortDateTime(time)}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr key={`${order.id}-detail`} className="bg-secondary/20">
                            <td colSpan={14} className="px-4 py-3">
                              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
                                <div>
                                  <p className="text-muted-foreground">信号数量</p>
                                  <p className="font-semibold">{parseFloat(order.signalQuantity || "0").toFixed(4)}</p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">开仓价</p>
                                  <p className="font-semibold font-mono">{order.openPrice ? parseFloat(order.openPrice).toFixed(4) : "-"}</p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">平仓价</p>
                                  <p className="font-semibold font-mono">{order.closePrice ? parseFloat(order.closePrice).toFixed(4) : "-"}</p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">分润扣除</p>
                                  <p className="font-semibold font-mono text-yellow-500">
                                    {order.revenueShareDeducted ? parseFloat(order.revenueShareDeducted).toFixed(4) : "-"}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">交易所订单号</p>
                                  <p className="font-mono text-xs break-all">{order.exchangeOrderId || "-"}</p>
                                </div>
                              </div>
                              {order.errorMessage && (
                                <div className="mt-2 flex items-start gap-2 p-2 rounded bg-loss/10 text-loss text-xs">
                                  <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                  <span>{order.errorMessage}</span>
                                </div>
                              )}
                              {order.abnormalNote && (
                                <div className="mt-2 flex items-start gap-2 p-2 rounded bg-yellow-500/10 text-yellow-600 text-xs">
                                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                  <span>{order.abnormalNote}</span>
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
