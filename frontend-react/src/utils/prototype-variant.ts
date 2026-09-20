export function isCoachPrototype() {
  return typeof window !== "undefined" && /\/mockup\/coach_2026ciie\/?$/i.test(window.location.pathname);
}

export const COACH_BRAND_LABEL = "Coach";
export const COACH_EVENT_LOCATION = "COACH会展活动区 - 皮牌压印区域";

export function prototypeBrandLabel(fallback: string) {
  return isCoachPrototype() ? COACH_BRAND_LABEL : fallback;
}

export function prototypeLocationLabel(fallback?: string) {
  return isCoachPrototype() ? COACH_EVENT_LOCATION : fallback || "—";
}

export function prototypeMarketingCopy(value: string) {
  return isCoachPrototype() ? value.replace(/Kivisense/gi, COACH_BRAND_LABEL) : value;
}
