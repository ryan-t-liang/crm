"use strict";

import { $, appUrl, crmApi, esc, formatLocalDateTime } from "./api.js";

let context;
const jobState = {
  mode: "import",
  objectType: "CONTACT",
  step: 1,
  job: null,
  result: null,
  error: "",
  file: null,
  loading: false,
  history: null,
  exportJob: null,
};

const objectConfig = {
  CONTACT: { label: "Contact", plural: "Contacts", route: "contacts" },
  CRM_LEAD: { label: "CRM Lead", plural: "CRM Leads", route: "leads" },
};
const importSteps = ["Download Template", "Upload XLSX", "Preflight", "Confirm Import", "Result"];

export function preflightStatusLabel(status) {
  return ({ VALID: "Valid", WARNING: "Warning", ERROR: "Error" })[status] || status;
}

export function preflightMessage(row) {
  return [...(row.errors || []), ...(row.warnings || [])].map((item) => item.message).join("; ") || "Ready to import";
}

function config() { return objectConfig[jobState.objectType]; }
function closeDialog() { $("crmJobDialog").close(); }
function reset(objectType, mode) {
  Object.assign(jobState, { mode, objectType, step: 1, job: null, result: null, error: "", file: null, loading: false, history: null, exportJob: null });
}

function dialogMarkup() {
  return `<dialog id="crmJobDialog" class="data-management-dialog crm-job-dialog">
    <section class="import-shell" aria-labelledby="crmJobTitle">
      <header class="dialog-header crm-job-header">
        <div class="dialog-title-stack"><h2 id="crmJobTitle" tabindex="-1">CRM Data</h2><span id="crmJobSubtitle"></span></div>
        <span class="spacer"></span>
        <div class="dialog-header-actions"><button class="btn btn-small" id="crmImportHistory" type="button"><svg><use href="#i-clock"/></svg>Import History</button><button class="dialog-close" id="crmCloseJob" type="button" aria-label="关闭"><svg><use href="#i-x"/></svg></button></div>
      </header>
      <div class="import-steps crm-job-steps" id="crmJobSteps"></div>
      <div class="import-body crm-job-body" id="crmJobBody"></div>
      <footer class="import-footer" id="crmJobFooter"></footer>
      <input id="crmJobFile" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden>
    </section>
  </dialog>`;
}

export function initializeCrmJobs(options) {
  context = options;
  if (!$("crmJobDialog")) document.body.insertAdjacentHTML("beforeend", dialogMarkup());
  $("crmCloseJob").addEventListener("click", closeDialog);
  $("crmImportHistory").addEventListener("click", loadHistory);
  $("crmJobFile").addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (file) uploadFile(file);
  });
}

function renderSteps() {
  const steps = $("crmJobSteps");
  steps.hidden = jobState.mode !== "import" || jobState.history !== null;
  steps.innerHTML = importSteps.map((label, index) => {
    const number = index + 1;
    return `<div class="import-step${number === jobState.step ? " is-active" : ""}${number < jobState.step ? " is-complete" : ""}"><strong>${esc(label)}</strong></div>`;
  }).join("");
}

function setHeader() {
  const item = config();
  $("crmJobTitle").textContent = jobState.mode === "export" ? `Export ${item.plural}` : `Import ${item.plural}`;
  $("crmJobSubtitle").textContent = jobState.history !== null ? "Import History" : "Kivisense CRM 2.0";
  $("crmImportHistory").hidden = jobState.mode !== "import";
}

function inlineError() {
  if (!jobState.error) return "";
  return `<div class="inline-alert error crm-job-error" role="alert">${esc(jobState.error)}${jobState.file ? `<button class="btn btn-small" id="crmRetryDuplicate" type="button">Upload Again</button>` : ""}</div>`;
}

function templateStep() {
  const item = config();
  return `<div class="crm-job-stage crm-job-template-stage">
    <div class="crm-job-stage-icon"><svg><use href="#i-download"/></svg></div>
    <h3>${esc(item.label)} XLSX Template</h3>
    <p>Standard CRM 2.0 fields with controlled enums and examples.</p>
    ${inlineError()}
    <div class="crm-job-stage-actions"><a class="btn btn-primary" id="crmDownloadTemplate" href="${appUrl(`/api/v1/crm/templates/${item.route}`)}" download>Download Template</a><button class="btn" id="crmSkipTemplate" type="button">Continue to Upload</button></div>
  </div>`;
}

