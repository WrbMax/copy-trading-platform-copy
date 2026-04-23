import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { AlphaRouteLogo } from "@/components/AlphaRouteLogo";
import {
  Brain,
  TrendingUp,
  Shield,
  Coins,
  ChevronRight,
  ArrowRight,
  Zap,
  BarChart3,
  Lock,
  Globe,
  Menu,
  X,
} from "lucide-react";

/* ─── i18n (standalone, no context dependency on landing page) ─── */
const i18n = {
  zh: {
    nav_features: "功能",
    nav_how: "如何运作",
    nav_stats: "数据",
    nav_login: "登录",
    nav_register: "免费注册",
    badge: "AI 驱动的智能策略平台",
    hero_title_1: "让 AI 策略",
    hero_title_2: "为你创造价值",
    hero_desc: "AlphaRoute 通过先进的 AI 算法实时分析市场，自动执行精准策略。每一笔交易都经过严格的风险控制，让你的资产在智能守护下稳健增长。",
    cta_start: "立即开始",
    cta_more: "了解更多",
    trust_1: "BSC 链 USDT 结算",
    trust_2: "资金安全保障",
    trust_3: "全球 7×24 运行",
    stats: [
      { label: "策略胜率", suffix: "%", desc: "历史平均胜率" },
      { label: "注册用户", suffix: "+", desc: "活跃交易用户" },
      { label: "累计订单", suffix: "+", desc: "AI 执行订单数" },
      { label: "平均月化", suffix: "%", desc: "策略平均月化收益" },
    ],
    features_label: "核心功能",
    features_title: "为什么选择 AlphaRoute",
    features_desc: "我们将前沿 AI 技术与严格的风险管理融为一体，为每位用户提供专业级的策略体验。",
    features: [
      { title: "AI 智能策略", desc: "深度学习模型实时分析多维度市场数据，自动识别高概率交易机会，策略持续进化迭代。" },
      { title: "精准风险控制", desc: "每笔交易均设置动态止损止盈，仓位管理严格遵循凯利公式，最大回撤全程可控。" },
      { title: "Route 积分体系", desc: "每笔亏损订单平仓后自动发放 Route，可在用户间自由转让，构建平台价值共享生态。" },
      { title: "资金安全保障", desc: "HD 钱包为每位用户生成专属充值地址，AES-256-GCM 加密存储，资金全程链上透明。" },
    ],
    how_label: "如何运作",
    how_title_1: "三步开启",
    how_title_2: "AI 策略之旅",
    steps: [
      { title: "注册并充值", desc: "使用邮箱注册账户，通过专属 BSC 链 USDT 地址完成充值，资金实时到账。" },
      { title: "绑定交易所 API", desc: "将您的交易所 API Key 绑定到平台，系统仅具备交易权限，无法提取您的资产。" },
      { title: "开启 AI 策略", desc: "选择适合您的 AI 策略，设置跟单倍数，系统自动接收信号并在您的账户执行交易。" },
    ],
    mock_strategy: "AI 策略 BTC/ETH 双向",
    mock_running: "运行中 · 已跟单 387 笔",
    mock_stats: [
      { label: "本月盈利", value: "+8.4%" },
      { label: "胜率", value: "71%" },
      { label: "最大回撤", value: "-3.2%" },
    ],
    mock_orders: [
      { pair: "BTC/USDT", side: "做多", pnl: "+12.40", time: "刚刚" },
      { pair: "ETH/USDT", side: "做空", pnl: "+8.20", time: "2分钟前" },
      { pair: "BTC/USDT", side: "做多", pnl: "-3.10", time: "15分钟前" },
    ],
    mock_cta: "立即开启策略",
    cta_title: "准备好了吗？",
    cta_desc: "加入 AlphaRoute，让 AI 策略为你的资产保驾护航。\n注册即可体验完整功能，无隐藏费用。",
    cta_register: "免费注册",
    cta_login: "已有账户，去登录",
    footer_copy: "© 2026 AlphaRoute. All rights reserved. 投资有风险，交易需谨慎。",
    footer_login: "登录",
    footer_register: "注册",
    subtitle: "专业 AI 策略平台",
  },
  en: {
    nav_features: "Features",
    nav_how: "How It Works",
    nav_stats: "Stats",
    nav_login: "Sign In",
    nav_register: "Get Started",
    badge: "AI-Powered Strategy Platform",
    hero_title_1: "Let AI Strategies",
    hero_title_2: "Create Value for You",
    hero_desc: "AlphaRoute uses advanced AI algorithms to analyze markets in real time and execute precise strategies automatically. Every trade is backed by rigorous risk controls, growing your assets under intelligent protection.",
    cta_start: "Get Started",
    cta_more: "Learn More",
    trust_1: "BSC USDT Settlement",
    trust_2: "Fund Security Guarantee",
    trust_3: "Global 7×24 Operation",
    stats: [
      { label: "Win Rate", suffix: "%", desc: "Historical average" },
      { label: "Users", suffix: "+", desc: "Active traders" },
      { label: "Total Orders", suffix: "+", desc: "AI-executed trades" },
      { label: "Avg Monthly", suffix: "%", desc: "Strategy monthly return" },
    ],
    features_label: "Core Features",
    features_title: "Why Choose AlphaRoute",
    features_desc: "We integrate cutting-edge AI technology with rigorous risk management to deliver a professional-grade strategy experience for every user.",
    features: [
      { title: "AI Smart Strategy", desc: "Deep learning models analyze multi-dimensional market data in real time, automatically identifying high-probability trading opportunities." },
      { title: "Precise Risk Control", desc: "Dynamic stop-loss and take-profit for every trade. Position sizing follows Kelly Criterion strictly, keeping max drawdown fully controlled." },
      { title: "Route Points System", desc: "Route points are automatically issued after each losing trade closes, freely transferable between users, building a value-sharing ecosystem." },
      { title: "Fund Security", desc: "HD wallet generates a dedicated deposit address per user. AES-256-GCM encryption storage ensures full on-chain transparency." },
    ],
    how_label: "How It Works",
    how_title_1: "Three Steps to Start",
    how_title_2: "Your AI Strategy Journey",
    steps: [
      { title: "Register & Deposit", desc: "Sign up with your email and deposit via your dedicated BSC USDT address. Funds arrive in real time." },
      { title: "Bind Exchange API", desc: "Connect your exchange API Key to the platform. The system only has trading permissions — it cannot withdraw your assets." },
      { title: "Activate AI Strategy", desc: "Choose an AI strategy that fits you, set your copy multiplier, and the system automatically executes trades in your account." },
    ],
    mock_strategy: "AI Strategy BTC/ETH Dual",
    mock_running: "Running · 387 orders copied",
    mock_stats: [
      { label: "Monthly P&L", value: "+8.4%" },
      { label: "Win Rate", value: "71%" },
      { label: "Max Drawdown", value: "-3.2%" },
    ],
    mock_orders: [
      { pair: "BTC/USDT", side: "Long", pnl: "+12.40", time: "Just now" },
      { pair: "ETH/USDT", side: "Short", pnl: "+8.20", time: "2 min ago" },
      { pair: "BTC/USDT", side: "Long", pnl: "-3.10", time: "15 min ago" },
    ],
    mock_cta: "Activate Strategy Now",
    cta_title: "Ready to Start?",
    cta_desc: "Join AlphaRoute and let AI strategies protect and grow your assets.\nFull features available from day one — no hidden fees.",
    cta_register: "Sign Up Free",
    cta_login: "Already have an account",
    footer_copy: "© 2026 AlphaRoute. All rights reserved. Trading involves risk.",
    footer_login: "Sign In",
    footer_register: "Register",
    subtitle: "Professional AI Strategy",
  },
} as const;

