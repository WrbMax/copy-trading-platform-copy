import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Search, ChevronLeft, ChevronRight, Settings, Plus, Minus,
  ChevronDown, ChevronUp, Users, Wallet, BarChart2, ArrowDownCircle, ArrowUpCircle, X, Lock, LockOpen
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const P_LEVEL_NAMES: Record<number, string> = { 0: "无身份", 1: "P1", 2: "P2", 3: "P3", 4: "P4", 5: "P5", 6: "P6", 7: "P7" };
const P_LEVEL_COLORS: Record<number, string> = {
  0: "bg-secondary text-muted-foreground",
  1: "bg-blue-500/20 text-blue-400",
  2: "bg-cyan-500/20 text-cyan-400",
  3: "bg-green-500/20 text-green-400",
  4: "bg-yellow-500/20 text-yellow-400",
  5: "bg-orange-500/20 text-orange-400",
  6: "bg-red-500/20 text-red-400",
  7: "bg-purple-500/20 text-purple-400",
};
import { toast } from "sonner";
import { formatDateTime, formatDate } from "@/lib/time";

// ─── 邀请成员展开行 ────────────────────────────────────────────────────────────
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
                  {["ID", "用户名", "邮箱", "P身份", "状态", "注册时间"].map((h) => (
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
                    <td className="py-1.5 pr-6">
                      <span className={`px-1.5 py-0.5 rounded text-xs ${P_LEVEL_COLORS[inv.pLevel ?? 0]}`}>{P_LEVEL_NAMES[inv.pLevel ?? 0]}</span>
                    </td>
                    <td className="py-1.5 pr-6">
                      <Badge variant={inv.isActive ? "default" : "secondary"} className="text-xs">
                        {inv.isActive ? "正常" : "禁用"}
                      </Badge>
                    </td>
                    <td className="py-1.5 pr-6 text-muted-foreground">{formatDate(inv.createdAt)}</td>
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

// ─── 充提记录弹窗 ──────────────────────────────────────────────────────────────
function FundRecordsDialog({ user, onClose }: { user: any; onClose: () => void }) {
  const [tab, setTab] = useState<"transactions" | "deposits" | "withdrawals">("transactions");
  const [page, setPage] = useState(1);

  const txQuery = trpc.user.adminGetUserFundTransactions.useQuery(
    { userId: user.id, page, limit: 20 },
    { enabled: tab === "transactions" }
  );
  const depositQuery = trpc.user.adminGetUserDeposits.useQuery(
    { userId: user.id, page, limit: 20 },
    { enabled: tab === "deposits" }
  );
  const withdrawalQuery = trpc.user.adminGetUserWithdrawals.useQuery(
    { userId: user.id, page, limit: 20 },
    { enabled: tab === "withdrawals" }
  );

  const currentData =
    tab === "transactions" ? txQuery.data :
    tab === "deposits" ? depositQuery.data :
    withdrawalQuery.data;

  const items = currentData?.items ?? [];
  const total = currentData?.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  const txTypeLabel: Record<string, string> = {
    deposit: "充值到账",
    withdrawal: "提现",
    revenue_share_out: "服务费扣除",
    revenue_share_in: "分成收入",
    admin_adjust: "管理员调整",
  };

  const txTypeColor: Record<string, string> = {
    deposit: "text-emerald-400",
    withdrawal: "text-red-400",
    revenue_share_out: "text-orange-400",
    revenue_share_in: "text-emerald-400",
    admin_adjust: "text-blue-400",
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-card border-border max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="w-4 h-4" />
            #{user.id} {user.name} — 资金记录
          </DialogTitle>
        </DialogHeader>

        {/* Tab 切换 */}
        <div className="flex gap-1 border-b border-border pb-2">
          {[
            { key: "transactions", label: "全部流水" },
            { key: "deposits", label: "充值记录" },
            { key: "withdrawals", label: "提现记录" },
          ].map((t) => (
            <Button
              key={t.key}
              size="sm"
              variant={tab === t.key ? "default" : "ghost"}
              onClick={() => { setTab(t.key as any); setPage(1); }}
              className="text-xs"
            >
              {t.label}
            </Button>
          ))}
        </div>

        <div className="overflow-y-auto flex-1">
          {tab === "transactions" && (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border">
                  {["类型", "金额", "备注", "时间"].map((h) => (
                    <th key={h} className="text-left px-3 py-2 text-muted-foreground font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item: any) => (
                  <tr key={item.id} className="border-b border-border/40 hover:bg-secondary/20">
                    <td className="px-3 py-2">
                      <span className={txTypeColor[item.type] || "text-foreground"}>
                        {txTypeLabel[item.type] || item.type}
                      </span>
                    </td>
                    <td className={`px-3 py-2 font-semibold ${parseFloat(item.amount) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {parseFloat(item.amount) >= 0 ? "+" : ""}{parseFloat(item.amount).toFixed(4)} USDT
                    </td>
                    <td className="px-3 py-2 text-muted-foreground max-w-xs truncate">{item.note || "-"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{formatDateTime(item.createdAt)}</td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">暂无记录</td></tr>
                )}
              </tbody>
            </table>
          )}

          {tab === "deposits" && (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border">
                  {["金额", "链", "状态", "TxHash", "时间"].map((h) => (
                    <th key={h} className="text-left px-3 py-2 text-muted-foreground font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item: any) => (
                  <tr key={item.id} className="border-b border-border/40 hover:bg-secondary/20">
                    <td className="px-3 py-2 font-semibold text-emerald-400">+{parseFloat(item.amount).toFixed(4)} USDT</td>
                    <td className="px-3 py-2 text-muted-foreground">{item.chain || "BSC"}</td>
                    <td className="px-3 py-2">
                      <Badge variant={item.status === "approved" ? "default" : item.status === "pending" ? "secondary" : "destructive"} className="text-xs">
                        {item.status === "approved" ? "已确认" : item.status === "pending" ? "待审核" : item.status === "rejected" ? "已拒绝" : item.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground font-mono text-xs max-w-[120px] truncate" title={item.txHash}>{item.txHash || "-"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{formatDateTime(item.createdAt)}</td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">暂无充值记录</td></tr>
                )}
              </tbody>
            </table>
          )}

          {tab === "withdrawals" && (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border">
                  {["申请金额", "手续费", "实际到账", "地址", "状态", "时间"].map((h) => (
                    <th key={h} className="text-left px-3 py-2 text-muted-foreground font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item: any) => (
                  <tr key={item.id} className="border-b border-border/40 hover:bg-secondary/20">
                    <td className="px-3 py-2 font-semibold text-red-400">-{parseFloat(item.amount).toFixed(4)} USDT</td>
                    <td className="px-3 py-2 text-muted-foreground">{parseFloat(item.fee || "0").toFixed(4)}</td>
                    <td className="px-3 py-2 text-foreground">{parseFloat(item.netAmount || "0").toFixed(4)} USDT</td>
                    <td className="px-3 py-2 text-muted-foreground font-mono text-xs max-w-[120px] truncate" title={item.address}>{item.address || "-"}</td>
                    <td className="px-3 py-2">
                      <Badge variant={item.status === "completed" ? "default" : item.status === "pending" ? "secondary" : "destructive"} className="text-xs">
                        {item.status === "completed" ? "已完成" : item.status === "pending" ? "待审核" : item.status === "rejected" ? "已拒绝" : item.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{formatDateTime(item.createdAt)}</td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">暂无提现记录</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 pt-2 border-t border-border">
            <Button variant="outline" size="sm" className="bg-transparent" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-xs text-muted-foreground">{page} / {totalPages}（共 {total} 条）</span>
            <Button variant="outline" size="sm" className="bg-transparent" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── 交易订单弹窗 ──────────────────────────────────────────────────────────────
function OrdersDialog({ user, onClose }: { user: any; onClose: () => void }) {
  const [page, setPage] = useState(1);
  const { data, isLoading } = trpc.user.adminGetUserOrders.useQuery({ userId: user.id, page, limit: 20 });

  const items = data?.items ?? [];
  const stats = data?.stats;
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  const actionLabel: Record<string, { text: string; color: string }> = {
    open_long:  { text: "开多", color: "text-emerald-400" },
    open_short: { text: "开空", color: "text-red-400" },
    close_long: { text: "平多", color: "text-emerald-400" },
    close_short:{ text: "平空", color: "text-red-400" },
  };

  const statusLabel: Record<string, { text: string; variant: any }> = {
    open:   { text: "持仓中", variant: "default" },
    closed: { text: "已平仓", variant: "secondary" },
    failed: { text: "失败", variant: "destructive" },
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-card border-border max-w-5xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart2 className="w-4 h-4" />
            #{user.id} {user.name} — 交易订单
          </DialogTitle>
        </DialogHeader>

        {/* 统计摘要 */}
        {stats && (
          <div className="grid grid-cols-4 gap-3 pb-3 border-b border-border">
            <div className="bg-secondary/30 rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground">总订单</p>
              <p className="text-lg font-bold">{stats.totalOrders}</p>
            </div>
            <div className="bg-secondary/30 rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground">持仓中</p>
              <p className="text-lg font-bold text-blue-400">{stats.openOrders}</p>
            </div>
            <div className="bg-secondary/30 rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground">累计盈利</p>
              <p className={`text-lg font-bold ${(stats.totalProfit ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {(stats.totalProfit ?? 0).toFixed(2)} USDT
              </p>
            </div>
            <div className="bg-secondary/30 rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground">平台扣费</p>
              <p className="text-lg font-bold text-orange-400">{(stats.totalRevenueShare ?? 0).toFixed(2)} USDT</p>
            </div>
          </div>
        )}

        <div className="overflow-y-auto flex-1">
          {isLoading ? (
            <p className="text-center py-8 text-muted-foreground">加载中...</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border">
                  {["ID", "交易所", "方向", "数量", "倍数", "成交价", "手续费", "已实现盈亏", "净盈亏", "平台扣费", "状态", "时间"].map((h) => (
                    <th key={h} className="text-left px-2 py-2 text-muted-foreground font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item: any) => {
                  const action = actionLabel[item.action] || { text: item.action, color: "text-foreground" };
                  const isCloseAction = item.action === "close_long" || item.action === "close_short";
                  const statusInfo = isCloseAction && item.status === "closed"
                    ? { text: "已平仓", variant: "secondary" as any }
                    : statusLabel[item.status] || { text: item.status, variant: "secondary" as any };
                  return (
                    <tr key={item.id} className="border-b border-border/40 hover:bg-secondary/20">
                      <td className="px-2 py-2 text-muted-foreground">#{item.id}</td>
                      <td className="px-2 py-2 text-foreground">{item.exchange}</td>
                      <td className={`px-2 py-2 font-semibold ${action.color}`}>{action.text}</td>
                      <td className="px-2 py-2 text-foreground">{item.quantity}</td>
                      <td className="px-2 py-2 text-foreground">{item.leverage}x</td>
                      <td className="px-2 py-2 text-foreground">{item.fillPrice ? parseFloat(item.fillPrice).toFixed(2) : "-"}</td>
                      <td className="px-2 py-2 text-muted-foreground">{item.fee ? parseFloat(item.fee).toFixed(4) : "-"}</td>
                      <td className={`px-2 py-2 font-semibold ${item.realizedPnl ? (parseFloat(item.realizedPnl) >= 0 ? "text-emerald-400" : "text-red-400") : "text-muted-foreground"}`}>
                        {item.realizedPnl ? `${parseFloat(item.realizedPnl) >= 0 ? "+" : ""}${parseFloat(item.realizedPnl).toFixed(4)}` : "-"}
                      </td>
                      <td className={`px-2 py-2 font-semibold ${item.netPnl ? (parseFloat(item.netPnl) >= 0 ? "text-emerald-400" : "text-red-400") : "text-muted-foreground"}`}>
                        {item.netPnl ? `${parseFloat(item.netPnl) >= 0 ? "+" : ""}${parseFloat(item.netPnl).toFixed(4)}` : "-"}
                      </td>
                      <td className="px-2 py-2 text-orange-400">
                        {item.revenueShareDeducted && parseFloat(item.revenueShareDeducted) > 0
                          ? parseFloat(item.revenueShareDeducted).toFixed(4)
                          : "-"}
                      </td>
                      <td className="px-2 py-2">
                        <Badge variant={statusInfo.variant} className="text-xs">{statusInfo.text}</Badge>
                      </td>
                      <td className="px-2 py-2 text-muted-foreground whitespace-nowrap">{formatDateTime(item.createdAt)}</td>
                    </tr>
                  );
                })}
                {items.length === 0 && (
                  <tr><td colSpan={12} className="text-center py-8 text-muted-foreground">暂无订单记录</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 pt-2 border-t border-border">
            <Button variant="outline" size="sm" className="bg-transparent" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-xs text-muted-foreground">{page} / {totalPages}（共 {total} 条）</span>
            <Button variant="outline" size="sm" className="bg-transparent" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── 主页面 ────────────────────────────────────────────────────────────────────
export default function AdminUsers() {
  const utils = trpc.useUtils();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [editUser, setEditUser] = useState<any>(null);
  const [editPLevel, setEditPLevel] = useState("0");
  const [balanceOpen, setBalanceOpen] = useState(false);
  const [balanceUser, setBalanceUser] = useState<any>(null);
  const [balanceAmount, setBalanceAmount] = useState("");
  const [balanceNote, setBalanceNote] = useState("");
  const [balanceIsAdd, setBalanceIsAdd] = useState(true);
  const [expandedUserId, setExpandedUserId] = useState<number | null>(null);
  const [fundUser, setFundUser] = useState<any>(null);
  const [orderUser, setOrderUser] = useState<any>(null);

  const toggleExpand = (userId: number) => setExpandedUserId(prev => prev === userId ? null : userId);

  const [filterPLevel, setFilterPLevel] = useState<string>("");
  const [filterActive, setFilterActive] = useState<string>("");
  const [sortBy, setSortBy] = useState<string>("");
  const [sortOrder, setSortOrder] = useState<string>("desc");

  // 统一使用adminList接口（已支持关键词搜索）
  const listQuery = trpc.user.adminList.useQuery({
    page,
    limit: 20,
    keyword: search || undefined,
    pLevel: filterPLevel ? parseInt(filterPLevel) : undefined,
    isActive: filterActive === "true" ? true : filterActive === "false" ? false : undefined,
    sortBy: (sortBy as any) || undefined,
    sortOrder: (sortOrder as any) || undefined,
  });

  const data = listQuery.data;
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  const handleSearch = () => {
    setSearch(searchInput.trim());
    setPage(1);
  };

  const handleClearSearch = () => {
    setSearchInput("");
    setSearch("");
    setFilterPLevel("");
    setFilterActive("");
    setSortBy("");
    setSortOrder("desc");
    setPage(1);
  };

  const updatePLevelMutation = trpc.user.adminSetUserPLevel.useMutation({
    onSuccess: () => {
      toast.success("用户P身份已更新");
      utils.user.adminList.invalidate();
      utils.user.adminSearchUsers.invalidate();
      // Invalidate user-facing queries so the updated pLevel is reflected immediately
      utils.user.profile.invalidate();
      utils.user.teamStats.invalidate();
      setEditUser(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const unlockPLevelMutation = trpc.user.adminUnlockUserPLevel.useMutation({
    onSuccess: () => {
      toast.success("已解锁，凌晨将自动重新计算P身份");
      utils.user.adminList.invalidate();
      utils.user.adminSearchUsers.invalidate();
      utils.user.profile.invalidate();
      utils.user.teamStats.invalidate();
      setEditUser(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const adjustBalanceMutation = trpc.funds.adminAdjustBalance.useMutation({
    onSuccess: (data) => {
      toast.success(`余额调整成功，新余额: ${parseFloat(data.newBalance).toFixed(2)} USDT`);
      utils.user.adminList.invalidate();
      utils.user.adminSearchUsers.invalidate();
      setBalanceOpen(false);
      setBalanceAmount("");
      setBalanceNote("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const openEdit = (u: any) => { setEditUser(u); setEditPLevel(String(u.pLevel ?? 0)); };
  const openBalanceAdjust = (u: any, isAdd: boolean) => {
    setBalanceUser(u); setBalanceIsAdd(isAdd); setBalanceAmount(""); setBalanceNote(""); setBalanceOpen(true);
  };
  const handleBalanceSubmit = () => {
    const amt = parseFloat(balanceAmount);
    if (!amt || amt <= 0) { toast.error("请输入有效的金额"); return; }
    if (!balanceNote.trim()) { toast.error("请填写操作备注"); return; }
    adjustBalanceMutation.mutate({ userId: balanceUser.id, amount: balanceIsAdd ? amt : -amt, note: balanceNote });
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">用户管理</h1>
          <p className="text-muted-foreground text-sm mt-1">管理平台所有用户，设置P身份和余额</p>
        </div>

        {/* 搜索和筛选栏 */}
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="col-span-2 relative">
                <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="搜索 ID / 用户名 / 邮箱..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  className="pl-8 bg-secondary/50 border-border text-sm h-9"
                />
              </div>
              <Select value={filterPLevel} onValueChange={(v) => { setFilterPLevel(v === "all" ? "" : v); setPage(1); }}>
                <SelectTrigger className="bg-secondary/50 border-border text-sm h-9">
                  <SelectValue placeholder="P身份筛选" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部身份</SelectItem>
                  {[0,1,2,3,4,5,6,7].map(lv => (
                    <SelectItem key={lv} value={String(lv)}>{P_LEVEL_NAMES[lv]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterActive} onValueChange={(v) => { setFilterActive(v === "all" ? "" : v); setPage(1); }}>
                <SelectTrigger className="bg-secondary/50 border-border text-sm h-9">
                  <SelectValue placeholder="账号状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部状态</SelectItem>
                  <SelectItem value="true">正常</SelectItem>
                  <SelectItem value="false">禁用</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <Select value={sortBy} onValueChange={(v) => { setSortBy(v === "none" ? "" : v); setPage(1); }}>
                  <SelectTrigger className="bg-secondary/50 border-border text-sm h-9 flex-1">
                    <SelectValue placeholder="排序" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">默认排序</SelectItem>
                    <SelectItem value="createdAt">注册时间</SelectItem>
                    <SelectItem value="balance">余额</SelectItem>
                    <SelectItem value="pLevel">P身份</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 px-2 bg-transparent"
                  onClick={() => { setSortOrder(o => o === "asc" ? "desc" : "asc"); setPage(1); }}
                  title={sortOrder === "asc" ? "升序" : "降序"}
                >
                  {sortOrder === "asc" ? "↑" : "↓"}
                </Button>
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <Button size="sm" onClick={handleSearch} className="h-9">搜索</Button>
              {(search || filterPLevel || filterActive || sortBy) && (
                <Button size="sm" variant="outline" onClick={handleClearSearch} className="h-9 bg-transparent gap-1">
                  <X className="w-3.5 h-3.5" />清除筛选
                </Button>
              )}
              <span className="text-xs text-muted-foreground self-center ml-2">共 {total} 个用户</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {["ID", "用户名", "邮箱", "角色", "余额(U)", "P身份", "注册时间", "操作"].map((h) => (
                      <th key={h} className="text-left px-2 py-3 text-muted-foreground font-medium whitespace-nowrap text-xs">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((u: any) => (
                    <>
                      <tr key={u.id} className="border-b border-border/50 hover:bg-secondary/30">
                        <td className="px-2 py-3 text-muted-foreground text-xs">#{u.id}</td>
                        <td className="px-2 py-3 font-medium text-foreground text-xs max-w-[80px] truncate" title={u.name}>{u.name || "-"}</td>
                        <td className="px-2 py-3 text-muted-foreground text-xs max-w-[120px] truncate" title={u.email}>{u.email || "-"}</td>
                        <td className="px-2 py-3">
                          <Badge variant={u.role === "admin" ? "default" : "secondary"} className="text-xs">{u.role}</Badge>
                        </td>
                        <td className="px-2 py-3">
                          <span className="font-semibold text-foreground text-xs">{parseFloat(u.balance || "0").toFixed(2)}</span>
                        </td>
                        <td className="px-2 py-3">
                          <span className={`px-1.5 py-0.5 rounded text-xs ${P_LEVEL_COLORS[u.pLevel ?? 0]} inline-flex items-center gap-1`}>
                            {u.pLevelLocked && <Lock className="w-2.5 h-2.5" />}
                            {P_LEVEL_NAMES[u.pLevel ?? 0]}
                          </span>
                        </td>
                        <td className="px-2 py-3 text-xs text-muted-foreground whitespace-nowrap">{formatDate(u.createdAt)}</td>
                        <td className="px-2 py-3">
                          <div className="flex items-center gap-0.5 flex-nowrap">
                            <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-emerald-500 hover:bg-emerald-500/10" onClick={() => openBalanceAdjust(u, true)} title="增加余额">
                              <Plus className="w-3 h-3" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-500 hover:bg-red-500/10" onClick={() => openBalanceAdjust(u, false)} title="扣减余额">
                              <Minus className="w-3 h-3" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => openEdit(u)} title="设置P身份">
                              <Settings className="w-3 h-3" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-blue-400 hover:text-blue-300" onClick={() => setFundUser(u)} title="查看充提记录">
                              <Wallet className="w-3 h-3" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-purple-400 hover:text-purple-300" onClick={() => setOrderUser(u)} title="查看交易订单">
                              <BarChart2 className="w-3 h-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className={`h-6 w-6 p-0 ${expandedUserId === u.id ? "text-primary" : ""}`}
                              onClick={() => toggleExpand(u.id)}
                              title="查看邀请的成员"
                            >
                              {expandedUserId === u.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            </Button>
                          </div>
                        </td>
                      </tr>
                      {expandedUserId === u.id && (
                        <InviteesRow userId={u.id} colSpan={8} />
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

        {/* 设置P身份弹窗 */}
        <Dialog open={!!editUser} onOpenChange={(v) => !v && setEditUser(null)}>
          <DialogContent className="bg-card border-border">
            <DialogHeader>
              <DialogTitle>设置P身份 - #{editUser?.id} {editUser?.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              {editUser?.pLevelLocked && (
                <div className="flex items-center gap-2 px-3 py-2 rounded bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-xs">
                  <Lock className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>当前等级已手动锁定，凌晨自动任务不会覆盖。如需恢复自动计算，请点击「解锁」。</span>
                </div>
              )}
              <div className="space-y-2">
                <Label>P身份</Label>
                <Select value={editPLevel} onValueChange={setEditPLevel}>
                  <SelectTrigger className="bg-input border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[0,1,2,3,4,5,6,7].map(lv => (
                      <SelectItem key={lv} value={String(lv)}>{P_LEVEL_NAMES[lv]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">P身份决定用户在分润链中可获得的身份奖比例（P1:10% ~ P7:55%）。手动保存后将锁定，凌晨不自动覆盖。</p>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" className="bg-transparent" onClick={() => setEditUser(null)}>取消</Button>
                {editUser?.pLevelLocked && (
                  <Button variant="outline" className="bg-transparent text-yellow-400 border-yellow-500/40 hover:bg-yellow-500/10" onClick={() => unlockPLevelMutation.mutate({ userId: editUser.id })} disabled={unlockPLevelMutation.isPending}>
                    <LockOpen className="w-3.5 h-3.5 mr-1" />
                    {unlockPLevelMutation.isPending ? "解锁中..." : "解锁自动计算"}
                  </Button>
                )}
                <Button onClick={() => updatePLevelMutation.mutate({ userId: editUser.id, pLevel: parseInt(editPLevel) })} disabled={updatePLevelMutation.isPending}>
                  {updatePLevelMutation.isPending ? "保存中..." : "保存并锁定"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* 余额调整弹窗 */}
        <Dialog open={balanceOpen} onOpenChange={(v) => !v && setBalanceOpen(false)}>
          <DialogContent className="bg-card border-border">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {balanceIsAdd ? <ArrowDownCircle className="w-4 h-4 text-emerald-400" /> : <ArrowUpCircle className="w-4 h-4 text-red-400" />}
                {balanceIsAdd ? "增加" : "扣减"}余额 - #{balanceUser?.id} {balanceUser?.name}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="space-y-2">
                <Label>金额 (USDT)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="请输入金额"
                  value={balanceAmount}
                  onChange={(e) => setBalanceAmount(e.target.value)}
                  className="bg-input border-border"
                />
              </div>
              <div className="space-y-2">
                <Label>操作备注</Label>
                <Input
                  placeholder="请填写操作原因"
                  value={balanceNote}
                  onChange={(e) => setBalanceNote(e.target.value)}
                  className="bg-input border-border"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" className="bg-transparent" onClick={() => setBalanceOpen(false)}>取消</Button>
                <Button
                  onClick={handleBalanceSubmit}
                  disabled={adjustBalanceMutation.isPending}
                  className={balanceIsAdd ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"}
                >
                  {adjustBalanceMutation.isPending ? "处理中..." : "确认"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* 充提记录弹窗 */}
        {fundUser && <FundRecordsDialog user={fundUser} onClose={() => setFundUser(null)} />}

        {/* 交易订单弹窗 */}
        {orderUser && <OrdersDialog user={orderUser} onClose={() => setOrderUser(null)} />}
      </div>
    </AdminLayout>
  );
}
