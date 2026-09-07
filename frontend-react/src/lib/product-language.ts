const auditActionLabels: Record<string, string> = {
  CREATE_ORGANIZATION: "创建公司",
  UPDATE_ORGANIZATION: "更新公司",
  DELETE_ORGANIZATION: "删除公司",
  BATCH_ASSIGN_ORGANIZATIONS: "批量分配公司负责人",
  CREATE_CONTACT: "创建联系人",
  UPDATE_CONTACT: "更新联系人",
  DELETE_CONTACT: "删除联系人",
  BATCH_ASSIGN_CONTACTS: "批量分配联系人负责人",
  CREATE_CONTACT_FOLLOWUP: "新增联系人跟进记录",
  CREATE_MARKETING_LEAD: "创建线索",
  UPDATE_MARKETING_LEAD: "更新线索",
  CORRECT_CONVERTED_MARKETING_LEAD: "更正已转换线索",
  DELETE_MARKETING_LEAD: "删除线索",
  BATCH_ASSIGN_MARKETING_LEADS: "批量分配线索负责人",
  CREATE_MARKETING_LEAD_ACTIVITY: "记录线索行为",
  MARKETING_LEAD_AUTO_MQL: "线索自动转为营销合格",
  MARKETING_LEAD_ACCEPT_SQL: "接受线索跟进",
  MARKETING_LEAD_RECYCLE: "线索退回培育",
  MARKETING_LEAD_DISQUALIFY: "判定线索无效",
  CONVERT_MARKETING_LEAD: "线索转为商机",
  CREATE_CRM_LEAD: "创建商机",
  UPDATE_CRM_LEAD: "更新商机",
  DELETE_LEAD: "删除商机",
  BATCH_ASSIGN_OPPORTUNITIES: "批量分配商机负责人",
  CREATE_LEAD_FOLLOWUP: "新增商机跟进记录",
  CREATE_CRM_TASK: "创建任务",
  UPDATE_CRM_TASK: "更新任务",
  COMPLETE_CRM_TASK: "完成任务",
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

export function auditActionLabel(action: string): string {
  return auditActionLabels[action] || "未知操作";
}

const auditModuleLabels: Record<string, string> = {
  crm: "CRM",
  crm_organization: "公司",
  crm_marketing: "线索",
  crm_import: "数据导入",
  crm_export: "数据导出",
  task: "任务",
  account: "账户",
  auth: "登录与会话",
};

const auditTargetLabels: Record<string, string> = {
  organization: "公司",
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
  WEBSITE: "官网访问",
  FORM: "表单提交",
  CAMPAIGN: "营销活动",
  EVENT: "市场活动",
  EXHIBITION: "展会",
  REFERRAL: "客户转介绍",
  LINKEDIN: "LinkedIn",
  WECHAT: "微信",
  OUTBOUND: "主动开发",
  PARTNER: "合作伙伴",
  IMPORT: "批量导入",
  MANUAL: "手工录入",
  OTHER: "其他",
};

export const marketingSourceChannelLabels: Record<string, string> = {
  ORGANIC_SEARCH: "自然搜索",
  PAID_AD: "付费广告",
  DIRECT: "直接访问",
  REFERRAL: "推荐",
  EXHIBITION: "展会",
  LINKEDIN: "LinkedIn",
  WECHAT: "微信",
  OUTBOUND: "主动开发",
  PARTNER: "合作伙伴",
  OTHER: "其他",
};

const marketingActivityLabels: Record<string, string> = {
  EMAIL_REPLY: "客户回复",
  KEY_CONTENT_VIEW: "浏览关键内容",
  MEETING_BOOKED: "预约会议",
  MEETING_COMPLETED: "完成会议",
  INTEREST_CONFIRMED: "明确表达兴趣",
  REQUIREMENT_CONFIRMED: "明确需求",
  PROPOSAL_REQUESTED: "要求方案",
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
  return channel ? marketingSourceChannelLabels[channel] || "其他" : "—";
}

export function marketingActivityLabel(eventType: string): string {
  return marketingActivityLabels[eventType] || "其他行为";
}

export function marketingActivitySourceLabel(source: string): string {
  return marketingActivitySourceLabels[source] || "其他来源";
}
