import { translations, type Locale } from "./i18n";
import type { ScanReply, ScanResult } from "./scan";

export type ShareCardRecord = ScanReply & { model?: string; lang?: Locale };

const zhAmount = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 });
const zhTenThousands = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 });
const enAmount = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export function formatPrice(price: ScanResult["valuation"], currencyLocale: Locale) {
  if (!price) return "—";
  if (currencyLocale === "en") {
    const low = enAmount.format(price.min);
    const high = enAmount.format(price.max);
    return "$" + (low === high ? low : `${low}–$${high}`);
  }
  const unit = price.min >= 10_000 ? 10_000 : 1;
  const formatter = unit === 1 ? zhAmount : zhTenThousands;
  const low = formatter.format(price.min / unit);
  const high = formatter.format(price.max / unit);
  return "¥" + (low === high ? low : low + "–" + high) + (unit === 1 ? "" : " 万");
}

type CardBadgeIcon = "access" | "security" | "tracker";
type CardRow = { label: string; value: string; icon?: CardBadgeIcon };

const FONT_STACK = '"Inter", "PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui, sans-serif';

async function loadImageSource(source: string | Blob): Promise<HTMLImageElement> {
  const isBlob = source instanceof Blob;
  const url = isBlob ? URL.createObjectURL(source) : source;
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    if (isBlob) URL.revokeObjectURL(url);
  }
}

function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
) {
  const sw = img.naturalWidth || 1;
  const sh = img.naturalHeight || 1;
  const scale = Math.max(dw / sw, dh / sh);
  const drawW = sw * scale;
  const drawH = sh * scale;
  const offsetX = dx + (dw - drawW) / 2;
  const offsetY = dy + (dh - drawH) / 2;
  ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, startSize: number, minSize: number, weight: string) {
  let size = startSize;
  while (size > minSize) {
    ctx.font = `${weight} ${size}px ${FONT_STACK}`;
    if (ctx.measureText(text).width <= maxWidth) return { size, text };
    size -= 2;
  }
  ctx.font = `${weight} ${minSize}px ${FONT_STACK}`;
  let trimmed = text;
  while (trimmed.length > 1 && ctx.measureText(trimmed + "…").width > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }
  return { size: minSize, text: trimmed === text ? text : trimmed + "…" };
}