function uploadStep() {
  const item = config();
  return `<div class="crm-job-stage">
    <div class="upload-card crm-job-upload" id="crmUploadCard"><div><div class="upload-symbol"><svg><use href="#i-upload"/></svg></div><div class="upload-copy"><strong>Upload ${esc(item.label)} XLSX</strong><span>.xlsx · up to 10 MB · 5,000 data rows</span></div><div class="upload-actions"><button class="btn btn-primary btn-small" id="crmChooseFile" type="button">Choose File</button><a class="text-action" href="${appUrl(`/api/v1/crm/templates/${item.route}`)}" download>Download Template</a></div></div></div>
    ${inlineError()}
  </div>`;
}

function summaryMarkup(summary) {
  return `<div class="result-stats crm-job-summary">
    <div class="result-stat"><span>Total Rows</span><strong>${summary.totalRows}</strong></div>
    <div class="result-stat"><span>Valid</span><strong>${summary.validRows}</strong></div>
    <div class="result-stat is-warning"><span>Warnings</span><strong>${summary.warningRows}</strong></div>
    <div class="result-stat is-error"><span>Errors</span><strong>${summary.errorRows}</strong></div>
  </div>`;
}

function preflightTable(rows) {
  const body = rows.map((row) => {
    const message = preflightMessage(row);
    return `<tr><td>${row.rowNumber}</td><td><div class="crm-job-identifier" title="${esc(row.identity || "-")}">${esc(row.identity || "-")}</div></td><td><span class="row-status ${row.status === "ERROR" ? "error" : row.status === "WARNING" ? "warning" : "success"}">${esc(preflightStatusLabel(row.status))}</span></td><td><div class="crm-job-message" title="${esc(message)}">${esc(message)}</div></td></tr>`;
  }).join("");
  return `<div class="preview-table-wrap crm-job-table-wrap"><table class="history-table crm-job-table"><thead><tr><th>Row</th><th>Primary Identifier</th><th>Status</th><th>Message</th></tr></thead><tbody>${body || `<tr><td colspan="4">No data rows</td></tr>`}</tbody></table></div>`;
}

function preflightStep() {
  const { preflight, rows } = jobState.job;
  return `<div class="crm-job-review"><h3>Preflight</h3>${summaryMarkup(preflight)}${preflightTable(rows)}${inlineError()}</div>`;
}

function confirmStep() {
  const summary = jobState.job.preflight;
  const warning = summary.warningRows ? `<div class="inline-alert crm-job-warning">${summary.warningRows} warning row(s) will still create new records.</div>` : "";
  const error = summary.errorRows ? `<div class="inline-alert error">${summary.errorRows} error row(s) will be recorded as failed and excluded from creation.</div>` : "";
  return `<div class="crm-job-stage crm-job-confirm"><div class="crm-job-stage-icon"><svg><use href="#i-check"/></svg></div><h3>Confirm ${esc(config().label)} Import</h3>${summaryMarkup(summary)}${warning}${error}${inlineError()}</div>`;
}

function resultStep() {
  const result = jobState.result;
  return `<div class="result-body crm-job-result"><div class="result-hero"><div class="result-icon"><svg><use href="#i-check"/></svg></div><div><h3>${result.failed ? "Import completed with errors" : "Import completed"}</h3><p>${esc(config().plural)} are now available in CRM.</p></div></div><div class="result-stats"><div class="result-stat"><span>Imported</span><strong>${result.imported}</strong></div><div class="result-stat"><span>Failed</span><strong>${result.failed}</strong></div><div class="result-stat"><span>Warnings</span><strong>${result.warnings}</strong></div></div>${result.failureFilePath ? `<a class="btn btn-small" href="${appUrl(`/api/v1/crm/imports/${result.id}/failures`)}" download><svg><use href="#i-download"/></svg>Download Failure CSV</a>` : ""}</div>`;
}

