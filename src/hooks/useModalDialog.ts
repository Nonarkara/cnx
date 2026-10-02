"use client";

import { useEffect, useRef } from "react";
import { activateModalDialog } from "../lib/modal-dialog";

export function useModalDialog(isOpen: boolean, onClose: () => void) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!isOpen || !dialogRef.current) return;
    return activateModalDialog(dialogRef.current, () => closeRef.current());
  }, [isOpen]);
  return dialogRef;
}
