/**
 * Dragging a button around the page: where it sits, how big it is, how round
 * its corners are.
 *
 * Like the other two engines this lives *inside* the preview frame, because the
 * frame is sandboxed and the app can't reach its DOM to measure anything. The
 * app is told what changed by postMessage and owns the actual values; this side
 * only moves pixels while the pointer is down, so the drag feels immediate
 * instead of waiting for a round trip.
 *
 * Written as plain ES5-ish JavaScript with no template literals, so it can sit
 * inside the template literal that builds the document.
 */
export function boxHandlesScript(): string {
  return `<script>
(function () {
  // How close a drag has to get before it lines itself up with something.
  var SNAP = 7;

  var box = document.createElement("div");
  box.className = "sb-box";
  box.hidden = true;

  [
    ["move", "Move the button"],
    ["radius", "Round the corners"],
    ["width", "Change the width"],
    ["size", "Change the width and height"]
  ].forEach(function (spec) {
    var handle = document.createElement("div");
    handle.className = "sb-bh sb-bh--" + spec[0];
    handle.setAttribute("data-bh", spec[0]);
    // An aria-label rather than a title: a native tooltip is the one bit of
    // browser UI this app has never allowed itself.
    handle.setAttribute("aria-label", spec[1]);
    handle.setAttribute("role", "button");
    box.appendChild(handle);
  });

  document.body.appendChild(box);

  /** The button of the selected block, if that block has one. */
  function target() {
    var selected = document.querySelector('[data-block-id][data-selected="true"]');
    return selected ? selected.querySelector("a.btn[data-box]") : null;
  }

  function blockIdOf(el) {
    var host = el.closest("[data-block-id]");
    return host ? host.getAttribute("data-block-id") : null;
  }

  function num(value) {
    var n = parseFloat(value);
    return isFinite(n) ? n : 0;
  }

  /** Where the outline goes. Document coordinates, so it survives scrolling. */
  function place() {
    var button = target();
    if (!button) {
      box.hidden = true;
      return;
    }
    var rect = button.getBoundingClientRect();
    box.hidden = false;
    box.style.left = rect.left + window.scrollX + "px";
    box.style.top = rect.top + window.scrollY + "px";
    box.style.width = rect.width + "px";
    box.style.height = rect.height + "px";
  }

  // ---- dragging ----

  var drag = null;

  function startValues(button) {
    var rect = button.getBoundingClientRect();
    return {
      x: num(button.style.getPropertyValue("--bx")),
      y: num(button.style.getPropertyValue("--by")),
      w: num(button.style.width) || rect.width,
      h: num(button.style.height) || rect.height,
      // Starting from what it actually looks like, so grabbing the corner of a
      // themed button carries on from that roundness rather than jumping to 0.
      r: num(getComputedStyle(button).borderTopLeftRadius)
    };
  }

  /**
   * Line the button up with its column when the drag comes close.
   *
   * Without this, "centred" is a pixel you can never quite hit by hand, and a
   * button nudged back towards where it started never quite gets there.
   */
  function snapX(x, base, width) {
    var host = drag.button.parentElement.getBoundingClientRect();
    var candidates = [
      0,
      host.left - base,
      host.left + (host.width - width) / 2 - base,
      host.right - width - base
    ];
    for (var i = 0; i < candidates.length; i++) {
      if (Math.abs(x - candidates[i]) <= SNAP) return Math.round(candidates[i]);
    }
    return Math.round(x);
  }

  function paint(values) {
    var button = drag.button;
    if (values.x !== undefined) button.style.setProperty("--bx", values.x + "px");
    if (values.y !== undefined) button.style.setProperty("--by", values.y + "px");
    if (values.w !== undefined) {
      button.style.width = values.w + "px";
      button.style.textAlign = "center";
    }
    if (values.h !== undefined) {
      button.style.height = values.h + "px";
      button.style.display = "inline-flex";
      button.style.alignItems = "center";
      button.style.justifyContent = "center";
    }
    if (values.r !== undefined) button.style.borderRadius = values.r + "px";
    place();
    parent.postMessage(
      { type: "sb:box", block: drag.id, prefix: drag.prefix, patch: values },
      "*"
    );
  }

  box.addEventListener("pointerdown", function (e) {
    var handle = e.target.closest("[data-bh]");
    if (!handle) return;
    var button = target();
    if (!button) return;
    e.preventDefault();
    var rect = button.getBoundingClientRect();
    var start = startValues(button);
    drag = {
      kind: handle.getAttribute("data-bh"),
      button: button,
      id: blockIdOf(button),
      prefix: button.getAttribute("data-box") || "",
      sx: e.clientX,
      sy: e.clientY,
      start: start,
      // Where it would sit with no nudge at all, which is what snapping is
      // measured against.
      baseLeft: rect.left - start.x
    };
    // Capture keeps the drag alive when the pointer outruns the handle. It can
    // refuse — a pointer already released, or a synthetic one — and that's no
    // reason to abandon the drag.
    try {
      handle.setPointerCapture(e.pointerId);
    } catch (err) {}
    // Tell the app a drag is on, so it holds off replacing the document —
    // that would take away the very handle the pointer is holding.
    parent.postMessage({ type: "sb:dragging", active: true }, "*");
  });

  box.addEventListener("pointermove", function (e) {
    if (!drag) return;
    var dx = e.clientX - drag.sx;
    var dy = e.clientY - drag.sy;
    var start = drag.start;

    if (drag.kind === "move") {
      var y = Math.abs(start.y + dy) <= SNAP ? 0 : Math.round(start.y + dy);
      paint({ x: snapX(start.x + dx, drag.baseLeft, start.w), y: y });
    } else if (drag.kind === "width") {
      paint({ w: Math.max(40, Math.round(start.w + dx)) });
    } else if (drag.kind === "size") {
      paint({ w: Math.max(40, Math.round(start.w + dx)), h: Math.max(24, Math.round(start.h + dy)) });
    } else if (drag.kind === "radius") {
      // Pulled in towards the middle of the button, the way a corner rounds off.
      paint({ r: Math.max(0, Math.round(start.r + (dy - dx) / 2)) });
    }
  });

  function endDrag(e) {
    if (!drag) return;
    drag = null;
    parent.postMessage({ type: "sb:dragging", active: false }, "*");
    if (e) place();
  }

  box.addEventListener("pointerup", endDrag);
  box.addEventListener("pointercancel", endDrag);

  // ---- nudging with the keyboard ----

  document.addEventListener("keydown", function (e) {
    if (e.key.indexOf("Arrow") !== 0) return;
    // Typing in the page moves the caret, not the button.
    var active = document.activeElement;
    if (active && active.closest && active.closest("[data-edit]")) return;
    var button = target();
    if (!button) return;
    var step = e.shiftKey ? 10 : 1;
    var x = num(button.style.getPropertyValue("--bx"));
    var y = num(button.style.getPropertyValue("--by"));
    if (e.key === "ArrowLeft") x -= step;
    else if (e.key === "ArrowRight") x += step;
    else if (e.key === "ArrowUp") y -= step;
    else if (e.key === "ArrowDown") y += step;
    else return;
    e.preventDefault();
    button.style.setProperty("--bx", x + "px");
    button.style.setProperty("--by", y + "px");
    place();
    parent.postMessage(
      {
        type: "sb:box",
        block: blockIdOf(button),
        prefix: button.getAttribute("data-box") || "",
        patch: { x: x, y: y }
      },
      "*"
    );
  });

  window.addEventListener("message", function (e) {
    // The outline follows whichever block the app says is selected.
    if (e.data && e.data.type === "sb:cmd" && e.data.cmd === "select") setTimeout(place, 0);
  });
  window.addEventListener("scroll", place, true);
  window.addEventListener("resize", place);
  // Which block is selected is set by a script further down the document, so
  // the first measurement waits for the parser to get there.
  setTimeout(place, 0);
  window.addEventListener("load", place);
})();
</script>
`;
}
