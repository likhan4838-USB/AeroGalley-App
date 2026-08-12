import { useRef, useState } from 'react';
import { T } from '../theme';
import {
  NAV_CATALOGUE, MORE_TAB, navItem,
  MIN_NAV_TABS, MAX_NAV_TABS, DEFAULT_NAV_KEYS, isDefaultNavTabs,
} from '../nav-config';

const BTN_BACK = { background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: T.radiusFull, width: 32, height: 32, cursor: 'pointer', color: '#fff', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 };

/**
 * One step of a preview-strip drag, kept pure so the slot maths can be reasoned
 * about (and exercised) without a DOM.
 *
 * The strip lays every tile out at flex:1, so slots are equal width. `order` is
 * the draggable keys only; `slots` counts the trailing More tile too, which is
 * rendered but cannot be landed on — hence the clamp to the last real index.
 *
 * Returns the working order, the index the held tile now occupies, and the
 * offset from that slot's centre so the tile tracks the finger.
 */
export function previewDragStep({ left, width, order, index, clientX }) {
  const slotW = width / (order.length + 1);
  const raw = Math.floor((clientX - left) / slotW);
  const target = Math.max(0, Math.min(order.length - 1, raw));

  let next = order;
  if (target !== index) {
    next = [...order];
    const [held] = next.splice(index, 1);
    next.splice(target, 0, held);
  }
  return { order: next, index: target, dx: clientX - (left + slotW * (target + 0.5)) };
}

/** Double-headed arrow — the axis a preview tile actually travels on. */
function DragGlyph() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M3.4 3.9 1.3 6l2.1 2.1M8.6 3.9 10.7 6 8.6 8.1M1.6 6h8.8"
        stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * `hint` is the quiet grey counter the other sections use ("4 of 4", "bar is
 * full"). `action` is the loud variant: an affordance the user is meant to
 * notice and act on, so it gets the accent pill instead — passing `active`
 * fills it in while the gesture is under way.
 */
function SectionLabel({ children, hint, action, active }) {
  return (
    // Baseline is right for the plain text hints; a pill needs centring on the
    // label instead. Conditional so the other sections keep their exact rhythm.
    <div style={{ display: 'flex', alignItems: action ? 'center' : 'baseline', justifyContent: 'space-between', gap: 8, margin: '18px 2px 8px' }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: T.textTertiary, fontFamily: T.fontBody, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
        {children}
      </span>
      {action && (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0,
          fontSize: 10.5, fontWeight: 800, fontFamily: T.fontBody,
          textTransform: 'uppercase', letterSpacing: '0.04em',
          color: active ? '#fff' : T.primary,
          background: active ? T.primary : T.primaryLight,
          border: `1px solid ${active ? T.primary : T.primary + '55'}`,
          borderRadius: T.radiusFull, padding: '4px 10px', lineHeight: 1.35,
          transition: 'background 140ms ease, color 140ms ease',
        }}>
          <DragGlyph />
          {action}
        </span>
      )}
      {hint && <span style={{ fontSize: 10, color: T.textDisabled, fontFamily: T.fontBody }}>{hint}</span>}
    </div>
  );
}

