import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const dictionary = await readFile(new URL("../docs/crm-2.0-field-dictionary.md", import.meta.url), "utf8");

const expectedContactHeaders = [
  "创建时间", "C客户联系人", "C触达阶段", "C品牌名称/公司简称", "C部门", "C公司名称", "C 职务Tittle", "F次回跟进日期", "F跟进人员", "F 会议minutes文件", "F跟进注意", "F备注/初次获取的信息", "A Leadsbook关联", "C Linkedin", "C website", "C 部门区域", "C City城市", "C email", "C 电话", "C 微信（群聊中选择）", "C 客户行业", "C 客户来源", "C 国家/城市", "创建人", "最后编辑时间", "A 成本管理关联", "A 项目评估关联", "A 合同管理关联", "A 销售内容关联", "A 成本管理关联-----成本管理----(副本)", "A 成本管理关联-----成本管理----(副本)",
];

const expectedLeadHeaders = [
  "创建时间", "R最近一次沟通", "L 客户联系人", "R leads项目需求简述", "A公司名称", "R 预计次回沟通日期", "A品牌", "A客户微信 于客户CRM表填写", "R需求整理", "R需求/签署文件", "R图片需求", "R正式方案", "R最新进度", "R重要性", "客户来源", "R预计报价", "R报价单", "F销售对接人", "F跟进对接人", "F对接群（可添加外部群）", "F日常跟进记录", "R重要跟进记录", "A成交日期", "A跟进：交付跟进日期", "A跟进：合同续约日期", "跟进节点3", "跟进节点4", "跟进节点3 1", "跟进节点4 1", "跟进节点5-合同到期 1", "收款日期", "R项目领域", "R项目类型", "技术类型", "产品类型", "产品名称", "合同管理关联", "F跟单模式", "R资源需求", "R Leads参与人员", "A成本关联", "A 项目评估表关联", "A成本关联-----成本管理----(副本)", "A成本关联-----成本管理----(副本)",
];

function mappingRows(sheet) {
  return dictionary.split("\n")
    .filter((line) => /^\|\s*\d+\s*\|/.test(line))
    .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()))
    .filter((cells) => cells[1] === sheet);
}

const contactRows = mappingRows("🚀客户CRM");
const leadRows = mappingRows("Leadsbook 2025");
assert.deepEqual(contactRows.map((row) => row[2]), expectedContactHeaders, "Contact source headers must remain exact and ordered");
assert.deepEqual(leadRows.map((row) => row[2]), expectedLeadHeaders, "Lead source headers must remain exact and ordered");

const validStatuses = new Set(["EXISTING", "MISSING", "TYPE_MISMATCH", "COMPUTED", "RELATION", "DEFERRED", "DUPLICATE", "NEED_CONFIRMATION"]);
for (const row of [...contactRows, ...leadRows]) assert.equal(validStatuses.has(row[12]), true, `Unsupported Current CRM Status: ${row[12]}`);

assert.match(dictionary, /\| Contact \| 24 \| 0 \| 1 \| 4 \| 2 \| 0 \| 31 \|/);
assert.match(dictionary, /\| Lead \| 27 \| 4 \| 3 \| 3 \| 2 \| 5 \| 44 \|/);
console.log("field dictionary contracts: PASS (31 Contact + 44 Lead source headers)");
