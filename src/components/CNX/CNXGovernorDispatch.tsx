"use client";

import { useEffect, useState } from "react";
import { useLang } from "../../hooks/useLang";
import { useModalDialog } from "../../hooks/useModalDialog";

const PENDING_KEY = "cnx-pending-governor-dispatch";
type Pending = { requestId: string; latitude: number; longitude: number; instruction: string };
function pendingRequest(value: unknown): value is Pending {
  if (!value || typeof value !== "object") return false;
  const p = value as Pending;
  return typeof p.requestId === "string" && /^[0-9a-f-]{36}$/i.test(p.requestId)
    && typeof p.latitude === "number" && Number.isFinite(p.latitude) && Math.abs(p.latitude) <= 90
    && typeof p.longitude === "number" && Number.isFinite(p.longitude) && Math.abs(p.longitude) <= 180
    && typeof p.instruction === "string" && p.instruction.length > 0 && p.instruction.length <= 2000;
}

export default function CnxGovernorDispatch({ latitude, longitude, onClose }: {
  latitude: number; longitude: number; onClose: () => void;
}) {
  const { t } = useLang();
  const ref = useModalDialog(true, onClose);
  const [instruction, setInstruction] = useState("");
  const [pin, setPin] = useState("");
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<{ id: string; status: string } | null>(null);
  const [error, setError] = useState("");
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(PENDING_KEY);
      if (saved) {
        const previous: unknown = JSON.parse(saved);
        if (!pendingRequest(previous)) throw new Error("invalid saved request");
        setPending(previous); setInstruction(previous.instruction); setRequestId(previous.requestId as ReturnType<typeof crypto.randomUUID>); setUnconfirmed(true);
        setError(t("มีคำสั่งที่ยังยืนยันการส่งไม่ได้ ตรวจสอบปลายทางก่อนลองส่งซ้ำ", "An earlier instruction is unconfirmed. Check the receiving chat before retrying."));
      }
      setLoaded(true);
    } catch { setUnconfirmed(true); setError(t("อ่านข้อมูลคำสั่งค้างไม่ได้ ยังไม่อนุญาตให้ส่งซ้ำ", "Saved request cannot be read. Sending is blocked to prevent duplicates.")); }
  }, [t]);
  const location = pending ?? { latitude, longitude };
  const inputClass = "min-h-11 w-full border border-[var(--line)] bg-[var(--bg)] p-2 text-sm text-[var(--ink)]";
  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!loaded || busy || receipt) return;
    const draft = pending ?? { requestId, latitude, longitude, instruction };
    // Persist the exact retry identity before any outbound request. Never save the PIN.
    try { sessionStorage.setItem(PENDING_KEY, JSON.stringify(draft)); setPending(draft); }
    catch { setError(t("บันทึกหมายเลขคำสั่งไม่ได้ — ยังไม่ส่งข้อความ", "Request reference could not be saved. Nothing sent.")); return; }
    setBusy(true); setError("");
    const code = pin; setPin("");
    try {
      const response = await fetch("/api/cnx/governor-dispatch", {
        method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store",
        body: JSON.stringify({ ...draft, pin: code }),
        signal: AbortSignal.timeout(20_000),
      });
      const body = await response.json();
      const retrySeconds = Number(response.headers.get("Retry-After"));
      const retryMinutes = Math.max(1, Math.ceil((Number.isFinite(retrySeconds) && retrySeconds > 0 ? retrySeconds : 60) / 60));
      if (response.ok && body.receipt?.requestId === draft.requestId && body.receipt?.id && ["queued", "sent"].includes(body.receipt.status)) {
        setReceipt(body.receipt); sessionStorage.removeItem(PENDING_KEY);
      }
      else { const notSent = [400, 401, 403, 413, 415, 429, 503].includes(response.status);
        if (!notSent) setUnconfirmed(true);
        if (!unconfirmed && notSent) { sessionStorage.removeItem(PENDING_KEY); setPending(null); }
        setError(response.status === 401 ? t("รหัสไม่ถูกต้อง", "Code not accepted")
        : response.status === 429 ? t(`ลองหลายครั้งเกินไป รอ ${retryMinutes} นาที`, `Too many attempts. Wait ${retryMinutes} minutes.`)
        : response.status === 503 ? t("ยังไม่ได้เชื่อมต่อปลายทาง Telegram — ยังไม่ส่งข้อความ", "Telegram destination is not connected yet. Nothing sent.")
        : t("ยังยืนยันการส่งไม่ได้ ตรวจสอบปลายทางก่อนลองส่งซ้ำ", "Delivery is unconfirmed. Check the receiving chat before retrying.")); }
    } catch { setUnconfirmed(true); setError(t("ยังยืนยันการส่งไม่ได้ ตรวจสอบปลายทางก่อนลองส่งซ้ำ", "Delivery is unconfirmed. Check the receiving chat before retrying.")); }
    finally { setBusy(false); }
  }
  return <div className="fixed inset-0 z-[210] flex items-start justify-center overflow-y-auto bg-black/60 p-3 sm:items-center" onClick={onClose}>
    <div ref={ref} role="dialog" aria-modal="true" aria-label={t("สั่งการ ณ จุดนี้", "Instruction at this pin")}
      className="my-3 w-full max-w-md border border-[var(--line)] bg-[var(--bg-raised)] p-3 text-[var(--ink)]" onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between gap-2"><h2 className="text-lg font-semibold">{t("สั่งการ ณ จุดนี้", "Instruction at this pin")}</h2>
        <button type="button" onClick={onClose} aria-label={t("ปิด", "Close instruction")} className="min-h-11 min-w-11 border border-[var(--line)]">×</button></div>
      <p className="text-sm tabular-nums">{location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}</p>
      {loaded && <p className="mt-1 break-all text-xs text-[var(--dim)]">{t("หมายเลขคำสั่ง", "Request reference")} · {requestId}</p>}
      <p className="mt-1 text-xs text-[var(--dim)]">Telegram · Smart City Thailand CDP</p>
      {receipt ? <div role="status" className="mt-3 text-sm"><p>{receipt.status === "sent" ? t("Telegram รับข้อความแล้ว", "Telegram accepted the message") : t("เข้าคิวส่งแล้ว", "Queued for delivery")} · {receipt.id}</p>
        <p className="mt-1 text-[var(--dim)]">{t("ยังไม่ใช่การยืนยันรับงานหรือดำเนินการเสร็จ", "This does not confirm acknowledgement or completion.")}</p></div>
        : <form onSubmit={send} className="mt-3 space-y-3">
          <label className="block text-sm">{t("ต้องการให้ทำอะไรที่นี่", "What needs doing here?")}
            <textarea required maxLength={2000} rows={3} value={instruction} onChange={e => setInstruction(e.target.value)} disabled={busy || unconfirmed} className={inputClass + " mt-1 resize-y"} /></label>
          <label className="block text-sm">{t("รหัสอนุมัติส่ง", "Send authorization code")}
            <input type="password" inputMode="numeric" autoComplete="off" required maxLength={4} pattern="[0-9]{4}" value={pin} onChange={e => setPin(e.target.value)} disabled={busy} className={inputClass + " mt-1 max-w-40"} /></label>
          {error && <p role="alert" className="text-sm text-[var(--ink)]">{error}</p>}
          <p className="text-xs text-[var(--dim)]">{t("ข้อความและพิกัดจะส่งไปยังปลายทางที่ผู้ดูแลกำหนด รหัสใช้อนุมัติการส่ง ไม่ยืนยันตัวบุคคล", "The instruction and coordinates go to the configured receiving chat. The code authorizes sending; it does not verify identity.")}</p>
          <button disabled={busy || !loaded} className="cnx-primary-action min-h-11 border px-3 text-sm font-semibold">{busy ? t("กำลังส่ง…", "Sending…") : unconfirmed ? t("ลองส่งคำสั่งเดิมอีกครั้ง", "Retry the same instruction") : t("ส่งผ่าน Telegram", "Send via Telegram")}</button>
          {unconfirmed && !busy && <button type="button" className="block min-h-11 text-left text-xs underline" onClick={() => {
            sessionStorage.removeItem(PENDING_KEY); onClose();
          }}>{t("ตรวจสอบปลายทางแล้ว ปิดคำสั่งค้างนี้", "I checked the receiving chat; clear this pending request")}</button>}
        </form>}
    </div>
  </div>;
}
