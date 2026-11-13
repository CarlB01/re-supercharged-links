import { EditorView } from '@codemirror/view';
import { Extension } from '@codemirror/state';

export function getEngineEditorTheme(): Extension {
  return EditorView.theme({
    "[class*='scl-']": {
      color: "var(--scl-color, inherit)",
      backgroundColor: "var(--scl-bg, transparent)"
    },
    "& .cm-content .cm-link [class*='scl-'] .cm-underline": { 
      color: "var(--scl-color, inherit)",
    },
    "& .cm-content .cm-string.cm-url [class*='scl-']": { 
      textDecoration: "underline", 
      textDecorationColor: "var(--scl-color, inherit)" 
    },
    "& .cm-content .scl-with-before::before": {
      content: "var(--scl-icon-before)",
      display: "inline-block",
      verticalAlign: "middle"
    },
    "& .cm-content .scl-with-after::after": {
      content: "var(--scl-icon-after)",
      display: "inline-block",
      verticalAlign: "middle"
    }
  });
}
