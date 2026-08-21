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
        const nodes = [];

        for (let i = 0; i < data.length; i++) {
            const sheets = this.hyperModelingTool.getAvailableSheetsForLevel(i);

            if (!sheets || sheets.length <= 0) continue;

            const node = {
                dbId: data[i].index,
                type: 'levels',
                text: data[i].name,
                children: sheets.map((child, idx) => {
                    return {
                        dbId: idx,
                        type: 'sheets',
                        text: child.node.name()
                    };
                })
            }
            nodes.push(node);
        }

        console.log(nodes);

        $(this.treeContainer)
            .jstree({
                core: {
                    data: nodes,
                    multiple: true,
                    themes: {
                        icons: false,
                        name: 'default-dark'
                    }
                },
                sort: function (a, b) {
                    const a1 = this.get_node(a);
                    const b1 = this.get_node(b);
                    return (a1.text > b1.text) ? 1 : -1;
                },
                checkbox: {
                    keep_selected_style: false,
                    //three_state: false,
                    deselect_all: true,
                    cascade: 'none'
                },
                types: {
                    levels: {},
                    sheets: {}
                },
                plugins: ['types', 'checkbox', 'sort', 'wholerow'],
            })
            .on('open_node.jstree', (e, data) => {
                const node = data.instance.get_node(data.node, true);
                if (!node) {
                    return;
                }

                node.siblings('.jstree-open').each(function () {
                    data.instance.close_node(this, 0);
                });
            })
            .on('hover_node.jstree', async (e, data) => {
                let level = null;
                if (data.node.type === 'levels') {
                    level = data.node.text;
                } else {
                    level = data.instance.get_node(data.node.parent)?.text;
                }

                this.hoverLevelByName(level);
            })
            .on('dehover_node.jstree', async (e, data) => {
                this.dehoverLevel();
            })
            .on('changed.jstree', async (e, data) => {
                // console.log(e, data);
                if (!data.node || !data.node.type) {
                    return;
                }

                if (data.action === 'select_node') {
                    const sheetLoadedHandler = (result) => {
                        if (!result.model.isPdf()) return;

                        result.model.changePaperVisibility(false);
                    };

                    if (data.node.type === 'sheets') {
                        const sheetIdx = data.node.original.dbId;
                        const levelIdx = data.instance.get_node(data.node.parent).original.dbId;
                        await this.hyperModelingTool.loadSheetFromLevel(levelIdx, sheetIdx, sheetLoadedHandler);
                    } else {
                        const levelIdx = data.node.original.dbId;
                        const sheets = this.hyperModelingTool.getAvailableSheetsForLevel(levelIdx);
                        sheets.forEach(async (sheet, sheetIdx) => {
                            await this.hyperModelingTool.loadSheetFromLevel(levelIdx, sheetIdx, sheetLoadedHandler);
                        });
                    }
                } else {
                    if (data.node.type === 'sheets') {
                        const sheetIdx = data.node.original.dbId;
                        const levelIdx = data.instance.get_node(data.node.parent).original.dbId;

                        const loadedSheet = this.hyperModelingTool.findLoadedSheetFromLevelAndSheetIndex(levelIdx, sheetIdx);
                        this.hyperModelingTool.unloadSheet(loadedSheet);
                    } else {
                        const levelIdx = data.node.original.dbId;
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