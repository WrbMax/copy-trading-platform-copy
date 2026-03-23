import { useState } from "react";
import UserLayout from "@/components/UserLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Coins, ArrowRightLeft, Gift, Info, TrendingDown, CheckCircle, XCircle } from "lucide-react";
import { toast } from "sonner";

const TYPE_LABELS: Record<string, string> = {
  redeem: "净亏损兑换",
  transfer_in: "积分转入",
  transfer_out: "积分转出",
  admin_add: "管理员增加",
  admin_deduct: "管理员扣减",
};

export default function Points() {
  const utils = trpc.useUtils();
  const { data: balance } = trpc.points.myBalance.useQuery();
  const { data: txData } = trpc.points.myTransactions.useQuery({ page: 1, limit: 20 });
  const { data: stats } = trpc.strategy.orderStats.useQuery();
  const { data: profile } = trpc.user.profile.useQuery();

  const [transferOpen, setTransferOpen] = useState(false);
  const [toUserId, setToUserId] = useState("");
  const [transferAmount, setTransferAmount] = useState("");

  const redeemMutation = trpc.points.redeem.useMutation({
    onSuccess: (r) => {
      toast.success(`成功兑换 ${r.pointsAdded} 积分！`);
      utils.points.myBalance.invalidate();
      utils.points.myTransactions.invalidate();
      utils.strategy.orderStats.invalidate();
      utils.user.profile.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const transferMutation = trpc.points.transfer.useMutation({
    onSuccess: () => {
      toast.success("积分转出成功");
      utils.points.myBalance.invalidate();
      utils.points.myTransactions.invalidate();
      setTransferOpen(false);
      setToUserId("");
      setTransferAmount("");
    },
    onError: (e) => toast.error(e.message),
  });

  const netPnl = stats?.netPnl ?? 0;
  const totalProfit = stats?.totalProfit ?? 0;
  const totalLoss = stats?.totalLoss ?? 0;
  const canRedeem = netPnl < 0;
  const redeemablePoints = canRedeem ? Math.floor(Math.abs(netPnl)) : 0;
  const currentMonth = new Date().toISOString().slice(0, 7);
  const alreadyRedeemedThisMonth = profile?.lastPointsRedeemMonth === currentMonth;

  return (
    <UserLayout>
      <div className="space-y-6 max-w-2xl">
        <div>
          <h1 className="text-2xl font-bold">积分中心</h1>
          <p className="text-muted-foreground text-sm mt-1">净亏损可兑换积分，积分可在平台内转让</p>
        </div>

        {/* Points Balance Card */}
        <Card className="bg-card border-border">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">积分余额</p>
                <div className="flex items-baseline gap-2 mt-1">
                  <p className="text-3xl font-bold text-foreground">{balance?.points ?? 0}</p>
                  <p className="text-muted-foreground">积分</p>
                </div>
              </div>
              <Coins className="w-10 h-10 text-primary opacity-60" />
            </div>
            <div className="mt-4">
              <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="w-full bg-transparent">
                    <ArrowRightLeft className="w-4 h-4 mr-1" />转让积分给其他用户
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-card border-border">
                  <DialogHeader><DialogTitle>积分转让</DialogTitle></DialogHeader>
                  <div className="space-y-4 mt-2">
                    <div className="space-y-2">
                      <Label>目标用户ID</Label>
                      <Input placeholder="请输入用户ID" value={toUserId} onChange={(e) => setToUserId(e.target.value)} className="bg-input border-border" />
                    </div>
                    <div className="space-y-2">
                      <Label>转让数量</Label>
                      <Input type="number" placeholder="请输入积分数量" value={transferAmount} onChange={(e) => setTransferAmount(e.target.value)} className="bg-input border-border" />
                      <p className="text-xs text-muted-foreground">当前余额：{balance?.points ?? 0} 积分</p>
                    </div>
                    <Button className="w-full" onClick={() => transferMutation.mutate({ toUserId: parseInt(toUserId), amount: parseInt(transferAmount) })} disabled={transferMutation.isPending || !toUserId || !transferAmount}>
                      {transferMutation.isPending ? "转让中..." : "确认转让"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </CardContent>
        </Card>

        {/* Net Loss Redeem Card - Prominent */}
        <Card className="bg-card border-primary/30 border-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Gift className="w-5 h-5 text-primary" />
              净亏损兑换积分
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* PnL Summary */}
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-secondary/50 text-center">
                <p className="text-xs text-muted-foreground">累计盈利</p>
                <p className="text-sm font-semibold text-profit mt-1">+{totalProfit.toFixed(2)}</p>
              </div>
              <div className="p-3 rounded-lg bg-secondary/50 text-center">
                <p className="text-xs text-muted-foreground">累计亏损</p>
                <p className="text-sm font-semibold text-loss mt-1">-{totalLoss.toFixed(2)}</p>
              </div>
              <div className="p-3 rounded-lg bg-secondary/50 text-center">
                <p className="text-xs text-muted-foreground">净盈亏</p>
                <p className={`text-sm font-semibold mt-1 ${netPnl >= 0 ? "text-profit" : "text-loss"}`}>
                  {netPnl >= 0 ? "+" : ""}{netPnl.toFixed(2)} U
                </p>
              </div>
            </div>

            {/* Redeem Status */}
            <div className="p-4 rounded-xl bg-secondary/30 border border-border">
              {alreadyRedeemedThisMonth ? (
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-8 h-8 text-primary flex-shrink-0" />
                  <div>
                    <p className="font-medium text-sm">本月已兑换</p>
                    <p className="text-xs text-muted-foreground mt-0.5">每月仅限兑换一次，下月可再次兑换</p>
                  </div>
                </div>
              ) : canRedeem ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <TrendingDown className="w-8 h-8 text-primary flex-shrink-0" />
                    <div>
                      <p className="font-medium text-sm">当前有净亏损可兑换</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        净亏损 {Math.abs(netPnl).toFixed(2)} USDT，按 1U = 1积分 可兑换 <span className="text-primary font-bold">{redeemablePoints} 积分</span>
                      </p>
                    </div>
                  </div>
                  <Button
                    className="w-full"
                    size="lg"
                    onClick={() => redeemMutation.mutate()}
                    disabled={redeemMutation.isPending}
                  >
                    <Gift className="w-4 h-4 mr-2" />
                    {redeemMutation.isPending ? "兑换中..." : `立即兑换 ${redeemablePoints} 积分`}
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <XCircle className="w-8 h-8 text-muted-foreground/50 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-sm text-muted-foreground">暂无可兑换积分</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      当前净盈亏为 {netPnl >= 0 ? "+" : ""}{netPnl.toFixed(2)} USDT，仅当净亏损（总亏损 &gt; 总盈利）时可兑换
                    </p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Redeem Rules */}
        <Card className="bg-card border-border">
          <CardContent className="p-5 space-y-3">
            <h3 className="font-medium flex items-center gap-2"><Info className="w-4 h-4 text-primary" />积分兑换规则</h3>
            <div className="text-sm text-muted-foreground space-y-2">
              <div className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-primary/15 text-primary text-xs flex items-center justify-center flex-shrink-0 mt-0.5">1</span>
                <p>当月净亏损（总亏损 - 总盈利）可按 <span className="text-foreground font-medium">1 USDT = 1 积分</span> 兑换</p>
              </div>
              <div className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-primary/15 text-primary text-xs flex items-center justify-center flex-shrink-0 mt-0.5">2</span>
                <p>每月仅限兑换一次，兑换后当月净亏损记录清零</p>
              </div>
              <div className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-primary/15 text-primary text-xs flex items-center justify-center flex-shrink-0 mt-0.5">3</span>
                <p>积分可在用户之间自由转让，无手续费</p>
              </div>
              <div className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-primary/15 text-primary text-xs flex items-center justify-center flex-shrink-0 mt-0.5">4</span>
                <p>积分暂不可直接兑换为USDT（后续版本开放）</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Transaction History */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3"><CardTitle className="text-base">积分记录</CardTitle></CardHeader>
          <CardContent className="p-0">
            {txData?.items.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground text-sm">暂无积分记录</p>
            ) : (
              <div className="divide-y divide-border">
                {txData?.items.map((tx: any) => (
                  <div key={tx.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">{TYPE_LABELS[tx.type] || tx.type}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{tx.note}</p>
                    </div>
                    <div className="text-right">
                      <p className={`font-semibold ${tx.amount > 0 ? "text-profit" : "text-loss"}`}>
                        {tx.amount > 0 ? "+" : ""}{tx.amount}
                      </p>
                      <p className="text-xs text-muted-foreground">{new Date(tx.createdAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </UserLayout>
  );
}
