"use client";

import {
  CarFront, ClipboardList, Focus, Info, KeyRound, LoaderCircle, MapPin, Package, Radar, Share2, ShieldCheck, X,
} from "lucide-react";
import { useEffect, useId, useState } from "react";
import { translations, type Locale } from "@/lib/i18n";
import { computeGameRegistrationFee } from "@/lib/registration-fee";
import type { ScanReply, ScanResult } from "@/lib/scan";
import { formatPrice } from "@/lib/share-card";

export type ScanRecord = ScanReply & { model?: string; lang?: Locale };
type Feature = NonNullable<ScanResult["security"]>["alarm"];

const categoryIcons = {
  vehicle: CarFront,
  landmark: MapPin,
  object: Package,
  unknown: Focus,
};

export const sampleRecords: Record<Locale, ScanRecord> = {
  en: {
    sources: [],
    lang: "en",
    result: {
      category: "vehicle",
      name: "Tesla Model 3 (Highland)",
      subtitle: "2024 All-Electric Midsize Sedan",
      summary: "Pearl white paint on dark Photon wheels—this refreshed Model 3 glides through mountain switchbacks quiet as a ghost, saving you a trip to the respray shop.",
      details: [
        { label: "Powertrain", value: "Rear-wheel single-motor electric drive" },
        { label: "Exterior", value: "Refreshed sharp LED headlights & fog-light-free bumper" },
        { label: "Wheels", value: "18-inch dark Photon aero wheels" },
        { label: "Doors", value: "Flush black door handles & frameless windows" },
        { label: "Roof", value: "Full-length panoramic glass roof" },
        { label: "Range", value: "606 km CLTC (RWD)" },
      ],
      valuation: { min: 29000, max: 36000 },
      registrationPrice: { min: 150, max: 300 },
      security: {
        alarm: { value: "Sentry Mode & Factory Alarm", evidence: "Multi-camera perimeter surveillance with Sentry Mode monitoring and PIN to Drive lock." },
        access: { value: "NFC Key Card & Phone Digital Key", evidence: "Flush door handles with a B-pillar NFC reader; tap the backup key card on the B-pillar if the phone stops responding." },
        tracker: { value: "Tesla App Remote Locator", evidence: "Built-in factory cellular telematics supporting real-time GPS tracking and remote controls via the Tesla app." },
      },
    },
  },
  zh: {
    sources: [],
    lang: "zh",
    result: {
      category: "vehicle",
      name: "Tesla Model 3 (焕新版)",
      subtitle: "2024款 纯电动中型轿车",
      summary: "珍珠白涂装配上熏黑光子轮毂，这台焕新版Model 3在山道上安静得像个幽灵，连进喷漆店改色都省了。",
      details: [
        { label: "动力形式", value: "后置单电机纯电驱动" },
        { label: "外观特征", value: "焕新版锐利LED大灯与无雾灯前杠" },
        { label: "轮毂配置", value: "18英寸熏黑光子低风阻轮毂" },
        { label: "车门设计", value: "隐藏式熏黑门把手与无框车门" },
        { label: "车顶结构", value: "一体式全景玻璃车顶" },
        { label: "续航表现", value: "CLTC工况606公里（后轮驱动版）" },
      ],
      valuation: { min: 185000, max: 235000 },
      registrationPrice: { min: 200, max: 300 },
      security: {
        alarm: { value: "原厂哨兵模式与防盗警报", evidence: "车身四周搭载多颗高清摄像头，支持哨兵模式监控与PIN码驾驶锁定" },
        access: { value: "NFC卡片与手机数字钥匙", evidence: "采用隐藏式门把手与B柱NFC感应区；手机失灵时可用NFC卡片刷B柱解锁" },
        tracker: { value: "Tesla App 远程定位系统", evidence: "原厂标配车载联网模块，支持手机App实时追踪GPS位置与远程控车" },
      },
    },
  },
};

export const sampleRecord = sampleRecords.en;

function Price({
  label, price, currencyLocale, info,
}: {
  label: string;
  price: ScanResult["valuation"];
  currencyLocale: Locale;
  info?: {
    open: boolean;
    ariaLabel: string;
    title: string;
    formula: string;
    onToggle: () => void;
  };
}) {
  return (
    <div className="report-row price-row">
      <dt className="price-label">
        <span>{label}</span>
        {info && (
          <button
            type="button"
            className="info-trigger"
            aria-label={info.ariaLabel}
            title={info.ariaLabel}
            aria-expanded={info.open}
            onClick={info.onToggle}
          >
            <Info size={14} aria-hidden />
          </button>
        )}
      </dt>
      <dd className="row-value price-number">{formatPrice(price, currencyLocale)}</dd>
      {info?.open && (
        <dd className="formula-note" role="note">
          <strong>{info.title}</strong>
          <code className="formula-expr">{info.formula}</code>
        </dd>
      )}
    </div>
  );
}

