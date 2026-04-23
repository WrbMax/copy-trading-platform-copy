import { useAuth } from "@/_core/hooks/useAuth";
import {
  ChevronDown,
  Coins,
  CreditCard,
  Gift,
  Globe,
  LayoutDashboard,
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

export default function UserLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { lang, setLang, t } = useLang();

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => { logout(); window.location.href = "/login"; },
  });

  const navItems = [
    { href: "/", icon: LayoutDashboard, label: t("nav_home") },
    { href: "/strategy", icon: Zap, label: t("nav_strategy") },
    { href: "/orders", icon: ListOrdered, label: t("nav_orders") },
    { href: "/earnings", icon: TrendingUp, label: t("nav_earnings") },
    { href: "/team", icon: Users, label: t("nav_team") },
    { href: "/funds", icon: CreditCard, label: t("nav_funds") },
    { href: "/points", icon: Coins, label: t("nav_points") },
    { href: "/exchange-api", icon: Settings, label: t("nav_api") },
    { href: "/invite", icon: Gift, label: t("nav_invite") },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    window.location.href = "/login";
    return null;
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-sidebar border-r border-sidebar-border transform transition-transform duration-300 lg:translate-x-0 flex flex-col ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Brand header */}
        <div className="h-16 flex-shrink-0 flex items-center px-4 border-b border-sidebar-border">
          <AlphaRouteBrand
            logoSize={36}
            showSubtitle
            subtitle={t("brand_tagline")}
            onClick={() => { window.location.href = "/landing"; setMobileOpen(false); }}
            className="flex-1 min-w-0"
          />
          <button
            className="ml-2 lg:hidden text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nav items — scrollable */}
        <nav className="flex-1 overflow-y-auto p-4 space-y-0.5">
          {navItems.map((item) => {
            const active =
              location === item.href ||
              (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
                onClick={() => setMobileOpen(false)}
              >
                <item.icon className="w-4 h-4 flex-shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Admin link */}
        {user?.role === "admin" && (
          <div className="px-4 pt-2 border-t border-sidebar-border">
            <Link
              href="/admin"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-primary hover:bg-sidebar-accent transition-colors"
              onClick={() => setMobileOpen(false)}
            >
              <Shield className="w-4 h-4" />
              {t("nav_admin")}
            </Link>
          </div>
        )}

        {/* Language switcher at bottom of sidebar — mobile only; desktop uses top bar */}
        <div className="flex-shrink-0 lg:hidden px-4 py-4 border-t border-sidebar-border">
          <div className="flex items-center gap-1 px-3 py-2 rounded-lg bg-sidebar-accent/50">
            <Globe className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <span className="text-xs text-muted-foreground flex-1">
              {lang === "zh" ? "语言 / Language" : "Language / 语言"}
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
      <div className="flex-1 lg:ml-64 flex flex-col min-h-screen">
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

          {/* Mobile: brand logo in top bar */}
          <div className="lg:hidden">
            <AlphaRouteBrand
              logoSize={30}
              onClick={() => { window.location.href = "/landing"; }}
            />
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
                  {(user?.name || user?.email || "U").charAt(0).toUpperCase()}
                </div>
                <span className="text-sm hidden sm:block max-w-[120px] truncate">
                  {user?.name || user?.email}
                </span>
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem asChild>
                <Link href="/exchange-api" className="flex items-center gap-2 w-full">
                  <Settings className="w-4 h-4" />
                  {t("nav_api")}
                </Link>
              </DropdownMenuItem>
              {user?.role === "admin" && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/admin" className="flex items-center gap-2 w-full text-primary">
                      <Shield className="w-4 h-4" />
                      {t("nav_admin")}
                    </Link>
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
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
