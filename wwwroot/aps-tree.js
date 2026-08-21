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
export class APSTree {
    constructor(container, options = {}) {
        this.container = typeof container === 'string' ? document.querySelector(container) : container;
        this.options = {
            showCheckboxes: options.showCheckboxes !== false,
            multiSelect: options.multiSelect !== false,
            expandOnClick: options.expandOnClick !== false,
            // APS-specific options
            adaptToPanel: options.adaptToPanel !== false,
            // useViewerTheme: options.useViewerTheme !== false,
            ...options
        };

        this.data = [];
        this.selectedNodes = new Set();
        this.checkedNodes = new Set();
        this.indeterminateNodes = new Set(); // Track half-checked nodes
        this.expandedNodes = new Set();
        this.nodeMap = new Map();

        // APS Viewer integration properties
        this.panel = null;
        this.viewer = options.viewer || null;
        this.resizeObserver = null;

        this.init();
    }

    init() {
        if (!this.container) {
            throw new Error('Container element not found');
        }

        // Add APS-specific CSS classes and namespace
        this.container.className = 'aps-tree-container';
        this.container.innerHTML = '';

        // Inject APS-compatible styles
        this.injectStyles();

        // Create tree wrapper
        this.treeWrapper = document.createElement('div');
        this.treeWrapper.className = 'aps-tree';
        this.container.appendChild(this.treeWrapper);

        // Bind events with proper namespacing
        this.boundHandleClick = this.handleClick.bind(this);
        this.boundHandleResize = this.handleResize.bind(this);

        this.treeWrapper.addEventListener('click', this.boundHandleClick);

        // Setup resize observer for panel changes
        if (this.options.adaptToPanel && window.ResizeObserver) {
            this.resizeObserver = new ResizeObserver(this.boundHandleResize);
            this.resizeObserver.observe(this.container);
        }

        // Detect if we're in a docking panel
        this.detectDockingPanel();
    }

