import { useState } from "react";
import { Button, Input, Select, Table, TextArea, Toast } from "@douyinfe/semi-ui";
import { IconEdit, IconPlus } from "@douyinfe/semi-icons";
import { FormSideSheet, PageHeader, StatusTag, TableEntity } from "@/components/CrmUi";
import { useCrm } from "@/stores/crm-store";
import { getAssignableOwnersForDistributor } from "@/stores/crm-model";
import type { Contact, CrmTask, Deal, Lead, Organization } from "@/types/crm";
import { dateTime } from "@/utils/format";

const blank = { title: "", relationType: "LEAD" as CrmTask["relationType"], relationId: "", ownerId: "", dueAt: new Date(Date.now() + 86_400_000).toISOString().slice(0, 16), priority: "MEDIUM" as CrmTask["priority"], description: "" };
export function TasksPage() {
  const { state, scoped, canWrite, addTask, updateTask } = useCrm();
  const [status, setStatus] = useState("OPEN"); const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CrmTask | null>(null); const [form, setForm] = useState(blank);
  const tasks = scoped(state.tasks).filter((item) => status === "all" || item.status === status);
  const pool = (type: CrmTask["relationType"]): (Lead | Deal | Contact | Organization)[] => type === "LEAD" ? state.leads : type === "DEAL" ? state.deals : type === "CONTACT" ? state.contacts : state.organizations;
  const relationOptions = scoped(pool(form.relationType)).filter((item) => !editing || item.distributorId === editing.distributorId);
  const relation = relationOptions.find((item) => item.id === form.relationId);
  const distributorId = editing?.distributorId || relation?.distributorId || "";
  const owners = getAssignableOwnersForDistributor(state.users, distributorId);
  const start = (task?: CrmTask) => {
    setEditing(task || null);
    const first = scoped(state.leads)[0];
    setForm(task ? { title: task.title, relationType: task.relationType, relationId: task.relationId, ownerId: task.ownerId, dueAt: task.dueAt.slice(0, 16), priority: task.priority, description: task.description } : { ...blank, relationId: first?.id || "", ownerId: first ? getAssignableOwnersForDistributor(state.users, first.distributorId)[0]?.id || "" : "" });
    setOpen(true);
  };
  const save = () => {
    if (!form.title.trim() || !relation || !form.ownerId || !Number.isFinite(Date.parse(form.dueAt))) { Toast.warning("请完成必填字段并选择有效时间"); return; }
    const payload = { ...form, dueAt: new Date(form.dueAt).toISOString() };
    const saved = editing ? updateTask(editing.id, payload) : addTask({ ...payload, distributorId, status: "OPEN" });
    if (saved) setOpen(false);
  };
  const columns = [
    { title: "Task", dataIndex: "title", width: 250, render: (_: unknown, task: CrmTask) => <TableEntity name={task.title} detail={task.description} /> },
    { title: "Relation", render: (_: unknown, task: CrmTask) => `${task.relationType} · ${pool(task.relationType).find((item) => item.id === task.relationId)?.name || "—"}` },
    { title: "Owner", dataIndex: "ownerId", render: (value: string, task: CrmTask) => <Select disabled={!canWrite} size="small" value={value} onChange={(next) => updateTask(task.id, { ownerId: String(next) })} optionList={getAssignableOwnersForDistributor(state.users, task.distributorId).map((user) => ({ value: user.id, label: user.name }))} /> },
    { title: "Due Date", dataIndex: "dueAt", render: (value: string) => dateTime(value) }, { title: "Priority", dataIndex: "priority" },
    { title: "Status", dataIndex: "status", render: (value: CrmTask["status"]) => <StatusTag value={value} label={value} /> },
    { title: "Actions", render: (_: unknown, task: CrmTask) => <div className="row-actions"><Button disabled={!canWrite} size="small" icon={<IconEdit />} onClick={() => start(task)}>Edit</Button>{task.status === "OPEN" && <><Button disabled={!canWrite} size="small" onClick={() => updateTask(task.id, { status: "DONE" })}>Complete</Button><Button disabled={!canWrite} size="small" type="tertiary" onClick={() => updateTask(task.id, { status: "CANCELED" })}>Cancel</Button></>}</div> },
  ];
  return <div className="page"><PageHeader title="Tasks" description="跨 Lead、Deal、Contact 与 Organization 的下一步行动。" actions={canWrite && <Button theme="solid" icon={<IconPlus />} onClick={() => start()}>Create Task</Button>} />
    <section className="data-surface"><div className="table-toolbar"><Select value={status} onChange={(value) => setStatus(String(value))} optionList={[{ value: "all", label: "All Status" }, { value: "OPEN", label: "Open" }, { value: "DONE", label: "Completed" }, { value: "CANCELED", label: "Canceled" }]} /></div><Table rowKey="id" columns={columns} dataSource={tasks} pagination={{ pageSize: 10 }} scroll={{ x: 1050 }} /></section>
    <FormSideSheet visible={open} title={editing ? "Edit Task" : "Create Task"} onCancel={() => setOpen(false)} onOk={save}><div className="form-stack">
      <label>Title<Input aria-label="Task Title" value={form.title} onChange={(value) => setForm((current) => ({ ...current, title: value }))} /></label>
      <label>Relation Type<Select aria-label="Task Relation Type" value={form.relationType} onChange={(value) => setForm((current) => ({ ...current, relationType: String(value) as CrmTask["relationType"], relationId: "", ownerId: editing ? current.ownerId : "" }))} optionList={["LEAD", "DEAL", "CONTACT", "ORGANIZATION"].map((value) => ({ value, label: value }))} /></label>
      <label>Relation<Select aria-label="Task Relation" filter value={form.relationId} onChange={(value) => { const selected = relationOptions.find((item) => item.id === String(value)); setForm((current) => ({ ...current, relationId: String(value), ownerId: selected ? getAssignableOwnersForDistributor(state.users, editing?.distributorId || selected.distributorId)[0]?.id || "" : "" })); }} optionList={relationOptions.map((item) => ({ value: item.id, label: item.name }))} /></label>
      <label>Owner<Select aria-label="Task Owner" value={form.ownerId} onChange={(value) => setForm((current) => ({ ...current, ownerId: String(value) }))} optionList={owners.map((user) => ({ value: user.id, label: user.name }))} /></label>
      <label>Due Date<Input aria-label="Task Due Date" type="datetime-local" value={form.dueAt} onChange={(value) => setForm((current) => ({ ...current, dueAt: value }))} /></label>
      <label>Priority<Select aria-label="Task Priority" value={form.priority} onChange={(value) => setForm((current) => ({ ...current, priority: String(value) as CrmTask["priority"] }))} optionList={["LOW", "MEDIUM", "HIGH"].map((value) => ({ value, label: value }))} /></label>
      <label>Description<TextArea value={form.description} onChange={(value) => setForm((current) => ({ ...current, description: value }))} /></label>
      <p className="form-hint">Task Distributor follows the relation when created and remains fixed when edited. Owner must match that Distributor.</p>
    </div></FormSideSheet>
  </div>;
}
