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

    function classify(parent, child) {
        if (parent.type === 'outdoor' && child.type === 'indoor') return 'direct_outdoor_to_indoor';
        if (parent.type === 'outdoor' && child.type === 'branch') return 'outdoor_to_first_branch';
        if (parent.type === 'outdoor' && child.type === 'connection_kit') return 'outdoor_to_connection_kit';
        if (parent.type === 'connection_kit' && child.type === 'branch') return 'connection_kit_to_first_branch';
        if (parent.type === 'branch' && child.type === 'branch') return 'branch_to_branch';
        if (parent.type === 'branch' && child.type === 'indoor') return 'branch_to_indoor';
        if (parent.type === 'branch' && child.type === 'bs_unit') return 'branch_to_bs';
        if (parent.type === 'bs_unit' && child.type === 'indoor') return 'bs_to_indoor';
        return 'unclassified';
    }

    function extractSegments(tree) {
        if (!tree || typeof tree !== 'object' || !tree.id) throw new TypeError('tree root with id is required');
        const segments = [];
        const visited = new Set();
        const ids = new Set();
        function walk(node) {
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
                const role = classify(node, child);
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
                walk(child);
            }
        }
        walk(tree);
        return segments;
    }

    /**
     * 主管「候補」を構造上の位置から抽出する。公式の適用区間を確定するものではない。
     * 連結キットがある場合はその下流〜第一分岐を候補とし、
     * 連結キットの上流は候補に含めない。
     * 分岐のない直結系統はメーカー仕様未確認のため空配列を返す。
     */
    function findMainPipeCandidates(tree) {
        const segments = extractSegments(tree);
        const roleSet = new Set(['outdoor_to_first_branch', 'connection_kit_to_first_branch']);
        return segments.filter(segment => roleSet.has(segment.role));
    }

    /**
     * 候補が複数ある系統は確定させず ambiguous とする。
     * この結果は設計選定の許可ではなく、構造の曖昧さを表すだけ。
     */
    function analyzeMainPipeCandidates(tree) {
        const candidates = findMainPipeCandidates(tree);
        return {
            status: candidates.length === 0 ? 'none' : candidates.length === 1 ? 'candidate' : 'ambiguous',
            candidates,
            verified: false
        };
    }

    return { extractSegments, findMainPipeCandidates, analyzeMainPipeCandidates };
});
