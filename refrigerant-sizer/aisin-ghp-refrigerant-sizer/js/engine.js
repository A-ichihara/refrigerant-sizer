/**
 * Aisin GHP Refrigerant Piping Calculation Engine
 */

class RefrigerantSizerEngine {
    constructor() {
        this.SERIES_DATABASE = {
            aisin_ghp_xair: {
                id: "aisin_ghp_xair",
                name: "GHP エグゼ (XAIR 7.0シリーズ)",
                refrigerant: "R410A",
                maxIndoorUnits: 36,
                maxPipingTotal: 520,
                maxFarDistance: 170,
                outdoorCapacities: [
                    { hp: 13, kw: 35.5, model: "AXGP355P" },
                    { hp: 16, kw: 45.0, model: "AXGP450P" },
                    { hp: 20, kw: 56.0, model: "AXGP560P" },
                    { hp: 25, kw: 71.0, model: "AXGP710P" },
                    { hp: 30, kw: 85.0, model: "AXGP850P" }
                ]
            },
            aisin_ghp_standard: {
                id: "aisin_ghp_standard",
                name: "GHP 標準マルチシリーズ",
                refrigerant: "R410A",
                maxIndoorUnits: 30,
                maxPipingTotal: 520,
                maxFarDistance: 150,
                outdoorCapacities: [
                    { hp: 13, kw: 35.5, model: "AGP355P" },
                    { hp: 16, kw: 45.0, model: "AGP450P" },
                    { hp: 20, kw: 56.0, model: "AGP560P" },
                    { hp: 25, kw: 71.0, model: "AGP710P" },
                    { hp: 30, kw: 85.0, model: "AGP850P" }
                ]
            },
            aisin_ghp_hybrid: {
                id: "aisin_ghp_hybrid",
                name: "ハイブリッドGHP (スマートマルチ)",
                refrigerant: "R32",
                maxIndoorUnits: 24,
                maxPipingTotal: 520,
                maxFarDistance: 130,
                outdoorCapacities: [
                    { hp: 16, kw: 45.0, model: "AHGP450P" },
                    { hp: 20, kw: 56.0, model: "AHGP560P" },
                    { hp: 25, kw: 71.0, model: "AHGP710P" }
                ]
            },
            aisin_ghp_heat_recovery: {
                id: "aisin_ghp_heat_recovery",
                name: "GHP エグゼ 冷暖同時 (HR仕様・3管式)",
                refrigerant: "R410A",
                pipeSystem: "3pipe",
                maxIndoorUnits: 36,
                maxPipingTotal: 520,
                maxFarDistance: 170,
                outdoorCapacities: [
                    { hp: 16, kw: 45.0, model: "AXGP450PR" },
                    { hp: 20, kw: 56.0, model: "AXGP560PR" },
                    { hp: 25, kw: 71.0, model: "AXGP710PR" },
                    { hp: 30, kw: 85.0, model: "AXGP850PR" }
                ]
            }
        };

        this.INDOOR_STYLES = {
            cassette_4way: { name: "天井カセット4方向" },
            ducted: { name: "天井埋込ダクト形" },
            wall_mounted: { name: "壁掛形" },
            ceiling_suspended: { name: "天井吊形" },
            floor_standing: { name: "床置形" }
        };

        this.INDOOR_CAPACITIES = [
            { type: "22型 (0.8馬力相当)", kw: 2.2 },
            { type: "28型 (1.0馬力相当)", kw: 2.8 },
            { type: "36型 (1.25馬力相当)", kw: 3.6 },
            { type: "45型 (1.6馬力相当)", kw: 4.5 },
            { type: "56型 (2.0馬力相当)", kw: 5.6 },
            { type: "71型 (2.5馬力相当)", kw: 7.1 },
            { type: "80型 (3.0馬力相当)", kw: 8.0 },
            { type: "90型 (3.2馬力相当)", kw: 9.0 },
            { type: "112型 (4.0馬力相当)", kw: 11.2 },
            { type: "140型 (5.0馬力相当)", kw: 14.0 },
            { type: "160型 (6.0馬力相当)", kw: 16.0 },
            { type: "224型 (8.0馬力相当)", kw: 22.4 },
            { type: "280型 (10.0馬力相当)", kw: 28.0 }
        ];
    }

    getValidIndoorOptions(seriesId, style) {
        return this.INDOOR_CAPACITIES;
    }

