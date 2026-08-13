// ─────────────────────────────────────────────────────────────────────────────
// New Packaging — the sizing behind the phone's create flow.
//
// This is the web page's own algorithm (routes/packaging.tsx), lifted out of its
// component so the phone can raise packaging runs that agree with the desk to
// the portion. It resolves, for one flight leg:
//
//   · the POOL — every QC-passed run that can reach the leg and still has
//     quantity left to give;
//   · the MEALS it can assemble — special (VGML…), pax-choice and crew meals,
//     each a 2-3 dish kit whose components are reserved out of the pools first;
//   · the LOOSE LINES — each dish's own menu-plan requirement, sized against
//     what the kits left, drawn down run by run so three runs of one dish share
//     one requirement instead of tripling it.
//
// Every number comes from the same libraries the web page uses (item-demand,
// menu-meal-sets, special-meal-sets, production-order-link, order-chain), so
// there is no second opinion about what a flight needs — only a second surface.
// Nothing here touches state: it reads stores and returns plans, and the screen
// decides what to write.
// ─────────────────────────────────────────────────────────────────────────────

import { loadMealPlanningConfig, perMealQty } from '@/lib/meal-planning-data';
import { servedOrderNosFor } from '@/lib/production-order-link';
import { itemDemandForOrder } from '@/lib/item-demand';
import { specialMealSetsForLeg } from '@/lib/special-meal-sets';
import { crewMealSetsForLeg, paxMealSetsForLeg, servicesCarrying, isCrewSet, isPaxSet } from '@/lib/menu-meal-sets';
import { resolveFlightOrder, resolveCrewOrder, resolveBatchChain, resolveReturnLeg } from '@/lib/order-chain';
import {
  allocationRuns, existingRunAllocation, existingSetAllocation, newAllocationId,
} from '@/lib/packaging-allocations';

/** System-generated packaging id, derived from the production order so it is
 *  stable across reloads (PRO-2026-1234 → PKG-2026-1234). The web's rule. */
export const packagingIdFor = (b) => `PKG-${String(b.batch).replace(/^PRO-?/i, '')}`;
/** An assembled meal has no single run to derive an id from, so it takes the
 *  primary component's, suffixed with the meal code (PKG-2026-194237-VGML). */
export const setPackagingIdFor = (primary, code) => `${packagingIdFor(primary)}-${code}`;

/** Draw `meals` worth of a dish off its runs, in order — the pick list an
 *  assembled package records as its components. */
function takeFromPicks(part, meals) {
  const out = [];
  let left = meals * part.perMeal;
  for (const p of part.picks) {
    if (left <= 0) break;
    const take = Math.min(left, p.qty);
    if (take <= 0) continue;
    out.push({ batch: p.batch, qty: take });
    left -= take;
  }
  return out;
}

/**
 * Build a planner over one snapshot of the stores.
 *
 * Cheap to construct and safe to rebuild whenever the underlying data changes —
 * every cache it keeps is scoped to the instance, exactly like the caches the
 * web page hangs off its render.
 */
