import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";

/** Non-modal: the apartment remains visible and operable alongside the panel. */
export function WorkspacePanel({ title, open, onClose, children, className = "" }: {
  title: string; open: boolean; onClose: () => void; children: ReactNode; className?: string;
}) {
  const titleId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const [expanded, setExpanded] = useState(false);
  const dragStart = useRef<number | null>(null);
  const dragged = useRef(false);
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    heading.current?.focus({ preventScroll: true });
    return () => { if (opener?.isConnected) opener.focus({ preventScroll: true }); };
  }, [open]);
  return <section role="dialog" aria-modal="false" aria-labelledby={titleId} hidden={!open}
    className={`ws-panel ${expanded ? "expanded" : ""} ${className}`}>
    <button className="ws-sheet-handle" aria-label={expanded ? "Collapse panel" : "Expand panel"} aria-expanded={expanded}
      onClick={() => { if (!dragged.current) setExpanded((value) => !value); dragged.current = false; }}
      onPointerDown={(event) => { dragged.current = false; dragStart.current = event.clientY; event.currentTarget.setPointerCapture(event.pointerId); }}
      onPointerUp={(event) => {
        const distance = event.clientY - (dragStart.current ?? event.clientY);
        if (Math.abs(distance) > 30) { dragged.current = true; setExpanded(distance < 0); }
        dragStart.current = null;
      }}><span />{expanded ? <ChevronDown size={16} /> : <ChevronUp size={16} />}</button>
    <div className="ws-panel-heading"><h2 id={titleId} ref={heading} tabIndex={-1}>{title}</h2><button className="ws-icon" onClick={onClose} aria-label={`Close ${title.toLowerCase()}`}><X size={20} /></button></div>
    <div className="ws-panel-body">{children}</div>
  </section>;
}
