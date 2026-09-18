const readableDate = (value: string | undefined, options: Intl.DateTimeFormatOptions) => {
  if (typeof value !== "string" || !value) return "—";
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? new Intl.DateTimeFormat("zh-CN", options).format(parsed) : "—";
};
export const date = (value?: string) => readableDate(value, { month: "short", day: "numeric", year: "numeric" });
export const dateTime = (value?: string) => readableDate(value, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
export const initials = (name: string) => name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
export const navigate = (route: string) => { window.location.hash = route; };
export const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
