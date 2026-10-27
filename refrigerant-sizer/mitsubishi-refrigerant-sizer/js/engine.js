/**
 * Mitsubishi Electric Refrigerant Sizing Calculation Engine (三菱電機版)
 * 
 * 対応シリーズ:
 * 1. City Multi Y シリーズ (冷暖切換)
 * 2. City Multi R2 シリーズ (冷暖同時 3管/2管ハイブリッド)
 * 3. Mr.Slim マルチシリーズ (店舗・事務所用)
 * 
 * 主な特徴:
 * - 配管サイズは三菱電機指定の JIS外径2桁ミリ表記 (9.52, 12.7, 15.88 等)
 * - R2シリーズにおけるBCコントローラー(親機/子機)接続と、3管/2管自動選定
 * - 下流総容量と台数に基づくBCコントローラーの型番自動選定と制限警告
 */

class RefrigerantSizerEngine {
    constructor() {
        // 液管サイズ一覧 (mm φ)
        this.LIQUID_SIZES = [6.35, 9.52, 12.7, 15.88, 19.05, 22.2, 25.4, 28.58];
        // ガス管サイズ一覧 (mm φ)
        this.GAS_SIZES = [9.52, 12.7, 15.88, 19.05, 22.2, 25.4, 28.58, 31.8, 34.93, 38.1, 41.28];

        // 室内機形状スタイルと対応可能容量 (kW) のマッピング
        this.INDOOR_STYLES = {
            cassette_4way: {
                name: "天井カセット形 4方向 (PLFY)",
                allowedKws: [2.2, 2.8, 3.6, 4.5, 5.6, 7.1, 8.0, 9.0, 11.2, 14.0, 16.0]
            },
            wall_mounted: {
                name: "壁掛形 (PKFY)",
                allowedKws: [2.2, 2.8, 3.6, 4.5, 5.6, 7.1, 8.0]
            },
            ceiling_suspended: {
                name: "天井吊形 (PCFY)",
                allowedKws: [3.6, 4.5, 5.6, 7.1, 8.0, 11.2, 14.0, 16.0]
            },
            floor_standing: {
                name: "床置露出形 (PFFY)",
                allowedKws: [2.2, 2.8, 3.6, 4.5, 5.6, 7.1, 8.0]
            },
            ducted: {
                name: "天井埋込ダクト形 (PEFY)",
                allowedKws: [2.2, 2.8, 3.6, 4.5, 5.6, 7.1, 8.0, 9.0, 11.2, 14.0, 16.0, 22.4, 28.0]
            }
        };

        // シリーズデータベース
        this.SERIES_DATABASE = {
            city_multi_y: {
                name: "シティマルチ Yシリーズ (冷暖切換)",
                maxIndoorUnits: 50,
                outdoorCapacities: [
                    { hp: "8", kw: 22.4, model: "PUHY-P224EM-A" },
                    { hp: "10", kw: 28.0, model: "PUHY-P280EM-A" },
                    { hp: "12", kw: 33.5, model: "PUHY-P335EM-A" },
                    { hp: "14", kw: 40.0, model: "PUHY-P400EM-A" },
                    { hp: "16", kw: 45.0, model: "PUHY-P450EM-A" },
                    { hp: "18", kw: 50.0, model: "PUHY-P500EM-A" },
                    { hp: "20", kw: 56.0, model: "PUHY-P560EM-A" },
                    { hp: "22", kw: 63.0, model: "PUHY-P630EM-A" },
                    { hp: "24", kw: 67.0, model: "PUHY-P670EM-A" },
                    { hp: "28", kw: 80.0, model: "PUHY-P800EM-A" },
                    { hp: "32", kw: 90.0, model: "PUHY-P900EM-A" },
                    { hp: "36", kw: 101.2, model: "PUHY-P1012EM-A" },
                    { hp: "40", kw: 113.0, model: "PUHY-P1130EM-A" },
                    { hp: "44", kw: 124.0, model: "PUHY-P1240EM-A" },
                    { hp: "48", kw: 136.0, model: "PUHY-P1360EM-A" }
                ],
                indoorTypes: [
                    { type: "P22形 (0.8馬力)", kw: 2.2 },
                    { type: "P28形 (1.0馬力)", kw: 2.8 },
                    { type: "P36形 (1.3馬力)", kw: 3.6 },
                    { type: "P45形 (1.6馬力)", kw: 4.5 },
                    { type: "P56形 (2.0馬力)", kw: 5.6 },
                    { type: "P71形 (2.5馬力)", kw: 7.1 },
                    { type: "P80形 (3.0馬力)", kw: 8.0 },
                    { type: "P90形 (3.2馬力)", kw: 9.0 },
                    { type: "P112形 (4.0馬力)", kw: 11.2 },
                    { type: "P140形 (5.0馬力)", kw: 14.0 },
                    { type: "P160形 (6.0馬力)", kw: 16.0 },
                    { type: "P224形 (8.0馬力)", kw: 22.4 },
                    { type: "P280形 (10.0馬力)", kw: 28.0 }
                ]
            },
            city_multi_r2: {
                name: "シティマルチ R2シリーズ (冷暖同時)",
                maxIndoorUnits: 50,
                outdoorCapacities: [
                    { hp: "8", kw: 22.4, model: "PURY-P224EM-A" },
                    { hp: "10", kw: 28.0, model: "PURY-P280EM-A" },
                    { hp: "12", kw: 33.5, model: "PURY-P335EM-A" },
                    { hp: "14", kw: 40.0, model: "PURY-P400EM-A" },
                    { hp: "16", kw: 45.0, model: "PURY-P450EM-A" },
                    { hp: "18", kw: 50.0, model: "PURY-P500EM-A" },
                    { hp: "20", kw: 56.0, model: "PURY-P560EM-A" },
                    { hp: "24", kw: 67.0, model: "PURY-P670EM-A" },
                    { hp: "28", kw: 80.0, model: "PURY-P800EM-A" },
                    { hp: "32", kw: 90.0, model: "PURY-P900EM-A" },
                    { hp: "36", kw: 101.2, model: "PURY-P1012EM-A" }
                ],
                indoorTypes: [
                    { type: "P22形 (0.8馬力)", kw: 2.2 },
                    { type: "P28形 (1.0馬力)", kw: 2.8 },
                    { type: "P36形 (1.3馬力)", kw: 3.6 },
                    { type: "P45形 (1.6馬力)", kw: 4.5 },
                    { type: "P56形 (2.0馬力)", kw: 5.6 },
                    { type: "P71形 (2.5馬力)", kw: 7.1 },
                    { type: "P80形 (3.0馬力)", kw: 8.0 },
                    { type: "P90形 (3.2馬力)", kw: 9.0 },
                    { type: "P112形 (4.0馬力)", kw: 11.2 },
                    { type: "P140形 (5.0馬力)", kw: 14.0 },
                    { type: "P160形 (6.0馬力)", kw: 16.0 },
                    { type: "P224形 (8.0馬力)", kw: 22.4 },
                    { type: "P280形 (10.0馬力)", kw: 28.0 }
                ]
            },
            mr_slim_multi: {
                name: "Mr.Slim スリムマルチ",
                maxIndoorUnits: 4, // 通常同時マルチは最大ダブルツイン(4台)まで
                outdoorCapacities: [
                    { hp: "3", kw: 8.0, model: "PUZ-ZRMP80KA" },
                    { hp: "4", kw: 10.0, model: "PUZ-ZRMP100KA" },
                    { hp: "5", kw: 12.5, model: "PUZ-ZRMP125KA" },
                    { hp: "6", kw: 14.0, model: "PUZ-ZRMP140KA" },
                    { hp: "8", kw: 22.4, model: "PUZ-ZRMP224KA" },
                    { hp: "10", kw: 28.0, model: "PUZ-ZRMP280KA" }
                ],
                indoorTypes: [
                    { type: "36形 (1.3馬力)", kw: 3.6 },
                    { type: "40形 (1.5馬力)", kw: 4.0 },
                    { type: "45形 (1.6馬力)", kw: 4.5 },
                    { type: "50形 (1.8馬力)", kw: 5.0 },
                    { type: "56形 (2.0馬力)", kw: 5.6 },
                    { type: "71形 (2.5馬力)", kw: 7.1 },
                    { type: "80形 (3.0馬力)", kw: 8.0 },
                    { type: "112形 (4.0馬力)", kw: 11.2 },
                    { type: "140形 (5.0馬力)", kw: 14.0 }
                ]
            }
        };
    }