function Security({
  label, feature, icon: Icon,
}: {
  label: string;
  feature: Feature;
  icon: typeof Radar;
}) {
  return (
    <div className="report-row security-row">
      <dt className="feature-label"><Icon size={17} aria-hidden />{label}</dt>
      <dd className="row-value security-value">{feature.value}</dd>
      <dd className="security-context">
        <span className="security-evidence">{feature.evidence}</span>
      </dd>
    </div>
  );
}

export function ScanReport({
  locale = "en", record, busy, awaiting, onDismiss, onShare,
}: {
  locale?: Locale;
  record: ScanRecord | null;
  busy: boolean;
  awaiting: string;
  onDismiss?: () => void;
  onShare?: () => void;
}) {
  const titleId = useId();
  const [showFormula, setShowFormula] = useState(false);
  const t = translations[locale].report;
  const shareCopy = translations[locale].share;
  const item = record?.result;
  const KindIcon = item ? categoryIcons[item.category] : Focus;
  const access = item?.security
    ? item.security.access ?? (item.security as { unlock?: Feature }).unlock
    : undefined;
  const currencyLocale = record?.lang ?? locale;
  const registrationPrice = item ? computeGameRegistrationFee(item, currencyLocale) : null;

  useEffect(() => {
    setShowFormula(false);
  }, [record]);

  return (
    <section className="panel report" aria-labelledby={titleId} aria-busy={busy}>
      <div className="panel-heading">
        <h2 id={titleId}><ClipboardList aria-hidden />{t.heading}</h2>
        {(item || onDismiss) && (
          <div className="report-heading-actions">
            {item && <span className="pill connected">{t.pillAi}</span>}
            {item && onShare && (
              <button
                type="button"
                className="button settings-button share-trigger"
                aria-label={shareCopy.buttonAria}
                title={shareCopy.buttonAria}
                onClick={onShare}
              >
                <Share2 size={16} aria-hidden />
                <span>{shareCopy.button}</span>
              </button>
            )}
            {onDismiss && (
              <button type="button" className="icon-button" aria-label={t.dismissAria} onClick={onDismiss}>
                <X size={20} aria-hidden />
              </button>
            )}
          </div>
        )}
      </div>
      {busy || !item ? (
        <div className="report-empty" role="status">
          <div className="empty-icon">{busy
            ? <LoaderCircle className="spin" size={34} aria-hidden />
            : <Focus size={36} aria-hidden />}</div>
          <strong>{busy ? t.busyTitle : t.emptyTitle}</strong>
          {!busy && <p>{awaiting}</p>}
        </div>
      ) : (
        <div className="report-body">
          <div className="report-title-card">
            <div className="report-title-meta">
              <span className="kind-label"><KindIcon size={16} aria-hidden />{t.categories[item.category]}</span>
            </div>
            <h3>{item.name}</h3>
            {item.subtitle && <p className="subtitle">{item.subtitle}</p>}
          </div>

          {item.security && (
            <div className="report-group">
              <h4>{t.securityTitle}</h4>
              <dl className="report-table security-list">
                <Security label={t.alarmLabel} feature={item.security.alarm} icon={ShieldCheck} />
                {access && <Security label={t.accessLabel} feature={access} icon={KeyRound} />}
                <Security label={t.trackerLabel} feature={item.security.tracker} icon={Radar} />
              </dl>
            </div>
          )}

          {(item.category === "vehicle" || item.category === "object") && (
            <div className="report-group">
              <h4>{t.walletTitle}</h4>
              <dl className="report-table">
                <Price label={t.valuationLabel} price={item.valuation} currencyLocale={currencyLocale} />
                {item.category === "vehicle" && (
                  <Price
                    label={t.registrationLabel}
                    price={registrationPrice}
                    currencyLocale={currencyLocale}
                    info={{
                      open: showFormula,
                      ariaLabel: t.registrationFormulaAria,
                      title: t.registrationFormulaTitle,
                      formula: t.registrationFormulaExpr,
                      onToggle: () => setShowFormula((open) => !open),
                    }}
                  />
                )}
              </dl>
            </div>
          )}

          {item.details.length > 0 && (
            <div className="report-group">
              <h4>{item.category === "vehicle" ? t.vehicleSpecsTitle : t.objectSpecsTitle}</h4>
              <dl className="report-table">
                {item.details.map(({ label, value }, index) => (
                  <div className="report-row" key={label + index}>
                    <dt>{label}</dt><dd className="row-value">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          <p className="summary">{item.summary}</p>
          {!!record?.sources.length && (
            <div className="report-references">
              <strong>{t.publicSourcesTitle}</strong>
              {record.sources.map(({ url, title }) => (
                <a key={url} href={url} target="_blank" rel="noreferrer noopener">{title}</a>
              ))}
            </div>
          )}
          {record?.model && <p className="report-source" title={record.model}>{t.modelPrefix}{record.model}</p>}
        </div>
      )}
    </section>
  );
}
