import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, TrendingUp, Settings, Users, Award, Crown, Search, X, Wallet } from "lucide-react";
import { formatDateTime } from "@/lib/time";
import { toast } from "sonner";

const P_LEVEL_NAMES: Record<number, string> = {
  0: "无身份", 1: "P1", 2: "P2", 3: "P3", 4: "P4", 5: "P5", 6: "P6", 7: "P7",
};

const P_LEVEL_COLORS: Record<number, string> = {
  0: "bg-muted text-muted-foreground",
  1: "bg-blue-500/15 text-blue-400",
  2: "bg-cyan-500/15 text-cyan-400",
  3: "bg-emerald-500/15 text-emerald-400",
  4: "bg-amber-500/15 text-amber-400",
  5: "bg-orange-500/15 text-orange-400",
  6: "bg-rose-500/15 text-rose-400",
  7: "bg-purple-500/15 text-purple-400",
};

const REWARD_TYPE_META: Record<string, { label: string; icon: any; colorClass: string }> = {
  direct:    { label: "分享奖", icon: Users,  colorClass: "text-blue-400" },
  rank:      { label: "身份奖", icon: Award,  colorClass: "text-amber-400" },
  same_rank: { label: "平级奖", icon: Crown,  colorClass: "text-purple-400" },
};

