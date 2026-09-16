/**
 * Dragging blocks around the page, injected into the editor's preview frame.
 *
 * Like the editing engine, this has to live *inside* the frame: the preview is
 * sandboxed, so the app can't reach its DOM to find out where anything is or to
 * draw a line between two blocks.
 *
 * Two things happen here:
 *  - dragging a block by its handle, which the frame drives from start to end;
 *  - a block type dragged in from the palette, where the *app* holds the pointer
 *    and this side only draws the line where it's told.
 *
 * Written as plain ES5-ish JavaScript with no template literals, so it can sit
 * inside the template literal that builds the document.
 */
export function blockDragScript(): string {
  return `<script>
(function () {
  // Pointer events rather than HTML5 drag-and-drop, for two reasons: dragstart
  // never fires on a touchscreen, and a sandboxed frame can't reliably read a
  // dataTransfer set by the parent document.
  var HANDLE = "sb-handle";

  function blocks() {
    return Array.prototype.slice.call(document.querySelectorAll("[data-block-id]"));
  }

  function indexOfId(id) {
    var list = blocks();
    for (var i = 0; i < list.length; i++) {
      if (list[i].getAttribute("data-block-id") === id) return i;
    }
    return -1;
  }

  // ---- the handle you grab ----

  /**
   * A handle, rather than dragging the block itself: the text inside a block is
   * editable, so dragging from anywhere would turn "select a word" into "move
   * the block".
   */
  function addHandles() {
    blocks().forEach(function (el) {
      if (el.querySelector(":scope > ." + HANDLE)) return;
      var handle = document.createElement("div");
      handle.className = HANDLE;
      handle.setAttribute("data-handle", el.getAttribute("data-block-id"));
      handle.setAttribute("aria-hidden", "true");
      handle.textContent = "⠿";
      el.appendChild(handle);
    });
  }
  addHandles();

  // ---- the line showing where it will land ----

  var line = document.createElement("div");
  line.className = "sb-dropline";
  line.hidden = true;
  document.body.appendChild(line);

  /** Where slot N sits: above block N, or below the last one. */
  function slotPosition(index) {
    var list = blocks();
    if (!list.length) {
      var page = document.querySelector("main") || document.body;
      var pr = page.getBoundingClientRect();
      return { top: pr.top + 8, left: pr.left + 24, width: Math.max(0, pr.width - 48) };
    }
    var at = Math.max(0, Math.min(index, list.length));
    if (at >= list.length) {
      var last = list[list.length - 1].getBoundingClientRect();
      return { top: last.bottom, left: last.left, width: last.width };
    }
    var r = list[at].getBoundingClientRect();
    return { top: r.top, left: r.left, width: r.width };
  }

  function showLine(index) {
    if (index === null || index === undefined) {
      line.hidden = true;
      return;
    }
    var at = slotPosition(index);
    line.hidden = false;
    // The line is positioned against the document, so the page's own scroll has
    // to be added to these viewport-relative numbers.
    line.style.top = at.top + window.scrollY + "px";
    line.style.left = at.left + window.scrollX + "px";
    line.style.width = at.width + "px";
  }

  /** The gap a pointer at this height is hovering over. */
  function slotAtY(y) {
    var list = blocks();
    for (var i = 0; i < list.length; i++) {
      var r = list[i].getBoundingClientRect();
      if (y < r.top + r.height / 2) return i;
    }
    return list.length;
  }

  // ---- dragging a block that's already on the page ----

  var drag = null;

  document.addEventListener("pointerdown", function (e) {
    var handle = e.target.closest ? e.target.closest("[data-handle]") : null;
    if (!handle || e.button !== 0) return;
    // Stops the press turning into a text selection or a caret.
    e.preventDefault();

    var id = handle.getAttribute("data-handle");
    var from = indexOfId(id);
    if (from === -1) return;

    // Said before letting go of the text below, because that blur can release a
    // rebuild the app was holding back — and rebuilding now would replace the
    // very handle this drag is holding on to.
    parent.postMessage({ type: "sb:dragging", active: true }, "*");

    // The app defers rebuilding the document while a field has the caret, so a
    // move made mid-sentence would appear to do nothing. Let go of the text
    // first: that tells the app typing has stopped.
    var focused = document.activeElement;
    if (focused && focused.closest && focused.closest("[data-edit]")) focused.blur();

    drag = { id: id, from: from, slot: from, el: blocks()[from] };
    drag.el.setAttribute("data-dragging", "true");
    handle.setPointerCapture(e.pointerId);
    showLine(from);
  });

  document.addEventListener("pointermove", function (e) {
    if (!drag) return;
    drag.slot = slotAtY(e.clientY);
    showLine(drag.slot);

    // Nudge the page along when the pointer is held near an edge, so a block can
    // be taken somewhere that isn't currently on screen.
    var margin = 60;
    if (e.clientY < margin) window.scrollBy(0, -12);
    else if (e.clientY > window.innerHeight - margin) window.scrollBy(0, 12);
  });

  function endDrag(commit) {
    if (!drag) return;
    var finished = drag;
    drag = null;
    finished.el.removeAttribute("data-dragging");
    showLine(null);
    // The move goes first and the all-clear second, so the app can hold the
    // rebuild until the drag is properly over and then do it once, with the
    // blocks already in their new order.
    if (commit && finished.slot !== finished.from && finished.slot !== finished.from + 1) {
      parent.postMessage({ type: "sb:move", id: finished.id, slot: finished.slot }, "*");
    }
    parent.postMessage({ type: "sb:dragging", active: false }, "*");
  }

  document.addEventListener("pointerup", function () { endDrag(true); });
  document.addEventListener("pointercancel", function () { endDrag(false); });
  document.addEventListener("keydown", function (e) {
    // Second thoughts mid-drag.
    if (e.key === "Escape" && drag) endDrag(false);
  });

  // ---- a block type being dragged in from the palette ----

  /** Where every block currently sits, in this frame's own coordinates. */
  function sendGeometry() {
    parent.postMessage({
      type: "sb:blocks",
      blocks: blocks().map(function (el) {
        var r = el.getBoundingClientRect();
        return { id: el.getAttribute("data-block-id"), top: r.top, bottom: r.bottom };
      })
    }, "*");
  }

  window.addEventListener("message", function (e) {
    var data = e.data;
    if (!data || data.type !== "sb:cmd") return;

    // The app captured the pointer when the drag began, so it — not this frame —
    // sees the movement. It needs to know where the blocks are to work out which
    // gap the pointer is over.
    if (data.cmd === "dragProbe") {
      sendGeometry();
      return;
    }

    // The app holds the pointer during a palette drag, so this frame never sees
    // the movement and can't scroll itself. Without this you could only drop a
    // block somewhere already on screen.
    if (data.cmd === "scrollBy") {
      window.scrollBy(0, data.by);
      sendGeometry();
      return;
    }

    if (data.cmd === "dropLine") {
      showLine(data.index === null || data.index === undefined ? null : data.index);
      return;
    }
  });
})();
</script>
`;
}
