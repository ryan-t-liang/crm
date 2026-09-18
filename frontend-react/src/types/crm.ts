export type UserRole = "HQ_ADMIN" | "DISTRIBUTOR_MANAGER" | "DISTRIBUTOR_SALES" | "VIEWER";
export type LeadStatus = "NEW" | "CONTACTED" | "NURTURING" | "QUALIFIED" | "CONVERTED" | "UNQUALIFIED";
export type DealStage = "DISCOVERY" | "SOLUTION" | "QUOTATION" | "NEGOTIATION" | "WON" | "LOST";
export type ActivityType = "EMAIL" | "CALL" | "COMMENT" | "TASK" | "NOTE" | "ATTACHMENT" | "STATUS_CHANGE" | "STAGE_CHANGE" | "SYSTEM";
export type TaskStatus = "OPEN" | "DONE" | "CANCELED";

export interface Distributor {
  id: string;
  name: string;
  code: string;
  country: string;
  region: string;
  status: "ACTIVE" | "INACTIVE";
}

export interface DemoUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  distributorId: string;
  title: string;
  avatarColor: string;
}

export interface ProductCapability {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  status: "ACTIVE" | "DISABLED";
  capabilities: ProductCapability[];
}

export interface Organization {
  id: string;
  name: string;
  industry: string;
  country: string;
  ownerId: string;
  distributorId: string;
  lastActivityAt: string;
}

export interface Contact {
  id: string;
  name: string;
  organizationId: string;
  jobTitle: string;
  email: string;
  phone: string;
  linkedin: string;
  whatsapp: string;
  wechat: string;
  country: string;
  ownerId: string;
  distributorId: string;
  lastActivityAt: string;
}

export interface Lead {
  id: string;
  name: string;
  organizationId: string;
  contactId: string;
  productInterest: string[];
  status: LeadStatus;
  ownerId: string;
  distributorId: string;
  source: string;
  createdAt: string;
  lastActivityAt: string;
  convertedDealId?: string;
}

export interface Deal {
  id: string;
  name: string;
  organizationId: string;
  primaryContactId: string;
  productId: string;
  capabilityIds: string[];
  stage: DealStage;
  ownerId: string;
  distributorId: string;
  expectedClose: string;
  probability: number;
  sourceLeadId?: string;
  createdAt: string;
  lastActivityAt: string;
}

export interface Activity {
  id: string;
  entityType: "LEAD" | "DEAL" | "CONTACT" | "ORGANIZATION";
  entityId: string;
  type: ActivityType;
  actorId: string;
  title: string;
  detail?: string;
  createdAt: string;
}

export interface EmailMessage {
  id: string;
  entityType: "LEAD" | "DEAL";
  entityId: string;
  threadId: string;
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  body: string;
  attachmentNames: string[];
  sentAt: string;
}

export interface InternalComment {
  id: string;
  entityType: "LEAD" | "DEAL";
  entityId: string;
  authorId: string;
  body: string;
  createdAt: string;
}

export interface CallLog {
  id: string;
  entityType: "LEAD" | "DEAL";
  entityId: string;
  direction: "INBOUND" | "OUTBOUND";
  contactId: string;
  occurredAt: string;
  durationMinutes: number;
  summary: string;
  result: string;
  nextAction: string;
  actorId: string;
}

export interface CrmTask {
  id: string;
  title: string;
  relationType: "LEAD" | "DEAL" | "CONTACT" | "ORGANIZATION";
  relationId: string;
  ownerId: string;
  distributorId: string;
  dueAt: string;
  priority: "LOW" | "MEDIUM" | "HIGH";
  status: TaskStatus;
  description: string;
}

export interface Note {
  id: string;
  entityType: "LEAD" | "DEAL" | "CONTACT" | "ORGANIZATION";
  entityId: string;
  authorId: string;
  title: string;
  body: string;
  createdAt: string;
}

export interface Attachment {
  id: string;
  entityType: "LEAD" | "DEAL" | "CONTACT" | "ORGANIZATION";
  entityId: string;
  name: string;
  mimeType: string;
  size: number;
  uploadedBy: string;
  createdAt: string;
  objectUrl?: string;
}

export interface CrmState {
  version: 1;
  currentUserId: string;
  distributors: Distributor[];
  users: DemoUser[];
  products: Product[];
  organizations: Organization[];
  contacts: Contact[];
  leads: Lead[];
  deals: Deal[];
  activities: Activity[];
  emails: EmailMessage[];
  comments: InternalComment[];
  calls: CallLog[];
  tasks: CrmTask[];
  notes: Note[];
  attachments: Attachment[];
}
