import { useState } from "react";
import UserLayout from "@/components/UserLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, TrendingUp, UserPlus, Percent, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "wouter";
import { toast } from "sonner";

export default function Team() {
  const utils = trpc.useUtils();
  const { data: stats } = trpc.user.teamStats.useQuery();
  const { data: profile } = trpc.user.profile.useQuery();
  const { data: invitees } = trpc.user.myInvitees.useQuery();

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editRatio, setEditRatio] = useState("");

  const setRatioMutation = trpc.user.setInviteeRevenueShare.useMutation({
    onSuccess: () => {
      toast.success("分成比例已更新");
      utils.user.myInvitees.invalidate();
      setEditingId(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <UserLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">团队数据</h1>
            <p className="text-muted-foreground text-sm mt-1">查看您的团队规模与分成设置</p>
          </div>
          <Button asChild size="sm">
            <Link href="/invite" className="flex items-center gap-1"><UserPlus className="w-4 h-4" />邀请成员</Link>
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "团队总人数", value: stats?.totalCount ?? 0, unit: "人", icon: Users },
            { label: "直推人数", value: stats?.directCount ?? 0, unit: "人", icon: UserPlus },
            { label: "团队总盈利", value: `${(stats?.teamProfit ?? 0).toFixed(2)}`, unit: "USDT", icon: TrendingUp },
            { label: "我的分成比例", value: `${parseFloat(profile?.revenueShareRatio || "0").toFixed(1)}`, unit: "%", icon: Percent },
          ].map((s) => (
            <Card key={s.label} className="bg-card border-border">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                    <p className="text-2xl font-bold text-foreground mt-1">{s.value} <span className="text-sm font-normal text-muted-foreground">{s.unit}</span></p>
                  </div>
                  <s.icon className="w-5 h-5 text-primary opacity-60" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Invitee List with Revenue Share Setting */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" /> 我邀请的成员
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!invitees || invitees.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <UserPlus className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">暂无邀请成员</p>
                <p className="text-xs mt-1">分享您的邀请链接来邀请新成员</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      {["成员", "邮箱", "分成比例", "状态", "加入时间", "操作"].map((h) => (
                        <th key={h} className="text-left px-4 py-3 text-muted-foreground font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {invitees.map((inv: any) => (
                      <tr key={inv.id} className="border-b border-border/50 hover:bg-secondary/30">
                        <td className="px-4 py-3 text-foreground font-medium">{inv.name || `用户#${inv.id}`}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{inv.email}</td>
                        <td className="px-4 py-3">
                          {editingId === inv.id ? (
                            <div className="flex items-center gap-1">
                              <Input
                                type="number"
                                min="0"
                                max={parseFloat(profile?.revenueShareRatio || "0")}
                                step="0.1"
                                value={editRatio}
                                onChange={(e) => setEditRatio(e.target.value)}
                                className="w-20 h-7 text-xs bg-input border-border"
                              />
                              <span className="text-xs text-muted-foreground">%</span>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-emerald-500"
                                onClick={() => setRatioMutation.mutate({ inviteeId: inv.id, ratio: parseFloat(editRatio) })}
                                disabled={setRatioMutation.isPending}
                              >
                                <Check className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-muted-foreground"
                                onClick={() => setEditingId(null)}
                              >
                                <X className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <span className="text-primary font-semibold">
                              {parseFloat(inv.revenueShareRatio || "0").toFixed(1)}%
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs ${inv.isActive ? "bg-emerald-500/15 text-emerald-500" : "bg-red-500/15 text-red-500"}`}>
                            {inv.isActive ? "正常" : "已禁用"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {new Date(inv.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3">
                          {editingId !== inv.id && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs"
                              onClick={() => { setEditingId(inv.id); setEditRatio(inv.revenueShareRatio || "0"); }}
                            >
                              设置分成
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-3">
              提示：您可以为邀请的成员设置分成比例，比例不能超过您自己的分成比例 ({parseFloat(profile?.revenueShareRatio || "0").toFixed(1)}%)。
            </p>
          </CardContent>
        </Card>
      </div>
    </UserLayout>
  );
}
