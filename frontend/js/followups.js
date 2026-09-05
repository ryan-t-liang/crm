"use strict";

import { $, appUrl, crmApi, esc, formatLocalDateTime, friendlyError, localDateTimeToIso, setButtonBusy, toDateTimeInput } from "./api.js";
import { FOLLOWUP_TYPES, followupTypeLabel } from "./field-definitions.js";

let context;
let pending;
let pendingFiles = [];
const allowedExtensions = new Set(["jpg", "jpeg", "png", "gif", "webp", "mp4", "webm", "mov", "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt"]);
const maxBytes = 50 * 1024 * 1024;

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function attachmentUrl(item, kind, attachment) {
  const resource = kind === "contact" ? "contacts" : "leads";
  const parentId = kind === "contact" ? item.contactId : item.leadId;
  return appUrl(`/api/v1/crm/${resource}/${encodeURIComponent(parentId)}/followups/${encodeURIComponent(item.id)}/attachments/${encodeURIComponent(attachment.id)}/download`);
}

export function renderTimelineMarkup(items, kind) {
  if (!items.length) return '<div class="empty-state crm-compact-empty"><div><div class="empty-illustration"><svg><use href="#i-clock"/></svg></div><h3>暂无跟进记录</h3></div></div>';
  return items.map((item) => `<article class="timeline-item" data-followup-id="${esc(item.id)}">
    <span class="timeline-dot" aria-hidden="true"></span>
    <div class="timeline-card"><div class="timeline-meta"><span class="crm-badge">${esc(followupTypeLabel(item.type))}</span>${kind === "lead" && item.important ? '<span class="crm-important">重要</span>' : ""}<time>${esc(formatLocalDateTime(item.occurredAt))}</time></div><h3>负责人 ${esc(item.owner?.name || "-")} · 录入人 ${esc(item.createdBy?.name || "-")}</h3><p>${esc(item.content)}</p>${item.progress ? `<div class="followup-outcome"><strong>当前进展</strong><span>${esc(item.progress)}</span></div>` : ""}${item.nextAction ? `<div class="followup-outcome"><strong>下一步动作</strong><span>${esc(item.nextAction)}</span></div>` : ""}${item.nextFollowupAt ? `<div class="followup-next-time"><strong>下次跟进</strong>${esc(formatLocalDateTime(item.nextFollowupAt))}</div>` : ""}${item.attachments?.length ? `<div class="followup-files">${item.attachments.map((attachment) => `<a href="${esc(attachmentUrl(item, kind, attachment))}" target="_blank" rel="noopener"><svg><use href="#i-paperclip"/></svg>${esc(attachment.originalName)}</a>`).join("")}</div>` : ""}</div>
  </article>`).join("");
}

function renderPendingFiles() {
  const list = $("crmFollowupAttachmentList");
  list.innerHTML = pendingFiles.length ? pendingFiles.map((file, index) => `<div class="crm-attachment-row is-pending"><span class="crm-attachment-type"><svg><use href="#i-paperclip"/></svg></span><span><strong>${esc(file.name)}</strong><small>${esc(formatFileSize(file.size))} · 待上传</small></span><button class="crm-attachment-remove" type="button" data-remove-followup-file="${index}" aria-label="移除 ${esc(file.name)}"><svg><use href="#i-x"/></svg></button></div>`).join("") : '<div class="crm-attachment-empty"><svg><use href="#i-paperclip"/></svg><span>尚未添加附件</span></div>';
  list.querySelectorAll("[data-remove-followup-file]").forEach((button) => button.addEventListener("click", () => { pendingFiles.splice(Number(button.dataset.removeFollowupFile), 1); renderPendingFiles(); }));
}

