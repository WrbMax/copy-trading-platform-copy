import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Search, ChevronLeft, ChevronRight, Settings, Plus, Minus, ChevronDown, ChevronUp, Users } from "lucide-react";
import { toast } from "sonner";

// Sub-component: renders invitees for a given userId
function InviteesRow({ userId, colSpan }: { userId: number; colSpan: number }) {
  const { data: invitees, isLoading } = trpc.user.adminGetInvitees.useQuery({ userId });
  return (
    <tr>
      <td colSpan={colSpan} className="px-0 py-0">
        <div className="bg-secondary/20 border-b border-border/50 px-8 py-3">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">邀请的成员</span>
          </div>
          {isLoading ? (
            <p className="text-xs text-muted-foreground">加载中...</p>
          ) : !invitees || invitees.length === 0 ? (
            <p className="text-xs text-muted-foreground">该用户暂无邀请成员</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr>
                  {["ID", "用户名", "邮箱", "分成比例", "状态", "注册时间"].map((h) => (
                    <th key={h} className="text-left py-1 pr-6 text-muted-foreground font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invitees.map((inv: any) => (
                  <tr key={inv.id} className="border-t border-border/30">
                    <td className="py-1.5 pr-6 text-muted-foreground">#{inv.id}</td>
                    <td className="py-1.5 pr-6 font-medium text-foreground">{inv.name || "-"}</td>
                    <td className="py-1.5 pr-6 text-muted-foreground">{inv.email || "-"}</td>
                    <td className="py-1.5 pr-6 text-foreground">{parseFloat(inv.revenueShareRatio || "0").toFixed(1)}%</td>
                    <td className="py-1.5 pr-6">
                      <Badge variant={inv.isActive ? "default" : "secondary"} className="text-xs">
                        {inv.isActive ? "正常" : "禁用"}
                      </Badge>
                    </td>
                    <td className="py-1.5 pr-6 text-muted-foreground">{new Date(inv.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </td>
    </tr>
  );
}

export default function AdminUsers() {
  const utils = trpc.useUtils();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [editUser, setEditUser] = useState<any>(null);
  const [editRatio, setEditRatio] = useState("");

  // Balance adjustment state
  const [balanceOpen, setBalanceOpen] = useState(false);
  const [balanceUser, setBalanceUser] = useState<any>(null);
  const [balanceAmount, setBalanceAmount] = useState("");
  const [balanceNote, setBalanceNote] = useState("");
  const [balanceIsAdd, setBalanceIsAdd] = useState(true);

  // Expanded invitees row
  const [expandedUserId, setExpandedUserId] = useState<number | null>(null);
  const toggleExpand = (userId: number) => setExpandedUserId(prev => prev === userId ? null : userId);

  const { data } = trpc.user.adminList.useQuery({ page, limit: 20 });
  const allItems = data?.items ?? [];
  const items = search
    ? allItems.filter((u: any) => (u.name || "").includes(search) || (u.email || "").includes(search))
    : allItems;
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  const updateRatioMutation = trpc.user.adminSetRevenueShareRatio.useMutation({
    onSuccess: () => {
      toast.success("收益分成比例已更新");
      utils.user.adminList.invalidate();
      setEditUser(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const adjustBalanceMutation = trpc.funds.adminAdjustBalance.useMutation({
    onSuccess: (data) => {
      toast.success(`余额调整成功，新余额: ${parseFloat(data.newBalance).toFixed(2)} USDT`);
      utils.user.adminList.invalidate();
      setBalanceOpen(false);
      setBalanceAmount("");
      setBalanceNote("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const openEdit = (u: any) => {
    setEditUser(u);
    setEditRatio(u.revenueShareRatio || "0");
  };

  const openBalanceAdjust = (u: any, isAdd: boolean) => {
    setBalanceUser(u);
    setBalanceIsAdd(isAdd);
    setBalanceAmount("");
    setBalanceNote("");
    setBalanceOpen(true);
  };

  const handleBalanceSubmit = () => {
    const amt = parseFloat(balanceAmount);
    if (!amt || amt <= 0) { toast.error("请输入有效的金额"); return; }
    if (!balanceNote.trim()) { toast.error("请填写操作备注"); return; }
    adjustBalanceMutation.mutate({
      userId: balanceUser.id,
      amount: balanceIsAdd ? amt : -amt,
      note: balanceNote,
    });
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">用户管理</h1>
            <p className="text-muted-foreground text-sm mt-1">管理平台所有用户，设置收益分成比例和余额</p>
          </div>
        </div>

        <div className="flex gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="搜索用户名或邮箱..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-input border-border"
            />
          </div>
        </div>

        <Card className="bg-card border-border">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {["ID", "用户名", "邮箱", "角色", "余额 (USDT)", "积分", "分成比例", "邀请人", "注册时间", "操作"].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-muted-foreground font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((u: any) => (
                    <>
                      <tr key={u.id} className="border-b border-border/50 hover:bg-secondary/30">
                        <td className="px-4 py-3 text-muted-foreground">#{u.id}</td>
                        <td className="px-4 py-3 font-medium text-foreground">{u.name || "-"}</td>
                        <td className="px-4 py-3 text-muted-foreground">{u.email || "-"}</td>
                        <td className="px-4 py-3">
                          <Badge variant={u.role === "admin" ? "default" : "secondary"} className="text-xs">{u.role}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-foreground">{parseFloat(u.balance || "0").toFixed(2)}</span>
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0 text-emerald-500 hover:bg-emerald-500/10"
                                onClick={() => openBalanceAdjust(u, true)}
                                title="增加余额"
                              >
                                <Plus className="w-3 h-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0 text-red-500 hover:bg-red-500/10"
                                onClick={() => openBalanceAdjust(u, false)}
                                title="扣减余额"
                              >
                                <Minus className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-foreground">{u.points ?? 0}</td>
                        <td className="px-4 py-3 text-foreground">{parseFloat(u.revenueShareRatio || "0").toFixed(1)}%</td>
                        <td className="px-4 py-3 text-muted-foreground">{u.invitedById ? `#${u.invitedById}` : "-"}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(u.createdAt).toLocaleDateString()}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <Button size="sm" variant="ghost" onClick={() => openEdit(u)} title="设置分成比例">
                              <Settings className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => toggleExpand(u.id)}
                              title="查看邀请的成员"
                              className={expandedUserId === u.id ? "text-primary" : ""}
                            >
                              {expandedUserId === u.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </Button>
                          </div>
                        </td>
                      </tr>
                      {expandedUserId === u.id && (
                        <InviteesRow userId={u.id} colSpan={10} />
                      )}
                    </>
                  ))}
                </tbody>
              </table>
              {items.length === 0 && <p className="text-center py-12 text-muted-foreground">暂无用户数据</p>}
            </div>
          </CardContent>
        </Card>

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

        {/* Revenue Share Ratio Dialog */}
        <Dialog open={!!editUser} onOpenChange={(v) => !v && setEditUser(null)}>
          <DialogContent className="bg-card border-border">
            <DialogHeader>
              <DialogTitle>设置分成比例 - #{editUser?.id} {editUser?.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="space-y-2">
                <Label>收益分成比例 (%)</Label>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  max="70"
                  value={editRatio}
                  onChange={(e) => setEditRatio(e.target.value)}
                  className="bg-input border-border"
                />
                <p className="text-xs text-muted-foreground">设置该用户盈利时被扣除的分成比例，范围 0% - 70%</p>
              </div>
              <Button
                className="w-full"
                onClick={() => updateRatioMutation.mutate({ userId: editUser.id, ratio: parseFloat(editRatio) })}
                disabled={updateRatioMutation.isPending}
              >
                {updateRatioMutation.isPending ? "保存中..." : "保存分成比例"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Balance Adjustment Dialog */}
        <Dialog open={balanceOpen} onOpenChange={(v) => !v && setBalanceOpen(false)}>
          <DialogContent className="bg-card border-border">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {balanceIsAdd
                  ? <Plus className="w-4 h-4 text-emerald-500" />
                  : <Minus className="w-4 h-4 text-red-500" />}
                {balanceIsAdd ? "增加" : "扣减"}余额 - #{balanceUser?.id} {balanceUser?.name}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="p-3 rounded-lg bg-secondary/50 text-sm">
                <span className="text-muted-foreground">当前余额：</span>
                <span className="font-semibold text-foreground ml-1">
                  {parseFloat(balanceUser?.balance || "0").toFixed(2)} USDT
                </span>
              </div>
              <div className="space-y-2">
                <Label>调整金额 (USDT)</Label>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="请输入金额"
                  value={balanceAmount}
                  onChange={(e) => setBalanceAmount(e.target.value)}
                  className="bg-input border-border"
                />
                {balanceAmount && parseFloat(balanceAmount) > 0 && (
                  <p className="text-xs text-muted-foreground">
                    调整后余额：
                    <span className={`font-semibold ml-1 ${balanceIsAdd ? "text-emerald-500" : "text-red-500"}`}>
                      {(parseFloat(balanceUser?.balance || "0") + (balanceIsAdd ? 1 : -1) * parseFloat(balanceAmount)).toFixed(2)} USDT
                    </span>
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>操作备注 <span className="text-red-500">*</span></Label>
                <Input
                  placeholder="请填写调整原因（必填）"
                  value={balanceNote}
                  onChange={(e) => setBalanceNote(e.target.value)}
                  className="bg-input border-border"
                />
              </div>
              <Button
                className={`w-full ${!balanceIsAdd ? "bg-red-600 hover:bg-red-700" : ""}`}
                onClick={handleBalanceSubmit}
                disabled={adjustBalanceMutation.isPending || !balanceAmount || !balanceNote.trim()}
              >
                {adjustBalanceMutation.isPending ? "处理中..." : `确认${balanceIsAdd ? "增加" : "扣减"} ${balanceAmount ? parseFloat(balanceAmount).toFixed(2) : "0.00"} USDT`}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
