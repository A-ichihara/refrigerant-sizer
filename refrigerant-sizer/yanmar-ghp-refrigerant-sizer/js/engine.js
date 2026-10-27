/**
 * Yanmar GHP Refrigerant Piping Calculation Engine
 */

class RefrigerantSizerEngine {
    constructor() {
        this.SERIES_DATABASE = {
            yanmar_ghp_highpower: {
                id: "yanmar_ghp_highpower",
                name: "GHP ハイパワーエグゼ (R410A)",
                refrigerant: "R410A",
                maxIndoorUnits: 36,
                maxPipingTotal: 640,
                maxFarDistance: 170,
                outdoorCapacities: [
                    { hp: 13, kw: 35.5, model: "YG-355HP" },
                    { hp: 16, kw: 45.0, model: "YG-450HP" },
                    { hp: 20, kw: 56.0, model: "YG-560HP" },
                    { hp: 25, kw: 71.0, model: "YG-710HP" },
                    { hp: 30, kw: 85.0, model: "YG-850HP" }
                ]
            },
            yanmar_ghp_standard: {
                id: "yanmar_ghp_standard",
                name: "GHP 標準マルチ (Jシリーズ)",
                refrigerant: "R410A",
                maxIndoorUnits: 30,
                maxPipingTotal: 640,
                maxFarDistance: 170,
                outdoorCapacities: [
                    { hp: 13, kw: 35.5, model: "YG-355J" },
                    { hp: 16, kw: 45.0, model: "YG-450J" },
                    { hp: 20, kw: 56.0, model: "YG-560J" },
                    { hp: 25, kw: 71.0, model: "YG-710J" },
                    { hp: 30, kw: 85.0, model: "YG-850J" }
                ]
            },
            yanmar_ghp_chiller: {
                id: "yanmar_ghp_chiller",
                name: "GHP チラー / 寒冷地対応マルチ",
                refrigerant: "R410A",
                maxIndoorUnits: 24,
                maxPipingTotal: 640,
                maxFarDistance: 170,
                outdoorCapacities: [
                    { hp: 16, kw: 45.0, model: "YGC-450W" },
                    { hp: 20, kw: 56.0, model: "YGC-560W" },
                    { hp: 25, kw: 71.0, model: "YGC-710W" }
                ]
            },
            yanmar_ghp_exe_captor: {
                id: "yanmar_ghp_exe_captor",
                name: "GHP エグゼキャプター (冷暖同時・HR仕様・3管式)",
                refrigerant: "R410A",
                pipeSystem: "3pipe",
                maxIndoorUnits: 36,
                maxPipingTotal: 640,
                maxFarDistance: 170,
                outdoorCapacities: [
                    { hp: 16, kw: 45.0, model: "YHR-450EC" },
                    { hp: 20, kw: 56.0, model: "YHR-560EC" },
                    { hp: 25, kw: 71.0, model: "YHR-710EC" },
                    { hp: 30, kw: 85.0, model: "YHR-850EC" }
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
        const series = this.SERIES_DATABASE[seriesId] || this.SERIES_DATABASE["yanmar_ghp_highpower"];
        const is3Pipe = series.pipeSystem === '3pipe';
        const warnings = [];
        // メーカー・型式・冷媒・シリーズ別施工条件の正式照合が未完了。
        // 計算が正常終了しても設計上の確定値とはしない。
        warnings.push("【型式・施工基準未照合】このヤンマーGHPアプリの登録型式・冷媒・配管径テーブルは、対象メーカー公式資料との一致確認が完了していません。表示される管径・分岐部材・BOM・許容長の判定を確定設計値として使用せず、対象機種の正式な施工資料で照合してください。");

        this.computeDownstreamCapacities(tree);
        const longestPath = this.findLongestPath(tree);
        // 安全措置: 現行モデルは最長入力実長を基にサイズアップを判定し、室外機ノードだけを変更する。
        // 相当長・メーカー別の対象区間・BOM反映が未検証のため、確定した増径処理は一時停止する。
        // 手動指定も同じ未検証処理へ入るため適用せず、注意表示に留める。
        const forceSizeUp = false;

        if (enableManualSizeUp || longestPath > 90) {
            warnings.push("【サイズアップ未適用】アプリ上の最遠実長合計が90mを超過、または手動指定されています。90mは注意表示のための暫定トリガーであり、メーカー公式の相当長判定ではありません。メーカー別の条件・対象区間・BOM反映が未検証のため増径は適用していません。対象機種の最新公式資料に基づき、主管区間とBOMを確認してください。");
        }

        // 3管式切換弁ユニット下流フラグ設定
        this.setBSDownstreamFlags(tree, false);

        this.sizeNodePipes(tree, forceSizeUp, is3Pipe);
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

        // 第一分岐後の許容長さは公式 90m 以下（2022.09 GHP総合カタログ 5-1・5-2）。
        // totals.firstBranchToIndoorMax は第一分岐から最遠室内機までの実長。
        if (totals.firstBranchToIndoorMax > 90) {
            warnings.push(`第一分岐後の配管長 (${totals.firstBranchToIndoorMax.toFixed(1)}m) が制限 (90m) を超過しています。`);
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

    sizeNodePipes(node, forceSizeUp, is3Pipe = false) {
        // 公式の主管は室外機定格容量で選定する（2022.09 GHP総合カタログ 5-1 (a)）。
        // 室外機ノードでは node.capacity（定格容量）を使い、下流室内機合計容量
        // （downstreamCapacity）で選定してはならない。定格容量が不明な場合のみ
        // 従来どおり下流合計にフォールバックする。
        const ratedCap = (typeof node.capacity === 'number' && Number.isFinite(node.capacity) && node.capacity > 0)
            ? node.capacity : null;
        const cap = node.downstreamCapacity || node.capacity || 0;

        if (is3Pipe && !node.inBSDownstream && node.type !== 'indoor') {
            // 3管式 (室外機〜切換弁ユニット間): 液管、高圧ガス管、低圧ガス管
            let liquid = "9.52";
            let hlg = "15.88";
            let lg = "19.05";

            if (node.type === 'outdoor') {
                const ocap = ratedCap !== null ? ratedCap : cap;
                if (ocap <= 45.0) { liquid = "12.7"; hlg = "19.05"; lg = "28.58"; }
                else if (ocap <= 56.0) { liquid = "15.88"; hlg = "22.2"; lg = "28.58"; }
                else if (ocap <= 71.0) { liquid = "19.05"; hlg = "25.4"; lg = "31.75"; }
                // 85.0kW: 吸入ガスは公式 φ31.8（31.75と同径表記）。旧来の 38.1 は誤り。
                else { liquid = "19.05"; hlg = "28.58"; lg = "31.75"; }

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
                // 分岐管など — 5-2［冷媒配管サイズの選定］表の本体がテキスト抽出から
                // 読めなかったため未検証。旧来値のまま変更しない。
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
            // 2管式 (標準または切換弁ユニット下流)
            // 公式は区間ごとに表を分ける（5-1）。旧来の1表を区間別に分離する。
            let liquid = "9.52";
            let gas = "15.88";

            if (node.inBSDownstream && node.type === 'indoor') {
                // 切換弁ユニット下流の室内機 — 旧来値のまま（5-2表未読のため未検証。
                // P224のガス19.1は暫定のため適用しない）。
                if (cap <= 5.6) { liquid = "6.35"; gas = "12.7"; }
                else if (cap <= 16.0) { liquid = "9.52"; gas = "15.88"; }
                else { liquid = "9.52"; gas = "22.2"; }
            } else if (node.type === 'outdoor') {
                // 主管（室外機〜冷媒分岐キット間）: 室外機定格容量で選定（5-1 (a)）。
                // カタログ表記 φ15.9/19.1/28.6/31.8 はコードの 15.88/19.05/28.58/31.75 と同径。
                const ocap = ratedCap !== null ? ratedCap : cap;
                if (ocap <= 14.0) { liquid = "9.52"; gas = "15.88"; }
                else if (ocap <= 22.4) { liquid = "9.52"; gas = "19.05"; }
                else if (ocap <= 28.0) { liquid = "9.52"; gas = "22.2"; }
                else if (ocap <= 35.5) { liquid = "12.7"; gas = "25.4"; }
                else if (ocap <= 45.0) { liquid = "12.7"; gas = "28.58"; }
                else if (ocap <= 56.0) { liquid = "15.88"; gas = "28.58"; }
                else { liquid = "19.05"; gas = "31.75"; }
            } else if (node.type === 'branch' && !node.inBSDownstream) {
                // 枝管（冷媒分岐キット間）: 下流室内機合計容量で選定（5-1 (b)）。
                if (cap < 22.4) { liquid = "9.52"; gas = "15.88"; }
                else if (cap < 33.0) { liquid = "9.52"; gas = "22.2"; }
                else if (cap < 47.0) { liquid = "12.7"; gas = "28.58"; }
                else if (cap < 71.0) { liquid = "15.88"; gas = "28.58"; }
                else { liquid = "19.05"; gas = "31.75"; }
            } else if (node.type === 'indoor' && !node.inBSDownstream) {
                // 分岐キット〜室内機間: 室内機容量で選定（5-1 (c)）。
                if (cap <= 5.6) { liquid = "6.35"; gas = "12.7"; }
                else if (cap <= 16.0) { liquid = "9.52"; gas = "15.88"; }
                else if (cap <= 22.4) { liquid = "9.52"; gas = "19.05"; }
                else if (cap <= 28.0) { liquid = "9.52"; gas = "22.2"; }
                else if (cap <= 35.5) { liquid = "12.7"; gas = "28.58"; }
                else if (cap <= 45.0) { liquid = "12.7"; gas = "28.58"; }
                else if (cap <= 56.0) { liquid = "15.88"; gas = "28.58"; }
                else { liquid = "19.05"; gas = "31.75"; }
            } else {
                // 切換弁ユニット下流の分岐等（3管式）: 5-2表が読めないため未検証。
                // 旧来の区分表のまま変更しない。
                if (cap <= 5.6) { liquid = "6.35"; gas = "12.7"; }
                else if (cap <= 14.0) { liquid = "9.52"; gas = "15.88"; }
                else if (cap <= 22.4) { liquid = "9.52"; gas = "19.05"; }
                else if (cap <= 28.0) { liquid = "9.52"; gas = "22.2"; }
                else if (cap <= 45.0) { liquid = "12.7"; gas = "28.58"; }
                else if (cap <= 71.0) { liquid = "15.88"; gas = "31.75"; }
                else { liquid = "19.05"; gas = "38.1"; }
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
            for (const child of node.children) this.sizeNodePipes(child, false, is3Pipe);
        }
    }

    // 公式の分岐管・BSユニット型番に訂正する（2022.09 GHP総合カタログ 5-1 (e)・5-2）。
    // 室外機・室内機の型番は公式カタログに現れないため変更しない（未決事項参照）。
    assignModelNumbers(node, series, isFirstBranch = false, outdoorKw = null) {
        if (node.type === 'outdoor') {
            const match = series.outdoorCapacities.find(c => Math.abs(c.kw - node.capacity) < 0.1);
            node.modelNumber = match ? match.model : "YG-CUSTOM";
        } else if (node.type === 'indoor') {
            const typeNum = Math.round(node.capacity * 10);
            node.modelNumber = `YNP-P${typeNum}F`;
        } else if (node.type === 'branch') {
            const cap = node.downstreamCapacity || 0;
            const is3Pipe = series.pipeSystem === '3pipe';
            if (is3Pipe) {
                // 第1分岐は室外機型式で決まる。560K1 → RBPP72FY、850K1 → RBPP104FY。
                // 公式対応物のない室外機容量では下流合計の区分表にフォールバックする。
                if (isFirstBranch && outdoorKw !== null && Math.abs(outdoorKw - 56.0) < 0.1) node.jointModel = "RBPP72FY";
                else if (isFirstBranch && outdoorKw !== null && Math.abs(outdoorKw - 85.0) < 0.1) node.jointModel = "RBPP104FY";
                else if (cap < 22.4) node.jointModel = "RBPP22FY";
                else if (cap < 33.0) node.jointModel = "RBPP33FY";
                else if (cap < 71.0) node.jointModel = "RBPP72FY";
                else node.jointModel = "RBPP104FY";
            } else {
                // Y分岐管。第1分岐と第2分岐以降は 104.0kW 以上でのみ異なる
                // （第1分岐 RBPP218Y、第2分岐以降 RBPP104Y）。
                if (cap < 22.4) node.jointModel = "RBPP22Y";
                else if (cap < 33.0) node.jointModel = "RBPP33Y";
                else if (cap < 71.0) node.jointModel = "RBPP72Y";
                else if (isFirstBranch && cap >= 104.0) node.jointModel = "RBPP218Y";
                else node.jointModel = "RBPP104Y";
            }
            node.modelNumber = node.jointModel;
        } else if (node.type === 'bs_unit') {
            // BSユニットは下流合計Qと台数で選定する。Q > 28.0 は公式のBS範囲を超える
            // （最大の YBSVP280C を選ぶ。未決事項参照）。
            const cap = node.downstreamCapacity || 0;
            const units = this.countIndoors(node);
            if (cap <= 11.2 && units <= 5) node.modelNumber = "YBSVP112C";
            else if (cap <= 18.0 && units <= 8) node.modelNumber = "YBSVP180C";
            else node.modelNumber = "YBSVP280C";
        }

        if (node.children) {
            const childOutdoorKw = node.type === 'outdoor' ? node.capacity : outdoorKw;
            for (const child of node.children) this.assignModelNumbers(child, series, node.type === 'outdoor', childOutdoorKw);
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
            const model = node.modelNumber || "YS-P160";
            totals.joints[model] = (totals.joints[model] || 0) + 1;
        }

        if (node.children) {
            for (const child of node.children) this.aggregateBOM(child, totals, is3Pipe);
        }
    }
}