    /** 指定スタイルとシリーズで選択可能な容量リストを取得 */
    getValidIndoorOptions(seriesId, styleId) {
        const series = this.SERIES_DATABASE[seriesId];
        const style = this.INDOOR_STYLES[styleId];
        if (!series || !style) return [];
        return series.indoorTypes.filter(opt => style.allowedKws.includes(opt.kw));
    }

    /** 機器型番の動的生成 */
    generateModelNumber(node, seriesId, outdoorKw) {
        const db = this.SERIES_DATABASE[seriesId];
        if (!db) return '-';

        if (node.type === 'outdoor') {
            const match = db.outdoorCapacities.find(c => Math.abs(c.kw - node.capacity) < 0.1);
            return match ? match.model : '-';
        }

        if (node.type === 'indoor') {
            const match = db.indoorTypes.find(i => Math.abs(i.kw - node.capacity) < 0.1);
            if (!match) return '-';
            const capCode = match.type.split('形')[0].replace('P', '');
            
            switch (node.indoorStyle) {
                case 'cassette_4way': return `PLFY-P${capCode}EM-A`;
                case 'wall_mounted': return `PKFY-P${capCode}KM-A`;
                case 'ceiling_suspended': return `PCFY-P${capCode}KM-A`;
                case 'floor_standing': return `PFFY-P${capCode}LM-A`;
                case 'ducted': return `PEFY-P${capCode}VM-A`;
                default: return `P-${capCode}`;
            }
        }

        if (node.type === 'bc_controller') {
            return this.generateBCUnitModel(node, outdoorKw);
        }

        if (node.type === 'sub_bc_controller') {
            return this.generateSubBCUnitModel(node);
        }

        return '';
    }

