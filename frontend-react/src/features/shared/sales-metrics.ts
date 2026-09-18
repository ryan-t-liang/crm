import type { Deal, DemoUser, Lead } from "@/types/crm";

export const openStages = ["DISCOVERY", "SOLUTION", "QUOTATION", "NEGOTIATION"];
export type DealOutcome = "OPEN" | "WON" | "LOST" | "UNKNOWN";

/** Read scope is applied before any cohort, aggregation or relationship validation. */
export function authorizedSales<T extends { distributorId: string }>(rows: T[], actor: DemoUser): T[] {
  if (actor.role === "HQ_ADMIN") return rows;
  if (!["DISTRIBUTOR_MANAGER", "DISTRIBUTOR_SALES", "VIEWER"].includes(actor.role)) return [];
  return rows.filter((row) => row.distributorId === actor.distributorId);
}

/** Both directions must be present and unique across the complete authorized dataset. */
export function confirmedLeadConversion(lead: Lead, deals: Deal[], allVisibleLeads: Lead[], allVisibleDeals = deals): boolean {
  if (lead.status !== "CONVERTED" || !lead.convertedDealId) return false;
  const targets = deals.filter((deal) => deal.id === lead.convertedDealId);
  if (targets.length !== 1) return false;
  const deal = targets[0];
  const reverse = allVisibleDeals.filter((item) => item.sourceLeadId === lead.id);
  return deal.sourceLeadId === lead.id
    && deal.distributorId === lead.distributorId
    && allVisibleLeads.filter((item) => item.id === lead.id).length === 1
    && allVisibleLeads.filter((item) => item.convertedDealId === deal.id).length === 1
    && allVisibleDeals.filter((item) => item.id === deal.id).length === 1
    && reverse.length === 1 && reverse[0].id === deal.id;
}

export function confirmedConversions(leads: Lead[], deals: Deal[], allVisibleLeads = leads, allVisibleDeals = deals) {
  const confirmed: Lead[] = [], conflicts: Lead[] = [];
  for (const lead of leads) {
    if (confirmedLeadConversion(lead, deals, allVisibleLeads, allVisibleDeals)) confirmed.push(lead);
    else if (lead.status === "CONVERTED" || lead.convertedDealId || allVisibleDeals.some((deal) => deal.sourceLeadId === lead.id)) conflicts.push(lead);
  }
  return { confirmed, conflicts };
}

export function dealOutcome(deal: Pick<Deal, "stage">): DealOutcome {
  return openStages.includes(deal.stage) ? "OPEN" : deal.stage === "WON" || deal.stage === "LOST" ? deal.stage : "UNKNOWN";
}

export function ratio(numerator: number, denominator: number): string {
  return denominator > 0 ? `${Math.round(numerator / denominator * 100)}%` : "—";
}

export function winRate(deals: Array<Pick<Deal, "stage">>): string {
  const won = deals.filter((deal) => dealOutcome(deal) === "WON").length;
  const lost = deals.filter((deal) => dealOutcome(deal) === "LOST").length;
  return ratio(won, won + lost);
}
