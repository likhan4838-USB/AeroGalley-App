import { useState } from 'react';
import { T } from '../theme';
import { KPICard } from '../components/KPICard';
import { Combobox } from '../components/Combobox';
// Wastage Management on the phone, on the WEB's own store — the
// "wastage-entries" list routes/wastage-management.tsx persists.
//
// A report is raised here in the same shape the web writes (Pending In-Charge,
// with the "Prepared By · Submitted" step already on its trail), so it enters
// the very same three-stage approval chain — In-Charge → GM Catering → Final
// Authorization — which is worked in Approval Management, not here.
import { activeItems } from '@/lib/sample-data';
import { getAuthUser } from '@/lib/auth';

const BTN_BACK = { background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: T.radiusFull, width: 32, height: 32, cursor: 'pointer', color: '#fff', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 };
// Top-bar action. Shared by "+ Sale" and "+ Log" so the pair reads as one set.
const BTN_TOP = { background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.55)', borderRadius: T.radiusMd, height: 30, padding: '0 11px', cursor: 'pointer', color: '#fff', fontSize: 12, fontWeight: 700, fontFamily: T.fontBody, flexShrink: 0 };
const LABEL = { fontSize: 11, fontWeight: 700, color: T.textTertiary, fontFamily: T.fontBody, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 };
const INPUT = { width: '100%', boxSizing: 'border-box', border: `1px solid ${T.border}`, borderRadius: T.radiusMd, padding: '10px 12px', fontSize: 13, fontFamily: T.fontBody, outline: 'none', background: T.bgSurface, color: T.textPrimary };
const CARD = { background: T.bgSurface, border: `1px solid ${T.border}`, borderRadius: T.radiusLg, padding: '12px 14px', marginBottom: 10, boxShadow: T.shadowSm };
const SECTION = { fontSize: 11, fontWeight: 700, color: T.textTertiary, fontFamily: T.fontBody, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '16px 2px 8px' };
// The salvage-sale block, tinted with the approved/green accent so the one
// method that RECOVERS money is visually distinct from the destructive ones —
// the same signal the web gives it with its emerald panel.
const SALE_CARD = { background: T.statusApprovedBg, border: `1px solid ${T.statusApproved}40`, borderRadius: T.radiusLg, padding: '12px 14px', marginBottom: 14 };

/** Pill button for the sale block's mode pickers — tap targets, not a dropdown. */
const chip = (on, bad) => ({
  padding: '7px 12px', borderRadius: T.radiusFull,
  border: `1px solid ${on ? T.primary : (bad ? T.statusRejected : T.border)}`,
  background: on ? T.primary : T.bgSurface, color: on ? '#fff' : T.textTertiary,
  fontSize: 11.5, fontWeight: 700, fontFamily: T.fontBody, cursor: 'pointer',
});

const WASTAGE_KEY = 'harvest-data-v1:wastage-entries';

// The web's own option lists, so a report raised here reads identically there.
const WASTAGE_TYPES = ['Production', 'Airport Store', 'Return Item', 'Transfer', 'Expired Product'];
const DISPOSAL_REASONS = [
  'Expired / Past Expiry Date', 'Physical Damage', 'Contamination', 'Over-production',
  'Quality Rejection', 'Temperature Abuse', 'Pest / Rodent Damage', 'Spillage / Breakage',
  'Customer Complaint', 'Other',
];
const DISPOSAL_METHODS = [
  'Incineration', 'Composting', 'Landfill Disposal', 'Sewage / Drain', 'Animal Feed',
  'Third-party Disposal', 'Sell', 'Destroy', 'N/A',
];
// "Sell" is the one method that recovers money rather than just destroying the
// stock, so it carries a salvage-sale record: the web's WastageSaleDetails,
// rendered there as the "Selling / Salvage Details" panel and totalled as the
// "recovered" column in Wastage Analytics. These option lists are the ones
// Damaged Product Sales uses, so a sale raised here reads identically on web.
const SELL = 'Sell';
const PAYMENT_MODES = ['Cash', 'Bank Transfer', 'Mobile Banking', 'Cheque', 'Other'];
const MOBILE_PROVIDERS = ['Bkash', 'Nagad', 'Other'];
const UNITS = ['Kg', 'g', 'L', 'ml', 'Pcs', 'Units', 'Box', 'Tray', 'Bag'];
const ITEM_NAMES = activeItems.map((i) => i.name);

const WSTATUS = {
  'Pending In-Charge': { label: 'Pending In-Charge', color: T.statusPending,  bg: T.statusPendingBg },
  'Pending GM':        { label: 'Pending GM',        color: T.statusPending,  bg: T.statusPendingBg },
  'Pending Final':     { label: 'Pending Final',     color: T.statusBoarding, bg: T.statusBoardingBg },
  'Final Approved':    { label: 'Final Approved',    color: T.statusApproved, bg: T.statusApprovedBg },
  'Rejected':          { label: 'Rejected',          color: T.statusRejected, bg: T.statusRejectedBg },
};
const STATUS_KEYS = Object.keys(WSTATUS);
const PENDING = ['Pending In-Charge', 'Pending GM', 'Pending Final'];

