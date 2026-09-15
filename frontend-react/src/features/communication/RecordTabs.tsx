import { useState, type ReactNode } from "react";
import { Button, Empty, Input, Modal, Select, TabPane, Tabs, TextArea, Toast, Upload } from "@douyinfe/semi-ui";
import { IconDelete, IconEdit, IconMail, IconPlus, IconUpload } from "@douyinfe/semi-icons";
import { ActivityTimeline } from "@/components/ActivityTimeline";
import { StatusTag } from "@/components/CrmUi";
import { useCrm } from "@/stores/crm-store";
import type { Activity, CrmTask, EmailMessage } from "@/types/crm";
import { dateTime } from "@/utils/format";

type EntityType = Extract<Activity["entityType"], "LEAD" | "DEAL">;
type RecordEntityType = Activity["entityType"];

export function RecordTabs({ entityType, entityId, contactId, distributorId, dataPanel }: { entityType: EntityType; entityId: string; contactId: string; distributorId: string; dataPanel: ReactNode }) {
  return <Tabs className="record-tabs" type="line">
    <TabPane tab="Activity" itemKey="activity"><ActivityTimeline entityType={entityType} entityId={entityId} /></TabPane>
    <TabPane tab="Emails" itemKey="emails"><Emails entityType={entityType} entityId={entityId} /></TabPane>
    <TabPane tab="Comments" itemKey="comments"><Comments entityType={entityType} entityId={entityId} /></TabPane>
    <TabPane tab="Data" itemKey="data">{dataPanel}</TabPane>
    <TabPane tab="Calls" itemKey="calls"><Calls entityType={entityType} entityId={entityId} contactId={contactId} distributorId={distributorId} /></TabPane>
    <TabPane tab="Tasks" itemKey="tasks"><Tasks entityType={entityType} entityId={entityId} distributorId={distributorId} /></TabPane>
    <TabPane tab="Notes" itemKey="notes"><EntityNotes entityType={entityType} entityId={entityId} /></TabPane>
    <TabPane tab="Attachments" itemKey="attachments"><EntityAttachments entityType={entityType} entityId={entityId} /></TabPane>
  </Tabs>;
}