    calculateSystem(tree, seriesId, enableManualSizeUp = false, gasType = "city_gas_13a") {
        const series = this.SERIES_DATABASE[seriesId] || this.SERIES_DATABASE["aisin_ghp_xair"];
        const is3Pipe = series.pipeSystem === '3pipe';
        const warnings = [];
        // 登録型式と公式シリーズ・冷媒・施工基準の照合が未完了。
        // 計算が正常終了しても正式な設計選定として扱わない。
        warnings.push("【型式・施工基準未照合】このアイシンGHPアプリの登録型式・冷媒・配管径テーブルは、対象メーカー公式資料との一致確認が完了していません。表示される管径・分岐部材・BOM・許容長の判定を確定設計値として使用せず、対象機種の正式な施工資料で照合してください。");
        if (seriesId === "aisin_ghp_hybrid") {
            warnings.push("【ハイブリッドGHP要注意】現行登録型式（AHGP450P等）は、確認済みのアイシン公式Fシリーズ・ハイブリッド型式（GHP: ASGP450F2ZD / EHP: AEGP224F2）と一致しません。GHP+EHP複合系統の配管計算への対応も未確認です。");
        }

        // 1. Calculate downstream capacities
        this.computeDownstreamCapacities(tree);

        // 2. Size pipes for each node
        const longestPath = this.findLongestPath(tree);
        // 安全措置: 現行モデルは最長入力実長を基にサイズアップを判定し、室外機ノードだけを変更する。
        // 相当長・メーカー別の対象区間・BOM反映が未検証のため、確定した増径処理は一時停止する。
        // 手動指定も同じ未検証処理へ入るため適用せず、注意表示に留める。
        const forceSizeUp = false;

        if (enableManualSizeUp || longestPath > 90) {
            warnings.push("【サイズアップ未適用】アプリ上の最遠実長合計が90mを超過、または手動指定されています。90mは注意表示のための暫定トリガーであり、メーカー公式の相当長判定ではありません。メーカー別の条件・対象区間・BOM反映が未検証のため増径は適用していません。対象機種の最新公式資料に基づき、主管区間とBOMを確認してください。");
        }

        // 3管式切換ユニット下流フラグ設定
        this.setBSDownstreamFlags(tree, false);

        this.sizeNodePipes(tree, forceSizeUp, is3Pipe);

        // 3. Model number assignments & Warnings check
        this.assignModelNumbers(tree, series);

        const totals = {
            indoorCount: this.countIndoors(tree),
            totalIndoorCapacity: this.getIndoorCapacitySum(tree),
            connectionRatio: (this.getIndoorCapacitySum(tree) / tree.capacity) * 100,
            longestPath,
            totalPipingLength: this.computeTotalPipingLength(tree),
            firstBranchToIndoorMax: this.computeFirstBranchMaxDistance(tree),
            liquidPipes: {},
            gasPipes: {},
            highGasPipes: {},
            lowGasPipes: {},
            joints: {}
        };

        this.aggregateBOM(tree, totals, is3Pipe);

        if (totals.connectionRatio > 130) {
            warnings.push(`接続容量率が 130% (${totals.connectionRatio.toFixed(1)}%) を超過しています。`);
        } else if (totals.connectionRatio < 50) {
            warnings.push(`接続容量率が 50% 未満 (${totals.connectionRatio.toFixed(1)}%) です。`);
        }

        if (totals.totalPipingLength > series.maxPipingTotal) {
            warnings.push(`総配管実長 (${totals.totalPipingLength.toFixed(1)}m) が制限 (${series.maxPipingTotal}m) を超過しています。`);
        }

        return { tree, totals, warnings, is3Pipe };
    }

    setBSDownstreamFlags(node, inBSDownstream = false) {
        if (node.type === 'bs_unit') {
            node.inBSDownstream = false;
            if (node.children) {
                node.children.forEach(c => this.setBSDownstreamFlags(c, true));
            }
        } else {
            node.inBSDownstream = inBSDownstream;
            if (node.children) {
                node.children.forEach(c => this.setBSDownstreamFlags(c, inBSDownstream));
            }
        }
    }

    computeDownstreamCapacities(node) {
        if (node.type === 'indoor') {
            node.downstreamCapacity = node.capacity;
            return node.capacity;
        }

        let sum = 0;
        if (node.children && node.children.length > 0) {
            for (const child of node.children) {
                sum += this.computeDownstreamCapacities(child);
            }
        }
        node.downstreamCapacity = sum;
        return sum;
    }

