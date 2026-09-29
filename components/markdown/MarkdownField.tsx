"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

import { MarkdownContent } from "./MarkdownContent";

const MDEditor = dynamic(() => import("@uiw/react-md-editor/nohighlight"), {
  ssr: false,
  loading: () => <div role="status" className="min-h-40 rounded-md border p-4 text-sm text-muted-foreground">正在加载 Markdown 编辑器…</div>,
});

type MarkdownFieldProps = {
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
};

export function MarkdownField({
  id,
  label,
  value,
  onChange,
  maxLength,
  rows = 8,
  placeholder,
  help,
  disabled = false,
  previewOnly = false,
  required = false,
  className = "",
}: MarkdownFieldProps) {
  const { resolvedTheme } = useTheme();
  const [compact, setCompact] = useState(false);
  const helpId = `${id}-markdown-help`;

  useEffect(() => {
    const query = window.matchMedia("(max-width: 640px)");
    const update = () => setCompact(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return (
    <div className={`min-w-0 space-y-2 ${className}`.trim()}>
      {previewOnly
        ? <span className="text-sm font-medium">{label}{required ? " *" : ""}</span>
        : <label htmlFor={id} className="text-sm font-medium">{label}{required ? " *" : ""}</label>}
      {previewOnly ? (
        <div role="region" aria-label={`${label} Markdown 预览`} className="min-h-32 rounded-md border bg-background p-3 text-sm">
          {value.trim() ? <MarkdownContent content={value} /> : <p className="text-muted-foreground">暂无内容。</p>}
        </div>
      ) : (
        <div data-color-mode={resolvedTheme === "dark" ? "dark" : "light"}>
          <MDEditor value={value} onChange={nextValue => {
            if (nextValue !== undefined && nextValue.length <= maxLength) onChange(nextValue);
          }}
            height={Math.max(250, Math.min(460, rows * 30 + 85))}
            preview={compact ? "edit" : "live"}
            visibleDragbar={false}
            components={{ preview: source => <MarkdownContent content={source} className="p-4 text-sm" /> }}
            textareaProps={{ id, disabled, required, maxLength, placeholder, "aria-describedby": helpId }}
          />
        </div>
      )}
      <p id={helpId} className="text-xs text-muted-foreground">
        {help || "支持 Markdown 标题、列表、链接、图片、代码与表格；工具栏可切换编辑和预览。"} 最多 {maxLength.toLocaleString("zh-CN")} 字符，当前 {value.length.toLocaleString("zh-CN")} 字符。
      </p>
    </div>
  );
}