    /** BCコントローラー(親機)の型番生成
     * 公式の適用可否（D1 p.14 available-connection 表、D4 §10-4）:
     * (E)P200〜350（室外機 40.0 kW 以下）は全機種可、(E)P351〜900（40.1〜101.2 kW）は
     * JA/KA のみ（無印 -J は使用不可）、(E)P901〜1100（101.2 kW 超）は CMB-P1016V-KA のみ。
     * JA 機種は P108V-JA（8ポート）/ P1012V-JA（12ポート）/ P1016V-JA（16ポート）のみ
     * 存在するため、4ポート以下の系統でも最小の JA 機種（P108V-JA）を選定する。 */
    generateBCUnitModel(node, outdoorKw) {
        const count = this.countIndoorUnitsDownstream(node);
        if (outdoorKw != null && outdoorKw > 101.2) {
            return count <= 16 ? "CMB-P1016V-KA" : "CMB-P1016V-KA (子機接続要)";
        }
        if (outdoorKw != null && outdoorKw > 40.0) {
            if (count <= 8) return "CMB-P108V-JA";
            if (count <= 12) return "CMB-P1012V-JA";
            if (count <= 16) return "CMB-P1016V-JA";
            return "CMB-P1016V-JA (子機接続要)";
        }
        if (count <= 4) return "CMB-P104V-J";
        if (count <= 8) return "CMB-P108V-J";
        if (count <= 16) return "CMB-P1016V-J";
        return "CMB-P1016V-J (子機接続要)";
    }

    /** 子BCコントローラーの型番生成
     * 公式のサブ BC は CMB-P104V-KB のみ（D1 p.14、D4 §10-4）。
     * 旧コードの CMB-P108V-KB は取得した BC マニュアルに存在しない。 */
    generateSubBCUnitModel(node) {
        return "CMB-P104V-KB";
    }

    /** 下流の室内機台数をカウント */
    countIndoorUnitsDownstream(node) {
        let count = 0;
        if (node.type === 'indoor') count += 1;
        if (node.children) {
            node.children.forEach(c => {
                count += this.countIndoorUnitsDownstream(c);
            });
        }
        return count;
    }

    /** 下流の最大ノード容量合計(kW)を再帰算出 */
    getDownstreamCapacity(node) {
        let sum = 0;
        if (node.type === 'indoor') {
            sum += node.capacity;
        }
        if (node.children) {
            node.children.forEach(child => {
                sum += this.getDownstreamCapacity(child);
            });
        }
        return sum;
    }

    /** 2管式(Yシリーズ 分岐〜分岐)配管サイズ選定
     * 公式 Pipe B, C, D 表（D2・D5 GB-27）。下流室内機合計形番（P/M）別。
     * 帯域境界は公式どおり（14.0 / 20.0 / 30.0 / 40.0 / 65.0 / 80.0 kW）。
     * R2 の BC 下流の分岐〜分岐区間および Mr.Slim にも同じ関数を用いる
     * （R2 BC 下流の専用表は報告書になく、Mr.Slim は未検証のため、Y の B/C/D 表を
     * 流用している。CORRECTIONS.md 参照）。 */
    selectTwoPipeSize(kw, isManualSizeUp = false) {
        let liquid = 9.52;
        let gas = 15.88;

        if (kw <= 14.0) { // P/M140 未満
            liquid = 9.52; gas = 15.88;
        } else if (kw <= 20.0) { // P/M141〜200
            liquid = 9.52; gas = 19.05;
        } else if (kw <= 30.0) { // P/M201〜300
            liquid = 9.52; gas = 22.2;
        } else if (kw <= 40.0) { // P/M301〜400
            liquid = 12.7; gas = 28.58;
        } else if (kw <= 65.0) { // P/M401〜650
            liquid = 15.88; gas = 28.58;
        } else if (kw <= 80.0) { // P/M651〜800
            liquid = 19.05; gas = 34.93;
        } else { // P/M801〜
            liquid = 19.05; gas = 41.28;
        }

        // 手動強制サイズアップ
        if (isManualSizeUp) {
            liquid = this.sizeUpPipe(liquid, this.LIQUID_SIZES);
            gas = this.sizeUpPipe(gas, this.GAS_SIZES);
        }

        return { liquid, gas };
    }