    // 公式の管径表（D1 カタログ p.223「冷媒配管サイズ選定」）。
    // 値はコードのインチ表記で保持する（15.88＝15.9、28.58＝28.6、31.75＝31.8、
    // 19.05＝19.1、9.52＝9.5 と同一呼び径。報告書 §1 の表記ゆれの扱い）。
    // 3管式の pipeHighGas＝高低圧ガス管、pipeLowGas＝吸入ガス管（報告書 §2.3）。

    // 主管（2管式）を室外機定格容量で選定する。該当なしは null。
    selectMainPipe2Pipe(outdoorKw) {
        const table = [
            { kw: 22.4, liquid: "9.52", gas: "19.05" },
            { kw: 28.0, liquid: "9.52", gas: "22.2" },
            { kw: 35.5, liquid: "12.7", gas: "25.4" },
            { kw: 45.0, liquid: "15.88", gas: "28.58" },
            { kw: 56.0, liquid: "15.88", gas: "28.58" },
            { kw: 71.0, liquid: "15.88", gas: "31.75" },
            { kw: 85.0, liquid: "19.05", gas: "31.75" }
        ];
        const row = table.find(r => Math.abs(r.kw - outdoorKw) < 0.1);
        return row ? { liquid: row.liquid, gas: row.gas } : null;
    }

    // 主管（冷暖フリー・3管式）を室外機定格容量で選定する。該当なしは null。
    // 公式に存在するのは 560・710・850形のみ（450形の冷暖フリーは存在しない）。
    selectMainPipe3Pipe(outdoorKw) {
        const table = [
            { kw: 56.0, liquid: "15.88", highGas: "22.2", lowGas: "28.58" },
            { kw: 71.0, liquid: "19.05", highGas: "25.4", lowGas: "31.75" },
            { kw: 85.0, liquid: "19.05", highGas: "28.58", lowGas: "31.75" }
        ];
        const row = table.find(r => Math.abs(r.kw - outdoorKw) < 0.1);
        return row ? { liquid: row.liquid, highGas: row.highGas, lowGas: row.lowGas } : null;
    }

    // 分岐〜分岐（2管式）を下流合計容量で選定する。境界は公式の「未満」どおり。
    selectBranchPipe2Pipe(cap) {
        if (cap < 22.4) return { liquid: "9.52", gas: "15.88" };
        if (cap < 33.0) return { liquid: "9.52", gas: "22.2" };
        if (cap < 47.0) return { liquid: "12.7", gas: "28.58" };
        if (cap < 71.0) return { liquid: "15.88", gas: "28.58" };
        if (cap < 104.0) return { liquid: "19.05", gas: "31.75" };
        return { liquid: "19.05", gas: "38.1" };
    }

    // 分岐〜分岐・BSユニット（冷暖フリー・3管式）を下流合計容量で選定する。
    selectBranchPipe3Pipe(cap) {
        if (cap < 16.0) return { liquid: "9.52", highGas: "12.7", lowGas: "15.88" };
        if (cap < 22.4) return { liquid: "9.52", highGas: "15.88", lowGas: "19.05" };
        if (cap < 33.0) return { liquid: "9.52", highGas: "19.05", lowGas: "22.2" };
        if (cap < 47.0) return { liquid: "12.7", highGas: "19.05", lowGas: "28.58" };
        if (cap < 71.0) return { liquid: "15.88", highGas: "25.4", lowGas: "28.58" };
        if (cap < 104.0) return { liquid: "19.05", highGas: "25.4", lowGas: "31.75" };
        return { liquid: "19.05", highGas: "28.58", lowGas: "38.1" };
    }

    // 分岐・BSユニット〜室内ユニットを室内機容量で選定する。
    selectIndoorPipe(cap) {
        if (cap <= 5.6) return { liquid: "6.35", gas: "12.7" };
        if (cap <= 16.0) return { liquid: "9.52", gas: "15.88" };
        if (cap <= 22.4) return { liquid: "9.52", gas: "19.05" };
        return { liquid: "12.7", gas: "22.2" };
    }

