import type { SowindBrandCode } from "./member-operations";

// Frontend prototype contracts, NOT additional Sowind tables or backend fields.
export type MarketingStatus = "DRAFT" | "PUBLISHED" | "PAUSED" | "CANCELED";
export type ClaimMethod = "DIRECT" | "PICKUP" | "EXPERIENCE";
export interface MarketingSlot { id: string; label: string; startAt: string; endAt: string; location: string; capacity: number; bookingClosesAt: string; checkinStart: string; checkinEnd: string }
export interface MarketingPrize { id: string; name: string; description: string; image: string; method: ClaimMethod }
export interface MarketingPoolItem { id: string; prizeId: string; label: string; quota: number; probability: number; perPersonLimit: number; method: ClaimMethod; location: string; claimStart: string; claimEnd: string; instructions: string; slots: MarketingSlot[] }
export interface MarketingActivity {
  id: string; name: string; brand: SowindBrandCode; description: string; cover: string;
  mode: "ONLINE" | "OFFLINE"; location: string; status: MarketingStatus; ruleVersion: number;
  startAt: string; endAt: string; bookingEnabled: boolean; allowWalkIn: boolean;
  bookingStart: string; bookingEnd: string; completion: "CHECKIN" | "STAFF"; slots: MarketingSlot[];
  lotteryEnabled: boolean; lotteryStart: string; lotteryEnd: string; grantCount: number;
  drawLimit: number; dailyLimit: number | null; winLimit: number; noWinProbability: number;
  pool: MarketingPoolItem[]; createdAt: string; publishedAt?: string;
}
export interface MarketingIdentity { userId: string; brand: SowindBrandCode; openid: string | null; unionid: string | null }
export interface MarketingParticipation {
  id: string; activityId: string; subjectKey: string; identities: MarketingIdentity[];
  credential: string; registeredAt: string; checkedInAt?: string; completedAt?: string;
  completionActorId?: string; ruleVersion: number;
}
export interface MarketingBooking {
  id: string; activityId: string; participationId: string; kind: "ACTIVITY" | "PRIZE";
  awardId?: string; poolItemId?: string; slotId: string; status: "BOOKED" | "CHECKED_IN" | "CANCELED" | "NO_SHOW" | "FULFILLED";
  createdAt: string; canceledAt?: string;
}
export interface MarketingChance { id: string; participationId: string; activityId: string; count: number; grantedAt: string; ruleVersion: number }
export interface MarketingDraw { id: string; operationId: string; participationId: string; activityId: string; occurredAt: string; poolItemId: string | null; ruleVersion: number; randomValue: number }
export interface MarketingAward {
  id: string; drawId: string; participationId: string; activityId: string; poolItemId: string; credential: string;
  prizeName: string; method: ClaimMethod; location: string; instructions: string; claimStart: string; claimEnd: string;
  ruleVersion: number; wonAt: string; fulfilledAt?: string;
}
export interface MarketingAudit { id: string; activityId?: string; action: string; targetId: string; actorId: string; occurredAt: string; result: "SUCCESS" | "REJECTED"; detail: string }
export interface MarketingState {
  version: 1; revision: number; seededAt: string;
  activities: MarketingActivity[]; prizes: MarketingPrize[]; participations: MarketingParticipation[];
  bookings: MarketingBooking[]; chances: MarketingChance[]; draws: MarketingDraw[]; awards: MarketingAward[]; audits: MarketingAudit[];
}
