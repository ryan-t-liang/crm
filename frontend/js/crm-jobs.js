"use strict";

import { $, appUrl, crmApi, esc, formatLocalDateTime } from "./api.js";

let context;
const state = { mode: "import", objectType: "CONTACT", job: null, result: null, loading: false, error: "", history: null, file: null };
const objectConfig = {
  CONTACT: { label: "客户联系人", route: "contacts" },
  CRM_LEAD: { label: "线索", route: "leads" },
};

export function preflightStatusLabel(status) {
  return ({ VALID: "可导入", WARNING: "需注意", ERROR: "有错误" })[status] || status;
}

export function preflightMessage(row) {
  return [...(row.errors || []), ...(row.warnings || [])].map((item) => item.message).join("；") || "可以导入";
}

const config = () => objectConfig[state.objectType];
const jobStatusLabel = (status) => ({ PENDING: "等待处理", PREFLIGHTED: "预检完成", PROCESSING: "处理中", COMPLETED: "已完成", COMPLETED_WITH_ERRORS: "部分完成", FAILED: "失败" })[status] || status;

function dialogMarkup() {
  return `<dialog id="crmJobDialog" class="crm-modal crm-job-dialog">
    <section aria-labelledby="crmJobTitle">
      <header class="dialog-header"><div><h2 id="crmJobTitle" tabindex="-1">数据导入</h2><p id="crmJobSubtitle"></p></div><span class="spacer"></span><button class="dialog-close" id="crmCloseJob" type="button" aria-label="关闭"><svg><use href="#i-x"/></svg></button></header>
      <div class="dialog-body crm-job-body" id="crmJobBody"></div>
      <footer class="dialog-footer" id="crmJobFooter"></footer>
      <input id="crmJobFile" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden>
    </section>
  </dialog>`;
}

export function initializeCrmJobs(options) {
  context = options;
  if (!$('crmJobDialog')) document.body.insertAdjacentHTML("beforeend", dialogMarkup());
  $("crmCloseJob").addEventListener("click", () => $("crmJobDialog").close());
  $("crmJobFile").addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (file) uploadFile(file);
  });
}

function inlineError() {
  return state.error ? `<div class="inline-alert error" role="alert">${esc(state.error)}</div>` : "";
}

function renderLanding() {
  const item = config();
  return `<div class="crm-job-landing">
    <div class="crm-job-note"><svg><use href="#i-file"/></svg><div><strong>使用标准模板导入${esc(item.label)}</strong><span>仅支持 XLSX，单次最多 5,000 行。系统会在写入前检查数据。</span></div></div>
    ${inlineError()}
    <div class="crm-job-actions"><a class="btn" href="${appUrl(`/api/v1/crm/templates/${item.route}`)}" download><svg><use href="#i-download"/></svg>下载模板</a><button class="btn btn-primary" id="crmChooseFile" type="button"><svg><use href="#i-upload"/></svg>选择文件</button></div>
  </div>`;
}

function summaryMarkup(summary) {
  return `<div class="crm-job-summary"><div><span>总行数</span><strong>${summary.totalRows}</strong></div><div><span>可导入</span><strong>${summary.importableRows}</strong></div><div><span>需注意</span><strong>${summary.warningRows}</strong></div><div><span>有错误</span><strong>${summary.errorRows}</strong></div></div>`;
}

function renderPreflight() {
  const rows = state.job.rows || [];
  const body = rows.map((row) => `<tr><td>${row.rowNumber}</td><td>${esc(row.identity || "-")}</td><td><span class="row-status ${row.status === "ERROR" ? "error" : row.status === "WARNING" ? "warning" : "success"}">${esc(preflightStatusLabel(row.status))}</span></td><td>${esc(preflightMessage(row))}</td></tr>`).join("");
  return `<div class="crm-job-review">${summaryMarkup(state.job.preflight)}${inlineError()}<div class="crm-table-scroll"><table class="crm-data-table"><thead><tr><th>行号</th><th>识别信息</th><th>状态</th><th>说明</th></tr></thead><tbody>${body || '<tr><td colspan="4">没有数据行</td></tr>'}</tbody></table></div></div>`;
}

function renderResult() {
  const result = state.result;
  return `<div class="crm-job-result"><span class="crm-job-result-icon"><svg><use href="#i-check"/></svg></span><h3>${result.failed ? "导入完成，部分数据失败" : "导入完成"}</h3><p>成功 ${result.imported} 条，失败 ${result.failed} 条，需注意 ${result.warnings} 条。</p>${state.job.failureFilePath ? `<a class="btn" href="${appUrl(`/api/v1/crm/imports/${state.job.id}/failures`)}" download><svg><use href="#i-download"/></svg>下载失败明细</a>` : ""}</div>`;
}

function renderHistory() {
  const rows = (state.history || []).map((job) => `<tr><td>${esc(job.fileName)}</td><td>${job.objectType === "CONTACT" ? "客户联系人" : "线索"}</td><td>${esc(job.operatorName || "-")}</td><td>${esc(formatLocalDateTime(job.createdAt))}</td><td>${esc(jobStatusLabel(job.status))}</td><td>${job.successCount}</td><td>${job.failedCount}</td></tr>`).join("");
  return `<div class="crm-table-scroll"><table class="crm-data-table"><thead><tr><th>文件</th><th>对象</th><th>操作人</th><th>时间</th><th>状态</th><th>成功</th><th>失败</th></tr></thead><tbody>${rows || '<tr><td colspan="7">暂无导入记录</td></tr>'}</tbody></table></div>${inlineError()}`;
}

