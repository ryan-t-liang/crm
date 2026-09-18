import { useEffect, useState } from "react";
import { Banner, Button, Input, Modal } from "@douyinfe/semi-ui";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { MarketingActivity } from "@/types/marketing";
import { validMarketingLink } from "./marketing-model";

const escape = (value: string) => value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
const allowed = new Set(["P", "STRONG", "EM", "OL", "UL", "LI", "A", "BR"]);
const discarded = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "SVG", "MATH", "FORM", "INPUT", "IMG", "VIDEO", "AUDIO", "TEMPLATE"]);
/** Rebuild a small HTML allowlist; never render arbitrary imported HTML. */
export function sanitizeRuleHtml(value: string): string {
  const parsed = new DOMParser().parseFromString(value, "text/html");
  const walk = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return escape(node.textContent ?? "");
    if (!(node instanceof HTMLElement) || discarded.has(node.tagName)) return "";
    const tag = ({ B: "STRONG", I: "EM", DIV: "P" } as Record<string, string>)[node.tagName] ?? node.tagName;
    const content = [...node.childNodes].map(walk).join("");
    if (!allowed.has(tag)) return content;
    if (tag === "BR") return "<br>";
    if (tag === "A") {
      const href = node.getAttribute("href") ?? "";
      return validMarketingLink(href) ? `<a href="${escape(href)}" target="_blank" rel="noopener noreferrer">${content}</a>` : content;
    }
    return `<${tag.toLowerCase()}>${content}</${tag.toLowerCase()}>`;
  };
  return [...parsed.body.childNodes].map(walk).join("");
}
const ruleHtml = (value: string, format?: "html") => format === "html" ? sanitizeRuleHtml(value) : value ? `<p>${escape(value).replaceAll("\n", "<br>")}</p>` : "";

export function ActivityRuleContent({ activity }: { activity: Pick<MarketingActivity, "ruleContent" | "ruleContentFormat"> }) {
  const content = activity.ruleContent ?? "";
  if (!content) return <>—</>;
  if (activity.ruleContentFormat !== "html") return <div className="marketing-rule-content marketing-rule-plain">{content}</div>;
  return <div className="marketing-rule-content" dangerouslySetInnerHTML={{ __html: sanitizeRuleHtml(content) }} />;
}

export function MarketingRuleEditor({ value, format, onChange }: { value: string; format?: "html"; onChange: (html: string) => void }) {
  const [linkOpen, setLinkOpen] = useState(false), [href, setHref] = useState(""), [error, setError] = useState("");
  const editor = useEditor({
    extensions: [StarterKit.configure({
      blockquote: false, code: false, codeBlock: false, heading: false, horizontalRule: false,
      strike: false, underline: false, trailingNode: false,
      link: { openOnClick: false, defaultProtocol: "https", isAllowedUri: validMarketingLink },
    })],
    content: ruleHtml(value, format), immediatelyRender: false, shouldRerenderOnTransaction: true,
    editorProps: { attributes: { role: "textbox", "aria-label": "活动规则", "aria-multiline": "true" } },
    onUpdate: ({ editor }) => onChange(editor.isEmpty ? "" : sanitizeRuleHtml(editor.getHTML())),
  });
  useEffect(() => {
    if (editor && sanitizeRuleHtml(editor.getHTML()) !== ruleHtml(value, format) && !(editor.isEmpty && !value)) editor.commands.setContent(ruleHtml(value, format), { emitUpdate: false });
  }, [editor, value, format]);
  const action = (label: string, content: string, run: () => void, active = false) => <Button key={label} aria-label={label} title={label} size="small" theme={active ? "light" : "borderless"} aria-pressed={active} disabled={!editor} onMouseDown={event => event.preventDefault()} onClick={run}>{content}</Button>;
  return <div className="marketing-field marketing-field-wide"><span id="marketing-rule-label">活动规则</span><div className="marketing-rich-editor">
    <div role="toolbar" aria-label="活动规则格式" className="marketing-rich-toolbar">
      {action("加粗", "B", () => editor?.chain().focus().toggleBold().run(), editor?.isActive("bold"))}
      {action("斜体", "I", () => editor?.chain().focus().toggleItalic().run(), editor?.isActive("italic"))}
      {action("有序列表", "1.", () => editor?.chain().focus().toggleOrderedList().run(), editor?.isActive("orderedList"))}
      {action("无序列表", "•", () => editor?.chain().focus().toggleBulletList().run(), editor?.isActive("bulletList"))}
      {action("段落", "¶", () => editor?.chain().focus().clearNodes().setParagraph().run())}
      {action("换行", "↵", () => editor?.chain().focus().setHardBreak().run())}
      {action("链接", "链接", () => { setHref(editor?.getAttributes("link").href ?? ""); setError(""); setLinkOpen(true); }, editor?.isActive("link"))}
    </div><EditorContent editor={editor} />
  </div><Modal visible={linkOpen} title="设置链接" width={420} okText="保存" cancelText="取消" onCancel={() => setLinkOpen(false)} onOk={() => {
    const url = href.trim();
    if (url && !validMarketingLink(url)) { setError("请输入有效的 http 或 https 链接。"); return; }
    if (url && editor?.state.selection.empty && !editor.isActive("link")) editor.chain().focus().insertContent({ type: "text", text: url, marks: [{ type: "link", attrs: { href: url } }] }).run();
    else if (url) editor?.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    else editor?.chain().focus().extendMarkRange("link").unsetLink().run();
    setLinkOpen(false);
  }}><Input aria-label="链接地址" placeholder="https://" value={href} onChange={setHref} />{error && <Banner type="warning" title={error} closeIcon={null} />}</Modal></div>;
}