    /** Yシリーズ 室外機〜第一分岐（Pipe A）配管サイズ選定
     * 公式 Pipe A 表（D2・D5 GB-25）。選定キーは室外機形番（容量）であり
     * 下流合計容量ではない。P250 は L1＞90m、P300 は L1＞40m で液管 12.7 になる
     * 条件付き増径は、長さ入力がないため適用していない（CORRECTIONS.md 参照）。 */
    selectYPipeASize(outdoorKw, isManualSizeUp = false) {
        let liquid = 9.52;
        let gas = 22.2;

        if (outdoorKw <= 33.5) { // P200〜P300
            liquid = 9.52; gas = 22.2;
        } else if (outdoorKw <= 45.0) { // P350〜P400
            liquid = 12.7; gas = 28.58;
        } else if (outdoorKw <= 73.5) { // P450〜P650
            liquid = 15.88; gas = 28.58;
        } else if (outdoorKw <= 90.0) { // P700〜P800
            liquid = 19.05; gas = 34.93;
        } else { // P850〜P1350
            liquid = 19.05; gas = 41.28;
        }

        if (isManualSizeUp) {
            liquid = this.sizeUpPipe(liquid, this.LIQUID_SIZES);
            gas = this.sizeUpPipe(gas, this.GAS_SIZES);
        }

        return { liquid, gas };
    }

    /** Yシリーズ 分岐〜室内機（Pipe a〜d）配管サイズ選定
     * 公式 a〜d 表（D2・D5 GB-27）。室内機形番別。
     * P56（5.6 kW）は a〜d 表に P56 の行がないが、室内機接続口径（22〜56 形
     * φ6.35/φ12.7）により 6.35/12.7 とする（REPORT.md D-YB-1）。
     * P160（16.0 kW）は公式表の対象外のため旧コード値（9.52/19.05）のままとする。 */
    selectYBranchToIndoorSize(kw) {
        if (kw <= 5.6) {
            return { liquid: 6.35, gas: 12.7 };
        } else if (kw <= 14.0) {
            return { liquid: 9.52, gas: 15.88 };
        } else if (kw <= 22.4) {
            return { liquid: 9.52, gas: 19.05 };
        } else {
            return { liquid: 9.52, gas: 22.2 };
        }
    }

    /** BCコントローラー直後の室内機単独用配管サイズ選定 (2管)
     * 公式 a〜h 表（D4 §9-4 GB-27）。室内機形番別。
     * 境界は公式どおり（P50 / P140 / P200 / P250 ＝ 5.0 / 14.0 / 22.4 / 28.0 kW）。
     * P160（16.0 kW）は公式表の対象外のため旧コード値（9.52/19.05）のままとする。 */
    selectBCBranchToIndoorSize(kw) {
        // BC親・子から室内機単体への接続管
        if (kw <= 5.0) {
            return { liquid: 6.35, gas: 12.7 };
        } else if (kw <= 14.0) {
            return { liquid: 9.52, gas: 15.88 };
        } else if (kw <= 22.4) {
            return { liquid: 9.52, gas: 19.05 };
        } else {
            return { liquid: 9.52, gas: 22.2 };
        }
    }

    /** R2シリーズ 室外機〜親BCコントローラー間サイズ選定
     * 公式 Pipe A 表（D1 p.14 Fig. 4.1.2、D4 §9-4 GB-25、D3 仕様書）。
     * 当該区間は高圧ガス管・低圧ガス管の 2 管のみであり、液管は存在しない。
     * 旧コードが返していた液管列（D-R2-LIQ）は削除した。BOM にも計上しない。
     * 室外機容量 (kW) に基づく。P550（63.0 kW）は 22.2/28.58、P650（73.5 kW）は
     * 28.58/28.58 だが実装ラインアップにないため到達範囲外（参考記録）。 */
    selectR2OutdoorToBCSize(outdoorKw, isManualSizeUp = false) {
        let highGas = 15.88;
        let lowGas = 19.05;

        if (outdoorKw <= 22.4) { // P200
            highGas = 15.88; lowGas = 19.05;
        } else if (outdoorKw <= 33.5) { // P250, P300
            highGas = 19.05; lowGas = 22.2;
        } else if (outdoorKw <= 40.0) { // P350（空冷 PURY。PQRY-P350 水冷式は 22.2）
            highGas = 19.05; lowGas = 28.58;
        } else if (outdoorKw <= 67.0) { // P400〜P600
            highGas = 22.2; lowGas = 28.58;
        } else if (outdoorKw <= 90.0) { // P700〜P800
            highGas = 28.58; lowGas = 34.93;
        } else { // P850〜
            highGas = 28.58; lowGas = 41.28;
        }

        if (isManualSizeUp) {
            highGas = this.sizeUpPipe(highGas, this.GAS_SIZES);
            lowGas = this.sizeUpPipe(lowGas, this.GAS_SIZES);
        }

        return { highGas, lowGas };
    }

