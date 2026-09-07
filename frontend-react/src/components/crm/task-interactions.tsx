import { useState } from "react";
import { Check, Clock3 } from "lucide-react";
import { crmApi, type SessionUser, type CrmUser } from "@/lib/api";
import {
  canManageTask,
  can,
  dateTime,
  friendlyError,
  localInput,
  type Task,
  type Organization,
  type Nurture,
} from "@/lib/crm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  EmptyState,
  Field,
  FilterControl,
  FormDialog,
  StatusBadge,
} from "./primitives";

export type TaskTarget = {
  organizationId?: string;
  contactId?: string;
  leadId?: string;
  label: string;
};
export function TaskForm({
  target,
  me,
  users,
  onClose,
  onSaved,
}: {
  target: TaskTarget;
  me: SessionUser;
  users: CrmUser[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(""),
    [description, setDescription] = useState(""),
    [owner, setOwner] = useState(me.id),
    [priority, setPriority] = useState("NORMAL"),
    [due, setDue] = useState(localInput(new Date(Date.now() + 86400000))),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save() {
    if (!title.trim() || !due) {
      setError("请填写任务标题和到期时间。");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { label: _label, ...relation } = target;
      await crmApi("/api/v1/crm/tasks", {
        method: "POST",
        body: JSON.stringify({
          ...relation,
          title: title.trim(),
          description,
          ownerUserId: owner,
          priority,
          dueAt: new Date(due).toISOString(),
          source: "MANUAL",
        }),
      });
      onSaved();
      onClose();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  const allowedUsers =
    me.role.key === "SUPER_ADMIN" ||
    me.permissions.includes("crm.dashboard.management.view")
      ? users
      : users.filter((u) => u.id === me.id);
  return (
    <FormDialog
      title="创建任务"
      description={target.label}
      onClose={onClose}
      busy={busy}
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
            {busy ? "保存中…" : "保存任务"}
          </Button>
        </>
      }
    >
      <div className="grid gap-6 sm:grid-cols-2">
        <Field label="任务标题" required wide>
          {(id) => (
            <Input
              id={id}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={300}
            />
          )}
        </Field>
        <Field label="说明" wide>
          {(id) => (
            <Textarea
              id={id}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={16000}
            />
          )}
        </Field>
        <Field label="负责人" required>
          {() => (
            <FilterControl
              label="负责人"
              value={owner}
              onChange={setOwner}
              options={Object.fromEntries(
                allowedUsers.map((u) => [u.id, u.name]),
              )}
              all={false}
            />
          )}
        </Field>
        <Field label="优先级">
          {() => (
            <FilterControl
              label="优先级"
              value={priority}
              onChange={setPriority}
              options={{ NORMAL: "普通", HIGH: "高" }}
              all={false}
            />
          )}
        </Field>
        <Field label="到期时间" required wide>
          {(id) => (
            <Input
              id={id}
              type="datetime-local"
              value={due}
              onChange={(e) => setDue(e.target.value)}
            />
          )}
        </Field>
      </div>
      {error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      )}
    </FormDialog>
  );
}
export function TaskQueue({
  tasks,
  me,
  onChanged,
  onFollowup,
}: {
  tasks: Task[];
  me: SessionUser;
  onChanged: () => void;
  onFollowup?: (task: Task) => void;
}) {
  const [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  async function mutate(task: Task, action: "complete" | "postpone") {
    setBusy(task.id);
    setError("");
    try {
      await crmApi(
        `/api/v1/crm/tasks/${task.id}${action === "complete" ? "/complete" : ""}`,
        {
          method: action === "complete" ? "POST" : "PATCH",
          body: JSON.stringify(
            action === "complete"
              ? {}
              : {
                  dueAt: new Date(
                    Date.parse(task.dueAt) + 86400000,
                  ).toISOString(),
                },
          ),
        },
      );
      onChanged();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy("");
    }
  }
  if (!tasks.length)
    return (
      <EmptyState
        title="暂无任务"
        description="创建一个下一步行动，明确负责人和到期时间。"
      />
    );
  return (
    <div>
      {error && (
        <p role="alert" className="mb-3 text-sm text-destructive">
          {error}
        </p>
      )}
      <ul className="divide-y">
        {tasks.map((task) => (
          <li
            key={task.id}
            className={`flex flex-wrap items-center gap-4 py-4 ${task.status !== "OPEN" ? "opacity-60" : ""}`}
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{task.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                <a
                  className="hover:underline"
                  href={
                    task.leadId
                      ? `#leads/${task.leadId}`
                      : task.contactId
                        ? `#contacts/${task.contactId}`
                        : `#organizations/${task.organizationId}`
                  }
                >
                  {task.lead?.requirementSummary ||
                    task.organization?.name ||
                    task.contact?.contactName ||
                    task.description ||
                    "打开详情"}
                </a>
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span
                  className={
                    task.status === "OPEN" &&
                    Date.parse(task.dueAt) < Date.now()
                      ? "text-amber-700"
                      : ""
                  }
                >
                  {dateTime(task.dueAt)}
                </span>
                <span>{task.owner?.name || "—"}</span>
                <StatusBadge>
                  {
                    (
                      {
                        OPEN: "待完成",
                        DONE: "已完成",
                        CANCELED: "已取消",
                      } as Record<string, string>
                    )[task.status]
                  }
                </StatusBadge>
                {task.priority === "HIGH" && <span>高优先级</span>}
              </div>
            </div>
            {task.status === "OPEN" && (
              <div className="flex items-center gap-1">
                {onFollowup &&
                  can(me, "crm.task.create") &&
                  canManageTask(
                    me,
                    task,
                    task.leadId
                      ? "crm.lead_followup.create"
                      : "crm.contact_followup.create",
                  ) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onFollowup(task)}
                    >
                      跟进
                    </Button>
                  )}
                {canManageTask(me, task, "crm.task.edit") && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!!busy}
                    onClick={() => {
                      void mutate(task, "postpone");
                    }}
                  >
                    <Clock3 />
                    推迟一天
                  </Button>
                )}
                {canManageTask(me, task, "crm.task.complete") && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!!busy}
                    onClick={() => {
                      void mutate(task, "complete");
                    }}
                  >
                    <Check />
                    完成
                  </Button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
export function NurtureForm({
  organization,
  nurture,
  users,
  me,
  onClose,
  onSaved,
}: {
  organization: Pick<Organization, "id" | "name">;
  nurture?: Nurture;
  users: CrmUser[];
  me: SessionUser;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [values, setValues] = useState({
      ownerUserId: nurture?.ownerUserId || me.id,
      reason: nurture?.reason || "",
      objective: nurture?.objective || "",
      cadenceDays: String(nurture?.cadenceDays || 14),
      nextTouchAt: localInput(
        nurture?.nextTouchAt || new Date(Date.now() + 14 * 86400000),
      ),
      touchTopic: nurture?.touchTopic || "",
      status: nurture?.status || "ACTIVE",
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const set = (key: keyof typeof values, value: string) =>
    setValues((v) => ({ ...v, [key]: value }));
  async function save() {
    if (
      !values.reason.trim() ||
      !values.objective.trim() ||
      !values.touchTopic.trim() ||
      !values.nextTouchAt ||
      !values.ownerUserId
    ) {
      setError("请补全经营原因、目标、触达主题、负责人和下次触达时间。");
      return;
    }
    setBusy(true);
    try {
      const { status, ...fields } = values;
      await crmApi(
        nurture
          ? `/api/v1/crm/nurtures/${nurture.id}`
          : `/api/v1/crm/organizations/${organization.id}/nurtures`,
        {
          method: nurture ? "PATCH" : "POST",
          body: JSON.stringify({
            ...fields,
            ...(nurture ? { status } : {}),
            cadenceDays: Number(values.cadenceDays),
            nextTouchAt: new Date(values.nextTouchAt).toISOString(),
          }),
        },
      );
      onSaved();
      onClose();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <FormDialog
      title={nurture ? "管理客户经营计划" : "新建客户经营计划"}
      description={organization.name}
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
            保存客户经营计划
          </Button>
        </>
      }
    >
      <div className="grid gap-6 sm:grid-cols-2">
        <Field label="负责人" required>
          {() => (
            <FilterControl
              label="负责人"
              value={values.ownerUserId}
              onChange={(v) => set("ownerUserId", v)}
              options={Object.fromEntries(users.map((u) => [u.id, u.name]))}
              all={false}
            />
          )}
        </Field>
        <Field label="触达周期（天）" required>
          {(id) => (
            <Input
              id={id}
              type="number"
              min={1}
              max={365}
              value={values.cadenceDays}
              onChange={(e) => set("cadenceDays", e.target.value)}
            />
          )}
        </Field>
        {(
          [
            ["reason", "经营原因"],
            ["objective", "经营目标"],
          ] as const
        ).map(([key, label]) => (
          <Field key={key} label={label} required wide>
            {(id) => (
              <Textarea
                id={id}
                maxLength={16000}
                value={values[key]}
                onChange={(e) => set(key, e.target.value)}
              />
            )}
          </Field>
        ))}
        <Field label="下一次触达" required>
          {(id) => (
            <Input
              id={id}
              type="datetime-local"
              value={values.nextTouchAt}
              onChange={(e) => set("nextTouchAt", e.target.value)}
            />
          )}
        </Field>
        <Field label="触达主题" required>
          {(id) => (
            <Input
              id={id}
              maxLength={300}
              value={values.touchTopic}
              onChange={(e) => set("touchTopic", e.target.value)}
            />
          )}
        </Field>
        {nurture && (
          <Field label="状态">
            {() => (
              <FilterControl
                label="状态"
                value={values.status}
                onChange={(v) => set("status", v)}
                options={{
                  ACTIVE: "进行中",
                  PAUSED: "已暂停",
                  COMPLETED: "已完成",
                }}
                all={false}
              />
            )}
          </Field>
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
