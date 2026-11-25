"use client";

import { History, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { readScanHistory, type HistoryEntry } from "@/lib/history";
import { ScanReport } from "./scan-report";

const PAGE_SIZE = 12;
const timeFormat = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
});
const listTimeFormat = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
});

function sourceLabel(entry: HistoryEntry) {
  return entry.source === "camera" ? "摄像头" : "图片";
}

function historyStatus(entry: HistoryEntry, activeId?: string) {
  switch (entry.outcome?.status) {
    case "completed": return "已识别";
    case "failed": return "识别失败";
    case "cancelled": return "已取消";
    default: return entry.id === activeId ? "识别中" : "未完成";
  }
}

function HistoryFrame({ blob, thumbnail = false }: { blob: Blob; thumbnail?: boolean }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);

  const className = thumbnail ? "history-thumbnail" : "history-frame";
  return url
    ? <img className={className} src={url} alt={thumbnail ? "" : "扫描关键帧"} />
    : <span className={className} aria-hidden />;
}

export function ScanHistory({
  revision, activeId, onClose,
}: {
  revision: number;
  activeId?: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE_SIZE);

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
      if (!ignore) setError("暂时无法读取此浏览器的扫描记录。");
    });
    return () => { ignore = true; };
  }, [revision]);

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
          <h2 id="history-title">历史记录</h2>
          <p className="muted">关键帧和结果保存在当前浏览器。</p>
        </div>
        <button type="button" className="icon-button" aria-label="关闭历史记录" onClick={onClose}>
          <X size={21} aria-hidden />
        </button>
      </header>

      {error && <p role="alert" className="error-message">{error}</p>}

      {selected ? (
        <>
          <div className="history-detail-top">
            <button className="button text-button" onClick={() => select(null)}>返回列表</button>
            <span className="muted">{sourceLabel(selected)} · {timeFormat.format(selected.createdAt)}</span>
          </div>
          <HistoryFrame blob={selected.frame} />
          {selectedOutcome?.status === "completed" ? (
            <ScanReport record={{ ...selectedOutcome.reply, model: selected.model }} busy={false} awaiting="" />
          ) : (
            <div className="history-outcome" role="status">
              <strong>{historyStatus(selected, activeId)}</strong>
              <p className="muted">{selectedOutcome?.message ?? "此记录保留了识别时的关键帧。"}</p>
            </div>
          )}
        </>
      ) : entries?.length ? (
        <>
          <ul className="history-list">
            {entries.slice(0, limit).map((entry) => (
              <li key={entry.id}>
                <button type="button" className="history-entry" onClick={() => select(entry.id)}>
                  <HistoryFrame blob={entry.frame} thumbnail />
                  <span className="history-entry-content">
                    <strong>{entry.outcome?.status === "completed"
                      ? entry.outcome.reply.result.name : sourceLabel(entry) + "扫描"}</strong>
                    <span className="history-entry-meta">
                      <time dateTime={new Date(entry.createdAt).toISOString()}>
                        {listTimeFormat.format(entry.createdAt)}
                      </time>
                      <span>{sourceLabel(entry)}</span>
                    </span>
                  </span>
                  <span className={"pill " + (entry.outcome?.status === "completed" ? "connected" : "frame-label")}>
                    {historyStatus(entry, activeId)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {entries.length > limit && <button type="button" className="button secondary history-more"
            onClick={() => setLimit((count) => count + PAGE_SIZE)}>显示更多</button>}
        </>
      ) : !error && (
        <p className="history-empty" role="status">{entries ? "小本本还空着，扫一次就有记录。" : "正在读取历史记录…"}</p>
      )}
    </dialog>
  );
}