    /** R2シリーズ 主管〜サブBCコントローラー間サイズ選定（3管式）
     * 公式 Pipes C〜I 表（D4 §9-4 GB-27、D1 p.14 サブ BC 表）。
     * 下流室内機合計形番（P/M）別。液管・高圧ガス管・低圧ガス管の 3 管。
     * 601〜650 帯の低圧ガス管は D1（34.93）と D4（28.58）で食い違っており、
     * 本実装は D4（据付説明書）の 28.58 を採用する（CORRECTIONS.md 参照）。 */
    selectSubBCFeedSize(kw, isManualSizeUp = false) {
        let liquid = 9.52;
        let highGas = 15.88;
        let lowGas = 19.05;

        if (kw <= 20.0) { // 〜200
            liquid = 9.52; highGas = 15.88; lowGas = 19.05;
        } else if (kw <= 30.0) { // 201〜300
            liquid = 9.52; highGas = 19.05; lowGas = 22.2;
        } else if (kw <= 35.0) { // 301〜350
            liquid = 12.7; highGas = 19.05; lowGas = 28.58;
        } else if (kw <= 40.0) { // 351〜400
            liquid = 12.7; highGas = 22.2; lowGas = 28.58;
        } else if (kw <= 60.0) { // 401〜600
            liquid = 15.88; highGas = 22.2; lowGas = 28.58;
        } else if (kw <= 65.0) { // 601〜650
            liquid = 15.88; highGas = 28.58; lowGas = 28.58;
        } else if (kw <= 80.0) { // 651〜800
            liquid = 19.05; highGas = 28.58; lowGas = 34.93;
        } else if (kw <= 100.0) { // 801〜1000
            liquid = 19.05; highGas = 28.58; lowGas = 41.28;
        } else { // 1001〜
            liquid = 19.05; highGas = 34.93; lowGas = 41.28;
        }

        if (isManualSizeUp) {
            liquid = this.sizeUpPipe(liquid, this.LIQUID_SIZES);
            highGas = this.sizeUpPipe(highGas, this.GAS_SIZES);
            lowGas = this.sizeUpPipe(lowGas, this.GAS_SIZES);
        }

        return { liquid, highGas, lowGas };
    }

    sizeUpPipe(current, list) {
        const idx = list.indexOf(current);
        if (idx !== -1 && idx < list.length - 1) {
            return list[idx + 1];
        }
        return current;
    }

    /** 2管式分岐ジョイント型番選定（Branch Joint）
     * 公式 Branch Joint 表（D2・D5 GB-25/27）。下流室内機合計形番（P/M）別。
     * 帯域境界は公式どおり（20.0 / 40.0 / 65.0 kW）。 */
    selectJointModel(kw) {
        if (kw <= 20.0) return "CMY-Y102SS-G2";
        if (kw <= 40.0) return "CMY-Y102LS-G2";
        if (kw <= 65.0) return "CMY-Y202S-G2";
        return "CMY-Y302S-G2";
    }

    /** Yシリーズ 第一分岐ジョイント型番選定（First Joint）
     * 公式 First Joint 表（D2・D5 GB-25）。室外機形番別。 */
    selectFirstJointModel(outdoorKw) {
        if (outdoorKw <= 45.0) return "CMY-Y102LS-G2"; // P200〜P400
        if (outdoorKw <= 73.5) return "CMY-Y202S-G2"; // P450〜P650
        return "CMY-Y302S-G2"; // P700〜P1350
    }

    /** R2シリーズ 2分岐ジョイント型番選定
     * 公式 2-Branch Joint Pipe 表（D4 §9-3-1）。下流室内機合計形番別。
     * 公式表は P250（25.0 kW）までしかない（1 ポートの最大下流が P250 のため）。
     * 下流合計が 25.0 kW を超える系統は公式上 2 分岐ジョイントの適用範囲外であり、
     * ツリーには BC ポート数の概念がないため、LS-G2（同表の最大機種）を返す。
     * CORRECTIONS.md 参照。 */
    selectR2BranchJointModel(kw) {
        if (kw <= 20.0) return "CMY-Y102SS-G2";
        return "CMY-Y102LS-G2";
    }

