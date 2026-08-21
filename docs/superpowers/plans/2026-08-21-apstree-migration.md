# APSTree Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace jstree (and its jQuery/Bootstrap CDN dependencies) with a vendored, dependency-free `APSTree` widget in the Sheets docking panel, preserving exact load/unload/hover/accordion behavior.

**Architecture:** Vendor the `APSTree` class verbatim from a pinned upstream commit into `wwwroot/aps-tree.js`. Extract the tree's data-shaping logic (level/sheet → APSTree node array, with sorting) into a small pure function in `wwwroot/sheets-tree-data.js` so it's unit-testable without a browser. Rewire `SheetsBrowserExt.js`'s `buildTree()` to use both, replacing jstree's plugin-driven events (`checkbox`, `wholerow`, `sort`, `open_node`/`hover_node`/`changed`) with APSTree's `nodeCheck`/`nodeToggle` events plus small manual glue for hover (APSTree has none) and accordion (APSTree has no built-in exclusivity). Finish by deleting the now-unused jstree/jQuery/Bootstrap CDN tags from `index.html`.

**Tech Stack:** Vanilla JS ES modules (no bundler — files are served as-is by `express.static('wwwroot')` and consumed by native browser `<script type="module">`/`import`). Node's built-in `node:test` + `node:assert` for the one unit-testable module (no new npm dependency).

**Spec:** `docs/superpowers/specs/2026-08-21-apstree-migration-design.md`

## Global Constraints