    injectStyles() {
        // Check if styles already injected
        if (document.getElementById('aps-tree-styles')) return;

        const style = document.createElement('style');
        style.id = 'aps-tree-styles';
        style.textContent = `
            /* APS Tree Library Styles - Namespaced to avoid conflicts */
            .aps-tree-container {
                height: 100%;
                overflow: hidden;
                font-family: 'ArtifaktElement', sans-serif;
                font-size: 12px;
                color: #0a131c;
                background-color: rgba(255, 255, 255, 0.94) !important;
            }

            .aps-tree {
                height: 100%;
                overflow-y: auto;
                overflow-x: hidden;
                padding: 8px;
                box-sizing: border-box;
            }

            .aps-tree::-webkit-scrollbar {
                width: 8px;
            }

            .aps-tree::-webkit-scrollbar-track {
                background: rgba(255, 255, 255, 0.1);
            }

            .aps-tree::-webkit-scrollbar-thumb {
                background: rgba(255, 255, 255, 0.3);
                border-radius: 4px;
            }

            .aps-tree::-webkit-scrollbar-thumb:hover {
                background: rgba(255, 255, 255, 0.5);
            }

            .aps-tree-root {
                margin: 0;
                padding: 0;
                list-style: none;
            }

            .aps-tree-node {
                margin: 0;
                padding: 0;
                list-style: none;
            }

            .aps-tree-content {
                display: flex;
                align-items: center;
                padding: 6px 4px;
                cursor: pointer;
                border-radius: 2px;
                transition: background-color 0.15s ease;
                min-height: 24px;
                box-sizing: border-box;
            }

            .aps-tree-content:hover {
                background-color: rgba(255, 255, 255, 0.1);
            }

            .aps-tree-content.selected {
                background-color: lightskyblue;
                color: unset;
            }

            .aps-tree-expand-icon {
                width: 16px;
                height: 16px;
                margin-right: 4px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                border-radius: 2px;
                transition: all 0.15s ease;
                flex-shrink: 0;
            }

            .aps-tree-expand-icon:hover {
                background-color: rgba(255, 255, 255, 0.2);
            }

            .aps-tree-expand-icon::before {
                content: '▶';
                font-size: 12px;
                color: #0a131c;
                transition: transform 0.15s ease;
            }

            .aps-tree-expand-icon.expanded::before {
                transform: rotate(90deg);
            }

            .aps-tree-expand-icon.leaf {
                opacity: 0;
                pointer-events: none;
            }

            .aps-tree-checkbox {
                margin-right: 6px;
                cursor: pointer;
                flex-shrink: 0;
                appearance: none;
                width: 14px;
                height: 14px;
                border: 1px solid #666;
                border-radius: 2px;
                background: transparent;
                position: relative;
            }

            .aps-tree-checkbox:checked {
                background: #0085ff;
                border-color: #0085ff;
            }

            .aps-tree-checkbox:checked::after {
                content: '✓';
                position: absolute;
                top: -1px;
                left: 1px;
                color: white;
                font-size: 13px;
                font-weight: bold;
            }

            .aps-tree-checkbox:indeterminate {
                background: #0085ff;
                border-color: #0085ff;
            }

            .aps-tree-checkbox:indeterminate::after {
                content: '−';
                position: absolute;
                top: -2px;
                left: 2px;
                color: white;
                font-size: 17px;
                font-weight: bold;
            }

            .aps-tree-label {
                flex: 1;
                cursor: pointer;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                line-height: 1.3;
            }

            .aps-tree-children {
                margin-left: 16px;
                padding: 0;
                list-style: none;
                overflow: hidden;
                transition: max-height 0.2s ease-out, opacity 0.2s ease-out;
            }

            .aps-tree-children.collapsed {
                max-height: 0;
                opacity: 0;
            }

            .aps-tree-children.expanded {
                max-height: 2000px;
                opacity: 1;
            }

            /* Panel-specific adjustments */
            .adsk-viewing-viewer .docking-panel .aps-tree-container {
                background: transparent;
            }

            /* Responsive behavior for narrow panels */
            @media (max-width: 300px) {
                .aps-tree-children {
                    margin-left: 12px;
                }
                
                .aps-tree-content {
                    padding: 4px 2px;
                }
                
                .aps-tree-label {
                    font-size: 11px;
                }
            }

            /* Toolbar Styles */
            .aps-tree-toolbar {
                flex-shrink: 0;
                padding: 8px;
                border-top: 1px solid rgba(0, 0, 0, 0.1);
                background-color: rgba(248, 248, 248, 0.95);
                display: flex;
                gap: 8px;
                justify-content: flex-start;
                align-items: center;
                min-height: 40px;
                box-sizing: border-box;

                flex-wrap: wrap;        /* Buttons wrap to next line if needed */
                gap: 6px;              /* Slightly reduced gap to save space */
                width: 100%;           /* Full width of container */
                overflow-x: auto;      /* Horizontal scroll as fallback */
                overflow-y: hidden;    /* Prevent vertical scroll */

                z-index: 1;
                margin-bottom: 70px;
            }

            .aps-tree-toolbar.hidden {
                display: none;
            }

            .aps-tree-toolbar-button {
                padding: 6px 12px;
                border: 1px solid #ccc;
                border-radius: 3px;
                background: #fff;
                color: #333;
                font-size: 12px;
                font-family: 'ArtifaktElement', sans-serif;
                cursor: pointer;
                transition: all 0.15s ease;
                white-space: nowrap;
                text-align: center;
                min-width: 50px;
                max-width: 120px;      /* Maximum width limit */
                flex-shrink: 1;        /* Buttons can shrink if needed */
                overflow: hidden;      /* Hide overflow text */
                text-overflow: ellipsis; /* Show ... for long text */
            }

            .aps-tree-toolbar-button:hover {
                background: #f5f5f5;
                border-color: #999;
            }

            .aps-tree-toolbar-button:active {
                background: #e5e5e5;
                border-color: #666;
            }

            .aps-tree-toolbar-button:disabled {
                opacity: 0.5;
                cursor: not-allowed;
                background: #f9f9f9;
            }

            .aps-tree-toolbar-button.primary {
                background: #0085ff;
                color: white;
                border-color: #0070dd;
            }

            .aps-tree-toolbar-button.primary:hover {
                background: #0070dd;
                border-color: #005bb5;
            }

            .aps-tree-toolbar-button.primary:active {
                background: #005bb5;
                border-color: #004999;
            }

            .aps-tree-toolbar-separator {
                width: 1px;
                height: 20px;
                background: #ddd;
                margin: 0 4px;
            }

            /* Panel Layout for Toolbar Integration */
            .aps-tree-panel-layout {
                height: 100%;
                /*height: 75%;*/
                display: flex;
                flex-direction: column;
            }

            .aps-tree-panel-layout .aps-tree-container {
                flex: 1;
                min-height: 0; /* Important for flex child to shrink properly */
            }
        `;

        document.head.appendChild(style);
    }

