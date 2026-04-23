/**
 * 统一的北京时间（UTC+8）格式化工具函数
 */

const TZ = "Asia/Shanghai";

/** 完整日期时间：2024-01-15 14:30 */
export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return "-";
  return new Date(d).toLocaleString("zh-CN", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** 短日期时间（省略年份）：01-15 14:30 */
export function formatShortDateTime(d: Date | string | null | undefined): string {
  if (!d) return "-";
  return new Date(d).toLocaleString("zh-CN", {
    timeZone: TZ,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** 仅日期：2024-01-15 */
export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("zh-CN", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}
