import { FONT_STACKS } from "./blocks";

/**
 * The editing engine, injected into the editor's preview frame.
 *
 * It has to live *inside* the frame: the preview is sandboxed, so the app can't
 * reach its DOM, its selection, or its caret. The app sends commands down and
 * gets edits and selection state back, both by postMessage.
 *
 * Written as a plain string of ES5-ish JavaScript with no template literals, so
 * it can sit inside the template literal that builds the document.
 */
export function inlineEditorScript(): string {
  return `<script>
(function () {
  var STACKS = ${JSON.stringify(FONT_STACKS)};

  Array.prototype.forEach.call(document.querySelectorAll("[data-edit]"), function (el) {
    el.setAttribute("contenteditable", "true");
    el.setAttribute("spellcheck", "true");
  });

  function fieldOf(node) {
    if (!node) return null;
    var el = node.nodeType === 3 ? node.parentElement : node;
    return el && el.closest ? el.closest("[data-edit]") : null;
  }

  function isPlain(field) {
    return field.getAttribute("data-edit-kind") === "plain";
  }

  function report(field) {
    var block = field.closest("[data-block-id]");
    parent.postMessage({
      type: "sb:edit",
      block: block ? block.getAttribute("data-block-id") : null,
      path: field.getAttribute("data-edit"),
      kind: isPlain(field) ? "plain" : "rich",
      value: isPlain(field) ? field.textContent : field.innerHTML
    }, "*");
  }

  // The app needs to know when someone is typing in here, so it never replaces
  // this document mid-word.
  document.addEventListener("focusin", function (e) {
    if (fieldOf(e.target)) parent.postMessage({ type: "sb:editing", active: true }, "*");
  });
  document.addEventListener("focusout", function (e) {
    if (fieldOf(e.target)) parent.postMessage({ type: "sb:editing", active: false }, "*");
  });

  document.addEventListener("input", function (e) {
    var field = fieldOf(e.target);
    if (field) report(field);
  });

  document.addEventListener("keydown", function (e) {
    var field = fieldOf(e.target);
    if (!field) return;
    // One-line fields stay one line.
    if (isPlain(field) && e.key === "Enter") e.preventDefault();
    if (e.key === "Escape") field.blur();
  });

  document.addEventListener("paste", function (e) {
    var field = fieldOf(e.target);
    if (!field) return;
    // Paste the words, not the source site's markup.
    e.preventDefault();
    var text = (e.clipboardData || window.clipboardData).getData("text/plain");
    document.execCommand("insertText", false, text);
  });

  // ---- what the caret is sitting in ----

  function fontKeyFor(family) {
    var normalise = function (v) {
      return v.replace(/["']/g, "").replace(/\\s+/g, " ").trim().toLowerCase();
    };
    var target = normalise(family);
    if (!target || target === "inherit") return "";
    var keys = Object.keys(STACKS);
    for (var i = 0; i < keys.length; i++) {
      if (normalise(STACKS[keys[i]]) === target) return keys[i];
    }
    for (var j = 0; j < keys.length; j++) {
      if (normalise(STACKS[keys[j]]).split(",")[0] === target.split(",")[0]) return keys[j];
    }
    return "";
  }

  function readFormatting(field, node) {
    var font = "";
    var size = "0";
    var fontFound = false;
    var sizeFound = false;
    var walk = node && node.nodeType === 3 ? node.parentElement : node;
    while (walk && walk !== field) {
      if (!fontFound && walk.style && walk.style.fontFamily) {
        fontFound = true;
        font = fontKeyFor(walk.style.fontFamily);
      }
      if (!sizeFound && walk.style && walk.style.fontSize) {
        sizeFound = true;
        var px = parseFloat(walk.style.fontSize);
        size = isFinite(px) ? String(Math.round(px)) : "0";
      }
      walk = walk.parentElement;
    }
    return { font: font, size: size };
  }

  function sendSelection() {
    var selection = document.getSelection();
    var field = selection && selection.rangeCount ? fieldOf(selection.focusNode) : null;
    if (!field) {
      parent.postMessage({ type: "sb:sel", active: false }, "*");
      return;
    }
    var range = selection.getRangeAt(0);
    var rect = range.getBoundingClientRect();
    if (!rect.width && !rect.height) rect = field.getBoundingClientRect();
    var format = readFormatting(field, selection.focusNode);
    parent.postMessage({
      type: "sb:sel",
      active: true,
      rich: !isPlain(field),
      collapsed: selection.isCollapsed,
      rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
      font: format.font,
      size: format.size
    }, "*");
  }

  document.addEventListener("selectionchange", sendSelection);
  document.addEventListener("scroll", sendSelection, true);

  // ---- styling the selection ----

  function stripOrUnwrap(span, property) {
    span.style.removeProperty(property);
    if (!span.getAttribute("style")) {
      var parentNode = span.parentNode;
      while (span.firstChild) parentNode.insertBefore(span.firstChild, span);
      parentNode.removeChild(span);
    }
  }

  function nearestStyled(range, root, property) {
    var node = range.commonAncestorContainer;
    var walk = node.nodeType === 3 ? node.parentElement : node;
    while (walk && walk !== root) {
      if (walk.style && walk.style.getPropertyValue(property)) return walk;
      walk = walk.parentElement;
    }
    return null;
  }

  // Grow the range to swallow any span it already covers completely. Compare
  // the text, not boundary points: (span, 0) and (textNode, 0) are the same
  // position but never compare equal.
  function expandToWholeSpans(range, root) {
    for (;;) {
      var node = range.commonAncestorContainer;
      var parentEl = node.nodeType === 3 ? node.parentElement : node;
      if (!parentEl || parentEl === root || parentEl.tagName !== "SPAN") return;
      if (range.toString() !== (parentEl.textContent || "")) return;
      range.selectNode(parentEl);
    }
  }

  // Cut a span into up to three, so it ends up wrapping exactly the selection.
  // The part after the selection goes first: taking the part before would move
  // the nodes the range's end still points at.
  function splitAround(styled, range) {
    var afterRange = document.createRange();
    afterRange.selectNodeContents(styled);
    afterRange.setStart(range.endContainer, range.endOffset);
    var afterFragment = afterRange.extractContents();

    var beforeRange = document.createRange();
    beforeRange.selectNodeContents(styled);
    beforeRange.setEnd(range.startContainer, range.startOffset);
    var beforeFragment = beforeRange.extractContents();

    var host = styled.parentNode;
    if (!host) return;
    if (beforeFragment.textContent) {
      var before = styled.cloneNode(false);
      before.appendChild(beforeFragment);
      host.insertBefore(before, styled);
    }
    if (afterFragment.textContent) {
      var after = styled.cloneNode(false);
      after.appendChild(afterFragment);
      host.insertBefore(after, styled.nextSibling);
    }
  }

  function liveRange(field) {
    var selection = document.getSelection();
    if (!selection || !selection.rangeCount || selection.isCollapsed) return null;
    var range = selection.getRangeAt(0);
    return field.contains(range.commonAncestorContainer) ? range : null;
  }

  function reselect(range) {
    var selection = document.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function wrapStyle(field, style) {
    var range = liveRange(field);
    if (!range) return;
    var span = document.createElement("span");
    for (var key in style) span.style[key] = style[key];
    span.appendChild(range.extractContents());
    range.insertNode(span);
    var after = document.createRange();
    after.selectNodeContents(span);
    reselect(after);
  }

  function clearStyle(field, property) {
    var range = liveRange(field);
    if (!range) return;
    expandToWholeSpans(range, field);

    var holder = document.createElement("div");
    holder.appendChild(range.extractContents());
    Array.prototype.forEach.call(holder.querySelectorAll("span"), function (span) {
      stripOrUnwrap(span, property);
    });
    var fragment = document.createDocumentFragment();
    while (holder.firstChild) fragment.appendChild(holder.firstChild);
    var first = fragment.firstChild;
    var last = fragment.lastChild;
    range.insertNode(fragment);
    if (first && last) {
      range.setStartBefore(first);
      range.setEndAfter(last);
    }

    var styled = nearestStyled(range, field, property);
    if (styled) {
      splitAround(styled, range);
      Array.prototype.forEach.call(styled.querySelectorAll("span"), function (span) {
        stripOrUnwrap(span, property);
      });
      var contents = document.createRange();
      contents.selectNodeContents(styled);
      stripOrUnwrap(styled, property);
      reselect(contents);
      return;
    }
    reselect(range);
  }

  // ---- commands from the app ----

  window.addEventListener("message", function (e) {
    var data = e.data;
    if (!data || data.type !== "sb:cmd") return;

    // A rich field edited in the side panel: update that one element, rather
    // than rebuilding the document around whatever else is going on.
    if (data.cmd === "setField") {
      var host = document.querySelector('[data-block-id="' + CSS.escape(data.block) + '"]');
      var target = host && host.querySelector('[data-edit="' + CSS.escape(data.path) + '"]');
      // If it's focused, the person is typing in it — leave it alone.
      if (target && target !== document.activeElement && target.innerHTML !== data.value) {
        target.innerHTML = data.value;
      }
      return;
    }

    // Moving the selected-block outline must not need a whole new document —
    // rebuilding one would throw away the caret the click just placed.
    if (data.cmd === "select") {
      Array.prototype.forEach.call(document.querySelectorAll("[data-block-id]"), function (el) {
        if (el.getAttribute("data-block-id") === data.value) {
          el.setAttribute("data-selected", "true");
        } else {
          el.removeAttribute("data-selected");
        }
      });
      return;
    }

    var selection = document.getSelection();
    var field = selection && selection.rangeCount ? fieldOf(selection.focusNode) : null;
    if (!field) return;

    // The toolbar lives in the parent, so this frame isn't the focused one and
    // execCommand would quietly do nothing. Focusing an element that lost focus
    // also restores its *previous* caret, so put the selection back afterwards.
    var saved = selection.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
    window.focus();
    field.focus();
    if (saved) reselect(saved);

    if (data.cmd === "exec") {
      document.execCommand("styleWithCSS", false, "false");
      document.execCommand(data.value, false, null);
    } else if (data.cmd === "font") {
      if (data.value) wrapStyle(field, { fontFamily: STACKS[data.value] });
      else clearStyle(field, "font-family");
    } else if (data.cmd === "size") {
      if (data.value === "0") clearStyle(field, "font-size");
      else wrapStyle(field, { fontSize: data.value + "px" });
    } else if (data.cmd === "color") {
      wrapStyle(field, { color: data.value });
    }

    report(field);
    sendSelection();
  });
})();
</script>
`;
}