function PanelHeader({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <header className="tab-panel-header"><div><h2>{title}</h2><p>{description}</p></div>{action}</header>;
}

function Emails({ entityType, entityId }: { entityType: EntityType; entityId: string }) {
  const { state, sendEmail, currentUser } = useCrm();
  const [open, setOpen] = useState(false);
  const [showCopies, setShowCopies] = useState(false);
  const [form, setForm] = useState({ to: "", cc: "", bcc: "", subject: "", body: "", attachmentNames: [] as string[] });
  const rows = state.emails.filter((item) => item.entityType === entityType && item.entityId === entityId).sort((a, b) => b.sentAt.localeCompare(a.sentAt));
  const reply = (message?: EmailMessage, all = false) => {
    const reference = message || rows[0];
    const recipients = all && reference
      ? Array.from(new Set([reference.from, ...reference.to])).filter((email) => email !== currentUser.email)
      : reference?.from ? [reference.from] : [];
    const subject = reference?.subject || "Product follow-up";
    setForm({ to: recipients.join(", "), cc: all && reference ? reference.cc.filter((email) => email !== currentUser.email).join(", ") : "", bcc: "", subject: subject.startsWith("Re:") ? subject : `Re: ${subject}`, body: "", attachmentNames: [] });
    setShowCopies(all); setOpen(true);
  };
  const submit = () => {
    if (!form.to.trim() || !form.subject.trim() || !form.body.trim()) { Toast.warning("请填写收件人、主题和正文"); return; }
    sendEmail({ entityType, entityId, threadId: rows[0]?.threadId || `thread-${entityId}`, to: form.to.split(",").map((value) => value.trim()), cc: form.cc ? form.cc.split(",").map((value) => value.trim()) : [], bcc: form.bcc ? form.bcc.split(",").map((value) => value.trim()) : [], subject: form.subject, body: form.body, attachmentNames: form.attachmentNames });
    setOpen(false); Toast.success("邮件已发送");
  };
  return <div className="tab-panel"><PanelHeader title="Email Thread" description="完整模拟邮件线程，不连接外部邮箱。" action={<Button theme="solid" icon={<IconMail />} onClick={() => reply()}>New Email</Button>} />
    <div className="email-thread">{rows.length ? rows.map((message) => <article className="email-message" key={message.id}><header><div><strong>{message.from === currentUser.email ? currentUser.name : message.from}</strong><small>to {message.to.join(", ")}</small></div><time>{dateTime(message.sentAt)}</time></header><h3>{message.subject}</h3><p className="email-body">{message.body}</p>{message.attachmentNames.length > 0 && <div className="attachment-chips">{message.attachmentNames.map((name) => <span key={name}>{name}</span>)}</div>}<footer><Button theme="borderless" size="small" onClick={() => reply(message)}>Reply</Button><Button theme="borderless" size="small" onClick={() => reply(message, true)}>Reply All</Button></footer></article>) : <Empty title="暂无邮件" description="点击 New Email 创建一条可回复的模拟邮件线程。" />}</div>
    <Modal visible={open} title="New Email" className="email-composer" width={720} onCancel={() => setOpen(false)} onOk={submit} okText="Send" cancelText="Cancel">
      <div className="form-stack"><label>TO<Input aria-label="TO" value={form.to} onChange={(value) => setForm((current) => ({ ...current, to: value }))} placeholder="name@example.com" /></label><Button theme="borderless" size="small" onClick={() => setShowCopies((value) => !value)}>CC / BCC</Button>{showCopies && <div className="form-grid"><label>CC<Input aria-label="CC" value={form.cc} onChange={(value) => setForm((current) => ({ ...current, cc: value }))} /></label><label>BCC<Input aria-label="BCC" value={form.bcc} onChange={(value) => setForm((current) => ({ ...current, bcc: value }))} /></label></div>}<label>Subject<Input aria-label="Subject" value={form.subject} onChange={(value) => setForm((current) => ({ ...current, subject: value }))} /></label><label>Body<div className="rich-editor"><div className="rich-editor-toolbar" aria-label="Rich text controls"><Button size="small" onClick={() => setForm((current) => ({ ...current, body: `${current.body}**bold text**` }))}><strong>B</strong></Button><Button size="small" onClick={() => setForm((current) => ({ ...current, body: `${current.body}_italic text_` }))}><em>I</em></Button><Button size="small" onClick={() => setForm((current) => ({ ...current, body: `${current.body}${current.body ? "\n" : ""}• ` }))}>List</Button><Button size="small" onClick={() => setForm((current) => ({ ...current, body: `${current.body}${current.body ? "\n" : ""}[link](https://)` }))}>Link</Button></div><TextArea aria-label="Body" rows={8} value={form.body} onChange={(value) => setForm((current) => ({ ...current, body: value }))} /></div></label><Upload action="" uploadTrigger="custom" showUploadList={false} onFileChange={(files) => setForm((current) => ({ ...current, attachmentNames: [...current.attachmentNames, ...files.map((item) => item.name)] }))}><Button icon={<IconUpload />}>Attachment</Button></Upload></div>
    </Modal>
  </div>;
}

function Comments({ entityType, entityId }: { entityType: EntityType; entityId: string }) {
  const { state, addComment, updateComment, deleteComment } = useCrm();
  const [body, setBody] = useState(""); const [editing, setEditing] = useState("");
  const rows = state.comments.filter((item) => item.entityType === entityType && item.entityId === entityId);
  return <div className="tab-panel"><PanelHeader title="Internal Comments" description="使用 @Name 提及团队成员；评论同时进入 Activity。" />
    <div className="comment-compose"><TextArea value={body} onChange={setBody} placeholder="添加内部评论，例如：@Jason 请确认下周演示时间" autosize={{ minRows: 3, maxRows: 6 }} /><Button theme="solid" disabled={!body.trim()} onClick={() => { addComment({ entityType, entityId, body }); setBody(""); }}>发布评论</Button></div>
    <div className="record-list">{rows.length ? rows.map((item) => <article key={item.id}><header><strong>{state.users.find((user) => user.id === item.authorId)?.name}</strong><time>{dateTime(item.createdAt)}</time></header>{editing === item.id ? <Input defaultValue={item.body} onEnterPress={(event) => { updateComment(item.id, event.currentTarget.value); setEditing(""); }} /> : <p>{item.body}</p>}<footer><Button theme="borderless" size="small" icon={<IconEdit />} onClick={() => setEditing(item.id)}>编辑</Button><Button theme="borderless" size="small" type="danger" icon={<IconDelete />} onClick={() => Modal.confirm({ title: "删除评论？", content: "此操作只影响当前浏览器中的 Demo 数据。", onOk: () => deleteComment(item.id) })}>删除</Button></footer></article>) : <Empty title="暂无评论" />}</div>
  </div>;
}

function Calls({ entityType, entityId, contactId, distributorId }: { entityType: EntityType; entityId: string; contactId: string; distributorId: string }) {
  const { state, addCall } = useCrm(); const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ direction: "OUTBOUND", contactId, occurredAt: new Date().toISOString().slice(0, 16), durationMinutes: 20, summary: "", result: "Connected", nextAction: "" });
  const rows = state.calls.filter((item) => item.entityType === entityType && item.entityId === entityId);
  const contacts = state.contacts.filter((item) => item.distributorId === distributorId);
  const submit = () => { if (!form.summary.trim()) { Toast.warning("请填写通话摘要"); return; } addCall({ entityType, entityId, contactId: form.contactId, occurredAt: new Date(form.occurredAt).toISOString(), direction: form.direction as "INBOUND" | "OUTBOUND", durationMinutes: form.durationMinutes, summary: form.summary, result: form.result, nextAction: form.nextAction }); setOpen(false); };
  return <div className="tab-panel"><PanelHeader title="Calls" description="记录来电、去电、联系人、时间、结果与下一步行动。" action={<Button icon={<IconPlus />} onClick={() => setOpen(true)}>Add Call</Button>} /><div className="record-list">{rows.length ? rows.map((item) => <article key={item.id}><header><strong>{item.direction === "INBOUND" ? "Inbound" : "Outbound"} · {item.durationMinutes} min</strong><time>{dateTime(item.occurredAt)}</time></header><p>{item.summary}</p><small>{state.contacts.find((contact) => contact.id === item.contactId)?.name} · {item.result} · Next: {item.nextAction || "—"}</small></article>) : <Empty title="暂无电话记录" />}</div><Modal visible={open} title="Add Call" onCancel={() => setOpen(false)} onOk={submit}><div className="form-stack"><label>Direction<Select aria-label="Direction" value={form.direction} onChange={(value) => setForm((current) => ({ ...current, direction: String(value) }))} optionList={[{ value: "INBOUND", label: "Inbound" }, { value: "OUTBOUND", label: "Outbound" }]} /></label><label>Contact<Select aria-label="Contact" filter value={form.contactId} onChange={(value) => setForm((current) => ({ ...current, contactId: String(value) }))} optionList={contacts.map((item) => ({ value: item.id, label: item.name }))} /></label><label>Date / Time<Input aria-label="Date / Time" type="datetime-local" value={form.occurredAt} onChange={(value) => setForm((current) => ({ ...current, occurredAt: value }))} /></label><label>Duration (min)<Input aria-label="Duration (min)" type="number" value={String(form.durationMinutes)} onChange={(value) => setForm((current) => ({ ...current, durationMinutes: Number(value) }))} /></label><label>Summary<TextArea aria-label="Summary" value={form.summary} onChange={(value) => setForm((current) => ({ ...current, summary: value }))} /></label><label>Result<Input aria-label="Result" value={form.result} onChange={(value) => setForm((current) => ({ ...current, result: value }))} /></label><label>Next Action<Input aria-label="Next Action" value={form.nextAction} onChange={(value) => setForm((current) => ({ ...current, nextAction: value }))} /></label></div></Modal></div>;
}

