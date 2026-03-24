import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, TrendingUp, Settings } from "lucide-react";
import { toast } from "sonner";

export default function AdminRevenueShare() {
  const utils = trpc.useUtils();
  const [page, setPage] = useState(1);
  const { data } = trpc.user.adminRevenueShareRecords.useQuery({ page, limit: 30 });
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 30);

  const { data: users } = trpc.user.adminList.useQuery({ page: 1, limit: 100 });
  const [editUserId, setEditUserId] = useState<number | null>(null);
  const [editRatio, setEditRatio] = useState("");

  const setRatioMutation = trpc.user.adminSetRevenueShareRatio.useMutation({
    onSuccess: () => { toast.success("分成比例已更新"); utils.user.adminList.invalidate(); setEditUserId(null); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">收益分成管理</h1>
          <p className="text-muted-foreground text-sm mt-1">设置用户分成比例，查看分成记录</p>
        </div>

        {/* User ratio settings */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Settings className="w-4 h-4 text-primary" />用户分成比例设置</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {["用户ID", "用户名", "当前分成比例", "推荐人ID", "操作"].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-muted-foreground font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users?.items.map((u: any) => (
                    <tr key={u.id} className="border-b border-border/50 hover:bg-secondary/30">
                      <td className="px-4 py-3 text-muted-foreground">#{u.id}</td>
                      <td className="px-4 py-3 font-medium text-foreground">{u.name || "-"}</td>
                      <td className="px-4 py-3">
                        {editUserId === u.id ? (
                          <div className="flex items-center gap-2">
                            <Input type="number" step="0.1" min="0" max="100" value={editRatio} onChange={(e) => setEditRatio(e.target.value)} className="w-24 h-7 bg-input border-border text-xs" />
                            <span className="text-muted-foreground text-xs">%</span>
                            <Button size="sm" className="h-7 text-xs px-2" onClick={() => setRatioMutation.mutate({ userId: u.id, ratio: parseFloat(editRatio) })} disabled={setRatioMutation.isPending}>保存</Button>
                            <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => setEditUserId(null)}>取消</Button>
                          </div>
                        ) : (
                          <span className={`font-semibold ${parseFloat(u.revenueShareRatio || "0") > 0 ? "text-primary" : "text-muted-foreground"}`}>
                            {parseFloat(u.revenueShareRatio || "0").toFixed(1)}%
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{u.invitedById || u.referrerId ? `#${u.invitedById || u.referrerId}` : "-"}</td>
                      <td className="px-4 py-3">
                        {editUserId !== u.id && (
                          <Button size="sm" variant="ghost" className="text-xs" onClick={() => { setEditUserId(u.id); setEditRatio(u.revenueShareRatio || "0"); }}>
                            编辑
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Revenue share records */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="w-4 h-4 text-primary" />分成记录</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {["交易用户", "受益用户", "分成比例", "金额", "时间"].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-muted-foreground font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((r: any) => (
                    <tr key={r.id} className="border-b border-border/50 hover:bg-secondary/30">
                      <td className="px-4 py-3 text-muted-foreground">#{r.traderId}</td>
                      <td className="px-4 py-3 text-foreground">#{r.recipientId}</td>
                      <td className="px-4 py-3 text-muted-foreground">{parseFloat(r.ratio).toFixed(2)}%</td>
                      <td className="px-4 py-3 font-semibold text-profit">+{parseFloat(r.amount).toFixed(4)} USDT</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleString()}</td>
                    </tr>
                  ))}
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
      </div>
    </AdminLayout>
  );
}