type LandingLang = "zh" | "en";

/* ─── Animated Counter ─── */
function Counter({ to, suffix = "", duration = 2000 }: { to: number; suffix?: string; duration?: number }) {
  const [val, setVal] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          const start = performance.now();
          const tick = (now: number) => {
            const progress = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setVal(Math.floor(eased * to));
            if (progress < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
      },
      { threshold: 0.3 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [to, duration]);
  return <span ref={ref}>{val.toLocaleString()}{suffix}</span>;
}

/* ─── Feature Card ─── */
function FeatureCard({ icon: Icon, title, desc, accent }: { icon: React.ElementType; title: string; desc: string; accent: string }) {
  return (
    <div className="group relative p-6 rounded-2xl bg-[oklch(0.16_0.01_240)] border border-[oklch(0.25_0.01_240)] hover:border-[oklch(0.72_0.18_165)/50] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_0_30px_oklch(0.72_0.18_165/0.08)]">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${accent}`}>
        <Icon className="w-6 h-6" />
      </div>
      <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
      <p className="text-[oklch(0.55_0.01_240)] text-sm leading-relaxed">{desc}</p>
    </div>
  );
}

/* ─── Step Card ─── */
function StepCard({ num, title, desc }: { num: string; title: string; desc: string }) {
  return (
    <div className="flex gap-5">
      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[oklch(0.72_0.18_165)/15] border border-[oklch(0.72_0.18_165)/40] flex items-center justify-center text-[oklch(0.72_0.18_165)] font-bold text-sm">
        {num}
      </div>
      <div className="pt-1">
        <h4 className="font-semibold text-white mb-1">{title}</h4>
        <p className="text-[oklch(0.55_0.01_240)] text-sm leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

/* ─── Main Landing Page ─── */
export default function Landing() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [lang, setLang] = useState<LandingLang>(() => {
    const stored = localStorage.getItem("ar-lang");
    if (stored === "zh" || stored === "en") return stored;
    return navigator.language?.toLowerCase().startsWith("zh") ? "zh" : "en";
  });

  const t = i18n[lang];

  const switchLang = (l: LandingLang) => {
    setLang(l);
    localStorage.setItem("ar-lang", l);
  };

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const statsData = [
    { ...t.stats[0], value: 73 },
    { ...t.stats[1], value: 1200 },
    { ...t.stats[2], value: 58000 },
    { ...t.stats[3], value: 12 },
  ];

  const featureIcons = [Brain, BarChart3, Coins, Shield];
  const featureAccents = [
    "bg-[oklch(0.72_0.18_165)/12] text-[oklch(0.72_0.18_165)]",
    "bg-[oklch(0.65_0.20_200)/12] text-[oklch(0.65_0.20_200)]",
    "bg-[oklch(0.75_0.18_80)/12] text-[oklch(0.75_0.18_80)]",
    "bg-[oklch(0.60_0.22_25)/12] text-[oklch(0.60_0.22_25)]",
  ];

  return (
    <div className="min-h-screen bg-[oklch(0.12_0.01_240)] text-[oklch(0.92_0.01_240)] overflow-x-hidden">

      {/* ── Navbar ── */}
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled
            ? "bg-[oklch(0.12_0.01_240)/90] backdrop-blur-md border-b border-[oklch(0.25_0.01_240)]"
            : "bg-transparent"
        }`}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">

          {/* ── Brand Logo (click = scroll to top / stay on landing) ── */}
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="flex items-center gap-2.5 group focus:outline-none flex-shrink-0"
            aria-label="AlphaRoute - Back to top"
          >
            <AlphaRouteLogo size={34} className="flex-shrink-0 transition-transform group-hover:scale-105 duration-200" />
            <div className="flex flex-col items-start">
              <span className="font-bold text-[16px] leading-tight tracking-tight select-none">
                <span
                  style={{
                    background: "linear-gradient(135deg, #00e5b0 0%, #5fffd8 100%)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  }}
                >
                  Alpha
                </span>
                <span className="text-white">Route</span>
              </span>
              <span className="text-[10px] text-[oklch(0.55_0.01_240)] leading-none tracking-wide hidden sm:block">
                {t.subtitle}
              </span>
            </div>
          </button>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-6 text-sm text-[oklch(0.65_0.01_240)]">
            <a href="#features" className="hover:text-white transition-colors">{t.nav_features}</a>
            <a href="#how" className="hover:text-white transition-colors">{t.nav_how}</a>
            <a href="#stats" className="hover:text-white transition-colors">{t.nav_stats}</a>
          </nav>

          {/* Right: Lang + CTA */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Language toggle */}
            <div className="flex items-center gap-0.5 border border-[oklch(0.28_0.01_240)] rounded-lg px-1.5 py-1">
              <Globe className="w-3 h-3 text-[oklch(0.50_0.01_240)] mr-0.5" />
              <button
                onClick={() => switchLang("zh")}
                className={`text-xs px-1.5 py-0.5 rounded transition-colors ${
                  lang === "zh" ? "text-[oklch(0.72_0.18_165)] font-semibold" : "text-[oklch(0.50_0.01_240)] hover:text-white"
                }`}
              >
                中文
              </button>
              <span className="text-[oklch(0.30_0.01_240)] text-xs">|</span>
              <button
                onClick={() => switchLang("en")}
                className={`text-xs px-1.5 py-0.5 rounded transition-colors ${
                  lang === "en" ? "text-[oklch(0.72_0.18_165)] font-semibold" : "text-[oklch(0.50_0.01_240)] hover:text-white"
                }`}
              >
                EN
              </button>
            </div>

            {/* Desktop CTA */}
            <div className="hidden md:flex items-center gap-2">
              <Link href="/login">
                <Button variant="ghost" size="sm" className="text-[oklch(0.65_0.01_240)] hover:text-white h-8 px-3">
                  {t.nav_login}
                </Button>
              </Link>
              <Link href="/register">
                <Button size="sm" className="bg-[oklch(0.72_0.18_165)] text-[oklch(0.10_0.01_240)] hover:bg-[oklch(0.68_0.18_165)] font-semibold h-8 px-3">
                  {t.nav_register}
                </Button>
              </Link>
            </div>

            {/* Mobile menu toggle */}
            <button
              className="md:hidden text-[oklch(0.65_0.01_240)] p-1"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="Toggle menu"
            >
              {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {menuOpen && (
          <div className="md:hidden bg-[oklch(0.14_0.01_240)] border-t border-[oklch(0.22_0.01_240)] px-6 py-4 space-y-4">
            <a href="#features" className="block text-sm text-[oklch(0.65_0.01_240)] hover:text-white py-1" onClick={() => setMenuOpen(false)}>{t.nav_features}</a>
            <a href="#how" className="block text-sm text-[oklch(0.65_0.01_240)] hover:text-white py-1" onClick={() => setMenuOpen(false)}>{t.nav_how}</a>
            <a href="#stats" className="block text-sm text-[oklch(0.65_0.01_240)] hover:text-white py-1" onClick={() => setMenuOpen(false)}>{t.nav_stats}</a>
            <div className="flex gap-3 pt-2">
              <Link href="/login" className="flex-1">
                <Button variant="outline" size="sm" className="w-full border-[oklch(0.25_0.01_240)] text-[oklch(0.65_0.01_240)]">{t.nav_login}</Button>
              </Link>
              <Link href="/register" className="flex-1">
                <Button size="sm" className="w-full bg-[oklch(0.72_0.18_165)] text-[oklch(0.10_0.01_240)] font-semibold">{t.nav_register}</Button>
              </Link>
            </div>
          </div>
        )}
      </header>

      {/* ── Hero Section ── */}
      <section className="relative min-h-screen flex items-center justify-center px-4 sm:px-6 pt-16">
        {/* Background grid */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: `linear-gradient(oklch(0.72 0.18 165) 1px, transparent 1px), linear-gradient(90deg, oklch(0.72 0.18 165) 1px, transparent 1px)`,
            backgroundSize: "60px 60px",
          }}
        />
        {/* Glow orbs */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[oklch(0.72_0.18_165)/6] rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-1/3 right-1/4 w-80 h-80 bg-[oklch(0.65_0.20_200)/5] rounded-full blur-[100px] pointer-events-none" />

        <div className="relative max-w-4xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-[oklch(0.72_0.18_165)/30] bg-[oklch(0.72_0.18_165)/8] text-[oklch(0.72_0.18_165)] text-xs font-medium mb-8">
            <Zap className="w-3 h-3 flex-shrink-0" />
            {t.badge}
          </div>

          {/* Headline */}
          <h1 className="text-4xl sm:text-5xl md:text-7xl font-extrabold leading-tight tracking-tight mb-6">
            {t.hero_title_1}
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[oklch(0.72_0.18_165)] to-[oklch(0.65_0.20_200)]">
              {t.hero_title_2}
            </span>
          </h1>

          <p className="text-base sm:text-lg md:text-xl text-[oklch(0.55_0.01_240)] max-w-2xl mx-auto mb-10 leading-relaxed px-2">
            {t.hero_desc}
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/register">
              <Button
                size="lg"
                className="bg-[oklch(0.72_0.18_165)] text-[oklch(0.10_0.01_240)] hover:bg-[oklch(0.68_0.18_165)] font-bold px-8 h-12 text-base shadow-[0_0_30px_oklch(0.72_0.18_165/0.3)] w-full sm:w-auto"
              >
                {t.cta_start}
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
            <a href="#features" className="w-full sm:w-auto">
              <Button
                variant="outline"
                size="lg"
                className="border-[oklch(0.30_0.01_240)] text-[oklch(0.75_0.01_240)] hover:bg-[oklch(0.18_0.01_240)] h-12 px-8 text-base bg-transparent w-full"
              >
                {t.cta_more}
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </a>
          </div>

          {/* Trust badges */}
          <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 mt-12 text-xs text-[oklch(0.45_0.01_240)]">
            <div className="flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-[oklch(0.72_0.18_165)]" />
              {t.trust_1}
            </div>
            <div className="hidden sm:block w-px h-3 bg-[oklch(0.25_0.01_240)]" />
            <div className="flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-[oklch(0.72_0.18_165)]" />
              {t.trust_2}
            </div>
            <div className="hidden sm:block w-px h-3 bg-[oklch(0.25_0.01_240)]" />
            <div className="flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-[oklch(0.72_0.18_165)]" />
              {t.trust_3}
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats Section ── */}
      <section id="stats" className="py-16 sm:py-20 px-4 sm:px-6 border-y border-[oklch(0.20_0.01_240)]">
        <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8">
          {statsData.map((s) => (
            <div key={s.label} className="text-center">
              <p className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-b from-white to-[oklch(0.72_0.18_165)]">
                <Counter to={s.value} suffix={s.suffix} />
              </p>
              <p className="text-sm sm:text-base font-semibold text-white mt-1">{s.label}</p>
              <p className="text-xs text-[oklch(0.45_0.01_240)] mt-0.5">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features Section ── */}
      <section id="features" className="py-20 sm:py-24 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12 sm:mb-16">
            <p className="text-[oklch(0.72_0.18_165)] text-sm font-semibold uppercase tracking-widest mb-3">{t.features_label}</p>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white">{t.features_title}</h2>
            <p className="text-[oklch(0.55_0.01_240)] mt-4 max-w-xl mx-auto text-sm leading-relaxed px-2">
              {t.features_desc}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
            {t.features.map((f, i) => (
              <FeatureCard
                key={f.title}
                icon={featureIcons[i]}
                title={f.title}
                desc={f.desc}
                accent={featureAccents[i]}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section id="how" className="py-20 sm:py-24 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 sm:gap-16 items-center">
            {/* Left: Steps */}
            <div>
              <p className="text-[oklch(0.72_0.18_165)] text-sm font-semibold uppercase tracking-widest mb-3">{t.how_label}</p>
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-8 sm:mb-10">
                {t.how_title_1}
                <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-[oklch(0.72_0.18_165)] to-[oklch(0.65_0.20_200)]">
                  {t.how_title_2}
                </span>
              </h2>
              <div className="space-y-6 sm:space-y-8">
                {t.steps.map((step, i) => (
                  <StepCard key={step.title} num={`0${i + 1}`} title={step.title} desc={step.desc} />
                ))}
              </div>
            </div>

            {/* Right: Visual card */}
            <div className="relative mt-8 md:mt-0">
              <div className="absolute inset-0 bg-[oklch(0.72_0.18_165)/5] rounded-3xl blur-3xl" />
              <div className="relative rounded-2xl border border-[oklch(0.25_0.01_240)] bg-[oklch(0.14_0.01_240)] p-5 sm:p-6 space-y-4">
                {/* Mock strategy card */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-[oklch(0.72_0.18_165)/15] flex items-center justify-center flex-shrink-0">
                      <Brain className="w-5 h-5 text-[oklch(0.72_0.18_165)]" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{t.mock_strategy}</p>
                      <p className="text-xs text-[oklch(0.55_0.01_240)]">{t.mock_running}</p>
                    </div>
                  </div>
                  <div className="w-2 h-2 rounded-full bg-[oklch(0.72_0.18_165)] shadow-[0_0_8px_oklch(0.72_0.18_165)] flex-shrink-0" />
                </div>
                <div className="h-px bg-[oklch(0.22_0.01_240)]" />
                {/* Mock stats */}
                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                  {t.mock_stats.map((item) => (
                    <div key={item.label} className="text-center p-2 sm:p-3 rounded-xl bg-[oklch(0.18_0.01_240)]">
                      <p className={`text-base sm:text-lg font-bold ${
                        item.value.startsWith("+") ? "text-[oklch(0.72_0.18_165)]" :
                        item.value.startsWith("-") ? "text-[oklch(0.60_0.22_25)]" : "text-white"
                      }`}>{item.value}</p>
                      <p className="text-[10px] sm:text-xs text-[oklch(0.45_0.01_240)] mt-0.5 leading-tight">{item.label}</p>
                    </div>
                  ))}
                </div>
                {/* Mock order list */}
                <div className="space-y-2">
                  {t.mock_orders.map((order, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg bg-[oklch(0.18_0.01_240)]">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${
                          order.side === "做多" || order.side === "Long"
                            ? "bg-[oklch(0.72_0.18_165)/15] text-[oklch(0.72_0.18_165)]"
                            : "bg-[oklch(0.60_0.22_25)/15] text-[oklch(0.60_0.22_25)]"
                        }`}>{order.side}</span>
                        <span className="text-xs text-white font-medium">{order.pair}</span>
                      </div>
                      <div className="text-right">
                        <p className={`text-xs font-semibold ${order.pnl.startsWith("+") ? "text-[oklch(0.72_0.18_165)]" : "text-[oklch(0.60_0.22_25)]"}`}>
                          {order.pnl} USDT
                        </p>
                        <p className="text-[10px] text-[oklch(0.45_0.01_240)]">{order.time}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <Link href="/register">
                  <Button className="w-full bg-[oklch(0.72_0.18_165)] text-[oklch(0.10_0.01_240)] font-semibold hover:bg-[oklch(0.68_0.18_165)]">
                    {t.mock_cta}
                    <TrendingUp className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA Section ── */}
      <section className="py-20 sm:py-24 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto text-center">
          <div className="relative rounded-3xl border border-[oklch(0.72_0.18_165)/25] bg-gradient-to-b from-[oklch(0.16_0.01_240)] to-[oklch(0.14_0.01_240)] p-8 sm:p-12 overflow-hidden">
            <div className="absolute inset-0 bg-[oklch(0.72_0.18_165)/4] rounded-3xl" />
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-px bg-gradient-to-r from-transparent via-[oklch(0.72_0.18_165)/60] to-transparent" />
            <div className="relative">
              <div className="w-14 h-14 rounded-2xl bg-[oklch(0.72_0.18_165)/15] border border-[oklch(0.72_0.18_165)/30] flex items-center justify-center mx-auto mb-6">
                <Zap className="w-7 h-7 text-[oklch(0.72_0.18_165)]" />
              </div>
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-4">{t.cta_title}</h2>
              <p className="text-[oklch(0.55_0.01_240)] mb-8 leading-relaxed text-sm sm:text-base whitespace-pre-line">
                {t.cta_desc}
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link href="/register">
                  <Button
                    size="lg"
                    className="bg-[oklch(0.72_0.18_165)] text-[oklch(0.10_0.01_240)] hover:bg-[oklch(0.68_0.18_165)] font-bold px-8 sm:px-10 h-12 shadow-[0_0_40px_oklch(0.72_0.18_165/0.25)] w-full sm:w-auto"
                  >
                    {t.cta_register}
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
                <Link href="/login">
                  <Button
                    variant="outline"
                    size="lg"
                    className="border-[oklch(0.30_0.01_240)] text-[oklch(0.75_0.01_240)] hover:bg-[oklch(0.18_0.01_240)] h-12 px-8 bg-transparent w-full sm:w-auto"
                  >
                    {t.cta_login}
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-[oklch(0.20_0.01_240)] py-8 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Footer brand */}
          <div className="flex items-center gap-2.5">
            <AlphaRouteLogo size={24} />
            <span className="text-sm font-bold">
              <span
                style={{
                  background: "linear-gradient(135deg, #00e5b0 0%, #5fffd8 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >Alpha</span>
              <span className="text-white">Route</span>
            </span>
          </div>
          <p className="text-xs text-[oklch(0.40_0.01_240)] text-center">{t.footer_copy}</p>
          <div className="flex gap-5 text-xs text-[oklch(0.45_0.01_240)]">
            <Link href="/login" className="hover:text-white transition-colors">{t.footer_login}</Link>
            <Link href="/register" className="hover:text-white transition-colors">{t.footer_register}</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
