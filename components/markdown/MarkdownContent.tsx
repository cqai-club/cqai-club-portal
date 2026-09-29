/* eslint-disable @next/next/no-img-element -- Markdown images can come from user supplied HTTPS URLs */

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import styles from "./markdown-content.module.css";

type MarkdownContentProps = {
  content: string;
  className?: string;
};

export function MarkdownContent({ content, className = "" }: MarkdownContentProps) {
  return (
    <div className={`${styles.root} ${className}`.trim()}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target={href?.startsWith("https://") || href?.startsWith("http://") ? "_blank" : undefined}
              rel="noopener noreferrer">{children}</a>
          ),
          img: ({ src, alt }) => (
            <img src={src} alt={alt || ""} loading="lazy" referrerPolicy="no-referrer" />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