    /** 全体計算メイン処理 */
    calculateSystem(rootNode, seriesId, isManualSizeUp = false) {
        if (!rootNode || rootNode.type !== 'outdoor') {
            return { error: 'Invalid root node' };
        }

        const warnings = [];
        const totals = {
            liquidPipes: {},
            gasPipes: {},
            highGasPipes: {},
            lowGasPipes: {},
            joints: {},
            totalLength: 0
        };

        // 容量制限チェック
        const totalIndoorKw = this.getDownstreamCapacity(rootNode);
        const totalIndoorCount = this.countIndoorUnitsDownstream(rootNode);
        const series = this.SERIES_DATABASE[seriesId];

        if (series) {
            const outdoorCap = rootNode.capacity;
            const ratio = (totalIndoorKw / outdoorCap) * 100;
            
            // 接続可能総台数警告
            if (totalIndoorCount > series.maxIndoorUnits) {
                warnings.push({
                    type: 'danger',
                    message: `室内機の接続台数制限(${series.maxIndoorUnits}台)を超えています。現在: ${totalIndoorCount}台`
                });
            }

            // 接続容量比警告。公式の適正範囲はシリーズ別。
            // Y シリーズ 50%〜130%（PUHY 仕様書）、R2 シリーズ 50%〜150%
            // （D4 仕様表「Total capacity 50% to 150%」、D3 仕様書も「50~150%」）。
            // Mr.Slim は公式資料が得られていないため Y と同じ 50%〜130% とする。
            const ratioMax = seriesId === 'city_multi_r2' ? 150 : 130;
            if (ratio < 50 || ratio > ratioMax) {
                warnings.push({
                    type: 'info',
                    message: `室外機容量に対する接続室内機合計比率が適正範囲(50%〜${ratioMax}%)を外れています。現在: ${ratio.toFixed(1)}% (${totalIndoorKw.toFixed(1)} kW / 室外機: ${outdoorCap.toFixed(1)} kW)`
                });
            }
        }

        // ツリーを再帰計算して配管サイズと部材型番をセット
        this.processNodeSizing(rootNode, seriesId, isManualSizeUp, false, rootNode.capacity, totals, warnings);

        return {
            tree: rootNode,
            warnings: warnings,
            totals: totals
        };
    }