const num = (v) => Number(v) || 0;
const money = (n) => `৳ ${num(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const p2 = (n) => String(n).padStart(2, '0');
const todayDate = () => { const d = new Date(); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };
const nowTime = () => { const d = new Date(); return `${p2(d.getHours())}:${p2(d.getMinutes())}`; };
const stamp = () => `${todayDate()} ${nowTime()}`;

function readEntries() {
  try { const raw = localStorage.getItem(WASTAGE_KEY); return raw ? JSON.parse(raw) : []; }
  catch { return []; }
}
function writeEntries(list) {
  try { localStorage.setItem(WASTAGE_KEY, JSON.stringify(list)); } catch { /* quota — non-fatal */ }
}

/** WDD-YYYY-#### — the web's own id sequence. */
function genId(entries) {
  const max = entries.reduce((m, e) => {
    const n = parseInt(String(e.id).split('-').pop() ?? '0', 10);
    return n > m ? n : m;
  }, 0);
  return `WDD-${new Date().getFullYear()}-${String(max + 1).padStart(4, '0')}`;
}

function Chip({ label, color, bg }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 700, color, background: bg, padding: '2px 8px', borderRadius: T.radiusFull, fontFamily: T.fontBody, flexShrink: 0 }}>
      {label}
    </span>
  );
}

function Empty({ icon, text }) {
  return (
    <div style={{ textAlign: 'center', padding: '46px 0' }}>
      <div style={{ fontSize: 36, marginBottom: 10 }}>{icon}</div>
      <div style={{ fontSize: 13, color: T.textTertiary, fontFamily: T.fontBody, padding: '0 24px' }}>{text}</div>
    </div>
  );
}

function Row({ label, value }) {
  const v = String(value ?? '').trim();
  if (v === '') return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, padding: '7px 0', borderTop: `1px solid ${T.border}` }}>
      <span style={{ fontSize: 12, color: T.textTertiary, fontFamily: T.fontBody }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: T.textPrimary, fontFamily: T.fontBody, textAlign: 'right' }}>{v}</span>
    </div>
  );
}

export function WastageScreen({ nav }) {
  const [entries, setEntries] = useState(() => readEntries());
  const [view, setView]     = useState('list');   // 'list' | 'detail' | 'log' | 'sale'
  const [activeId, setActiveId] = useState(null);
  const [query, setQuery]   = useState('');
  const [filter, setFilter] = useState('all');
  const [notice, setNotice] = useState('');
  const flash = (m) => { setNotice(m); setTimeout(() => setNotice(''), 2800); };

  const kpis = {
    total: entries.length,
    pending: entries.filter((e) => PENDING.includes(e.status)).length,
    approved: entries.filter((e) => e.status === 'Final Approved').length,
    qty: entries.reduce((s, e) => s + num(e.disposalQty), 0),
  };

  const visible = entries.filter((e) => {
    if (filter !== 'all' && e.status !== filter) return false;
    if (!query.trim()) return true;
    const hay = `${e.id} ${e.itemName} ${e.wastageType} ${e.disposalReason} ${e.preparedBy}`.toLowerCase();
    return hay.includes(query.trim().toLowerCase());
  });
  const sorted = [...visible].sort((a, b) => String(b.preparedAt ?? '').localeCompare(String(a.preparedAt ?? '')));
  const activeEntry = entries.find((e) => e.id === activeId) ?? null;

  // ── Log form ──────────────────────────────────────────────────────────────
  const [fType, setFType] = useState('');
  const [fItem, setFItem] = useState('');
  const [fQty, setFQty] = useState('');
  const [fUnit, setFUnit] = useState('Kg');
  const [fBatch, setFBatch] = useState('');
  const [fReason, setFReason] = useState('');
  const [fReasonOther, setFReasonOther] = useState('');
  const [fReprocess, setFReprocess] = useState('No');
  const [fMethod, setFMethod] = useState('');
  const [fRootCause, setFRootCause] = useState('');
  const [fCorrection, setFCorrection] = useState('');
  const [touched, setTouched] = useState(false);

  // Salvage-sale fields — only collected, and only required, when the method is Sell.
  const [fBuyer, setFBuyer] = useState('');
  const [fSaleQty, setFSaleQty] = useState('');
  const [fUnitPrice, setFUnitPrice] = useState('');
  const [fPayMode, setFPayMode] = useState('');
  const [fBankAcc, setFBankAcc] = useState('');
  const [fProvider, setFProvider] = useState('');
  const [fProviderOther, setFProviderOther] = useState('');
  const [fMobNo, setFMobNo] = useState('');
  const [fChequeNo, setFChequeNo] = useState('');
  const [fOtherMethod, setFOtherMethod] = useState('');
  const [fSaleRef, setFSaleRef] = useState('');
  const [fSaleRemarks, setFSaleRemarks] = useState('');
  // Whether the sale quantity has been set by hand — see `setQty` below.
  const [saleQtyEdited, setSaleQtyEdited] = useState(false);

  const isSell = fMethod === SELL;
  const saleTotal = num(fSaleQty) * num(fUnitPrice);

  const resetSale = () => {
    setFBuyer(''); setFSaleQty(''); setFUnitPrice(''); setFPayMode('');
    setFBankAcc(''); setFProvider(''); setFProviderOther(''); setFMobNo('');
    setFChequeNo(''); setFOtherMethod(''); setFSaleRef(''); setFSaleRemarks('');
    setSaleQtyEdited(false);
  };

  /**
   * Sale quantity shadows the disposal quantity until the user types one of
   * their own, so "sold the whole lot" — the usual case, and the only case the
   * sale flow can pre-fill, since it opens before any quantity exists — needs
   * no second entry. A partial sale is still a single edit away.
   */
  const setQty = (v) => {
    setFQty(v);
    if (isSell && !saleQtyEdited) setFSaleQty(v);
  };

  /**
   * Picking Sell opens the sale block pre-filled with the disposal quantity —
   * selling the whole disposed lot is the common case, so the usual path is to
   * leave it alone. Leaving Sell clears the block so a stale buyer/price can
   * never ride along on a method that recovers nothing.
   */
  const pickMethod = (m) => {
    setFMethod(m);
    if (m === SELL) { if (!fSaleQty) setFSaleQty(fQty); }
    else resetSale();
  };

  /**
   * Switching payment mode drops the previous mode's identifier, so a cheque
   * number can't survive onto a cash sale and reach the record.
   */
  const pickPayMode = (m) => {
    setFPayMode(m);
    setFBankAcc(''); setFProvider(''); setFProviderOther(''); setFMobNo('');
    setFChequeNo(''); setFOtherMethod('');
  };

  const resetForm = () => {
    setFType(''); setFItem(''); setFQty(''); setFUnit('Kg'); setFBatch('');
    setFReason(''); setFReasonOther(''); setFReprocess('No'); setFMethod('');
    setFRootCause(''); setFCorrection(''); setTouched(false);
    resetSale();
  };

  /**
   * A sale is the same disposal report with its method fixed to Sell — one
   * record shape, one approval chain — so it reuses the log form rather than
   * duplicating it. Only the entry point and the method field differ, which is
   * why Sell no longer appears in the log form's method list.
   */
  const isSaleFlow = view === 'sale';
  const openLog  = () => { resetForm(); setView('log'); };
  const openSale = () => { resetForm(); setFMethod(SELL); setView('sale'); };

  /** The identifier that makes a payment traceable, per mode. Cash needs none. */
  const payDetailOk =
    fPayMode === 'Cash' ? true
    : fPayMode === 'Bank Transfer' ? !!fBankAcc.trim()
    : fPayMode === 'Mobile Banking' ? !!fProvider && !!fMobNo.trim() && (fProvider !== 'Other' || !!fProviderOther.trim())
    : fPayMode === 'Cheque' ? !!fChequeNo.trim()
    : fPayMode === 'Other' ? !!fOtherMethod.trim()
    : false;

  const saleOk = !isSell || (
    !!fBuyer.trim() && num(fSaleQty) > 0 && num(fUnitPrice) > 0 && !!fPayMode && payDetailOk
  );

  const canLog = fType && fItem.trim() && num(fQty) > 0 && fReason
    && (fReason !== 'Other' || fReasonOther.trim()) && fRootCause.trim() && saleOk;

  /** The record the web writes — straight into the In-Charge approval stage. */
  const submitLog = () => {
    setTouched(true);
    if (!canLog) return;
    const user = getAuthUser();
    const by = user?.name ?? 'Mobile';
    const at = stamp();
    const entry = {
      id: genId(entries),
      reportingDate: todayDate(),
      wastageType: fType,
      itemName: fItem.trim(),
      packageBatchSize: '',
      batchCode: fBatch.trim() || 'N/A',
      productionDate: 'N/A',
      disposalQty: num(fQty),
      disposalQtyUnit: fUnit,
      disposalReason: fReason === 'Other' ? (fReasonOther.trim() || 'Other') : fReason,
      reprocessingPossibility: fReprocess,
      disposalMethod: fMethod || 'N/A',
      disposalDate: todayDate(),
      disposalTime: nowTime(),
      rootCause: fRootCause.trim(),
      correction: fCorrection.trim() || 'N/A',
      correctiveActionPlan: [],
      responsiblePersons: [],
      eligibleForCompensation: false,
      compensationJustification: '',
      preparedBy: by,
      preparedByDesignation: user?.role ?? 'Senior Executive-Food Safety & Hygiene',
      preparedAt: at,
      status: 'Pending In-Charge',
      approvalSteps: [
        { step: 'Prepared By', by, designation: user?.role ?? 'Senior Executive-Food Safety & Hygiene', action: 'Submitted', at },
      ],
      // Written only for Sell. The web treats the presence of `saleDetails` as
      // the marker for its Selling / Salvage panel and sums `totalValue` into
      // the analytics "recovered" column, so an absent key has to keep meaning
      // "nothing was recovered" — hence the spread rather than an empty object.
      ...(isSell ? {
        saleDetails: {
          buyer: fBuyer.trim(),
          saleQty: num(fSaleQty),
          unit: fUnit,
          unitPrice: num(fUnitPrice),
          totalValue: saleTotal,
          paymentMode: fPayMode,
          reference: fSaleRef.trim() || 'N/A',
          remarks: fSaleRemarks.trim() || 'N/A',
          saleDate: todayDate(),
          // Mode-specific identifiers — each key is omitted unless its mode is
          // the one chosen, matching the optional fields on the web's type.
          ...(fPayMode === 'Bank Transfer' ? { bankAccountNo: fBankAcc.trim() } : {}),
          ...(fPayMode === 'Mobile Banking' ? {
            mobileProvider: fProvider === 'Other' ? fProviderOther.trim() : fProvider,
            mobileNo: fMobNo.trim(),
          } : {}),
          ...(fPayMode === 'Cheque' ? { chequeNo: fChequeNo.trim() } : {}),
          ...(fPayMode === 'Other' ? { otherMethod: fOtherMethod.trim() } : {}),
        },
      } : {}),
    };
    const next = [entry, ...entries];
    setEntries(next);
    writeEntries(next);
    const sold = isSell ? ` ${money(saleTotal)} recovered.` : '';
    resetForm();
    setView('list');
    flash(`${entry.id} submitted — Pending In-Charge approval.${sold}`);
  };

  // ── Log Wastage / Record Sale ─────────────────────────────────────────────
  if (view === 'log' || isSaleFlow) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: T.bgBase, overflow: 'hidden' }}>
        <div style={{ background: T.topbarGradient, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <button onClick={() => { resetForm(); setView('list'); }} style={BTN_BACK}>←</button>
          <div>
            <div style={{ fontFamily: T.fontBody, fontSize: 15, fontWeight: 700, color: '#fff' }}>
              {isSaleFlow ? 'Record Sale' : 'Log Wastage'}
            </div>
            <div style={{ fontFamily: T.fontBody, fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 1 }}>
              {isSaleFlow ? 'Salvage sale · goes for approval' : 'Disposal report · goes for approval'}
            </div>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          <div style={{ marginBottom: 14 }}>
            <div style={LABEL}>Wastage Type *</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {WASTAGE_TYPES.map((t) => {
                const on = fType === t;
                return (
                  <button key={t} onClick={() => setFType(t)}
                    style={{ padding: '7px 12px', borderRadius: T.radiusFull, border: `1px solid ${on ? T.primary : (touched && !fType ? T.statusRejected : T.border)}`, background: on ? T.primary : T.bgSurface, color: on ? '#fff' : T.textTertiary, fontSize: 11.5, fontWeight: 700, fontFamily: T.fontBody, cursor: 'pointer' }}>
                    {t}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={LABEL}>Item *</div>
            <Combobox value={fItem} onChange={setFItem} options={ITEM_NAMES}
              placeholder="Search or type the item" invalid={touched && !fItem.trim()} />
          </div>

          <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            <div style={{ flex: 1 }}>
              <div style={LABEL}>Disposal Qty *</div>
              <input type="number" inputMode="decimal" value={fQty} onChange={(e) => setQty(e.target.value)}
                placeholder="0"
                style={{ ...INPUT, fontWeight: 700, borderColor: touched && !(num(fQty) > 0) ? T.statusRejected : T.border }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={LABEL}>Unit</div>
              <select value={fUnit} onChange={(e) => setFUnit(e.target.value)} style={{ ...INPUT, fontSize: 12 }}>
                {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={LABEL}>Batch Code</div>
            <input value={fBatch} onChange={(e) => setFBatch(e.target.value)} placeholder="Batch / lot reference" style={INPUT} />
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={LABEL}>Disposal Reason *</div>
            <select value={fReason} onChange={(e) => setFReason(e.target.value)}
              style={{ ...INPUT, fontSize: 12, borderColor: touched && !fReason ? T.statusRejected : T.border }}>
              <option value="">Select a reason…</option>
              {DISPOSAL_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            {fReason === 'Other' && (
              <input value={fReasonOther} onChange={(e) => setFReasonOther(e.target.value)}
                placeholder="Specify the reason" style={{ ...INPUT, marginTop: 8 }} />
            )}
          </div>

          <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            <div style={{ flex: 1 }}>
              <div style={LABEL}>Reprocessing</div>
              <div style={{ display: 'flex', border: `1px solid ${T.border}`, borderRadius: T.radiusMd, overflow: 'hidden' }}>
                {['Yes', 'No', 'N/A'].map((v) => (
                  <button key={v} onClick={() => setFReprocess(v)}
                    style={{ flex: 1, padding: '9px 0', fontSize: 12, fontWeight: 700, fontFamily: T.fontBody, cursor: 'pointer', border: 'none',
                      background: fReprocess === v ? T.primary : T.bgSurface, color: fReprocess === v ? '#fff' : T.textTertiary }}>
                    {v}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* The sale flow fixes the method to Sell, so its picker is replaced by
              a read-only marker. The log flow offers every other method — Sell
              is reached through "+ Sale" instead, so it is filtered out here to
              keep one way in. The stored value is "Sell" either way, which is
              what the web reads. */}
          {isSaleFlow ? (
            <div style={{ marginBottom: 14 }}>
              <div style={LABEL}>Disposal Method</div>
              <div style={{ ...INPUT, display: 'flex', alignItems: 'center', gap: 7, background: T.statusApprovedBg, borderColor: `${T.statusApproved}40`, color: T.statusApproved, fontWeight: 700 }}>
                <span style={{ fontSize: 13 }}>💰</span> Sell
              </div>
            </div>
          ) : (
            <div style={{ marginBottom: 14 }}>
              <div style={LABEL}>Disposal Method</div>
              <select value={fMethod} onChange={(e) => pickMethod(e.target.value)} style={{ ...INPUT, fontSize: 12 }}>
                <option value="">Select a method…</option>
                {DISPOSAL_METHODS.filter((m) => m !== SELL).map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          )}

          {/* Salvage sale — appears only for Sell, and every field in it is
              required only while it is open (see `saleOk`). */}
          {isSell && (
            <div style={SALE_CARD}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                <span style={{ fontSize: 14 }}>💰</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: T.statusApproved, fontFamily: T.fontBody }}>
                  Selling / Salvage Details
                </span>
              </div>

              <div style={{ marginBottom: 12 }}>
                <div style={LABEL}>Sold To (Buyer / Party) *</div>
                <input value={fBuyer} onChange={(e) => setFBuyer(e.target.value)}
                  placeholder="Buyer or party name"
                  style={{ ...INPUT, borderColor: touched && !fBuyer.trim() ? T.statusRejected : T.border }} />
              </div>

              <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={LABEL}>Sale Qty ({fUnit}) *</div>
                  <input type="number" inputMode="decimal" value={fSaleQty}
                    onChange={(e) => { setFSaleQty(e.target.value); setSaleQtyEdited(true); }}
                    placeholder="0"
                    style={{ ...INPUT, fontWeight: 700, borderColor: touched && !(num(fSaleQty) > 0) ? T.statusRejected : T.border }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={LABEL}>Unit Price (৳) *</div>
                  <input type="number" inputMode="decimal" value={fUnitPrice} onChange={(e) => setFUnitPrice(e.target.value)}
                    placeholder="0.00"
                    style={{ ...INPUT, fontWeight: 700, borderColor: touched && !(num(fUnitPrice) > 0) ? T.statusRejected : T.border }} />
                </div>
              </div>

              {/* Live total — the number the approver and the analytics both care
                  about, so it is shown as it is typed rather than after submit. */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: T.bgSurface, border: `1px solid ${T.statusApproved}40`, borderRadius: T.radiusMd, padding: '10px 12px', marginBottom: 12 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: T.textTertiary, fontFamily: T.fontBody, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Total Value
                </span>
                <span style={{ fontSize: 15, fontWeight: 700, color: T.statusApproved, fontFamily: T.fontBody }}>
                  {money(saleTotal)}
                </span>
              </div>

              <div style={{ marginBottom: 12 }}>
                <div style={LABEL}>Payment Mode *</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {PAYMENT_MODES.map((m) => (
                    <button key={m} onClick={() => pickPayMode(m)} style={chip(fPayMode === m, touched && !fPayMode)}>
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              {fPayMode === 'Bank Transfer' && (
                <div style={{ marginBottom: 12 }}>
                  <div style={LABEL}>Bank A/C No. *</div>
                  <input value={fBankAcc} onChange={(e) => setFBankAcc(e.target.value)}
                    placeholder="Account number" inputMode="numeric"
                    style={{ ...INPUT, borderColor: touched && !fBankAcc.trim() ? T.statusRejected : T.border }} />
                </div>
              )}

              {fPayMode === 'Mobile Banking' && (
                <>
                  <div style={{ marginBottom: 12 }}>
                    <div style={LABEL}>Provider *</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {MOBILE_PROVIDERS.map((p) => (
                        <button key={p} onClick={() => { setFProvider(p); if (p !== 'Other') setFProviderOther(''); }}
                          style={chip(fProvider === p, touched && !fProvider)}>
                          {p}
                        </button>
                      ))}
                    </div>
                    {fProvider === 'Other' && (
                      <input value={fProviderOther} onChange={(e) => setFProviderOther(e.target.value)}
                        placeholder="Provider name"
                        style={{ ...INPUT, marginTop: 8, borderColor: touched && !fProviderOther.trim() ? T.statusRejected : T.border }} />
                    )}
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <div style={LABEL}>Mobile No. *</div>
                    <input value={fMobNo} onChange={(e) => setFMobNo(e.target.value)}
                      placeholder="01XXXXXXXXX" inputMode="tel"
                      style={{ ...INPUT, borderColor: touched && !fMobNo.trim() ? T.statusRejected : T.border }} />
                  </div>
                </>
              )}

              {fPayMode === 'Cheque' && (
                <div style={{ marginBottom: 12 }}>
                  <div style={LABEL}>Cheque No. *</div>
                  <input value={fChequeNo} onChange={(e) => setFChequeNo(e.target.value)}
                    placeholder="Cheque number"
                    style={{ ...INPUT, borderColor: touched && !fChequeNo.trim() ? T.statusRejected : T.border }} />
                </div>
              )}

              {fPayMode === 'Other' && (
                <div style={{ marginBottom: 12 }}>
                  <div style={LABEL}>Payment Method *</div>
                  <input value={fOtherMethod} onChange={(e) => setFOtherMethod(e.target.value)}
                    placeholder="How was it paid?"
                    style={{ ...INPUT, borderColor: touched && !fOtherMethod.trim() ? T.statusRejected : T.border }} />
                </div>
              )}

              <div style={{ marginBottom: 12 }}>
                <div style={LABEL}>Reference</div>
                <input value={fSaleRef} onChange={(e) => setFSaleRef(e.target.value)}
                  placeholder="Receipt / voucher reference" style={INPUT} />
              </div>

              <div>
                <div style={LABEL}>Remarks</div>
                <textarea value={fSaleRemarks} onChange={(e) => setFSaleRemarks(e.target.value)} rows={2}
                  placeholder="Anything worth noting about the sale"
                  style={{ ...INPUT, resize: 'none' }} />
              </div>
            </div>
          )}

          <div style={{ marginBottom: 14 }}>
            <div style={LABEL}>Root Cause *</div>
            <textarea value={fRootCause} onChange={(e) => setFRootCause(e.target.value)} rows={2}
              placeholder="Why did this happen?"
              style={{ ...INPUT, resize: 'none', borderColor: touched && !fRootCause.trim() ? T.statusRejected : T.border }} />
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={LABEL}>Correction Taken</div>
            <textarea value={fCorrection} onChange={(e) => setFCorrection(e.target.value)} rows={2}
              placeholder="What was done immediately?" style={{ ...INPUT, resize: 'none' }} />
          </div>

          <button onClick={submitLog} disabled={!canLog}
            style={{ width: '100%', padding: '13px 0', background: canLog ? T.buttonGradient : T.borderStrong, border: 'none', borderRadius: T.radiusMd, fontSize: 13, fontWeight: 700, color: '#fff', fontFamily: T.fontBody, cursor: canLog ? 'pointer' : 'not-allowed', opacity: canLog ? 1 : 0.7 }}>
            {isSaleFlow ? 'Submit Sale For Approval' : 'Submit For Approval'}
          </button>
          <div style={{ fontSize: 11, color: T.textTertiary, fontFamily: T.fontBody, textAlign: 'center', marginTop: 8 }}>
            Goes to In-Charge → GM Catering → Final Authorization.
          </div>
        </div>
      </div>
    );
  }

  // ── Detail ────────────────────────────────────────────────────────────────
  if (view === 'detail' && activeEntry) {
    const e = activeEntry;
    const s = WSTATUS[e.status] ?? WSTATUS['Pending In-Charge'];
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: T.bgBase, overflow: 'hidden' }}>
        <div style={{ background: T.topbarGradient, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <button onClick={() => { setActiveId(null); setView('list'); }} style={BTN_BACK}>←</button>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: T.fontBody, fontSize: 15, fontWeight: 700, color: '#fff' }}>{e.itemName}</div>
            <div style={{ fontFamily: T.fontBody, fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 1 }}>{e.id} · {e.wastageType || 'Unspecified'}</div>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px 16px' }}>
          <div style={CARD}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: T.textPrimary, fontFamily: T.fontBody }}>
                {num(e.disposalQty).toLocaleString()} {e.disposalQtyUnit}
              </span>
              <Chip label={s.label} color={s.color} bg={s.bg} />
            </div>
            <Row label="Wastage Type" value={e.wastageType} />
            <Row label="Reported" value={e.reportingDate} />
            <Row label="Batch Code" value={e.batchCode} />
            <Row label="Disposal Reason" value={e.disposalReason} />
            <Row label="Reprocessing" value={e.reprocessingPossibility} />
            <Row label="Disposal Method" value={e.disposalMethod} />
            <Row label="Disposed" value={`${e.disposalDate ?? ''} ${e.disposalTime ?? ''}`.trim()} />
            <Row label="Prepared By" value={`${e.preparedBy}${e.preparedByDesignation ? ` · ${e.preparedByDesignation}` : ''}`} />
            <Row label="Prepared At" value={e.preparedAt} />
            {e.returnRef && <Row label="Return Ref" value={e.returnRef} />}
            {e.stockItemName && <Row label="Stock Item" value={`${e.stockItemName}${e.previousStock != null ? ` · was ${e.previousStock}` : ''}`} />}
          </div>

          {/* Mirrors the web's "Selling / Salvage Details" panel. `Row` hides
              itself when a value is blank, so the mode-specific identifiers
              below show up only for the mode the sale actually used. */}
          {e.saleDetails && (
            <>
              <div style={SECTION}>Selling / Salvage</div>
              <div style={{ ...CARD, background: T.statusApprovedBg, borderColor: `${T.statusApproved}40` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: T.textTertiary, fontFamily: T.fontBody }}>Total Recovered</span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: T.statusApproved, fontFamily: T.fontBody }}>
                    {money(e.saleDetails.totalValue)}
                  </span>
                </div>
                <Row label="Sold To" value={e.saleDetails.buyer} />
                <Row label="Sale Qty" value={`${num(e.saleDetails.saleQty).toLocaleString()} ${e.saleDetails.unit ?? ''}`.trim()} />
                <Row label="Unit Price" value={money(e.saleDetails.unitPrice)} />
                <Row label="Payment" value={e.saleDetails.paymentMode} />
                <Row label="A/C No." value={e.saleDetails.bankAccountNo} />
                <Row label="Provider" value={e.saleDetails.mobileProvider} />
                <Row label="Mobile No." value={e.saleDetails.mobileNo} />
                <Row label="Cheque No." value={e.saleDetails.chequeNo} />
                <Row label="Method" value={e.saleDetails.otherMethod} />
                <Row label="Reference" value={e.saleDetails.reference} />
                <Row label="Sale Date" value={e.saleDetails.saleDate} />
                <Row label="Remarks" value={e.saleDetails.remarks} />
              </div>
            </>
          )}

          {(e.rootCause || e.correction) && (
            <>
              <div style={SECTION}>Analysis</div>
              <div style={CARD}>
                <Row label="Root Cause" value={e.rootCause} />
                <Row label="Correction" value={e.correction} />
                {(e.correctiveActionPlan ?? []).map((a, i) => (
                  <Row key={i} label={`Action ${i + 1}`} value={a} />
                ))}
              </div>
            </>
          )}

          {(e.responsiblePersons ?? []).length > 0 && (
            <>
              <div style={SECTION}>Responsible ({e.responsiblePersons.length})</div>
              <div style={CARD}>
                {e.responsiblePersons.map((p, i) => (
                  <div key={`${p.empId}-${i}`} style={{ padding: '8px 0', borderTop: i > 0 ? `1px solid ${T.border}` : 'none' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: T.textPrimary, fontFamily: T.fontBody }}>{p.name}</span>
                      {num(p.penaltyAmount) > 0 && (
                        <span style={{ fontSize: 12, fontWeight: 700, color: T.statusRejected, fontFamily: T.fontBody }}>
                          ৳ {num(p.penaltyAmount).toLocaleString()}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: T.textTertiary, fontFamily: T.fontBody, marginTop: 2 }}>
                      {[p.empId, p.designation, p.section].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Approval trail — the three-stage chain, as recorded on the entry */}
          <div style={SECTION}>Approval Trail</div>
          <div style={CARD}>
            {(e.approvalSteps ?? []).length === 0 ? (
              <div style={{ fontSize: 12, color: T.textTertiary, fontFamily: T.fontBody, padding: '4px 0' }}>No steps recorded yet.</div>
            ) : e.approvalSteps.map((st, i) => {
              const color = st.action === 'Approved' ? T.statusApproved
                : st.action === 'Rejected' ? T.statusRejected
                : st.action === 'Returned' ? T.statusPending : T.statusInfo;
              return (
                <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 0', borderTop: i > 0 ? `1px solid ${T.border}` : 'none' }}>
                  <span style={{ width: 9, height: 9, borderRadius: T.radiusFull, background: color, flexShrink: 0, marginTop: 4 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: T.textPrimary, fontFamily: T.fontBody }}>{st.step}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color, fontFamily: T.fontBody }}>{st.action}</span>
                    </div>
                    <div style={{ fontSize: 11, color: T.textTertiary, fontFamily: T.fontBody, marginTop: 2 }}>
                      {[st.by, st.designation, st.at].filter(Boolean).join(' · ')}
                    </div>
                    {st.comment && (
                      <div style={{ fontSize: 11, color: T.textSecondary, fontFamily: T.fontBody, marginTop: 3 }}>{st.comment}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {PENDING.includes(e.status) && (
            <div style={{ background: T.statusPendingBg, border: `1px solid ${T.statusPending}30`, borderRadius: T.radiusMd, padding: '10px 14px', marginTop: 10, fontSize: 12, color: T.statusPending, fontFamily: T.fontBody }}>
              Waiting on {e.status.replace('Pending ', '')} — signed off in Approval Management.
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── List ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: T.bgBase, overflow: 'hidden' }}>
      <div style={{ background: T.topbarGradient, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <button onClick={() => nav.goBack()} style={BTN_BACK}>←</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: T.fontBody, fontSize: 15, fontWeight: 700, color: '#fff' }}>Wastage Management</div>
          <div style={{ fontFamily: T.fontBody, fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 1 }}>
            {kpis.total} report{kpis.total === 1 ? '' : 's'} · {kpis.pending} pending
          </div>
        </div>
        {/* Two ways in: a plain disposal, or a salvage sale. Same record and the
            same approval chain — the sale route just arrives with its method and
            sale block already set up. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <button onClick={openSale} style={BTN_TOP}>+ Sale</button>
          <button onClick={openLog}  style={BTN_TOP}>+ Log</button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px 16px' }}>
        {notice && (
          <div style={{ background: T.statusApprovedBg, border: `1px solid ${T.statusApproved}30`, borderRadius: T.radiusMd, padding: '9px 12px', marginBottom: 10, fontSize: 11, fontWeight: 700, color: T.statusApproved, fontFamily: T.fontBody }}>
            {notice}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <KPICard label="Total Reports"   value={kpis.total}    sub="All records"     accent={T.statusInfo} />
          <KPICard label="Pending Approval" value={kpis.pending} sub="Awaiting action" accent={T.statusPending} />
          <KPICard label="Final Approved"  value={kpis.approved} sub="Fully processed" accent={T.statusApproved} />
          <KPICard label="Total Disposal"  value={kpis.qty.toFixed(1)} sub="Cumulative qty" accent={T.statusRejected} />
        </div>

        <input value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Search item, type, reason…" style={{ ...INPUT, marginTop: 12 }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0 0' }}>
          <button onClick={() => setFilter('all')}
            style={{ flexShrink: 0, padding: '8px 14px', borderRadius: T.radiusFull, border: `1px solid ${filter === 'all' ? T.primary : T.border}`, background: filter === 'all' ? T.primary : T.bgSurface, color: filter === 'all' ? '#fff' : T.textTertiary, fontSize: 12, fontWeight: 700, fontFamily: T.fontBody, cursor: 'pointer' }}>
            All
          </button>
          <select value={filter} onChange={(ev) => setFilter(ev.target.value)}
            style={{ ...INPUT, flex: 1, minWidth: 0, padding: '9px 10px', fontSize: 12, fontWeight: 700 }}>
            <option value="all">All statuses</option>
            {STATUS_KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>

        <div style={{ ...SECTION, marginTop: 12 }}>
          {sorted.length} report{sorted.length === 1 ? '' : 's'}
        </div>

        {sorted.length === 0 ? (
          <Empty icon="🗑️" text={entries.length === 0
            ? 'No wastage reports yet. Tap “+ Log” to raise one, or “+ Sale” to record a salvage sale.'
            : 'No reports match the current filter.'} />
        ) : sorted.map((e) => {
          const s = WSTATUS[e.status] ?? WSTATUS['Pending In-Charge'];
          return (
            <div key={e.id} onClick={() => { setActiveId(e.id); setView('detail'); }} style={{ ...CARD, cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                <div style={{ flex: 1, paddingRight: 8, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.textPrimary, fontFamily: T.fontBody }}>{e.itemName}</div>
                  <div style={{ fontSize: 11, color: T.textTertiary, fontFamily: T.fontBody, marginTop: 2 }}>
                    {e.id} · {e.wastageType || 'Unspecified'} · {e.reportingDate}
                  </div>
                </div>
                <Chip label={s.label} color={s.color} bg={s.bg} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                <span style={{ fontSize: 11.5, color: T.textSecondary, fontFamily: T.fontBody, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {e.disposalReason}
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, color: T.textPrimary, fontFamily: T.fontBody, flexShrink: 0, paddingLeft: 8 }}>
                  {num(e.disposalQty).toLocaleString()} {e.disposalQtyUnit}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