    sizeNodePipes(node, forceSizeUp, is3Pipe = false) {
        // forceSizeUp は現在つねに false（calculateSystem で停止中）。
        // 公式のサイズアップは形式ごとの対応表（D1 p.223）であり、相当長換算データが
        // D1・D4 にないため実装できない。旧来のラダー式の増径ロジックは公式の仕組みと
        // 異なる（φ25.4 の段がない等）ため除去し、増径は適用しない。
        const cap = node.downstreamCapacity || node.capacity || 0;

        if (node.type === 'outdoor') {
            // 主管は室外機形式（定格容量）で選定する（公式 D1 p.223）。
            // 下流合計容量では選ばない。
            if (is3Pipe) {
                const main = this.selectMainPipe3Pipe(node.capacity || 0);
                if (main) {
                    node.pipeLiquid = main.liquid;
                    node.pipeHighGas = main.highGas;
                    node.pipeLowGas = main.lowGas;
                    node.pipeGas = undefined;
                    node.pipes = { type: '3pipe', liquid: main.liquid, highGas: main.highGas, lowGas: main.lowGas };
                } else {
                    // 450形冷暖フリーは公式に存在しない。旧来の≤45帯を維持し、未照合として記録する。
                    node.pipeLiquid = "12.7";
                    node.pipeHighGas = "19.05";
                    node.pipeLowGas = "28.58";
                    node.pipeGas = undefined;
                    node.pipes = { type: '3pipe', liquid: "12.7", highGas: "19.05", lowGas: "28.58" };
                }
            } else {
                const main = this.selectMainPipe2Pipe(node.capacity || 0);
                if (main) {
                    node.pipeLiquid = main.liquid;
                    node.pipeGas = main.gas;
                    node.pipeHighGas = undefined;
                    node.pipeLowGas = undefined;
                    node.pipes = { type: '2pipe', liquid: main.liquid, gas: main.gas };
                } else {
                    // 未登録の室外機容量は旧来どおり分岐表で選定する（フォールバック。未照合）。
                    const branch = this.selectBranchPipe2Pipe(cap);
                    node.pipeLiquid = branch.liquid;
                    node.pipeGas = branch.gas;
                    node.pipeHighGas = undefined;
                    node.pipeLowGas = undefined;
                    node.pipes = { type: '2pipe', liquid: branch.liquid, gas: branch.gas };
                }
            }
        } else if (is3Pipe && !node.inBSDownstream && node.type !== 'indoor') {
            // 3管式の分岐等（分岐・BSユニット本体）。公式 D1 p.223「分岐〜分岐・BSユニット」。
            const branch = this.selectBranchPipe3Pipe(cap);
            node.pipeLiquid = branch.liquid;
            node.pipeHighGas = branch.highGas;
            node.pipeLowGas = branch.lowGas;
            node.pipeGas = undefined;
            node.pipes = { type: '3pipe', liquid: branch.liquid, highGas: branch.highGas, lowGas: branch.lowGas };
        } else {
            // 2管式（または3管式のBSユニット下流）
            let liquid = "9.52";
            let gas = "15.88";
            if (node.type === 'indoor') {
                // 室内機接続配管。公式 D1 p.223「分岐・BSユニット〜室内ユニット」。
                const indoor = this.selectIndoorPipe(cap);
                liquid = indoor.liquid;
                gas = indoor.gas;
            } else {
                // 分岐（BSユニット本体を含む）。公式 D1 p.223「分岐〜分岐」。
                const branch = this.selectBranchPipe2Pipe(cap);
                liquid = branch.liquid;
                gas = branch.gas;
            }
            node.pipeLiquid = liquid;
            node.pipeGas = gas;
            node.pipeHighGas = undefined;
            node.pipeLowGas = undefined;
            node.pipes = { type: '2pipe', liquid, gas };
        }

        if (node.children) {
            for (const child of node.children) {
                this.sizeNodePipes(child, false, is3Pipe);
            }
        }
    }

    // 分岐管の選定（公式 D1 p.223）。
    // 第一分岐は室外機形式、第二分岐以降は下流合計容量で選定する。
    selectFirstBranchJoint(outdoorKw, is3Pipe) {
        if (is3Pipe) {
            return outdoorKw <= 56.0 ? "ABP-AS72FY01" : "ABP-AS104FY01";
        }
        if (outdoorKw <= 28.0) return "ABP-AS33Y01";
        if (outdoorKw <= 56.0) return "ABP-AS72Y01";
        return "ABP-AS104Y01";
    }