function Tasks({ entityType, entityId, distributorId }: { entityType: EntityType; entityId: string; distributorId: string }) {
  const { state, addTask, updateTask, scoped } = useCrm(); const [open, setOpen] = useState(false);
  const owners = scoped(state.users.filter((user) => user.role !== "HQ_ADMIN").map((user) => ({ ...user, distributorId: user.distributorId })));
  const [form, setForm] = useState({ title: "", ownerId: owners[0]?.id || "", dueAt: new Date(Date.now() + 86_400_000).toISOString().slice(0, 16), priority: "MEDIUM" });
  const rows = state.tasks.filter((item) => item.relationType === entityType && item.relationId === entityId);
  const submit = () => { addTask({ title: form.title, ownerId: form.ownerId, distributorId, relationType: entityType, relationId: entityId, dueAt: new Date(form.dueAt).toISOString(), priority: form.priority as CrmTask["priority"], status: "OPEN", description: "Created from record workspace" }); setOpen(false); };
  return <div className="tab-panel"><PanelHeader title="Tasks" description="创建、分配、完成或取消与当前记录关联的任务。" action={<Button icon={<IconPlus />} onClick={() => setOpen(true)}>Create Task</Button>} /><div className="task-list">{rows.length ? rows.map((item) => <article key={item.id}><div><StatusTag value={item.status} label={item.status} /><strong>{item.title}</strong><small>{state.users.find((user) => user.id === item.ownerId)?.name} · {dateTime(item.dueAt)}</small></div><div>{item.status === "OPEN" && <><Button size="small" onClick={() => updateTask(item.id, { status: "DONE" })}>Complete</Button><Button size="small" type="tertiary" onClick={() => updateTask(item.id, { status: "CANCELED" })}>Cancel</Button></>}</div></article>) : <Empty title="暂无关联任务" />}</div><Modal visible={open} title="Create Task" onCancel={() => setOpen(false)} onOk={submit}><div className="form-stack"><label>Title<Input aria-label="Title" value={form.title} onChange={(value) => setForm((current) => ({ ...current, title: value }))} /></label><label>Owner<Select aria-label="Owner" value={form.ownerId} onChange={(value) => setForm((current) => ({ ...current, ownerId: String(value) }))} optionList={owners.map((user) => ({ value: user.id, label: user.name }))} /></label><label>Due Date<Input aria-label="Due Date" type="datetime-local" value={form.dueAt} onChange={(value) => setForm((current) => ({ ...current, dueAt: value }))} /></label><label>Priority<Select aria-label="Priority" value={form.priority} onChange={(value) => setForm((current) => ({ ...current, priority: String(value) }))} optionList={["LOW", "MEDIUM", "HIGH"].map((value) => ({ value, label: value }))} /></label></div></Modal></div>;
}

