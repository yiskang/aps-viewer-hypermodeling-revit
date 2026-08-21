# Whole-Row Click Checkbox Toggle Implementation Plan

> **For agentic workers:** This plan documents a change that has already been implemented and verified by the user. It is not queued for execution — it's a record of what was built and why, per the project's spec/plan/implement convention. If reopening this work (e.g. to fix a regression), read `wwwroot/SheetsBrowserExt.js`'s current state first; the single task below may no longer match it exactly.

**Goal:** Make clicking anywhere on a tree row (not just the checkbox) toggle that row's checkbox in the Sheets panel.

**Architecture:** Two small changes to `SheetsBrowserPanel.buildTree()`/`uninitialize()` in `wwwroot/SheetsBrowserExt.js`: disable `APSTree`'s `expandOnClick` default (so label clicks stop also expanding a level), and add one delegated `click` listener that calls the vendored `APSTree`'s own `toggleCheck(nodeId)` for any row click that isn't on the checkbox or the expand arrow.

**Tech Stack:** Vanilla JS ES modules, same as the rest of this file — no new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-21-row-click-checkbox-toggle-design.md`

## Global Constraints

- The only behavior change from before this plan: a level row's label click stops expanding/collapsing it. Everything else (arrow-icon expand/collapse, accordion, checkbox click, tri-state cascade, hover, load/unload semantics) must stay identical.
- No change to the vendored `wwwroot/aps-tree.js` — this is consumer-side wiring only.
- No new automated test framework — this is DOM/Viewer-dependent code with no existing test harness for it (same constraint as the rest of the tree wiring); verification is manual, in-browser.

---

## File Structure

- **Modify** `wwwroot/SheetsBrowserExt.js` — `buildTree()` (constructor options + new click listener) and `uninitialize()` (new listener's teardown).
- **No change**: `wwwroot/aps-tree.js`, `wwwroot/sheets-tree-data.js`, `wwwroot/SheetsBrowserExt.css`, `wwwroot/index.html`.

---

### Task 1: Whole-row click toggles the checkbox

**Files:**
- Modify: `wwwroot/SheetsBrowserExt.js` (`buildTree()`, `uninitialize()`)

**Interfaces:**
- Consumes: `APSTree`'s `toggleCheck(nodeId)` method (already vendored in `wwwroot/aps-tree.js:629`, the same method APSTree's own checkbox-click handler calls internally — fires one `nodeCheck` event with `programmatic: false`, same as a direct checkbox click) and the `expandOnClick` constructor option (`wwwroot/aps-tree.js`, defaults `true`, honored in `handleClick`'s `select` case).
- Produces: no new exports.

- [x] **Step 1: Add `expandOnClick: false` to the `APSTree` constructor call**

```js
this.tree = new APSTree(this.treeContainer, {
    showCheckboxes: true,
    multiSelect: true,
    expandOnClick: false,
    viewer: this.viewer
});
```

- [x] **Step 2: Add the delegated row-click listener**

Immediately after the existing hover-listener registration (`this.treeContainer.addEventListener('mouseover'/'mouseout', ...)`), add:

```js
this.handleTreeClick = (event) => {
    const rowEl = event.target.closest('.aps-tree-node');
    if (!rowEl) return;

    // The checkbox and the expand arrow already handle their own
    // clicks (checkbox toggles itself; arrow expands/collapses).
    // Reacting to those here too would double-toggle the checkbox
    // or fight the arrow's dedicated expand/collapse behavior.
    const action = event.target.dataset.action;
    if (action === 'check' || action === 'toggle') return;

    this.tree.toggleCheck(rowEl.dataset.nodeId);
};
this.treeContainer.addEventListener('click', this.handleTreeClick);
```

- [x] **Step 3: Remove the new listener in `uninitialize()`**

```js
    uninitialize() {
        if (this.treeContainer) {
            this.treeContainer.removeEventListener('mouseover', this.handleTreeHover);
            this.treeContainer.removeEventListener('mouseout', this.handleTreeHover);
            this.treeContainer.removeEventListener('click', this.handleTreeClick);
        }

        if (this.tree) {
            this.tree.destroy();
            this.tree = null;
        }

        super.uninitialize();
    }
```

- [x] **Step 4: Syntax-check**

```bash
node --check wwwroot/SheetsBrowserExt.js
```

Expected: no output, exit code 0. (Ran during implementation — passed.)

- [x] **Step 5: Manual browser verification**

Server was already running from the prior migration's walkthrough; the change is a static-file edit picked up on page reload, no restart needed. Checklist (per the spec's Testing section):

1. Click a sheet row's label → checkbox toggles, sheet loads/unloads.
2. Click a level row's label → checkbox toggles with cascade/tri-state, level does NOT expand/collapse.
3. Click a level row's padding → same as #2.
4. Click the checkbox directly → toggles once, not twice.
5. Click the arrow icon → expands/collapses only, checkbox unaffected, accordion still works.
6. Hover unaffected.

User confirmed working as designed against a live model.

- [x] **Step 6: Commit**

Committed directly (bounded change, no separate task-by-task subagent execution — implemented inline per the brainstorming skill's bounded path).

---

## Self-Review

**Spec coverage:** Both spec decisions (whole-row click checks; arrow-only expand) map to Steps 1-2. Teardown parity (Step 3) matches the spec's "no change to `uninitialize()`'s existing structure beyond one more listener removal." Testing checklist matches the spec's Testing section exactly. ✓

**Placeholder scan:** No TBD/TODO; all code blocks are the actual code written.

**Type consistency:** `toggleCheck(nodeId)` call signature matches `aps-tree.js:629`'s definition (single `nodeId` string argument) — same as APSTree's own internal call to it. `rowEl.dataset.nodeId` matches the `data-node-id` attribute APSTree sets on every rendered row (established in the original migration's Task 3 review).
