/////////////////////////////////////////////////////////////////////
// Copyright (c) Autodesk, Inc. All rights reserved
// Written by Forge Partner Development
//
// Permission to use, copy, modify, and distribute this software in
// object code form for any purpose and without fee is hereby granted,
// provided that the above copyright notice appears in all copies and
// that both that copyright notice and the limited warranty and
// restricted rights notice below appear in all supporting
// documentation.
//
// AUTODESK PROVIDES THIS PROGRAM "AS IS" AND WITH ALL FAULTS.
// AUTODESK SPECIFICALLY DISCLAIMS ANY IMPLIED WARRANTY OF
// MERCHANTABILITY OR FITNESS FOR A PARTICULAR USE.  AUTODESK, INC.
// DOES NOT WARRANT THAT THE OPERATION OF THE PROGRAM WILL BE
// UNINTERRUPTED OR ERROR FREE.
/////////////////////////////////////////////////////////////////////

import { APSTree } from './aps-tree.js';
import { buildTreeNodes } from './sheets-tree-data.js';

class SheetsBrowserPanel extends Autodesk.Viewing.UI.DockingPanel {
    constructor(viewer) {
        const options = {};

        //  Height adjustment for scroll container, offset to height of the title bar and footer by default.
        if (!options.heightAdjustment)
            options.heightAdjustment = 70;

        if (!options.marginTop)
            options.marginTop = 0;

        //options.addFooter = false;

        super(viewer.container, viewer.container.id + 'SheetsBrowserPanel', 'Sheets', options);

        this.container.classList.add('adn-docking-panel');
        this.container.classList.add('adn-sheets-browser-panel');
        this.createScrollContainer(options);

        this.viewer = viewer;
        this.options = options;
        this.uiCreated = false;

        this.addVisibilityListener((show) => {
            if (!show) return;

            if (!this.uiCreated)
                this.createUI();
        });
    }

    get levelSelector() {
        const levelExt = this.viewer.getExtension('Autodesk.AEC.LevelsExtension');
        return levelExt && levelExt.floorSelector;
    }

    get hyperModelingTool() {
        const hyperModelingExt = this.viewer.getExtension('Autodesk.AEC.Hypermodeling');
        return hyperModelingExt;
    }

    uninitialize() {
        if (this.treeContainer) {
            this.treeContainer.removeEventListener('mouseover', this.handleTreeHover);
            this.treeContainer.removeEventListener('mouseout', this.handleTreeHover);
            this.treeContainer.removeEventListener('click', this.handleTreeClick, true);
        }

        if (this.tree) {
            this.tree.destroy();
            this.tree = null;
        }

        super.uninitialize();
    }

    createUI() {
        this.uiCreated = true;

        const div = document.createElement('div');

        const treeDiv = document.createElement('div');
        div.appendChild(treeDiv);
        this.treeContainer = treeDiv;
        this.scrollContainer.appendChild(div);

        this.buildTree(this.levelSelector.floorData);
    }

    findLevelByName(name) {
        const levelData = this.levelSelector.floorData;
        return levelData.find(level => level.name.includes(name));
    }

    findLevelLocationByName(name) {
        const levelData = this.dataProvider.locations;
        return levelData.find(level => level.name.includes(name));
    }

    hoverLevelByName(name) {
        const level = this.findLevelByName(name);
        let levelIdx = level ? level.index : null;
        if (levelIdx === this.levelSelector.currentFloor) {
            levelIdx = Autodesk.AEC.FloorSelector.AllFloors;
        }

        this.levelSelector.rollOverFloor(levelIdx);
    }

    dehoverLevel() {
        //this.levelSelector.rollOverFloor(Autodesk.AEC.FloorSelector.NoFloor);
        this.levelSelector.rollOverFloor();
        this.viewer.impl.invalidate(false, true, true);
    }

