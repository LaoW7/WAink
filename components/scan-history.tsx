"use client";

import { History, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { readScanHistory, type HistoryEntry } from "@/lib/history";
import { translations, type Locale } from "@/lib/i18n";
import { ScanReport } from "./scan-report";

const PAGE_SIZE = 12;

function HistoryFrame({ blob, thumbnail = false, alt }: { blob: Blob; thumbnail?: boolean; alt: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);

  const className = thumbnail ? "history-thumbnail" : "history-frame";
  return url
    ? <img className={className} src={url} alt={thumbnail ? "" : alt} />
    : <span className={className} aria-hidden />;
}

export function ScanHistory({
  locale, revision, activeId, onClose,
}: {
  locale: Locale;
  revision: number;
  activeId?: string;
  onClose: () => void;
}) {
  const t = translations[locale].history;
  const dialog = useRef<HTMLDialogElement>(null);
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE_SIZE);

  const timeFormat = useMemo(() => new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }), [locale]);
  const listTimeFormat = useMemo(() => new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }), [locale]);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  useEffect(() => {
    let ignore = false;
    void readScanHistory().then((history) => {
      if (ignore) return;
      setEntries(history);
      setError("");
    }, () => {
      if (!ignore) setError(t.readError);
    });
    return () => { ignore = true; };
  }, [revision, t.readError]);

  function sourceLabel(entry: HistoryEntry) {
    return entry.source === "camera" ? t.sourceCamera : t.sourcePhoto;
  }

  function historyStatus(entry: HistoryEntry) {
    switch (entry.outcome?.status) {
      case "completed": return t.statusCompleted;
      case "failed": return t.statusFailed;
      case "cancelled": return t.statusCancelled;
      default: return entry.id === activeId ? t.statusScanning : t.statusIncomplete;
    }
  }

  function select(id: string | null) {
    setSelectedId(id);
    dialog.current?.scrollTo(0, 0);
  }

  const selected = entries?.find(({ id }) => id === selectedId);
  const selectedOutcome = selected?.outcome;
  return (
    <dialog ref={dialog} className="settings-dialog history-dialog" aria-labelledby="history-title"
      onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <header className="history-heading">
        <div className="dialog-icon"><History size={21} aria-hidden /></div>
        <div>
          <h2 id="history-title">{t.title}</h2>
          <p className="muted">{t.subtitle}</p>
        </div>
        <button type="button" className="icon-button" aria-label={t.closeAria} onClick={onClose}>
          <X size={21} aria-hidden />
        </button>
      </header>

      {error && <p role="alert" className="error-message">{error}</p>}

      {selected ? (
        <>
          <div className="history-detail-top">
            <button className="button text-button" onClick={() => select(null)}>{t.backToList}</button>
            <span className="muted">{sourceLabel(selected)} · {timeFormat.format(selected.createdAt)}</span>
          </div>
          <HistoryFrame blob={selected.frame} alt={t.frameAlt} />
          {selectedOutcome?.status === "completed" ? (
            <ScanReport
              locale={locale}
              record={{ ...selectedOutcome.reply, model: selected.model, lang: selected.lang ?? "zh" }}
              busy={false}
              awaiting=""
            />
          ) : (
            <div className="history-outcome" role="status">
              <strong>{historyStatus(selected)}</strong>
              <p className="muted">{selectedOutcome?.message ?? t.fallbackMessage}</p>
            </div>
          )}
        </>
      ) : entries?.length ? (
        <>
          <ul className="history-list">
            {entries.slice(0, limit).map((entry) => (
              <li key={entry.id}>
                <button type="button" className="history-entry" onClick={() => select(entry.id)}>
                  <HistoryFrame blob={entry.frame} thumbnail alt={t.frameAlt} />
                  <span className="history-entry-content">
                    <strong>{entry.outcome?.status === "completed"
                      ? entry.outcome.reply.result.name : sourceLabel(entry) + t.scanSuffix}</strong>
                    <span className="history-entry-meta">
                      <time dateTime={new Date(entry.createdAt).toISOString()}>
                        {listTimeFormat.format(entry.createdAt)}
                      </time>
                      <span>{sourceLabel(entry)}</span>
                    </span>
                  </span>
                  <span className={"pill " + (entry.outcome?.status === "completed" ? "connected" : "frame-label")}>
                    {historyStatus(entry)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {entries.length > limit && <button type="button" className="button secondary history-more"
            onClick={() => setLimit((count) => count + PAGE_SIZE)}>{t.showMore}</button>}
        </>
      ) : !error && (
        <p className="history-empty" role="status">{entries ? t.empty : t.loading}</p>
      )}
    </dialog>
  );
}