    detectDockingPanel() {
        // Try to find the parent docking panel
        let element = this.container.parentElement;
        while (element && !element.classList.contains('docking-panel')) {
            element = element.parentElement;
        }

        if (element) {
            this.panel = element;
            this.setupPanelIntegration();
        }
    }

    setupPanelIntegration() {
        if (!this.panel) return;

        // Listen for panel events if available
        const panelInstance = this.panel.panelInstance;
        if (panelInstance) {
            // Hook into panel resize events
            if (panelInstance.addEventListener) {
                panelInstance.addEventListener('resize', this.boundHandleResize);
            }
        }
    }

    handleResize() {
        // Recalculate tree dimensions
        const containerHeight = this.container.clientHeight;
        const containerWidth = this.container.clientWidth;

        // Trigger custom resize event
        this.trigger('treeResize', { width: containerWidth, height: containerHeight });
    }

    // Placeholder methods for the existing functionality
    setData(data, options = {}) {
        // ... existing implementation
        if (!Array.isArray(data)) {
            throw new Error('Data must be an array');
        }

        this.data = data;
        this.nodeMap.clear();
        this.selectedNodes.clear();
        this.checkedNodes.clear();
        this.indeterminateNodes.clear();
        this.expandedNodes.clear();

        this.buildNodeMap(data);
        this.render();
        return this;
    }

    render() {
        this.treeWrapper.innerHTML = '';
        const ul = document.createElement('ul');
        ul.className = 'aps-tree-root';

        this.data.forEach(node => {
            ul.appendChild(this.createNodeElement(node));
        });

        this.treeWrapper.appendChild(ul);

        // Trigger render complete event
        this.trigger('renderComplete');
    }

    createNodeElement(node) {
        const li = document.createElement('li');
        li.className = 'aps-tree-node';
        li.dataset.nodeId = node.id;

        // Add APS-specific data attributes
        if (node.dbId) li.dataset.dbId = node.dbId;
        if (node.objectType) li.dataset.objectType = node.objectType;

        const content = document.createElement('div');
        content.className = 'aps-tree-content';

        // Expand/collapse icon
        const expandIcon = document.createElement('span');
        expandIcon.className = 'aps-tree-expand-icon';
        expandIcon.dataset.action = 'toggle';

        const hasChildren = node.children && node.children.length > 0;
        if (!hasChildren) {
            expandIcon.classList.add('leaf');
        }

        if (this.expandedNodes.has(node.id)) {
            expandIcon.classList.add('expanded');
        }

        // Checkbox
        if (this.options.showCheckboxes) {
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'aps-tree-checkbox';
            checkbox.dataset.action = 'check';

            // Set checkbox state
            if (this.checkedNodes.has(node.id)) {
                checkbox.checked = true;
                checkbox.indeterminate = false;
            } else if (this.indeterminateNodes.has(node.id)) {
                checkbox.checked = false;
                checkbox.indeterminate = true;
            } else {
                checkbox.checked = false;
                checkbox.indeterminate = false;
            }

            content.appendChild(checkbox);
        }

        // Label
        const label = document.createElement('span');
        label.className = 'aps-tree-label';
        label.textContent = node.label || node.name || node.id;
        label.title = label.textContent;
        label.dataset.action = 'select';

        content.appendChild(expandIcon);
        content.appendChild(label);
        li.appendChild(content);

        // Children
        if (hasChildren) {
            const childrenUl = document.createElement('ul');
            childrenUl.className = 'aps-tree-children';
            childrenUl.classList.add(this.expandedNodes.has(node.id) ? 'expanded' : 'collapsed');

            node.children.forEach(child => {
                childrenUl.appendChild(this.createNodeElement(child));
            });

            li.appendChild(childrenUl);
        }

        // Apply selection state
        if (this.selectedNodes.has(node.id)) {
            content.classList.add('selected');
        }

        return li;
    }