// Small square icon well — same idiom as the More rows, but carrying the real
// bar icon so the picker shows exactly what will land on the bar.
function IconWell({ item, active }) {
  return (
    <div style={{
      width: 34, height: 34, borderRadius: T.radiusMd, flexShrink: 0,
      background: active ? T.primaryLight : T.bgSubtle,
      border: `1px solid ${active ? T.primary + '55' : T.border}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {item.icon(active)}
    </div>
  );
}

/**
 * Bottom Bar — pick the modules on the nav bar.
 *
 * Two lists rather than one list of checkboxes: the top one is ordered (it IS
 * the bar, left to right), the bottom one is everything still available. More is
 * shown greyed in the preview so it is obvious it cannot be removed.
 */
export function NavSettingsScreen({ nav }) {
  const tabs = nav.navTabs;
  const atMax = tabs.length >= MAX_NAV_TABS;
  const atMin = tabs.length <= MIN_NAV_TABS;

  const add    = (key) => { if (!atMax) nav.setNavTabs([...tabs, key]); };
  const remove = (key) => { if (!atMin) nav.setNavTabs(tabs.filter((k) => k !== key)); };
  const move   = (i, d) => {
    const next = [...tabs];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    nav.setNavTabs(next);
  };

  // ── Drag-to-reorder on the preview strip ───────────────────────────────────
  // Pointer events, not HTML5 drag-and-drop: `draggable` never fires on touch,
  // and this bar is dragged with a thumb. Pointer events cover mouse and touch
  // through one path, and pointer capture keeps the moves coming even when the
  // finger outruns the tile it started on.
  //
  // The working order lives in local state and is committed on release, so a
  // drag across four slots is one nav write, not one per pixel of travel.
  const stripRef = useRef(null);
  const [drag, setDrag] = useState(null); // { key, order, index, dx, moved }
  const previewKeys = drag ? drag.order : tabs;

  const onTileDown = (e, i, key) => {
    // More is pinned to the end of the bar, so it is not a drag handle.
    if (key === 'more' || tabs.length < 2) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDrag({ key, order: tabs, index: i, dx: 0, moved: false, pointerId: e.pointerId });
  };

  const onTileMove = (e, key) => {
    if (!drag || drag.key !== key || !stripRef.current) return;
    const rect = stripRef.current.getBoundingClientRect();
    const step = previewDragStep({
      left: rect.left, width: rect.width,
      order: drag.order, index: drag.index, clientX: e.clientX,
    });
    setDrag({ ...drag, ...step, moved: true });
  };

  const endDrag = (commit) => {
    if (!drag) return;
    if (commit && drag.order.some((k, i) => k !== tabs[i])) nav.setNavTabs(drag.order);
    setDrag(null);
  };

  const available = NAV_CATALOGUE.filter((i) => !tabs.includes(i.key));
  const groups = available.reduce((acc, i) => {
    (acc[i.group] = acc[i.group] || []).push(i);
    return acc;
  }, {});

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: T.bgBase, overflow: 'hidden' }}>
      <div style={{ background: T.topbarGradient, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <button onClick={() => nav.goBack()} style={BTN_BACK}>←</button>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: T.fontBody, fontSize: 15, fontWeight: 700, color: '#fff' }}>Bottom Bar</div>
          <div style={{ fontFamily: T.fontBody, fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 1 }}>
            Choose the modules you use most
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '2px 14px 24px' }}>

        {/* Live preview — the real bar, rendered at rest, and draggable */}
        <SectionLabel
          action={tabs.length > 1 ? (drag?.moved ? 'Release to place' : 'Drag to reorder') : undefined}
          active={!!drag?.moved}
        >
          Preview
        </SectionLabel>
        <div
          ref={stripRef}
          style={{
            background: T.bgSurface,
            // Accent only while a tile is in hand — the strip stays a plain
            // card at rest, so the highlight reads as live feedback.
            border: `1px solid ${drag?.moved ? T.primary : T.border}`,
            borderRadius: T.radiusLg, boxShadow: T.shadowSm, overflow: 'hidden',
            display: 'flex', padding: '9px 0',
            transition: 'border-color 140ms ease',
          }}
        >
          {[...previewKeys.map(navItem).filter(Boolean), MORE_TAB].map((item, i) => {
            const isMore = item.key === 'more';
            const held = drag?.key === item.key && drag.moved;
            const canDrag = !isMore && tabs.length > 1;
            return (
              <div
                key={item.key}
                onPointerDown={(e) => onTileDown(e, i, item.key)}
                onPointerMove={(e) => onTileMove(e, item.key)}
                onPointerUp={() => endDrag(true)}
                // Fired when the browser takes the gesture over to scroll the
                // list — abandon the drag rather than committing a half-move.
                onPointerCancel={() => endDrag(false)}
                style={{
                  flex: 1, display: 'flex', flexDirection: 'column',
                  alignItems: 'center', gap: 3,
                  opacity: isMore ? 0.5 : 1,
                  // A vertical swipe belongs to the scrolling list this strip
                  // sits in; pan-y hands that axis back to the browser and
                  // keeps the horizontal one — all a reorder needs — for us.
                  touchAction: canDrag ? 'pan-y' : 'auto',
                  userSelect: 'none', WebkitUserSelect: 'none',
                  cursor: canDrag ? (held ? 'grabbing' : 'grab') : 'default',
                  position: 'relative',
                  zIndex: held ? 2 : 1,
                  transform: held ? `translateX(${drag.dx}px) scale(1.06)` : 'none',
                  filter: held ? 'drop-shadow(0 3px 6px rgba(0,0,0,0.28))' : 'none',
                }}
              >
                {item.icon(i === 0)}
                <span style={{
                  fontSize: 9, fontFamily: T.fontBody, whiteSpace: 'nowrap',
                  fontWeight: i === 0 ? 700 : 500,
                  color: i === 0 ? T.primary : T.textTertiary,
                }}>
                  {item.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* ── On the bar ── */}
        <SectionLabel hint={`${tabs.length} of ${MAX_NAV_TABS}`}>On the bar</SectionLabel>
        {tabs.map((key, i) => {
          const item = navItem(key);
          if (!item) return null;
          return (
            <div key={key} style={{
              background: T.bgSurface, border: `1px solid ${T.border}`,
              borderRadius: T.radiusLg, padding: '9px 10px', marginBottom: 8,
              display: 'flex', alignItems: 'center', gap: 10, boxShadow: T.shadowSm,
            }}>
              <IconWell item={item} active />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.textPrimary, fontFamily: T.fontBody }}>{item.name}</div>
                <div style={{ fontSize: 10.5, color: T.textTertiary, fontFamily: T.fontBody, marginTop: 1 }}>
                  Slot {i + 1} · shows as “{item.label}”
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                <StepBtn label="↑" disabled={i === 0}               onPress={() => move(i, -1)} />
                <StepBtn label="↓" disabled={i === tabs.length - 1} onPress={() => move(i, +1)} />
                <StepBtn label="✕" danger disabled={atMin}          onPress={() => remove(key)} />
              </div>
            </div>
          );
        })}
        {atMin && (
          <div style={{ fontSize: 10.5, color: T.textDisabled, fontFamily: T.fontBody, margin: '-2px 2px 0' }}>
            At least {MIN_NAV_TABS} modules must stay on the bar.
          </div>
        )}

        {/* ── Everything else ── */}
        {Object.entries(groups).map(([group, items]) => (
          <div key={group}>
            <SectionLabel hint={atMax ? 'bar is full' : undefined}>{group}</SectionLabel>
            {items.map((item) => (
              <div
                key={item.key}
                onClick={() => add(item.key)}
                style={{
                  background: T.bgSurface, border: `1px solid ${T.border}`,
                  borderRadius: T.radiusLg, padding: '9px 10px', marginBottom: 8,
                  display: 'flex', alignItems: 'center', gap: 10,
                  cursor: atMax ? 'not-allowed' : 'pointer',
                  opacity: atMax ? 0.45 : 1,
                }}
              >
                <IconWell item={item} active={false} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.textPrimary, fontFamily: T.fontBody }}>{item.name}</div>
                  <div style={{ fontSize: 10.5, color: T.textTertiary, fontFamily: T.fontBody, marginTop: 1 }}>
                    Shows as “{item.label}”
                  </div>
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 700, fontFamily: T.fontBody,
                  color: atMax ? T.textDisabled : T.primary,
                  border: `1px solid ${atMax ? T.border : T.primary + '55'}`,
                  background: atMax ? 'transparent' : T.primaryLight,
                  borderRadius: T.radiusFull, padding: '4px 10px', flexShrink: 0,
                }}>
                  + Add
                </span>
              </div>
            ))}
          </div>
        ))}

        <button
          onClick={() => nav.setNavTabs([...DEFAULT_NAV_KEYS])}
          disabled={isDefaultNavTabs(tabs)}
          style={{
            width: '100%', marginTop: 14, padding: '11px 0',
            background: T.bgSurface, border: `1px solid ${T.border}`,
            borderRadius: T.radiusMd, fontFamily: T.fontBody,
            fontSize: 13, fontWeight: 700,
            color: isDefaultNavTabs(tabs) ? T.textDisabled : T.textSecondary,
            cursor: isDefaultNavTabs(tabs) ? 'default' : 'pointer',
          }}
        >
          Reset to default bar
        </button>

        <div style={{ fontSize: 10.5, color: T.textDisabled, fontFamily: T.fontBody, textAlign: 'center', marginTop: 10, lineHeight: 1.5 }}>
          More is always on the bar — everything you leave off is still one tap away inside it.
        </div>
      </div>
    </div>
  );
}

function StepBtn({ label, onPress, disabled, danger }) {
  return (
    <button
      onClick={onPress}
      disabled={disabled}
      style={{
        width: 28, height: 28, borderRadius: T.radiusMd,
        border: `1px solid ${T.border}`, background: T.bgSubtle,
        color: disabled ? T.textDisabled : (danger ? T.statusRejected : T.textSecondary),
        fontSize: 12, fontFamily: T.fontBody, lineHeight: 1,
        cursor: disabled ? 'default' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {label}
    </button>
  );
}
