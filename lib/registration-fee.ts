import type { Locale } from "./i18n";
import type { ScanResult } from "./scan";

const NEGATIVE_PATTERN = /\b(?:no|none|without)\b|无|未配备|不含|没有/i;

function accessMultiplier(text: string): number {
  if (/nfc|digital|bluetooth|uwb|app|card|数字|手机|蓝牙|卡片|感应/i.test(text)) return 0.10;
  if (/keyless|push|smart|peps|无钥匙|一键启动|智能钥匙/i.test(text)) return 0.07;
  if (/remote|fob|transponder|遥控|芯片/i.test(text)) return 0.04;
  return 0.02;
}

function alarmMultiplier(text: string): number {
  if (NEGATIVE_PATTERN.test(text)) return 0;
  if (/immobilizer|sentry|advanced|motion|防启动|哨兵|侵入|高阶|电子/i.test(text)) return 0.05;
  return 0.03;
}

function trackerMultiplier(text: string): number {
  if (NEGATIVE_PATTERN.test(text)) return 0;
  if (/advanced|satellite|real-?time|gps|onstar|sentry|高级|实时|卫星|安吉星|哨兵/i.test(text)) return 0.11;
  return 0.06;
}

function roundFee(value: number): number {
  if (value >= 10_000) return Math.round(value / 500) * 500;
  if (value >= 1_000) return Math.round(value / 100) * 100;
  return Math.round(value / 50) * 50;
}

export function computeGameRegistrationFee(
  item: ScanResult,
  currencyLocale: Locale,
): ScanResult["registrationPrice"] {
  if (item.category !== "vehicle" || !item.valuation) return item.registrationPrice;

  const access = item.security
    ? item.security.access ?? (item.security as { unlock?: { value: string } }).unlock
    : undefined;
  const accessText = access?.value ?? "";
  const alarmText = item.security?.alarm.value ?? "";
  const trackerText = item.security?.tracker.value ?? "";

  const factor = 0.08 + accessMultiplier(accessText) + alarmMultiplier(alarmText) + trackerMultiplier(trackerText);
  const minRespray = currencyLocale === "zh" ? 2800 : 400;
  const baseMin = item.registrationPrice?.min ?? 0;
  const baseMax = item.registrationPrice?.max ?? baseMin;

  const computeBound = (valuation: number, base: number) => {
    const respray = Math.max(minRespray, valuation * 0.03);
    const scrub = valuation * factor;
    return roundFee(base + respray + scrub);
  };

  const low = computeBound(item.valuation.min, baseMin);
  const high = computeBound(item.valuation.max, baseMax);
  return low <= high ? { min: low, max: high } : { min: high, max: low };
}