    handleClick(event) {
        const action = event.target.dataset.action;
        const nodeElement = event.target.closest('.aps-tree-node');

        if (!nodeElement || !action) return;

        const nodeId = nodeElement.dataset.nodeId;
        event.stopPropagation();

        switch (action) {
            case 'toggle':
                this.toggleNode(nodeId);
                break;
            case 'select':
                if (this.options.expandOnClick) {
                    this.toggleNode(nodeId);
                }
                this.selectNode(nodeId, event.ctrlKey || event.metaKey);

                // APS Integration: Notify viewer of selection
                if (this.viewer && nodeElement.dataset.dbId) {
                    const dbId = parseInt(nodeElement.dataset.dbId);
                    this.trigger('nodeSelectForViewer', { dbId, nodeId });
                }
                break;
            case 'check':
                this.toggleCheck(nodeId);
                break;
        }
    }

    buildNodeMap(nodes, parent = null) {
        nodes.forEach(node => {
            if (!node.id) {
                throw new Error('Each node must have an id property');
            }

            this.nodeMap.set(node.id, { ...node, parent });

            if (node.children && Array.isArray(node.children)) {
                this.buildNodeMap(node.children, node.id);
            }
        });
    }

    toggleNode(nodeId) {
        const nodeElement = this.treeWrapper.querySelector(`[data-node-id="${nodeId}"]`);
        const childrenUl = nodeElement?.querySelector('.aps-tree-children');
        const expandIcon = nodeElement?.querySelector('.aps-tree-expand-icon');

        if (!childrenUl) return;

        if (this.expandedNodes.has(nodeId)) {
            this.expandedNodes.delete(nodeId);
            childrenUl.classList.remove('expanded');
            childrenUl.classList.add('collapsed');
            expandIcon.classList.remove('expanded');
        } else {
            this.expandedNodes.add(nodeId);
            childrenUl.classList.remove('collapsed');
            childrenUl.classList.add('expanded');
            expandIcon.classList.add('expanded');
        }

        this.trigger('nodeToggle', { nodeId, expanded: this.expandedNodes.has(nodeId) });
    }

    selectNode(nodeId, multiSelect = false) {
        if (!this.options.multiSelect || !multiSelect) {
            // Clear previous selections
            this.selectedNodes.forEach(id => {
                const element = this.treeWrapper.querySelector(`[data-node-id="${id}"] .aps-tree-content`);
                if (element) element.classList.remove('selected');
            });
            this.selectedNodes.clear();
        }

        if (this.selectedNodes.has(nodeId)) {
            this.selectedNodes.delete(nodeId);
            const element = this.treeWrapper.querySelector(`[data-node-id="${nodeId}"] .aps-tree-content`);
            if (element) element.classList.remove('selected');
        } else {
            this.selectedNodes.add(nodeId);
            const element = this.treeWrapper.querySelector(`[data-node-id="${nodeId}"] .aps-tree-content`);
            if (element) element.classList.add('selected');
        }

        this.trigger('nodeSelect', { nodeId, selected: this.selectedNodes.has(nodeId) });
    }

    toggleCheck(nodeId) {
        const checkbox = this.treeWrapper.querySelector(`[data-node-id="${nodeId}"] .aps-tree-checkbox`);
        if (!checkbox) return;

        const wasChecked = this.checkedNodes.has(nodeId);

        if (wasChecked) {
            this.uncheckNodeAndChildren(nodeId);
        } else {
            this.checkNodeAndChildren(nodeId);
        }

        this.updateParentStates(nodeId);

        this.trigger('nodeCheck', {
            nodeId,
            checked: !wasChecked,
            programmatic: false
        });
    }

    checkNodeAndChildren(nodeId) {
        this.checkedNodes.add(nodeId);
        this.indeterminateNodes.delete(nodeId);
        this.updateCheckboxState(nodeId, true, false);

        const node = this.nodeMap.get(nodeId);
        if (node && node.children) {
            this.checkChildrenRecursive(node.children);
        }
    }

    uncheckNodeAndChildren(nodeId) {
        this.checkedNodes.delete(nodeId);
        this.indeterminateNodes.delete(nodeId);
        this.updateCheckboxState(nodeId, false, false);

        const node = this.nodeMap.get(nodeId);
        if (node && node.children) {
            this.uncheckChildrenRecursive(node.children);
        }
    }

