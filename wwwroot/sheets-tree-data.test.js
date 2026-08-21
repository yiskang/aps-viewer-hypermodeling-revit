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
