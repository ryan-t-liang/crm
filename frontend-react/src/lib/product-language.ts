/**
 * Kivisense CRM product-language dictionary.
 *
 * Persistence codes stay stable in APIs and storage. Ordinary business screens
 * must resolve those codes through this module instead of presenting them to
 * users or inventing page-local translations.
 */
export const auditActionLabels: Record<string, string> = {
  CREATE_ORGANIZATION: "创建组织",
  UPDATE_ORGANIZATION: "更新组织",
  DELETE_ORGANIZATION: "删除组织",
  BATCH_ASSIGN_ORGANIZATIONS: "批量分配组织负责人",
  CREATE_CONTACT: "创建联系人",
  UPDATE_CONTACT: "更新联系人",
  DELETE_CONTACT: "删除联系人",
  BATCH_ASSIGN_CONTACTS: "批量分配联系人负责人",
  CREATE_CONTACT_FOLLOWUP: "新增联系人跟进记录",
  CREATE_FOLLOWUP: "记录跟进",
  CREATE_MARKETING_LEAD: "创建线索",
  UPDATE_MARKETING_LEAD: "更新线索",
  CORRECT_CONVERTED_MARKETING_LEAD: "更正已转换线索",
  DELETE_MARKETING_LEAD: "删除线索",
  BATCH_ASSIGN_MARKETING_LEADS: "批量分配线索负责人",
  ASSIGN_MARKETING_LEAD: "分配线索负责人",
  CREATE_MARKETING_LEAD_ACTIVITY: "记录线索行为",
  MARKETING_LEAD_AUTO_MQL: "线索自动转为营销合格",
  MARKETING_LEAD_ACCEPT_SQL: "接受线索跟进",
  MARKETING_LEAD_RECYCLE: "线索退回培育",
  MARKETING_LEAD_DISQUALIFY: "判定线索无效",
  CONVERT_MARKETING_LEAD: "线索转为商机",
  CREATE_CRM_LEAD: "创建商机",
  CREATE_OPPORTUNITY: "创建商机",
  UPDATE_CRM_LEAD: "更新商机",
  UPDATE_OPPORTUNITY: "更新商机",
  CHANGE_OPPORTUNITY_STAGE: "更新商机阶段",
  DELETE_LEAD: "删除商机",
  BATCH_ASSIGN_OPPORTUNITIES: "批量分配商机负责人",
  CREATE_LEAD_FOLLOWUP: "新增商机跟进记录",
  CREATE_CRM_TASK: "创建任务",
  CREATE_TASK: "创建任务",
  UPDATE_CRM_TASK: "更新任务",
  COMPLETE_CRM_TASK: "完成任务",
  COMPLETE_TASK: "完成任务",
  CANCEL_CRM_TASK: "取消任务",
  START_NURTURE: "开始客户经营计划",
  UPDATE_NURTURE: "更新客户经营计划",
  CREATE_LEAD_SCORING_RULE: "创建评分规则",
  UPDATE_LEAD_SCORING_RULE: "更新评分规则",
  UPLOAD_ATTACHMENT: "上传附件",
  DOWNLOAD_ATTACHMENT: "下载附件",
  DELETE_ATTACHMENT: "删除附件",
  IMPORT_UPLOAD: "上传导入文件",
  IMPORT_PREFLIGHT: "预检导入文件",
  IMPORT_EXECUTE: "执行导入",
  IMPORT_FAILURE_DOWNLOAD: "下载导入失败明细",
  EXPORT_CREATE: "创建导出任务",
  EXPORT_DOWNLOAD: "下载导出文件",
  CREATE_USER: "创建账户",
  UPDATE_USER: "更新账户",
  ENABLE_USER: "启用账户",
  DISABLE_USER: "停用账户",
  RESET_PASSWORD: "重置密码",
  CHANGE_PASSWORD: "修改密码",
  PASSWORD_FORCE_CHANGE: "首次修改密码",
  UPDATE_ROLE_PERMISSIONS: "更新角色权限",
  LOGIN: "登录",
  LOGOUT: "退出登录",
};

export const auditActionOptions = auditActionLabels;

export function auditActionLabel(action: string): string {
  return auditActionLabels[action] || "未知操作";
}

