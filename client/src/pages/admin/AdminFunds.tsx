import { useState, useEffect } from "react";
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle, XCircle, ChevronLeft, ChevronRight, Wallet, Settings, Save, RefreshCw, ArrowDownToLine, Shield, Key, Eye, EyeOff, Copy, Search, X } from "lucide-react";
import { formatDateTime } from "@/lib/time";
import { toast } from "sonner";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-500/15 text-yellow-500",
  approved: "bg-emerald-500/15 text-emerald-500",
  rejected: "bg-red-500/15 text-red-500",
  completed: "bg-emerald-500/15 text-emerald-500",
};
const STATUS_LABELS: Record<string, string> = {
  pending: "待审核", approved: "已确认", rejected: "已拒绝", completed: "已完成",
};

export default function AdminFunds() {
  const utils = trpc.useUtils();
  const [depPage, setDepPage] = useState(1);
  const [witPage, setWitPage] = useState(1);
  const [reviewItem, setReviewItem] = useState<any>(null);
  const [reviewType, setReviewType] = useState<"deposit" | "withdrawal">("deposit");
  const [rejectReason, setRejectReason] = useState("");
  const [txHashInput, setTxHashInput] = useState("");

  // System config state
  const [withdrawalFeeRate, setWithdrawalFeeRate] = useState("");
  const [withdrawalMinAmount, setWithdrawalMinAmount] = useState("");
  const [bscscanKey, setBscscanKey] = useState("");
  const [importMnemonic, setImportMnemonic] = useState("");
  const [showMnemonicDialog, setShowMnemonicDialog] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [resetMnemonic, setResetMnemonic] = useState("");
  const [resetConfirmText, setResetConfirmText] = useState("");
  const [exportedData, setExportedData] = useState<{ mnemonic: string; privateKey: string; address: string } | null>(null);
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [showMnemonic, setShowMnemonic] = useState(false);
  const [createdMnemonic, setCreatedMnemonic] = useState<string | null>(null);

  // 充值筛选
  const [depStatus, setDepStatus] = useState("");
  const [depKeyword, setDepKeyword] = useState("");
  const [depKeywordInput, setDepKeywordInput] = useState("");
  const [depDateFrom, setDepDateFrom] = useState("");
  const [depDateTo, setDepDateTo] = useState("");

  // 提现筛选
  const [witStatus, setWitStatus] = useState("");
  const [witKeyword, setWitKeyword] = useState("");
  const [witKeywordInput, setWitKeywordInput] = useState("");
  const [witDateFrom, setWitDateFrom] = useState("");
  const [witDateTo, setWitDateTo] = useState("");

  const { data: deposits } = trpc.funds.adminDeposits.useQuery({
    page: depPage,
    limit: 20,
    status: depStatus || undefined,
    keyword: depKeyword || undefined,
    dateFrom: depDateFrom || undefined,
    dateTo: depDateTo ? new Date(new Date(depDateTo).getTime() + 86400000).toISOString() : undefined,
  });
  const { data: withdrawals } = trpc.funds.adminWithdrawals.useQuery({
    page: witPage,
    limit: 20,
    status: witStatus || undefined,
    keyword: witKeyword || undefined,
    dateFrom: witDateFrom || undefined,
    dateTo: witDateTo ? new Date(new Date(witDateTo).getTime() + 86400000).toISOString() : undefined,
  });
  const { data: configs } = trpc.funds.adminGetConfig.useQuery();
  const { data: walletStatus, refetch: refetchWallet } = trpc.funds.adminWalletStatus.useQuery();

  useEffect(() => {
    if (configs) {
      const configMap = new Map(configs.map((c: any) => [c.configKey, c.configValue]));
      setWithdrawalFeeRate((configMap.get("withdrawal_fee_rate") as string) || "0.01");
      setWithdrawalMinAmount((configMap.get("withdrawal_min_amount") as string) || "10");
      setBscscanKey((configMap.get("bscscan_api_key") as string) || "");
    }
  }, [configs]);

  const setConfigMutation = trpc.funds.adminSetConfig.useMutation({
    onSuccess: () => { toast.success("配置已保存"); utils.funds.adminGetConfig.invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const initWalletMutation = trpc.funds.adminInitWallet.useMutation({
    onSuccess: (data: any) => {
      if (data.mnemonic) {
        setCreatedMnemonic(data.mnemonic);
        setShowMnemonicDialog(true);
      }
      toast.success(`HD钱包已创建，主地址: ${data.mainAddress}`);
      refetchWallet();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const exportMnemonicMutation = trpc.funds.adminExportMnemonic.useMutation({
    onSuccess: (data) => {
      setExportedData(data);
      setShowMnemonicDialog(true);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const importWalletMutation = trpc.funds.adminImportWallet.useMutation({
    onSuccess: (data) => { toast.success(`钱包已导入，主地址: ${data.mainAddress}`); refetchWallet(); setImportMnemonic(""); },
    onError: (e: any) => toast.error(e.message),
  });

  const resetAndImportMutation = trpc.funds.adminResetAndImportWallet.useMutation({
    onSuccess: (data) => {
      toast.success(`钱包已重置并导入，新主地址: ${data.mainAddress}`);
      refetchWallet();
      setShowResetDialog(false);
      setResetMnemonic("");
      setResetConfirmText("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const setBscscanMutation = trpc.funds.adminSetBscscanKey.useMutation({
    onSuccess: () => { toast.success("BSCScan API Key 已保存"); utils.funds.adminGetConfig.invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const scanMutation = trpc.funds.adminScanDeposits.useMutation({
    onSuccess: (data) => { toast.success(`扫描完成: 检测到 ${data.detected} 笔新充值，已自动到账 ${data.credited} 笔`); utils.funds.adminDeposits.invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const collectMutation = trpc.funds.adminCollectDeposits.useMutation({
    onSuccess: (data) => { toast.success(`归集完成: ${data.collected} 笔成功${data.errors.length ? `，${data.errors.length} 笔失败` : ""}`); },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleAutoScanMutation = trpc.funds.adminToggleAutoScan.useMutation({
    onSuccess: (data) => { toast.success(data.autoScanActive ? "自动扫描已开启" : "自动扫描已关闭"); refetchWallet(); },
    onError: (e: any) => toast.error(e.message),
  });

  const reviewDepMutation = trpc.funds.adminReviewDeposit.useMutation({
    onSuccess: () => { toast.success("审核完成"); utils.funds.adminDeposits.invalidate(); setReviewItem(null); },
    onError: (e: any) => toast.error(e.message),
  });

  const reviewWitMutation = trpc.funds.adminReviewWithdrawal.useMutation({
    onSuccess: () => { toast.success("审核完成"); utils.funds.adminWithdrawals.invalidate(); setReviewItem(null); },
    onError: (e: any) => toast.error(e.message),
  });

  const openReview = (item: any, type: "deposit" | "withdrawal") => {
    setReviewItem(item); setReviewType(type); setRejectReason(""); setTxHashInput("");
  };

  const handleApprove = () => {
    if (reviewType === "deposit") {
      reviewDepMutation.mutate({ depositId: reviewItem.id, approved: true });
    } else {
      reviewWitMutation.mutate({ withdrawalId: reviewItem.id, approved: true, txHash: txHashInput || undefined });
    }
  };

  const handleReject = () => {
    if (reviewType === "deposit") {
      reviewDepMutation.mutate({ depositId: reviewItem.id, approved: false, reviewNote: rejectReason });
    } else {
      reviewWitMutation.mutate({ withdrawalId: reviewItem.id, approved: false, reviewNote: rejectReason });
    }
  };

  const isPending = reviewDepMutation.isPending || reviewWitMutation.isPending;

  const renderDepositTable = (items: any[]) => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            {["ID", "用户", "金额 (USDT)", "链", "TxHash", "来源地址", "状态", "提交时间", "操作"].map((h) => (
              <th key={h} className="text-left px-3 py-3 text-muted-foreground font-medium whitespace-nowrap text-xs">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item: any) => (
            <tr key={item.id} className="border-b border-border/50 hover:bg-secondary/30">
              <td className="px-3 py-2.5 text-muted-foreground text-xs">#{item.id}</td>
              <td className="px-3 py-2.5">
                <div className="flex flex-col">
                  <span className="text-xs font-medium text-foreground">{item.userName || `用户#${item.userId}`}</span>
                  <span className="text-xs text-muted-foreground">ID:{item.userId}</span>
                </div>
              </td>
              <td className="px-3 py-2.5 font-semibold text-profit text-xs">+{parseFloat(item.amount).toFixed(4)}</td>
              <td className="px-3 py-2.5 text-muted-foreground text-xs">{item.chain || "BSC"}</td>
              <td className="px-3 py-2.5 text-muted-foreground font-mono text-xs max-w-[100px] truncate" title={item.txHash}>
                {item.txHash ? `${item.txHash.slice(0, 8)}...` : "-"}
              </td>
              <td className="px-3 py-2.5 text-muted-foreground font-mono text-xs max-w-[100px] truncate" title={item.fromAddress}>
                {item.fromAddress ? `${item.fromAddress.slice(0, 8)}...` : "-"}
              </td>
              <td className="px-3 py-2.5">
                <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[item.status] || "bg-secondary text-muted-foreground"}`}>
                  {STATUS_LABELS[item.status] || item.status}
                </span>
              </td>
              <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{formatDateTime(item.createdAt)}</td>
              <td className="px-3 py-2.5">
                {item.status === "pending" && (
                  <Button size="sm" variant="outline" className="bg-transparent text-xs h-7" onClick={() => openReview(item, "deposit")}>审核</Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {items.length === 0 && <p className="text-center py-12 text-muted-foreground">暂无数据</p>}
    </div>
  );

  const renderWithdrawalTable = (items: any[]) => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            {["ID", "用户", "申请金额", "手续费", "实际到账", "收款地址", "TxHash", "状态", "提交时间", "操作"].map((h) => (
              <th key={h} className="text-left px-3 py-3 text-muted-foreground font-medium whitespace-nowrap text-xs">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item: any) => (
            <tr key={item.id} className="border-b border-border/50 hover:bg-secondary/30">
              <td className="px-3 py-2.5 text-muted-foreground text-xs">#{item.id}</td>
              <td className="px-3 py-2.5">
                <div className="flex flex-col">
                  <span className="text-xs font-medium text-foreground">{item.userName || `用户#${item.userId}`}</span>
                  <span className="text-xs text-muted-foreground">ID:{item.userId}</span>
                </div>
              </td>
              <td className="px-3 py-2.5 font-semibold text-loss text-xs">-{parseFloat(item.amount).toFixed(4)}</td>
              <td className="px-3 py-2.5 text-muted-foreground text-xs">{parseFloat(item.fee || "0").toFixed(4)}</td>
              <td className="px-3 py-2.5 text-foreground text-xs font-semibold">{parseFloat(item.netAmount || item.amount).toFixed(4)}</td>
              <td className="px-3 py-2.5 text-muted-foreground font-mono text-xs max-w-[100px] truncate" title={item.address || item.toAddress}>
                {(item.address || item.toAddress) ? `${(item.address || item.toAddress).slice(0, 8)}...` : "-"}
              </td>
              <td className="px-3 py-2.5 text-muted-foreground font-mono text-xs max-w-[80px] truncate" title={item.txHash}>
                {item.txHash ? `${item.txHash.slice(0, 8)}...` : "-"}
              </td>
              <td className="px-3 py-2.5">
                <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[item.status] || "bg-secondary text-muted-foreground"}`}>
                  {STATUS_LABELS[item.status] || item.status}
                </span>
              </td>
              <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{formatDateTime(item.createdAt)}</td>
              <td className="px-3 py-2.5">
                {item.status === "pending" && (
                  <Button size="sm" variant="outline" className="bg-transparent text-xs h-7" onClick={() => openReview(item, "withdrawal")}>审核</Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {items.length === 0 && <p className="text-center py-12 text-muted-foreground">暂无数据</p>}
    </div>
  );

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">资金管理</h1>
          <p className="text-muted-foreground text-sm mt-1">BSC钱包管理、充提审核、系统配置</p>
        </div>

        <Tabs defaultValue="wallet">
          <TabsList className="bg-secondary">
            <TabsTrigger value="wallet"><Wallet className="w-3.5 h-3.5 mr-1" />钱包管理</TabsTrigger>
            <TabsTrigger value="settings"><Settings className="w-3.5 h-3.5 mr-1" />系统设置</TabsTrigger>
            <TabsTrigger value="deposits">
              充值审核
              {deposits?.pendingCount ? ` (${deposits.pendingCount})` : ""}
            </TabsTrigger>
            <TabsTrigger value="withdrawals">
              提现审核
              {withdrawals?.pendingCount ? ` (${withdrawals.pendingCount})` : ""}
            </TabsTrigger>
          </TabsList>

          {/* ─── Wallet Management Tab ─────────────────────────────────── */}
          <TabsContent value="wallet" className="mt-4 space-y-4">
            {/* Wallet Status */}
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Shield className="w-4 h-4 text-primary" /> HD钱包状态
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {walletStatus?.initialized ? (
                  <div className="space-y-3">
                    <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                      <div className="flex items-center gap-2 mb-2">
                        <CheckCircle className="w-4 h-4 text-emerald-500" />
                        <span className="text-sm font-medium text-emerald-500">钱包已初始化</span>
                      </div>
                      <div className="space-y-1 text-sm">
                        <p className="text-muted-foreground">主地址（归集地址）：</p>
                        <p className="font-mono text-foreground break-all">{walletStatus.mainAddress}</p>
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        已派生 {walletStatus.nextIndex} 个用户充值地址
                      </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="bg-transparent text-yellow-500 border-yellow-500/30 hover:bg-yellow-500/10"
                          onClick={() => {
                            if (window.confirm("警告：导出助记词和私钥是极其敏感的操作！\n\n请确保您在安全的环境中操作，不要截图或分享给任何人。\n\n确认导出？")) {
                              exportMnemonicMutation.mutate();
                            }
                          }}
                          disabled={exportMnemonicMutation.isPending}
                        >
                          <Key className="w-3.5 h-3.5 mr-1" />
                          {exportMnemonicMutation.isPending ? "导出中..." : "导出助记词/私钥"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="bg-transparent text-red-500 border-red-500/30 hover:bg-red-500/10"
                          onClick={() => setShowResetDialog(true)}
                        >
                          <RefreshCw className="w-3.5 h-3.5 mr-1" />
                          重置并导入新钱包
                        </Button>
                      </div>
                    </div>

                    {/* Auto-Scan Status */}
                    <div className="p-3 rounded-lg bg-secondary/30 border border-border">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">自动扫描</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {walletStatus.autoScanActive
                              ? "每3分钟自动检测所有用户地址的USDT入账"
                              : "自动扫描已关闭，需手动点击扫描按钮"}
                          </p>
                          {walletStatus.lastScanTime && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              上次扫描: {formatDateTime(walletStatus.lastScanTime)}
                            </p>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant={walletStatus.autoScanActive ? "destructive" : "default"}
                          onClick={() => toggleAutoScanMutation.mutate({ enabled: !walletStatus.autoScanActive })}
                          disabled={toggleAutoScanMutation.isPending}
                        >
                          {walletStatus.autoScanActive ? "关闭" : "开启"}
                        </Button>
                      </div>
                    </div>

                    {/* Scan & Collect Buttons */}
                    <div className="grid grid-cols-2 gap-3">
                      <Button
                        variant="outline"
                        className="bg-transparent"
                        onClick={() => scanMutation.mutate()}
                        disabled={scanMutation.isPending}
                      >
                        <RefreshCw className={`w-4 h-4 mr-2 ${scanMutation.isPending ? "animate-spin" : ""}`} />
                        {scanMutation.isPending ? "扫描中..." : "手动扫描"}
                      </Button>
                      <Button
                        variant="outline"
                        className="bg-transparent"
                        onClick={() => collectMutation.mutate()}
                        disabled={collectMutation.isPending}
                      >
                        <ArrowDownToLine className={`w-4 h-4 mr-2 ${collectMutation.isPending ? "animate-spin" : ""}`} />
                        {collectMutation.isPending ? "归集中..." : "归集资金"}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      「手动扫描」立即检测所有用户地址的USDT入账（双重检测：BSCScan API + RPC余额）；「归集资金」将用户地址的USDT转到主地址。
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                      <p className="text-sm text-yellow-600 font-medium">HD钱包尚未初始化</p>
                      <p className="text-xs text-yellow-600/80 mt-1">请创建新钱包或导入已有助记词来初始化充值系统。</p>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                      <Card className="bg-secondary/30 border-border">
                        <CardContent className="p-4 space-y-3">
                          <h4 className="text-sm font-medium">方式一：创建新钱包</h4>
                          <p className="text-xs text-muted-foreground">系统将自动生成助记词并创建HD钱包，请务必备份助记词。</p>
                          <Button
                            className="w-full"
                            onClick={() => initWalletMutation.mutate()}
                            disabled={initWalletMutation.isPending}
                          >
                            {initWalletMutation.isPending ? "创建中..." : "创建新钱包"}
                          </Button>
                        </CardContent>
                      </Card>

                      <Card className="bg-secondary/30 border-border">
                        <CardContent className="p-4 space-y-3">
                          <h4 className="text-sm font-medium">方式二：导入已有钱包</h4>
                          <Input
                            placeholder="输入12/24位助记词，空格分隔"
                            value={importMnemonic}
                            onChange={(e) => setImportMnemonic(e.target.value)}
                            className="bg-input border-border text-sm"
                            type="password"
                          />
                          <Button
                            className="w-full"
                            onClick={() => importWalletMutation.mutate({ mnemonic: importMnemonic })}
                            disabled={importWalletMutation.isPending || !importMnemonic}
                          >
                            {importWalletMutation.isPending ? "导入中..." : "导入钱包"}
                          </Button>
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* BSCScan API Key */}
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Key className="w-4 h-4 text-primary" /> BSCScan API Key
                </CardTitle>
                <p className="text-xs text-muted-foreground">用于查询链上交易记录，可在 bscscan.com 免费申请</p>
              </CardHeader>
              <CardContent>
                <div className="flex gap-3">
                  <Input
                    placeholder="输入 BSCScan API Key"
                    value={bscscanKey}
                    onChange={(e) => setBscscanKey(e.target.value)}
                    className="bg-input border-border text-sm flex-1"
                    type="password"
                  />
                  <Button onClick={() => setBscscanMutation.mutate({ apiKey: bscscanKey })} disabled={setBscscanMutation.isPending || !bscscanKey}>
                    <Save className="w-4 h-4 mr-1" />保存
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─── System Settings Tab ───────────────────────────────────── */}
          <TabsContent value="settings" className="mt-4">
            <div className="grid md:grid-cols-2 gap-4">
              <Card className="bg-card border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">提现手续费率</CardTitle>
                  <p className="text-xs text-muted-foreground">用户提现时收取的手续费比例（0.01 = 1%）</p>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-3">
                    <Input type="number" step="0.001" placeholder="如：0.01" value={withdrawalFeeRate} onChange={(e) => setWithdrawalFeeRate(e.target.value)} className="bg-input border-border text-sm flex-1" />
                    <Button onClick={() => setConfigMutation.mutate({ key: "withdrawal_fee_rate", value: withdrawalFeeRate })} disabled={setConfigMutation.isPending}>
                      <Save className="w-4 h-4 mr-1" />保存
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">当前费率: {(parseFloat(withdrawalFeeRate || "0") * 100).toFixed(1)}%</p>
                </CardContent>
              </Card>

              <Card className="bg-card border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">最低提现金额</CardTitle>
                  <p className="text-xs text-muted-foreground">用户单次提现的最低金额限制 (USDT)</p>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-3">
                    <Input type="number" placeholder="如：10" value={withdrawalMinAmount} onChange={(e) => setWithdrawalMinAmount(e.target.value)} className="bg-input border-border text-sm flex-1" />
                    <Button onClick={() => setConfigMutation.mutate({ key: "withdrawal_min_amount", value: withdrawalMinAmount })} disabled={setConfigMutation.isPending}>
                      <Save className="w-4 h-4 mr-1" />保存
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ─── Deposits Tab ──────────────────────────────────────────── */}
          <TabsContent value="deposits" className="mt-4 space-y-4">
            {deposits?.stats && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="bg-card border-border"><CardContent className="p-4"><p className="text-xs text-muted-foreground">待审核</p><p className="text-xl font-bold text-yellow-500 mt-1">{deposits.stats.pendingCount}</p><p className="text-xs text-muted-foreground">笔</p></CardContent></Card>
                <Card className="bg-card border-border"><CardContent className="p-4"><p className="text-xs text-muted-foreground">已确认金额</p><p className="text-xl font-bold text-profit mt-1">+{deposits.stats.confirmedAmount.toFixed(2)}</p><p className="text-xs text-muted-foreground">USDT</p></CardContent></Card>
                <Card className="bg-card border-border"><CardContent className="p-4"><p className="text-xs text-muted-foreground">待审金额</p><p className="text-xl font-bold text-yellow-500 mt-1">{deposits.stats.pendingAmount.toFixed(2)}</p><p className="text-xs text-muted-foreground">USDT</p></CardContent></Card>
                <Card className="bg-card border-border"><CardContent className="p-4"><p className="text-xs text-muted-foreground">总记录数</p><p className="text-xl font-bold text-foreground mt-1">{deposits.total}</p><p className="text-xs text-muted-foreground">笔</p></CardContent></Card>
              </div>
            )}
            <Card className="bg-card border-border">
              <CardContent className="p-4">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div className="col-span-2 relative">
                    <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
                    <Input placeholder="搜索用户名或TxHash..." value={depKeywordInput} onChange={(e) => setDepKeywordInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { setDepKeyword(depKeywordInput.trim()); setDepPage(1); } }} className="pl-8 bg-secondary/50 border-border text-sm h-9" />
                  </div>
                  <Select value={depStatus} onValueChange={(v) => { setDepStatus(v === "all" ? "" : v); setDepPage(1); }}>
                    <SelectTrigger className="bg-secondary/50 border-border text-sm h-9"><SelectValue placeholder="充值状态" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部状态</SelectItem>
                      <SelectItem value="pending">待审核</SelectItem>
                      <SelectItem value="approved">已确认</SelectItem>
                      <SelectItem value="rejected">已拒绝</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-1"><span className="text-xs text-muted-foreground whitespace-nowrap">开始</span><Input type="date" value={depDateFrom} onChange={(e) => setDepDateFrom(e.target.value)} className="bg-secondary/50 border-border text-sm h-9" /></div>
                  <div className="flex items-center gap-1"><span className="text-xs text-muted-foreground whitespace-nowrap">结束</span><Input type="date" value={depDateTo} onChange={(e) => setDepDateTo(e.target.value)} className="bg-secondary/50 border-border text-sm h-9" /></div>
                </div>
                <div className="flex gap-2 mt-3">
                  <Button size="sm" onClick={() => { setDepKeyword(depKeywordInput.trim()); setDepPage(1); }} className="h-9">搜索</Button>
                  {(depKeyword || depStatus || depDateFrom || depDateTo) && (<Button size="sm" variant="outline" onClick={() => { setDepKeywordInput(""); setDepKeyword(""); setDepStatus(""); setDepDateFrom(""); setDepDateTo(""); setDepPage(1); }} className="h-9 bg-transparent gap-1"><X className="w-3.5 h-3.5" />清除</Button>)}
                  <span className="text-xs text-muted-foreground self-center ml-2">共 {deposits?.total ?? 0} 条</span>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card border-border"><CardContent className="p-0">{renderDepositTable(deposits?.items ?? [])}</CardContent></Card>
            {Math.ceil((deposits?.total ?? 0) / 20) > 1 && (
              <div className="flex items-center justify-center gap-3">
                <Button variant="outline" size="sm" className="bg-transparent" onClick={() => setDepPage(p => Math.max(1, p - 1))} disabled={depPage === 1}><ChevronLeft className="w-4 h-4" /></Button>
                <span className="text-sm text-muted-foreground">{depPage} / {Math.ceil((deposits?.total ?? 0) / 20)}</span>
                <Button variant="outline" size="sm" className="bg-transparent" onClick={() => setDepPage(p => p + 1)} disabled={depPage >= Math.ceil((deposits?.total ?? 0) / 20)}><ChevronRight className="w-4 h-4" /></Button>
              </div>
            )}
          </TabsContent>

          {/* ─── Withdrawals Tab ───────────────────────────────────────── */}
          <TabsContent value="withdrawals" className="mt-4 space-y-4">
            {withdrawals?.stats && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="bg-card border-border"><CardContent className="p-4"><p className="text-xs text-muted-foreground">待审核</p><p className="text-xl font-bold text-yellow-500 mt-1">{withdrawals.stats.pendingCount}</p><p className="text-xs text-muted-foreground">笔</p></CardContent></Card>
                <Card className="bg-card border-border"><CardContent className="p-4"><p className="text-xs text-muted-foreground">已完成金额</p><p className="text-xl font-bold text-primary mt-1">{withdrawals.stats.completedAmount.toFixed(2)}</p><p className="text-xs text-muted-foreground">USDT</p></CardContent></Card>
                <Card className="bg-card border-border"><CardContent className="p-4"><p className="text-xs text-muted-foreground">待审金额</p><p className="text-xl font-bold text-yellow-500 mt-1">{withdrawals.stats.pendingAmount.toFixed(2)}</p><p className="text-xs text-muted-foreground">USDT</p></CardContent></Card>
                <Card className="bg-card border-border"><CardContent className="p-4"><p className="text-xs text-muted-foreground">总记录数</p><p className="text-xl font-bold text-foreground mt-1">{withdrawals.total}</p><p className="text-xs text-muted-foreground">笔</p></CardContent></Card>
              </div>
            )}
            <Card className="bg-card border-border">
              <CardContent className="p-4">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div className="col-span-2 relative">
                    <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
                    <Input placeholder="搜索用户名或收款地址..." value={witKeywordInput} onChange={(e) => setWitKeywordInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { setWitKeyword(witKeywordInput.trim()); setWitPage(1); } }} className="pl-8 bg-secondary/50 border-border text-sm h-9" />
                  </div>
                  <Select value={witStatus} onValueChange={(v) => { setWitStatus(v === "all" ? "" : v); setWitPage(1); }}>
                    <SelectTrigger className="bg-secondary/50 border-border text-sm h-9"><SelectValue placeholder="提现状态" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部状态</SelectItem>
                      <SelectItem value="pending">待审核</SelectItem>
                      <SelectItem value="completed">已完成</SelectItem>
                      <SelectItem value="rejected">已拒绝</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-1"><span className="text-xs text-muted-foreground whitespace-nowrap">开始</span><Input type="date" value={witDateFrom} onChange={(e) => setWitDateFrom(e.target.value)} className="bg-secondary/50 border-border text-sm h-9" /></div>
                  <div className="flex items-center gap-1"><span className="text-xs text-muted-foreground whitespace-nowrap">结束</span><Input type="date" value={witDateTo} onChange={(e) => setWitDateTo(e.target.value)} className="bg-secondary/50 border-border text-sm h-9" /></div>
                </div>
                <div className="flex gap-2 mt-3">
                  <Button size="sm" onClick={() => { setWitKeyword(witKeywordInput.trim()); setWitPage(1); }} className="h-9">搜索</Button>
                  {(witKeyword || witStatus || witDateFrom || witDateTo) && (<Button size="sm" variant="outline" onClick={() => { setWitKeywordInput(""); setWitKeyword(""); setWitStatus(""); setWitDateFrom(""); setWitDateTo(""); setWitPage(1); }} className="h-9 bg-transparent gap-1"><X className="w-3.5 h-3.5" />清除</Button>)}
                  <span className="text-xs text-muted-foreground self-center ml-2">共 {withdrawals?.total ?? 0} 条</span>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card border-border"><CardContent className="p-0">{renderWithdrawalTable(withdrawals?.items ?? [])}</CardContent></Card>
            {Math.ceil((withdrawals?.total ?? 0) / 20) > 1 && (
              <div className="flex items-center justify-center gap-3">
                <Button variant="outline" size="sm" className="bg-transparent" onClick={() => setWitPage(p => Math.max(1, p - 1))} disabled={witPage === 1}><ChevronLeft className="w-4 h-4" /></Button>
                <span className="text-sm text-muted-foreground">{witPage} / {Math.ceil((withdrawals?.total ?? 0) / 20)}</span>
                <Button variant="outline" size="sm" className="bg-transparent" onClick={() => setWitPage(p => p + 1)} disabled={witPage >= Math.ceil((withdrawals?.total ?? 0) / 20)}><ChevronRight className="w-4 h-4" /></Button>
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Review Dialog */}
        <Dialog open={!!reviewItem} onOpenChange={(v) => !v && setReviewItem(null)}>
          <DialogContent className="bg-card border-border">
            <DialogHeader><DialogTitle>审核{reviewType === "deposit" ? "充值" : "提现"}申请</DialogTitle></DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="p-4 rounded-lg bg-secondary/50 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">用户ID</span><span>#{reviewItem?.userId}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">金额</span><span className="font-semibold">{parseFloat(reviewItem?.amount || "0").toFixed(4)} USDT</span></div>
                {reviewItem?.fee && (
                  <div className="flex justify-between"><span className="text-muted-foreground">手续费</span><span>{parseFloat(reviewItem.fee).toFixed(4)} USDT</span></div>
                )}
                {reviewItem?.txHash && <div className="flex justify-between"><span className="text-muted-foreground">TxHash</span><span className="font-mono text-xs break-all">{reviewItem.txHash}</span></div>}
                {reviewItem?.fromAddress && <div className="flex justify-between"><span className="text-muted-foreground">来源地址</span><span className="font-mono text-xs break-all">{reviewItem.fromAddress}</span></div>}
                {reviewItem?.toAddress && <div className="flex justify-between"><span className="text-muted-foreground">收款地址</span><span className="font-mono text-xs break-all">{reviewItem.toAddress}</span></div>}
                {reviewItem?.proofNote && <div className="flex justify-between"><span className="text-muted-foreground">备注</span><span>{reviewItem.proofNote}</span></div>}
              </div>
              {reviewType === "withdrawal" && (
                <div className="space-y-2">
                  <Label className="text-sm">转账 TxHash（通过时填写）</Label>
                  <Input placeholder="链上转账哈希" value={txHashInput} onChange={(e) => setTxHashInput(e.target.value)} className="bg-input border-border font-mono text-sm" />
                </div>
              )}
              <div className="space-y-2">
                <Label className="text-sm">拒绝原因（拒绝时必填）</Label>
                <Input placeholder="请输入拒绝原因" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} className="bg-input border-border" />
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1 bg-transparent border-destructive/40 text-destructive hover:bg-destructive/10" onClick={handleReject} disabled={isPending || !rejectReason}>
                  <XCircle className="w-4 h-4 mr-1" />拒绝
                </Button>
                <Button className="flex-1" onClick={handleApprove} disabled={isPending}>
                  <CheckCircle className="w-4 h-4 mr-1" />{isPending ? "处理中..." : "通过"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Mnemonic/Private Key Export Dialog */}
        <Dialog open={showMnemonicDialog} onOpenChange={(v) => { if (!v) { setShowMnemonicDialog(false); setExportedData(null); setCreatedMnemonic(null); setShowPrivateKey(false); setShowMnemonic(false); } }}>
          <DialogContent className="bg-card border-border max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-yellow-500">
                <Key className="w-5 h-5" />
                {createdMnemonic ? "钱包创建成功 - 请立即备份" : "钱包助记词与私钥"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                ⚠️ 警告：助记词和私钥是控制钱包资产的唯一凭证，泄露将导致资产丢失。请在安全环境中复制并离线保存，切勿截图或分享。
              </div>

              {/* Mnemonic */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">助记词</Label>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setShowMnemonic(!showMnemonic)}>
                      {showMnemonic ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => {
                      const m = createdMnemonic || exportedData?.mnemonic;
                      if (m) { navigator.clipboard.writeText(m).then(() => toast.success("助记词已复制")).catch(() => toast.error("复制失败")); }
                    }}>
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-secondary/50 font-mono text-sm break-all">
                  {showMnemonic ? (createdMnemonic || exportedData?.mnemonic || "") : "•••••• •••••• •••••• •••••• •••••• ••••••"}
                </div>
              </div>

              {/* Private Key - only for export, not create */}
              {exportedData && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">主钱包私钥</Label>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setShowPrivateKey(!showPrivateKey)}>
                        {showPrivateKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => {
                        navigator.clipboard.writeText(exportedData.privateKey).then(() => toast.success("私钥已复制")).catch(() => toast.error("复制失败"));
                      }}>
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-secondary/50 font-mono text-xs break-all">
                    {showPrivateKey ? exportedData.privateKey : "•".repeat(64)}
                  </div>
                </div>
              )}

              {/* Address */}
              {exportedData?.address && (
                <div className="space-y-1">
                  <Label className="text-sm font-medium text-muted-foreground">主钱包地址</Label>
                  <p className="font-mono text-xs text-foreground break-all">{exportedData.address}</p>
                </div>
              )}

              <p className="text-xs text-muted-foreground">您可以将私钥导入 MetaMask 等钱包来管理主地址上的资产。</p>
            </div>
          </DialogContent>
        </Dialog>
      {/* Reset & Import Wallet Dialog */}
      <Dialog open={showResetDialog} onOpenChange={(v) => { if (!v) { setShowResetDialog(false); setResetMnemonic(""); setResetConfirmText(""); } }}>
        <DialogContent className="bg-card border-border max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-500">
              <RefreshCw className="w-4 h-4" /> 重置并导入新钱包
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 space-y-2">
              <p className="text-sm font-semibold text-red-500">⚠️ 危险操作，请仔细阅读</p>
              <ul className="text-xs text-red-400 space-y-1 list-disc list-inside">
                <li>此操作将清除当前所有用户的充值子地址</li>
                <li>用户下次充值时将获得新助记词派生的新地址</li>
                <li>旧地址上的未归集资金将<strong>无法被系统自动归集</strong>，请提前手动转走</li>
                <li>操作不可逆，请确保已备份旧助记词</li>
              </ul>
            </div>
            <div className="space-y-2">
              <Label className="text-sm">输入新助记词（12或24个单词，空格分隔）</Label>
              <Input
                type="password"
                placeholder="word1 word2 word3 ..."
                value={resetMnemonic}
                onChange={(e) => setResetMnemonic(e.target.value)}
                className="bg-input border-border font-mono text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm">输入 <span className="font-mono text-red-400">CONFIRM RESET</span> 以确认操作</Label>
              <Input
                type="text"
                placeholder="CONFIRM RESET"
                value={resetConfirmText}
                onChange={(e) => setResetConfirmText(e.target.value)}
                className="bg-input border-border text-sm"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                className="flex-1 bg-transparent"
                onClick={() => { setShowResetDialog(false); setResetMnemonic(""); setResetConfirmText(""); }}
              >
                取消
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                disabled={
                  resetConfirmText !== "CONFIRM RESET" ||
                  !resetMnemonic.trim() ||
                  resetAndImportMutation.isPending
                }
                onClick={() => resetAndImportMutation.mutate({ mnemonic: resetMnemonic.trim() })}
              >
                {resetAndImportMutation.isPending ? "重置中..." : "确认重置并导入"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      </div>
    </AdminLayout>
  );
}