    /** 再帰的選定・集計ロジック */
    processNodeSizing(node, seriesId, isManualSizeUp, inBCDownstream, outdoorCap, totals, warnings) {
        // 1. ノード自身の型番決定
        node.modelNumber = this.generateModelNumber(node, seriesId, outdoorCap);

        // 2. 子供たちがいる場合、配管サイズと下流機器の選定
        if (node.children && node.children.length > 0) {
            node.children.forEach(child => {
                const childKw = this.getDownstreamCapacity(child);
                child.capacitySum = childKw;

                // 配管長の積算
                const len = child.length || 0;
                totals.totalLength += len;

                // 3管/2管の切り替え判定 (R2シリーズの場合)
                if (seriesId === 'city_multi_r2') {
                    if (node.type === 'outdoor' || node.type === 'branch') {
                        // 親BCコントローラーに突入するまでは高圧・低圧ガス管の2管
                        // （室外機〜親BC間に液管は存在しない。D1・D3・D4。D-R2-LIQ）
                        if (child.type === 'bc_controller') {
                            // 室外機〜親BC間は高圧・低圧ガス管のみ
                            const sizes = this.selectR2OutdoorToBCSize(outdoorCap, isManualSizeUp);
                            child.pipeSizeText = `高圧ガス: φ${sizes.highGas} / 低圧ガス: φ${sizes.lowGas}`;
                            child.pipes = { type: '3pipe', highGas: sizes.highGas, lowGas: sizes.lowGas };

                            // BOM集計（液管なし）
                            totals.highGasPipes[sizes.highGas] = (totals.highGasPipes[sizes.highGas] || 0) + len;
                            totals.lowGasPipes[sizes.lowGas] = (totals.lowGasPipes[sizes.lowGas] || 0) + len;

                            // 子ノード処理 (親BC下流に入るため inBCDownstream = true)
                            this.processNodeSizing(child, seriesId, isManualSizeUp, true, outdoorCap, totals, warnings);
                        } else {
                            // BCコントローラーを経由しない接続がある場合 (R2では設計エラー)
                            const sizes = this.selectR2OutdoorToBCSize(outdoorCap, isManualSizeUp);
                            child.pipeSizeText = `高圧ガス: φ${sizes.highGas} / 低圧ガス: φ${sizes.lowGas}`;
                            child.pipes = { type: '3pipe', highGas: sizes.highGas, lowGas: sizes.lowGas };

                            warnings.push({
                                type: 'danger',
                                message: `冷暖同時(R2)系統では、室外機と室内機の間にBCコントローラーが必要です。(${child.name})`
                            });

                            this.processNodeSizing(child, seriesId, isManualSizeUp, false, outdoorCap, totals, warnings);
                        }
                    } else if (inBCDownstream) {
                        // BCコントローラー下流
                        if (child.type === 'indoor') {
                            // BC親または子から室内機単体への接続
                            const sizes = this.selectBCBranchToIndoorSize(childKw);
                            child.pipeSizeText = `液管: φ${sizes.liquid} / ガス管: φ${sizes.gas}`;
                            child.pipes = { type: '2pipe', liquid: sizes.liquid, gas: sizes.gas };

                            totals.liquidPipes[sizes.liquid] = (totals.liquidPipes[sizes.liquid] || 0) + len;
                            totals.gasPipes[sizes.gas] = (totals.gasPipes[sizes.gas] || 0) + len;
                        } else if (child.type === 'sub_bc_controller') {
                            // 主管〜子BC間は3管式（液管・高圧ガス管・低圧ガス管。D1 p.14、D4 §9-4 Pipes C〜I）
                            const sizes = this.selectSubBCFeedSize(childKw, isManualSizeUp);
                            child.pipeSizeText = `液管: φ${sizes.liquid} / 高圧ガス: φ${sizes.highGas} / 低圧ガス: φ${sizes.lowGas}`;
                            child.pipes = { type: '3pipe', liquid: sizes.liquid, highGas: sizes.highGas, lowGas: sizes.lowGas };

                            totals.liquidPipes[sizes.liquid] = (totals.liquidPipes[sizes.liquid] || 0) + len;
                            totals.highGasPipes[sizes.highGas] = (totals.highGasPipes[sizes.highGas] || 0) + len;
                            totals.lowGasPipes[sizes.lowGas] = (totals.lowGasPipes[sizes.lowGas] || 0) + len;
                        } else {
                            // 分岐間（2分岐ジョイントへの接続）
                            const sizes = this.selectTwoPipeSize(childKw, isManualSizeUp);
                            child.pipeSizeText = `液管: φ${sizes.liquid} / ガス管: φ${sizes.gas}`;
                            child.pipes = { type: '2pipe', liquid: sizes.liquid, gas: sizes.gas };

                            totals.liquidPipes[sizes.liquid] = (totals.liquidPipes[sizes.liquid] || 0) + len;
                            totals.gasPipes[sizes.gas] = (totals.gasPipes[sizes.gas] || 0) + len;
                        }

                        // 子BC容量警告 (子BC下流の上限容量判定)
                        if (child.type === 'sub_bc_controller') {
                            if (childKw > 35.0) {
                                warnings.push({
                                    type: 'danger',
                                    message: `子BCコントローラー(${child.name})の下流接続容量合計が上限(35.0kW)を超えています。現在: ${childKw.toFixed(1)}kW`
                                });
                            }
                        }

                        this.processNodeSizing(child, seriesId, isManualSizeUp, true, outdoorCap, totals, warnings);
                    }
                } else {
                    // 通常の2管式 (Yシリーズ、Mr.Slim)
                    // Yシリーズは区間ごとに選定表が異なる（Pipe A / B・C・D / a〜d）。
                    // Mr.Slim は公式資料が得られていないため、従来どおり selectTwoPipeSize を
                    // 全区間に用いる（訂正後の B/C/D 帯。未検証のため CORRECTIONS.md 参照）。
                    let sizes;
                    if (seriesId === 'city_multi_y' && child.type === 'indoor') {
                        // 分岐〜室内機（Pipe a〜d）。室外機直下の室内機も同じ室内機接続サイズ。
                        sizes = this.selectYBranchToIndoorSize(childKw);
                    } else if (seriesId === 'city_multi_y' && node.type === 'outdoor' && child.type === 'branch') {
                        // 室外機〜第一分岐（Pipe A）。選定キーは室外機形番。
                        sizes = this.selectYPipeASize(outdoorCap, isManualSizeUp);
                        child.isFirstBranch = true;
                    } else {
                        // 分岐〜分岐（Pipe B・C・D）
                        sizes = this.selectTwoPipeSize(childKw, isManualSizeUp);
                    }
                    child.pipeSizeText = `液管: φ${sizes.liquid} / ガス管: φ${sizes.gas}`;
                    child.pipes = { type: '2pipe', liquid: sizes.liquid, gas: sizes.gas };

                    totals.liquidPipes[sizes.liquid] = (totals.liquidPipes[sizes.liquid] || 0) + len;
                    totals.gasPipes[sizes.gas] = (totals.gasPipes[sizes.gas] || 0) + len;

                    // 分岐管継手の選定・集計は、子ノードごとではなく分岐ノード単位で行う。

                    // YシリーズにBCコントローラーが追加されている場合は警告
                    if (child.type === 'bc_controller' || child.type === 'sub_bc_controller') {
                        warnings.push({
                            type: 'danger',
                            message: `冷暖切換(Y)シリーズまたはMr.SlimにBCコントローラーは追加できません。接続を削除してください。`
                        });
                    }

                    this.processNodeSizing(child, seriesId, isManualSizeUp, false, outdoorCap, totals, warnings);
                }
            });
        }

        // 分岐ジョイントは、分岐ノードの下流合計容量から型番を決めて1個だけ集計する。
        if (node.type === 'branch') {
            if (seriesId === 'city_multi_r2') {
                // R2 の 2 分岐ジョイント（D4 §9-3-1）
                node.jointModel = this.selectR2BranchJointModel(this.getDownstreamCapacity(node));
            } else if (seriesId === 'city_multi_y' && node.isFirstBranch) {
                // Y の第一分岐は First Joint 表（室外機形番別）
                node.jointModel = this.selectFirstJointModel(outdoorCap);
            } else {
                node.jointModel = this.selectJointModel(this.getDownstreamCapacity(node));
            }
            totals.joints[node.jointModel] = (totals.joints[node.jointModel] || 0) + 1;
        }
        if ((node.type === 'bc_controller' || node.type === 'sub_bc_controller') && node.modelNumber) {
            totals.joints[node.modelNumber] = (totals.joints[node.modelNumber] || 0) + 1;
        }
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = RefrigerantSizerEngine;
} else {
    window.RefrigerantSizerEngine = RefrigerantSizerEngine;
}

/* ==========================================================================
   SpecChecker – 仕様・品番 定期チェックユーティリティ (三菱電機用)
   ========================================================================== */
class SpecChecker {
    constructor(engineInstance) {
        this.engine = engineInstance;
        this.SNAPSHOT_KEY   = 'mitsubishi_sizer_spec_snapshot';
        this.HISTORY_KEY    = 'mitsubishi_sizer_spec_history';
        this.LAST_CHECK_KEY = 'mitsubishi_sizer_last_check_date';
        this.CHECK_INTERVAL_DAYS = 30;
    }

