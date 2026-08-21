# Whole-row click toggles the tree checkbox

Date: 2026-08-21
Status: Implemented and verified

## Context

`wwwroot/SheetsBrowserExt.js`'s Sheets panel renders its Levels → Sheets
tree with the vendored `APSTree` widget (see
`docs/superpowers/specs/2026-08-21-apstree-migration-design.md`). That
migration's decision #2 deliberately chose checkbox-only toggle: only
clicking the checkbox itself checked/unchecked a row, matching
`APSTree`'s out-of-the-box click handling.

The user asked to change this: clicking anywhere on a row (not just the
checkbox) should check/uncheck it, matching the original jstree
`wholerow` + `checkbox` plugin combination's UX. This document records
that follow-up decision and the resulting implementation.

## Current behavior before this change

- Clicking the checkbox toggles it (`nodeCheck` fires, load/unload runs).
- Clicking a row's label text fires APSTree's `select` action, which
  (since `expandOnClick` defaults to `true` and nothing in this app
  overrode it) *also* expands/collapses a level row — a side effect of
  the library default, not a deliberately designed feature. It also
  fires `nodeSelect`/paints `.aps-tree-content.selected`, which the
  original migration's final review suppressed via a CSS override
  (`background-color: transparent`) since nothing subscribed to
  selection.
- Clicking a row's padding (not the label, checkbox, or arrow
  specifically) does nothing — APSTree's click handler only reacts to
  elements carrying a `data-action` attribute.
- Clicking the expand arrow icon always expands/collapses, regardless
  of `expandOnClick`.

## Decision

Whole-row click (label text and row padding) now toggles the checkbox.
The one behavior this removes: **a level row's label click no longer
also expands/collapses it** — clicking a row now means "toggle the
checkbox," full stop, and expand/collapse becomes exclusive to the
arrow icon. This trade-off is unavoidable: a row click can't mean both
"expand" and "check" without being ambiguous to the user, and the
arrow-only expand behavior matches what the original jstree
implementation did before this whole migration started.

Everything else is unchanged: the arrow icon's expand/collapse (and the
accordion's auto-collapse-siblings behavior, which reacts to the same
`nodeToggle` event regardless of what triggered it), the checkbox's own
click handling, tri-state cascade, hover-to-3D-highlight, and the
`nodeCheck`-driven load/unload logic.

## Design

**File touched:** `wwwroot/SheetsBrowserExt.js` — `buildTree()` and
`uninitialize()` only.

1. Pass `expandOnClick: false` in the `APSTree` constructor options
   (alongside the existing `showCheckboxes`/`multiSelect`/`viewer`).
   This stops label clicks from also calling `toggleNode()` internally;
   the arrow icon's own `toggle` action is unconditional and keeps
   working regardless of this option.

2. Add a delegated `click` listener on `this.treeContainer` (same
   event-delegation pattern already used for the hover handler):
   resolve the clicked row via `event.target.closest('.aps-tree-node')`;
   if there's no row, do nothing; if the click landed on the checkbox
   (`data-action="check"`) or the expand arrow
   (`data-action="toggle"`), do nothing — those elements already handle
   their own clicks via APSTree's internal handler, and reacting again
   would double-toggle the checkbox or fight the arrow's dedicated
   behavior; otherwise call `this.tree.toggleCheck(rowEl.dataset.nodeId)`.
   `toggleCheck` is the same method APSTree's own checkbox click handler
   calls internally — it fires exactly one `nodeCheck` event
   (`programmatic: false`), so the existing `nodeCheck` handler in
   `buildTree()` needs no changes.

3. `uninitialize()` gains a third `removeEventListener('click', ...)`
   call alongside the existing hover-listener removals, so the new
   listener doesn't outlive the panel.

### Why a separate click listener instead of reusing APSTree's `nodeSelect` event

`nodeSelect` only fires when the label `<span>` specifically is
clicked (it carries `data-action="select"`); clicking the row's padding
inside `.aps-tree-content` has no `data-action` and produces no APSTree
event at all. A separate delegated listener, resolving to the nearest
`.aps-tree-node` regardless of which exact child was clicked, is
required to get genuine whole-row coverage — not just the label text.

### Testing

Manual, in-browser (same constraint as the rest of this tree — no
automated DOM test harness in this repo):

1. Click a sheet row's label → its checkbox toggles, sheet
   loads/unloads.
2. Click a level row's label → its checkbox toggles (cascading to its
   sheets with tri-state), and the level does **not** expand/collapse.
3. Click a level row's padding (not the label) → same as #2.
4. Click the checkbox directly → toggles once, not twice.
5. Click the arrow icon → expands/collapses only, checkbox state
   unchanged, accordion (auto-collapse other levels) still works.
6. Hover behavior unaffected — verify no regression from the earlier
   migration's hover fix.

Verified against a live model by the user: confirmed working as
designed.

## Out of scope

- No change to `APSTree` itself (`wwwroot/aps-tree.js` stays untouched
  — this is pure consumer-side wiring in `SheetsBrowserExt.js`).
- No change to `nodeCheck` handling, load/unload semantics, hover, or
  the accordion logic.
