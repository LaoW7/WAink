import {
  CarFront, ClipboardList, Focus, KeyRound, LoaderCircle, MapPin, Package, Radar, ShieldCheck, X,
} from "lucide-react";
import { useId } from "react";
import type { ScanReply, ScanResult } from "@/lib/scan";

export type ScanRecord = ScanReply & { model?: string };
type Feature = NonNullable<ScanResult["security"]>["alarm"];

const category = {
  vehicle: { label: "车辆", icon: CarFront },
  landmark: { label: "地标", icon: MapPin },
  object: { label: "物品", icon: Package },
  unknown: { label: "未知目标", icon: Focus },
};

const confidence = { low: "低", medium: "中", high: "高" };
const featureSource = { visible: "画面可见", inferred: "AI 推测", unknown: "依据不足" };
const amount = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 });
const inTenThousands = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 });

export const sampleRecord: ScanRecord = {
  sources: [],
  result: {
    category: "vehicle",
    name: "海岸 GT",
    subtitle: "经典双门跑车 · 80 年代风格",
    summary: "珊瑚红宽体配棕榈落日，停海边跟插了面“速来接管”的旗子似的。老家伙没定位倒省心，就是这贯穿尾灯太扎眼，开进喷漆店前怕是得先吃两颗星。",
    confidence: "medium",
    details: [
      { label: "外观颜色", value: "珊瑚红" },
      { label: "车身形式", value: "双门硬顶" },
    ],
    valuation: { min: 180000, max: 260000, basis: "经典双门跑车二手估价" },
    registrationPrice: { min: 120, max: 300, basis: "车辆登记工本费" },
    security: {
      alarm: { value: "疑似原厂警报", source: "inferred", confidence: "medium", evidence: "按同年代车型的常见选装配置推测。" },
      access: { value: "传统机械钥匙", source: "inferred", confidence: "medium", evidence: "80 年代双门跑车普遍采用物理门锁与机械钥匙点火，若门锁卡滞通常需检修机械锁芯。" },
      tracker: { value: "可能无原厂定位", source: "inferred", confidence: "low", evidence: "这一年代的车型通常未提供原厂车联网服务。" },
    },
  },
};

function Price({ label, price }: { label: string; price: ScanResult["valuation"] }) {
  let value = "—";
  if (price) {
    const unit = price.min >= 10_000 ? 10_000 : 1;
    const formatter = unit === 1 ? amount : inTenThousands;
    const low = formatter.format(price.min / unit);
    const high = formatter.format(price.max / unit);
    value = "¥" + (low === high ? low : low + "–" + high) + (unit === 1 ? "" : " 万");
  }
  return (
    <div className="report-row price-row">
      <dt>{label}</dt>
      <dd className="row-value price-number">{value}</dd>
    </div>
  );
}

function Security({ label, feature, icon: Icon }: { label: string; feature: Feature; icon: typeof Radar }) {
  return (
    <div className="report-row security-row">
      <dt className="feature-label"><Icon size={17} aria-hidden />{label}</dt>
      <dd className="row-value security-value">{feature.value}</dd>
      <dd className="security-context">
        <span className="attribute">{featureSource[feature.source]} · 置信度{confidence[feature.confidence]}</span>
        <span className="security-evidence">{feature.evidence}</span>
      </dd>
    </div>
  );
}

export function ScanReport({
  record, busy, awaiting, onDismiss,
}: {
  record: ScanRecord | null;
  busy: boolean;
  awaiting: string;
  onDismiss?: () => void;
}) {
  const titleId = useId();
  const item = record?.result;
  const KindIcon = item ? category[item.category].icon : Focus;
  const access = item?.security
    ? item.security.access ?? (item.security as { unlock?: Feature }).unlock
    : undefined;
  return (
    <section className="panel report" aria-labelledby={titleId} aria-busy={busy}>
      <div className="panel-heading">
        <h2 id={titleId}><ClipboardList aria-hidden />目标档案</h2>
        {(record || onDismiss) && (
          <div className="report-heading-actions">
            {record && <span className={record.model ? "pill connected" : "pill sample"}>{record.model ? "AI 识别" : "示例档案"}</span>}
            {onDismiss && (
              <button type="button" className="icon-button" aria-label="关闭目标档案" onClick={onDismiss}>
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
          <strong>{busy ? "正在翻档案…" : "坐等目标入镜"}</strong>
          {!busy && <p>{awaiting}</p>}
        </div>
      ) : (
        <div className="report-body">
          <div className="report-title-card">
            <div className="report-title-meta">
              <span className="kind-label"><KindIcon size={16} aria-hidden />{category[item.category].label}</span>
              <span className="report-confidence">识别置信度 · {confidence[item.confidence]}</span>
            </div>
            <h3>{item.name}</h3>
            {item.subtitle && <p className="subtitle">{item.subtitle}</p>}
          </div>

          {item.security && (
            <div className="report-group">
              <h4>车辆安防</h4>
              <dl className="report-table security-list">
                <Security label="防盗装置" feature={item.security.alarm} icon={ShieldCheck} />
                {access && <Security label="解锁方式" feature={access} icon={KeyRound} />}
                <Security label="追踪器" feature={item.security.tracker} icon={Radar} />
              </dl>
            </div>
          )}

          {(item.category === "vehicle" || item.category === "object") && (
            <div className="report-group">
              <h4>钱包预警</h4>
              <dl className="report-table">
                <Price label="AI 估价" price={item.valuation} />
                {item.category === "vehicle" && <Price label="预估登记费" price={item.registrationPrice} />}
              </dl>
            </div>
          )}

          {item.details.length > 0 && (
            <div className="report-group">
              <h4>{item.category === "vehicle" ? "车辆参数" : "识别参数"}</h4>
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
              <strong>公开资料</strong>
              {record.sources.map(({ url, title }) => (
                <a key={url} href={url} target="_blank" rel="noreferrer noopener">{title}</a>
              ))}
            </div>
          )}
          {record?.model && <p className="report-source" title={record.model}>识别模型 · {record.model}</p>}
        </div>
      )}
    </section>
  );
}