export function createPackagingPlanner({
  batches = [],
  allocations = [],
  productionEntries = [],
  flightOrders = [],
  manifestRows = [],
  menuCards = loadMealPlanningConfig(),
}) {
  const peById = new Map(productionEntries.map((p) => [p.id, p]));

  // How much of each run is already committed. Components are walked, not just
  // `productionId`: an assembled meal consumes one portion of EACH of its runs,
  // and counting only the primary left the others re-offerable to the same flight.
  const allocatedByRun = new Map();
  for (const a of allocations) {
    for (const r of allocationRuns(a)) {
      allocatedByRun.set(r.productionId, (allocatedByRun.get(r.productionId) ?? 0) + r.qty);
    }
  }

  /** Unallocated portions of a run — its produced total less what flights hold. */
  const remainingOf = (b) => {
    const produced = peById.get(b.batch)?.producedQty ?? b.qty;
    return Math.max(0, produced - (allocatedByRun.get(b.batch) ?? 0));
  };

  // The pool: QC-passed runs with something left to give.
  const poolBatches = batches.filter(
    (b) => b.status !== 'Rejected' && (b.status === 'Pending Approval' || remainingOf(b) > 0),
  );

  const servedCache = new Map();
  /** The Order #s a run serves — its own stamp plus the live menu-plan rule. */
  const servedOrdersFor = (b) => {
    const pe = peById.get(b.batch);
    const date = pe?.date ?? b.date;
    const key = `${b.item}|${date}`;
    let live = servedCache.get(key);
    if (!live) {
      live = servedOrderNosFor(b.item, date, flightOrders, menuCards);
      servedCache.set(key, live);
    }
    return [...new Set([...(pe?.servesOrderNos ?? []), ...live])];
  };

  const chainForBatch = (b) => resolveBatchChain(
    { batch: b.batch, item: b.item, date: b.date, servesOrderNos: servedOrdersFor(b) },
    manifestRows,
    flightOrders,
  );

  const findFlightOrder = (leg) => resolveFlightOrder(leg, flightOrders);
  const findCrewOrder = (leg) => resolveCrewOrder(leg, flightOrders);

  /** How many flights a run feeds — >1 means its quantity is a day total. */
  const servedFlightCount = (b) => {
    const nos = new Set(servedOrdersFor(b));
    if (nos.size === 0) return 0;
    return new Set(
      flightOrders.filter((o) => nos.has(o.orderNo) && (o.orderType ?? 'flight') !== 'crew').map((o) => o.flight),
    ).size;
  };

  // ── Which runs can serve which leg ──────────────────────────────────────────
  // Keyed by flight AND date: a flight number recurs every day it flies, so
  // keying on the number alone offers one day's production to every future leg.
  const byOrderNo = new Map();
  const byFlight = new Map();
  const untaggedByDate = new Map();
  const push = (m, k, b) => {
    const list = m.get(k);
    if (list) { if (!list.includes(b)) list.push(b); } else m.set(k, [b]);
  };
  for (const b of poolBatches) {
    if (b.status !== 'Approved' && b.status !== 'Pending Approval') continue;
    const chain = chainForBatch(b);
    if (chain.flight) push(byFlight, `${chain.flight}|${chain.date ?? b.date}`, b);
    const served = servedOrdersFor(b);
    for (const no of served) push(byOrderNo, no, b);
    // A run tagged to nothing is offered on its own production date.
    if (served.length === 0 && !chain.flight) push(untaggedByDate, b.date, b);
  }

  /** Every QC-passed run that can serve this leg. */
  const poolForLeg = (leg) => {
    if (!leg) return [];
    return [...new Set([
      ...(byFlight.get(`${leg.flight}|${leg.date}`) ?? []),
      ...(leg.orderNo ? byOrderNo.get(leg.orderNo) ?? [] : []),
      ...(untaggedByDate.get(leg.date) ?? []),
    ])];
  };
  /** Can anything serve this leg at all? Skips the Set-building walk when not. */
  const legHasPool = (leg) => byFlight.has(`${leg.flight}|${leg.date}`)
    || (!!leg.orderNo && byOrderNo.has(leg.orderNo))
    || untaggedByDate.has(leg.date);

  // ── The leg as the meal resolvers need it ───────────────────────────────────
  // Departure time is the deciding field: it picks the one service the flight
  // serves. The crew-meal order's ETD is the fallback for legs without one.
  const legOrderFor = (leg) => {
    const fo = findFlightOrder(leg);
    const co = findCrewOrder(leg);
    const base = fo ?? co;
    if (!base) return undefined;
    return { ...base, etd: fo?.etd || co?.etd || '' };
  };

  const setsCache = new Map();
  /**
   * Everything this leg assembles — special, pax and crew meals in ONE list.
   * The order is a priority decision: components are reserved in this order, so
   * when a dish pool is short the SSRs are filled first (a VGML passenger has a
   * dietary requirement; a Choice 1 passenger can be moved to Choice 2).
   */
  const mealSetsFor = (leg) => {
    const k = `${leg.flight}|${leg.date}|${leg.orderNo ?? ''}`;
    let v = setsCache.get(k);
    if (!v) {
      const order = legOrderFor(leg);
      const fo = findFlightOrder(leg);
      const co = findCrewOrder(leg);
      v = [
        ...specialMealSetsForLeg(order, menuCards),
        ...paxMealSetsForLeg(order, fo?.pax ?? 0, menuCards),
        ...crewMealSetsForLeg(order, co?.crew ?? fo?.crew ?? 0, menuCards),
      ];
      setsCache.set(k, v);
    }
    return v;
  };

  const demandCache = new Map();
  /** How many portions of ITEM this flight needs. Null when no menu rule sizes
   *  it — falling back to the run's day total would load 700 portions onto a
   *  197-pax leg. */
  const demandFor = (item, leg) => {
    const k = `${item}|${leg.flight}|${leg.date}|${leg.orderNo ?? ''}`;
    if (demandCache.has(k)) return demandCache.get(k);
    const fo = findFlightOrder(leg);
    const crew = fo ? findCrewOrder(leg) : undefined;
    const d = fo
      ? itemDemandForOrder(item, { ...fo, crew: crew?.crew ?? fo.crew }, menuCards, mealSetsFor(leg))
      : null;
    const v = d && d.onMenu ? d : null;
    demandCache.set(k, v);
    return v;
  };

  const carryCache = new Map();
  /** The services that DO carry a dish — what separates "cooked for a service
   *  this leg doesn't serve" from "on no menu card at all". */
  const servicesFor = (item, leg) => {
    const k = `${item}|${leg.flight}|${leg.date}|${leg.orderNo ?? ''}`;
    let v = carryCache.get(k);
    if (!v) {
      v = servicesCarrying(item, legOrderFor(leg), menuCards);
      carryCache.set(k, v);
    }
    return v;
  };

  /**
   * Size a whole pool of runs against ONE flight.
   *
   * `reserved` (production id → portions) is what an EARLIER leg in the same
   * session has claimed but not yet written. Without it a round trip sizes both
   * legs against the same untouched remainder and promises more than exists.
   */
  const planForLeg = (pool, leg, reserved) => {
    const plan = new Map();
    // Portions of each run already spoken for INSIDE this leg. The assemblies
    // write here first; the loose lines then see only what is left, which is
    // what stops one portion being loaded as a PAX meal and eaten by a VGML.
    const claimed = new Map();
    const ordered = [...pool].sort((a, b) => String(a.batch).localeCompare(String(b.batch)));
    const freeOf = (b) => Math.max(0, remainingOf(b) - (reserved?.get(b.batch) ?? 0) - (claimed.get(b.id) ?? 0));
    const runsOf = (item) => {
      const key = String(item).trim().toLowerCase();
      return ordered.filter((b) => String(b.item).trim().toLowerCase() === key);
    };

    // ── 1. Assembled meals reserve out of their component pools ───────────────
    // Readiness is min over components of floor(available / perMeal): a meal is
    // only assemblable when EVERY component can cover it, so a kit is never
    // part-built and never blocks on the first component alone.
    const candidates = mealSetsFor(leg).map((set) => {
      const parts = (set.components ?? []).map((c) => {
        const per = perMealQty(c);
        const all = runsOf(c.name);
        const picks = all.map((b) => ({ batch: b, qty: freeOf(b) })).filter((p) => p.qty > 0);
        const available = picks.reduce((s, p) => s + p.qty, 0);
        return {
          item: c.name, perMeal: per, picks, available,
          buildable: Math.floor(available / per), runsFound: all.length,
        };
      });
      const missing = parts.filter((p) => p.picks.length === 0).map((p) => p.item);
      const qty = parts.length === 0 || missing.length > 0
        ? 0
        : Math.min(set.qty, ...parts.map((p) => p.buildable));
      const short = parts.filter((p) => p.picks.length > 0 && p.buildable < set.qty).map((p) => p.item);
      return { set, parts, qty, missing, short };
    });
    // One line per code — whichever service production actually covers. A code
    // no service can cover keeps a line, blocked, so the gap stays visible.
    const chosen = new Map();
    for (const l of candidates) {
      const cur = chosen.get(l.set.code);
      if (!cur || l.qty > cur.qty || (l.qty === cur.qty && l.missing.length < cur.missing.length)) {
        chosen.set(l.set.code, l);
      }
    }
    const setLines = [...chosen.values()];
    for (const l of setLines) {
      if (l.qty <= 0) continue;
      for (const p of l.parts) {
        let left = l.qty * p.perMeal;
        for (const pick of p.picks) {
          if (left <= 0) break;
          const take = Math.min(left, pick.qty);
          claimed.set(pick.batch.id, (claimed.get(pick.batch.id) ?? 0) + take);
          left -= take;
        }
      }
    }

    // ── 2. The dishes' own lines take what the kits left ──────────────────────
    // The requirement belongs to the ITEM, not the run: when three runs each
    // cooked Fruit Custard today, the flight still needs 197 between them.
    const need = new Map();
    const filledBy = new Map();
    for (const b of ordered) {
      const demand = demandFor(b.item, leg);
      if (demand == null) {
        const offService = servicesFor(b.item, leg);
        plan.set(b.id, offService.length > 0
          ? { qty: 0, reason: 'offservice', offService }
          : { qty: 0, reason: 'unsized' });
        continue;
      }
      const key = String(b.item).trim().toLowerCase();
      if (!need.has(key)) need.set(key, demand.direct);
      const left = need.get(key) ?? 0;
      const take = Math.max(0, Math.min(left, freeOf(b)));
      need.set(key, left - take);
      if (take > 0) {
        claimed.set(b.id, (claimed.get(b.id) ?? 0) + take);
        if (!filledBy.has(key)) filledBy.set(key, b.batch);
      }
      plan.set(b.id, {
        qty: take,
        reason: take > 0 ? undefined
          : demand.direct <= 0 && demand.special > 0 ? 'reserved'
          : left <= 0 ? 'covered'
          : 'exhausted',
        coveredBy: take > 0 ? undefined : filledBy.get(key),
        required: demand.direct,
        demand,
      });
    }
    return { plan, sets: setLines, claimed };
  };

  /**
   * Size a list of legs IN ORDER with a running reservation, so the outbound
   * takes its share first and the return is sized against what is genuinely
   * left of each run. Returns leg key → { pool, plan, sets }.
   */
  const planLegs = (legs) => {
    const reserved = new Map();
    const out = new Map();
    for (const leg of legs) {
      const pool = poolForLeg(leg);
      const { plan, sets, claimed } = planForLeg(pool, leg, reserved);
      for (const b of pool) {
        const take = claimed.get(b.id) ?? 0;
        if (take > 0) reserved.set(b.batch, (reserved.get(b.batch) ?? 0) + take);
      }
      out.set(leg.key, { pool, plan, sets });
    }
    return out;
  };

  /** The meals a leg can actually offer: a code planned by a service the kitchen
   *  didn't cook drops out once ANOTHER service of the same code has production;
   *  a code with no production anywhere stays, blocked, because "the order asked
   *  for 8 VGML and the kitchen cooked none" is the answer the packer needs. */
  const usableSetLines = (lines) => {
    const produced = new Set(
      lines.filter((l) => l.parts.some((p) => p.picks.length > 0)).map((l) => l.set.code),
    );
    return lines.filter((l) => l.parts.some((p) => p.picks.length > 0) || !produced.has(l.set.code));
  };

  /** The paired return leg from the order book — a round trip is one catering
   *  job, built and loaded on the same shift off the same runs. */
  const returnLegFor = (leg) => {
    const fo = findFlightOrder(leg);
    if (!fo) return null;
    const paired = resolveReturnLeg(fo, flightOrders);
    if (!paired) return null;
    const o = paired.order;
    return {
      via: paired.via,
      leg: {
        key: `${o.flight}|${o.date}`,
        flight: o.flight, date: o.date, orderNo: o.orderNo,
        sector: o.sector, etd: o.etd, airline: o.airline,
      },
    };
  };

  /** The flight legs the picker offers, each sized by its OWN load — the pool is
   *  shared across a whole order, so pool size tells you nothing about the leg
   *  you are about to pick; the menu-plan sizing does. */
  const legOptions = () => {
    const map = new Map();
    for (const o of flightOrders) {
      if ((o.orderType ?? 'flight') === 'crew') continue;
      const key = `${o.flight}|${o.date}`;
      if (map.has(key)) continue;
      map.set(key, {
        key, flight: o.flight, date: o.date, orderNo: o.orderNo,
        sector: o.sector, etd: o.etd, airline: o.airline,
      });
    }
    const out = [];
    for (const o of map.values()) {
      if (!legHasPool(o)) { out.push({ ...o, lines: 0, portions: 0, meals: 0, runs: 0 }); continue; }
      const pool = poolForLeg(o);
      const { plan, sets } = planForLeg(pool, o);
      let lines = 0, portions = 0;
      for (const b of pool) {
        const q = plan.get(b.id)?.qty ?? 0;
        if (q > 0) { lines++; portions += q; }
      }
      const buildable = usableSetLines(sets).filter((s) => s.qty > 0);
      out.push({
        ...o,
        runs: pool.length,
        lines: lines + buildable.length,
        portions,
        meals: buildable.reduce((s, l) => s + l.qty, 0),
      });
    }
    // Flights with something to package lead; the rest of the order book follows
    // newest-first so a search always has the current schedule near the top.
    return out.sort((a, b) => {
      if ((a.portions > 0) !== (b.portions > 0)) return a.portions > 0 ? -1 : 1;
      if ((a.runs > 0) !== (b.runs > 0)) return a.runs > 0 ? -1 : 1;
      if (a.date !== b.date) return String(b.date).localeCompare(String(a.date));
      return String(a.flight).localeCompare(String(b.flight));
    });
  };

  /**
   * Turn ticked lines into allocations — the web's `allocateToFlights`, without
   * the state plumbing. Returns the NEW allocation list; the caller persists it.
   *
   * A run is not consumed by packaging: it keeps whatever is left for the other
   * flights it serves. Re-packaging the same run for the same flight tops up the
   * existing allocation instead of duplicating it, and topping up re-opens the
   * approval, because the quantity signed off is no longer the quantity packaged.
   */
  const buildAllocations = (jobs, { now, by }) => {
    const next = [...allocations];
    for (const { leg, lines = [], sets = [] } of jobs) {
      // ── Assembled meals ─────────────────────────────────────────────────────
      // The meal is the finished good: it takes the packaging id, the label and
      // the lifecycle; the runs behind it are recorded on `components` so every
      // dish stays traceable to its batch.
      for (const l of sets) {
        if (l.qty <= 0 || l.parts.length === 0) continue;
        const components = l.parts.flatMap((p) => takeFromPicks(p, l.qty).map((t) => ({
          productionId: t.batch.batch,
          batchId: t.batch.id,
          item: t.batch.item,
          qty: t.qty,
        })));
        if (components.length === 0) continue;
        const primary = l.parts[0].picks[0]?.batch;
        if (!primary) continue;
        const already = existingSetAllocation(next, l.set.code, leg.flight, leg.date);
        if (already) {
          const i = next.indexOf(already);
          const merged = new Map(allocationRuns(already).map((r) => [r.productionId, { ...r }]));
          for (const c of components) {
            const hit = merged.get(c.productionId);
            if (hit) hit.qty += c.qty; else merged.set(c.productionId, c);
          }
          next[i] = {
            ...already,
            qty: already.qty + l.qty,
            components: [...merged.values()],
            status: 'Pending Approval',
            approvedBy: undefined, approvedAt: undefined, rejectedReason: undefined,
            createdAt: now,
          };
          continue;
        }
        next.unshift({
          id: newAllocationId(),
          packagingId: setPackagingIdFor(primary, l.set.code),
          batchId: primary.id,
          productionId: primary.batch,
          item: l.set.name,
          setCode: l.set.code,
          components,
          flight: leg.flight,
          orderNo: leg.orderNo,
          date: leg.date,
          depTime: leg.etd,
          qty: l.qty,
          status: 'Pending Approval',
          createdAt: now,
          createdBy: by,
        });
      }
      for (const { batch, qty } of lines) {
        const already = existingRunAllocation(next, batch.batch, leg.flight, leg.date);
        // A run already committed through a MEAL is spoken for — topping it up
        // as a loose package would double-count the same portions.
        if (already?.setCode) continue;
        if (already) {
          const i = next.indexOf(already);
          next[i] = {
            ...already,
            qty: already.qty + qty,
            status: 'Pending Approval',
            approvedBy: undefined, approvedAt: undefined, rejectedReason: undefined,
            createdAt: now,
          };
          continue;
        }
        next.unshift({
          id: newAllocationId(),
          packagingId: packagingIdFor(batch),
          batchId: batch.id,
          productionId: batch.batch,
          item: batch.item,
          flight: leg.flight,
          orderNo: leg.orderNo,
          date: leg.date,
          depTime: leg.etd,
          qty,
          // A new run is NOT live yet. Labels, dispatch and everything after wait
          // on packaging sign-off, granted in Approval Management.
          status: 'Pending Approval',
          createdAt: now,
          createdBy: by,
        });
      }
    }
    return next;
  };

  return {
    remainingOf, poolForLeg, planForLeg, planLegs, usableSetLines,
    mealSetsFor, legOptions, returnLegFor, buildAllocations,
    findFlightOrder, findCrewOrder, servedFlightCount, isCrewSet, isPaxSet,
  };
}