    checkChildrenRecursive(children) {
        children.forEach(child => {
            this.checkedNodes.add(child.id);
            this.indeterminateNodes.delete(child.id);
            this.updateCheckboxState(child.id, true, false);

            if (child.children) {
                this.checkChildrenRecursive(child.children);
            }
        });
    }

    uncheckChildrenRecursive(children) {
        children.forEach(child => {
            this.checkedNodes.delete(child.id);
            this.indeterminateNodes.delete(child.id);
            this.updateCheckboxState(child.id, false, false);

            if (child.children) {
                this.uncheckChildrenRecursive(child.children);
            }
        });
    }

    updateParentStates(nodeId) {
        const node = this.nodeMap.get(nodeId);
        if (!node || !node.parent) return;

        const parentNode = this.nodeMap.get(node.parent);
        if (!parentNode || !parentNode.children) return;

        let allChecked = true;
        let noneChecked = true;

        parentNode.children.forEach(child => {
            if (this.checkedNodes.has(child.id)) {
                noneChecked = false;
            } else if (!this.indeterminateNodes.has(child.id)) {
                allChecked = false;
            } else {
                allChecked = false;
                noneChecked = false;
            }
        });

        if (allChecked) {
            this.checkedNodes.add(node.parent);
            this.indeterminateNodes.delete(node.parent);
            this.updateCheckboxState(node.parent, true, false);
        } else if (noneChecked) {
            this.checkedNodes.delete(node.parent);
            this.indeterminateNodes.delete(node.parent);
            this.updateCheckboxState(node.parent, false, false);
        } else {
            this.checkedNodes.delete(node.parent);
            this.indeterminateNodes.add(node.parent);
            this.updateCheckboxState(node.parent, false, true);
        }

        this.updateParentStates(node.parent);
    }

    // APS-specific method to sync with viewer selection
    syncWithViewerSelection(dbIds) {
        if (!Array.isArray(dbIds)) return;

        // Clear current selection
        this.selectedNodes.clear();

        // Find nodes with matching dbIds
        dbIds.forEach(dbId => {
            this.nodeMap.forEach((node, nodeId) => {
                if (node.dbId === dbId) {
                    this.selectedNodes.add(nodeId);
                }
            });
        });

        this.render();
        this.trigger('viewerSyncComplete', { dbIds });
    }

    // Method to get selected dbIds for viewer integration
    getSelectedDbIds() {
        return Array.from(this.selectedNodes)
            .map(nodeId => this.nodeMap.get(nodeId)?.dbId)
            .filter(dbId => dbId !== undefined);
    }

    // Public API Methods (enhanced with bulk operations)
    expandAll() {
        this.nodeMap.forEach((node, nodeId) => {
            if (node.children && node.children.length > 0) {
                this.expandedNodes.add(nodeId);
            }
        });
        this.render();
        return this;
    }

    collapseAll() {
        this.expandedNodes.clear();
        this.render();
        return this;
    }

    getSelectedNodes() {
        return Array.from(this.selectedNodes).map(id => ({
            id,
            node: this.nodeMap.get(id)
        }));
    }

    getCheckedNodes() {
        return Array.from(this.checkedNodes).map(id => ({
            id,
            node: this.nodeMap.get(id)
        }));
    }

    // Enhanced checking methods
    checkNode(nodeId, silent = false) {
        if (!this.nodeMap.has(nodeId)) {
            console.warn(`Node with id "${nodeId}" not found`);
            return this;
        }

        if (!this.checkedNodes.has(nodeId)) {
            this.checkNodeAndChildren(nodeId);
            this.updateParentStates(nodeId);

            if (!silent) {
                this.trigger('nodeCheck', {
                    nodeId,
                    checked: true,
                    programmatic: true
                });
            }
        }
        return this;
    }

    uncheckNode(nodeId, silent = false) {
        if (!this.nodeMap.has(nodeId)) {
            console.warn(`Node with id "${nodeId}" not found`);
            return this;
        }

        if (this.checkedNodes.has(nodeId) || this.indeterminateNodes.has(nodeId)) {
            this.uncheckNodeAndChildren(nodeId);
            this.updateParentStates(nodeId);

            if (!silent) {
                this.trigger('nodeCheck', {
                    nodeId,
                    checked: false,
                    programmatic: true
                });
            }
        }
        return this;
    }

