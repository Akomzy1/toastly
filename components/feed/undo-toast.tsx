"use client";

import * as React from "react";

/**
 * The bar at the bottom of the screen after "Not for me" and "Bring back"
 * (design/prototype/not-for-me.html): dark green, white words, a gold Undo when
 * there is one. Polite live region so a screen reader says it once.
 */
export function UndoToast({ text, onUndo, open }: { text: string; onUndo?: () => void; open: boolean }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed inset-x-3 bottom-[calc(70px+env(safe-area-inset-bottom))] z-[60] mx-auto flex min-h-14 max-w-[652px] items-center gap-2.5 rounded-xl bg-green-800 py-1.5 pl-4 pr-1.5 shadow-[0_18px_36px_-18px_rgba(5,3,9,0.7)] transition-[opacity,transform] duration-200 motion-reduce:transition-none lg:bottom-6 ${
        open ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2.5 opacity-0"
      }`}
    >
      <span className="min-w-0 flex-1 py-2 text-[14.5px] leading-[1.45] text-white">{text}</span>
      {onUndo ? (
        <button
          type="button"
          onClick={onUndo}
          tabIndex={open ? 0 : -1}
          className="min-h-11 flex-shrink-0 rounded-lg border-0 bg-transparent px-3.5 text-[14.5px] font-semibold text-gold-500 hover:bg-gold-500/[.12]"
        >
          Undo
        </button>
      ) : null}
    </div>
  );
}