    _currentSnapshot() {
        const db = this.engine && this.engine.SERIES_DATABASE ? this.engine.SERIES_DATABASE : {};
        return JSON.stringify(db, null, 2);
    }

    getLastCheckDate() {
        const raw = localStorage.getItem(this.LAST_CHECK_KEY);
        return raw ? new Date(raw) : null;
    }

    isCheckDue() {
        const last = this.getLastCheckDate();
        if (!last) return true;
        const diff = (Date.now() - last.getTime()) / (1000 * 60 * 60 * 24);
        return diff >= this.CHECK_INTERVAL_DAYS;
    }

    getHistory() {
        try {
            return JSON.parse(localStorage.getItem(this.HISTORY_KEY) || '[]');
        } catch {
            return [];
        }
    }

    _addHistory(entry) {
        const history = this.getHistory();
        history.unshift(entry);
        if (history.length > 50) history.splice(50);
        localStorage.setItem(this.HISTORY_KEY, JSON.stringify(history));
    }

    runCheck(force = false) {
        if (!force && !this.isCheckDue()) {
            return { executed: false, entry: null };
        }

        const now      = new Date();
        const nowIso   = now.toISOString();
        const current  = this._currentSnapshot();
        const previous = localStorage.getItem(this.SNAPSHOT_KEY);

        localStorage.setItem(this.LAST_CHECK_KEY, nowIso);

        if (!previous) {
            localStorage.setItem(this.SNAPSHOT_KEY, current);
            const entry = {
                date:    nowIso,
                type:    'initial',
                label:   '初回スナップショット登録',
                changes: []
            };
            this._addHistory(entry);
            return { executed: true, entry };
        }

        const changes = this._diffSnapshots(previous, current);
        localStorage.setItem(this.SNAPSHOT_KEY, current);

        const entry = {
            date:    nowIso,
            type:    changes.length > 0 ? 'changed' : 'ok',
            label:   changes.length > 0 ? `${changes.length} 件の変更を検出` : '変更なし',
            changes: changes
        };
        this._addHistory(entry);
        return { executed: true, entry };
    }

    _diffSnapshots(oldJson, newJson) {
        let oldObj, newObj;
        try { oldObj = JSON.parse(oldJson); } catch { oldObj = {}; }
        try { newObj = JSON.parse(newJson); } catch { newObj = {}; }

        const changes = [];
        this._deepDiff(oldObj, newObj, '', changes);
        return changes;
    }

    _deepDiff(oldObj, newObj, path, changes) {
        const allKeys = new Set([
            ...Object.keys(oldObj || {}),
            ...Object.keys(newObj || {})
        ]);

        for (const key of allKeys) {
            const fullPath = path ? `${path}.${key}` : key;
            const oldVal = oldObj ? oldObj[key] : undefined;
            const newVal = newObj ? newObj[key] : undefined;

            if (oldVal === undefined && newVal !== undefined) {
                changes.push({ path: fullPath, type: 'added', oldVal: null, newVal: this._summary(newVal) });
            } else if (oldVal !== undefined && newVal === undefined) {
                changes.push({ path: fullPath, type: 'removed', oldVal: this._summary(oldVal), newVal: null });
            } else if (typeof oldVal === 'object' && oldVal !== null && typeof newVal === 'object' && newVal !== null) {
                if (Array.isArray(oldVal) || Array.isArray(newVal)) {
                    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
                        changes.push({ path: fullPath, type: 'modified', oldVal: this._summary(oldVal), newVal: this._summary(newVal) });
                    }
                } else {
                    this._deepDiff(oldVal, newVal, fullPath, changes);
                }
            } else if (oldVal !== newVal) {
                changes.push({ path: fullPath, type: 'modified', oldVal: String(oldVal), newVal: String(newVal) });
            }
        }
    }

    _summary(val) {
        if (Array.isArray(val)) return `[配列: ${val.length}件]`;
        if (typeof val === 'object' && val !== null) return `{オブジェクト}`;
        return String(val);
    }
}

if (typeof window !== 'undefined') {
    window.SpecChecker = SpecChecker;
}
