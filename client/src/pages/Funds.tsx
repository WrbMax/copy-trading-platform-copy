import { useState, useMemo } from "react";
import UserLayout from "@/components/UserLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Copy, AlertCircle, Wallet, ArrowDownToLine, ArrowUpFromLine, History, Info, CheckCircle2 } from "lucide-react";
import { formatDateTime } from "@/lib/time";
import { toast } from "sonner";
import { useLang } from "@/contexts/LangContext";

const STATUS_MAP: Record<string, { label: string; labelEn: string; color: string }> = {
  pending:    { label: "审核中",  labelEn: "Pending",    color: "bg-yellow-500/15 text-yellow-500" },
  approved:   { label: "已到账",  labelEn: "Credited",   color: "bg-emerald-500/15 text-emerald-500" },
  rejected:   { label: "已拒绝",  labelEn: "Rejected",   color: "bg-red-500/15 text-red-500" },
  completed:  { label: "已完成",  labelEn: "Completed",  color: "bg-emerald-500/15 text-emerald-500" },
  processing: { label: "处理中",  labelEn: "Processing", color: "bg-blue-500/15 text-blue-500" },
};

const TX_TYPE_MAP: Record<string, { label: string; labelEn: string }> = {
  deposit:      { label: "充值",       labelEn: "Deposit" },
  withdrawal:   { label: "提现",       labelEn: "Withdrawal" },
  profit:       { label: "收益",       labelEn: "Profit" },
  fee:          { label: "手续费",     labelEn: "Fee" },
  admin_adjust: { label: "管理员调整", labelEn: "Admin Adjust" },
  route_redeem: { label: "Route兑换",  labelEn: "Route Redeem" },
};