export function EntityNotes({ entityType, entityId }: { entityType: RecordEntityType; entityId: string }) {
  const { state, addNote, updateNote, deleteNote } = useCrm(); const [title, setTitle] = useState(""); const [body, setBody] = useState(""); const [editing, setEditing] = useState("");
  const rows = state.notes.filter((item) => item.entityType === entityType && item.entityId === entityId);
  const clear = () => { setTitle(""); setBody(""); setEditing(""); };
  const save = () => { if (editing) updateNote(editing, { title, body }); else addNote({ entityType, entityId, title, body }); clear(); };
  return <div className="tab-panel"><PanelHeader title="Notes" description="记录产品需求、会议摘要与内部判断。" /><div className="note-compose form-grid"><Input value={title} onChange={setTitle} placeholder="Note title" /><TextArea value={body} onChange={setBody} placeholder="Write a note…" autosize={{ minRows: 3 }} /><div className="button-row"><Button theme="solid" disabled={!title || !body} onClick={save}>{editing ? "Update Note" : "Save Note"}</Button>{editing && <Button onClick={clear}>Cancel</Button>}</div></div><div className="record-list">{rows.length ? rows.map((item) => <article key={item.id}><header><strong>{item.title}</strong><time>{dateTime(item.createdAt)}</time></header><p>{item.body}</p><footer><Button theme="borderless" size="small" icon={<IconEdit />} onClick={() => { setEditing(item.id); setTitle(item.title); setBody(item.body); }}>Edit</Button><Button theme="borderless" type="danger" size="small" onClick={() => Modal.confirm({ title: "Delete note?", content: "This removes the note from the current Demo dataset.", onOk: () => deleteNote(item.id) })}>Delete</Button></footer></article>) : <Empty title="暂无笔记" />}</div></div>;
}

export function EntityAttachments({ entityType, entityId }: { entityType: RecordEntityType; entityId: string }) {
  const { state, addAttachment, deleteAttachment } = useCrm();
  const rows = state.attachments.filter((item) => item.entityType === entityType && item.entityId === entityId);
  const accepted = ".png,.jpg,.jpeg,.webp,.mp4,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx";
  return <div className="tab-panel"><PanelHeader title="Attachments" description="集中管理与当前记录相关的资料，支持预览、下载与删除。" action={<Upload action="" accept={accepted} uploadTrigger="custom" showUploadList={false} onFileChange={(files) => { const file = files.at(-1); if (!file) return; addAttachment({ entityType, entityId, name: file.name, mimeType: file.type || "application/octet-stream", size: file.size, objectUrl: URL.createObjectURL(file) }); }}><Button icon={<IconUpload />}>Upload</Button></Upload>} /><div className="attachment-grid">{rows.length ? rows.map((item) => <article key={item.id}><div><span className="file-type">{item.name.split(".").at(-1)?.toUpperCase()}</span><strong>{item.name}</strong><small>{Math.max(1, Math.round(item.size / 1024))} KB · {dateTime(item.createdAt)}</small></div><footer>{item.objectUrl && <Button size="small" onClick={() => window.open(item.objectUrl, "_blank")}>Preview</Button>}<a className="semi-button semi-button-tertiary semi-button-size-small" href={item.objectUrl || `data:text/plain,Mock file: ${encodeURIComponent(item.name)}`} download={item.name}>Download</a><Button size="small" type="danger" onClick={() => Modal.confirm({ title: "Delete attachment?", content: "This removes the file from the current Demo dataset.", onOk: () => deleteAttachment(item.id) })}>Delete</Button></footer></article>) : <Empty title="暂无附件" />}</div></div>;
}
