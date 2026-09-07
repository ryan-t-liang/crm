import { useCallback, useState } from "react";
import {
  CONTACT_FIELDS,
  LEAD_FIELDS,
  type FieldDefinition,
} from "../../../../frontend/js/field-definitions.js";
import { ApiError, crmApi, type CrmUser, type SessionUser } from "@/lib/api";
import {
  can,
  friendlyError,
  localInput,
  queryString,
  type Contact,
  type Organization,
  type PageResult,
  type Attachment,
} from "@/lib/crm";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DetailTabs,
  EntityCombobox,
  Field,
  FilterControl,
  FormDialog,
} from "./primitives";
import { AttachmentList, attachmentAccept } from "./attachment-list";

export type EntityRecord = {
  id: string;
  attachments?: Attachment[];
  [key: string]: unknown;
};
const companyFields = new Set([
  "companyShortName",
  "companyName",
  "website",
  "industry",
  "country",
  "region",
  "city",
]);
const attachmentFields: Record<
  string,
  { key: string; label: string; accept?: string }
> = {
  requirementDetail: { key: "requirementFiles", label: "需求附件" },
  imageRequirementNote: {
    key: "requirementImages",
    label: "图片参考",
    accept: ".jpg,.jpeg,.png,.gif,.webp",
  },
  solution: { key: "proposalFiles", label: "正式方案" },
  quotationNote: {
    key: "quotationFiles",
    label: "报价文件",
    accept:
      ".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt",
  },
};
export function EntityForm({
  kind,
  record,
  organization,
  contact,
  me,
  users,
  onClose,
  onSaved,
}: {
  kind: "contact" | "lead";
  record?: EntityRecord;
  organization?: Pick<Organization, "id" | "name">;
  contact?: Pick<Contact, "id" | "contactName">;
  me: SessionUser;
  users: CrmUser[];
  onClose: () => void;
  onSaved: (row: EntityRecord) => void;
}) {
  const definitions = kind === "contact" ? CONTACT_FIELDS : LEAD_FIELDS;
  const tabs: [string, string][] =
    kind === "contact"
      ? [
          ["basic", "基本资料"],
          ["crm", "CRM 状态"],
          ["notes", "备注与附件"],
        ]
      : [
          ["basic", "基础信息"],
          ["requirement", "需求信息"],
          ["commercial", "方案与报价"],
          ["team", "团队协作"],
          ["milestones", "里程碑"],
        ];
  const [tab, setTab] = useState("basic"),
    [values, setValues] = useState<Record<string, string | string[]>>(() =>
      Object.fromEntries(
        definitions.map((d) => {
          let value =
            (d.key === "participantUserIds" && record
              ? (record.participants as { user: CrmUser }[] | undefined)?.map(
                  (p) => p.user.id,
                )
              : record?.[d.key]) ??
            (d.key === "stage"
              ? "INITIAL"
              : d.key === "status"
                ? "NEW"
                : d.key === "priority"
                  ? "MEDIUM"
                  : [
                        "ownerUserId",
                        "salesOwnerUserId",
                        "followupOwnerUserId",
                      ].includes(d.key)
                    ? record
                      ? ""
                      : me.id
                    : d.type === "multi-user"
                      ? []
                      : "");
          if (d.type === "datetime-local" && value)
            value = localInput(String(value));
          return [
            d.key,
            Array.isArray(value) ? (value as string[]) : String(value),
          ];
        }),
      ),
    );
  const [relationId, setRelationId] = useState(
      kind === "contact"
        ? organization?.id || String(record?.organizationId || "")
        : contact?.id || String(record?.contactId || ""),
    ),
    [relationLabel, setRelationLabel] = useState(
      kind === "contact"
        ? organization?.name || String(record?.companyName || "")
        : contact?.contactName ||
            String((record?.contact as Contact | undefined)?.contactName || ""),
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [fieldErrors, setFieldErrors] = useState<Record<string, string>>({}),
    [savedId, setSavedId] = useState(record?.id),
    [files, setFiles] = useState<Record<string, File[]>>({}),
    [attachments, setAttachments] = useState(record?.attachments || []);
  const loadRelation = useCallback(
    async (keyword: string, signal: AbortSignal) => {
      if (kind === "contact") {
        const r = await crmApi<PageResult<Organization>>(
          `/api/v1/crm/organizations?${queryString({ keyword, pageSize: 20 })}`,
          { signal },
        );
        return r.data.map((o) => ({
          id: o.id,
          label: o.name,
          description: o.shortName,
        }));
      }
      const r = await crmApi<PageResult<Contact>>(
        `/api/v1/crm/contacts?${queryString({ keyword, organizationId: organization?.id, pageSize: 20 })}`,
        { signal },
      );
      return r.data.map((c) => ({
        id: c.id,
        label: c.contactName,
        description: [c.companyName, c.email, c.phone]
          .filter(Boolean)
          .join(" · "),
      }));
    },
    [kind, organization?.id],
  );
  const update = (key: string, value: string | string[]) =>
    setValues((v) => ({ ...v, [key]: value }));
  const endpoint = `/api/v1/crm/${kind === "contact" ? "contacts" : "leads"}`;
  async function save() {
    const errors: Record<string, string> = {};
    for (const d of definitions) {
      const value = values[d.key];
      if (d.required && !String(value || "").trim())
        errors[d.key] = `请填写${d.label}`;
      if (
        d.type === "email" &&
        value &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))
      )
        errors[d.key] = "请输入有效 Email";
      if (d.type === "url" && value && !/^https?:\/\//i.test(String(value)))
        errors[d.key] = "请输入完整 http:// 或 https:// 地址";
    }
    if (kind === "lead" && !relationId) errors.contactId = "请选择关联联系人";
    if (kind === "lead" && values.estimatedQuote && !values.currency)
      errors.currency = "填写报价时必须选择币种";
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      setTab(definitions.find((d) => errors[d.key])?.tab || "basic");
      setError("请检查标记的必填项或格式。");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const payload = Object.fromEntries(
        definitions
          .filter(
            (d) =>
              !(kind === "contact" && relationId && companyFields.has(d.key)),
          )
          .map((d) => [
            d.key,
            d.type === "multi-user"
              ? values[d.key]
              : values[d.key]
                ? d.type === "datetime-local"
                  ? new Date(String(values[d.key])).toISOString()
                  : String(values[d.key]).trim()
                : null,
          ]),
      );
      if (kind === "contact") payload.organizationId = relationId || null;
      if (kind === "lead" && !savedId) payload.contactId = relationId;
      const response = await crmApi<{ data: EntityRecord }>(
        `${endpoint}${savedId ? `/${savedId}` : ""}`,
        { method: savedId ? "PATCH" : "POST", body: JSON.stringify(payload) },
      );
      setSavedId(response.data.id);
      for (const [key, selected] of Object.entries(files)) {
        for (const file of selected) {
          const body = new FormData();
          body.append("file", file, file.name);
          const uploaded = await crmApi<{ data: Attachment }>(
            `${endpoint}/${response.data.id}/attachments/${key}`,
            { method: "POST", body },
          );
          setAttachments((old) => [...old, uploaded.data]);
          setFiles((old) => ({
            ...old,
            [key]: old[key].filter((f) => f !== file),
          }));
        }
      }
      onSaved(response.data);
    } catch (e) {
      if (e instanceof ApiError && Array.isArray(e.details)) {
        const errors = Object.fromEntries(
          e.details
            .filter((d: { field?: string }) => d.field)
            .map((d: { field: string; message: string }) => [
              d.field,
              d.message,
            ]),
        );
        setFieldErrors(errors);
        setTab(definitions.find((d) => errors[d.key])?.tab || "basic");
      }
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  function control(d: FieldDefinition, id: string) {
    const value = values[d.key];
    if (d.type === "custom-select")
      return (
        <EntityCombobox
          label={d.label}
          value={String(value || "")}
          selectedLabel={String(value || "")}
          allowCustom
          maxLength={d.maxLength}
          options={(d.options || []).map((o) => ({
            id: o.value,
            label: o.label,
          }))}
          onChange={(v) => update(d.key, v)}
        />
      );
    if (d.type === "user" || d.type === "select")
      return (
        <FilterControl
          label={d.label}
          value={String(value || "unassigned")}
          onChange={(v) => update(d.key, v === "unassigned" ? "" : v)}
          options={{
            ...(!d.required ? { unassigned: "未选择" } : {}),
            ...Object.fromEntries(
              d.type === "user"
                ? users.map((u) => [u.id, u.name])
                : (d.options || []).map((o) => [o.value, o.label]),
            ),
          }}
          all={false}
          className="w-full"
        />
      );
    if (d.type === "multi-user")
      return (
        <div className="flex flex-wrap gap-4">
          {users.map((user) => (
            <label className="flex items-center gap-2 text-sm" key={user.id}>
              <Checkbox
                checked={Array.isArray(value) && value.includes(user.id)}
                onCheckedChange={(checked) =>
                  update(
                    d.key,
                    checked
                      ? [...(Array.isArray(value) ? value : []), user.id]
                      : (Array.isArray(value) ? value : []).filter(
                          (v) => v !== user.id,
                        ),
                  )
                }
              />
              {user.name}
            </label>
          ))}
        </div>
      );
    if (["textarea", "multi-text", "multi-select"].includes(d.type))
      return (
        <Textarea
          id={id}
          value={String(value || "")}
          onChange={(e) => update(d.key, e.target.value)}
          maxLength={d.maxLength}
          placeholder={d.type !== "textarea" ? "每行填写一项" : undefined}
          aria-invalid={!!fieldErrors[d.key]}
          aria-describedby={fieldErrors[d.key] ? `${id}-error` : undefined}
        />
      );
    return (
      <Input
        id={id}
        type={d.type === "custom-select" ? "text" : d.type}
        value={String(value || "")}
        onChange={(e) => update(d.key, e.target.value)}
        maxLength={d.maxLength}
        min={d.min}
        step={d.step}
        aria-invalid={!!fieldErrors[d.key]}
        aria-describedby={fieldErrors[d.key] ? `${id}-error` : undefined}
      />
    );
  }
  function fileField(key: string, label: string, accept = attachmentAccept) {
    if (!can(me, `crm.${kind}.edit`)) return null;
    return (
      <div className="space-y-2 sm:col-span-2" key={key}>
        <Field label={label} wide>
          {(id) => (
            <Input
              id={id}
              type="file"
              accept={accept}
              multiple
              onChange={(e) =>
                setFiles((f) => ({
                  ...f,
                  [key]: Array.from(e.target.files || []),
                }))
              }
            />
          )}
        </Field>
        {files[key]?.length > 0 && (
          <p className="text-xs text-muted-foreground">
            待上传：{files[key].map((f) => f.name).join("、")}
          </p>
        )}
        {savedId && attachments.some((f) => f.fieldKey === key) && (
          <AttachmentList
            title="已上传"
            files={attachments.filter((f) => f.fieldKey === key)}
            endpoint={`${endpoint}/${savedId}`}
          />
        )}
      </div>
    );
  }
  return (
    <FormDialog
      title={`${record ? "编辑" : "新增"}${kind === "contact" ? "联系人" : "商机"}`}
      wide
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button
            onClick={() => {
              void save();
            }}
            disabled={busy}
          >
            {busy ? "保存中…" : kind === "contact" ? "保存联系人" : "保存商机"}
          </Button>
        </>
      }
    >
      <DetailTabs
        value={tab}
        onChange={setTab}
        items={tabs.map(([key, label]) => [
          key,
          `${label}${definitions.some((d) => d.tab === key && fieldErrors[d.key]) ? " · 有错误" : ""}`,
        ])}
      >
        <div className="grid gap-6 sm:grid-cols-2">
          {tab === "basic" && (
            <Field
              label={kind === "contact" ? "所属公司" : "关联联系人"}
              required={kind === "lead"}
              error={fieldErrors.contactId}
              wide
            >
              {() =>
                record && kind === "lead" ? (
                  <p className="text-sm">{relationLabel}</p>
                ) : (
                  <>
                    <EntityCombobox
                      label={
                        kind === "contact"
                          ? "公司"
                          : "联系人、公司、Email 或 Phone"
                      }
                      value={relationId}
                      selectedLabel={relationLabel}
                      onChange={(id, label) => {
                        setRelationId(id);
                        setRelationLabel(label);
                      }}
                      load={loadRelation}
                    />
                    {kind === "contact" && relationId && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setRelationId("");
                          setRelationLabel("");
                        }}
                      >
                        清除关联公司
                      </Button>
                    )}
                  </>
                )
              }
            </Field>
          )}
          {definitions
            .filter(
              (d) =>
                d.tab === tab &&
                !(kind === "contact" && relationId && companyFields.has(d.key)),
            )
            .map((d) => (
              <div
                key={d.key}
                className={d.wide ? "space-y-4 sm:col-span-2" : "space-y-4"}
              >
                <Field
                  label={d.label}
                  required={d.required}
                  error={fieldErrors[d.key]}
                  wide={d.wide}
                >
                  {(id) => control(d, id)}
                </Field>
                {kind === "lead" &&
                  attachmentFields[d.key] &&
                  fileField(
                    attachmentFields[d.key].key,
                    attachmentFields[d.key].label,
                    attachmentFields[d.key].accept,
                  )}
              </div>
            ))}
          {kind === "contact" &&
            tab === "notes" &&
            fileField("meetingMinutesFiles", "历史会议资料")}
        </div>
      </DetailTabs>
      {error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      )}
    </FormDialog>
  );
}