export const auditModuleLabels: Record<string, string> = {
  crm: "CRM",
  crm_organization: "组织",
  crm_marketing: "线索",
  crm_import: "数据导入",
  crm_export: "数据导出",
  task: "任务",
  account: "账户",
  auth: "登录与会话",
};

export const auditTargetLabels: Record<string, string> = {
  organization: "组织",
  contact: "联系人",
  contact_followup: "联系人跟进记录",
  marketing_lead: "线索",
  lead_activity_event: "线索行为",
  crm_lead: "商机",
  lead_followup: "商机跟进记录",
  crm_task: "任务",
  import_job: "导入任务",
  export_job: "导出任务",
  user: "账户",
  role: "角色",
  session: "会话",
};

export function auditModuleLabel(module: string): string {
  return auditModuleLabels[module] || "其他模块";
}

export function auditTargetLabel(targetType?: string | null): string {
  return targetType ? auditTargetLabels[targetType] || "其他对象" : "—";
}

export const marketingSourceLabels: Record<string, string> = {
  WEBSITE: "官网",
  FORM: "表单",
  CAMPAIGN: "营销活动",
  EVENT: "市场活动",
  EXHIBITION: "展会",
  REFERRAL: "推荐",
  LINKEDIN: "LinkedIn",
  WECHAT: "微信",
  OUTBOUND: "主动拓客",
  PARTNER: "合作伙伴",
  IMPORT: "批量导入",
  MANUAL: "手工录入",
  OTHER: "其他",
};

export const marketingSourceChannelLabels: Record<string, string> = {
  ORGANIC_SEARCH: "自然搜索",
  PAID_SEARCH: "付费搜索",
  PAID_AD: "付费广告",
  PAID_MEDIA: "广告投放",
  DIRECT: "直接访问",
  REFERRAL: "转介绍",
  EXHIBITION: "展会",
  LINKEDIN: "LinkedIn",
  WECHAT: "微信",
  WECHAT_OFFICIAL: "微信公众号",
  SOCIAL: "社交媒体",
  EMAIL: "邮件",
  OFFLINE_EVENT: "线下活动",
  OUTBOUND: "销售主动拓客",
  PARTNER: "合作伙伴",
  OTHER: "其他",
};

export const marketingLeadStatusLabels: Record<string, string> = {
  NEW: "新线索",
  NURTURING: "培育中",
  MQL: "营销合格（MQL）",
  SQL: "销售合格（SQL）",
  QUALIFIED: "已确认机会",
  CONVERTED: "已转商机",
  RECYCLED: "重新培育",
  DISQUALIFIED: "无效线索",
};

export const opportunityStageLabels: Record<string, string> = {
  NEW: "新建",
  QUALIFIED: "已验证",
  SOLUTION: "方案",
  QUOTATION: "报价",
  WON: "成交",
  LOST: "丢失",
};

export const priorityLabels: Record<string, string> = {
  URGENT: "紧急",
  HIGH: "高",
  MEDIUM: "中",
  LOW: "低",
};

export const organizationLifecycleLabels: Record<string, string> = {
  TARGET: "目标客户",
  CONTACTED: "已触达",
  NURTURING: "持续经营",
  OPPORTUNITY: "机会中",
  CUSTOMER: "客户",
  DISQUALIFIED: "不适合",
};

export const organizationRoleLabels: Record<string, string> = {
  PROSPECT: "客户（未成交）",
  CUSTOMER: "客户（已成交）",
  VENDOR: "供应商",
  PARTNER: "合作伙伴",
};

export const organizationTypeLabels: Record<string, string> = {
  ENTERPRISE: "企业",
  SCHOOL: "学校 / 高校",
  GOVERNMENT: "政府机构",
  ASSOCIATION: "协会 / 商会",
  NONPROFIT: "非营利组织",
  FOUNDATION: "基金会",
  OTHER: "其他",
};

export const contactTypeLabels: Record<string, string> = {
  INITIAL: "初步联系人",
  ONE_TO_ONE: "一对一联系人",
  CONVENTION: "活动联系人",
};

