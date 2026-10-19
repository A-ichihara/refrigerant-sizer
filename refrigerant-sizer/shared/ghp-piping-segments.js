/**
 * GHP系統ツリー -> 配管区間の読み取り専用変換。
 * 計算エンジン/既存保存JSONを変更しない。メーカー別の管径判定は実施しない。
 * 各ノードの length は親ノードから当該ノードまでの配管実長[m]。
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.GhpPipingSegments = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    function classify(parent, child, beforeFirstBranch) {
        if (parent.type === 'bs_unit') return 'bs_to_indoor';
        if (child.type === 'bs_unit') return 'branch_to_bs';
        if (parent.type === 'outdoor' && child.type === 'indoor') return 'direct_outdoor_to_indoor';
        if (parent.type === 'outdoor' && child.type === 'branch') return 'outdoor_to_first_branch';
        if (parent.type === 'outdoor' && child.type === 'connection_kit') return 'outdoor_to_connection_kit';
        if (parent.type === 'connection_kit' && child.type === 'branch') return 'connection_kit_to_first_branch';
        if (parent.type === 'branch' && child.type === 'indoor') return 'branch_to_indoor';
        if (parent.type === 'branch' && child.type === 'branch') return 'branch_to_branch';
        if (beforeFirstBranch && child.type === 'branch') return 'outdoor_to_first_branch';
        return 'unclassified';
    }

    function extractSegments(tree) {
        if (!tree || typeof tree !== 'object' || !tree.id) throw new TypeError('tree root with id is required');
        const segments = [];
        const visited = new Set();
        const ids = new Set();
        function walk(node, beforeFirstBranch) {
            if (!node || typeof node !== 'object' || !node.id) throw new TypeError('every node needs an id');
            if (visited.has(node)) throw new Error('cycle or reused node detected');
            if (ids.has(String(node.id))) throw new Error('duplicate node id: ' + node.id);
            visited.add(node);
            ids.add(String(node.id));
            for (const child of node.children || []) {
                if (!child || typeof child !== 'object' || !child.id) throw new TypeError('every child needs an id');
                const length = child.length == null ? 0 : child.length;
                if (typeof length !== 'number' || !Number.isFinite(length) || length < 0) {
                    throw new RangeError('invalid pipe length for ' + child.id);
                }
                const role = classify(node, child, beforeFirstBranch);
                segments.push({
                    id: String(node.id) + '->' + String(child.id),
                    fromNodeId: String(node.id),
                    toNodeId: String(child.id),
                    actualLengthM: length,
                    equivalentLengthM: null,
                    role,
                    refrigerantCircuit: child.inBSDownstream ? 'two_pipe' : null,
                    pipeSize: null,
                    sizeUpRule: null,
                    sourceDocument: null
                });
                walk(child, beforeFirstBranch && child.type !== 'branch');
            }
        }
        walk(tree, true);
        return segments;
    }

    return { extractSegments };
});