function addFiles(files) {
  const rejected = [];
  for (const file of Array.from(files || [])) {
    const extension = file.name.split(".").pop()?.toLowerCase() || "";
    if (!allowedExtensions.has(extension)) rejected.push(`${file.name}：格式不支持`);
    else if (!file.size) rejected.push(`${file.name}：文件为空`);
    else if (file.size > maxBytes) rejected.push(`${file.name}：超过 50 MB`);
    else if (pendingFiles.length >= 20) rejected.push(`${file.name}：已达到 20 个文件上限`);
    else if (!pendingFiles.some((item) => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified)) pendingFiles.push(file);
  }
  $("crmFollowupAttachmentError").textContent = rejected.join("；");
  $("crmFollowupAttachmentError").hidden = !rejected.length;
  $("crmFollowupAttachmentInput").value = "";
  renderPendingFiles();
}

function updateAttachmentHeading() {
  if (!pending) return;
  const isMeeting = pending.kind === "contact" && $("crmFollowupForm").elements.type.value === "MEETING";
  $("crmFollowupAttachmentTitle").textContent = isMeeting ? "会议纪要附件" : "互动附件";
  $("crmFollowupAttachmentHint").textContent = isMeeting ? "会议内容与纪要文件会作为同一次客户互动进入客户旅程" : "附件会与本次跟进内容成对保存";
}

export function initializeFollowups(options) {
  context = options;
  if (!$("crmFollowupDrawer")) {
    document.body.insertAdjacentHTML("beforeend", `<dialog class="lead-create-dialog crm-form-dialog crm-followup-dialog" id="crmFollowupDrawer">
      <form id="crmFollowupForm" novalidate>
        <div class="dialog-header"><div><h2 id="crmFollowupTitle">新增跟进</h2></div><span class="spacer"></span><button class="dialog-close" type="button" data-close-followup aria-label="关闭"><svg><use href="#i-x"/></svg></button></div>
        <div class="dialog-body">
          <div class="canonical-form-grid crm-form-grid-single">
            <label class="crm-field"><span>沟通时间<b aria-hidden="true">*</b></span><input name="occurredAt" type="datetime-local" required><small class="crm-field-error"></small></label>
            <label class="crm-field"><span>沟通方式<b aria-hidden="true">*</b></span><select name="type" required>${FOLLOWUP_TYPES.map((item) => `<option value="${item.value}">${esc(item.label)}</option>`).join("")}</select><small class="crm-field-error"></small></label>
            <label class="crm-field"><span>负责人<b aria-hidden="true">*</b></span><select name="ownerUserId" required></select><small class="crm-field-error"></small></label>
            <label class="crm-field crm-important-field" id="crmImportantField" hidden><span>重要跟进</span><span class="crm-toggle-row"><input name="important" type="checkbox"><span>标记为重要</span></span></label>
            <label class="crm-field"><span>沟通记录<b aria-hidden="true">*</b></span><textarea name="content" maxlength="16000" required></textarea><small class="crm-field-error"></small></label>
            <label class="crm-field crm-lead-followup-field" hidden><span>当前进展</span><textarea name="progress" maxlength="16000" placeholder="本次互动带来的项目进展"></textarea></label>
            <label class="crm-field crm-lead-followup-field" hidden><span>下一步动作</span><textarea name="nextAction" maxlength="16000" placeholder="下一步要做什么、由谁推进"></textarea></label>
            <label class="crm-field"><span>下次跟进时间</span><input name="nextFollowupAt" type="datetime-local"></label>
          </div>
          <section class="crm-attachment-field crm-followup-attachment"><header><div><h4 id="crmFollowupAttachmentTitle">互动附件</h4><p id="crmFollowupAttachmentHint">附件会与本次跟进内容成对保存</p></div><span>图片 / 视频 / 文档</span></header><label class="crm-attachment-dropzone"><input id="crmFollowupAttachmentInput" type="file" multiple accept=".jpg,.jpeg,.png,.gif,.webp,.mp4,.webm,.mov,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"><svg><use href="#i-paperclip"/></svg><span><strong>选择附件</strong><small>单个文件不超过 50 MB</small></span></label><div class="crm-attachment-list" id="crmFollowupAttachmentList"></div><div class="crm-attachment-error" id="crmFollowupAttachmentError" hidden></div></section>
          <div class="crm-form-message" id="crmFollowupError" role="alert" hidden></div>
        </div>
        <div class="dialog-footer"><button class="btn" type="button" data-close-followup>取消</button><span class="spacer"></span><button class="btn btn-primary" id="crmSaveFollowup" type="submit">保存跟进</button></div>
      </form>
    </dialog>`);
  }
  document.querySelectorAll("[data-close-followup]").forEach((button) => button.addEventListener("click", closeFollowup));
  $("crmFollowupForm").addEventListener("submit", saveFollowup);
  $("crmFollowupForm").elements.type.addEventListener("change", updateAttachmentHeading);
  $("crmFollowupAttachmentInput").addEventListener("change", (event) => addFiles(event.target.files));
}