function historyView() {
  const rows = jobState.history.map((job) => `<tr><td><div class="crm-job-identifier" title="${esc(job.fileName)}">${esc(job.fileName)}</div></td><td>${esc(job.objectType === "CONTACT" ? "Contact" : "CRM Lead")}</td><td>${esc(job.operatorName || "-")}</td><td>${esc(formatLocalDateTime(job.createdAt))}</td><td><span class="row-status ${job.status === "FAILED" ? "error" : job.failedCount ? "warning" : "success"}">${esc(job.status)}</span></td><td>${job.totalCount}</td><td>${job.successCount}</td><td>${job.failedCount}</td></tr>`).join("");
  return `<div class="crm-job-review"><h3>Import History</h3><div class="preview-table-wrap crm-job-table-wrap"><table class="history-table crm-job-table crm-job-history-table"><thead><tr><th>File Name</th><th>Object Type</th><th>Created By</th><th>Created At</th><th>Status</th><th>Total</th><th>Success</th><th>Failed</th></tr></thead><tbody>${rows || `<tr><td colspan="8">No import history</td></tr>`}</tbody></table></div>${inlineError()}</div>`;
}

function exportView() {
  if (jobState.loading) return `<div class="crm-job-stage"><span class="crm-job-spinner" aria-hidden="true"></span><h3>Preparing Export...</h3><p>${esc(config().plural)}</p></div>`;
  if (jobState.error) return `<div class="crm-job-stage"><div class="crm-job-stage-icon is-error"><svg><use href="#i-x"/></svg></div><h3>Export failed</h3>${inlineError()}</div>`;
  const job = jobState.exportJob;
  if (!job) return "";
  return `<div class="crm-job-stage"><div class="crm-job-stage-icon"><svg><use href="#i-check"/></svg></div><h3>Export ready</h3><p>${job.rowCount} row(s) · file expires in 24 hours</p><a class="btn btn-primary" href="${appUrl(job.downloadUrl)}" download><svg><use href="#i-download"/></svg>Download XLSX</a></div>`;
}

function renderFooter() {
  const footer = $("crmJobFooter");
  if (jobState.mode === "export") {
    footer.innerHTML = `<span class="spacer"></span><button class="btn" id="crmCloseExport" type="button">Close</button>`;
    $("crmCloseExport").onclick = closeDialog;
    return;
  }
  if (jobState.history !== null) {
    footer.innerHTML = `<button class="btn" id="crmBackFromHistory" type="button">Back</button><span class="spacer"></span><button class="btn" id="crmCloseHistory" type="button">Close</button>`;
    $("crmBackFromHistory").onclick = () => { jobState.history = null; jobState.error = ""; render(); };
    $("crmCloseHistory").onclick = closeDialog;
    return;
  }
  if (jobState.step === 1) {
    footer.innerHTML = `<span class="spacer"></span><button class="btn" id="crmCancelImport" type="button">Cancel</button>`;
    $("crmCancelImport").onclick = closeDialog;
  } else if (jobState.step === 2) {
    footer.innerHTML = `<button class="btn" id="crmBackToTemplate" type="button">Back</button><span class="spacer"></span><button class="btn" id="crmCancelImport" type="button">Cancel</button>`;
    $("crmBackToTemplate").onclick = () => { jobState.step = 1; jobState.error = ""; render(); };
    $("crmCancelImport").onclick = closeDialog;
  } else if (jobState.step === 3) {
    footer.innerHTML = `<button class="btn" id="crmCancelImport" type="button">Cancel</button><span class="spacer"></span><button class="btn btn-primary" id="crmReviewImport" type="button">Continue</button>`;
    $("crmCancelImport").onclick = closeDialog;
    $("crmReviewImport").onclick = () => { jobState.step = 4; render(); };
  } else if (jobState.step === 4) {
    footer.innerHTML = `<button class="btn" id="crmBackToPreflight" type="button">Back</button><span class="spacer"></span><button class="btn btn-primary" id="crmExecuteImport" type="button">Import ${jobState.job.preflight.importableRows} Valid Rows</button>`;
    $("crmBackToPreflight").onclick = () => { jobState.step = 3; render(); };
    $("crmExecuteImport").onclick = executeImport;
  } else {
    footer.innerHTML = `<button class="btn" id="crmImportAnother" type="button">Import Another</button><span class="spacer"></span><button class="btn btn-primary" id="crmFinishImport" type="button">Return to ${esc(config().plural)}</button>`;
    $("crmImportAnother").onclick = () => { const objectType = jobState.objectType; reset(objectType, "import"); render(); };
    $("crmFinishImport").onclick = () => { closeDialog(); context.reload(jobState.objectType); };
  }
}

