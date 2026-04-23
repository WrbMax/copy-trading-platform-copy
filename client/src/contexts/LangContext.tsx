/**
 * LangContext — Lightweight i18n for AlphaRoute
 * Supports: zh (Simplified Chinese) | en (English)
 * Persists selection to localStorage.
 */
import React, { createContext, useContext, useState } from "react";

export type Lang = "zh" | "en";

// ─── Translation dictionary ───────────────────────────────────────────────────
const translations = {
  zh: {
    // Nav labels
    nav_home: "首页",
    nav_strategy: "策略中心",
    nav_orders: "订单记录",
    nav_earnings: "我的收益",
    nav_team: "系统收益",
    nav_funds: "充值提现",
    nav_points: "Route 中心",
    nav_api: "API绑定",
    nav_invite: "邀请好友",
    nav_admin: "后台管理",
    nav_back_user: "返回用户端",
    // Admin nav
    admin_dashboard: "仪表盘",
    admin_users: "用户管理",
    admin_signals: "信号源管理",
    admin_orders: "订单监控",
    admin_funds: "资金管理",
    admin_points: "Route 管理",
    admin_revenue: "收益分成",
    // Brand
    brand_tagline: "专业 AI 策略平台",
    admin_panel_title: "总后台管理",
    admin_panel_subtitle: "Admin Panel",
    // Auth
    sign_out: "退出登录",
    sign_in: "登录",
    // Mobile header
    menu: "菜单",
    // Lang toggle
    lang_zh: "中文",
    lang_en: "EN",
  },
  en: {
    // Nav labels
    nav_home: "Home",
    nav_strategy: "Strategy",
    nav_orders: "Orders",
    nav_earnings: "Earnings",
    nav_team: "Team Rewards",
    nav_funds: "Deposit / Withdraw",
    nav_points: "Route Center",
    nav_api: "API Settings",
    nav_invite: "Invite Friends",
    nav_admin: "Admin Panel",
    nav_back_user: "Back to User",
    // Admin nav
    admin_dashboard: "Dashboard",
    admin_users: "Users",
    admin_signals: "Signal Sources",
    admin_orders: "Order Monitor",
    admin_funds: "Fund Management",
    admin_points: "Route Management",
    admin_revenue: "Revenue Share",
    // Brand
    brand_tagline: "Professional AI Strategy",
    admin_panel_title: "Admin Console",
    admin_panel_subtitle: "Management Panel",
    // Auth
    sign_out: "Sign Out",
    sign_in: "Sign In",
    // Mobile header
    menu: "Menu",
    // Lang toggle
    lang_zh: "中文",
    lang_en: "EN",
  },
} as const;

export type TranslationKey = keyof typeof translations.zh;

// ─── Context ──────────────────────────────────────────────────────────────────
interface LangContextType {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: TranslationKey) => string;
}

const LangContext = createContext<LangContextType | undefined>(undefined);

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const stored = localStorage.getItem("ar-lang");
    if (stored === "zh" || stored === "en") return stored;
    // Auto-detect browser language
    const browserLang = navigator.language?.toLowerCase();
    return browserLang?.startsWith("zh") ? "zh" : "en";
  });

  const setLang = (newLang: Lang) => {
    setLangState(newLang);
    localStorage.setItem("ar-lang", newLang);
  };

  const t = (key: TranslationKey): string => {
    return translations[lang][key] ?? translations.en[key] ?? key;
  };

  return (
    <LangContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLang must be used within LangProvider");
  return ctx;
}