export function openFollowup({ kind, id, title, onSaved }) {
  pending = { kind, id, onSaved };
  pendingFiles = [];
  const form = $("crmFollowupForm");
  form.reset();
  form.elements.occurredAt.value = toDateTimeInput(new Date());
  form.elements.type.value = "GENERAL";
  form.elements.ownerUserId.innerHTML = context.getUsers().map((user) => `<option value="${esc(user.id)}"${user.id === context.currentUserId() ? " selected" : ""}>${esc(user.name)}</option>`).join("");
  $("crmImportantField").hidden = kind !== "lead";
  form.querySelectorAll(".crm-lead-followup-field").forEach((field) => { field.hidden = kind !== "lead"; });
  $("crmFollowupTitle").textContent = title;
  $("crmFollowupError").hidden = true;
  $("crmFollowupAttachmentError").hidden = true;
  renderPendingFiles();
  updateAttachmentHeading();
  $("crmFollowupDrawer").showModal();
  setTimeout(() => form.elements.occurredAt.focus(), 30);
}

export function closeFollowup() {
  if ($("crmFollowupDrawer")?.open) $("crmFollowupDrawer").close();
  pendingFiles = [];
  pending = null;
}

export function buildFollowupPayload(form, kind) {
  const data = new FormData(form);
  const optionalDate = String(data.get("nextFollowupAt") || "");
  return {
    occurredAt: localDateTimeToIso(String(data.get("occurredAt") || "")),
    type: String(data.get("type") || "GENERAL"),
    ownerUserId: String(data.get("ownerUserId") || ""),
    content: String(data.get("content") || "").trim(),
    nextFollowupAt: optionalDate ? localDateTimeToIso(optionalDate) : null,
    ...(kind === "lead" ? { important: data.get("important") === "on", progress: String(data.get("progress") || "").trim() || null, nextAction: String(data.get("nextAction") || "").trim() || null } : {}),
  };
}

async function saveFollowup(event) {
  event.preventDefault();
  if (!pending) return;
  const form = event.currentTarget;
  const errorNode = $("crmFollowupError");
  errorNode.hidden = true;
  const body = buildFollowupPayload(form, pending.kind);
  if (!body.occurredAt || !body.ownerUserId || !body.content) {
    errorNode.textContent = "请填写沟通时间、负责人和沟通记录。";
    errorNode.hidden = false;
    form.reportValidity();
    return;
  }
  const saveButton = $("crmSaveFollowup");
  setButtonBusy(saveButton, true);
  try {
    const resource = pending.kind === "contact" ? "contacts" : "leads";
    const result = await crmApi(`/api/v1/crm/${resource}/${pending.id}/followups`, { method: "POST", body: JSON.stringify(body) });
    const failures = [];
    for (const file of pendingFiles) {
      const upload = new FormData();
      upload.append("file", file, file.name);
      try { await crmApi(`/api/v1/crm/${resource}/${pending.id}/followups/${result.data.id}/attachments/followupAttachments`, { method: "POST", body: upload }); }
      catch (error) { failures.push(`${file.name}：${friendlyError(error).message}`); }
    }
    const onSaved = pending.onSaved;
    closeFollowup();
    context.notify(failures.length ? `跟进已保存，部分附件失败：${failures.join("；")}` : "跟进记录与附件已保存");
    await onSaved?.();
  } catch (error) {
    const copy = friendlyError(error);
    errorNode.textContent = `${copy.title}：${copy.message}`;
    errorNode.hidden = false;
  } finally {
    setButtonBusy(saveButton, false);
  }
}