function bindStageActions() {
  if ($("crmDownloadTemplate")) $("crmDownloadTemplate").addEventListener("click", () => setTimeout(() => { jobState.step = 2; render(); }, 0));
  if ($("crmSkipTemplate")) $("crmSkipTemplate").onclick = () => { jobState.step = 2; render(); };
  if ($("crmChooseFile")) $("crmChooseFile").onclick = () => { $("crmJobFile").value = ""; $("crmJobFile").click(); };
  if ($("crmRetryDuplicate")) $("crmRetryDuplicate").onclick = () => uploadFile(jobState.file, true);
  const card = $("crmUploadCard");
  if (card) {
    ["dragenter", "dragover"].forEach((name) => card.addEventListener(name, (event) => { event.preventDefault(); card.classList.add("is-dragging"); }));
    ["dragleave", "drop"].forEach((name) => card.addEventListener(name, (event) => { event.preventDefault(); card.classList.remove("is-dragging"); }));
    card.addEventListener("drop", (event) => { const file = event.dataTransfer?.files?.[0]; if (file) uploadFile(file); });
  }
}

function render() {
  setHeader();
  renderSteps();
  $("crmJobBody").innerHTML = jobState.mode === "export"
    ? exportView()
    : jobState.history !== null
      ? historyView()
      : jobState.step === 1
        ? templateStep()
        : jobState.step === 2
          ? uploadStep()
          : jobState.step === 3
            ? preflightStep()
            : jobState.step === 4
              ? confirmStep()
              : resultStep();
  renderFooter();
  bindStageActions();
}

export function openCrmImport(objectType) {
  reset(objectType, "import");
  render();
  $("crmJobDialog").showModal();
  $("crmJobTitle").focus({ preventScroll: true });
}

async function uploadFile(file, allowDuplicate = false) {
  if (jobState.loading) return;
  if (!file?.name?.toLowerCase().endsWith(".xlsx")) { jobState.error = "Please upload an .xlsx file."; return render(); }
  if (file.size > 10 * 1024 * 1024) { jobState.error = "The XLSX file must be 10 MB or smaller."; return render(); }
  jobState.loading = true;
  jobState.error = "";
  jobState.file = null;
  const body = new FormData();
  body.append("file", file);
  try {
    const response = await crmApi(`/api/v1/crm/imports/${config().route}${allowDuplicate ? "?allowDuplicate=true" : ""}`, { method: "POST", body });
    jobState.job = response.data;
    jobState.step = 3;
  } catch (error) {
    jobState.step = 2;
    jobState.error = error.message;
    if (error.code === "IMPORT_FILE_DUPLICATE") jobState.file = file;
    context.notify(error.message);
  } finally {
    jobState.loading = false;
    render();
  }
}

async function executeImport() {
  if (!jobState.job || jobState.loading) return;
  jobState.loading = true;
  const button = $("crmExecuteImport");
  if (button) { button.disabled = true; button.textContent = "Importing..."; }
  try {
    const response = await crmApi(`/api/v1/crm/imports/${jobState.job.id}/execute`, { method: "POST", body: "{}" });
    jobState.result = { ...response.data.result, ...response.data.job };
    jobState.step = 5;
  } catch (error) {
    jobState.error = error.message;
    context.notify(error.message);
  } finally {
    jobState.loading = false;
    render();
  }
}

async function loadHistory() {
  jobState.error = "";
  jobState.history = [];
  render();
  try {
    const response = await crmApi(`/api/v1/crm/imports?objectType=${jobState.objectType}&pageSize=100`);
    jobState.history = response.data;
  } catch (error) {
    jobState.error = error.message;
    context.notify(error.message);
  }
  render();
}

export function openCrmExport(objectType) {
  reset(objectType, "export");
  jobState.loading = true;
  render();
  $("crmJobDialog").showModal();
  $("crmJobTitle").focus({ preventScroll: true });
  requestAnimationFrame(runExport);
}

async function runExport() {
  try {
    const response = await crmApi(`/api/v1/crm/exports/${config().route}`, { method: "POST", body: "{}" });
    jobState.exportJob = response.data;
  } catch (error) {
    jobState.error = error.message;
    context.notify(error.message);
  } finally {
    jobState.loading = false;
    render();
  }
}