    selectLaterBranchJoint(cap, is3Pipe) {
        if (is3Pipe) {
            if (cap < 22.4) return "ABP-AS22FY01";
            if (cap < 33.0) return "ABP-AS33FY01";
            if (cap < 71.0) return "ABP-AS72FY01";
            if (cap < 104.0) return "ABP-AS104FY01";
            // 公式表に3管式の104.0kW以上の継手はない。最大の3管式継手を
            // フォールバックとして用いる（未照合）。
            return "ABP-AS104FY01";
        }
        if (cap < 22.4) return "ABP-AS22Y01";
        if (cap < 33.0) return "ABP-AS33Y01";
        if (cap < 71.0) return "ABP-AS72Y01";
        if (cap < 104.0) return "ABP-AS104Y01";
        return "ABP-AS218Y01";
    }

    assignModelNumbers(node, series, outdoorKw = null, isFirstBranch = false) {
        if (node.type === 'outdoor') {
            const match = series.outdoorCapacities.find(c => Math.abs(c.kw - node.capacity) < 0.1);
            node.modelNumber = match ? match.model : "AGP-CUSTOM";
            outdoorKw = node.capacity;
        } else if (node.type === 'indoor') {
            const typeNum = Math.round(node.capacity * 10);
            node.modelNumber = `AYP-P${typeNum}F`;
        } else if (node.type === 'branch') {
            const cap = node.downstreamCapacity || 0;
            const is3Pipe = series.pipeSystem === '3pipe';
            if (isFirstBranch && outdoorKw != null) {
                node.jointModel = this.selectFirstBranchJoint(outdoorKw, is3Pipe);
            } else {
                node.jointModel = this.selectLaterBranchJoint(cap, is3Pipe);
            }
            node.modelNumber = node.jointModel;
        } else if (node.type === 'bs_unit') {
            // BSユニットの選定規則は取得した公式資料にないため、旧来の型式・区分を
            // 変更せず未照合として記録する（報告書 §6.1）。
            const cap = node.downstreamCapacity || 0;
            node.modelNumber = cap <= 8.0 ? "MSU-P80A" : "MSU-P160A";
        }

        if (node.children) {
            for (const child of node.children) {
                // 室外機の直下の分岐が第一分岐。それ以外は第二分岐以降。
                this.assignModelNumbers(child, series, outdoorKw, node.type === 'outdoor');
            }
        }
    }

    countIndoors(node) {
        if (node.type === 'indoor') return 1;
        let count = 0;
        if (node.children) {
            for (const child of node.children) count += this.countIndoors(child);
        }
        return count;
    }

    getIndoorCapacitySum(node) {
        if (node.type === 'indoor') return node.capacity;
        let sum = 0;
        if (node.children) {
            for (const child of node.children) sum += this.getIndoorCapacitySum(child);
        }
        return sum;
    }

    findLongestPath(node) {
        const curLen = node.length || 0;
        if (!node.children || node.children.length === 0) return curLen;
        let maxChild = 0;
        for (const child of node.children) {
            maxChild = Math.max(maxChild, this.findLongestPath(child));
        }
        return curLen + maxChild;
    }

    computeTotalPipingLength(node) {
        let total = node.length || 0;
        if (node.children) {
            for (const child of node.children) total += this.computeTotalPipingLength(child);
        }
        return total;
    }

    computeFirstBranchMaxDistance(node) {
        if (node.type === 'outdoor' && node.children && node.children.length > 0) {
            let maxDist = 0;
            for (const child of node.children) {
                maxDist = Math.max(maxDist, this.findLongestPath(child));
            }
            return maxDist;
        }
        return this.findLongestPath(node);
    }

    aggregateBOM(node, totals, is3Pipe = false) {
        if (node.type !== 'outdoor') {
            const len = node.length || 0;
            if (node.pipeLiquid) totals.liquidPipes[node.pipeLiquid] = (totals.liquidPipes[node.pipeLiquid] || 0) + len;
            if (node.pipeGas) totals.gasPipes[node.pipeGas] = (totals.gasPipes[node.pipeGas] || 0) + len;
            if (node.pipeHighGas) totals.highGasPipes[node.pipeHighGas] = (totals.highGasPipes[node.pipeHighGas] || 0) + len;
            if (node.pipeLowGas) totals.lowGasPipes[node.pipeLowGas] = (totals.lowGasPipes[node.pipeLowGas] || 0) + len;
        }
        if (node.jointModel) totals.joints[node.jointModel] = (totals.joints[node.jointModel] || 0) + 1;
        if (node.type === 'bs_unit') {
            const model = node.modelNumber || "MSU-P160A";
            totals.joints[model] = (totals.joints[model] || 0) + 1;
        }

        if (node.children) {
            for (const child of node.children) this.aggregateBOM(child, totals, is3Pipe);
        }
    }
}
