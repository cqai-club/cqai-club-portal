"use client";

import { Extension, type Editor } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import { Markdown } from "@tiptap/markdown";
import { Plugin } from "@tiptap/pm/state";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  PiArrowUUpLeft, PiArrowUUpRight, PiCode, PiCodeBlock, PiImage,
  PiLink, PiListBullets, PiListChecks, PiListNumbers, PiQuotes,
  PiTable, PiTextB, PiTextStrikethrough,
} from "react-icons/pi";

import { MarkdownContent } from "@/components/markdown/MarkdownContent";
import { ACTIVITY_CONTENT_IMAGE_TYPES, MAX_ACTIVITY_CONTENT_IMAGE_BYTES } from "@/lib/club-activity-content-image-config";
import styles from "./ActivityContentEditor.module.css";

export type ActivityContentEditorProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  rows?: number;
  placeholder?: string;
  help?: string;
  disabled?: boolean;
  previewOnly?: boolean;
  required?: boolean;
  className?: string;
  preview?: boolean;
  onBusyChange?: (busy: boolean) => void;
  onValidationChange?: (valid: boolean) => void;
};

type InsertionTarget = { mode: "visual" | "source"; from: number; to: number };
type UploadedImage = { url: string; originalName: string };
const MAX_IMAGES_PER_UPLOAD = 6;
const IMAGE_TYPES = new Set<string>(ACTIVITY_CONTENT_IMAGE_TYPES);
const unsafeImageUrl = (url: string) => /^(?:data|blob|javascript|vbscript|file):/i.test(url.trim());
const unsafeMarkdownImage = (value: string) => /!\[[^\]]*\]\(\s*<?(?:data|blob|javascript|vbscript|file):/i.test(value)
  || /<img\b[^>]*\b(?:src|srcset)\s*=\s*["']?\s*(?:data|blob|javascript|vbscript|file):/i.test(value);
// Preserve unsupported legacy syntax in source mode rather than discarding it on a visual edit.
const needsSourceMode = (value: string) => /(?:^|\n)\[\^[^\]]+\]:|<!--|<\/?[a-z][a-z0-9-]*(?:\s[^>]*|\s*\/?)>|(?:^|\n):::/i.test(value) || unsafeMarkdownImage(value);

function ToolbarButton({ label, active, disabled, onClick, children }: {
  label: string; active?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode;
}) {
  return <button type="button" className={styles.toolButton} aria-label={label} title={label}
    aria-pressed={active} disabled={disabled} onMouseDown={event => event.preventDefault()} onClick={onClick}>
    <span aria-hidden="true">{children}</span>
  </button>;
}

export function ActivityContentEditor(props: ActivityContentEditorProps) {
  if (props.previewOnly) return <div className={`${styles.field} ${props.className ?? ""}`}>
    <span className={styles.label}>{props.label}{props.required ? " *" : ""}</span>
    <div className={styles.readOnly} role="region" aria-label={`${props.label}预览`}>
      {props.value.trim() ? <MarkdownContent content={props.value} /> : <p>暂无内容。</p>}
    </div>
  </div>;
  return <EditableActivityContentEditor {...props} />;
}

function EditableActivityContentEditor(props: ActivityContentEditorProps) {
  const { id, label, value, maxLength, rows = 9, placeholder, help, disabled = false, required = false, className = "", onValidationChange } = props;
  const [sourceMode, setSourceMode] = useState(() => needsSourceMode(value));
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [error, setError] = useState("");
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkValue, setLinkValue] = useState("");
  const latest = useRef(props);
  const mounted = useRef(true);
  const editorRef = useRef<Editor | null>(null);
  const sourceRef = useRef<HTMLTextAreaElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);
  const lastValue = useRef(value);
  const externalUpdate = useRef(false);
  const busy = useRef(false);
  const requestNumber = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const insertionTarget = useRef<InsertionTarget | null>(null);
  const linkSelection = useRef({ from: 1, to: 1 });
  const helpId = `${id}-editor-help`;
  const errorId = `${id}-editor-error`;

  useEffect(() => { latest.current = props; }, [props]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      requestNumber.current += 1;
      controller.current?.abort();
      if (busy.current) latest.current.onBusyChange?.(false);
    };
  }, []);

  function reportError(message: string) {
    const request = requestNumber.current;
    queueMicrotask(() => { if (mounted.current && request === requestNumber.current) setError(message); });
  }

  async function uploadImages(files: File[], target: InsertionTarget) {
    if (!files.length || busy.current || latest.current.disabled) return;
    if (latest.current.preview) {
      setError("示例预览不上传图片，请前往真实活动管理页上传。");
      return;
    }
    if (files.length > MAX_IMAGES_PER_UPLOAD) { setError(`每次最多插入 ${MAX_IMAGES_PER_UPLOAD} 张图片。`); return; }
    const invalid = files.find(file => !IMAGE_TYPES.has(file.type) || !file.size || file.size > MAX_ACTIVITY_CONTENT_IMAGE_BYTES);
    if (invalid) { setError(`「${invalid.name}」无法上传。请选择单张不超过 5MB 的 JPG、PNG 或 WebP 图片。`); return; }
    const editor = editorRef.current;
    if (!editor || editor.isDestroyed) return;
    const request = ++requestNumber.current;
    const abort = new AbortController();
    controller.current = abort;
    busy.current = true;
    setUploading(true);
    setError("");
    editor.setEditable(false, false);
    latest.current.onBusyChange?.(true);
    try {
      const images: UploadedImage[] = [];
      for (const [index, file] of files.entries()) {
        if (!mounted.current || request !== requestNumber.current || abort.signal.aborted) return;
        setUploadMessage(`正在上传图片 ${index + 1} / ${files.length}…`);
        const body = new FormData();
        body.set("image", file);
        const response = await fetch("/api/v1/activity-content-images", {
          method: "POST", credentials: "same-origin", body, signal: abort.signal,
        });
        const result = await response.json().catch(() => null) as (UploadedImage & { error?: string }) | null;
        if (!response.ok || !result?.url) throw new Error(`「${file.name}」上传失败：${result?.error || `请重试（${response.status}）。`}`);
        const url = new URL(result.url, window.location.origin);
        if (!["http:", "https:"].includes(url.protocol)) throw new Error("图片地址无效，请重新上传。");
        images.push({ url: result.url, originalName: result.originalName || file.name });
      }
      if (!mounted.current || request !== requestNumber.current || editor.isDestroyed) return;
      if (target.mode === "source") {
        const markup = images.map(image => `![${image.originalName.replace(/[\r\n]/g, " ").replace(/[\\[\]]/g, "\\$&")}](${image.url})`).join("\n\n");
        const original = lastValue.current;
        const next = `${original.slice(0, target.from)}\n\n${markup}\n\n${original.slice(target.to)}`;
        if (next.length > latest.current.maxLength) throw new Error(`插入图片后正文超过 ${latest.current.maxLength.toLocaleString("zh-CN")} 字符，请缩短正文后重试。`);
        lastValue.current = next;
        latest.current.onChange(next);
      } else {
        const previousDoc = editor.state.doc;
        editor.chain().insertContentAt({ from: target.from, to: target.to }, images.map(image => ({
          type: "image", attrs: { src: image.url, alt: image.originalName },
        }))).run();
        if (editor.state.doc.eq(previousDoc)) throw new Error("图片未能插入，请检查正文长度后重试。");
      }
      setUploadMessage(`已插入 ${images.length} 张图片。`);
    } catch (caught) {
      if (mounted.current && request === requestNumber.current && !abort.signal.aborted) {
        setError(caught instanceof Error ? caught.message : "图片上传失败，请重试。");
        setUploadMessage("");
      }
    } finally {
      if (mounted.current && request === requestNumber.current) {
        busy.current = false;
        controller.current = null;
        setUploading(false);
        if (!editor.isDestroyed) editor.setEditable(!latest.current.disabled, false);
        latest.current.onBusyChange?.(false);
      }
    }
  }

  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    content: value,
    contentType: "markdown",
    extensions: [
      StarterKit.configure({ link: { openOnClick: false } }),
      Markdown, Image.configure({ allowBase64: false }),
      TaskList, TaskItem.configure({ nested: true, a11y: { checkboxLabel: node => `任务：${node.textContent || "未填写"}` } }),
      TableKit.configure({ table: { resizable: false } }),
      Extension.create({
        name: "activityContentGuard",
        addProseMirrorPlugins() {
          const editor = this.editor;
          return [new Plugin({
            filterTransaction(transaction) {
              if (!transaction.docChanged || externalUpdate.current) return true;
              let unsafe = false;
              transaction.doc.descendants(node => {
                if (node.type.name === "image" && unsafeImageUrl(String(node.attrs.src ?? ""))) unsafe = true;
              });
              if (unsafe) { reportError("请使用“插入图片”上传图片，临时图片地址不能保存。"); return false; }
              const markdown = editor.markdown?.serialize(transaction.doc.toJSON());
              if (markdown && markdown.length > latest.current.maxLength) {
                reportError(`正文最多 ${latest.current.maxLength.toLocaleString("zh-CN")} 字符，此次修改未插入。`);
                return false;
              }
              return true;
            },
          })];
        },
      }),
    ],
    editorProps: {
      attributes: { id, role: "textbox", "aria-label": label, "aria-multiline": "true", "aria-required": String(required), "aria-describedby": `${helpId} ${errorId}` },
      handlePaste(view, event) {
        const files = Array.from(event.clipboardData?.files ?? []).filter(file => file.type.startsWith("image/"));
        if (!files.length) return false;
        event.preventDefault();
        void uploadImages(files, { mode: "visual", from: view.state.selection.from, to: view.state.selection.to });
        return true;
      },
      handleDrop(view, event, _slice, moved) {
        const files = Array.from(event.dataTransfer?.files ?? []).filter(file => file.type.startsWith("image/"));
        if (moved || !files.length) return false;
        event.preventDefault();
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? view.state.selection.from;
        void uploadImages(files, { mode: "visual", from: pos, to: pos });
        return true;
      },
      transformPastedHTML(html) {
        const doc = new DOMParser().parseFromString(html, "text/html");
        doc.querySelectorAll("img").forEach(image => {
          if (unsafeImageUrl(image.getAttribute("src") ?? "")) {
            image.remove();
            reportError("粘贴内容中的临时图片未插入，请使用“插入图片”上传原图。");
          }
        });
        return doc.body.innerHTML;
      },
    },
    onCreate: ({ editor }) => { editorRef.current = editor; },
    onUpdate: ({ editor, transaction, appendedTransactions }) => {
      if (externalUpdate.current || (!transaction.docChanged && !appendedTransactions.some(item => item.docChanged))) return;
      const markdown = editor.getMarkdown();
      // Tiptap adds an empty trailing paragraph for navigation after images/tables.
      // Moving the caret into it should not turn an untouched activity into a draft.
      if (markdown.trimEnd() === lastValue.current.trimEnd()) return;
      lastValue.current = markdown;
      latest.current.onChange(markdown);
      setError("");
    },
  });

  const toolbar = useEditorState({ editor, selector: ({ editor: current }) => current ? {
    heading: current.isActive("heading") ? String(current.getAttributes("heading").level) : "paragraph",
    bold: current.isActive("bold"), strike: current.isActive("strike"), bullet: current.isActive("bulletList"),
    ordered: current.isActive("orderedList"), task: current.isActive("taskList"), quote: current.isActive("blockquote"),
    code: current.isActive("code"), codeBlock: current.isActive("codeBlock"), link: current.isActive("link"),
    table: current.isActive("table"), empty: current.isEmpty, undo: current.can().undo(), redo: current.can().redo(),
  } : null });

  useEffect(() => {
    if (!editor) return;
    editorRef.current = editor;
    editor.setEditable(!disabled && !uploading, false);
  }, [editor, disabled, uploading]);

  useEffect(() => {
    if (!editor || value === lastValue.current) return;
    requestNumber.current += 1;
    controller.current?.abort();
    controller.current = null;
    if (busy.current) latest.current.onBusyChange?.(false);
    busy.current = false;
    setUploading(false);
    setUploadMessage("");
    setError("");
    setLinkOpen(false);
    setSourceMode(needsSourceMode(value));
    lastValue.current = value;
    externalUpdate.current = true;
    try {
      editor.chain().setMeta("addToHistory", false)
        .setContent(value, { contentType: "markdown", emitUpdate: false }).setTextSelection(1).run();
    }
    finally { externalUpdate.current = false; }
  }, [editor, value]);

  useEffect(() => {
    const unsafe = unsafeMarkdownImage(value);
    onValidationChange?.(value.length <= maxLength && !unsafe && (!required || Boolean(value.trim())));
    if (value.length > maxLength) setError(`正文已超过 ${maxLength.toLocaleString("zh-CN")} 字符，请删减后再保存。`);
    else if (unsafe) setError("正文包含临时图片地址，请删除后重新上传图片再保存。");
  }, [value, maxLength, required, onValidationChange]);

  useEffect(() => { if (linkOpen) linkInputRef.current?.focus(); }, [linkOpen]);

  const locked = disabled || uploading || !editor;
  const formattingLocked = locked || sourceMode;

  function selectImages() {
    if (!editor || locked) return;
    insertionTarget.current = sourceMode && sourceRef.current
      ? { mode: "source", from: sourceRef.current.selectionStart, to: sourceRef.current.selectionEnd }
      : { mode: "visual", from: editor.state.selection.from, to: editor.state.selection.to };
    inputRef.current?.click();
  }

  function openLink() {
    if (!editor) return;
    linkSelection.current = { from: editor.state.selection.from, to: editor.state.selection.to };
    setLinkValue(String(editor.getAttributes("link").href ?? ""));
    setLinkOpen(current => !current);
  }

  function applyLink(remove = false) {
    if (!editor || locked) return;
    let href = linkValue.trim();
    if (!remove && href && !/^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(href)) href = `https://${href}`;
    if (!remove && href && !/^(?:https?:\/\/|mailto:|tel:|\/(?!\/)|#)/i.test(href)) {
      setError("请输入有效的网页、邮箱或电话链接。");
      return;
    }
    if (!remove && /^https?:/i.test(href)) {
      try { if (!new URL(href).hostname) throw new Error("Invalid host"); }
      catch { setError("请输入完整有效的网页链接。"); return; }
    }
    const chain = editor.chain().focus().setTextSelection(linkSelection.current).extendMarkRange("link");
    if (remove || !href) chain.unsetLink().run();
    else chain.setLink({ href }).run();
    setLinkOpen(false);
    setError("");
  }

  function updateSource(next: string) {
    if (next.length > maxLength) { setError(`正文最多 ${maxLength.toLocaleString("zh-CN")} 字符。`); return; }
    if (unsafeMarkdownImage(next)) { setError("请上传图片，不能保存临时图片地址。"); return; }
    lastValue.current = next;
    props.onChange(next);
    setError("");
  }

  function switchMode() {
    if (!editor || locked) return;
    if (sourceMode) {
      if (needsSourceMode(value)) { setError("这段内容包含暂不支持的扩展格式，请继续使用源码编辑以保留原文。"); return; }
      externalUpdate.current = true;
      try {
        editor.chain().setMeta("addToHistory", false)
          .setContent(value, { contentType: "markdown", emitUpdate: false }).setTextSelection(1).run();
      }
      finally { externalUpdate.current = false; }
    }
    setSourceMode(current => !current);
    setLinkOpen(false);
    setError("");
  }

  return <div className={`${styles.field} ${className}`}>
    <label htmlFor={sourceMode ? `${id}-source` : id} className={styles.label}>{label}{required ? " *" : ""}</label>
    <div className={styles.shell} aria-busy={uploading}>
      <div className={styles.toolbar} role="toolbar" aria-label={`${label}排版工具`}>
        <select aria-label="段落样式" className={styles.headingSelect} disabled={formattingLocked} value={toolbar?.heading ?? "paragraph"}
          onChange={event => {
            if (!editor) return;
            if (event.target.value === "paragraph") editor.chain().focus().setParagraph().run();
            else editor.chain().focus().setHeading({ level: Number(event.target.value) as 1 | 2 | 3 | 4 | 5 | 6 }).run();
          }}>
          <option value="paragraph">正文</option>{[1, 2, 3, 4, 5, 6].map(level => <option key={level} value={level}>{level}级标题</option>)}
        </select>
        <ToolbarButton label="加粗" active={toolbar?.bold} disabled={formattingLocked} onClick={() => editor?.chain().focus().toggleBold().run()}><PiTextB /></ToolbarButton>
        <ToolbarButton label="删除线" active={toolbar?.strike} disabled={formattingLocked} onClick={() => editor?.chain().focus().toggleStrike().run()}><PiTextStrikethrough /></ToolbarButton>
        <ToolbarButton label="无序列表" active={toolbar?.bullet} disabled={formattingLocked} onClick={() => editor?.chain().focus().toggleBulletList().run()}><PiListBullets /></ToolbarButton>
        <ToolbarButton label="有序列表" active={toolbar?.ordered} disabled={formattingLocked} onClick={() => editor?.chain().focus().toggleOrderedList().run()}><PiListNumbers /></ToolbarButton>
        <ToolbarButton label="任务清单" active={toolbar?.task} disabled={formattingLocked} onClick={() => editor?.chain().focus().toggleTaskList().run()}><PiListChecks /></ToolbarButton>
        <ToolbarButton label="引用" active={toolbar?.quote} disabled={formattingLocked} onClick={() => editor?.chain().focus().toggleBlockquote().run()}><PiQuotes /></ToolbarButton>
        <ToolbarButton label="行内代码" active={toolbar?.code} disabled={formattingLocked} onClick={() => editor?.chain().focus().toggleCode().run()}><PiCode /></ToolbarButton>
        <ToolbarButton label="代码块" active={toolbar?.codeBlock} disabled={formattingLocked} onClick={() => editor?.chain().focus().toggleCodeBlock().run()}><PiCodeBlock /></ToolbarButton>
        <ToolbarButton label="编辑链接" active={toolbar?.link} disabled={formattingLocked} onClick={openLink}><PiLink /></ToolbarButton>
        <ToolbarButton label="插入表格" disabled={formattingLocked} onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><PiTable /></ToolbarButton>
        <ToolbarButton label="撤销" disabled={formattingLocked || !toolbar?.undo} onClick={() => editor?.chain().focus().undo().run()}><PiArrowUUpLeft /></ToolbarButton>
        <ToolbarButton label="重做" disabled={formattingLocked || !toolbar?.redo} onClick={() => editor?.chain().focus().redo().run()}><PiArrowUUpRight /></ToolbarButton>
        <button type="button" className={styles.textButton} disabled={locked} onMouseDown={event => event.preventDefault()} onClick={selectImages}><PiImage aria-hidden="true" />插入图片</button>
        <button type="button" className={styles.textButton} disabled={locked} aria-pressed={sourceMode} onClick={switchMode}>{sourceMode ? "可视化编辑" : "Markdown 源码"}</button>
      </div>
      {toolbar?.table && !sourceMode && <div className={styles.tableTools} role="group" aria-label="表格操作">
        <button type="button" disabled={locked} onClick={() => editor?.chain().focus().addRowAfter().run()}>添加行</button>
        <button type="button" disabled={locked} onClick={() => editor?.chain().focus().addColumnAfter().run()}>添加列</button>
        <button type="button" disabled={locked} onClick={() => editor?.chain().focus().deleteRow().run()}>删除行</button>
        <button type="button" disabled={locked} onClick={() => editor?.chain().focus().deleteColumn().run()}>删除列</button>
        <button type="button" disabled={locked} onClick={() => editor?.chain().focus().deleteTable().run()}>删除表格</button>
      </div>}
      {linkOpen && <div className={styles.linkForm} role="group" aria-label="链接地址">
        <label htmlFor={`${id}-link`}>链接地址</label>
        <input ref={linkInputRef} id={`${id}-link`} value={linkValue} placeholder="https://example.com" disabled={locked}
          onChange={event => setLinkValue(event.target.value)} onKeyDown={event => {
            if (event.key === "Enter") { event.preventDefault(); applyLink(); }
            if (event.key === "Escape") { event.preventDefault(); setLinkOpen(false); editor?.commands.focus(); }
          }} />
        <button type="button" disabled={locked} onClick={() => applyLink()}>应用链接</button>
        <button type="button" disabled={locked} onClick={() => applyLink(true)}>解除链接</button>
        <button type="button" onClick={() => { setLinkOpen(false); editor?.commands.focus(); }}>取消</button>
      </div>}
      {sourceMode ? <textarea ref={sourceRef} id={`${id}-source`} className={styles.source} value={value} rows={rows}
        placeholder={placeholder} disabled={locked} required={required} aria-describedby={`${helpId} ${errorId}`}
        onChange={event => updateSource(event.target.value)} onPaste={event => {
          const files = Array.from(event.clipboardData.files).filter(file => file.type.startsWith("image/"));
          if (!files.length) return;
          event.preventDefault();
          void uploadImages(files, { mode: "source", from: event.currentTarget.selectionStart, to: event.currentTarget.selectionEnd });
        }} onDragOver={event => { if (event.dataTransfer.types.includes("Files")) event.preventDefault(); }}
        onDrop={event => {
          const files = Array.from(event.dataTransfer.files).filter(file => file.type.startsWith("image/"));
          if (!files.length) return;
          event.preventDefault();
          void uploadImages(files, { mode: "source", from: event.currentTarget.selectionStart, to: event.currentTarget.selectionEnd });
        }} /> : <div className={styles.editorArea}>
        {toolbar?.empty && <span className={styles.placeholder} aria-hidden="true">{placeholder || "开始写活动内容，也可以粘贴或拖入图片…"}</span>}
        {!editor ? <div className={styles.loading} role="status">正在加载图文编辑器…</div> : <EditorContent editor={editor} className={styles.editorContent} />}
      </div>}
    </div>
    <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden tabIndex={-1} aria-hidden="true"
      onChange={event => {
        const files = Array.from(event.target.files ?? []);
        event.target.value = "";
        if (insertionTarget.current) void uploadImages(files, insertionTarget.current);
      }} />
    {sourceMode && needsSourceMode(value) && <p className={styles.help}>当前内容含有扩展格式，已保留原文并切换为源码编辑。</p>}
    <p id={helpId} className={styles.help}>{help || "直接排版，支持选择、粘贴或拖入 JPG、PNG、WebP 图片。每张不超过 5MB，每次最多 6 张。"} 最多 {maxLength.toLocaleString("zh-CN")} 字符，当前 {value.length.toLocaleString("zh-CN")} 字符。</p>
    <p id={errorId} className={styles.error} role={error ? "alert" : undefined}>{error}</p>
    {uploadMessage && <p className={styles.help} role="status">{uploadMessage}</p>}
  </div>;
}
