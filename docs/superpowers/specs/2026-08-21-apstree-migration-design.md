# Replace jstree with APSTree in SheetsBrowserExt

Date: 2026-08-21
Status: Draft — awaiting review

## Context

`wwwroot/SheetsBrowserExt.js` implements the "Sheets" docking panel: a
two-level tree (Levels → Sheets) that drives the Hypermodeling
extension's sheet load/unload. It currently renders that tree with
[jstree](https://www.jstree.com/) 3.3.7, loaded from a CDN in
`wwwroot/index.html` along with jQuery (jstree's only dependency in
this codebase — confirmed via full-repo search that no other file
under `wwwroot` uses `$`, `jQuery(`, or any Bootstrap JS feature).

We are replacing jstree with `APSTree`, a small dependency-free tree
widget extracted from Autodesk's
[aps-aecdm-property-extensibility-manager-sample](https://github.com/autodesk-platform-services/aps-aecdm-property-extensibility-manager-sample)
(`wwwroot/viewer/aecdm-element-tree-panel.js`). That sample file bundles
four classes; only the first, `APSTree` (tree rendering, selection,
checkboxes, expand/collapse, injected CSS), is reusable here. The other
three (`APSTreeToolbar`, the AECDM docking-panel subclass, and its
`Autodesk.Viewing.Extension` wrapper) are specific to that sample's
attach/detach property-definition workflow and are not used.

This is a scoped swap of one existing UI flow — no new subsystems, no
change to the Hypermodeling load/unload logic itself, no interface
change visible outside `SheetsBrowserExt.js` and `index.html`.

## Current jstree behavior (source of truth for parity)

From `wwwroot/SheetsBrowserExt.js` `buildTree()`:

- **Data**: array of level nodes `{dbId, type: 'levels', text, children}`,
  each with sheet children `{dbId, type: 'sheets', text}`. `dbId` is a
  local array index (level index, or per-level sheet index) — not a
  Viewer scene `dbId`. Only levels that have at least one available
  sheet are included.
- **Config**: `multiple: true`, `checkbox` plugin with
  `cascade: 'none'`, `sort` plugin (alphabetical by `text`, applied at
  every level of the tree), `types` plugin (empty `levels`/`sheets`
  type defs, unused beyond tagging), `wholerow` plugin, theme
  `default-dark`, icons off.
- **`open_node.jstree`**: accordion — closes all other open sibling
  nodes when one level is expanded. Sheets are leaves and never fire
  this.
- **`hover_node.jstree` / `dehover_node.jstree`**: mouse enters/leaves
  a row → `hoverLevelByName(level)` / `dehoverLevel()`, which roll the
  3D view's floor highlight over the corresponding level. For a sheet
  row, the *parent* level is looked up and hovered.
- **`changed.jstree`** (fires on check/uncheck, since `checkbox` +
  `multiple` unify "select" with "check", and `wholerow` makes the
  entire row clickable):
  - select a sheet → `loadSheetFromLevel(levelIdx, sheetIdx, handler)`
  - select a level → loop over *all* sheets under it and load each one
    (this happens regardless of jstree's checkbox visuals, since
    `cascade: 'none'` never auto-checks the children)
  - deselect a sheet → unload that one loaded sheet
  - deselect a level → `unloadSheetsFromLevel(levelIdx)`
  - the load handler additionally hides the PDF paper
    (`changePaperVisibility(false)`) for PDF-backed sheet models

## APSTree API surface used

From the vendored `APSTree` class:

- `new APSTree(container, { showCheckboxes, multiSelect, viewer })`
- `tree.setData(nodes)` — `nodes: {id, label, dbId?, objectType?, children?}[]`.
  `id` must be unique; `objectType` and `dbId`, if present, become
  `data-*` attributes on the row and are otherwise opaque to APSTree.
  Any other custom fields on a node survive into `tree.nodeMap` (it
  spreads `{...node, parent}` per id) — used here to look up a node's
  `objectType`/`dbId`/parent from an id.
- `tree.on(event, cb)` — events used: `nodeCheck` (`{nodeId, checked,
  programmatic}`), `nodeToggle` (`{nodeId, expanded}`).
- `tree.collapseNode(nodeId)` — used for the accordion behavior.
- `tree.nodeMap: Map<id, node & {parent}>` — public property, used to
  resolve a node's type/dbId/parent without re-walking `tree.data`.
- No built-in hover events and no "whole row click = check" behavior —
  both are jstree-plugin behaviors with no APSTree equivalent; see
  decisions below.

## Decisions (already confirmed)

1. **Checkbox cascade**: use APSTree's native cascade. Checking a
   level visually checks/unchecks all its sheet children with proper
   indeterminate tri-state, instead of replicating jstree's
   `cascade: 'none'` (where a level's checkbox never reflected its
   children's state even though the app still loaded/unloaded all of
   them). Functionally the load/unload outcome is identical either
   way; this only changes what the checkboxes *look like*.
2. **Row click behavior**: checkbox-only toggle. Only clicking the
   checkbox itself checks/unchecks a node. jstree's `wholerow` plugin
   made the entire row act as the checkbox's hit target; APSTree does
   not offer this, and we are not adding glue code to replicate it.
3. **`index.html` script/link cleanup**: remove the jstree `<script>`
   and its two theme `<link>` tags, and also remove the jQuery and
   Bootstrap CDN tags (script + CSS). Confirmed via full-repo grep that
   no `wwwroot` JS uses `$`/`jQuery(`, and no markup in `index.html`
   uses any Bootstrap CSS class — both are fully unused once jstree is
   gone. `moment.js` is left alone (out of scope — not investigated
   here).

## Design

### Files

1. **New `wwwroot/aps-tree.js`** — the vendored `APSTree` class only,
   as an ES module (`export class APSTree { ... }`), with jQuery usage
   (there is none in the class itself) and the other three sample
   classes stripped. Attribution comment pointing at the upstream
   sample file this was extracted from.

2. **`wwwroot/SheetsBrowserExt.js`** — rewrite `buildTree()`:
   - `import { APSTree } from './aps-tree.js';` at the top of the file.
   - Build the same two-level array shape as today, translated to
     APSTree's node shape:
     - level node: `{ id: 'level-' + data[i].index, label: data[i].name,
       dbId: data[i].index, objectType: 'levels', children: [...] }`
     - sheet node: `{ id: 'sheet-' + levelDbId + '-' + idx, label:
       child.node.name(), dbId: idx, objectType: 'sheets' }`
     - synthetic `id`s are needed because jstree auto-assigned ids and
       the existing code never depended on them; APSTree requires a
       caller-supplied unique `id` per node.
   - Sort levels array and each level's `children` array alphabetically
     by `label` before calling `setData()` (replaces jstree's `sort`
     plugin, which sorted every level of the tree).
   - `this.tree = new APSTree(this.treeContainer, { showCheckboxes: true,
     multiSelect: true, viewer: this.viewer });`
   - `this.tree.setData(nodes);`
   - Accordion: `this.tree.on('nodeToggle', ({ nodeId, expanded }) => {
     if (!expanded) return; const node = this.tree.nodeMap.get(nodeId);
     if (node.objectType !== 'levels') return; /* collapse sibling
     expanded level nodes */ });` — iterate the top-level node ids and
     call `this.tree.collapseNode(id)` for any other than `nodeId`
     that's expanded.
   - Hover: add native `mouseover`/`mouseout` listeners on
     `this.treeContainer` (event delegation, `event.target.closest('.aps-tree-node')`)
     since APSTree has no hover events. Resolve the hovered node via
     `this.tree.nodeMap.get(nodeElement.dataset.nodeId)` to get
     `objectType`/`label`/`parent`, then call the existing
     `hoverLevelByName`/`dehoverLevel` exactly as today (level row →
     hover own name; sheet row → hover parent's name via
     `nodeMap.get(node.parent).label`).
   - Check/uncheck: `this.tree.on('nodeCheck', ({ nodeId, checked }) =>
     { ... })` — resolve node via `nodeMap`, branch on `objectType` and
     `checked` exactly as the current `changed.jstree` handler does
     (sheet → load/unload one; level → load/unload all sheets under
     it), same `sheetLoadedHandler` PDF-paper-hiding logic.
   - `uninitialize()`: today `SheetsBrowserPanel.uninitialize()` only
     calls `super.uninitialize()` — the jstree instance is never
     explicitly destroyed, it's just discarded with the DOM subtree
     when the panel is removed. For parity nothing further is
     *required*, but add `this.tree?.destroy(); this.tree = null;` at
     the top of `uninitialize()` anyway, since it's a one-line, no-risk
     addition that detaches the click listener and `ResizeObserver`
     APSTree installs instead of leaving them to be garbage-collected
     implicitly.

3. **`wwwroot/index.html`** — delete the jstree `<script>` tag (CDN,
   v3.3.7) and its two theme `<link>` tags (`default` and
   `default-dark`), the jQuery `<script>` tag, the Bootstrap JS
   `<script>` tag, and the Bootstrap CSS `<link>` tag. Leave the
   moment.js `<script>` tag untouched (unrelated, not investigated).

4. **`wwwroot/SheetsBrowserExt.css`** — no changes. Existing
   `.adn-sheets-browser-panel` sizing/position rules already match
   what the upstream sample's own panel CSS does. APSTree injects its
   own default theme (light background, dark text via
   `#aps-tree-styles`), which matches this app's `viewer.setTheme('light-theme')`
   call in `wwwroot/viewer.js:28` — no new dark-theme override is
   needed.

### Data flow (unchanged shape, new implementation)

```
floorSelector.floorData + hyperModelingTool.getAvailableSheetsForLevel(i)
  → buildTree() constructs {id,label,dbId,objectType,children}[] (sorted)
  → tree.setData(nodes)
  → user checks/unchecks a row → 'nodeCheck' → resolve via nodeMap
    → hyperModelingTool.loadSheetFromLevel / unloadSheet / unloadSheetsFromLevel
  → user hovers a row → mouseover/mouseout → resolve via nodeMap
    → levelSelector.rollOverFloor / rollOverFloor()
  → user expands a level → 'nodeToggle' → collapse other expanded levels
```

### Error handling

No new error paths are introduced. `hyperModelingTool` calls
(`loadSheetFromLevel`, `unloadSheet`, `unloadSheetsFromLevel`) keep
their existing async/await usage and are not wrapped in additional
try/catch, matching current behavior (failures surface the same way
they do today).

### Testing

Manual, in-browser (this repo has no existing automated test suite for
the viewer UI):

1. Load a model with Hypermodeling levels/sheets, open the Sheets
   panel.
2. Expand a level → its sheets show; expand a second level → the first
   auto-collapses (accordion parity).
3. Hover a level row → its floor highlights in the 3D view; hover a
   sheet row → its parent level highlights; move mouse off → highlight
   clears.
4. Check a single sheet → it loads in the 3D view (and PDF paper is
   hidden if applicable); uncheck → it unloads.
5. Check a level's checkbox → all its sheets load and the checkbox
   shows checked (its sheet children show checked too, tri-state
   parity per decision #1); uncheck the level → all unload.
6. Check one sheet under a level (not via the level checkbox) → the
   level checkbox shows indeterminate.
7. Verify only the checkbox toggles state — clicking elsewhere on a
   row does not check/uncheck it (per decision #2).
8. Confirm no console errors related to jQuery/jstree/Bootstrap, and
   that `index.html` no longer requests jstree, jQuery, or Bootstrap
   assets (check Network tab).

## Out of scope

- Any change to `Autodesk.AEC.Hypermodeling` / `LevelsExtension`
  behavior, or to the toolbar button that shows/hides the panel.
- Adding automated tests (none exist for this UI today).
