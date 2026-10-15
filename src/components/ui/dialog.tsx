"use client";
import { useEffect, useRef, useId } from "react";
import { X } from "lucide-react";
export function Dialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const el = ref.current;
    if (open && !el?.open) el?.showModal();
    if (!open && el?.open) el.close();
  }, [open]);
  return (
    <dialog ref={ref} aria-labelledby={id} onCancel={onClose} onClose={onClose}>
      <div className="mb-5 flex items-center justify-between gap-4">
        <h2 id={id} className="text-lg font-medium">
          {title}
        </h2>
        <button
          type="button"
          className="btn"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={16} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
