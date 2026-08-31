import { useState } from "react";

interface Props {
  content: string;
}

export function SystemPromptPanel({ content }: Props) {
  const [open, setOpen] = useState(false);
  const bytes = new TextEncoder().encode(content).length;
  const firstLine = content.split("\n")[0];

  return (
    // biome-ignore lint/a11y/useSemanticElements: intentional div-as-button (role="button" + tabIndex + Enter/Space handling below, per WAI-ARIA APG). Swapping to a native <button> risks a layout regression — .tr-system-prompt's flex/block toggling relies on the div's block-level default sizing, which a <button> doesn't have, and there's no way to visually verify the swap here.
    <div
      className="tr-system-prompt"
      data-open={open ? "true" : "false"}
      onClick={() => setOpen((v) => !v)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setOpen((v) => !v);
        }
      }}
    >
      <div className="tr-system-prompt-label">System prompt</div>
      <div className="tr-system-prompt-meta">
        {open
          ? "click to collapse"
          : `${(firstLine ?? "").slice(0, 80)}${(firstLine ?? "").length > 80 ? "…" : ""} · ${(bytes / 1024).toFixed(1)}kB · click to expand`}
      </div>
      {open && (
        <pre
          style={{
            whiteSpace: "pre-wrap",
            marginTop: "12px",
            fontFamily: "var(--tr-font-mono, ui-monospace, monospace)",
            fontSize: "12px",
            lineHeight: 1.6,
          }}
        >
          {content}
        </pre>
      )}
    </div>
  );
}
