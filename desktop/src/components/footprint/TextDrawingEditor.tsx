// Inline editor for the text-annotation tool. Renders a fixed-
// positioned <input> at the viewport coordinates passed in, so the
// caller can drop it exactly where the user clicked. Commit on
// Enter / blur, cancel on Escape — both terminal actions hand
// control back to the canvas via the props.

import { useEffect, useRef, useState } from "react";
import "./TextDrawingEditor.css";

type Props = {
  /** Anchor in viewport coords (clientX / clientY). The editor's
   *  top-left is offset by a few px so it doesn't sit directly on
   *  top of the cursor. */
  clientX: number;
  clientY: number;
  initial: string;
  onCommit: (content: string) => void;
  onCancel: () => void;
};

export function TextDrawingEditor({
  clientX,
  clientY,
  initial,
  onCommit,
  onCancel,
}: Props) {
  const [value, setValue] = useState(initial);
  const inputRef = useRef<HTMLInputElement>(null);
  // committedRef guards against double-commit when Enter triggers
  // both `onKeyDown` (Enter handler) and the subsequent `onBlur`.
  const committedRef = useRef(false);

  useEffect(() => {
    // Auto-focus on mount. setTimeout(0) because some browsers
    // (esp. WebView2) skip focus when the element isn't fully laid
    // out yet in the same microtask as the mount.
    const id = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => clearTimeout(id);
  }, []);

  const finish = (action: "commit" | "cancel") => {
    if (committedRef.current) return;
    committedRef.current = true;
    if (action === "commit") onCommit(value);
    else onCancel();
  };

  return (
    <div
      className="td-editor-wrap"
      style={{ left: clientX + 8, top: clientY - 12 }}
      onMouseDown={(e) => {
        // Stop the canvas from interpreting clicks inside the editor
        // (e.g. on the input element) as chart interactions.
        e.stopPropagation();
      }}
    >
      <input
        ref={inputRef}
        className="td-editor-input"
        value={value}
        placeholder="Type, Enter to save"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            finish("commit");
          } else if (e.key === "Escape") {
            e.preventDefault();
            finish("cancel");
          }
          // Stop propagation so Delete / Backspace inside the
          // editor don't trip the canvas's selection-scoped delete
          // shortcut — typing should never erase your own drawing.
          e.stopPropagation();
        }}
        onBlur={() => finish("commit")}
        spellCheck={false}
        autoComplete="off"
      />
    </div>
  );
}
