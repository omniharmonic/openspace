import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { EditorState } from "@codemirror/state";
import { placeholder as cmPlaceholder, EditorView } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { useEffect, useRef } from "react";

const chrome = EditorView.theme({
  "&": {
    fontSize: "12.5px",
    backgroundColor: "var(--st-field)",
    color: "var(--st-text)",
    borderRadius: "var(--st-r-sm)",
  },
  "&.cm-focused": { outline: "none", boxShadow: "var(--st-focus)" },
  ".cm-scroller": { fontFamily: "var(--st-font-mono)", lineHeight: "1.55" },
  ".cm-gutters": {
    backgroundColor: "transparent",
    color: "var(--st-text-3)",
    border: "none",
  },
  ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "var(--st-hover)" },
  ".cm-content": { caretColor: "var(--st-accent)" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    backgroundColor: "var(--st-accent-soft) !important",
  },
});

/** A CodeMirror 6 editor for CSS or HTML (Advanced settings). */
export function CodeEditor({
  value,
  onChange,
  language,
  label,
  placeholder,
  minHeight = 160,
  readOnly,
}: {
  value: string;
  onChange: (v: string) => void;
  language: "css" | "html";
  label: string;
  placeholder?: string;
  minHeight?: number;
  readOnly?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // biome-ignore lint/correctness/useExhaustiveDependencies: the view is created once; `value` syncs below
  useEffect(() => {
    if (!host.current) return;
    const v = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          language === "css" ? css() : html(),
          chrome,
          EditorView.lineWrapping,
          EditorState.readOnly.of(Boolean(readOnly)),
          EditorView.contentAttributes.of({ "aria-label": label }),
          EditorView.theme({ ".cm-content, .cm-gutter": { minHeight: `${minHeight}px` } }),
          ...(placeholder ? [cmPlaceholder(placeholder)] : []),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) onChangeRef.current(u.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = v;
    return () => {
      v.destroy();
      view.current = null;
    };
  }, [language, readOnly]);

  // External changes (undo in the editor, another collaborator) flow back in.
  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value)
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
  }, [value]);

  return <div ref={host} className="st-code-editor" data-language={language} />;
}