export default function AdminRevenueShare() {
  const utils = trpc.useUtils();
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState<"records" | "users">("records");

  // 分成记录筛选
  const [rewardType, setRewardType] = useState("");
  const [keyword, setKeyword] = useState("");
  const [keywordInput, setKeywordInput] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // 用户身份管理
  const [userPage, setUserPage] = useState(1);
  const [userKeyword, setUserKeyword] = useState("");
  const [userKeywordInput, setUserKeywordInput] = useState("");
  const [editUserId, setEditUserId] = useState<number | null>(null);
  const [editPLevel, setEditPLevel] = useState("");

  const queryParams = {
    page,
    limit: 30,
    rewardType: rewardType || undefined,
    keyword: keyword || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo ? new Date(new Date(dateTo).getTime() + 86400000).toISOString() : undefined,
  };

  const { data } = trpc.user.adminRevenueShareRecords.useQuery(queryParams);
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const stats = data?.stats;
  const totalPages = Math.ceil(total / 30);

  const { data: usersData } = trpc.user.adminList.useQuery({
    page: userPage,
    limit: 20,
    keyword: userKeyword || undefined,
  });

  const setPLevelMutation = trpc.user.adminSetUserPLevel.useMutation({
    onSuccess: () => {
      toast.success("用户身份已更新");
      utils.user.adminList.invalidate();
      // Invalidate user-facing queries so the updated pLevel is reflected immediately
      utils.user.profile.invalidate();
      utils.user.teamStats.invalidate();
      setEditUserId(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleSearch = () => { setKeyword(keywordInput.trim()); setPage(1); };
  const handleReset = () => { setKeywordInput(""); setKeyword(""); setRewardType(""); setDateFrom(""); setDateTo(""); setPage(1); };
  const handleUserSearch = () => { setUserKeyword(userKeywordInput.trim()); setUserPage(1); };

  const userTotal = usersData?.total ?? 0;
  const userTotalPages = Math.ceil(userTotal / 20);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">收益分成管理</h1>
          <p className="text-muted-foreground text-sm mt-1">管理用户身份，查看分成记录（三线分润：分享奖 + 身份奖 + 平级奖）</p>
        </div>

        {/* 统计卡片 */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-card border-border">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">总分润金额</p>
                    <p className="text-xl font-bold text-profit mt-1">+{stats.totalAmount.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">USDT</p>
                  </div>
                  <Wallet className="w-5 h-5 text-profit opacity-60" />
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card border-border">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">分享奖合计</p>
                    <p className="text-xl font-bold text-blue-400 mt-1">+{stats.directAmount.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">USDT</p>
                  </div>
                  <Users className="w-5 h-5 text-blue-400 opacity-60" />
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card border-border">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">身份奖合计</p>
                    <p className="text-xl font-bold text-amber-400 mt-1">+{stats.rankAmount.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">USDT</p>
                  </div>
                  <Award className="w-5 h-5 text-amber-400 opacity-60" />
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card border-border">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">平级奖合计</p>
                    <p className="text-xl font-bold text-purple-400 mt-1">+{stats.sameRankAmount.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">USDT</p>
                  </div>
                  <Crown className="w-5 h-5 text-purple-400 opacity-60" />
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Tab 切换 */}
        <div className="flex gap-1 border-b border-border pb-0">
          {[
            { key: "records", label: "分成记录", icon: TrendingUp },
            { key: "users",   label: "用户身份管理", icon: Settings },
          ].map((t) => (
            <Button
              key={t.key}
              size="sm"
              variant={tab === t.key ? "default" : "ghost"}
              onClick={() => setTab(t.key as any)}
              className="gap-1.5 rounded-b-none"
            >
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
            </Button>
          ))}
        </div>

        {/* 分成记录 Tab */}
        {tab === "records" && (
          <>
            {/* 筛选栏 */}
            <Card className="bg-card border-border">
              <CardContent className="p-4">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div className="col-span-2 relative">
                    <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="搜索用户ID或用户名..."
                      value={keywordInput}
                      onChange={(e) => setKeywordInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                      className="pl-8 bg-secondary/50 border-border text-sm h-9"
                    />
                  </div>
                  <Select value={rewardType} onValueChange={(v) => { setRewardType(v === "all" ? "" : v); setPage(1); }}>
                    <SelectTrigger className="bg-secondary/50 border-border text-sm h-9">
                      <SelectValue placeholder="奖励类型" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部类型</SelectItem>
                      <SelectItem value="direct">分享奖</SelectItem>
                      <SelectItem value="rank">身份奖</SelectItem>
                      <SelectItem value="same_rank">平级奖</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground whitespace-nowrap">开始</span>
                    <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="bg-secondary/50 border-border text-sm h-9" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground whitespace-nowrap">结束</span>
                    <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="bg-secondary/50 border-border text-sm h-9" />
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <Button size="sm" onClick={handleSearch} className="h-9">搜索</Button>
                  {(keyword || rewardType || dateFrom || dateTo) && (
                    <Button size="sm" variant="outline" onClick={handleReset} className="h-9 bg-transparent gap-1">
                      <X className="w-3.5 h-3.5" />清除
                    </Button>
                  )}
                  <span className="text-xs text-muted-foreground self-center ml-2">共 {total} 条记录</span>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        {["奖励类型", "交易用户", "受益用户", "受益人身份", "分成比例", "金额", "时间"].map((h) => (
                          <th key={h} className="text-left px-4 py-3 text-muted-foreground font-medium text-xs">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((r: any) => {
                        const meta = REWARD_TYPE_META[r.rewardType] || REWARD_TYPE_META.rank;
                        const Icon = meta.icon;
                        return (
                          <tr key={r.id} className="border-b border-border/50 hover:bg-secondary/30">
                            <td className="px-4 py-3">
                              <span className={`flex items-center gap-1 text-xs ${meta.colorClass}`}>
                                <Icon className="w-3.5 h-3.5" />
                                {meta.label}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-col">
                                <span className="text-xs font-medium text-foreground">{r.traderName || `用户#${r.traderId}`}</span>
                                <span className="text-xs text-muted-foreground">ID: {r.traderId}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-col">
                                <span className="text-xs font-medium text-foreground">{r.recipientName || `用户#${r.recipientId}`}</span>
                                <span className="text-xs text-muted-foreground">ID: {r.recipientId}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`px-1.5 py-0.5 rounded text-xs ${P_LEVEL_COLORS[r.recipientPLevel ?? 0]}`}>
                                {P_LEVEL_NAMES[r.recipientPLevel ?? 0]}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground text-xs">{parseFloat(r.ratio).toFixed(2)}%</td>
                            <td className="px-4 py-3 font-semibold text-profit">+{parseFloat(r.amount).toFixed(4)} USDT</td>
                            <td className="px-4 py-3 text-xs text-muted-foreground">{formatDateTime(r.createdAt)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {items.length === 0 && <p className="text-center py-12 text-muted-foreground">暂无分成记录</p>}
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
          </>
        )}

        {/* 用户身份管理 Tab */}
        {tab === "users" && (
          <>
            <Card className="bg-card border-border">
              <CardContent className="p-4">
                <div className="flex gap-3">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="搜索用户名或邮箱..."
                      value={userKeywordInput}
                      onChange={(e) => setUserKeywordInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleUserSearch()}
                      className="pl-8 bg-secondary/50 border-border text-sm h-9"
                    />
                  </div>
                  <Button size="sm" onClick={handleUserSearch} className="h-9">搜索</Button>
                  {userKeyword && (
                    <Button size="sm" variant="outline" onClick={() => { setUserKeywordInput(""); setUserKeyword(""); setUserPage(1); }} className="h-9 bg-transparent">
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                  <span className="text-xs text-muted-foreground self-center">共 {userTotal} 个用户</span>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        {["用户ID", "用户名", "邮箱", "余额", "当前身份", "系统业绩", "推荐人", "操作"].map((h) => (
                          <th key={h} className="text-left px-4 py-3 text-muted-foreground font-medium text-xs">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {usersData?.items.map((u: any) => {
                        const pLevel = u.pLevel ?? 0;
                        return (
                          <tr key={u.id} className="border-b border-border/50 hover:bg-secondary/30">
                            <td className="px-4 py-3 text-muted-foreground text-xs">#{u.id}</td>
                            <td className="px-4 py-3 font-medium text-foreground text-xs">{u.name || "-"}</td>
                            <td className="px-4 py-3 text-muted-foreground text-xs max-w-[140px] truncate">{u.email || "-"}</td>
                            <td className="px-4 py-3 text-xs text-foreground font-semibold">{parseFloat(u.balance || "0").toFixed(2)} USDT</td>
                            <td className="px-4 py-3">
                              {editUserId === u.id ? (
                                <div className="flex items-center gap-2">
                                  <select
                                    value={editPLevel}
                                    onChange={(e) => setEditPLevel(e.target.value)}
                                    className="h-7 rounded border border-border bg-input text-xs px-2"
                                  >
                                    {[0,1,2,3,4,5,6,7].map(l => (
                                      <option key={l} value={l}>{P_LEVEL_NAMES[l]}</option>
                                    ))}
                                  </select>
                                  <Button size="sm" className="h-7 text-xs px-2" onClick={() => setPLevelMutation.mutate({ userId: u.id, pLevel: parseInt(editPLevel) })} disabled={setPLevelMutation.isPending}>保存</Button>
                                  <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => setEditUserId(null)}>取消</Button>
                                </div>
                              ) : (
                                <span className={`px-2 py-0.5 rounded-full text-xs ${P_LEVEL_COLORS[pLevel]}`}>
                                  {P_LEVEL_NAMES[pLevel]}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-xs text-muted-foreground">{parseFloat(u.umbrellaPerformance || "0").toFixed(2)} USDT</td>
                            <td className="px-4 py-3 text-muted-foreground text-xs">{u.referrerId ? `#${u.referrerId}` : "-"}</td>
                            <td className="px-4 py-3">
                              {editUserId !== u.id && (
                                <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => { setEditUserId(u.id); setEditPLevel(String(pLevel)); }}>
                                  编辑级别
                                </Button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {(!usersData?.items || usersData.items.length === 0) && (
                    <p className="text-center py-12 text-muted-foreground">暂无用户数据</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {userTotalPages > 1 && (
              <div className="flex items-center justify-center gap-3">
                <Button variant="outline" size="sm" className="bg-transparent" onClick={() => setUserPage(p => Math.max(1, p - 1))} disabled={userPage === 1}><ChevronLeft className="w-4 h-4" /></Button>
                <span className="text-sm text-muted-foreground">{userPage} / {userTotalPages}</span>
                <Button variant="outline" size="sm" className="bg-transparent" onClick={() => setUserPage(p => Math.min(userTotalPages, p + 1))} disabled={userPage === userTotalPages}><ChevronRight className="w-4 h-4" /></Button>
              </div>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
}
