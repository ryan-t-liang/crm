import type { SowindBrandCode } from "./member-operations";

// Frontend prototype contracts, NOT additional Sowind tables or backend fields.
export type MarketingStatus = "DRAFT" | "PUBLISHED" | "PAUSED" | "CANCELED";
// DIRECT / PICKUP preserve the original contract; map to DIRECT_PICKUP /
// RESERVATION_PICKUP in the product. Type and fulfillment are independent.
export type ClaimMethod = "DIRECT" | "PICKUP" | "EXPERIENCE" | "REDEMPTION_CODE" | "VIRTUAL_VOUCHER" | "LINK";
export type MarketingPrizeType = "PHYSICAL" | "VIRTUAL" | "UNKNOWN";
export interface MarketingSlot { id: string; label: string; startAt: string; endAt: string; location: string; capacity: number; bookingClosesAt: string; checkinStart: string; checkinEnd: string }
export interface MarketingCode { code: string; assignedAwardId?: string; assignedAt?: string }
export interface ActivityPrize {
  id: string; activityId: string; name: string; description: string; image: string;
  label: string; prizeType: MarketingPrizeType; quota: number; probability: number;
  perPersonLimit: number; method: ClaimMethod; location: string; claimStart: string;
  claimEnd: string; instructions: string; slots: MarketingSlot[]; codes: MarketingCode[];
  voucherName: string; voucherDescription: string; link: string;
  legacyPrizeId?: string;
}
// The existing activity.pool collection is retained, now containing owned prizes.
export type MarketingPoolItem = ActivityPrize;
export interface MarketingActivity {
  id: string; name: string; brand: SowindBrandCode; description: string; cover: string;
  mode: "ONLINE" | "OFFLINE"; location: string; status: MarketingStatus; ruleVersion: number;
  startAt: string; endAt: string; bookingEnabled: boolean; allowWalkIn: boolean;
  allowCancel: boolean; allowReschedule: boolean;
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
  createdAt: string; canceledAt?: string; source: "USER" | "WALK_IN" | "UNKNOWN";
}
export interface MarketingChance { id: string; participationId: string; activityId: string; count: number; grantedAt: string; ruleVersion: number }
export interface MarketingDraw { id: string; operationId: string; participationId: string; activityId: string; occurredAt: string; poolItemId: string | null; ruleVersion: number; randomValue: number }
export interface MarketingAward {
  id: string; drawId: string; participationId: string; activityId: string; poolItemId: string; credential: string;
  prizeName: string; method: ClaimMethod; location: string; instructions: string; claimStart: string; claimEnd: string;
  prizeType: MarketingPrizeType; image: string; description: string; awardLabel: string;
  virtualContent?: { code?: string; link?: string; name?: string; description?: string };
  issuedAt?: string; ruleVersion: number; wonAt: string; fulfilledAt?: string;
}
export interface MarketingRedemption {
  id: string; activityId: string; participationId: string; awardId?: string;
  type: "CHECKIN" | "COMPLETE" | "PRIZE_CLAIM" | "EXPERIENCE_CLAIM";
  targetId: string; occurredAt: string; actorId: string; result: "SUCCESS" | "REJECTED";
  credential: string; detail: string; source: "REDEMPTION_SURFACE" | "LEGACY_AUDIT" | "DEMO_SEED";
}
export interface MarketingAudit { id: string; activityId?: string; action: string; targetId: string; actorId: string; occurredAt: string; result: "SUCCESS" | "REJECTED"; detail: string }
export interface MarketingState {
  version: 2; revision: number; seededAt: string;
  activities: MarketingActivity[]; participations: MarketingParticipation[];
  bookings: MarketingBooking[]; chances: MarketingChance[]; draws: MarketingDraw[]; awards: MarketingAward[]; audits: MarketingAudit[];
  redemptions: MarketingRedemption[];
}
