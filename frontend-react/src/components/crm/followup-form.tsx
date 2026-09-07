import { useCallback, useState } from "react";
import { crmApi, type CrmUser, type SessionUser } from "@/lib/api";
import {
  friendlyError,
  localInput,
  queryString,
  type Contact,
  type PageResult,
} from "@/lib/crm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { EntityCombobox, Field, FilterControl, FormDialog } from "./primitives";
import { attachmentAccept } from "./attachment-list";

export type FollowupTarget = {
  kind: "contact" | "lead";
  id?: string;
  organizationId?: string;
  label: string;
  currentTaskId?: string;
};
export function FollowupForm({
  target,
  me,
  users,
  onClose,
  onSaved,
}: {
  target: FollowupTarget;
  me: SessionUser;
  users: CrmUser[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [contactId, setContactId] = useState(target.id || ""),
    [contactLabel, setContactLabel] = useState(target.id ? target.label : ""),
    [owner, setOwner] = useState(me.id),
    [occurredAt, setOccurredAt] = useState(localInput()),
    [type, setType] = useState("GENERAL"),
    [content, setContent] = useState(""),
    [progress, setProgress] = useState(""),
    [nextAction, setNextAction] = useState(""),
    [nextDate, setNextDate] = useState(""),
    [important, setImportant] = useState(false),
    [files, setFiles] = useState<File[]>([]),
    [savedId, setSavedId] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const loadContacts = useCallback(
    async (keyword: string, signal: AbortSignal) => {
      const r = await crmApi<PageResult<Contact>>(
        `/api/v1/crm/contacts?${queryString({ keyword, organizationId: target.organizationId, pageSize: 20 })}`,
        { signal },
      );
      return r.data.map((c) => ({
        id: c.id,
        label: c.contactName,
        description: [c.companyName, c.email].filter(Boolean).join(" · "),
      }));
    },
    [target.organizationId],
  );
  async function save() {
    if (!contactId || !content.trim() || !occurredAt) {
      setError("请选择联系人，并填写互动时间和内容。");
      return;
    }
    setBusy(true);
    setError("");
    const endpoint = `/api/v1/crm/${target.kind === "lead" ? "leads" : "contacts"}/${contactId}/followups`;
    try {
      let id = savedId;
      if (!id) {
        const r = await crmApi<{ data: { id: string } }>(endpoint, {
          method: "POST",
          body: JSON.stringify({
            occurredAt: new Date(occurredAt).toISOString(),
            ownerUserId: owner,
            type,
            content: content.trim(),
            nextAction: nextAction.trim() || null,
            nextFollowupAt: nextDate ? new Date(nextDate).toISOString() : null,
            currentTaskId: target.currentTaskId || null,
            ...(target.kind === "lead"
              ? { progress: progress.trim() || null, important }
              : {}),
          }),
        });
        id = r.data.id;
        setSavedId(id);
      }
      for (const file of files) {
        const body = new FormData();
        body.append("file", file, file.name);
        await crmApi(`${endpoint}/${id}/attachments/followupAttachments`, {
          method: "POST",
          body,
        });
        setFiles((current) => current.filter((f) => f !== file));
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(
        `${savedId ? "互动已保存，附件尚未全部上传。" : ""}${friendlyError(e)}`,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <FormDialog
      title={target.kind === "lead" ? "新增跟进" : "新增互动"}
      description={target.label}
      wide
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            取消
          </Button>
          <Button
            disabled={busy}
            onClick={() => {
              void save();
            }}
          >
            {busy ? "保存中…" : savedId ? "重试剩余附件" : "保存互动"}
          </Button>
        </>
      }
    >
      <fieldset disabled={!!savedId} className="grid gap-6 sm:grid-cols-2">
        {!target.id && (
          <Field label="联系人" required wide>
            {() => (
              <EntityCombobox
                label="联系人"
                value={contactId}
                selectedLabel={contactLabel}
                onChange={(id, label) => {
                  setContactId(id);
                  setContactLabel(label);
                }}
                load={loadContacts}
              />
            )}
          </Field>
        )}
        <Field label="互动时间" required>
          {(id) => (
            <Input
              id={id}
              type="datetime-local"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
            />
          )}
        </Field>
        <Field label="方式">
          {() => (
            <FilterControl
              label="方式"
              value={type}
              onChange={setType}
              all={false}
              options={{
                GENERAL: "一般",
                MEETING: "会议",
                CALL: "电话",
                EMAIL: "邮件",
                WECHAT: "微信",
                OTHER: "其他",
              }}
            />
          )}
        </Field>
        <Field label="负责人">
          {() => (
            <FilterControl
              label="负责人"
              value={owner}
              onChange={setOwner}
              all={false}
              options={Object.fromEntries(users.map((u) => [u.id, u.name]))}
            />
          )}
        </Field>
        {target.kind === "lead" && (
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={important}
              onCheckedChange={(v) => setImportant(v === true)}
            />
            重要跟进
          </label>
        )}
        <Field label="互动内容" required wide>
          {(id) => (
            <Textarea
              id={id}
              className="min-h-28"
              value={content}
              maxLength={16000}
              onChange={(e) => setContent(e.target.value)}
            />
          )}
        </Field>
        {target.kind === "lead" && (
          <Field label="当前进展" wide>
            {(id) => (
              <Textarea
                id={id}
                value={progress}
                maxLength={16000}
                onChange={(e) => setProgress(e.target.value)}
              />
            )}
          </Field>
        )}
        <Field label="下一步行动">
          {(id) => (
            <Textarea
              id={id}
              value={nextAction}
              maxLength={16000}
              onChange={(e) => setNextAction(e.target.value)}
            />
          )}
        </Field>
        <Field label="下次跟进">
          {(id) => (
            <Input
              id={id}
              type="datetime-local"
              value={nextDate}
              onChange={(e) => setNextDate(e.target.value)}
            />
          )}
        </Field>
      </fieldset>
      <div className="mt-6">
        <Field label="互动附件" wide>
          {(id) => (
            <Input
              id={id}
              type="file"
              accept={attachmentAccept}
              multiple
              onChange={(e) => setFiles(Array.from(e.target.files || []))}
            />
          )}
        </Field>
        {files.length > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            {files.map((f) => f.name).join("、")}
          </p>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      )}
    </FormDialog>
  );
}
