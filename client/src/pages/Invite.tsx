import UserLayout from "@/components/UserLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, Gift, Users, Link as LinkIcon } from "lucide-react";
import { toast } from "sonner";
import { useLang } from "@/contexts/LangContext";

export default function Invite() {
  const { lang } = useLang();
  const isZh = lang === "zh";

  const { data: profile } = trpc.user.profile.useQuery();
  const { data: teamStats } = trpc.user.teamStats.useQuery();

  const inviteCode = profile?.inviteCode || "";
  const basePath = import.meta.env.BASE_URL?.replace(/\/$/, '') || '';
  const inviteUrl = `${window.location.origin}${basePath}/register?ref=${inviteCode}`;

  const copy = async (text: string, label: string) => {
    // 方法1：现代 Clipboard API（HTTPS + 用户授权）
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        toast.success(isZh ? `${label}已复制` : `${label} copied`);
        return;
      } catch {
        // 降级到方法2
      }
    }
    // 方法2：textarea + execCommand（兼容旧版/移动端浏览器）
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.cssText = "position:fixed;top:0;left:0;width:2em;height:2em;padding:0;border:none;outline:none;box-shadow:none;background:transparent;opacity:0;";
      document.body.appendChild(textarea);
      // 移动端需要 setSelectionRange 才能真正选中
      textarea.focus();
      textarea.setSelectionRange(0, textarea.value.length);
      textarea.select();
      const success = document.execCommand("copy");
      document.body.removeChild(textarea);
      if (success) {
        toast.success(isZh ? `${label}已复制` : `${label} copied`);
        return;
      }
    } catch {
      // 降级到方法3
    }
    // 方法3：提示用户手动复制（显示文本供长按复制）
    toast.error(isZh ? `复制失败，请长按手动复制：${text}` : `Copy failed, please copy manually: ${text}`, { duration: 6000 });
  };

  return (
    <UserLayout>
      <div className="space-y-6 max-w-2xl">
        <div>
          <h1 className="text-2xl font-bold">{isZh ? "邀请好友" : "Invite Friends"}</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {isZh ? "邀请好友加入平台，共享策略收益" : "Invite friends to join the platform and share strategy profits"}
          </p>
        </div>

        <Card className="bg-card border-border">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-primary/15 rounded-xl flex items-center justify-center">
                <Gift className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-foreground">
                  {isZh ? "我的邀请码" : "My Invite Code"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {isZh ? "分享给好友，一起使用策略平台" : "Share with friends to use the strategy platform together"}
                </p>
              </div>
            </div>
            <div className="p-4 rounded-xl bg-secondary/50 border border-border">
              <p className="text-3xl font-bold text-center tracking-widest text-primary">
                {inviteCode || (isZh ? "加载中..." : "Loading...")}
              </p>
            </div>
            <div className="flex gap-3">
              <Button className="flex-1" onClick={() => copy(inviteCode, isZh ? "邀请码" : "Invite code")}>
                <Copy className="w-4 h-4 mr-1" />{isZh ? "复制邀请码" : "Copy Code"}
              </Button>
              <Button variant="outline" className="flex-1 bg-transparent" onClick={() => copy(inviteUrl, isZh ? "邀请链接" : "Invite link")}>
                <LinkIcon className="w-4 h-4 mr-1" />{isZh ? "复制邀请链接" : "Copy Link"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-4">
          <Card className="bg-card border-border">
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">{isZh ? "分享人数" : "Direct Referrals"}</p>
              <p className="text-2xl font-bold text-foreground mt-1">
                {teamStats?.directCount ?? 0} {isZh && <span className="text-sm font-normal text-muted-foreground">人</span>}
              </p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">{isZh ? "系统总人数" : "Total Team"}</p>
              <p className="text-2xl font-bold text-foreground mt-1">
                {teamStats?.totalCount ?? 0} {isZh && <span className="text-sm font-normal text-muted-foreground">人</span>}
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{isZh ? "邀请说明" : "How It Works"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>{isZh
              ? "邀请好友加入平台，一起使用策略跟单服务："
              : "Invite friends to join the platform and use the copy trading service:"}</p>
            <ul className="space-y-2">
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                {isZh
                  ? "好友通过您的邀请码或链接注册后，自动加入您的系统"
                  : "Friends who register with your invite code or link automatically join your team"}
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                {isZh
                  ? "系统成员产生的交易收益将按平台规则进行分成"
                  : "Trading profits generated by team members are shared according to platform rules"}
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                {isZh
                  ? "收益分成按订单平仓结算，直接入账到您的平台余额"
                  : "Revenue shares are settled on order close and credited directly to your balance"}
              </li>
            </ul>
            <div className="p-3 rounded-lg bg-primary/10 border border-primary/20 text-primary text-xs">
              {isZh ? "邀请链接：" : "Invite link: "}<span className="font-mono break-all">{inviteUrl}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </UserLayout>
  );
}
