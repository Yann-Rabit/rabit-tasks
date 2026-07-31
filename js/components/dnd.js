/* ============================================================
   Drag and drop — pointer, with a real keyboard equivalent.
   ============================================================
   Native HTML5 drag is not used: it cannot show a proper
   insertion line, its drag image is unstyleable, and it does not
   work on touch. This is a pointer-events implementation with a
   3px activation threshold so a click is never swallowed.

   Accessibility: dragging is never the only way to move a task.
   Every draggable exposes the same move through its context menu
   and through keyboard shortcuts, and the list announces the
   result. `aria-grabbed` is deliberately not used — it is
   deprecated and unsupported.
   ============================================================ */

const THRESHOLD = 3;

/**
 * @param {object} cfg
 * @param {HTMLElement} cfg.root       Container to listen on
 * @param {string} cfg.itemSelector    Draggable elements
 * @param {string} cfg.zoneSelector    Drop zones (a list body / column body)
 * @param {(el:HTMLElement)=>string} cfg.idOf
 * @param {(zone:HTMLElement)=>string} cfg.zoneKey
 * @param {(r:{id:string, zone:string, beforeId:string|null})=>void} cfg.onDrop
 * @param {HTMLElement} [cfg.scroller]  Scroll container for edge auto-scroll
 */
export function makeDraggable(cfg) {
  const { root, itemSelector, zoneSelector, idOf, zoneKey, onDrop } = cfg;

  let drag = null;
  let scrollRaf = null;

  /**
   * Edge auto-scroll: dragging toward the top or bottom of the nearest
   * scroll container scrolls it, so a task can travel from the first
   * group to the last without the drop dying at the fold.
   */
  function autoScroll(e) {
    cancelAnimationFrame(scrollRaf);
    const scroller = cfg.scroller ?? root.closest('.scroll') ?? root;
    const r = scroller.getBoundingClientRect();
    const EDGE = 56;
    let dy = 0;
    if (e.clientY < r.top + EDGE) dy = -Math.ceil((r.top + EDGE - e.clientY) / 4);
    else if (e.clientY > r.bottom - EDGE) dy = Math.ceil((e.clientY - (r.bottom - EDGE)) / 4);

    let dx = 0;
    if (e.clientX < r.left + EDGE) dx = -Math.ceil((r.left + EDGE - e.clientX) / 4);
    else if (e.clientX > r.right - EDGE) dx = Math.ceil((e.clientX - (r.right - EDGE)) / 4);

    if (dy || dx) {
      const step = () => {
        scroller.scrollTop += dy;
        scroller.scrollLeft += dx;
        scrollRaf = requestAnimationFrame(step);
      };
      scrollRaf = requestAnimationFrame(step);
    }
  }

  root.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    // Never start a drag from an interactive control inside the item.
    if (e.target.closest('button, a, input, select, textarea, [data-nodrag]')) return;

    const item = e.target.closest(itemSelector);
    if (!item || !root.contains(item)) return;

    drag = {
      item, id: idOf(item),
      startX: e.clientX, startY: e.clientY,
      active: false, ghost: null, marker: null, pointerId: e.pointerId,
      lastZone: null, beforeId: null,
    };
  });

  window.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;

    if (!drag.active) {
      if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < THRESHOLD) return;
      begin(e);
    }

    drag.ghost.style.transform =
      `translate(${e.clientX - drag.offX}px, ${e.clientY - drag.offY}px)`;
    autoScroll(e);

    // Which zone is under the pointer?
    drag.ghost.style.pointerEvents = 'none';
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const zone = under?.closest(zoneSelector);
    if (!zone) return;

    if (drag.lastZone && drag.lastZone !== zone) drag.lastZone.classList.remove('is-over');
    zone.classList.add('is-over');
    drag.lastZone = zone;

    // Insertion point: the first sibling whose midpoint is below the pointer.
    const sibs = [...zone.querySelectorAll(itemSelector)].filter((n) => n !== drag.item);
    let before = null;
    for (const s of sibs) {
      const b = s.getBoundingClientRect();
      if (e.clientY < b.top + b.height / 2) { before = s; break; }
    }
    drag.beforeId = before ? idOf(before) : null;

    if (before) zone.insertBefore(drag.marker, before);
    else zone.appendChild(drag.marker);
  });

  const end = (e) => {
    if (!drag || (e && e.pointerId !== drag.pointerId)) return;
    const d = drag;
    drag = null;
    cancelAnimationFrame(scrollRaf);

    if (!d.active) return;

    d.ghost.remove();
    d.marker.remove();
    d.lastZone?.classList.remove('is-over');
    d.item.classList.remove('is-dragging');
    document.body.style.userSelect = '';

    if (d.lastZone) {
      onDrop({ id: d.id, zone: zoneKey(d.lastZone), beforeId: d.beforeId });
    }
  };

  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);

  function begin(e) {
    drag.active = true;
    const r = drag.item.getBoundingClientRect();
    drag.offX = drag.startX - r.left;
    drag.offY = drag.startY - r.top;

    const ghost = drag.item.cloneNode(true);
    ghost.classList.add('is-ghost');
    Object.assign(ghost.style, {
      position: 'fixed', left: '0', top: '0', width: `${r.width}px`,
      zIndex: '100', pointerEvents: 'none', margin: '0',
    });
    ghost.style.transform = `translate(${e.clientX - drag.offX}px, ${e.clientY - drag.offY}px)`;
    document.body.appendChild(ghost);
    drag.ghost = ghost;

    const marker = document.createElement('div');
    marker.className = 'card-insert';
    drag.marker = marker;

    drag.item.classList.add('is-dragging');
    document.body.style.userSelect = 'none';
  }

  return { cancel: () => end() };
}