function renderExport() {
  if (state.loading) return '<div class="crm-job-result"><span class="crm-spinner"></span><h3>正在生成导出文件</h3><p>请稍候，不要关闭窗口。</p></div>';
  if (state.error) return `<div class="crm-job-result">${inlineError()}</div>`;
  return `<div class="crm-job-result"><span class="crm-job-result-icon"><svg><use href="#i-check"/></svg></span><h3>导出文件已生成</h3><p>共 ${state.result.rowCount} 条记录，文件将在 24 小时后失效。</p><a class="btn btn-primary" href="${appUrl(state.result.downloadUrl)}" download><svg><use href="#i-download"/></svg>下载 XLSX</a></div>`;
}

function renderFooter() {
  const footer = $("crmJobFooter");
  if (state.mode === "export") {
    footer.innerHTML = '<button class="btn" id="crmJobDone" type="button">关闭</button>';
  } else if (state.history) {
    footer.innerHTML = '<button class="btn" id="crmJobBack" type="button">返回</button><span class="spacer"></span><button class="btn" id="crmJobDone" type="button">关闭</button>';
  } else if (state.result) {
    footer.innerHTML = '<button class="btn" id="crmImportAgain" type="button">继续导入</button><span class="spacer"></span><button class="btn btn-primary" id="crmJobDone" type="button">完成</button>';
  } else if (state.job) {
    footer.innerHTML = `<button class="btn" id="crmJobBack" type="button">重新选择</button><span class="spacer"></span><button class="btn btn-primary" id="crmExecuteImport" type="button"${state.job.preflight.importableRows ? "" : " disabled"}>确认导入 ${state.job.preflight.importableRows} 条</button>`;
  } else {
    footer.innerHTML = '<button class="btn btn-small" id="crmImportHistory" type="button"><svg><use href="#i-clock"/></svg>导入记录</button><span class="spacer"></span><button class="btn" id="crmJobDone" type="button">取消</button>';
  }
  $("crmJobDone")?.addEventListener("click", () => $("crmJobDialog").close());
  $("crmJobBack")?.addEventListener("click", () => { Object.assign(state, { job: null, result: null, history: null, error: "", file: null }); render(); });
  $("crmImportAgain")?.addEventListener("click", () => { Object.assign(state, { job: null, result: null, error: "", file: null }); render(); });
  $("crmExecuteImport")?.addEventListener("click", executeImport);
  $("crmImportHistory")?.addEventListener("click", loadHistory);
}

function render() {
  $("crmJobTitle").textContent = state.mode === "export" ? `导出${config().label}` : `导入${config().label}`;
  $("crmJobSubtitle").textContent = state.history ? "最近导入记录" : "Kivisense CRM 2.0";
  $("crmJobBody").innerHTML = state.mode === "export" ? renderExport() : state.history ? renderHistory() : state.result ? renderResult() : state.job ? renderPreflight() : renderLanding();
  renderFooter();
  $("crmChooseFile")?.addEventListener("click", () => { $("crmJobFile").value = ""; $("crmJobFile").click(); });
}

export function openCrmImport(objectType) {
  Object.assign(state, { mode: "import", objectType, job: null, result: null, loading: false, error: "", history: null, file: null });
  render();
  $("crmJobDialog").showModal();
  $("crmJobTitle").focus({ preventScroll: true });
}

async function uploadFile(file) {
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    state.error = "请选择 XLSX 文件。";
    render();
    return;
  }
  state.file = file;
  state.loading = true;
  state.error = "";
  $("crmJobBody").innerHTML = '<div class="crm-job-result"><span class="crm-spinner"></span><h3>正在检查文件</h3></div>';
  try {
    const body = new FormData();
    body.append("file", file);
    const result = await crmApi(`/api/v1/crm/imports/${config().route}`, { method: "POST", body });
    state.job = result.data;
  } catch (error) {
    state.error = error.message || "文件检查失败。";
  } finally {
    state.loading = false;
    render();
  }
}

async function executeImport() {
  state.loading = true;
  state.error = "";
  $("crmExecuteImport").disabled = true;
  try {
    const response = await crmApi(`/api/v1/crm/imports/${state.job.id}/execute`, { method: "POST", body: "{}" });
    state.job = response.data.job;
    state.result = response.data.result;
    context.reload(state.objectType);
  } catch (error) {
    state.error = error.message || "导入失败。";
  } finally {
    state.loading = false;
    render();
  }
}

async function loadHistory() {
  state.error = "";
  try {
    const result = await crmApi(`/api/v1/crm/imports?objectType=${state.objectType}&pageSize=50`);
    state.history = result.data;
  } catch (error) {
    state.history = [];
    state.error = error.message || "无法读取导入记录。";
  }
  render();
}

export async function openCrmExport(objectType) {
  Object.assign(state, { mode: "export", objectType, job: null, result: null, loading: true, error: "", history: null, file: null });
  render();
  $("crmJobDialog").showModal();
  try {
    const response = await crmApi(`/api/v1/crm/exports/${config().route}`, { method: "POST", body: "{}" });
    state.result = response.data;
  } catch (error) {
    state.error = error.message || "导出失败。";
  } finally {
    state.loading = false;
    render();
  }
}
