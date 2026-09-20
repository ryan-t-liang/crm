export function isCoachPrototype() {
  return typeof window !== "undefined" && /\/mockup\/coach_2026ciie\/?$/i.test(window.location.pathname);
}
