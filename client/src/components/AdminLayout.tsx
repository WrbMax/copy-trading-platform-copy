import { useAuth } from "@/_core/hooks/useAuth";
import {
  BarChart3,
  ChevronDown,
  Coins,
  CreditCard,
  Globe,
  LayoutDashboard,
  LineChart,
  ListOrdered,
  LogOut,
  Menu,
  Settings,
  Shield,
  TrendingUp,
  Users,
  X,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AlphaRouteBrand } from "@/components/AlphaRouteLogo";
import { useLang } from "@/contexts/LangContext";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { lang, setLang, t } = useLang();

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => { logout(); window.location.href = "/login"; },
  });

  const navItems = [
    { href: "/admin", icon: LayoutDashboard, label: t("admin_dashboard") },
    { href: "/admin/users", icon: Users, label: t("admin_users") },
    { href: "/admin/signals", icon: Zap, label: t("admin_signals") },
    { href: "/admin/orders", icon: ListOrdered, label: t("admin_orders") },
    { href: "/admin/funds", icon: CreditCard, label: t("admin_funds") },
    { href: "/admin/points", icon: Coins, label: t("admin_points") },
    { href: "/admin/revenue-share", icon: TrendingUp, label: t("admin_revenue") },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated || user?.role !== "admin") {
    window.location.href = "/login";
    return null;
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-60 bg-sidebar border-r border-sidebar-border transform transition-transform duration-300 lg:translate-x-0 flex flex-col ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Brand header — click to go to home */}
        <div className="h-16 flex-shrink-0 flex items-center px-4 border-b border-sidebar-border">
          <button
            type="button"
            onClick={() => { window.location.href = "/landing"; setMobileOpen(false); }}
            className="flex items-center gap-2.5 flex-1 min-w-0 focus:outline-none"
            aria-label="AlphaRoute - Go to home"
          >
            <AlphaRouteBrand
              logoSize={34}
              showSubtitle
              subtitle={t("admin_panel_subtitle")}
              className="pointer-events-none"
            />
          </button>
          <button
            className="ml-2 lg:hidden text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Admin badge */}
        <div className="flex-shrink-0 px-4 py-2.5 border-b border-sidebar-border/50">
          <div className="flex items-center gap-2 px-2">
            <Shield className="w-3.5 h-3.5 text-primary flex-shrink-0" />
            <span className="text-xs font-semibold text-primary tracking-wide uppercase">
              {t("admin_panel_title")}
            </span>
          </div>
        </div>

        {/* Nav items — scrollable */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
          {navItems.map((item) => {
            const active =
              location === item.href ||
              (item.href !== "/admin" && location.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent"
                }`}
                onClick={() => setMobileOpen(false)}
              >
                <item.icon className="w-4 h-4 flex-shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Back to user site */}
        <div className="flex-shrink-0 px-3 pt-2 border-t border-sidebar-border">
          <Link
            href="/"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-sidebar-accent transition-colors"
            onClick={() => setMobileOpen(false)}
          >
            <LineChart className="w-4 h-4" />
            {t("nav_back_user")}
          </Link>
        </div>

        {/* Language switcher at bottom — mobile only; desktop uses top bar */}
        <div className="flex-shrink-0 lg:hidden px-3 py-4 border-t border-sidebar-border">
          <div className="flex items-center gap-1 px-3 py-2 rounded-lg bg-sidebar-accent/50">
            <Globe className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <span className="text-xs text-muted-foreground flex-1">
              {lang === "zh" ? "语言" : "Language"}
            </span>
            <button
              onClick={() => setLang("zh")}
              className={`text-xs px-2 py-0.5 rounded transition-colors ${
                lang === "zh"
                  ? "bg-primary text-primary-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              中文
            </button>
            <span className="text-muted-foreground/40 text-xs">|</span>
            <button
              onClick={() => setLang("en")}
              className={`text-xs px-2 py-0.5 rounded transition-colors ${
                lang === "en"
                  ? "bg-primary text-primary-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              EN
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ── Main content ────────────────────────────────────────────────────── */}
      <div className="flex-1 lg:ml-60 flex flex-col min-h-screen">
        {/* Top bar */}
        <header className="h-16 bg-card border-b border-border flex items-center px-4 gap-3 sticky top-0 z-30">
          {/* Mobile menu trigger */}
          <button
            className="lg:hidden text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Mobile: brand in top bar */}
          <div className="lg:hidden">
            <button type="button" onClick={() => { window.location.href = "/landing"; }} aria-label="AlphaRoute - Go to home">
              <AlphaRouteBrand logoSize={28} className="pointer-events-none" />
            </button>
          </div>

          {/* Desktop: admin indicator */}
          <div className="hidden lg:flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-muted-foreground">
              {t("admin_panel_title")}
            </span>
          </div>

          <div className="flex-1" />

          {/* Language toggle (top bar, desktop) */}
          <div className="hidden lg:flex items-center gap-1 border border-border rounded-lg px-2 py-1">
            <Globe className="w-3.5 h-3.5 text-muted-foreground" />
            <button
              onClick={() => setLang("zh")}
              className={`text-xs px-1.5 py-0.5 rounded transition-colors ${
                lang === "zh"
                  ? "text-primary font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              中文
            </button>
            <span className="text-muted-foreground/40 text-xs">|</span>
            <button
              onClick={() => setLang("en")}
              className={`text-xs px-1.5 py-0.5 rounded transition-colors ${
                lang === "en"
                  ? "text-primary font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              EN
            </button>
          </div>

          {/* User dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="flex items-center gap-2 h-9 px-2">
                <div className="w-7 h-7 bg-primary/20 rounded-full flex items-center justify-center text-primary text-xs font-bold">
                  {(user?.name || "A").charAt(0).toUpperCase()}
                </div>
                <span className="text-sm hidden sm:block max-w-[100px] truncate">
                  {user?.name}
                </span>
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem
                onClick={() => logoutMutation.mutate()}
                className="text-destructive focus:text-destructive"
              >
                <LogOut className="w-4 h-4 mr-2" />
                {t("sign_out")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