    // Bulk checking operations
    checkNodes(nodeIds, options = {}) {
        const { silent = false, cascade = true } = options;
        const validNodeIds = [];

        // Validate all node IDs first
        nodeIds.forEach(nodeId => {
            if (this.nodeMap.has(nodeId)) {
                validNodeIds.push(nodeId);
            } else {
                console.warn(`Node with id "${nodeId}" not found`);
            }
        });

        // Check all valid nodes
        validNodeIds.forEach(nodeId => {
            if (cascade) {
                this.checkNodeAndChildren(nodeId);
            } else {
                this.checkedNodes.add(nodeId);
                this.indeterminateNodes.delete(nodeId);
                this.updateCheckboxState(nodeId, true, false);
            }
        });

        // Update parent states for all affected nodes
        if (cascade) {
            validNodeIds.forEach(nodeId => {
                this.updateParentStates(nodeId);
            });
        }

        if (!silent && validNodeIds.length > 0) {
            this.trigger('bulkCheck', {
                nodeIds: validNodeIds,
                checked: true,
                programmatic: true
            });
        }

        return this;
    }

    uncheckNodes(nodeIds, options = {}) {
        const { silent = false, cascade = true } = options;
        const validNodeIds = [];

        // Validate all node IDs first
        nodeIds.forEach(nodeId => {
            if (this.nodeMap.has(nodeId)) {
                validNodeIds.push(nodeId);
            } else {
                console.warn(`Node with id "${nodeId}" not found`);
            }
        });

        // Uncheck all valid nodes
        validNodeIds.forEach(nodeId => {
            if (cascade) {
                this.uncheckNodeAndChildren(nodeId);
            } else {
                this.checkedNodes.delete(nodeId);
                this.indeterminateNodes.delete(nodeId);
                this.updateCheckboxState(nodeId, false, false);
            }
        });

        // Update parent states for all affected nodes
        if (cascade) {
            validNodeIds.forEach(nodeId => {
                this.updateParentStates(nodeId);
            });
        }

        if (!silent && validNodeIds.length > 0) {
            this.trigger('bulkCheck', {
                nodeIds: validNodeIds,
                checked: false,
                programmatic: true
            });
        }

        return this;
    }

    // Set initial checked state (useful after tree creation)
    setCheckedNodes(nodeIds, options = {}) {
        const { silent = false, cascade = true } = options;

        // Clear all current states
        this.checkedNodes.clear();
        this.indeterminateNodes.clear();

        // Update all checkboxes to unchecked state
        this.nodeMap.forEach((node, nodeId) => {
            this.updateCheckboxState(nodeId, false, false);
        });

        // Check the specified nodes
        const validNodeIds = [];
        nodeIds.forEach(nodeId => {
            if (this.nodeMap.has(nodeId)) {
                validNodeIds.push(nodeId);
                if (cascade) {
                    this.checkNodeAndChildren(nodeId);
                } else {
                    this.checkedNodes.add(nodeId);
                    this.updateCheckboxState(nodeId, true, false);
                }
            } else {
                console.warn(`Node with id "${nodeId}" not found`);
            }
        });

        // Update all parent states
        if (cascade) {
            validNodeIds.forEach(nodeId => {
                this.updateParentStates(nodeId);
            });
        }

        if (!silent && validNodeIds.length > 0) {
            this.trigger('bulkCheck', {
                nodeIds: validNodeIds,
                checked: true,
                programmatic: true
            });
        }

        return this;
    }

    // Check/uncheck all nodes
    checkAll(options = {}) {
        const { silent = false } = options;
        const allNodeIds = Array.from(this.nodeMap.keys());

        // Only check root nodes - cascade will handle children
        const rootNodeIds = allNodeIds.filter(nodeId => {
            const node = this.nodeMap.get(nodeId);
            return !node.parent;
        });

        return this.checkNodes(rootNodeIds, { silent, cascade: true });
    }

    uncheckAll(options = {}) {
        const { silent = false } = options;

        // Clear all states
        this.checkedNodes.clear();
        this.indeterminateNodes.clear();

        // Update all checkboxes
        this.nodeMap.forEach((node, nodeId) => {
            this.updateCheckboxState(nodeId, false, false);
        });

        if (!silent) {
            this.trigger('bulkCheck', {
                nodeIds: Array.from(this.nodeMap.keys()),
                checked: false,
                programmatic: true
            });
        }

        return this;
    }