    buildTree(data) {
        const nodes = buildTreeNodes(data, (i) => this.hyperModelingTool.getAvailableSheetsForLevel(i));

        this.tree = new APSTree(this.treeContainer, {
            showCheckboxes: true,
            multiSelect: true,
            expandOnClick: false,
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
        // Capture phase, not bubble: APSTree's own click handler (bound to
        // treeWrapper, a child of treeContainer) calls stopPropagation()
        // unconditionally for any click landing on an element with a
        // data-action attribute (checkbox, arrow, AND the label span) — see
        // aps-tree.js's handleClick(). That kills bubble-phase propagation
        // before it reaches a listener on treeContainer, so label clicks
        // would silently never reach us. Capture fires top-down, before the
        // target is reached, so it runs before that stopPropagation() can
        // block it.
        this.treeContainer.addEventListener('click', this.handleTreeClick, true);

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
}

class SheetsBrowserExt extends Autodesk.Viewing.Extension {
    constructor(viewer, options) {
        super(viewer, options);

        this.uiCreated = false;
        this.panel = null;

        this.createUI = this.createUI.bind(this);
        this.onToolbarCreated = this.onToolbarCreated.bind(this);
    }

    onToolbarCreated() {
        if (!this.uiCreated)
            this.createUI();
    }

    createUI() {
        this.uiCreated = true;

        const viewer = this.viewer;

        const sheetsBrowserPanel = new SheetsBrowserPanel(viewer);
        viewer.addPanel(sheetsBrowserPanel);
        this.panel = sheetsBrowserPanel;

        const sheetsBrowserButton = new Autodesk.Viewing.UI.Button('toolbar-adnSheetsBrowserTool');
        sheetsBrowserButton.setToolTip('Level Sections');
        sheetsBrowserButton.setIcon('adsk-icon-documentModels');
        sheetsBrowserButton.onClick = function () {
            sheetsBrowserPanel.setVisible(!sheetsBrowserPanel.isVisible());
        };

        const subToolbar = new Autodesk.Viewing.UI.ControlGroup('toolbar-adn-tools');
        subToolbar.addControl(sheetsBrowserButton);
        subToolbar.adnSheetsBrowserButton = sheetsBrowserButton;
        this.subToolbar = subToolbar;

        viewer.toolbar.addControl(this.subToolbar);

        sheetsBrowserPanel.addVisibilityListener(function (visible) {
            if (visible)
                viewer.onPanelVisible(sheetsBrowserPanel, viewer);

            sheetsBrowserButton.setState(visible ? Autodesk.Viewing.UI.Button.State.ACTIVE : Autodesk.Viewing.UI.Button.State.INACTIVE);
        });

        const levelsToolBtn = viewer.toolbar.getControl('modelTools').getControl('toolbar-levelsTool');
        levelsToolBtn?.removeFromParent();
        this.subToolbar.addControl(levelsToolBtn);
    }

    async load() {
        const viewer = this.viewer;

        await viewer.waitForLoadDone();

        await viewer.model.getDocumentNode().getDocument().downloadAecModelData();

        // Workaround for misaligned issue
        // let aecData = viewer.model.getDocumentNode().getAecModelData();
        // aecData.viewports = aecData.viewports.map( vp => { vp.modelToSheetTransform = null; return vp } )

        // Pre-load level extension 
        await viewer.loadExtension('Autodesk.AEC.LevelsExtension'/*, { doNotCreateUI: true }*/);
        await viewer.loadExtension('Autodesk.AEC.Hypermodeling', { hidePaper: true });

        if (viewer.toolbar) {
            // Toolbar is already available, create the UI
            this.createUI();
        }

        return true;
    }

    unload() {
        if (this.panel) {
            this.viewer.removePanel(this.panel);
            this.panel.uninitialize();
            delete this.panel;
            this.panel = null;
        }

        if (this.subToolbar) {
            this.viewer.toolbar.removeControl(this.subToolbar);
            delete this.subToolbar.adnSheetsBrowserButton;
            this.subToolbar.adnSheetsBrowserButton = null;
            delete this.subToolbar;
            this.subToolbar = null;
        }

        return true;
    }
}

Autodesk.Viewing.theExtensionManager.registerExtension('Autodesk.ADN.SheetsBrowserExt', SheetsBrowserExt);

export { SheetsBrowserExt, SheetsBrowserPanel };