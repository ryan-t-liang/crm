"use strict";

import { $, crmApi, esc, formatLocalDateTime, friendlyError, localDateTimeToIso, setButtonBusy, toDateTimeInput } from "./api.js";
import { FOLLOWUP_TYPES, followupTypeLabel } from "./field-definitions.js";

let context;
let pending;

export function renderTimelineMarkup(items, kind) {
  if (!items.length) return '<div class="crm-timeline-empty">暂无跟进记录</div>';
  return items.map((item) => `<article class="crm-timeline-item" data-followup-id="${esc(item.id)}">
    <div class="crm-timeline-marker" aria-hidden="true"></div>
    <div class="crm-timeline-content">
      <header><strong>${esc(followupTypeLabel(item.type))}</strong><time>${esc(formatLocalDateTime(item.occurredAt))}</time>${kind === "lead" && item.important ? '<span class="crm-important">重要</span>' : ""}</header>
      <p>${esc(item.content)}</p>
      <footer><span>负责人 ${esc(item.owner?.name || "-")}</span><span>创建人 ${esc(item.createdBy?.name || "-")}</span><span>录入 ${esc(formatLocalDateTime(item.createdAt))}</span></footer>
    </div>
  </article>`).join("");
}

export function initializeFollowups(options) {
  context = options;
  if (!$('crmFollowupDrawer')) {
    document.body.insertAdjacentHTML("beforeend", `<aside class="crm-drawer" id="crmFollowupDrawer" aria-hidden="true">
      <button class="crm-drawer-backdrop" type="button" data-close-followup aria-label="关闭跟进表单"></button>
      <form class="crm-drawer-panel crm-drawer-narrow" id="crmFollowupForm" novalidate>
        <header class="crm-drawer-header"><div><span class="crm-eyebrow">沟通记录</span><h2 id="crmFollowupTitle">新增跟进</h2></div><button class="crm-icon-button" type="button" data-close-followup aria-label="关闭"><svg><use href="#i-x"/></svg></button></header>
        <div class="crm-drawer-body">
          <div class="crm-form-grid crm-form-grid-single">
            <label class="crm-field"><span>沟通时间<b aria-hidden="true">*</b></span><input name="occurredAt" type="datetime-local" required><small class="crm-field-error"></small></label>
            <label class="crm-field"><span>沟通方式<b aria-hidden="true">*</b></span><select name="type" required>${FOLLOWUP_TYPES.map((item) => `<option value="${item.value}">${esc(item.label)}</option>`).join("")}</select><small class="crm-field-error"></small></label>
            <label class="crm-field"><span>负责人<b aria-hidden="true">*</b></span><select name="ownerUserId" required></select><small class="crm-field-error"></small></label>
            <label class="crm-field crm-important-field" id="crmImportantField" hidden><span>重要跟进</span><span class="crm-toggle-row"><input name="important" type="checkbox"><span>标记为重要</span></span></label>
            <label class="crm-field"><span>沟通记录<b aria-hidden="true">*</b></span><textarea name="content" maxlength="16000" required></textarea><small class="crm-field-error"></small></label>
          </div>
          <div class="crm-form-message" id="crmFollowupError" role="alert" hidden></div>
        </div>
        <footer class="crm-drawer-footer"><button class="btn" type="button" data-close-followup>取消</button><button class="btn btn-primary" id="crmSaveFollowup" type="submit">保存跟进</button></footer>
      </form>
    </aside>`);
  }
  document.querySelectorAll("[data-close-followup]").forEach((button) => button.addEventListener("click", closeFollowup));
  $("crmFollowupForm").addEventListener("submit", saveFollowup);
}

export function openFollowup({ kind, id, title, onSaved }) {
  pending = { kind, id, onSaved };
  const form = $("crmFollowupForm");
  form.reset();
  form.elements.occurredAt.value = toDateTimeInput(new Date());
  form.elements.type.value = "GENERAL";
  const users = context.getUsers();
  form.elements.ownerUserId.innerHTML = users.map((user) => `<option value="${esc(user.id)}"${user.id === context.currentUserId() ? " selected" : ""}>${esc(user.name)}</option>`).join("");
  $("crmImportantField").hidden = kind !== "lead";
  $("crmFollowupTitle").textContent = title;
  $("crmFollowupError").hidden = true;
  $("crmFollowupDrawer").classList.add("is-open");
  $("crmFollowupDrawer").setAttribute("aria-hidden", "false");
  setTimeout(() => form.elements.occurredAt.focus(), 30);
}

export function closeFollowup() {
  $("crmFollowupDrawer")?.classList.remove("is-open");
  $("crmFollowupDrawer")?.setAttribute("aria-hidden", "true");
  pending = null;
}

export function buildFollowupPayload(form, kind) {
  const data = new FormData(form);
  return {
    occurredAt: localDateTimeToIso(String(data.get("occurredAt") || "")),
    type: String(data.get("type") || "GENERAL"),
    ownerUserId: String(data.get("ownerUserId") || ""),
    content: String(data.get("content") || "").trim(),
    ...(kind === "lead" ? { important: data.get("important") === "on" } : {}),
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
    await crmApi(`/api/v1/crm/${resource}/${pending.id}/followups`, { method: "POST", body: JSON.stringify(body) });
    const onSaved = pending.onSaved;
    closeFollowup();
    context.notify("跟进记录已保存");
    await onSaved?.();
  } catch (error) {
    const copy = friendlyError(error);
    errorNode.textContent = `${copy.title}：${copy.message}`;
    errorNode.hidden = false;
  } finally {
    setButtonBusy(saveButton, false);
  }
}
