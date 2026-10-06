import type { ExecutiveMetric } from "../../lib/cnx/executive-brief";

const levels = { good: "ติดตามต่อเนื่อง", watch: "เฝ้าระวัง", alert: "ควรตรวจสอบเร่งด่วน", critical: "ถึงเกณฑ์วิกฤต", unknown: "ยังประเมินไม่ได้" };
const date = new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });

/** The selected desk explains the number before exposing detailed records. */
export default function CnxMetricEvidence({ metric }: { metric: ExecutiveMetric }) {
  const observed = Date.parse(metric.observedAt ?? "");
  const state = metric.state === "stale" ? "ข้อมูลเก่า" : metric.state === "unavailable" ? "ข้อมูลไม่เพียงพอ" : levels[metric.level];
  return <section aria-label={`${metric.titleTh} · ความหมายและขั้นตอนถัดไป`} className="border-b border-[var(--line)] bg-[var(--bg-surface)] p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-[15px] font-semibold">{metric.titleTh} · หลักฐานเพื่อปฏิบัติการ</h2>
      <span className={`text-[12px] font-semibold ${metric.state === "current" && ["alert", "critical"].includes(metric.level) ? "text-[var(--danger)]" : "text-[var(--dim)]"}`}>{state}</span>
    </div>
    <p className="mt-2 text-[13px] leading-relaxed">{metric.summaryTh}</p>
    <p className="mt-3 border-l-2 border-[var(--cool)] pl-3 text-[13px] leading-relaxed"><strong>ตรวจสอบต่อ: </strong>{metric.actionTh}</p>
    <p className="mt-3 break-words text-[11px] leading-relaxed text-[var(--dim)]">แหล่งข้อมูล: {metric.source}<br />{Number.isFinite(observed) ? <>เวลาสังเกต: <time dateTime={metric.observedAt!}>{date.format(observed)} น. (กรุงเทพฯ)</time></> : "ยังไม่มีเวลาสังเกตที่ยืนยันได้"}</p>
  </section>;
}