export default function Funds() {
  const { lang } = useLang();
  const isZh = lang === "zh";
  const utils = trpc.useUtils();

  const { data: balance } = trpc.funds.myBalance.useQuery();
  const { data: withdrawConfig } = trpc.funds.withdrawalConfig.useQuery();
  const { data: depositAddr, isLoading: addrLoading } = trpc.funds.depositAddress.useQuery();
  const { data: deposits } = trpc.funds.myDeposits.useQuery({ page: 1, limit: 50 });
  const { data: withdrawals } = trpc.funds.myWithdrawals.useQuery({ page: 1, limit: 50 });
  const { data: transactions } = trpc.funds.myTransactions.useQuery({ page: 1, limit: 100 });

  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [toAddress, setToAddress] = useState("");

  const feeRate = withdrawConfig?.feeRate ?? 0.01;
  const minAmount = withdrawConfig?.minAmount ?? 10;

  // Real-time fee calculation
  const withdrawCalc = useMemo(() => {
    const amt = parseFloat(withdrawAmount);
    if (!withdrawAmount || isNaN(amt) || amt <= 0) return null;
    const fee = amt * feeRate;
    const net = amt - fee;
    return { fee: fee.toFixed(4), net: net.toFixed(4) };
  }, [withdrawAmount, feeRate]);

  const withdrawMutation = trpc.funds.submitWithdrawal.useMutation({
    onSuccess: () => {
      toast.success(isZh ? "提现申请已提交" : "Withdrawal submitted");
      utils.funds.myWithdrawals.invalidate();
      utils.funds.myBalance.invalidate();
      setWithdrawAmount("");
      setToAddress("");
    },
    onError: (e) => toast.error(e.message),
  });

  const copyToClipboard = (text: string) => {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text)
        .then(() => toast.success(isZh ? "已复制到剪贴板" : "Copied to clipboard"))
        .catch(() => fallbackCopy(text));
    } else {
      fallbackCopy(text);
    }
  };

  const fallbackCopy = (text: string) => {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      toast.success(isZh ? "已复制到剪贴板" : "Copied to clipboard");
    } catch {
      toast.error(isZh ? "复制失败，请手动复制" : "Copy failed, please copy manually");
    }
    document.body.removeChild(ta);
  };

  return (
    <UserLayout>
      <div className="space-y-6 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold">{isZh ? "充值提现" : "Deposit & Withdraw"}</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {isZh ? "BSC链 USDT 充值与提现管理" : "BSC Chain USDT Deposit & Withdrawal"}
          </p>
        </div>

        {/* Balance Card */}
        <Card className="bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
              <Wallet className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{isZh ? "可用余额" : "Available Balance"}</p>
              <p className="text-3xl font-bold text-foreground">
                {parseFloat(balance?.balance || "0").toFixed(4)}
                <span className="text-lg font-normal text-muted-foreground ml-1">USDT</span>
              </p>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="deposit">
          <TabsList className="bg-secondary w-full">
            <TabsTrigger value="deposit" className="flex-1 gap-1.5">
              <ArrowDownToLine className="w-3.5 h-3.5" />
              {isZh ? "充值" : "Deposit"}
            </TabsTrigger>
            <TabsTrigger value="withdraw" className="flex-1 gap-1.5">
              <ArrowUpFromLine className="w-3.5 h-3.5" />
              {isZh ? "提现" : "Withdraw"}
            </TabsTrigger>
            <TabsTrigger value="history" className="flex-1 gap-1.5">
              <History className="w-3.5 h-3.5" />
              {isZh ? "记录" : "History"}
            </TabsTrigger>
          </TabsList>

          {/* ── Deposit Tab ── */}
          <TabsContent value="deposit" className="mt-4 space-y-4">
            <Card className="bg-card border-border">
              <CardContent className="p-5 space-y-5">

                {/* Unique deposit address */}
                <div>
                  <h3 className="text-sm font-medium mb-3">
                    {isZh ? "您的专属充值地址" : "Your Unique Deposit Address"}
                  </h3>
                  {addrLoading ? (
                    <div className="p-4 rounded-lg bg-secondary/50 animate-pulse h-20" />
                  ) : depositAddr?.address ? (
                    <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
                      <div className="flex items-center gap-1 mb-2">
                        <span className="text-xs font-medium px-2 py-0.5 rounded bg-primary/20 text-primary">BSC (BEP-20)</span>
                        <span className="text-xs font-medium px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-500">USDT</span>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <p className="font-mono text-sm text-foreground break-all flex-1 select-all">
                          {depositAddr.address}
                        </p>
                        <Button size="sm" variant="outline" onClick={() => copyToClipboard(depositAddr.address!)} className="shrink-0">
                          <Copy className="w-4 h-4 mr-1" />
                          {isZh ? "复制" : "Copy"}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-600 text-sm">
                      <AlertCircle className="w-4 h-4 inline mr-1" />
                      {depositAddr?.message || (isZh ? "充值系统正在初始化中，请稍后再试" : "Deposit system initializing, please try again later")}
                    </div>
                  )}
                </div>

                {/* Auto-credit notice */}
                <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 text-xs">
                  <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium">{isZh ? "全自动到账" : "Fully Automatic Crediting"}</p>
                    <p className="mt-1">
                      {isZh
                        ? "向上方地址转入 USDT (BEP-20) 后，系统将自动检测链上交易并到账，通常在 2–10 分钟内完成，无需任何手动操作。"
                        : "After transferring USDT (BEP-20) to the address above, the system automatically detects the on-chain transaction and credits your account within 2–10 minutes. No manual action required."}
                    </p>
                  </div>
                </div>

                {/* Warning */}
                <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-600 text-xs">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <div className="space-y-1">
                    <p className="font-medium">{isZh ? "重要提示" : "Important"}</p>
                    <p>
                      {isZh
                        ? <>请仅转入 <strong>BSC链（BEP-20）的 USDT</strong>，转入其他网络或代币将导致资产永久丢失。</>
                        : <>Only transfer <strong>USDT on BSC (BEP-20)</strong>. Sending other networks or tokens will result in permanent loss.</>}
                    </p>
                    <p>
                      {isZh
                        ? "每个用户的充值地址唯一，请勿将他人地址用于充值。"
                        : "Each user has a unique deposit address. Do not use another user's address."}
                    </p>
                  </div>
                </div>

              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Withdraw Tab ── */}
          <TabsContent value="withdraw" className="mt-4 space-y-4">
            <Card className="bg-card border-border">
              <CardContent className="p-5 space-y-4">

                {/* Fee Rate Info Banner */}
                <div className="flex items-start gap-3 p-4 rounded-xl bg-primary/8 border border-primary/20">
                  <Info className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <p className="text-sm font-semibold text-foreground">
                      {isZh ? "提现费率说明" : "Withdrawal Fee Schedule"}
                    </p>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="bg-background/60 rounded-lg p-2.5 border border-border/60">
                        <p className="text-muted-foreground mb-1">{isZh ? "手续费率" : "Fee Rate"}</p>
                        <p className="text-lg font-bold text-primary">{(feeRate * 100).toFixed(1)}%</p>
                      </div>
                      <div className="bg-background/60 rounded-lg p-2.5 border border-border/60">
                        <p className="text-muted-foreground mb-1">{isZh ? "最低提现" : "Minimum"}</p>
                        <p className="text-lg font-bold text-foreground">{minAmount} <span className="text-sm font-normal text-muted-foreground">USDT</span></p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {isZh
                        ? "手续费 = 提现金额 × 费率，从提现金额中扣除，实际到账为扣费后金额。"
                        : "Fee = Withdrawal amount × fee rate, deducted from the withdrawal. Net amount is credited to your wallet."}
                    </p>
                  </div>
                </div>

                {/* Amount Input */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>{isZh ? "提现金额 (USDT)" : "Withdrawal Amount (USDT)"}</Label>
                    <span className="text-xs text-muted-foreground">
                      {isZh ? "可用：" : "Available: "}
                      <span className="text-foreground font-medium">{parseFloat(balance?.balance || "0").toFixed(4)} USDT</span>
                    </span>
                  </div>
                  <Input
                    type="number"
                    placeholder={isZh ? `最低 ${minAmount} USDT` : `Minimum ${minAmount} USDT`}
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    className="bg-input border-border"
                  />
                </div>

                {/* Real-time fee calculation */}
                {withdrawCalc && (
                  <div className="rounded-xl border border-border bg-secondary/40 overflow-hidden">
                    <div className="px-4 py-2 bg-secondary/60 border-b border-border">
                      <p className="text-xs font-medium text-muted-foreground">
                        {isZh ? "费用明细" : "Fee Breakdown"}
                      </p>
                    </div>
                    <div className="px-4 py-3 space-y-2 text-sm">
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">{isZh ? "提现金额" : "Withdrawal Amount"}</span>
                        <span className="font-medium">{parseFloat(withdrawAmount).toFixed(4)} USDT</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">
                          {isZh ? `手续费 (${(feeRate * 100).toFixed(1)}%)` : `Fee (${(feeRate * 100).toFixed(1)}%)`}
                        </span>
                        <span className="text-red-400 font-medium">− {withdrawCalc.fee} USDT</span>
                      </div>
                      <div className="h-px bg-border" />
                      <div className="flex justify-between items-center">
                        <span className="font-semibold">{isZh ? "预计到账" : "You Receive"}</span>
                        <span className="font-bold text-emerald-400 text-base">{withdrawCalc.net} USDT</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Address Input */}
                <div className="space-y-2">
                  <Label>{isZh ? "收款地址（BSC链）" : "Receiving Address (BSC)"}</Label>
                  <Input
                    placeholder="0x..."
                    value={toAddress}
                    onChange={(e) => setToAddress(e.target.value)}
                    className="bg-input border-border font-mono text-sm"
                  />
                </div>

                {/* Warnings */}
                <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-600 text-xs space-y-1.5">
                  <p className="font-medium flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {isZh ? "注意事项" : "Important Notes"}
                  </p>
                  <p>• {isZh ? "提现申请提交后将冻结对应余额，审核通过后转账" : "Funds are frozen upon submission and transferred after approval"}</p>
                  <p>• {isZh ? "请确保收款地址为BSC链地址，填写错误导致的损失自行承担" : "Ensure the address is on BSC network. Losses from incorrect addresses are your responsibility"}</p>
                  <p>• {isZh ? "审核通常在1个工作日内完成" : "Reviews are typically completed within 1 business day"}</p>
                </div>

                <Button
                  className="w-full"
                  onClick={() => {
                    const amt = parseFloat(withdrawAmount);
                    if (!withdrawAmount || isNaN(amt) || amt <= 0) {
                      toast.error(isZh ? "请输入有效的提现金额" : "Please enter a valid amount");
                      return;
                    }
                    if (amt < minAmount) {
                      toast.error(isZh ? `最低提现金额为 ${minAmount} USDT` : `Minimum withdrawal is ${minAmount} USDT`);
                      return;
                    }
                    if (amt > parseFloat(balance?.balance || "0")) {
                      toast.error(isZh ? "余额不足，无法提现" : "Insufficient balance");
                      return;
                    }
                    if (!toAddress || toAddress.trim() === "") {
                      toast.error(isZh ? "请输入收款地址" : "Please enter receiving address");
                      return;
                    }
                    // Validate BSC address format (0x + 40 hex chars)
                    if (!/^0x[0-9a-fA-F]{40}$/.test(toAddress.trim())) {
                      toast.error(isZh ? "请输入有效的 BSC 链地址（以 0x 开头，共 42 位）" : "Please enter a valid BSC address (starts with 0x, 42 characters)");
                      return;
                    }
                    withdrawMutation.mutate({ amount: amt, toAddress: toAddress.trim() });
                  }}
                  disabled={withdrawMutation.isPending || !withdrawAmount || !toAddress}
                >
                  {withdrawMutation.isPending
                    ? (isZh ? "提交中..." : "Submitting...")
                    : (isZh ? "提交提现申请" : "Submit Withdrawal")}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── History Tab ── */}
          <TabsContent value="history" className="mt-4 space-y-6">

            {/* All Fund Transactions */}
            <div>
              <h3 className="text-sm font-medium mb-3 text-muted-foreground flex items-center gap-1.5">
                <History className="w-4 h-4" />
                {isZh ? "全部资金流水" : "All Transactions"}
              </h3>
              {transactions?.items && transactions.items.length > 0 ? (
                <div className="space-y-2">
                  {transactions.items.map((tx: any) => {
                    const typeInfo = TX_TYPE_MAP[tx.type] ?? { label: tx.type, labelEn: tx.type };
                    const isPositive = parseFloat(tx.amount) >= 0;
                    return (
                      <Card key={tx.id} className="bg-card border-border">
                        <CardContent className="p-3 flex items-center justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                                {isZh ? typeInfo.label : typeInfo.labelEn}
                              </span>
                              {tx.note && (
                                <span className="text-xs text-muted-foreground truncate">{tx.note}</span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">{formatDateTime(tx.createdAt)}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className={`font-semibold text-sm ${isPositive ? "text-emerald-400" : "text-red-400"}`}>
                              {isPositive ? "+" : ""}{parseFloat(tx.amount).toFixed(4)} USDT
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {isZh ? "余额 " : "Bal "}{parseFloat(tx.balanceAfter).toFixed(4)}
                            </p>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-10 text-muted-foreground text-sm">
                  {isZh ? "暂无资金记录" : "No transactions yet"}
                </div>
              )}
            </div>

            {/* Deposit History */}
            <div>
              <h3 className="text-sm font-medium mb-3 text-muted-foreground flex items-center gap-1.5">
                <ArrowDownToLine className="w-4 h-4" />
                {isZh ? "充值记录" : "Deposit History"}
              </h3>
              {deposits?.items && deposits.items.length > 0 ? (
                <div className="space-y-2">
                  {deposits.items.map((d: any) => {
                    const s = STATUS_MAP[d.status] ?? { label: d.status, labelEn: d.status, color: "bg-secondary text-muted-foreground" };
                    return (
                      <Card key={d.id} className="bg-card border-border">
                        <CardContent className="p-3 flex items-center justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={`text-xs px-1.5 py-0.5 rounded ${s.color}`}>
                                {isZh ? s.label : s.labelEn}
                              </span>
                              {d.txHash && (
                                <span className="font-mono text-xs text-muted-foreground truncate max-w-[120px]">{d.txHash}</span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">{formatDateTime(d.createdAt)}</p>
                          </div>
                          <p className="font-semibold text-sm text-emerald-400 shrink-0">
                            +{parseFloat(d.amount).toFixed(4)} USDT
                          </p>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  {isZh ? "暂无充值记录" : "No deposit history"}
                </div>
              )}
            </div>

            {/* Withdrawal History */}
            <div>
              <h3 className="text-sm font-medium mb-3 text-muted-foreground flex items-center gap-1.5">
                <ArrowUpFromLine className="w-4 h-4" />
                {isZh ? "提现记录" : "Withdrawal History"}
              </h3>
              {withdrawals?.items && withdrawals.items.length > 0 ? (
                <div className="space-y-2">
                  {withdrawals.items.map((w: any) => {
                    const s = STATUS_MAP[w.status] ?? { label: w.status, labelEn: w.status, color: "bg-secondary text-muted-foreground" };
                    return (
                      <Card key={w.id} className="bg-card border-border">
                        <CardContent className="p-3 flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-xs px-1.5 py-0.5 rounded ${s.color}`}>
                                {isZh ? s.label : s.labelEn}
                              </span>
                              <span className="font-mono text-xs text-muted-foreground truncate max-w-[160px]">{w.toAddress}</span>
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                              <span>{isZh ? `手续费 ${parseFloat(w.fee).toFixed(4)} USDT` : `Fee ${parseFloat(w.fee).toFixed(4)} USDT`}</span>
                              <span>{isZh ? `到账 ${parseFloat(w.netAmount).toFixed(4)} USDT` : `Net ${parseFloat(w.netAmount).toFixed(4)} USDT`}</span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">{formatDateTime(w.createdAt)}</p>
                          </div>
                          <p className="font-semibold text-sm text-red-400 shrink-0">
                            −{parseFloat(w.amount).toFixed(4)} USDT
                          </p>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  {isZh ? "暂无提现记录" : "No withdrawal history"}
                </div>
              )}
            </div>

          </TabsContent>
        </Tabs>
      </div>
    </UserLayout>
  );
}
