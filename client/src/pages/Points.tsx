import { useState } from "react";
import UserLayout from "@/components/UserLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Coins, ArrowRightLeft } from "lucide-react";
import { formatDateTime } from "@/lib/time";
import { toast } from "sonner";
import { useLang } from "@/contexts/LangContext";

export default function Points() {
  const { lang } = useLang();
  const isZh = lang === "zh";

  const TYPE_LABELS: Record<string, string> = {
    redeem: isZh ? "平台发放" : "Platform Issued",
    transfer_in: isZh ? "Route 转入" : "Route In",
    transfer_out: isZh ? "Route 转出" : "Route Out",
    admin_add: isZh ? "管理员增加" : "Admin Add",
    admin_deduct: isZh ? "管理员扣减" : "Admin Deduct",
  };

  const utils = trpc.useUtils();
  const { data: balance } = trpc.points.myBalance.useQuery();
  const { data: txData } = trpc.points.myTransactions.useQuery({ page: 1, limit: 50 });
  const { data: profile } = trpc.user.profile.useQuery();

  const [transferOpen, setTransferOpen] = useState(false);
  const [toInviteCode, setToInviteCode] = useState("");
  const [transferAmount, setTransferAmount] = useState("");

  const transferMutation = trpc.points.transfer.useMutation({
    onSuccess: (r) => {
      toast.success(isZh ? `Route 已成功转给 ${r.receiverName}` : `Route sent to ${r.receiverName}`);
      utils.points.myBalance.invalidate();
      utils.points.myTransactions.invalidate();
      setTransferOpen(false);
      setToInviteCode("");
      setTransferAmount("");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <UserLayout>
      <div className="space-y-6 max-w-2xl">
        <div>
          <h1 className="text-2xl font-bold">{isZh ? "Route 中心" : "Route Center"}</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {isZh ? "AlphaRoute 小资产，可在平台用户之间自由转让" : "AlphaRoute micro-asset, freely transferable between users"}
          </p>
        </div>

        {/* Route Balance Card */}
        <Card className="bg-card border-border">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{isZh ? "Route 余额" : "Route Balance"}</p>
                <div className="flex items-baseline gap-2 mt-1">
                  <p className="text-3xl font-bold text-foreground">{balance?.points ?? 0}</p>
                  <p className="text-muted-foreground">Route</p>
                </div>
                {profile?.inviteCode && (
                  <p className="text-xs text-muted-foreground mt-2">
                    {isZh ? "我的邀请码：" : "My invite code: "}
                    <span className="font-mono text-foreground font-semibold">{profile.inviteCode}</span>
                  </p>
                )}
              </div>
              <Coins className="w-10 h-10 text-primary opacity-60" />
            </div>
            <div className="mt-4">
              <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="w-full bg-transparent">
                    <ArrowRightLeft className="w-4 h-4 mr-1" />
                    {isZh ? "转让 Route 给其他用户" : "Transfer Route to another user"}
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-card border-border">
                  <DialogHeader>
                    <DialogTitle>{isZh ? "Route 转让" : "Transfer Route"}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 mt-2">
                    <div className="space-y-2">
                      <Label>{isZh ? "收方邀请码" : "Recipient Invite Code"}</Label>
                      <Input
                        placeholder={isZh ? "请输入对方的邀请码" : "Enter recipient's invite code"}
                        value={toInviteCode}
                        onChange={(e) => setToInviteCode(e.target.value)}
                        className="bg-input border-border font-mono"
                      />
                      <p className="text-xs text-muted-foreground">
                        {isZh ? "邀请码可在对方的 Route 中心页面查看" : "Invite code can be found on the recipient's Route Center page"}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label>{isZh ? "转让数量" : "Amount"}</Label>
                      <Input
                        type="number"
                        placeholder={isZh ? "请输入 Route 数量" : "Enter Route amount"}
                        value={transferAmount}
                        onChange={(e) => setTransferAmount(e.target.value)}
                        className="bg-input border-border"
                      />
                      <p className="text-xs text-muted-foreground">
                        {isZh ? `当前余额：${balance?.points ?? 0} Route` : `Balance: ${balance?.points ?? 0} Route`}
                      </p>
                    </div>
                    <Button
                      className="w-full"
                      onClick={() => transferMutation.mutate({ toInviteCode: toInviteCode.trim(), amount: parseInt(transferAmount) })}
                      disabled={transferMutation.isPending || !toInviteCode || !transferAmount}
                    >
                      {transferMutation.isPending
                        ? (isZh ? "转让中..." : "Transferring...")
                        : (isZh ? "确认转让" : "Confirm Transfer")}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </CardContent>
        </Card>

        {/* Route Transaction History */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{isZh ? "Route 记录" : "Route History"}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {txData?.items.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground text-sm">
                {isZh ? "暂无 Route 记录" : "No Route records"}
              </p>
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
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(tx.createdAt)}
                      </p>
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