export const scoreLevelLabels: Record<string, string> = {
  LOW: "低",
  MEDIUM: "中",
  HIGH: "高",
  COLD: "低",
  WARM: "中",
  HOT: "高",
};

export const engagementStateLabels: Record<string, string> = {
  ACTIVE: "活跃",
  COOLING: "降温",
  DORMANT: "沉睡",
};

export const accountStatusLabels: Record<string, string> = {
  ACTIVE: "启用",
  DISABLED: "停用",
};

export const taskStatusLabels: Record<string, string> = {
  TODO: "待处理",
  IN_PROGRESS: "进行中",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
};

export const dataJobStatusLabels: Record<string, string> = {
  PENDING: "等待处理",
  PROCESSING: "处理中",
  UPLOADED: "已上传",
  PREFLIGHTED: "预检完成",
  RUNNING: "处理中",
  COMPLETED: "已完成",
  FAILED: "失败",
  CANCELLED: "已取消",
  READY: "可下载",
  EXPIRED: "已过期",
};

export const dataObjectLabels: Record<string, string> = {
  organizations: "公司",
  ORGANIZATION: "公司",
  contacts: "联系人",
  CONTACT: "联系人",
  "marketing-leads": "线索",
  MARKETING_LEAD: "线索",
  leads: "商机",
  CRM_LEAD: "商机",
};

export const exportScopeLabels: Record<string, string> = {
  CURRENT_FILTER: "当前筛选结果",
  FILTERED: "当前筛选结果",
  SELECTED: "已选记录",
  ALL: "全部记录",
  ALL_CURRENT_PERMISSION: "当前权限内全部记录",
};

const marketingActivityLabels: Record<string, string> = {
  EMAIL_REPLY: "客户回复",
  KEY_CONTENT_VIEW: "查看关键内容",
  MEETING_BOOKED: "已预约会议",
  MEETING_COMPLETED: "已完成会议",
  INTEREST_CONFIRMED: "明确表达兴趣",
  EXPLICIT_INTEREST: "明确表达兴趣",
  REQUIREMENT_CONFIRMED: "明确需求",
  PROPOSAL_REQUESTED: "要求方案",
  REQUEST_SOLUTION: "要求方案",
  NOT_READY: "暂无时机",
  NOT_INTERESTED: "无兴趣",
  MANUAL_NOTE: "补充行为记录",
};

const marketingActivitySourceLabels: Record<string, string> = {
  WEB: "网站",
  CRM: "CRM",
  SYSTEM: "系统",
  IMPORT: "批量导入",
  CAMPAIGN: "营销活动",
  EVENT: "市场活动",
};

export function marketingSourceLabel(source: string): string {
  return marketingSourceLabels[source] || "其他";
}

export function marketingSourceChannelLabel(channel?: string | null): string {
  if (!channel) return "—";
  if (marketingSourceChannelLabels[channel]) return marketingSourceChannelLabels[channel];
  return /^[A-Z][A-Z0-9_]+$/.test(channel) ? "其他" : channel;
}

export function marketingActivityLabel(eventType: string): string {
  return marketingActivityLabels[eventType] || "其他行为";
}

export function marketingActivitySourceLabel(source: string): string {
  return marketingActivitySourceLabels[source] || "其他来源";
}

const embeddedCodeLabels: Record<string, string> = {
  ...marketingLeadStatusLabels,
  ...opportunityStageLabels,
  ...organizationLifecycleLabels,
  ...priorityLabels,
  ...engagementStateLabels,
  FIT: "匹配度",
  ENGAGEMENT: "互动活跃度",
};

/** Resolve machine codes inside system-generated event copy. */
export function productEventText(value?: string | null): string {
  if (!value) return "—";
  return value.replace(
    /\b(MQL|SQL|DISQUALIFIED|NURTURING|QUALIFIED|CONVERTED|RECYCLED|TARGET|CONTACTED|OPPORTUNITY|CUSTOMER|NEW|SOLUTION|QUOTATION|WON|LOST|URGENT|HIGH|MEDIUM|LOW|ACTIVE|COOLING|DORMANT|FIT|ENGAGEMENT)\b/g,
    (code) => embeddedCodeLabels[code] || code,
  );
}
