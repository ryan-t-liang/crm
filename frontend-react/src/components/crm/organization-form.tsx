import { useState } from "react";
import { crmApi, type CrmUser, type SessionUser, ApiError } from "@/lib/api";
import {
  can,
  friendlyError,
  lifecycleLabels,
  roleLabels,
  type Organization,
} from "@/lib/crm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { DetailTabs, Field, FilterControl, FormDialog } from "./primitives";

export function OrganizationForm({
  organization,
  users,
  me,
  onClose,
  onSaved,
  defaultRole = "PROSPECT",
}: {
  organization?: Organization;
  users: CrmUser[];
  me: SessionUser;
  onClose: () => void;
  onSaved: (row: Organization) => void;
  defaultRole?: string;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      [
        "name",
        "shortName",
        "website",
        "industry",
        "country",
        "region",
        "city",
        "ownerUserId",
        "lifecycleStage",
        "fitReason",
        "note",
        "fitScore",
      ].map((key) => [
        key,
        String(
          (organization as unknown as Record<string, unknown> | undefined)?.[
            key
          ] ??
            (key === "fitScore"
              ? "0"
              : key === "lifecycleStage"
                ? "TARGET"
                : key === "ownerUserId"
                  ? organization
                    ? ""
                    : me.id
                  : ""),
        ),
      ]),
    ),
  );
  const [roles, setRoles] = useState(organization?.roleKeys || [defaultRole]),
    [tab, setTab] = useState("info"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [duplicate, setDuplicate] = useState(false),
    [savedId, setSavedId] = useState(organization?.id),
    [logo, setLogo] = useState<File | null>(null);
  const set = (key: string, value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    setDuplicate(false);
  };
  const scoreAllowed = !organization || can(me, "crm.organization.score.edit");
  async function save() {
    if (!values.name.trim() || !roles.length) {
      setTab("info");
      setError("请填写公司名称并至少选择一个公司角色。");
      return;
    }
    if (values.website && !/^https?:\/\//i.test(values.website)) {
      setTab("info");
      setError("网站需要完整的 http:// 或 https:// 地址。");
      return;
    }
    if (
      scoreAllowed &&
      (!Number.isInteger(Number(values.fitScore)) ||
        Number(values.fitScore) < 0 ||
        Number(values.fitScore) > 100)
    ) {
      setTab("crm");
      setError("Fit Score 必须是 0–100 的整数。");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const payload: Record<string, unknown> = {
        ...Object.fromEntries(
          Object.entries(values).map(([k, v]) => [k, v.trim() || null]),
        ),
        roles,
        fitScore: Number(values.fitScore),
      };
      if (!scoreAllowed) {
        delete payload.fitScore;
        delete payload.fitReason;
      }
      if (!savedId) payload.confirmDuplicate = duplicate;
      const result = await crmApi<{ data: Organization }>(
        `/api/v1/crm/organizations${savedId ? `/${savedId}` : ""}`,
        { method: savedId ? "PATCH" : "POST", body: JSON.stringify(payload) },
      );
      setSavedId(result.data.id);
      if (logo) {
        const body = new FormData();
        body.append("file", logo, logo.name);
        await crmApi(
          `/api/v1/crm/organizations/${result.data.id}/attachments/logo`,
          { method: "POST", body },
        );
        setLogo(null);
      }
      onSaved(result.data);
    } catch (e) {
      if (e instanceof ApiError && e.code === "ORGANIZATION_DUPLICATE_WARNING")
        setDuplicate(true);
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  function text(
    key: string,
    label: string,
    type = "text",
    maxLength = 120,
    wide = false,
  ) {
    return (
      <Field label={label} required={key === "name"} wide={wide}>
        {(id) => (
          <Input
            id={id}
            value={values[key]}
            onChange={(e) => set(key, e.target.value)}
            type={type}
            maxLength={maxLength}
            className="h-9 shadow-none"
          />
        )}
      </Field>
    );
  }
  return (
    <FormDialog
      title={organization ? "编辑公司" : "新建公司"}
      description="公司资料、客户关系与协作信息。"
      wide
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button
            disabled={busy}
            onClick={() => {
              void save();
            }}
          >
            {busy
              ? "保存中…"
              : duplicate
                ? "确认非同一主体，仍然创建"
                : "保存公司"}
          </Button>
        </>
      }
    >
      <DetailTabs
        value={tab}
        onChange={setTab}
        items={[
          ["info", "公司资料"],
          ["crm", "客户关系"],
          ["notes", "备注与文件"],
        ]}
      >
        <div className="grid gap-6 sm:grid-cols-2">
          {tab === "info" && (
            <>
              {text("name", "公司名称", "text", 240, true)}
              {text("shortName", "公司简称")}
              {text("website", "网站", "url", 500)}
              {text("industry", "行业", "text", 160)}
              {text("country", "国家")}
              {text("region", "区域")}
              {text("city", "城市")}
              <fieldset className="sm:col-span-2">
                <legend className="mb-3 text-sm font-medium">公司角色 *</legend>
                <div className="flex flex-wrap gap-5">
                  {Object.entries(roleLabels).map(([key, label]) => (
                    <label
                      key={key}
                      className="flex items-center gap-2 text-sm"
                    >
                      <Checkbox
                        checked={roles.includes(key)}
                        onCheckedChange={(checked) =>
                          setRoles((r) =>
                            checked ? [...r, key] : r.filter((v) => v !== key),
                          )
                        }
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>
            </>
          )}
          {tab === "crm" && (
            <>
              <Field label="负责人">
                {() => (
                  <FilterControl
                    label="负责人"
                    value={values.ownerUserId || "unassigned"}
                    onChange={(v) =>
                      set("ownerUserId", v === "unassigned" ? "" : v)
                    }
                    options={{
                      unassigned: "未分配",
                      ...Object.fromEntries(users.map((u) => [u.id, u.name])),
                    }}
                    all={false}
                  />
                )}
              </Field>
              <Field label="生命周期">
                {() => (
                  <FilterControl
                    label="生命周期"
                    value={values.lifecycleStage}
                    onChange={(v) => set("lifecycleStage", v)}
                    options={lifecycleLabels}
                    all={false}
                  />
                )}
              </Field>
              {scoreAllowed && (
                <>
                  {text("fitScore", "Fit Score（0–100）", "number")}
                  <Field label="Fit 理由" wide>
                    {(id) => (
                      <Textarea
                        id={id}
                        value={values.fitReason}
                        onChange={(e) => set("fitReason", e.target.value)}
                        maxLength={16000}
                      />
                    )}
                  </Field>
                </>
              )}
            </>
          )}
          {tab === "notes" && (
            <>
              <Field label="备注" wide>
                {(id) => (
                  <Textarea
                    id={id}
                    value={values.note}
                    onChange={(e) => set("note", e.target.value)}
                    maxLength={16000}
                    className="min-h-32"
                  />
                )}
              </Field>
              {can(me, "crm.organization.edit") && (
                <Field label="公司 Logo" wide>
                  {(id) => (
                    <>
                      <Input
                        id={id}
                        type="file"
                        accept=".jpg,.jpeg,.png,.gif,.webp"
                        onChange={(e) => setLogo(e.target.files?.[0] || null)}
                      />
                      <p className="text-xs text-muted-foreground">
                        仅图片；上传后替换当前 Logo。
                      </p>
                    </>
                  )}
                </Field>
              )}
            </>
          )}
        </div>
      </DetailTabs>
      {error && (
        <p role="alert" className="mt-5 text-sm text-destructive">
          {error}
        </p>
      )}
    </FormDialog>
  );
}
