import { useEffect, useState } from "react";
import { crmApi, type CrmUser, type SessionUser, ApiError } from "@/lib/api";
import {
  can,
  friendlyError,
  lifecycleLabels,
  type Organization,
} from "@/lib/crm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DetailTabs,
  EntityCombobox,
  Field,
  FilterControl,
  focusFirstInvalidField,
  FormDialog,
} from "./primitives";

type ReferenceNode = {
  code: string;
  label: string;
  parent: string | null;
  level?: number;
};
type CompanyReferenceData = {
  industries: ReferenceNode[];
  countries: ReferenceNode[];
  regions: ReferenceNode[];
  cities: ReferenceNode[];
};

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
        "industryCode",
        "industryCustom",
        "country",
        "countryCode",
        "region",
        "regionCode",
        "city",
        "cityCode",
        "cityCustom",
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
    [fieldErrors, setFieldErrors] = useState<Record<string, string>>({}),
    [duplicate, setDuplicate] = useState(false),
    [savedId, setSavedId] = useState(organization?.id),
    [logo, setLogo] = useState<File | null>(null),
    [referenceData, setReferenceData] = useState<CompanyReferenceData | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void crmApi<{ data: CompanyReferenceData }>(
      "/api/v1/crm/reference-data/company",
      { signal: controller.signal },
    )
      .then((result) => setReferenceData(result.data))
      .catch(() => {});
    return () => controller.abort();
  }, []);
  const set = (key: string, value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: "" }));
    setDuplicate(false);
  };
  const scoreAllowed = !organization || can(me, "crm.organization.score.edit");
  const selectedIndustry = referenceData?.industries.find(
    (item) => item.code === values.industryCode,
  );
  const industryCategory = selectedIndustry?.parent || selectedIndustry?.code || "";
  const regionOptions = [
    ...(referenceData?.regions.filter(
      (item) => item.parent === values.countryCode,
    ) || []),
    { code: "OTHER", label: "其他 / 自定义", parent: values.countryCode || null },
  ];
  const cityOptions = [
    ...(referenceData?.cities.filter(
      (item) => item.parent === values.regionCode,
    ) || []),
    { code: "OTHER", label: "其他 / 自定义", parent: values.regionCode || null },
  ];
  async function save() {
    const clientErrors: Record<string, string> = {};
    if (!values.name.trim()) clientErrors.name = "请填写公司名称。";
    if (!roles.length) clientErrors.roles = "请至少选择一种业务关系。";
    if (values.website && !/^https?:\/\//i.test(values.website)) clientErrors.website = "网站需要完整的 http:// 或 https:// 地址。";
    if (
      scoreAllowed &&
      (!Number.isInteger(Number(values.fitScore)) ||
        Number(values.fitScore) < 0 ||
        Number(values.fitScore) > 100)
    ) {
      clientErrors.fitScore = "客户匹配度必须是 0–100 的整数。";
    }
    setFieldErrors(clientErrors);
    if (Object.keys(clientErrors).length) {
      setTab(clientErrors.fitScore ? "crm" : "info");
      setError("请检查标记字段。");
      focusFirstInvalidField();
      return;
    }
    setBusy(true);
    setError("");
    setFieldErrors({});
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
      if (e instanceof ApiError && Array.isArray(e.details)) {
        const errors = Object.fromEntries(e.details.filter((item: { field?: string }) => item.field).map((item: { field: string; message: string }) => [item.field, item.message]));
        setFieldErrors(errors);
        const first = Object.keys(errors)[0];
        setTab(["ownerUserId", "lifecycleStage", "fitScore", "fitReason"].includes(first) ? "crm" : first === "note" ? "notes" : "info");
        focusFirstInvalidField();
      }
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
      <Field label={label} required={key === "name"} error={fieldErrors[key]} wide={wide}>
        {(id) => (
          <Input
            id={id}
            value={values[key]}
            onChange={(e) => set(key, e.target.value)}
            type={type}
            maxLength={maxLength}
            className="h-9 shadow-none"
            aria-invalid={!!fieldErrors[key]}
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
          ["info", `公司资料${Object.keys(fieldErrors).some((key) => !["ownerUserId", "lifecycleStage", "fitScore", "fitReason", "note"].includes(key)) ? " · 有错误" : ""}`],
          ["crm", `客户关系${Object.keys(fieldErrors).some((key) => ["ownerUserId", "lifecycleStage", "fitScore", "fitReason"].includes(key)) ? " · 有错误" : ""}`],
          ["notes", `备注与文件${fieldErrors.note ? " · 有错误" : ""}`],
        ]}
      >
        <div className="grid gap-6 sm:grid-cols-2">
          {tab === "info" && (
            <>
              {text("name", "公司名称", "text", 240, true)}
              {text("shortName", "公司简称")}
              {text("website", "网站", "url", 500)}
              <Field label="行业大类">
                {() => (
                  <FilterControl
                    label="行业大类"
                    value={industryCategory || "unassigned"}
                    all={false}
                    options={{
                      unassigned: "请选择",
                      ...Object.fromEntries(
                        (referenceData?.industries || [])
                          .filter((item) => item.parent === null)
                          .map((item) => [item.code, item.label]),
                      ),
                    }}
                    onChange={(code) => {
                      if (code === "unassigned") {
                        set("industryCode", "");
                        set("industry", "");
                        return;
                      }
                      const item = referenceData?.industries.find(
                        (entry) => entry.code === code,
                      );
                      set("industryCode", code);
                      set("industry", item?.label || "");
                      set("industryCustom", "");
                    }}
                  />
                )}
              </Field>
              <Field label="细分行业">
                {() => (
                  <FilterControl
                    label="细分行业"
                    value={values.industryCode || "unassigned"}
                    all={false}
                    options={{
                      unassigned: "请选择",
                      ...Object.fromEntries(
                        (referenceData?.industries || [])
                          .filter(
                            (item) =>
                              item.parent === industryCategory ||
                              (industryCategory === "OTHER" && item.code === "OTHER"),
                          )
                          .map((item) => [item.code, item.label]),
                      ),
                    }}
                    onChange={(code) => {
                      const item = referenceData?.industries.find(
                        (entry) => entry.code === code,
                      );
                      set("industryCode", code === "unassigned" ? "" : code);
                      set("industry", code === "unassigned" ? "" : item?.label || "");
                      if (code !== "OTHER") set("industryCustom", "");
                    }}
                  />
                )}
              </Field>
              {values.industryCode === "OTHER" &&
                text("industryCustom", "自定义行业", "text", 160)}
              <Field label="国家 / 地区">
                {() => (
                  <EntityCombobox
                    label="搜索国家或地区"
                    value={values.countryCode}
                    selectedLabel={values.country}
                    options={(referenceData?.countries || []).map((item) => ({
                      id: item.code,
                      label: item.label,
                    }))}
                    onChange={(code, label) => {
                      set("countryCode", code);
                      set("country", label);
                      set("regionCode", "");
                      set("region", "");
                      set("cityCode", "");
                      set("city", "");
                    }}
                  />
                )}
              </Field>
              <Field label="省 / 州 / 区域">
                {() => (
                  <EntityCombobox
                    label="搜索省、州或区域"
                    value={values.regionCode}
                    selectedLabel={values.region}
                    options={regionOptions.map((item) => ({ id: item.code, label: item.label }))}
                    onChange={(code, label) => {
                      set("regionCode", code);
                      set("region", code === "OTHER" ? "" : label);
                      set("cityCode", "");
                      set("city", "");
                    }}
                  />
                )}
              </Field>
              {values.regionCode === "OTHER" && text("region", "自定义区域")}
              <Field label="城市">
                {() => (
                  <EntityCombobox
                    label="搜索城市"
                    value={values.cityCode}
                    selectedLabel={values.city}
                    options={cityOptions.map((item) => ({ id: item.code, label: item.label }))}
                    onChange={(code, label) => {
                      set("cityCode", code);
                      set("city", code === "OTHER" ? "" : label);
                      if (code !== "OTHER") set("cityCustom", "");
                    }}
                  />
                )}
              </Field>
              {values.cityCode === "OTHER" && text("cityCustom", "自定义城市")}
              <fieldset className="sm:col-span-2" aria-invalid={!!fieldErrors.roles} tabIndex={-1}>
                <legend className="mb-1 text-sm font-medium">业务关系 *</legend>
                <p className="mb-3 text-xs text-muted-foreground">这家公司与 Kivisense 的业务关系，可同时是客户、供应商或合作伙伴。</p>
                <div className="flex flex-wrap gap-5">
                  {([
                    ["CUSTOMER_RELATION", "客户"],
                    ["VENDOR", "供应商"],
                    ["PARTNER", "合作伙伴"],
                  ] as const).map(([key, label]) => (
                    <label
                      key={key}
                      className="flex items-center gap-2 text-sm"
                    >
                      <Checkbox
                        checked={key === "CUSTOMER_RELATION" ? roles.some((role) => role === "PROSPECT" || role === "CUSTOMER") : roles.includes(key)}
                        onCheckedChange={(checked) => { setFieldErrors((current) => ({ ...current, roles: "" })); setRoles((current) => {
                          if (key === "CUSTOMER_RELATION") {
                            const withoutCustomer = current.filter((role) => role !== "PROSPECT" && role !== "CUSTOMER");
                            return checked ? [...withoutCustomer, values.lifecycleStage === "CUSTOMER" ? "CUSTOMER" : "PROSPECT"] : withoutCustomer;
                          }
                          return checked ? [...current.filter((role) => role !== key), key] : current.filter((role) => role !== key);
                        }); }}
                      />
                      {label}
                    </label>
                  ))}
                </div>
                {fieldErrors.roles ? <p className="mt-2 text-xs text-destructive">{fieldErrors.roles}</p> : null}
              </fieldset>
            </>
          )}
          {tab === "crm" && (
            <>
              <Field label="公司负责人" error={fieldErrors.ownerUserId}>
                {() => (
                  <FilterControl
                    label="公司负责人"
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
              <Field label="客户阶段" error={fieldErrors.lifecycleStage}>
                {() => (
                  <FilterControl
                    label="客户阶段"
                    value={values.lifecycleStage}
                    onChange={(v) => {
                      set("lifecycleStage", v);
                      setRoles((current) => {
                        if (!current.some((role) => role === "PROSPECT" || role === "CUSTOMER")) return current;
                        return [...current.filter((role) => role !== "PROSPECT" && role !== "CUSTOMER"), v === "CUSTOMER" ? "CUSTOMER" : "PROSPECT"];
                      });
                    }}
                    options={lifecycleLabels}
                    all={false}
                  />
                )}
              </Field>
              {scoreAllowed && (
                <>
                  {text("fitScore", "客户匹配度（0–100）", "number")}
                  <Field label="匹配度理由" error={fieldErrors.fitReason} wide>
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
              <Field label="备注" error={fieldErrors.note} wide>
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
