import type { Activity, Contact, CrmState, CrmTask, Deal, DemoUser, Distributor, EmailMessage, Lead, Organization, Product } from "@/types/crm";

const isoDaysAgo = (days: number, hour = 10) => {
  const date = new Date();
  date.setHours(hour, 20, 0, 0);
  date.setDate(date.getDate() - days);
  return date.toISOString();
};

const isoDaysAhead = (days: number) => {
  const date = new Date();
  date.setHours(18, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date.toISOString();
};

const distributors: Distributor[] = [
  { id: "dist-hq", name: "Kivisense HQ", code: "HQ", country: "Global", region: "Global", status: "ACTIVE" },
  { id: "dist-cn", name: "Shanghai Partner", code: "CN-SH", country: "China", region: "Shanghai", status: "ACTIVE" },
  { id: "dist-sg", name: "Singapore Partner", code: "SG", country: "Singapore", region: "Southeast Asia", status: "ACTIVE" },
  { id: "dist-kr", name: "Korea Partner", code: "KR", country: "Korea", region: "Seoul", status: "ACTIVE" },
  { id: "dist-jp", name: "Japan Partner", code: "JP", country: "Japan", region: "Tokyo", status: "ACTIVE" },
];

const users: DemoUser[] = [
  { id: "user-ryan", name: "Ryan", email: "ryan@kivisense.com", role: "HQ_ADMIN", distributorId: "dist-hq", title: "Kivisense Super Admin", avatarColor: "green" },
  { id: "user-mia", name: "Mia", email: "mia@kivisense.com", role: "HQ_ADMIN", distributorId: "dist-hq", title: "Channel Operations", avatarColor: "blue" },
  { id: "user-jason", name: "Jason", email: "jason@shanghai-partner.com", role: "DISTRIBUTOR_MANAGER", distributorId: "dist-cn", title: "Distributor Manager", avatarColor: "amber" },
  { id: "user-lina", name: "Lina", email: "lina@shanghai-partner.com", role: "DISTRIBUTOR_SALES", distributorId: "dist-cn", title: "Distributor Sales", avatarColor: "pink" },
  { id: "user-emma", name: "Emma", email: "emma@singapore-partner.com", role: "DISTRIBUTOR_MANAGER", distributorId: "dist-sg", title: "Distributor Manager", avatarColor: "cyan" },
  { id: "user-noah", name: "Noah", email: "noah@singapore-partner.com", role: "DISTRIBUTOR_SALES", distributorId: "dist-sg", title: "Distributor Sales", avatarColor: "violet" },
  { id: "user-minjun", name: "Min-jun", email: "minjun@korea-partner.com", role: "DISTRIBUTOR_MANAGER", distributorId: "dist-kr", title: "Distributor Manager", avatarColor: "red" },
  { id: "user-soyeon", name: "So-yeon", email: "soyeon@korea-partner.com", role: "DISTRIBUTOR_SALES", distributorId: "dist-kr", title: "Distributor Sales", avatarColor: "grey" },
  { id: "user-haruto", name: "Haruto", email: "haruto@japan-partner.com", role: "DISTRIBUTOR_MANAGER", distributorId: "dist-jp", title: "Distributor Manager", avatarColor: "light-blue" },
  { id: "user-aoi", name: "Aoi", email: "aoi@japan-partner.com", role: "DISTRIBUTOR_SALES", distributorId: "dist-jp", title: "Distributor Sales", avatarColor: "lime" },
];

const capabilityNames = ["Image AR", "World AR", "Face AR", "Body AR", "Landmark AR", "Cloud Recognition", "WebAR Domain", "AI Capabilities"];
const capabilities = capabilityNames.map((name, index) => ({ id: `cap-${index + 1}`, name, description: `${name} product capability`, enabled: true }));
const products: Product[] = [
  { id: "product-kivicube", name: "Kivicube", description: "Enterprise WebAR creation and publishing platform.", status: "ACTIVE", capabilities },
  { id: "product-kiviview", name: "Kiviview", description: "High-fidelity 3D product visualization for commerce.", status: "ACTIVE", capabilities: capabilities.filter((_, index) => [0, 1, 5, 6].includes(index)) },
  { id: "product-kivistudio", name: "KiviStudio", description: "AI-assisted spatial content production workspace.", status: "ACTIVE", capabilities: capabilities.filter((_, index) => [2, 3, 4, 7].includes(index)) },
];

const companySeeds = [
  ["Nike China", "Sportswear", "China"], ["Samsung Electronics", "Consumer Electronics", "Korea"], ["L'Oréal APAC", "Beauty", "Singapore"],
  ["BMW China", "Automotive", "China"], ["Shiseido", "Beauty", "Japan"], ["LEGO Asia", "Toys", "Singapore"],
  ["Hyundai", "Automotive", "Korea"], ["Uniqlo", "Fashion", "Japan"], ["Starbucks China", "Retail", "China"],
  ["Decathlon APAC", "Sports Retail", "Singapore"], ["Sony Interactive", "Entertainment", "Japan"], ["Amorepacific", "Beauty", "Korea"],
] as const;
const distributorCycle = ["dist-cn", "dist-kr", "dist-sg", "dist-cn", "dist-jp", "dist-sg", "dist-kr", "dist-jp", "dist-cn", "dist-sg", "dist-jp", "dist-kr"];
const ownerByDistributor: Record<string, string[]> = {
  "dist-cn": ["user-jason", "user-lina"], "dist-sg": ["user-emma", "user-noah"], "dist-kr": ["user-minjun", "user-soyeon"], "dist-jp": ["user-haruto", "user-aoi"],
};

const organizations: Organization[] = companySeeds.map(([name, industry, country], index) => {
  const distributorId = distributorCycle[index];
  return { id: `org-${index + 1}`, name, industry, country, distributorId, ownerId: ownerByDistributor[distributorId][index % 2], lastActivityAt: isoDaysAgo(index % 18) };
});

const firstNames = ["Bob", "Sofia", "Daniel", "Alicia", "Ethan", "Hana", "Leo", "Grace", "Lucas", "Yuna", "Oliver", "Mei", "Henry", "Chloe", "Kenji", "Nora", "Marcus", "Ava", "Jisoo", "Theo", "Mina", "Felix", "Iris", "Kai"];
const lastNames = ["Martinez", "Chen", "Kim", "Tan", "Li", "Sato", "Wang", "Lim", "Zhang", "Park", "Ito", "Lee"];
const contacts: Contact[] = firstNames.map((firstName, index) => {
  const organization = organizations[index % organizations.length];
  const name = `${firstName} ${lastNames[index % lastNames.length]}`;
  return {
    id: `contact-${index + 1}`, name, organizationId: organization.id, jobTitle: ["Marketing Director", "Innovation Lead", "Digital Commerce Manager", "Product Manager"][index % 4],
    email: `${firstName.toLowerCase()}.${lastNames[index % lastNames.length].toLowerCase()}@example.com`, phone: `+${index % 3 === 0 ? "86" : index % 3 === 1 ? "65" : "81"} 138 0000 ${String(1000 + index)}`,
    linkedin: `linkedin.com/in/${firstName.toLowerCase()}-${index + 1}`, whatsapp: `+65 9000 ${String(1000 + index)}`, wechat: `kivi_${firstName.toLowerCase()}${index + 1}`,
    country: organization.country, ownerId: organization.ownerId, distributorId: organization.distributorId, lastActivityAt: isoDaysAgo(index % 21),
  };
});

const leadStatuses: Lead["status"][] = ["NEW", "CONTACTED", "NURTURING", "QUALIFIED", "CONVERTED", "UNQUALIFIED"];
const sources = ["Website", "Referral", "Exhibition", "LinkedIn", "Partner", "Outbound"];
const interestSets = [["Image AR", "Cloud Recognition"], ["World AR", "WebAR Domain"], ["Body AR", "AI Capabilities"], ["Face AR", "Landmark AR"]];
const leads: Lead[] = Array.from({ length: 36 }, (_, index) => {
  const contact = contacts[index % contacts.length];
  const organization = organizations.find((item) => item.id === contact.organizationId)!;
  return {
    id: `lead-${index + 1}`, name: index === 0 ? "China AR Campaign Inquiry" : `${organization.name} ${interestSets[index % interestSets.length][0]} Inquiry ${index + 1}`,
    organizationId: organization.id, contactId: contact.id, productInterest: interestSets[index % interestSets.length], status: leadStatuses[index % leadStatuses.length],
    ownerId: contact.ownerId, distributorId: contact.distributorId, source: sources[index % sources.length], createdAt: isoDaysAgo(index % 42, 9), lastActivityAt: isoDaysAgo(index % 17, 14),
    ...(index % leadStatuses.length === 4 ? { convertedDealId: `deal-${(index % 24) + 1}` } : {}),
  };
});

const dealStages: Deal["stage"][] = ["DISCOVERY", "SOLUTION", "QUOTATION", "NEGOTIATION", "WON", "LOST"];
const deals: Deal[] = Array.from({ length: 24 }, (_, index) => {
  const organization = organizations[index % organizations.length];
  const contact = contacts.find((item) => item.organizationId === organization.id)!;
  const product = products[index % products.length];
  return {
    id: `deal-${index + 1}`, name: index === 0 ? "Nike China - AR Campaign" : `${organization.name} - ${product.name} Program ${index + 1}`,
    organizationId: organization.id, primaryContactId: contact.id, productId: product.id, capabilityIds: product.capabilities.slice(0, 2 + (index % 3)).map((item) => item.id),
    stage: dealStages[index % dealStages.length], ownerId: organization.ownerId, distributorId: organization.distributorId, expectedClose: isoDaysAhead(7 + index * 3),
    probability: [20, 40, 60, 75, 100, 0][index % 6], sourceLeadId: `lead-${(index % 36) + 1}`, createdAt: isoDaysAgo((index * 2) % 60), lastActivityAt: isoDaysAgo(index % 14, 15),
  };
});

const activities: Activity[] = [
  ...leads.flatMap((lead, index) => [
    { id: `activity-lead-${index + 1}-1`, entityType: "LEAD" as const, entityId: lead.id, type: "SYSTEM" as const, actorId: lead.ownerId, title: "Lead created", detail: `${lead.source} · ${lead.productInterest.join(" · ")}`, createdAt: lead.createdAt },
    { id: `activity-lead-${index + 1}-2`, entityType: "LEAD" as const, entityId: lead.id, type: "CALL" as const, actorId: lead.ownerId, title: "Call logged", detail: "Discussed product fit and the next demo step.", createdAt: lead.lastActivityAt },
  ]),
  ...deals.flatMap((deal, index) => [
    { id: `activity-deal-${index + 1}-1`, entityType: "DEAL" as const, entityId: deal.id, type: "SYSTEM" as const, actorId: deal.ownerId, title: "Deal created", detail: "Converted from a qualified Lead.", createdAt: deal.createdAt },
    { id: `activity-deal-${index + 1}-2`, entityType: "DEAL" as const, entityId: deal.id, type: "STAGE_CHANGE" as const, actorId: deal.ownerId, title: "Stage changed", detail: `Moved to ${deal.stage.toLowerCase()}.`, createdAt: deal.lastActivityAt },
  ]),
];

const emails: EmailMessage[] = leads.slice(0, 12).map((lead, index) => {
  const contact = contacts.find((item) => item.id === lead.contactId)!;
  return { id: `email-${index + 1}`, entityType: "LEAD", entityId: lead.id, threadId: `thread-${lead.id}`, from: contact.email, to: [users.find((item) => item.id === lead.ownerId)!.email], cc: [], bcc: [], subject: `Re: ${lead.name}`, body: "Hi, thanks for following up. We would like to see a focused product demo next week.", attachmentNames: [], sentAt: isoDaysAgo(index % 10, 11) };
});

const tasks: CrmTask[] = Array.from({ length: 18 }, (_, index) => {
  const lead = leads[index % leads.length];
  return { id: `task-${index + 1}`, title: ["Prepare product demo", "Confirm stakeholders", "Share technical checklist", "Schedule discovery call"][index % 4], relationType: index % 3 === 0 ? "DEAL" : "LEAD", relationId: index % 3 === 0 ? deals[index % deals.length].id : lead.id, ownerId: lead.ownerId, distributorId: lead.distributorId, dueAt: isoDaysAhead((index % 9) - 2), priority: index % 5 === 0 ? "HIGH" : "MEDIUM", status: index % 7 === 0 ? "DONE" : "OPEN", description: "Keep the next action clear and reviewable." };
});

export function createDemoState(): CrmState {
  return {
    version: 1,
    currentUserId: "user-ryan",
    distributors: structuredClone(distributors), users: structuredClone(users), products: structuredClone(products), organizations: structuredClone(organizations), contacts: structuredClone(contacts),
    leads: structuredClone(leads), deals: structuredClone(deals), activities: structuredClone(activities), emails: structuredClone(emails), comments: [], calls: [], tasks: structuredClone(tasks), notes: [], attachments: [],
  };
}
