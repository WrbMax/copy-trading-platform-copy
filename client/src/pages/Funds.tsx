import { useState } from "react";
import UserLayout from "@/components/UserLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Copy, AlertCircle, Wallet, ArrowDownToLine, ArrowUpFromLine, History } from "lucide-react";
import { toast } from "sonner";

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: "审核中", color: "bg-yellow-500/15 text-yellow-500" },
  approved: { label: "已到账", color: "bg-emerald-500/15 text-emerald-500" },
  rejected: { label: "已拒绝", color: "bg-red-500/15 text-red-500" },
  completed: { label: "已完成", color: "bg-emerald-500/15 text-emerald-500" },
  processing: { label: "处理中", color: "bg-blue-500/15 text-blue-500" },
};

export default function Funds() {
  const utils = trpc.useUtils();
  const { data: balance } = trpc.funds.myBalance.useQuery();
  const { data: depositAddr, isLoading: addrLoading } = trpc.funds.depositAddress.useQuery();
  const { data: deposits } = trpc.funds.myDeposits.useQuery({ page: 1, limit: 50 });
  const { data: withdrawals } = trpc.funds.myWithdrawals.useQuery({ page: 1, limit: 50 });

  const [depositAmount, setDepositAmount] = useState("");
  const [txHash, setTxHash] = useState("");
  const [proofNote, setProofNote] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [toAddress, setToAddress] = useState("");

  const depositMutation = trpc.funds.submitDeposit.useMutation({
    onSuccess: () => {
      toast.success("充值凭证已提交");
      utils.funds.myDeposits.invalidate();
      setDepositAmount("");
      setTxHash("");
      setProofNote("");
    },
    onError: (e) => toast.error(e.message),
  });

  const withdrawMutation = trpc.funds.submitWithdrawal.useMutation({
    onSuccess: () => {
      toast.success("提现申请已提交");
      utils.funds.myWithdrawals.invalidate();
      utils.funds.myBalance.invalidate();
      setWithdrawAmount("");
      setToAddress("");
    },
    onError: (e) => toast.error(e.message),
  });

  const copyToClipboard = (text: string) => {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(() => toast.success("已复制到剪贴板")).catch(() => fallbackCopy(text));
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
    try { document.execCommand("copy"); toast.success("已复制到剪贴板"); } catch { toast.error("复制失败，请手动复制"); }
    document.body.removeChild(ta);
  };
  const copyAddress = () => {
    if (depositAddr?.address) copyToClipboard(depositAddr.address);
  };

  return (
    <UserLayout>
      <div className="space-y-6 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold">充值提现</h1>
          <p className="text-muted-foreground text-sm mt-1">BSC链 USDT 充值与提现管理</p>
        </div>

        {/* Balance Card */}
        <Card className="bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
              <Wallet className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">可用余额</p>
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
              <ArrowDownToLine className="w-3.5 h-3.5" />充值
            </TabsTrigger>
            <TabsTrigger value="withdraw" className="flex-1 gap-1.5">
              <ArrowUpFromLine className="w-3.5 h-3.5" />提现
            </TabsTrigger>
            <TabsTrigger value="history" className="flex-1 gap-1.5">
              <History className="w-3.5 h-3.5" />记录
            </TabsTrigger>
          </TabsList>

          {/* Deposit Tab */}
          <TabsContent value="deposit" className="mt-4 space-y-4">
            <Card className="bg-card border-border">
              <CardContent className="p-5 space-y-5">
                {/* User's unique deposit address */}
                <div>
                  <h3 className="text-sm font-medium mb-3">您的专属充值地址</h3>
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
                        <Button size="sm" variant="outline" onClick={copyAddress} className="shrink-0">
                          <Copy className="w-4 h-4 mr-1" /> 复制
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-600 text-sm">
                      <AlertCircle className="w-4 h-4 inline mr-1" />
                      {depositAddr?.message || "充值系统正在初始化中，请稍后再试"}
                    </div>
                  )}
                </div>

                {/* Auto-detection notice */}
                <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 text-xs">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium">自动到账说明</p>
                    <p className="mt-1">向上方地址转入 USDT (BEP-20) 后，系统将自动检测链上交易并到账。通常在 2-10 分钟内完成。</p>
                  </div>
                </div>

                {/* Warning */}
                <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-600 text-xs">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <div>
                    <p>请仅转入 <strong>BSC链（BEP-20）的 USDT</strong>，转入其他网络或代币将导致资产丢失。</p>
                    <p className="mt-1">每个用户的充值地址是唯一的，请勿使用他人地址充值。</p>
                  </div>
                </div>

                {/* Manual submit (fallback) */}
                <details className="group">
                  <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                    自动到账未生效？点击手动提交充值凭证
                  </summary>
                  <div className="mt-3 space-y-3 pt-3 border-t border-border">
                    <div className="space-y-2">
                      <Label className="text-xs">充值金额 (USDT)</Label>
                      <Input type="number" placeholder="请输入充值金额" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} className="bg-input border-border" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">交易哈希 (TxHash)</Label>
                      <Input placeholder="0x..." value={txHash} onChange={(e) => setTxHash(e.target.value)} className="bg-input border-border font-mono text-sm" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">备注（可选）</Label>
                      <Input placeholder="其他说明" value={proofNote} onChange={(e) => setProofNote(e.target.value)} className="bg-input border-border" />
                    </div>
                    <Button
                      size="sm"
                      className="w-full"
                      onClick={() => depositMutation.mutate({ amount: parseFloat(depositAmount), txHash, proofNote })}
                      disabled={depositMutation.isPending || !depositAmount}
                    >
                      {depositMutation.isPending ? "提交中..." : "提交充值凭证"}
                    </Button>
                  </div>
                </details>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Withdraw Tab */}
          <TabsContent value="withdraw" className="mt-4 space-y-4">
            <Card className="bg-card border-border">
              <CardContent className="p-5 space-y-4">
                <div className="space-y-2">
                  <Label>提现金额 (USDT)</Label>
                  <Input type="number" placeholder="请输入提现金额" value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} className="bg-input border-border" />
                </div>
                <div className="space-y-2">
                  <Label>收款地址（BSC链）</Label>
                  <Input placeholder="0x..." value={toAddress} onChange={(e) => setToAddress(e.target.value)} className="bg-input border-border font-mono text-sm" />
                </div>
                <div className="p-3 rounded-lg bg-secondary/50 text-xs text-muted-foreground space-y-1">
                  <p>• 提现将收取手续费，实际到账金额以审核通知为准</p>
                  <p>• 提现申请提交后将冻结对应余额，审核通过后转账</p>
                  <p>• 请确保收款地址为BSC链地址，填写错误导致的损失自行承担</p>
                </div>
                <Button
                  className="w-full"
                  onClick={() => withdrawMutation.mutate({ amount: parseFloat(withdrawAmount), toAddress })}
                  disabled={withdrawMutation.isPending || !withdrawAmount || !toAddress}
                >
                  {withdrawMutation.isPending ? "提交中..." : "提交提现申请"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* History Tab */}
          <TabsContent value="history" className="mt-4 space-y-6">
            <div>
              <h3 className="text-sm font-medium mb-3 text-muted-foreground flex items-center gap-1.5">
                <ArrowDownToLine className="w-3.5 h-3.5" /> 充值记录
              </h3>
              {!deposits?.items.length ? (
                <p className="text-sm text-muted-foreground py-6 text-center">暂无充值记录</p>
              ) : (
                <div className="space-y-2">
                  {deposits.items.map((d: any) => (
                    <div key={d.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 border border-border">
                      <div>
                        <p className="text-sm font-medium text-emerald-500">+{parseFloat(d.amount).toFixed(4)} USDT</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {new Date(d.createdAt).toLocaleString()}
                          {d.txHash && <span className="ml-2 font-mono">Tx: {d.txHash.slice(0, 10)}...</span>}
                        </p>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_MAP[d.status]?.color || "bg-secondary text-muted-foreground"}`}>
                        {STATUS_MAP[d.status]?.label || d.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <h3 className="text-sm font-medium mb-3 text-muted-foreground flex items-center gap-1.5">
                <ArrowUpFromLine className="w-3.5 h-3.5" /> 提现记录
              </h3>
              {!withdrawals?.items.length ? (
                <p className="text-sm text-muted-foreground py-6 text-center">暂无提现记录</p>
              ) : (
                <div className="space-y-2">
                  {withdrawals.items.map((w: any) => (
                    <div key={w.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 border border-border">
                      <div>
                        <p className="text-sm font-medium text-red-500">-{parseFloat(w.amount).toFixed(4)} USDT</p>
                        <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                          {w.toAddress?.slice(0, 10)}...{w.toAddress?.slice(-6)}
                        </p>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_MAP[w.status]?.color || "bg-secondary text-muted-foreground"}`}>
                        {STATUS_MAP[w.status]?.label || w.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </UserLayout>
  );
}
