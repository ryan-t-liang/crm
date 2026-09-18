import type { SowindBrandCode } from "@/types/member-operations";

// Display branding only: existing scope codes, relationships and stored records are unchanged.
export const brandLabels: Record<SowindBrandCode, string> = { gp: "Kivisense", un: "Kivisense" };
export const brandScopeLabels: Record<SowindBrandCode, string> = { gp: "Kivisense · gp", un: "Kivisense · un" };
