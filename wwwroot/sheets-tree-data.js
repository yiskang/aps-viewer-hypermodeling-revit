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
