import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Edit, Zap, Key, Eye, EyeOff, Clock, Shield, ChevronLeft, ChevronRight, CheckCircle2, XCircle, Loader2, AlertCircle } from "lucide-react";
import { formatDateTime as fmtDT } from "@/lib/time";
import { toast } from "sonner";

type ExchangeType = "okx" | "binance" | "bybit" | "bitget" | "gate";

const EMPTY_FORM: {
  name: string; symbol: string; tradingPair: string; referencePosition: string;
  expectedMonthlyReturnMin: string; expectedMonthlyReturnMax: string; description: string;
  apiKey: string; apiSecret: string; passphrase: string; webhookSecret: string;
  exchange: ExchangeType;
} = {
  name: "", symbol: "", tradingPair: "", referencePosition: "", description: "",
  expectedMonthlyReturnMin: "", expectedMonthlyReturnMax: "",
  apiKey: "", apiSecret: "", passphrase: "", webhookSecret: "",
  exchange: "okx",
};

const EXCHANGE_LABELS: Record<string, string> = {
  okx: "OKX", binance: "Binance", bybit: "Bybit", bitget: "Bitget", gate: "Gate.io",
};

const ACTION_LABELS: Record<string, string> = {
  open_long: "开多", open_short: "开空", close_long: "平多", close_short: "平空", close_all: "全平",
};

// Signal log status: 'completed' = signal received & processed (regardless of user results)
// 'failed' = signal itself failed to process
const STATUS_CONFIG: Record<string, { label: string; icon: React.ReactNode; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  completed: { label: "已接收", icon: <CheckCircle2 className="w-3 h-3" />, variant: "default" },
  failed: { label: "接收失败", icon: <XCircle className="w-3 h-3" />, variant: "destructive" },
  processing: { label: "处理中", icon: <Loader2 className="w-3 h-3 animate-spin" />, variant: "secondary" },
  pending: { label: "待处理", icon: <AlertCircle className="w-3 h-3" />, variant: "outline" },
};

const ORDER_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  open: { label: "跟单成功", color: "text-profit" },
  closed: { label: "已平仓", color: "text-muted-foreground" },
  failed: { label: "跟单失败", color: "text-loss" },
  pending: { label: "待执行", color: "text-yellow-500" },
  cancelled: { label: "已取消", color: "text-muted-foreground" },
};

const formatDateTime = fmtDT;

