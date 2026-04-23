import { useState } from "react";
import UserLayout from "@/components/UserLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";

import { Zap, TrendingUp, Settings, AlertCircle, Info, AlertTriangle, ShieldAlert, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";
import { useLang } from "@/contexts/LangContext";
import { STRATEGY_RISK } from "@/lib/agreements";

const QUICK_MULTIPLIERS = [1, 2, 5, 10, 20, 50, 100];

export default function Strategy() {
  const utils = trpc.useUtils();
  const { lang } = useLang();
  const t = STRATEGY_RISK[lang];

  const { data: sources } = trpc.strategy.list.useQuery();
  const { data: myStrategies } = trpc.strategy.myStrategies.useQuery();
  const { data: apis } = trpc.exchange.list.useQuery();
  const [selectedSource, setSelectedSource] = useState<number | null>(null);
  const [selectedApi, setSelectedApi] = useState<string>("");
  const [multiplier, setMultiplier] = useState(1);
  const [multiplierInput, setMultiplierInput] = useState("1");
  const [dialogOpen, setDialogOpen] = useState(false);

  // Risk confirmation state — one checkbox per risk item + a "confirm all" checkbox
  const [riskChecked, setRiskChecked] = useState<Record<string, boolean>>({});
  const [riskExpanded, setRiskExpanded] = useState(false);

  const allRiskChecked = t.items.every((item) => riskChecked[item.id]);

  const toggleRisk = (id: string) => {
    setRiskChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleAll = (checked: boolean) => {
    const next: Record<string, boolean> = {};
    t.items.forEach((item) => { next[item.id] = checked; });
    setRiskChecked(next);
  };

  const setStrategyMutation = trpc.strategy.setStrategy.useMutation({
    onSuccess: () => {
      toast.success(lang === "zh" ? "策略设置已保存" : "Strategy settings saved");
      utils.strategy.myStrategies.invalidate();
      setDialogOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const activeApis = apis?.filter((a) => a.isActive) ?? [];
  const allApis = apis ?? [];

  const openDialog = (sourceId: number) => {
    const existing = myStrategies?.find((s) => s.signalSourceId === sourceId);
    setSelectedSource(sourceId);
    const existingApiStillValid = existing?.exchangeApi && activeApis.some(a => a.id === existing.exchangeApiId);
    setSelectedApi(existingApiStillValid ? existing.exchangeApiId.toString() : (activeApis[0]?.id?.toString() ?? ""));
    const m = parseFloat(existing?.multiplier || "1");
    setMultiplier(m);
    setMultiplierInput(m.toString());
    // Reset risk confirmation on each open
    setRiskChecked({});
    setRiskExpanded(false);
    setDialogOpen(true);
  };

  const handleMultiplierChange = (val: number) => {
    const clamped = Math.max(0.1, Math.min(100, val));
    setMultiplier(clamped);
    setMultiplierInput(clamped.toString());
  };

  const handleMultiplierInput = (val: string) => {
    setMultiplierInput(val);
    const num = parseFloat(val);
    if (!isNaN(num) && num >= 0.1 && num <= 100) {
      setMultiplier(num);
    }
  };

  const handleSave = (isEnabled: boolean) => {
    if (!selectedApi) {
      toast.error(lang === "zh" ? "请先绑定并选择交易所API" : "Please bind and select an exchange API first");
      return;
    }
    if (!selectedSource) {
      toast.error(lang === "zh" ? "请选择策略" : "Please select a strategy");
      return;
    }
    if (multiplier < 0.1 || multiplier > 100) {
      toast.error(lang === "zh" ? "数量倍数范围为 0.1-100" : "Multiplier must be between 0.1 and 100");
      return;
    }
    if (isEnabled && !allRiskChecked) {
      toast.error(t.mustCheckAll);
      setRiskExpanded(true);
      return;
    }
    setStrategyMutation.mutate({ signalSourceId: selectedSource, exchangeApiId: parseInt(selectedApi), multiplier, isEnabled });
  };

  const selectedSourceInfo = sources?.find((s) => s.id === selectedSource);

  return (
    <UserLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">
            {lang === "zh" ? "策略中心" : "Strategy Center"}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {lang === "zh"
              ? "选择策略并设置开仓数量倍数，系统将自动执行交易"
              : "Select a strategy and set your position multiplier. The system will execute trades automatically."}
          </p>
        </div>

        {/* My Active Strategies */}
        {myStrategies && myStrategies.length > 0 && (
          <div>
            <h2 className="text-base font-semibold mb-3">
              {lang === "zh" ? "我的策略" : "My Strategies"}
            </h2>
            <div className="space-y-3">
              {myStrategies.map((s) => {
                const apiMissing = !s.exchangeApi;
                return (
                  <Card key={s.id} className={`bg-card border-border ${apiMissing ? 'border-destructive/40' : ''}`}>
                    <CardContent className="p-4">
                      {apiMissing && (
                        <div className="flex items-start gap-2 p-2.5 mb-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive">
                          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-xs font-medium">
                              {lang === "zh" ? "API已失效，策略已停止运行" : "API expired — strategy stopped"}
                            </p>
                            <p className="text-xs mt-0.5 opacity-80">
                              {lang === "zh" ? "请重新绑定API并在下方重新配置策略" : "Please re-bind your API and reconfigure the strategy below"}
                            </p>
                          </div>
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold ${apiMissing ? 'bg-destructive/15 text-destructive' : 'bg-primary/15 text-primary'}`}>
                            {s.signalSource?.symbol?.slice(0, 3) || "?"}
                          </div>
                          <div>
                            <p className="font-medium text-sm">{s.signalSource?.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {s.signalSource?.tradingPair} · {apiMissing ? <span className="text-destructive">{lang === "zh" ? "API已删除" : "API deleted"}</span> : s.exchangeApi?.exchange} · {lang === "zh" ? "数量" : "Qty"} {s.multiplier}x
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {!apiMissing && (
                            <Switch checked={s.isEnabled} onCheckedChange={(v) => {
                              if (!v) {
                                // Disabling: no risk confirmation needed, call backend directly
                                setStrategyMutation.mutate({ signalSourceId: s.signalSourceId, exchangeApiId: s.exchangeApiId, multiplier: parseFloat(s.multiplier), isEnabled: false });
                              } else {
                                // Enabling: must go through the dialog with risk confirmation
                                openDialog(s.signalSourceId);
                              }
                            }} />
                          )}
                          <Button size="sm" variant="ghost" onClick={() => openDialog(s.signalSourceId)}>
                            <Settings className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* Available Strategies */}
        <div>
          <h2 className="text-base font-semibold mb-3">
            {lang === "zh" ? "可用策略" : "Available Strategies"}
          </h2>
          <div className="grid md:grid-cols-2 gap-4">
            {sources?.map((source) => {
              const myStrategy = myStrategies?.find((s) => s.signalSourceId === source.id);
              const apiMissing = myStrategy && !myStrategy.exchangeApi;
              return (
                <Card key={source.id} className="bg-card border-border hover:border-primary/40 transition-colors">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-primary/15 rounded-xl flex items-center justify-center text-primary font-bold">
                          {source.symbol.slice(0, 3)}
                        </div>
                        <div>
                          <CardTitle className="text-base">{source.name}</CardTitle>
                          <p className="text-xs text-muted-foreground mt-0.5">{source.tradingPair}</p>
                        </div>
                      </div>
                      {apiMissing ? (
                        <Badge variant="destructive" className="text-xs">
                          <AlertTriangle className="w-3 h-3 mr-1" />{lang === "zh" ? "API失效" : "API Invalid"}
                        </Badge>
                      ) : myStrategy?.isEnabled ? (
                        <Badge className="bg-primary/15 text-primary border-0 text-xs">
                          <span className="w-1.5 h-1.5 bg-primary rounded-full mr-1 animate-pulse" />
                          {lang === "zh" ? "运行中" : "Running"}
                        </Badge>
                      ) : myStrategy ? (
                        <Badge variant="secondary" className="text-xs">
                          {lang === "zh" ? "已配置" : "Configured"}
                        </Badge>
                      ) : null}
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-3">
                    {source.description && <p className="text-sm text-muted-foreground">{source.description}</p>}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 rounded-lg bg-secondary/50">
                        <p className="text-xs text-muted-foreground">{lang === "zh" ? "参考仓位" : "Ref. Position"}</p>
                        <p className="text-sm font-semibold mt-0.5">{parseFloat(source.referencePosition).toFixed(0)} USDT</p>
                      </div>
                      <div className="p-3 rounded-lg bg-secondary/50">
                        <p className="text-xs text-muted-foreground">{lang === "zh" ? "预期月化" : "Est. Monthly"}</p>
                        <p className="text-sm font-semibold mt-0.5 text-profit">{source.expectedMonthlyReturnMin}~{source.expectedMonthlyReturnMax}%</p>
                      </div>
                    </div>
                    <Button className="w-full" size="sm" onClick={() => openDialog(source.id)}>
                      <Zap className="w-4 h-4 mr-1" />
                      {apiMissing
                        ? (lang === "zh" ? "重新配置" : "Reconfigure")
                        : myStrategy
                          ? (lang === "zh" ? "修改设置" : "Edit Settings")
                          : (lang === "zh" ? "开启策略" : "Activate Strategy")}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Config Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="bg-card border-border max-w-md w-[95vw] p-0 gap-0 !grid-rows-none" style={{maxHeight: 'min(90vh, 700px)', display: 'flex', flexDirection: 'column'}}>
            <DialogHeader className="px-5 pt-5 pb-4 border-b border-border flex-shrink-0">
              <DialogTitle className="flex items-center gap-2 text-base">
                {selectedSourceInfo && (
                  <span className="w-7 h-7 bg-primary/15 rounded-lg flex items-center justify-center text-primary text-xs font-bold flex-shrink-0">
                    {selectedSourceInfo.symbol.slice(0, 3)}
                  </span>
                )}
                {lang === "zh" ? "策略设置" : "Strategy Settings"} — {selectedSourceInfo?.name}
              </DialogTitle>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto overscroll-contain" style={{WebkitOverflowScrolling: 'touch'}}>
              <div className="px-5 py-4 space-y-5">
                {/* API Warning inside dialog */}
                {activeApis.length === 0 && (
                  <div className="flex items-start gap-3 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive">
                    <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-sm">
                        {lang === "zh" ? "请先绑定交易所API" : "Please bind an exchange API first"}
                      </p>
                      <p className="text-xs mt-1 opacity-80">
                        {lang === "zh" ? "您可以先预设倍数，绑定API后即可启用策略" : "You can preset the multiplier now and enable the strategy after binding an API"}
                      </p>
                      <Button asChild size="sm" variant="outline" className="mt-2 bg-transparent border-destructive/40 text-destructive hover:bg-destructive/10">
                        <Link href="/exchange-api">{lang === "zh" ? "去绑定API" : "Bind API"}</Link>
                      </Button>
                    </div>
                  </div>
                )}

                {/* API Selection */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    {lang === "zh" ? "选择交易所API" : "Select Exchange API"}
                  </label>
                  {activeApis.length > 0 ? (
                    <Select value={selectedApi} onValueChange={setSelectedApi}>
                      <SelectTrigger className="bg-input border-border">
                        <SelectValue placeholder={lang === "zh" ? "选择API" : "Select API"} />
                      </SelectTrigger>
                      <SelectContent className="bg-card border-border">
                        {activeApis.map((a) => (
                          <SelectItem key={a.id} value={a.id.toString()}>
                            {a.label || a.exchange} ({a.exchange})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="p-3 rounded-lg bg-secondary/50 text-sm text-muted-foreground">
                      {lang === "zh" ? "暂无可用API，请先前往 API绑定 页面添加" : "No available API. Please add one on the API Binding page."}
                    </div>
                  )}
                </div>

                {/* Multiplier Section */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">
                      {lang === "zh" ? "开仓数量倍数" : "Position Multiplier"}
                    </label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={0.1}
                        max={100}
                        value={multiplierInput}
                        onChange={(e) => handleMultiplierInput(e.target.value)}
                        onBlur={() => {
                          const num = parseFloat(multiplierInput);
                          if (isNaN(num) || num < 0.1) handleMultiplierChange(1);
                          else if (num > 100) handleMultiplierChange(100);
                          else handleMultiplierChange(num);
                        }}
                        className="w-20 bg-input border-border text-center text-sm font-bold"
                      />
                      <span className="text-sm font-bold text-primary">x</span>
                    </div>
                  </div>
                  <Slider min={1} max={100} step={1} value={[multiplier]} onValueChange={([v]) => handleMultiplierChange(v)} className="w-full" />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>1x</span><span>100x</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {lang === "zh" ? "可在输入框手动输入 0.1–100 之间的任意值" : "You may manually enter any value between 0.1 and 100"}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {QUICK_MULTIPLIERS.map((m) => (
                      <button
                        key={m}
                        type="button"
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          multiplier === m
                            ? "bg-primary text-primary-foreground"
                            : "bg-secondary/70 text-muted-foreground hover:bg-secondary hover:text-foreground"
                        }`}
                        onClick={() => handleMultiplierChange(m)}
                      >
                        {m}x
                      </button>
                    ))}
                  </div>
                </div>

                {/* Info */}
                <div className="p-3 rounded-lg bg-secondary/50 text-xs text-muted-foreground space-y-1">
                  <p>
                    <TrendingUp className="w-4 h-4 inline mr-1 text-primary" />
                    {lang === "zh"
                      ? "数量倍数表示相对于信号源的开仓个数倍率。例如信号源开仓1个ETH，设置2x则开仓2个ETH。"
                      : "The multiplier represents the position size relative to the signal source. E.g., if the source opens 1 ETH, 2x means you open 2 ETH."}
                  </p>
                  {selectedSourceInfo && (
                    <p>
                      <Info className="w-4 h-4 inline mr-1 text-primary" />
                      {lang === "zh"
                        ? `信号源开仓1个${selectedSourceInfo.symbol}，您将开仓 ${multiplier} 个${selectedSourceInfo.symbol}`
                        : `Signal source opens 1 ${selectedSourceInfo.symbol} — you will open ${multiplier} ${selectedSourceInfo.symbol}`}
                    </p>
                  )}
                </div>

                {/* ── Risk Confirmation Section ── */}
                <div className="rounded-xl border border-border overflow-hidden">
                  {/* Collapsible header */}
                  <button
                    type="button"
                    onClick={() => setRiskExpanded((v) => !v)}
                    className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors ${
                      allRiskChecked
                        ? "bg-primary/8 border-b border-primary/20"
                        : "bg-secondary/40 border-b border-border"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <ShieldAlert className={`w-4 h-4 flex-shrink-0 ${allRiskChecked ? "text-primary" : "text-amber-500"}`} />
                      <span className="text-sm font-semibold">
                        {t.title}
                      </span>
                      {allRiskChecked && (
                        <span className="text-xs text-primary font-medium">
                          {lang === "zh" ? "✓ 已确认" : "✓ Confirmed"}
                        </span>
                      )}
                    </div>
                    {riskExpanded
                      ? <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      : <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    }
                  </button>

                  {/* Collapsible body */}
                  {riskExpanded && (
                    <div className="px-4 py-3 space-y-3 bg-card">
                      <p className="text-xs text-muted-foreground">{t.subtitle}</p>

                      {/* Individual risk items */}
                      {t.items.map((item) => (
                        <div
                          key={item.id}
                          className={`flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                            riskChecked[item.id]
                              ? "border-primary/30 bg-primary/5"
                              : "border-border bg-secondary/30 hover:border-border/80"
                          }`}
                          onClick={() => toggleRisk(item.id)}
                        >
                          <Checkbox
                            id={`risk-${item.id}`}
                            checked={!!riskChecked[item.id]}
                            onCheckedChange={() => toggleRisk(item.id)}
                            className="mt-0.5 flex-shrink-0"
                          />
                          <div className="space-y-0.5 min-w-0">
                            <label
                              htmlFor={`risk-${item.id}`}
                              className="text-xs font-semibold text-foreground cursor-pointer flex items-center gap-1.5"
                            >
                              <span>{item.icon}</span>
                              {item.label}
                            </label>
                            <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
                          </div>
                        </div>
                      ))}

                      {/* Confirm all */}
                      <div
                        className={`flex items-start gap-3 p-3 rounded-lg border-2 transition-colors cursor-pointer ${
                          allRiskChecked
                            ? "border-primary bg-primary/8"
                            : "border-dashed border-border hover:border-primary/40"
                        }`}
                        onClick={() => toggleAll(!allRiskChecked)}
                      >
                        <Checkbox
                          id="risk-all"
                          checked={allRiskChecked}
                          onCheckedChange={(v) => toggleAll(!!v)}
                          className="mt-0.5 flex-shrink-0"
                        />
                        <label
                          htmlFor="risk-all"
                          className="text-xs font-semibold cursor-pointer leading-snug"
                        >
                          {t.confirmAll}
                        </label>
                      </div>
                    </div>
                  )}

                  {/* Collapsed summary */}
                  {!riskExpanded && (
                    <div className="px-4 py-2.5 bg-card">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                          {lang === "zh"
                            ? `已确认 ${Object.values(riskChecked).filter(Boolean).length} / ${t.items.length} 项`
                            : `${Object.values(riskChecked).filter(Boolean).length} / ${t.items.length} items confirmed`}
                        </span>
                        <button
                          type="button"
                          onClick={() => setRiskExpanded(true)}
                          className="text-xs text-primary hover:underline"
                        >
                          {lang === "zh" ? "展开确认 →" : "Expand to confirm →"}
                        </button>
                      </div>
                      {/* Progress bar */}
                      <div className="mt-1.5 h-1 rounded-full bg-secondary overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all duration-300"
                          style={{ width: `${(Object.values(riskChecked).filter(Boolean).length / t.items.length) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    className="flex-1 bg-transparent"
                    onClick={() => handleSave(false)}
                    disabled={setStrategyMutation.isPending || activeApis.length === 0}
                  >
                    {t.saveBtn}
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={() => handleSave(true)}
                    disabled={setStrategyMutation.isPending || activeApis.length === 0 || !allRiskChecked}
                    title={!allRiskChecked ? t.mustCheckAll : undefined}
                  >
                    {setStrategyMutation.isPending
                      ? (lang === "zh" ? "保存中..." : "Saving...")
                      : t.activateBtn}
                  </Button>
                </div>
                {activeApis.length === 0 && (
                  <p className="text-xs text-center text-muted-foreground">
                    {lang === "zh" ? "绑定交易所API后即可保存策略" : "Bind an exchange API to save the strategy"}
                  </p>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </UserLayout>
  );
}
