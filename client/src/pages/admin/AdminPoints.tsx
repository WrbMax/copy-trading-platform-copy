import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Coins, Plus, Minus } from "lucide-react";
import { toast } from "sonner";

export default function AdminPoints() {
  const utils = trpc.useUtils();
  const { data: users } = trpc.user.adminList.useQuery({ page: 1, limit: 100 });
  const [open, setOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [isAdd, setIsAdd] = useState(true);

  const adjustMutation = trpc.points.adminAdjust.useMutation({
    onSuccess: () => { toast.success("Route 操作成功"); utils.user.adminList.invalidate(); setOpen(false); setAmount(""); setNote(""); },
    onError: (e: any) => toast.error(e.message),
  });

  const openAdjust = (userId: number, add: boolean) => {
    setSelectedUserId(userId); setIsAdd(add); setAmount(""); setNote(""); setOpen(true);
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Route 管理</h1>
          <p className="text-muted-foreground text-sm mt-1">管理用户 Route 余额，手动增减 Route</p>
        </div>

        <Card className="bg-card border-border">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {["用户ID", "用户名", "邮筱", "Route 余额", "操作"].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-muted-foreground font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users?.items.map((u: any) => (
                    <tr key={u.id} className="border-b border-border/50 hover:bg-secondary/30">
                      <td className="px-4 py-3 text-muted-foreground">#{u.id}</td>
                      <td className="px-4 py-3 font-medium text-foreground">{u.name || "-"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{u.email || "-"}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <Coins className="w-3.5 h-3.5 text-primary" />
                          <span className="font-semibold text-foreground">{u.points ?? 0}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" className="bg-transparent text-profit border-profit/30 hover:bg-profit/10 text-xs" onClick={() => openAdjust(u.id, true)}>
                            <Plus className="w-3 h-3 mr-1" />增加
                          </Button>
                          <Button size="sm" variant="outline" className="bg-transparent text-loss border-loss/30 hover:bg-loss/10 text-xs" onClick={() => openAdjust(u.id, false)}>
                            <Minus className="w-3 h-3 mr-1" />扣减
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!users?.items.length && <p className="text-center py-12 text-muted-foreground">暂无用户数据</p>}
            </div>
          </CardContent>
        </Card>

        <Dialog open={open} onOpenChange={(v) => !v && setOpen(false)}>
          <DialogContent className="bg-card border-border">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {isAdd ? <Plus className="w-4 h-4 text-profit" /> : <Minus className="w-4 h-4 text-loss" />}
{isAdd ? "增加" : "扣减"} Route - 用户 #{selectedUserId}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="space-y-2">
                <Label>Route 数量</Label>
                <Input type="number" min="1" placeholder="请输入 Route 数量" value={amount} onChange={(e) => setAmount(e.target.value)} className="bg-input border-border" />
              </div>
              <div className="space-y-2">
                <Label>操作原因</Label>
                <Input placeholder="请输入操作原因" value={note} onChange={(e) => setNote(e.target.value)} className="bg-input border-border" />
              </div>
              <Button className={`w-full ${isAdd ? "" : "bg-loss hover:bg-loss/90"}`} onClick={() => adjustMutation.mutate({ userId: selectedUserId!, amount: parseInt(amount) * (isAdd ? 1 : -1), note })} disabled={adjustMutation.isPending || !amount || !note}>
                {adjustMutation.isPending ? "处理中..." : `确认${isAdd ? "增加" : "扣减"}`}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
