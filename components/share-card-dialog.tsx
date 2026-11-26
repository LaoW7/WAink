"use client";

import { Download, LoaderCircle, Share2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { translations, type Locale } from "@/lib/i18n";
import { renderShareCard, type ShareCardRecord } from "@/lib/share-card";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function shareFilename(name: string) {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_-]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return `waink-${slug || "dossier"}.png`;
}

export function ShareCardDialog({
  locale,
  record,
  image,
  onClose,
}: {
  locale: Locale;
  record: ShareCardRecord;
  image: string | Blob;
  onClose: () => void;
}) {
  const t = translations[locale].share;
  const dialog = useRef<HTMLDialogElement>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    setBlob(null);
    setPreviewUrl("");
    setError("");
    setNotice("");

    void renderShareCard({ record, image, locale }).then(
      (rendered) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(rendered);
        setBlob(rendered);
        setPreviewUrl(objectUrl);
      },
      () => {
        if (active) setError(t.renderError);
      },
    );

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [record, image, locale, t.renderError]);

  const filename = shareFilename(record.result.name);

  function saveImage() {
    if (!blob) return;
    downloadBlob(blob, filename);
    setNotice(t.savedNotice);
  }

  async function shareImage() {
    if (!blob || sharing) return;
    setNotice("");
    const file = new File([blob], filename, { type: "image/png" });
    const canShareFiles =
      typeof navigator.share === "function" &&
      (!navigator.canShare || navigator.canShare({ files: [file] }));

    if (!canShareFiles) {
      downloadBlob(blob, filename);
      setNotice(t.fallbackSavedNotice);
      return;
    }

    setSharing(true);
    try {
      await navigator.share({
        files: [file],
        title: record.result.name,
      });
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      downloadBlob(blob, filename);
      setNotice(t.fallbackSavedNotice);
    } finally {
      setSharing(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      className="settings-dialog share-dialog"
      aria-labelledby="share-title"
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
    >
      <div className="dialog-heading">
        <div className="dialog-icon"><Share2 size={21} aria-hidden /></div>
        <button type="button" className="icon-button" aria-label={t.closeAria} onClick={onClose}>
          <X size={21} aria-hidden />
        </button>
      </div>
      <h2 id="share-title">{t.title}</h2>
      <p className="muted dialog-intro">{t.subtitle}</p>

      <div className="share-preview-stage">
        {previewUrl ? (
          <img className="share-preview-image" src={previewUrl} alt={record.result.name} />
        ) : !error ? (
          <div className="share-loading" role="status">
            <LoaderCircle className="spin" size={28} aria-hidden />
            <span>{t.rendering}</span>
          </div>
        ) : null}
      </div>

      {error && <p className="error-message" role="alert">{error}</p>}
      {notice && <p className="share-status" role="status">{notice}</p>}

      <div className="dialog-actions share-actions">
        <button type="button" className="button secondary" disabled={!blob} onClick={saveImage}>
          <Download size={18} aria-hidden />
          {t.saveButton}
        </button>
        <button type="button" className="button primary" disabled={!blob || sharing} onClick={() => void shareImage()}>
          {sharing ? <LoaderCircle className="spin" size={18} aria-hidden /> : <Share2 size={18} aria-hidden />}
          {sharing ? t.sharing : t.shareButton}
        </button>
      </div>
    </dialog>
  );
}