export default function AdminSignalSources() {
  const utils = trpc.useUtils();
  const { data: sources, isLoading } = trpc.strategy.adminListSources.useQuery();

  // Edit dialog state
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showApiSecret, setShowApiSecret] = useState(false);
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [showWebhook, setShowWebhook] = useState(false);

  // Log detail sheet state
  const [logSource, setLogSource] = useState<{ id: number; name: string } | null>(null);
  const [logPage, setLogPage] = useState(1);
  const { data: signalLogs, isLoading: logsLoading } = trpc.strategy.adminSignalLogs.useQuery(
    { signalSourceId: logSource?.id, page: logPage, limit: 20 },
    { enabled: logSource !== null }
  );

  const createMutation = trpc.strategy.adminCreateSource.useMutation({
    onSuccess: () => { toast.success("信号源已创建"); utils.strategy.adminListSources.invalidate(); closeDialog(); },
    onError: (e: any) => toast.error(e.message),
  });
  const updateMutation = trpc.strategy.adminUpdateSource.useMutation({
    onSuccess: () => { toast.success("信号源已更新"); utils.strategy.adminListSources.invalidate(); closeDialog(); },
    onError: (e: any) => toast.error(e.message),
  });
  const toggleMutation = trpc.strategy.adminUpdateSource.useMutation({
    onSuccess: () => utils.strategy.adminListSources.invalidate(),
    onError: (e: any) => toast.error(e.message),
  });

  const closeDialog = () => {
    setOpen(false); setEditId(null); setForm(EMPTY_FORM);
    setShowApiKey(false); setShowApiSecret(false); setShowPassphrase(false); setShowWebhook(false);
  };

  const openCreate = () => { setEditId(null); setForm(EMPTY_FORM); setOpen(true); };
  const openEdit = (s: any) => {
    setEditId(s.id);
    setForm({
      name: s.name, symbol: s.symbol, tradingPair: s.tradingPair,
      referencePosition: s.referencePosition,
      expectedMonthlyReturnMin: s.expectedMonthlyReturnMin,
      expectedMonthlyReturnMax: s.expectedMonthlyReturnMax,
      description: s.description || "",
      apiKey: "", apiSecret: "", passphrase: "", webhookSecret: s.webhookSecret || "",
      exchange: s.exchange || "okx",
    });
    setOpen(true);
  };

  const openLogs = (s: any) => {
    setLogSource({ id: s.id, name: s.name });
    setLogPage(1);
  };

  const handleSave = () => {
    const base = {
      name: form.name, symbol: form.symbol, tradingPair: form.tradingPair,
      referencePosition: parseFloat(form.referencePosition),
      expectedMonthlyReturnMin: parseFloat(form.expectedMonthlyReturnMin),
      expectedMonthlyReturnMax: parseFloat(form.expectedMonthlyReturnMax),
      description: form.description || undefined,
      exchange: form.exchange as ExchangeType,
    };
    const apiFields: Record<string, string | undefined> = {};
    if (form.apiKey) apiFields.apiKey = form.apiKey;
    if (form.apiSecret) apiFields.apiSecret = form.apiSecret;
    if (form.passphrase) apiFields.passphrase = form.passphrase;
    if (form.webhookSecret) apiFields.webhookSecret = form.webhookSecret;
    if (editId) {
      updateMutation.mutate({ id: editId, ...base, ...apiFields });
    } else {
      createMutation.mutate({ ...base, ...apiFields });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;
  const totalLogPages = Math.ceil((signalLogs?.total ?? 0) / 20);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">信号源管理</h1>
            <p className="text-muted-foreground text-sm mt-1">配置策略信号源，管理交易标的、API密钥和预期收益</p>
          </div>
          <Button onClick={openCreate}><Plus className="w-4 h-4 mr-1" />新建信号源</Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !sources?.length ? (
          <Card className="bg-card border-border">
            <CardContent className="py-12 text-center">
              <Zap className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground">暂无信号源，点击右上角创建</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sources.map((s: any) => (
              <Card key={s.id} className="bg-card border-border">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-primary/15 rounded-xl flex items-center justify-center text-primary font-bold text-sm">
                        {s.symbol.slice(0, 3)}
                      </div>
                      <div>
                        <CardTitle className="text-sm">{s.name}</CardTitle>
                        <p className="text-xs text-muted-foreground">{s.tradingPair}</p>
                      </div>
                    </div>
                    <Switch checked={s.isActive} onCheckedChange={(v) => toggleMutation.mutate({ id: s.id, isActive: v })} />
                  </div>
                </CardHeader>
                <CardContent className="pt-0 space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="p-2 rounded bg-secondary/50">
                      <p className="text-xs text-muted-foreground">参考仓位</p>
                      <p className="font-semibold">{parseFloat(s.referencePosition).toFixed(0)} USDT</p>
                    </div>
                    <div className="p-2 rounded bg-secondary/50">
                      <p className="text-xs text-muted-foreground">预期月化</p>
                      <p className="font-semibold text-profit">{s.expectedMonthlyReturnMin}~{s.expectedMonthlyReturnMax}%</p>
                    </div>
                  </div>

                  {/* API Key Status */}
                  <div className="p-2 rounded bg-secondary/30 space-y-1">
                    <div className="flex items-center gap-2 text-xs">
                      <Zap className="w-3 h-3 text-muted-foreground" />
                      <span className="text-muted-foreground">交易所:</span>
                      <span className="font-medium">{EXCHANGE_LABELS[s.exchange] || s.exchange || "未配置"}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <Key className="w-3 h-3 text-muted-foreground" />
                      <span className="text-muted-foreground">API Key:</span>
                      <span className="font-mono text-xs">{s.apiKeyMasked || "未配置"}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <Shield className="w-3 h-3 text-muted-foreground" />
                      <span className="text-muted-foreground">Passphrase:</span>
                      <span className="font-mono text-xs">{s.passphraseMasked || (s.exchange === "okx" || s.exchange === "bitget" ? "未配置" : "不需要")}</span>
                    </div>
                  </div>

                  {s.description && <p className="text-xs text-muted-foreground">{s.description}</p>}
                  <div className="flex items-center justify-between">
                    <Badge variant={s.isActive ? "default" : "secondary"} className="text-xs">
                      {s.isActive ? <><span className="w-1.5 h-1.5 bg-current rounded-full mr-1 animate-pulse" />运行中</> : "已停用"}
                    </Badge>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => openLogs(s)}>
                        <Clock className="w-4 h-4 mr-1" />日志
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => openEdit(s)}>
                        <Edit className="w-4 h-4 mr-1" />编辑
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Log Detail Sheet */}
        <Sheet open={logSource !== null} onOpenChange={(v) => { if (!v) setLogSource(null); }}>
          <SheetContent side="right" className="w-full sm:max-w-2xl bg-card border-border overflow-y-auto">
            <SheetHeader className="pb-4 border-b border-border">
              <SheetTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-primary" />
                信号日志 — {logSource?.name}
              </SheetTitle>
              <p className="text-xs text-muted-foreground">记录信号源的每次仓位变化和跟单触发情况</p>
            </SheetHeader>

            <div className="mt-4 space-y-3">
              {logsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : !signalLogs?.items?.length ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Clock className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p>暂无信号日志</p>
                  <p className="text-xs mt-1">当信号源账户仓位发生变化时，日志将在此显示</p>
                </div>
              ) : (
                <>
                  {signalLogs.items.map((log: any) => {
                    const sc = STATUS_CONFIG[log.status] ?? { label: log.status, icon: null, variant: "secondary" as const };
                    const isLong = log.action?.includes("long");
                    return (
                      <div key={log.id} className="rounded-lg border border-border bg-secondary/20 p-4 space-y-3">
                        {/* Header row */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge variant={sc.variant} className="text-xs flex items-center gap-1">
                              {sc.icon}{sc.label}
                            </Badge>
                            <span className={`text-xs font-bold px-2 py-0.5 rounded ${isLong ? "bg-profit/20 text-profit" : "bg-loss/20 text-loss"}`}>
                              {ACTION_LABELS[log.action] || log.action}
                            </span>
                            <span className="text-sm font-mono font-medium">{log.symbol}</span>
                          </div>
                          <span className="text-xs text-muted-foreground">{formatDateTime(log.createdAt)}</span>
                        </div>

                        {/* Details grid */}
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div className="bg-background/50 rounded p-2">
                            <p className="text-muted-foreground mb-0.5">数量</p>
                            <p className="font-semibold">{parseFloat(log.quantity).toFixed(4)}</p>
                          </div>
                          <div className="bg-background/50 rounded p-2">
                            <p className="text-muted-foreground mb-0.5">信号均价</p>
                            <p className="font-semibold">{log.price ? parseFloat(log.price).toFixed(2) : "-"}</p>
                          </div>
                          <div className="bg-background/50 rounded p-2">
                            <p className="text-muted-foreground mb-0.5">处理时间</p>
                            <p className="font-semibold">{log.processedAt ? formatDateTime(log.processedAt) : "-"}</p>
                          </div>
                        </div>

                        {/* Copy orders (user execution results) */}
                        {log.copyOrders && log.copyOrders.length > 0 ? (
                          <div className="space-y-1.5">
                            <p className="text-xs text-muted-foreground font-medium">跟单明细（{log.copyOrders.length} 个用户）</p>
                            {log.copyOrders.map((order: any) => {
                              const os = ORDER_STATUS_CONFIG[order.status] ?? { label: order.status, color: "text-muted-foreground" };
                              return (
                                <div key={order.id} className="flex items-start justify-between p-2 rounded bg-background/50 text-xs">
                                  <div className="space-y-0.5">
                                    <div className="flex items-center gap-2">
                                      <span className="font-mono text-muted-foreground">UID:{order.userId}</span>
                                      <span className="font-medium">{order.exchange?.toUpperCase()}</span>
                                      <span className="text-muted-foreground">倍数:{parseFloat(order.multiplier).toFixed(1)}x</span>
                                    </div>
                                    {order.errorMessage && (
                                      <p className="text-loss text-xs">{order.errorMessage}</p>
                                    )}
                                    {order.exchangeOrderId && (
                                      <p className="text-muted-foreground font-mono">OrderID: {order.exchangeOrderId}</p>
                                    )}
                                  </div>
                                  <div className="text-right shrink-0 ml-2">
                                    <span className={`font-semibold ${os.color}`}>{os.label}</span>
                                    <p className="text-muted-foreground mt-0.5">数量: {parseFloat(order.actualQuantity).toFixed(4)}</p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">当前无订阅用户</p>
                        )}

                        {/* Summary note (partial success etc) */}
                        {log.errorMessage && (
                          <div className="flex items-start gap-2 p-2 rounded bg-secondary/50 text-xs text-muted-foreground">
                            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                            <span>{log.errorMessage}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Pagination */}
                  {totalLogPages > 1 && (
                    <div className="flex items-center justify-center gap-3 pt-2">
                      <Button variant="outline" size="sm" className="bg-transparent" onClick={() => setLogPage(p => Math.max(1, p - 1))} disabled={logPage === 1}>
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      <span className="text-sm text-muted-foreground">{logPage} / {totalLogPages}</span>
                      <Button variant="outline" size="sm" className="bg-transparent" onClick={() => setLogPage(p => Math.min(totalLogPages, p + 1))} disabled={logPage === totalLogPages}>
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          </SheetContent>
        </Sheet>

        {/* Create/Edit Dialog */}
        <Dialog open={open} onOpenChange={(v) => { if (!v) closeDialog(); else setOpen(true); }}>
          <DialogContent className="bg-card border-border max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editId ? "编辑信号源" : "新建信号源"}</DialogTitle></DialogHeader>

            <div className="space-y-4">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">基本信息</p>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { key: "name", label: "策略名称", placeholder: "如：以太坊指标策略" },
                  { key: "symbol", label: "交易标的代码", placeholder: "如：ETH" },
                  { key: "tradingPair", label: "交易对", placeholder: "如：ETHUSDT" },
                  { key: "referencePosition", label: "参考仓位 (USDT)", placeholder: "如：1500" },
                  { key: "expectedMonthlyReturnMin", label: "预期月化下限 (%)", placeholder: "如：5" },
                  { key: "expectedMonthlyReturnMax", label: "预期月化上限 (%)", placeholder: "如：15" },
                ].map(({ key, label, placeholder }) => (
                  <div key={key} className="space-y-1">
                    <Label className="text-xs">{label}</Label>
                    <Input placeholder={placeholder} value={(form as any)[key]} onChange={(e) => setForm(f => ({ ...f, [key]: e.target.value }))} className="bg-input border-border text-sm" />
                  </div>
                ))}
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs">策略描述（可选）</Label>
                  <Input placeholder="简短描述策略逻辑" value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} className="bg-input border-border text-sm" />
                </div>
              </div>

              <Separator />

              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">信号源 API 配置</p>
              {editId && <p className="text-xs text-yellow-500">编辑模式下，留空表示不修改原有密钥</p>}

              {/* Exchange selector */}
              <div className="space-y-1">
                <Label className="text-xs">交易所</Label>
                <Select value={form.exchange} onValueChange={(v) => setForm(f => ({ ...f, exchange: v as ExchangeType }))}>
                  <SelectTrigger className="bg-input border-border text-sm">
                    <SelectValue placeholder="选择交易所" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(EXCHANGE_LABELS).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                {/* API Key */}
                <div className="space-y-1">
                  <Label className="text-xs">API Key</Label>
                  <div className="relative">
                    <Input type={showApiKey ? "text" : "password"} placeholder={editId ? "留空不修改" : "输入 API Key"}
                      value={form.apiKey} onChange={(e) => setForm(f => ({ ...f, apiKey: e.target.value }))}
                      className="bg-input border-border text-sm pr-10 font-mono" />
                    <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowApiKey(!showApiKey)}>
                      {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                {/* API Secret */}
                <div className="space-y-1">
                  <Label className="text-xs">API Secret</Label>
                  <div className="relative">
                    <Input type={showApiSecret ? "text" : "password"} placeholder={editId ? "留空不修改" : "输入 API Secret"}
                      value={form.apiSecret} onChange={(e) => setForm(f => ({ ...f, apiSecret: e.target.value }))}
                      className="bg-input border-border text-sm pr-10 font-mono" />
                    <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowApiSecret(!showApiSecret)}>
                      {showApiSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                {/* Passphrase - only for OKX and Bitget */}
                {(form.exchange === "okx" || form.exchange === "bitget") && (
                  <div className="space-y-1">
                    <Label className="text-xs">Passphrase（{EXCHANGE_LABELS[form.exchange]} 必填）</Label>
                    <div className="relative">
                      <Input type={showPassphrase ? "text" : "password"} placeholder={editId ? "留空不修改" : "输入 Passphrase"}
                        value={form.passphrase} onChange={(e) => setForm(f => ({ ...f, passphrase: e.target.value }))}
                        className="bg-input border-border text-sm pr-10 font-mono" />
                      <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowPassphrase(!showPassphrase)}>
                        {showPassphrase ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                )}
                {/* Webhook Secret */}
                <div className="space-y-1">
                  <Label className="text-xs">接入密码 (Webhook Secret)</Label>
                  <div className="relative">
                    <Input type={showWebhook ? "text" : "password"} placeholder={editId ? "留空不修改" : "输入接入密码"}
                      value={form.webhookSecret} onChange={(e) => setForm(f => ({ ...f, webhookSecret: e.target.value }))}
                      className="bg-input border-border text-sm pr-10 font-mono" />
                    <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowWebhook(!showWebhook)}>
                      {showWebhook ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <Button className="w-full mt-4" onClick={handleSave} disabled={isPending}>
              {isPending ? "保存中..." : editId ? "保存修改" : "创建信号源"}
            </Button>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
