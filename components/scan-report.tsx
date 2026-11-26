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
      name: "Coast GT",
      subtitle: "Classic Coupe · 80s Retro",
      summary: "Coral red widebody against a palm-tree sunset—parked like a neon 'come take me' sign. No factory locator on this relic, though those full-width taillights practically earn two stars before the respray shop.",
      details: [
        { label: "Exterior Color", value: "Coral Red" },
        { label: "Body Style", value: "2-Door Coupe" },
      ],
      valuation: { min: 25000, max: 38000 },
      registrationPrice: { min: 80, max: 220 },
      security: {
        alarm: { value: "Factory Alarm", evidence: "Standard factory security package on coupes of this era." },
        access: { value: "Mechanical Key Lock", evidence: "Physical door locks and mechanical key ignition; cylinder servicing required if jammed." },
        tracker: { value: "No OEM Tracker", evidence: "Classic 80s chassis shipped without factory telematics." },
      },
    },
  },
  zh: {
    sources: [],
    lang: "zh",
    result: {
      category: "vehicle",
      name: "海岸 GT",
      subtitle: "经典双门跑车 · 80 年代风格",
      summary: "珊瑚红宽体配棕榈落日，停海边跟插了面“速来接管”的旗子似的。老家伙没定位倒省心，就是这贯穿尾灯太扎眼，开进喷漆店前怕是得先吃两颗星。",
      details: [
        { label: "外观颜色", value: "珊瑚红" },
        { label: "车身形式", value: "双门硬顶" },
      ],
      valuation: { min: 180000, max: 260000 },
      registrationPrice: { min: 120, max: 300 },
      security: {
        alarm: { value: "原厂警报", evidence: "80 年代双门跑车常见原厂安保配置。" },
        access: { value: "传统机械钥匙", evidence: "物理门锁配合机械钥匙点火，门锁卡滞需检修机械锁芯。" },
        tracker: { value: "无原厂定位", evidence: "80 年代经典车型未配备原厂车联网定位模块。" },
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
    note: string;
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
          <span>{info.note}</span>
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
        {(record?.model || (item && onShare) || onDismiss) && (
          <div className="report-heading-actions">
            {record?.model && <span className="pill connected">{t.pillAi}</span>}
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
                      note: t.registrationFormulaNote,
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
