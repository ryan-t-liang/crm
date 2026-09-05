"use strict";

const modulePath = new URL(import.meta.url).pathname;
const suffix = "/js/api.js";

export const APP_BASE_PATH = modulePath.endsWith(suffix) ? modulePath.slice(0, -suffix.length) : "";
export const appUrl = (path) => `${APP_BASE_PATH}${path.startsWith("/") ? path : `/${path}`}`;

export async function crmApi(path, options = {}) {
  const headers = {
    accept: "application/json",
    ...(options.body instanceof FormData ? {} : { "content-type": "application/json" }),
    ...(options.headers || {}),
  };
  const response = await fetch(appUrl(path), { credentials: "same-origin", ...options, headers });
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : null;
  if (!response.ok) {
    const error = new Error(payload?.error?.message || `请求失败（${response.status}）`);
    error.code = payload?.error?.code;
    error.status = response.status;
    error.fieldErrors = payload?.error?.fieldErrors || [];
    error.details = payload?.error?.details || null;
    error.traceId = payload?.traceId || response.headers.get("x-trace-id");
    if (typeof window !== "undefined") {
      if (response.status === 401) window.dispatchEvent(new CustomEvent("crm:unauthenticated"));
      if (error.code === "PASSWORD_CHANGE_REQUIRED") window.dispatchEvent(new CustomEvent("crm:password-required"));
    }
    throw error;
  }
  return payload;
}

export const $ = (id) => document.getElementById(id);
export const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "'": "&#39;",
  '"': "&quot;",
})[char]);

export const displayValue = (value) => value === null || value === undefined || value === "" ? "-" : String(value);

export function formatLocalDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).replace("T", " ");
}

export function toDateTimeInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function localDateTimeToIso(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function dateRangeForPreset(preset, now = new Date()) {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
  if (preset === "overdue") return { nextFollowupTo: now.toISOString() };
  if (preset === "today") return { nextFollowupFrom: startOfToday.toISOString(), nextFollowupTo: new Date(startOfTomorrow.getTime() - 1).toISOString() };
  if (preset === "next7") return { nextFollowupFrom: now.toISOString(), nextFollowupTo: new Date(now.getTime() + 7 * 86_400_000).toISOString() };
  return {};
}

export function friendlyError(error) {
  const status = Number(error?.status || 0);
  if (status === 401) return { title: "登录已失效", message: "请重新登录后继续操作。" };
  if (status === 403) return { title: "没有操作权限", message: "你没有执行此操作的权限。" };
  if (status === 404) return { title: "记录不存在", message: "该记录不存在或已无法访问。" };
  if (status === 409) return { title: "无法完成操作", message: error?.message || "当前数据状态不允许执行此操作。" };
  if (status === 413) return { title: "附件过大", message: error?.message || "请压缩文件后重试。" };
  if (status === 415) return { title: "附件格式不支持", message: error?.message || "请选择支持的文件格式。" };
  if (status === 400 || status === 422) return { title: "提交内容有误", message: error?.message || "请检查填写内容后重试。" };
  return { title: "暂时无法完成请求", message: error?.message || "系统发生意外错误，请稍后重试。" };
}

export function renderErrorMarkup(error, retryId = "") {
  const copy = friendlyError(error);
  return `<div class="crm-state crm-state-error" role="alert"><svg><use href="#i-x"/></svg><strong>${esc(copy.title)}</strong><span>${esc(copy.message)}</span>${error?.traceId ? `<small>参考编号 ${esc(error.traceId)}</small>` : ""}${retryId ? `<button class="btn btn-small" type="button" id="${esc(retryId)}">重试</button>` : ""}</div>`;
}

export function setButtonBusy(button, busy, busyLabel = "正在保存") {
  if (!button) return;
  if (busy) button.dataset.originalLabel = button.textContent;
  button.disabled = busy;
  button.classList.toggle("is-busy", busy);
  button.textContent = busy ? busyLabel : button.dataset.originalLabel || button.textContent;
}
