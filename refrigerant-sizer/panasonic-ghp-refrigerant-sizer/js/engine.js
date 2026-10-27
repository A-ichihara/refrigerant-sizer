/**
 * Panasonic GHP Refrigerant Piping Calculation Engine
 */

class RefrigerantSizerEngine {
    constructor() {
        // 公式 U-GZ710S1DRE「冷媒配管設計」p2（450～710形・2管式・標準値）。
        // 分岐後の主配管は下流合計容量による。液管は 45.1kW 超の2区分で室外機形式により異なる。
        this.GHP_2PIPE_BRANCH_BANDS = [
            { maxKw: 16.0, liquid: "9.52", gas: "15.88" },
            { maxKw: 28.0, liquid: "9.52", gas: "15.88" },
            { maxKw: 35.5, liquid: "9.52", gas: "22.22" },
            { maxKw: 45.0, liquid: "12.7", gas: "25.4" },
            { maxKw: 56.0, liquid450: "12.7", liquid560_710: "15.88", gas: "28.58" },
            { maxKw: 142.0, liquid450: "12.7", liquid560_710: "15.88", gas: "28.58" },
        ];
        // 室外配管サイズ（室外ユニット接続・主配管LA）は形式固定（同資料 p2）。
        this.GHP_2PIPE_OUTDOOR_SIZES = [
            { kw: 45.0, form: "450形", liquid: "12.7", gas: "28.58" },
            { kw: 56.0, form: "560形", liquid: "15.88", gas: "28.58" },
            { kw: 71.0, form: "710形", liquid: "15.88", gas: "28.58" },
        ];
        // 室内ユニット接続配管（全形式共通、同資料 p2）。
        this.GHP_2PIPE_INDOOR_BANDS = [
            { maxKw: 5.6, liquid: "9.52", gas: "12.7" },
            { maxKw: 16.0, liquid: "9.52", gas: "15.88" },
            { maxKw: 22.4, liquid: "9.52", gas: "19.05" },
            { maxKw: Infinity, liquid: "9.52", gas: "22.22" },
        ];
        // 公式資料の対象形式（450～710形）。355形・850形は同資料の対象外のため、
        // その系統では旧来の未照合テーブルをそのまま用いる（訂正しない）。
        this.GHP_VERIFIED_OUTDOOR_KW = [45.0, 56.0, 71.0];
        this.SERIES_DATABASE = {
            panasonic_ghp_e_series: {
                id: "panasonic_ghp_e_series",
                name: "GHP Eシリーズ (R410A)",
                refrigerant: "R410A",
                // 表1（U-GZ710S1DRE p1、450～710形）：室内機最多24台/系統、L1 実長170m以下。
                maxIndoorUnits: 24,
                maxPipingTotal: 300,
                maxFarDistance: 170,
                outdoorCapacities: [
                    { hp: 13, kw: 35.5, model: "U-P355GE2" },
                    { hp: 16, kw: 45.0, model: "U-P450GE2" },
                    { hp: 20, kw: 56.0, model: "U-P560GE2" },
                    { hp: 25, kw: 71.0, model: "U-P710GE2" },
                    { hp: 30, kw: 85.0, model: "U-P850GE2" }
                ]
            },
            panasonic_ghp_standard: {
                id: "panasonic_ghp_standard",
                name: "GHP 標準マルチ (Fシリーズ)",
                refrigerant: "R410A",
                maxIndoorUnits: 24,
                maxPipingTotal: 250,
                maxFarDistance: 170,
                outdoorCapacities: [
                    { hp: 13, kw: 35.5, model: "U-P355GF2" },
                    { hp: 16, kw: 45.0, model: "U-P450GF2" },
                    { hp: 20, kw: 56.0, model: "U-P560GF2" },
                    { hp: 25, kw: 71.0, model: "U-P710GF2" },
                    { hp: 30, kw: 85.0, model: "U-P850GF2" }
                ]
            },
            panasonic_ghp_cold: {
                id: "panasonic_ghp_cold",
                name: "GHP 寒冷地対応マルチ (Cシリーズ)",
                refrigerant: "R410A",
                maxIndoorUnits: 24,
                maxPipingTotal: 200,
                maxFarDistance: 170,
                outdoorCapacities: [
                    { hp: 13, kw: 35.5, model: "U-P355GC2" },
                    { hp: 16, kw: 45.0, model: "U-P450GC2" },
                    { hp: 20, kw: 56.0, model: "U-P560GC2" },
                    { hp: 25, kw: 71.0, model: "U-P710GC2" }
                ]
            },
            panasonic_ghp_multi_free: {
                id: "panasonic_ghp_multi_free",
                name: "GHP 冷暖同時マルチ (MFシリーズ・3管式)",
                refrigerant: "R410A",
                pipeSystem: "3pipe",
                maxIndoorUnits: 24,
                maxPipingTotal: 300,
                maxFarDistance: 170,
                outdoorCapacities: [
                    { hp: 16, kw: 45.0, model: "U-P450GMF2" },
                    { hp: 20, kw: 56.0, model: "U-P560GMF2" },
                    { hp: 25, kw: 71.0, model: "U-P710GMF2" },
                    { hp: 30, kw: 85.0, model: "U-P850GMF2" }
                ]
            },
            panasonic_ghp_twin_drive: {
                id: "panasonic_ghp_twin_drive",
                name: "GHP ハイブリッド・ツインドライブ (ガス＋電気ハイブリッド)",
                refrigerant: "R410A",
                maxIndoorUnits: 24,
                maxPipingTotal: 250,
                maxFarDistance: 170,
                outdoorCapacities: [
                    { hp: 16, kw: 45.0, model: "U-P450GTD2" },
                    { hp: 20, kw: 56.0, model: "U-P560GTD2" },
                    { hp: 25, kw: 71.0, model: "U-P710GTD2" }
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
            { type: "112型 (4.0馬力相当)", kw: 11.2 },
            { type: "140型 (5.0馬力相当)", kw: 14.0 },
            { type: "160型 (6.0馬力相当)", kw: 16.0 },
            { type: "224型 (8.0馬力相当)", kw: 22.4 },
            { type: "280型 (10.0馬力相当)", kw: 28.0 }
        ];
    }

    getValidIndoorOptions(seriesId, style) { return this.INDOOR_CAPACITIES; }

    calculateSystem(tree, seriesId, enableManualSizeUp = false, gasType = "city_gas_13a") {
        const series = this.SERIES_DATABASE[seriesId] || this.SERIES_DATABASE["panasonic_ghp_e_series"];
        const is3Pipe = series.pipeSystem === '3pipe';
        const warnings = [];
        // メーカー・型式・冷媒・シリーズ別施工条件の正式照合が未完了。
        // 計算が正常終了しても設計上の確定値とはしない。
        warnings.push("【型式・施工基準未照合】このパナソニックGHPアプリの登録型式・冷媒・配管径テーブルは、対象メーカー公式資料との一致確認が完了していません。表示される管径・分岐部材・BOM・許容長の判定を確定設計値として使用せず、対象機種の正式な施工資料で照合してください。");

        this.computeDownstreamCapacities(tree);
        const longestPath = this.findLongestPath(tree);
        // 安全措置: 現行モデルは最長入力実長を基にサイズアップを判定し、室外機ノードだけを変更する。
        // 相当長・メーカー別の対象区間・BOM反映が未検証のため、確定した増径処理は一時停止する。
        // 手動指定も同じ未検証処理へ入るため適用せず、注意表示に留める。
        const forceSizeUp = false;

        if (enableManualSizeUp || longestPath > 90) {
            warnings.push("【サイズアップ未適用】アプリ上の最遠実長合計が90mを超過、または手動指定されています。90mは注意表示のための暫定トリガーであり、メーカー公式の相当長判定ではありません。メーカー別の条件・対象区間・BOM反映が未検証のため増径は適用していません。対象機種の最新公式資料に基づき、主管区間とBOMを確認してください。");
        }

        // 3管式電磁弁キット下流フラグ設定
        this.setBSDownstreamFlags(tree, false);

        this.sizeNodePipes(tree, forceSizeUp, is3Pipe, tree.capacity);
        this.assignModelNumbers(tree, series, tree.capacity);

        const totals = {
            indoorCount: this.countIndoors(tree),
            totalIndoorCapacity: this.getIndoorCapacitySum(tree),
            connectionRatio: (this.getIndoorCapacitySum(tree) / tree.capacity) * 100,
            longestPath,
            totalPipingLength: this.computeTotalPipingLength(tree),
            firstBranchToIndoorMax: this.computeFirstBranchMaxDistance(tree),
            // 表1の制限値（U-GZ710S1DRE p1）。分岐ノードがない系統では判定不可 (null)。
            deltaL: this.computeDeltaL(tree),
            branchPipeMaxLength: this.computeBranchPipeMaxLength(tree),
            liquidPipes: {},
            gasPipes: {},
            highGasPipes: {},
            lowGasPipes: {},
            joints: {}
        };

        this.aggregateBOM(tree, totals, is3Pipe);

        // 表1：接続容量率は 50～200%（130%超は禁止ではなくサイズアップのトリガー。
        // サイズアップは相当長換算表がなく適用停止中のため、ここでは200%超のみ警告する）。
        if (totals.connectionRatio > 200) {
            warnings.push(`接続容量率が 200% (${totals.connectionRatio.toFixed(1)}%) を超過しています。`);
        } else if (totals.connectionRatio < 50) {
            warnings.push(`接続容量率が 50% 未満 (${totals.connectionRatio.toFixed(1)}%) です。`);
        }

        if (totals.indoorCount > series.maxIndoorUnits) {
            warnings.push(`室内機接続台数（${totals.indoorCount}台）が表1の制限（${series.maxIndoorUnits}台/系統）を超過しています。`);
        }

        if (totals.longestPath > series.maxFarDistance) {
            warnings.push(`最遠配管実長（${totals.longestPath.toFixed(1)}m）が表1の上限 ${series.maxFarDistance}m を超過しています。相当長（200m以下）の判定は換算表がないため未実施です。`);
        }

        if (totals.deltaL !== null && totals.deltaL > 70) {
            warnings.push(`第一分岐後の配管長差 ΔL（${totals.deltaL.toFixed(1)}m）が表1の上限 70m を超過しています。`);
        }

        if (totals.branchPipeMaxLength !== null && totals.branchPipeMaxLength > 30) {
            warnings.push(`分岐配管長（最大 ${totals.branchPipeMaxLength.toFixed(1)}m）が表1の上限 30m を超過しています。`);
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

    // 公式 U-GZ710S1DRE p2（450～710形・2管式・標準値）による分岐後の主配管サイズ。
    // 下流合計容量が公式表の上限 142.0kW を超える場合は null を返す（呼び出し側で旧来表へフォールバック）。
    selectGhpBranchPipeSize(cap, outdoorKw) {
        if (cap > 142.0) return null;
        const is450 = Math.abs(outdoorKw - 45.0) < 0.1;
        for (const band of this.GHP_2PIPE_BRANCH_BANDS) {
            if (cap <= band.maxKw) {
                if (band.liquid450 !== undefined) {
                    return { liquid: is450 ? band.liquid450 : band.liquid560_710, gas: band.gas };
                }
                return { liquid: band.liquid, gas: band.gas };
            }
        }
        return null;
    }

    // 公式 U-GZ710S1DRE p2 による室外配管サイズ（形式固定）。対象外の形式では null。
    selectGhpOutdoorPipeSize(outdoorKw) {
        for (const row of this.GHP_2PIPE_OUTDOOR_SIZES) {
            if (Math.abs(row.kw - outdoorKw) < 0.1) return { liquid: row.liquid, gas: row.gas };
        }
        return null;
    }

    // 公式 U-GZ710S1DRE p2 による室内ユニット接続配管サイズ（全形式共通）。
    selectGhpIndoorPipeSize(cap) {
        for (const band of this.GHP_2PIPE_INDOOR_BANDS) {
            if (cap <= band.maxKw) return { liquid: band.liquid, gas: band.gas };
        }
        return { liquid: "9.52", gas: "22.22" };
    }

    // 旧来の2管式テーブル（355形・850形は公式資料の対象外のため未照合のまま残す）。
    selectLegacyTwoPipeSize(cap) {
        if (cap <= 5.6) return { liquid: "6.35", gas: "12.7" };
        if (cap <= 14.0) return { liquid: "9.52", gas: "15.88" };
        if (cap <= 22.4) return { liquid: "9.52", gas: "19.05" };
        if (cap <= 28.0) return { liquid: "9.52", gas: "22.2" };
        if (cap <= 45.0) return { liquid: "12.7", gas: "28.58" };
        if (cap <= 71.0) return { liquid: "15.88", gas: "31.75" };
        return { liquid: "19.05", gas: "38.1" };
    }

    // 第一分岐（室外機の直下の分岐ノード）から各室内機までの経路長の最大・最小の差（ΔL）。
    // 経路長は第一分岐ノード自身の length を含み、室外機ノードの length を含まない。
    // 単一の第一分岐では LA（室外機→第一分岐）が全経路に共通するため差には影響しない。
    // 分岐ノードがない系統では null。経路が1本だけの場合は 0。
    computeDeltaL(tree) {
        if (!tree.children) return null;
        const firstBranches = tree.children.filter(c => c.type === 'branch');
        if (firstBranches.length === 0) return null;
        let lengths = [];
        for (const fb of firstBranches) {
            lengths = lengths.concat(this.collectLeafPathLengths(fb));
        }
        if (lengths.length === 0) return null;
        return Math.max(...lengths) - Math.min(...lengths);
    }

    // ノードから下流の各末端までの経路長（ノード自身の length を含む）の配列。
    collectLeafPathLengths(node) {
        const curLen = node.length || 0;
        if (!node.children || node.children.length === 0) return [curLen];
        let out = [];
        for (const child of node.children) {
            for (const p of this.collectLeafPathLengths(child)) out.push(curLen + p);
        }
        return out;
    }

    // 各分岐配管（第一分岐より下流の辺）の最大長。第一分岐ノード自体の length は
    // 主配管（LA）であり対象外。分岐ノードがない系統では null。
    computeBranchPipeMaxLength(tree) {
        if (!tree.children) return null;
        const firstBranches = tree.children.filter(c => c.type === 'branch');
        if (firstBranches.length === 0) return null;
        let max = null;
        const walk = (node) => {
            const len = node.length || 0;
            if (max === null || len > max) max = len;
            if (node.children) {
                for (const child of node.children) walk(child);
            }
        };
        for (const fb of firstBranches) {
            if (fb.children) {
                for (const child of fb.children) walk(child);
            }
        }
        return max;
    }

    sizeNodePipes(node, forceSizeUp, is3Pipe = false, outdoorKw = null) {
        const cap = node.downstreamCapacity || node.capacity || 0;
        // 公式表の適用は室外機形式（450/560/710形）で決まる。355形・850形は資料対象外。
        const verifiedForm = outdoorKw !== null && this.GHP_VERIFIED_OUTDOOR_KW.some(kw => Math.abs(kw - outdoorKw) < 0.1);

        if (is3Pipe && !node.inBSDownstream && node.type !== 'indoor') {
            // 3管式 (室外機〜電磁弁キット間): 液管、高圧ガス管(吐出)、低圧ガス管(吸入)
            let liquid = "9.52";
            let hlg = "15.88";
            let lg = "19.05";

            if (node.type === 'outdoor') {
                if (cap <= 45.0) { liquid = "12.7"; hlg = "19.05"; lg = "28.58"; }
                else if (cap <= 56.0) { liquid = "15.88"; hlg = "22.2"; lg = "28.58"; }
                else if (cap <= 71.0) { liquid = "19.05"; hlg = "25.4"; lg = "31.75"; }
                else { liquid = "19.05"; hlg = "28.58"; lg = "38.1"; }

                if (forceSizeUp) {
                    if (liquid === "12.7") liquid = "15.88";
                    else if (liquid === "15.88") liquid = "19.05";

                    if (hlg === "19.05") hlg = "22.2";
                    else if (hlg === "22.2") hlg = "25.4";

                    if (lg === "28.58") lg = "31.75";
                    else if (lg === "31.75") lg = "38.1";
                    node.isSizedUp = true;
                }
            } else {
                // 分岐管など
                if (cap <= 16.0) { liquid = "9.52"; hlg = "15.88"; lg = "19.05"; }
                else if (cap <= 22.4) { liquid = "9.52"; hlg = "19.05"; lg = "22.2"; }
                else if (cap <= 28.0) { liquid = "9.52"; hlg = "19.05"; lg = "22.2"; }
                else if (cap <= 45.0) { liquid = "12.7"; hlg = "22.2"; lg = "28.58"; }
                else if (cap <= 71.0) { liquid = "15.88"; hlg = "25.4"; lg = "28.58"; }
                else { liquid = "19.05"; hlg = "28.58"; lg = "31.75"; }
            }

            node.pipeLiquid = liquid;
            node.pipeHighGas = hlg;
            node.pipeLowGas = lg;
            node.pipeGas = undefined;
            node.pipes = { type: '3pipe', liquid, highGas: hlg, lowGas: lg };
        } else {
            // 2管式 (標準または電磁弁キット下流)
            let liquid = "9.52";
            let gas = "15.88";

            if (verifiedForm) {
                // 公式 U-GZ710S1DRE p2（450～710形・2管式・標準値）。
                if (node.type === 'indoor') {
                    ({ liquid, gas } = this.selectGhpIndoorPipeSize(cap));
                } else if (node.type === 'outdoor') {
                    // 室外配管サイズは形式固定で下流容量によらない（D-11）。
                    ({ liquid, gas } = this.selectGhpOutdoorPipeSize(outdoorKw));
                } else {
                    // 分岐後の主配管。公式表の範囲外（142.0kW超）は旧来表へフォールバック。
                    const sized = this.selectGhpBranchPipeSize(cap, outdoorKw);
                    if (sized) {
                        ({ liquid, gas } = sized);
                    } else {
                        ({ liquid, gas } = this.selectLegacyTwoPipeSize(cap));
                    }
                }
            } else if (node.inBSDownstream && node.type === 'indoor') {
                // 旧来値（355形・850形は公式資料の対象外のため未照合のまま）。
                if (cap <= 5.6) { liquid = "6.35"; gas = "12.7"; }
                else if (cap <= 16.0) { liquid = "9.52"; gas = "15.88"; }
                else { liquid = "9.52"; gas = "22.2"; }
            } else {
                ({ liquid, gas } = this.selectLegacyTwoPipeSize(cap));
            }

            if (node.type === 'outdoor' && forceSizeUp) {
                if (liquid === "9.52") liquid = "12.7";
                else if (liquid === "12.7") liquid = "15.88";
                else if (liquid === "15.88") liquid = "19.05";

                if (gas === "15.88") gas = "19.05";
                else if (gas === "19.05") gas = "22.2";
                else if (gas === "22.2") gas = "28.58";
                else if (gas === "28.58") gas = "31.75";
                else if (gas === "31.75") gas = "38.1";
                node.isSizedUp = true;
            }

            node.pipeLiquid = liquid;
            node.pipeGas = gas;
            node.pipeHighGas = undefined;
            node.pipeLowGas = undefined;
            node.pipes = { type: '2pipe', liquid, gas };
        }

        if (node.children) {
            for (const child of node.children) this.sizeNodePipes(child, false, is3Pipe, outdoorKw);
        }
    }

    assignModelNumbers(node, series, outdoorKw = null) {
        if (node.type === 'outdoor') {
            const match = series.outdoorCapacities.find(c => Math.abs(c.kw - node.capacity) < 0.1);
            node.modelNumber = match ? match.model : "U-PCUSTOMG2";
        } else if (node.type === 'indoor') {
            const typeNum = Math.round(node.capacity * 10);
            node.modelNumber = `CS-P${typeNum}GX2`;
        } else if (node.type === 'branch') {
            const cap = node.downstreamCapacity || 0;
            const is3Pipe = series.pipeSystem === '3pipe';
            if (is3Pipe) {
                if (cap <= 28.0) node.jointModel = "CZ-P28F2R";
                else if (cap <= 45.0) node.jointModel = "CZ-P68F2R";
                else node.jointModel = "CZ-P1350F2R";
            } else if (outdoorKw !== null && this.GHP_VERIFIED_OUTDOOR_KW.some(kw => Math.abs(kw - outdoorKw) < 0.1)) {
                // 公式 U-GZ710S1DRE p4 ①分岐管セット（標準条件・450～710形）。
                // 35.6～71.0 は長配管条件（L1相当長＞90m または容量比率＞130%）で SGP-PCH1400K となるが、
                // サイズアップは相当長換算表がなく適用停止中のため標準条件の APR-P680B を用いる。
                if (cap <= 16.0) node.jointModel = "APR-P160B";
                else if (cap <= 35.5) node.jointModel = "APR-P680B";
                else if (cap <= 71.0) node.jointModel = "APR-P680B";
                else node.jointModel = "SGP-PCH1400K";
            } else {
                // 旧来値（355形・850形は公式資料の対象外のため未照合のまま）。
                if (cap <= 22.4) node.jointModel = "CZ-KG22T";
                else if (cap <= 45.0) node.jointModel = "CZ-KG45T";
                else node.jointModel = "CZ-KG71T";
            }
            node.modelNumber = node.jointModel;
        } else if (node.type === 'bs_unit') {
            const cap = node.downstreamCapacity || 0;
            node.modelNumber = cap <= 8.0 ? "CZ-P56HR2" : "CZ-P160HR2";
        }

        if (node.children) {
            for (const child of node.children) this.assignModelNumbers(child, series, outdoorKw);
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
            for (const child of node.children) maxDist = Math.max(maxDist, this.findLongestPath(child));
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
            const model = node.modelNumber || "CZ-P160HR2";
            totals.joints[model] = (totals.joints[model] || 0) + 1;
        }

        if (node.children) {
            for (const child of node.children) this.aggregateBOM(child, totals, is3Pipe);
        }
    }
}