function drawBadgeIcon(ctx: CanvasRenderingContext2D, kind: CardBadgeIcon, cx: number, cy: number) {
  const radius = 24;
  ctx.save();

  // Circular badge frame matching GTA 6 HUD red alert medallions.
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = "#1e1b22";
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "#5c333c";
  ctx.stroke();

  ctx.strokeStyle = "#e84558";
  ctx.fillStyle = "#e84558";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (kind === "access") {
    // Key + wireless signal arcs
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(cx - 5, cy + 5, 4.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 1.5, cy + 2);
    ctx.lineTo(cx + 8, cy - 7.5);
    ctx.lineTo(cx + 10.5, cy - 5);
    ctx.moveTo(cx + 4.5, cy - 4);
    ctx.lineTo(cx + 7, cy - 1.5);
    ctx.stroke();
    ctx.lineWidth = 1.9;
    ctx.beginPath();
    ctx.arc(cx + 1, cy - 4, 6.5, -Math.PI * 0.85, -Math.PI * 0.15);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx + 1, cy - 4, 10.5, -Math.PI * 0.85, -Math.PI * 0.15);
    ctx.stroke();
  } else if (kind === "security") {
    // Shield + exclamation mark
    ctx.lineWidth = 2.3;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 11.5);
    ctx.lineTo(cx + 9.5, cy - 7.5);
    ctx.lineTo(cx + 9.5, cy + 0.5);
    ctx.quadraticCurveTo(cx + 9.5, cy + 8.5, cx, cy + 12.5);
    ctx.quadraticCurveTo(cx - 9.5, cy + 8.5, cx - 9.5, cy + 0.5);
    ctx.lineTo(cx - 9.5, cy - 7.5);
    ctx.closePath();
    ctx.stroke();
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 5.5);
    ctx.lineTo(cx, cy + 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy + 6.5, 1.5, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Location pin + signal ring
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(cx, cy - 3.5, 5.8, Math.PI * 0.82, Math.PI * 0.18, false);
    ctx.lineTo(cx, cy + 7.5);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy - 3.5, 2.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 9.5, 9.5, 3, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

export async function renderShareCard({
  record,
  image,
  locale,
}: {
  record: ShareCardRecord;
  image: string | Blob;
  locale: Locale;
}): Promise<Blob> {
  const t = translations[locale];
  const item = record.result;
  const currencyLocale = record.lang ?? locale;
  const access = item.security
    ? item.security.access ?? (item.security as { unlock?: { value: string } }).unlock
    : undefined;

  const rows: CardRow[] = [];
  if (item.security) {
    if (access) rows.push({ label: t.share.cardAccess, value: access.value, icon: "access" });
    rows.push({ label: t.share.cardSecurity, value: item.security.alarm.value, icon: "security" });
    rows.push({ label: t.share.cardTracker, value: item.security.tracker.value, icon: "tracker" });
  }
  if (item.category === "vehicle" || item.category === "object") {
    rows.push({ label: t.share.cardValuation, value: formatPrice(item.valuation, currencyLocale) });
  }
  if (item.category === "vehicle") {
    rows.push({ label: t.share.cardRegistration, value: formatPrice(item.registrationPrice, currencyLocale) });
  }

  const width = 1080;
  const photoHeight = 760;
  const panelX = 56;
  const panelY = 656;
  const panelW = width - panelX * 2;
  const headerH = 138;
  const rowH = 96;
  const bodyH = Math.max(rowH, rows.length * rowH + 16);
  const panelH = headerH + bodyH;
  const height = panelY + panelH + 56;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error(t.share.renderError);

  const img = await loadImageSource(image);

  // Dark ambient backdrop across the full card
  ctx.fillStyle = "#0b0d14";
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.globalAlpha = 0.28;
  drawCoverImage(ctx, img, 0, 0, width, height);
  ctx.restore();
  const backdropGrad = ctx.createLinearGradient(0, photoHeight - 160, 0, height);
  backdropGrad.addColorStop(0, "rgba(11, 13, 20, 0.35)");
  backdropGrad.addColorStop(1, "rgba(11, 13, 20, 0.94)");
  ctx.fillStyle = backdropGrad;
  ctx.fillRect(0, 0, width, height);

  // Sharp user photo showcase in the upper stage
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, width, photoHeight);
  ctx.clip();
  drawCoverImage(ctx, img, 0, 0, width, photoHeight);
  const topFade = ctx.createLinearGradient(0, 0, 0, 160);
  topFade.addColorStop(0, "rgba(10, 12, 18, 0.55)");
  topFade.addColorStop(1, "rgba(10, 12, 18, 0)");
  ctx.fillStyle = topFade;
  ctx.fillRect(0, 0, width, 160);

  const bottomFade = ctx.createLinearGradient(0, photoHeight - 240, 0, photoHeight);
  bottomFade.addColorStop(0, "rgba(11, 13, 20, 0)");
  bottomFade.addColorStop(1, "rgba(11, 13, 20, 0.92)");
  ctx.fillStyle = bottomFade;
  ctx.fillRect(0, photoHeight - 240, width, 240);
  ctx.restore();

  // Subtle corner scanner ticks over photo
  ctx.save();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.34)";
  ctx.lineWidth = 2.5;
  const tick = 24;
  const pad = 34;
  ctx.beginPath();
  ctx.moveTo(pad, pad + tick); ctx.lineTo(pad, pad); ctx.lineTo(pad + tick, pad);
  ctx.moveTo(width - pad - tick, pad); ctx.lineTo(width - pad, pad); ctx.lineTo(width - pad, pad + tick);
  ctx.stroke();
  ctx.restore();

  // Top-left frosted brand badge
  ctx.save();
  ctx.font = `700 22px ${FONT_STACK}`;
  const badgeText = t.share.cardBrandBadge;
  const badgeW = Math.ceil(ctx.measureText(badgeText).width) + 38;
  roundRectPath(ctx, 56, 48, badgeW, 46, 10);
  ctx.fillStyle = "rgba(16, 18, 26, 0.72)";
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
  ctx.stroke();
  ctx.fillStyle = "#f4f5f8";
  ctx.textBaseline = "middle";
  ctx.fillText(badgeText, 75, 72);
  ctx.restore();

  // Floating GTA 6 WAiNK HUD panel
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
  ctx.shadowBlur = 44;
  ctx.shadowOffsetY = 18;
  roundRectPath(ctx, panelX, panelY, panelW, panelH, 12);
  ctx.fillStyle = "rgba(25, 24, 24, 0.90)";
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundRectPath(ctx, panelX, panelY, panelW, panelH, 12);
  ctx.clip();

  // Header band
  ctx.fillStyle = "#242636";
  ctx.fillRect(panelX, panelY, panelW, headerH);

  // Subtle right-side crest emblem watermark inside header
  ctx.save();
  ctx.beginPath();
  ctx.rect(panelX, panelY, panelW, headerH);
  ctx.clip();
  const emblemX = panelX + panelW - 108;
  const emblemY = panelY + 34;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  for (const [r, lw] of [[52, 16], [84, 14], [116, 12]] as const) {
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.arc(emblemX, emblemY, r, 0.1 * Math.PI, 0.9 * Math.PI);
    ctx.stroke();
  }
  ctx.restore();

  // Header text: subtitle/category on top, bold name below
  const topLine = (item.subtitle || t.report.categories[item.category]).toUpperCase();
  const nameLine = locale === "en" ? item.name.toUpperCase() : item.name;
  const headerMaxTextW = panelW - 180;
  const fittedTop = fitText(ctx, topLine, headerMaxTextW, 28, 20, "650");
  ctx.fillStyle = "#b4b8c8";
  ctx.textBaseline = "top";
  ctx.font = `650 ${fittedTop.size}px ${FONT_STACK}`;
  ctx.fillText(fittedTop.text, panelX + 34, panelY + 28);

  const fittedName = fitText(ctx, nameLine, headerMaxTextW, 46, 28, "800");
  ctx.fillStyle = "#ffffff";
  ctx.font = `800 ${fittedName.size}px ${FONT_STACK}`;
  ctx.fillText(fittedName.text, panelX + 34, panelY + 66);

  // Rows
  const bodyTop = panelY + headerH + 6;
  const insetX = 34;
  rows.forEach((row, index) => {
    const rowTop = bodyTop + index * rowH;
    const centerY = rowTop + rowH / 2;

    if (index > 0) {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(panelX + insetX, rowTop);
      ctx.lineTo(panelX + panelW - insetX, rowTop);
      ctx.stroke();
    }

    ctx.textBaseline = "middle";
    ctx.fillStyle = "#f2f3f7";
    ctx.font = `750 31px ${FONT_STACK}`;
    const labelText = row.label;
    const labelW = ctx.measureText(labelText).width;
    ctx.fillText(labelText, panelX + insetX, centerY);

    const badgeReserved = row.icon ? 66 : 0;
    const rightEdge = panelX + panelW - insetX - badgeReserved;
    const availableValueW = Math.max(180, rightEdge - (panelX + insetX + labelW + 26));
    const displayValue = locale === "en" ? row.value.toUpperCase() : row.value;
    const fittedVal = fitText(ctx, displayValue, availableValueW, 33, 21, "750");

    ctx.fillStyle = "#ffffff";
    ctx.font = `750 ${fittedVal.size}px ${FONT_STACK}`;
    ctx.textAlign = "right";
    ctx.fillText(fittedVal.text, rightEdge, centerY);
    ctx.textAlign = "left";

    if (row.icon) {
      drawBadgeIcon(ctx, row.icon, panelX + panelW - insetX - 24, centerY);
    }
  });

  ctx.restore();

  // Outer panel hairline border
  roundRectPath(ctx, panelX, panelY, panelW, panelH, 12);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.14)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error(t.share.renderError));
    }, "image/png");
  });
}