    // Helper method to check/uncheck node children recursively
    checkNodeChildren(nodeId, checked) {
        const node = this.nodeMap.get(nodeId);
        if (!node || !node.children) return;

        const checkChildrenRecursive = (children) => {
            children.forEach(child => {
                if (checked) {
                    this.checkedNodes.add(child.id);
                } else {
                    this.checkedNodes.delete(child.id);
                }
                this.updateCheckboxState(child.id, checked);

                if (child.children) {
                    checkChildrenRecursive(child.children);
                }
            });
        };

        checkChildrenRecursive(node.children);
    }

    updateCheckboxState(nodeId, checked, indeterminate = false) {
        const checkbox = this.treeWrapper?.querySelector(`[data-node-id="${nodeId}"] .aps-tree-checkbox`);
        if (checkbox) {
            checkbox.checked = checked;
            checkbox.indeterminate = indeterminate;
        }
    }

    // Check nodes by dbId (APS-specific)
    checkNodesByDbId(dbIds, options = {}) {
        const nodeIds = [];

        dbIds.forEach(dbId => {
            this.nodeMap.forEach((node, nodeId) => {
                if (node.dbId === dbId) {
                    nodeIds.push(nodeId);
                }
            });
        });

        return this.checkNodes(nodeIds, options);
    }

    uncheckNodesByDbId(dbIds, options = {}) {
        const nodeIds = [];

        dbIds.forEach(dbId => {
            this.nodeMap.forEach((node, nodeId) => {
                if (node.dbId === dbId) {
                    nodeIds.push(nodeId);
                }
            });
        });

        return this.uncheckNodes(nodeIds, options);
    }

    // Get checked dbIds (APS-specific)
    getCheckedDbIds() {
        return Array.from(this.checkedNodes)
            .map(nodeId => this.nodeMap.get(nodeId)?.dbId)
            .filter(dbId => dbId !== undefined);
    }

    // Get indeterminate nodes (nodes with some but not all children checked)
    getIndeterminateNodes() {
        return Array.from(this.indeterminateNodes).map(id => ({
            id,
            node: this.nodeMap.get(id)
        }));
    }

    // Check if a node is in any checked state (checked or indeterminate)
    isNodeCheckedOrIndeterminate(nodeId) {
        return this.checkedNodes.has(nodeId) || this.indeterminateNodes.has(nodeId);
    }

    // Get the check state of a node
    getNodeCheckState(nodeId) {
        if (this.checkedNodes.has(nodeId)) return 'checked';
        if (this.indeterminateNodes.has(nodeId)) return 'indeterminate';
        return 'unchecked';
    }

    expandNode(nodeId) {
        if (!this.expandedNodes.has(nodeId)) {
            this.toggleNode(nodeId);
        }
        return this;
    }

    collapseNode(nodeId) {
        if (this.expandedNodes.has(nodeId)) {
            this.toggleNode(nodeId);
        }
        return this;
    }

    showCheckboxes() {
        this.options.showCheckboxes = true;
        this.render();
        return this;
    }

    hideCheckboxes() {
        this.options.showCheckboxes = false;
        this.render();
        return this;
    }

    // Event system
    on(event, callback) {
        if (!this.events) this.events = {};
        if (!this.events[event]) this.events[event] = [];
        this.events[event].push(callback);
        return this;
    }

    trigger(event, data) {
        if (!this.events || !this.events[event]) return;
        this.events[event].forEach(callback => callback(data));
    }

    destroy() {
        if (this.treeWrapper) {
            this.treeWrapper.removeEventListener('click', this.boundHandleClick);
        }

        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }

        if (this.panel && this.panel.panelInstance) {
            const panelInstance = this.panel.panelInstance;
            if (panelInstance.removeEventListener) {
                panelInstance.removeEventListener('resize', this.boundHandleResize);
            }
        }

        if (this.container) {
            this.container.innerHTML = '';
        }

        this.events = {};
        this.panel = null;
        this.viewer = null;

        console.log('APS Tree destroyed and cleaned up');
    }
}