- Vendor `APSTree` from commit `12b5b22225121cb54778ca9e23d036db9711c7cf` of `autodesk-platform-services/aps-aecdm-property-extensibility-manager-sample` — pinned, not `main`.
- The vendored file must carry a header comment with: source URL, pinned commit SHA, extraction date, and the upstream repo's MIT license notice (`Copyright (c) 2023 Autodesk`).
- Checkbox cascade: use APSTree's native cascade (checking a level visually cascades to its sheets with tri-state indeterminate) — do not suppress it.
- Row interaction: checkbox-only toggle — do not add whole-row-click glue.
- All `hyperModelingTool` load/unload call sites, argument order, and the PDF-paper-hiding logic must match the current `changed.jstree` handler exactly (see spec's "Current jstree behavior" section) — this is a UI-library swap, not a behavior change.
- No new automated test framework or npm dependency — use Node's built-in `node:test`/`node:assert` only, and only for logic that has no DOM/Viewer dependency.
- Bootstrap CSS removal is a visual change requiring manual verification (global reset, not just component classes) — not a mechanical no-op like the other CDN tag removals.

---

## File Structure

- **Create** `wwwroot/aps-tree.js` — vendored `APSTree` class, ES module export, provenance header. No changes to its internals.
- **Create** `wwwroot/sheets-tree-data.js` — pure function `buildTreeNodes(floorData, getSheetsForLevel)` → sorted APSTree node array. No DOM/Viewer dependency, unit-testable.
- **Create** `wwwroot/sheets-tree-data.test.js` — `node:test` cases for `buildTreeNodes`.
- **Modify** `wwwroot/SheetsBrowserExt.js` — `buildTree()` and `uninitialize()` on `SheetsBrowserPanel` (lines 60-215 in the current file).
- **Modify** `wwwroot/index.html` — remove jstree, jQuery, and Bootstrap (JS + CSS) `<script>`/`<link>` tags (lines 9-16 in the current file).
- **No change**: `wwwroot/SheetsBrowserExt.css`, `server.js` (already serves all of `wwwroot/` statically, so the two new files need no route changes).

---

### Task 1: Vendor the APSTree class

**Files:**
- Create: `wwwroot/aps-tree.js`

**Interfaces:**
- Produces: `export class APSTree` with constructor `(container, options)` where `options` may include `showCheckboxes`, `multiSelect`, `viewer`; instance methods `setData(nodes)`, `on(event, callback)`, `nodeMap` (public `Map`), `expandedNodes` (public `Set`), `collapseNode(nodeId)`, `destroy()`. (Full API surface documented in the spec's "APSTree API surface used" section — Task 3 is the consumer.)

- [ ] **Step 1: Download the pinned upstream source**

```bash
curl -sL "https://raw.githubusercontent.com/autodesk-platform-services/aps-aecdm-property-extensibility-manager-sample/12b5b22225121cb54778ca9e23d036db9711c7cf/wwwroot/viewer/aecdm-element-tree-panel.js" -o /tmp/aecdm-element-tree-panel.js
wc -l /tmp/aecdm-element-tree-panel.js
```

Expected: a 1850-line file. If the line count differs, stop — the pin no longer matches what this plan was written against; re-verify the extraction range below by hand instead of proceeding blindly.

- [ ] **Step 2: Extract just the `APSTree` class body (marker-based, not line-counted)**

Anchor on the `class APSTree {` and `// Toolbar Manager Class` marker lines instead of hardcoded line numbers — this can't silently truncate or duplicate the declaration the way manual line-counting can:

```bash
awk '
  /^class APSTree \{/ { capture = 1 }
  /^\/\/ Toolbar Manager Class$/ { exit }
  capture { print }
' /tmp/aecdm-element-tree-panel.js > /tmp/aps-tree-class.js

wc -l /tmp/aps-tree-class.js
head -n 2 /tmp/aps-tree-class.js
tail -n 4 /tmp/aps-tree-class.js
```

Expected: 1129 lines. `head`: `class APSTree {` then `    constructor(container, options = {}) {`. `tail`: `console.log('APS Tree destroyed and cleaned up');`, then two `}` lines (end of `destroy()`, end of the class), possibly followed by one blank line — that trailing blank is harmless. If the line count or head/tail don't match, stop — the pin no longer matches what this plan was verified against.

- [ ] **Step 3: Turn the class declaration into an export**

```bash
sed -i.bak '1s/^class APSTree {$/export class APSTree {/' /tmp/aps-tree-class.js
rm /tmp/aps-tree-class.js.bak
head -n 1 /tmp/aps-tree-class.js
```

Expected: `export class APSTree {`

- [ ] **Step 4: Write `wwwroot/aps-tree.js`**

Prepend a provenance header, then append `/tmp/aps-tree-class.js` verbatim:

```bash
cat > wwwroot/aps-tree.js <<'HEADER'
// Vendored from:
// https://github.com/autodesk-platform-services/aps-aecdm-property-extensibility-manager-sample
// Path: wwwroot/viewer/aecdm-element-tree-panel.js
// Commit: 12b5b22225121cb54778ca9e23d036db9711c7cf (2026-05-05)
// Extracted: 2026-08-21 — only the APSTree class; APSTreeToolbar and the
// two AECDM-specific docking-panel/extension classes from the source file
// are not used here and were not vendored.
//
// The MIT License (MIT)
//
// Copyright (c) 2023 Autodesk
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to
// permit persons to whom the Software is furnished to do so, subject to
// the following conditions: the above copyright notice and this
// permission notice shall be included in all copies or substantial
// portions of the Software.
HEADER
cat /tmp/aps-tree-class.js >> wwwroot/aps-tree.js
```

- [ ] **Step 5: Syntax-check the new file**

```bash
node --check wwwroot/aps-tree.js
```

Expected: no output, exit code 0 (Node's `--check` only parses, it doesn't execute — this file references `document`/`window`/`ResizeObserver` inside method bodies, which is fine since nothing runs at module-load time other than the class definition). This exact procedure (Steps 1-5) was dry-run against the pinned commit while writing this plan and produces a syntactically valid file — a line-count or head/tail mismatch in Step 2 means the world has changed since then, not that the procedure is wrong.

- [ ] **Step 6: Commit**

```bash
git add wwwroot/aps-tree.js
git commit -m "$(cat <<'EOF'
Vendor APSTree from aps-aecdm-property-extensibility-manager-sample

Pinned to commit 12b5b22225121cb54778ca9e23d036db9711c7cf. Only the
reusable APSTree class is included; the sample's AECDM-specific
toolbar/panel/extension classes are not needed here.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Pure tree-data builder, with tests

**Files:**
- Create: `wwwroot/sheets-tree-data.js`
- Create: `wwwroot/sheets-tree-data.test.js`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `export function buildTreeNodes(floorData, getSheetsForLevel)` →
  `Array<{ id: string, label: string, dbId: number, objectType: 'levels', children: Array<{ id: string, label: string, dbId: number, objectType: 'sheets' }> }>`,
  sorted alphabetically by `label` at both levels. `floorData` is an array of
  `{ index: number, name: string }`. `getSheetsForLevel` is a function
  `(loopIndex: number) => Array<{ node: { name: () => string } }> | null | undefined`
  — called with the *loop index* (position in `floorData`), matching how
  `hyperModelingTool.getAvailableSheetsForLevel` is called today. Levels
  with no sheets (falsy or empty array) are omitted. Task 3 imports and
  calls this.

- [ ] **Step 1: Write the failing tests**

Create `wwwroot/sheets-tree-data.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTreeNodes } from './sheets-tree-data.js';

function sheet(name) {
    return { node: { name: () => name } };
}

test('omits levels with no available sheets', () => {
    const floorData = [
        { index: 10, name: 'Level 1' },
        { index: 11, name: 'Level 2' },
    ];
    const getSheetsForLevel = (i) => (i === 0 ? [sheet('A101')] : []);

    const nodes = buildTreeNodes(floorData, getSheetsForLevel);

    assert.equal(nodes.length, 1);
    assert.equal(nodes[0].label, 'Level 1');
});

test('also omits levels when getSheetsForLevel returns a falsy value', () => {
    const floorData = [{ index: 10, name: 'Level 1' }];
    const getSheetsForLevel = () => null;

    const nodes = buildTreeNodes(floorData, getSheetsForLevel);

    assert.equal(nodes.length, 0);
});

test('level node carries the correct id, dbId, and objectType', () => {
    const floorData = [{ index: 42, name: 'Roof' }];
    const getSheetsForLevel = () => [sheet('R1')];

    const nodes = buildTreeNodes(floorData, getSheetsForLevel);

    assert.deepEqual(
        { id: nodes[0].id, dbId: nodes[0].dbId, objectType: nodes[0].objectType },
        { id: 'level-42', dbId: 42, objectType: 'levels' }
    );
});

test('sheet children carry the correct id, label, dbId, and objectType', () => {
    const floorData = [{ index: 5, name: 'Level 1' }];
    const getSheetsForLevel = () => [sheet('A101'), sheet('A102')];

    const nodes = buildTreeNodes(floorData, getSheetsForLevel);
    const [first, second] = nodes[0].children;

    assert.deepEqual(
        { id: first.id, label: first.label, dbId: first.dbId, objectType: first.objectType },
        { id: 'sheet-5-0', label: 'A101', dbId: 0, objectType: 'sheets' }
    );
    assert.deepEqual(
        { id: second.id, label: second.label, dbId: second.dbId, objectType: second.objectType },
        { id: 'sheet-5-1', label: 'A102', dbId: 1, objectType: 'sheets' }
    );
});

test('levels are sorted alphabetically by label, independent of input order', () => {
    const floorData = [
        { index: 1, name: 'Level 2' },
        { index: 0, name: 'Level 1' },
    ];
    const getSheetsForLevel = () => [sheet('X')];

    const nodes = buildTreeNodes(floorData, getSheetsForLevel);

    assert.deepEqual(nodes.map((n) => n.label), ['Level 1', 'Level 2']);
});

test('sheets within a level are sorted alphabetically by label', () => {
    const floorData = [{ index: 0, name: 'Level 1' }];
    const getSheetsForLevel = () => [sheet('B'), sheet('A')];

    const nodes = buildTreeNodes(floorData, getSheetsForLevel);

    assert.deepEqual(nodes[0].children.map((c) => c.label), ['A', 'B']);
});

test('sorting reorders sheets by label but keeps each one\'s original dbId', () => {
    // Regression guard: dbId must stay the sheet's PRE-sort index (its
    // position in the array getSheetsForLevel returned), not get
    // reassigned to match its POST-sort position. B is at index 0 before
    // sorting and must keep dbId 0 even though it ends up second.
    const floorData = [{ index: 0, name: 'Level 1' }];
    const getSheetsForLevel = () => [sheet('B'), sheet('A')];

    const nodes = buildTreeNodes(floorData, getSheetsForLevel);

    assert.deepEqual(
        nodes[0].children.map((c) => ({ label: c.label, dbId: c.dbId })),
        [{ label: 'A', dbId: 1 }, { label: 'B', dbId: 0 }]
    );
});

test('getSheetsForLevel is called with the loop position (0, 1, ...), not floorData[i].index', () => {
    // hyperModelingTool.getAvailableSheetsForLevel is called with loop
    // position today (see spec's "Current jstree behavior" section) — lock
    // that calling convention in here so it can't silently flip to
    // floorData[i].index, which would be a different (and wrong) argument.
    const floorData = [
        { index: 40, name: 'Level A' },
        { index: 41, name: 'Level B' },
    ];
    const calledWith = [];
    const getSheetsForLevel = (i) => {
        calledWith.push(i);
        return [sheet('X')];
    };

    buildTreeNodes(floorData, getSheetsForLevel);

    assert.deepEqual(calledWith, [0, 1]);
});

test('returns an empty array for empty floor data', () => {
    assert.deepEqual(buildTreeNodes([], () => []), []);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
node --test wwwroot/sheets-tree-data.test.js
```

Expected: FAIL — `Cannot find module '.../wwwroot/sheets-tree-data.js'` (the module doesn't exist yet).

- [ ] **Step 3: Write the minimal implementation**

Create `wwwroot/sheets-tree-data.js`:

```js
export function buildTreeNodes(floorData, getSheetsForLevel) {
    const nodes = [];

    for (let i = 0; i < floorData.length; i++) {
        const sheets = getSheetsForLevel(i);

        if (!sheets || sheets.length <= 0) continue;

        const levelDbId = floorData[i].index;

        nodes.push({
            id: `level-${levelDbId}`,
            label: floorData[i].name,
            dbId: levelDbId,
            objectType: 'levels',
            children: sheets.map((sheet, idx) => ({
                id: `sheet-${levelDbId}-${idx}`,
                label: sheet.node.name(),
                dbId: idx,
                objectType: 'sheets',
            })),
        });
    }

    nodes.sort((a, b) => (a.label > b.label ? 1 : -1));
    nodes.forEach((node) => node.children.sort((a, b) => (a.label > b.label ? 1 : -1)));

    return nodes;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
node --test wwwroot/sheets-tree-data.test.js
```

Expected: all 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add wwwroot/sheets-tree-data.js wwwroot/sheets-tree-data.test.js
git commit -m "$(cat <<'EOF'
Add buildTreeNodes: pure Levels->Sheets tree data builder

Extracts the node-shaping and sort logic that used to live inline in
jstree's config into a small, DOM-free function so it's unit-testable.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Rewire SheetsBrowserExt.js to use APSTree

**Files:**
- Modify: `wwwroot/SheetsBrowserExt.js:1-18` (add imports after the license header), `wwwroot/SheetsBrowserExt.js:60-62` (`uninitialize`), `wwwroot/SheetsBrowserExt.js:103-215` (`buildTree`)

**Interfaces:**
- Consumes: `APSTree` from `./aps-tree.js` (Task 1) — `new APSTree(container, options)`, `.setData()`, `.on()`, `.nodeMap`, `.expandedNodes`, `.collapseNode()`, `.destroy()`. `buildTreeNodes` from `./sheets-tree-data.js` (Task 2).
- Produces: no new exports — `SheetsBrowserPanel`/`SheetsBrowserExt` are still exported the same way at the bottom of the file (unchanged).

- [ ] **Step 1: Add the imports**

At the top of `wwwroot/SheetsBrowserExt.js`, immediately after the closing `/////...` line of the license comment block (before `class SheetsBrowserPanel extends ...`), add:

```js
import { APSTree } from './aps-tree.js';
import { buildTreeNodes } from './sheets-tree-data.js';
```

- [ ] **Step 2: Replace `uninitialize()`**

Replace:

```js
    uninitialize() {
        super.uninitialize();
    }
```

with:

```js
    uninitialize() {
        if (this.treeContainer) {
            this.treeContainer.removeEventListener('mouseover', this.handleTreeHover);
            this.treeContainer.removeEventListener('mouseout', this.handleTreeHover);
        }

        if (this.tree) {
            this.tree.destroy();
            this.tree = null;
        }

        super.uninitialize();
    }
```

- [ ] **Step 3: Replace `buildTree(data)`**

Replace the entire existing `buildTree(data) { ... }` method (from `buildTree(data) {` through its closing `}`, i.e. current lines 103-215) with:

```js
    buildTree(data) {
        const nodes = buildTreeNodes(data, (i) => this.hyperModelingTool.getAvailableSheetsForLevel(i));

        this.tree = new APSTree(this.treeContainer, {
            showCheckboxes: true,
            multiSelect: true,
            viewer: this.viewer
        });
        this.tree.setData(nodes);

        this.tree.on('nodeToggle', ({ nodeId, expanded }) => {
            if (!expanded) return;

            const node = this.tree.nodeMap.get(nodeId);
            if (!node || node.objectType !== 'levels') return;

            nodes.forEach((levelNode) => {
                if (levelNode.id !== nodeId && this.tree.expandedNodes.has(levelNode.id)) {
                    this.tree.collapseNode(levelNode.id);
                }
            });
        });

        this.hoveredNodeId = null;
        this.handleTreeHover = (event) => {
            if (event.type === 'mouseover') {
                const rowEl = event.target.closest('.aps-tree-node');
                const rowId = rowEl?.dataset.nodeId ?? null;

                if (rowId === this.hoveredNodeId) return; // still inside the same row

                if (this.hoveredNodeId !== null) this.dehoverLevel();
                this.hoveredNodeId = rowId;

                if (rowEl) {
                    const node = this.tree.nodeMap.get(rowId);
                    const levelName = node.objectType === 'levels'
                        ? node.label
                        : this.tree.nodeMap.get(node.parent)?.label;
                    this.hoverLevelByName(levelName);
                }
                return;
            }

            // mouseout: only dehover when the pointer left the tree container
            // entirely. Row-to-row transitions inside the container are
            // already handled above by the mouseover branch — reacting to
            // both would either double-fire or (worse) re-hover the row
            // being left, since a mouseout's own event.target is the row
            // you're exiting, not the one you're entering.
            if (event.relatedTarget && this.treeContainer.contains(event.relatedTarget)) return;
            if (this.hoveredNodeId === null) return;

            this.hoveredNodeId = null;
            this.dehoverLevel();
        };
        this.treeContainer.addEventListener('mouseover', this.handleTreeHover);
        this.treeContainer.addEventListener('mouseout', this.handleTreeHover);

        this.tree.on('nodeCheck', async ({ nodeId, checked }) => {
            const node = this.tree.nodeMap.get(nodeId);
            if (!node) return;

            const sheetLoadedHandler = (result) => {
                if (!result.model.isPdf()) return;

                result.model.changePaperVisibility(false);
            };

            if (node.objectType === 'sheets') {
                const sheetIdx = node.dbId;
                const levelIdx = this.tree.nodeMap.get(node.parent).dbId;

                if (checked) {
                    await this.hyperModelingTool.loadSheetFromLevel(levelIdx, sheetIdx, sheetLoadedHandler);
                } else {
                    const loadedSheet = this.hyperModelingTool.findLoadedSheetFromLevelAndSheetIndex(levelIdx, sheetIdx);
                    this.hyperModelingTool.unloadSheet(loadedSheet);
                }
            } else {
                const levelIdx = node.dbId;

                if (checked) {
                    const sheets = this.hyperModelingTool.getAvailableSheetsForLevel(levelIdx);
                    sheets.forEach(async (sheet, sheetIdx) => {
                        await this.hyperModelingTool.loadSheetFromLevel(levelIdx, sheetIdx, sheetLoadedHandler);
                    });
                } else {
                    this.hyperModelingTool.unloadSheetsFromLevel(levelIdx);
                }
            }
        });
    }
```

Note this drops the original method's leftover `console.log(nodes);` debug line — it served no purpose and there's no reason to carry it forward.

- [ ] **Step 4: Syntax-check the file**

```bash
node --check wwwroot/SheetsBrowserExt.js
```

Expected: no output, exit code 0. (This only validates syntax — `Autodesk` is not defined at module scope until the browser loads the Viewer SDK, so this file cannot be `import`-ed or executed under plain Node; `--check` parses without executing, which is why it works here.)

- [ ] **Step 5: Manual browser verification**

```bash
npm start
```

Open the printed URL, load a model that has Hypermodeling levels/sheets, open the Sheets panel, and verify:

1. Expand a level → its sheets show; expand a second level → the first auto-collapses.
2. Hover a level row → its floor highlights in the 3D view; hover a sheet row → its parent level highlights; move the mouse off the tree → highlight clears. Moving the mouse between the checkbox/label/expand-icon *within one row* must not cause flicker (no repeated highlight/clear).
3. Check a single sheet's checkbox → it loads in the 3D view (PDF paper hidden if applicable); uncheck → it unloads.
4. Check a level's checkbox → all its sheets load, and the level's checkbox and all its sheet checkboxes show checked.
5. Check one sheet under a level (not via the level checkbox) → the level's checkbox shows indeterminate (dash/partial state).
6. Uncheck a level whose sheets are all checked → all its sheets unload and all checkboxes clear.
7. Clicking a row anywhere other than its checkbox does not check/uncheck it.
8. No console errors. jstree/jQuery/Bootstrap requests are still present in the Network tab at this point (Task 4 removes them) — that's expected and fine.

Do not proceed to Step 6 until every item above holds.

- [ ] **Step 6: Commit**

```bash
git add wwwroot/SheetsBrowserExt.js
git commit -m "$(cat <<'EOF'
Replace jstree with APSTree in SheetsBrowserExt

Swaps the Sheets panel's tree rendering from jstree to the vendored
APSTree widget. Accordion expand/collapse and hover-to-highlight are
now hand-wired (APSTree has no built-in equivalents); checkbox
check/uncheck drives the same loadSheetFromLevel/unloadSheet/
unloadSheetsFromLevel calls as before, now via APSTree's native
checkbox cascade instead of jstree's non-cascading checkbox plugin.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Remove jstree/jQuery/Bootstrap from index.html

**Files:**
- Modify: `wwwroot/index.html:9-16`
- Modify (conditionally, only if Step 3's visual check finds a regression): `wwwroot/main.css`

**Interfaces:**
- Consumes: nothing (this task only removes now-dead `<script>`/`<link>` tags; the module imports added in Task 3 resolve via relative ES-module paths and don't depend on anything in this file).
- Produces: nothing consumed by later tasks — this is the final task.

- [ ] **Step 1: Remove the dead CDN tags**

In `wwwroot/index.html`, replace:

```html
    <link rel="icon" type="image/x-icon" href="https://cdn.autodesk.io/favicon.ico">
    <!-- Common packages: jQuery, Bootstrap, jsTree -->
    <script src="//cdnjs.cloudflare.com/ajax/libs/jquery/3.3.1/jquery.min.js"></script>
    <script src="//cdnjs.cloudflare.com/ajax/libs/twitter-bootstrap/3.4.1/js/bootstrap.min.js"></script>
    <script src="//cdnjs.cloudflare.com/ajax/libs/jstree/3.3.7/jstree.min.js"></script>
    <script src="//cdnjs.cloudflare.com/ajax/libs/moment.js/2.22.1/moment.min.js"></script>
    <link rel="stylesheet" href="//cdnjs.cloudflare.com/ajax/libs/twitter-bootstrap/3.4.1/css/bootstrap.min.css">
    <link rel="stylesheet" href="//cdnjs.cloudflare.com/ajax/libs/jstree/3.3.7/themes/default/style.min.css" />
    <link rel="stylesheet" href="//cdnjs.cloudflare.com/ajax/libs/jstree/3.3.7/themes/default-dark/style.min.css" />
```

with:

```html
    <link rel="icon" type="image/x-icon" href="https://cdn.autodesk.io/favicon.ico">
    <script src="//cdnjs.cloudflare.com/ajax/libs/moment.js/2.22.1/moment.min.js"></script>
```

`moment.js` is kept (unrelated to this migration, not investigated). jQuery, both Bootstrap tags, and all three jstree tags are removed, along with the now-stale "Common packages: jQuery, Bootstrap, jsTree" comment.

- [ ] **Step 2: Syntax/asset sanity check**

```bash
grep -in "jstree\|jquery\|bootstrap" wwwroot/index.html
```

Expected: no output (no matches).

- [ ] **Step 3: Manual browser verification — full regression + Bootstrap CSS visual check**

```bash
npm start
```

Open the printed URL and repeat all 8 checks from Task 3 Step 5 end-to-end (this time jstree/jQuery/Bootstrap are fully gone, so also confirm the Network tab no longer requests any jstree, jQuery, or Bootstrap asset). Then additionally:

9. Visually compare the header bar, the model-picker `<dialog>` (title, status/retry/list/upload rows, footer buttons), and the `#urn`/`#load`/`#browse` controls against how they looked before this change. Bootstrap 3's stylesheet resets `box-sizing`, typography, and native button/input styling globally, not just where a `.btn`/`.modal`/etc. class is present, so this needs an actual look, not just a class-name grep. If anything visibly regresses, add the specific missing baseline rule(s) to `wwwroot/main.css` — do not restore the Bootstrap CDN tag to patch it. If you do add a rule, include `wwwroot/main.css` in Step 4's `git add` below; if nothing regressed, Step 4 stages only `index.html` as written.

Do not proceed to Step 4 until every item above holds.

- [ ] **Step 4: Commit**

If Step 3 required a `wwwroot/main.css` fix, run `git add wwwroot/index.html wwwroot/main.css` instead of the first line below and mention the specific fix in the commit body. Otherwise:

```bash
git add wwwroot/index.html
git commit -m "$(cat <<'EOF'
Remove jstree, jQuery, and Bootstrap CDN tags from index.html

Nothing under wwwroot uses jQuery or Bootstrap once SheetsBrowserExt
no longer depends on jstree. moment.js is left in place (unrelated).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage:**
- Vendoring APSTree, pinned + licensed → Task 1. ✓
- `buildTree()` node-shape translation + sorting → Task 2 (extracted, tested) + Task 3 (consumes it). ✓
- Accordion (`nodeToggle` + `expandedNodes` + `collapseNode`) → Task 3 Step 3. ✓
- Hover delegation with row-change guard → Task 3 Step 3. ✓
- Checkbox cascade decision (native APSTree cascade) → Task 3 Step 3 (`nodeCheck` handler, no cascade-suppression code). ✓
- Checkbox-only toggle decision → satisfied by construction (no whole-row click glue added). ✓
- `uninitialize()` listener/`destroy()` cleanup → Task 3 Step 2. ✓
- `index.html` cleanup (jstree + jQuery + Bootstrap JS + Bootstrap CSS, moment.js kept) → Task 4. ✓
- Bootstrap CSS removal treated as a visual change requiring manual check → Task 4 Step 3, item 9. ✓
- No `SheetsBrowserExt.css` changes → confirmed, no task touches it. ✓
- Testing checklist (spec's 9 items) → distributed across Task 3 Step 5 (items 1-8) and Task 4 Step 3 (items 1-9, full regression + item 9). ✓

**Placeholder scan:** No TBD/TODO. Task 1's extraction (Steps 2-4) is a fully mechanical `awk`/`sed`/`cat` pipeline with no hand-splice or "paste starting from line N" prose — dry-run against the pinned commit while writing this plan (see Task 1 Step 5's note) and produces a syntactically valid file, so there's nothing left for an executor to interpret.

**Type consistency:** `buildTreeNodes(floorData, getSheetsForLevel)` signature matches between Task 2 (definition + tests) and Task 3 Step 3 (call site: `buildTreeNodes(data, (i) => this.hyperModelingTool.getAvailableSheetsForLevel(i))`). Node shape (`id`, `label`, `dbId`, `objectType`, `children`) matches between Task 2's output and Task 3's consumption (`node.objectType`, `node.dbId`, `node.label`, `node.parent` via `nodeMap`). `APSTree` public surface (`setData`, `on`, `nodeMap`, `expandedNodes`, `collapseNode`, `destroy`) matches between Task 1's provenance comment and Task 3's usage.

**codex-advisor review (2026-08-21):** caught a real off-by-count ambiguity in Task 1's original line-based extraction instructions (fixed: replaced with a marker-anchored `awk`/`sed` pipeline, dry-run and verified in Task 1 Step 5's note), a real bug in the original hover handler (a `mouseout` leaving the tree re-hovered the exited row instead of dehovering it — fixed: rewritten as a single state-tracked handler using `event.type` to distinguish entering from leaving, verified against DOM event semantics), a missing test for sort-preserves-original-dbId (added, verified passing against the planned implementation), a missing test locking `getSheetsForLevel`'s loop-index calling convention (added, verified passing), and a commit-boundary gap where Task 4's conditional `main.css` fix wasn't in its `git add` (fixed: Task 4 Files/Step 4 now cover it conditionally). Its cascade-related concern from the spec review was already resolved by that earlier pass and needed no plan change.
