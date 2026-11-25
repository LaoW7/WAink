"use client";

import { Camera } from "lucide-react";
import { useEffect, useRef } from "react";
import { ScanReport, type ScanRecord } from "./scan-report";

export const MOBILE_REPORT_VIEWPORT = "(max-width: 740px)";

export function ScanResultSheet({
  record, onDismiss, onStartScan,
}: {
  record: ScanRecord;
  onDismiss: () => void;
  onStartScan: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const current = dialog.current;
    if (!current) return;
    const viewport = window.matchMedia(MOBILE_REPORT_VIEWPORT);
    if (!viewport.matches) {
      onDismiss();
      return;
    }
    current.showModal();

    function dismissOnWideScreen(event: MediaQueryListEvent) {
      if (!event.matches) onDismiss();
    }
    viewport.addEventListener("change", dismissOnWideScreen);
    return () => {
      viewport.removeEventListener("change", dismissOnWideScreen);
      current.close();
    };
  }, [onDismiss]);

  return (
    <dialog ref={dialog} className="result-sheet" aria-label="目标档案"
      onCancel={(event) => { event.preventDefault(); onDismiss(); }}>
      <div className="result-sheet-scroll">
        <ScanReport record={record} busy={false} awaiting="" onDismiss={onDismiss} />
      </div>
      <div className="result-sheet-actions">
        <button type="button" className="button primary" onClick={() => {
          dialog.current?.close();
          onStartScan();
        }}>
          <Camera size={19} aria-hidden />开始扫描
        </button>
      </div>
    </dialog>
  );
}
