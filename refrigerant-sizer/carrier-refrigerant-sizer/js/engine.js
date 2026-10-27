/**
 * Nippon Carrier HVAC Piping Sizing Calculation Engine (日本キャリア版)
 * 
 * 対応シリーズ:
 * 1. スーパーマルチuシリーズ (冷暖切換)
 * 2. スーパーマルチuシリーズ (冷暖同時 3管式)
 * 3. スーパーマルチminiシリーズ (コンパクト)
 * 
 * 主な特徴:
 * - 配管サイズは日本キャリア指定の JISミリ外径 (9.5, 12.7, 15.9, 38.1 等)
 * - 3管式冷暖同時におけるFSユニット(流路切換ユニット)まわりの3管/2管配管選定
 * - 下流総容量と接続数に基づくFSユニットの型番自動選定と制限警告
 */

class RefrigerantSizerEngine {
    constructor() {
        // 液管サイズ一覧 (mm φ)
        this.LIQUID_SIZES = [6.4, 9.5, 12.7, 15.9, 19.1, 22.2, 25.4];
        // ガス管サイズ一覧 (mm φ)
        this.GAS_SIZES = [9.5, 12.7, 15.9, 19.1, 22.2, 25.4, 28.6, 31.8, 38.1, 41.3];

        // 全部入り冷媒サイズマスター表 (日本キャリア技術資料との一致確認は未完了)
        this.MASTER_PIPE_TABLES = {
            cooling_heating_switch: {
                title: "日本キャリア 【冷暖切替】 冷媒管サイズ表 (全パターン網羅)",
                systemType: "2pipe",
                rules: [
                    "① 室外機〜室内機間の配管相当長が90mを超える場合 → 主管の液管・ガス管共1サイズアップする。",
                    "② 第1分岐〜最遠の室内機までの配管長が40mを超える場合 → 第1分岐〜最遠室内機分岐管までの液管・ガス管共1サイズアップする。",
                    "③ 室外機〜室内機間高低差が50mを超える場合 → 主管の液管のみ1サイズアップする。",
                    "④ その他条件については日本キャリア技術資料・冷媒配管接続要領を必ず参照のこと。"
                ],
                headers: ["記号", "液管 (mm)", "ガス管 (mm)", "室内機 (kW)", "分岐後 (kW)", "室内機合計kW / 室外機 (kW)", "備考 / サイズUP値"],
                rows: [
                    { code: "1", liquid: "6.4", gas: "12.7", indoorKw: "〜5.6", branchKw: "—", outdoorKw: "—", notes: "—" },
                    { code: "2", liquid: "9.5", gas: "15.9", indoorKw: "7.1〜16.0", branchKw: "〜16.0", outdoorKw: "—", notes: "—" },
                    { code: "3", liquid: "9.5", gas: "19.1", indoorKw: "22.4", branchKw: "16.1〜22.4", outdoorKw: "22.4", notes: "—" },
                    { code: "4", liquid: "9.5", gas: "22.2", indoorKw: "28.0", branchKw: "22.5〜28.0", outdoorKw: "28.0", notes: "—" },
                    { code: "5", liquid: "12.7", gas: "19.1", indoorKw: "—", branchKw: "—", outdoorKw: "—", notes: "分岐〜最遠室内機間: \"2\"の1サイズUPの値" },
                    { code: "6", liquid: "12.7", gas: "22.2", indoorKw: "—", branchKw: "—", outdoorKw: "—", notes: "配管相当長90m超(主管): 22.4kWの1サイズUP値 / 分岐間: \"3\"の1サイズUP値" },
                    { code: "7", liquid: "12.7", gas: "25.4", indoorKw: "—", branchKw: "—", outdoorKw: "—", notes: "配管相当長90m超(主管): 28.0kWの1サイズUP値 / 分岐間: \"4\"の1サイズUP値" },
                    { code: "8", liquid: "12.7", gas: "28.6", indoorKw: "—", branchKw: "28.1〜45.0", outdoorKw: "33.5〜45.0", notes: "—" },
                    { code: "9", liquid: "15.9", gas: "28.6", indoorKw: "—", branchKw: "45.1〜68.0", outdoorKw: "50.0〜68.0", notes: "配管相当長90m超(主管): 33.5〜45.0kWの1サイズUP値" },
                    { code: "10", liquid: "19.1", gas: "34.9", indoorKw: "—", branchKw: "68.1〜85.0", outdoorKw: "73.0〜85.0", notes: "配管相当長90m超(主管): 50.0〜68.0kWの1サイズUP値" },
                    { code: "11", liquid: "19.1", gas: "41.3", indoorKw: "—", branchKw: "85.1〜", outdoorKw: "90.0〜", notes: "配管相当長90m超(主管): 73.0〜85.0kWの1サイズUP値" },
                    { code: "12", liquid: "22.2", gas: "41.3", indoorKw: "—", branchKw: "—", outdoorKw: "—", notes: "配管相当長90m超(主管): 90.0kW〜の1サイズUP値 (ガス管φ41.3のサイズUPは不可)" }
                ]
            },
            cooling_heating_free: {
                title: "日本キャリア 【冷暖同時】 冷媒管サイズ表 (全パターン網羅)",
                systemType: "3pipe",
                rules: [
                    "① 室外機〜室内機間の配管相当長が90mを超える場合 → 主管の液管のみ1サイズアップする。",
                    "② 第1分岐〜最遠の室内機までの配管長が40mを超える場合 → 第1分岐〜最遠室内機分岐管までの液管のみ1サイズアップする。",
                    "③ 室外機〜FSユニット間は3管式 (液管・吐出ガス管・吸入ガス管)、FSユニット〜室内機間は必ず2管式 (液管・ガス管)。",
                    "④ その他条件については日本キャリア技術資料・冷媒配管接続要領を必ず参照のこと。"
                ],
                headers: ["記号", "液管 (mm)", "吐出ガス管 (mm)", "吸入ガス管 (mm)", "分岐後 (kW)", "室内機合計kW / 室外機 (kW)", "備考 / サイズUP値"],
                rows: [
                    { code: "A", liquid: "9.5", highLowGas: "15.9", suctionGas: "19.1", branchKw: "〜22.4", outdoorKw: "22.4 (8HP)", notes: "—" },
                    { code: "B", liquid: "9.5", highLowGas: "19.1", suctionGas: "22.2", branchKw: "22.5〜28.0", outdoorKw: "28.0 (10HP)", notes: "—" },
                    { code: "C", liquid: "12.7", highLowGas: "15.9", suctionGas: "19.1", branchKw: "—", outdoorKw: "—", notes: "配管相当長90m超(主管): 22.4kWの液管のみ1サイズUP値" },
                    { code: "D", liquid: "12.7", highLowGas: "19.1", suctionGas: "22.2", branchKw: "—", outdoorKw: "—", notes: "配管相当長90m超(主管): 28.0kWの液管のみ1サイズUP値" },
                    { code: "E", liquid: "12.7", highLowGas: "19.1", suctionGas: "28.6", branchKw: "28.1〜45.0", outdoorKw: "33.5〜45.0 (12-16HP)", notes: "—" },
                    { code: "F", liquid: "15.9", highLowGas: "19.1", suctionGas: "28.6", branchKw: "—", outdoorKw: "—", notes: "配管相当長90m超(主管): 33.5〜45.0kWの液管のみ1サイズUP値" },
                    { code: "G", liquid: "15.9", highLowGas: "22.2", suctionGas: "28.6", branchKw: "45.1〜56.0", outdoorKw: "50.0〜56.0 (18-20HP)", notes: "—" },
                    { code: "H", liquid: "19.1", highLowGas: "22.2", suctionGas: "28.6", branchKw: "—", outdoorKw: "—", notes: "配管相当長90m超(主管): 50.0〜56.0kWの液管のみ1サイズUP値" },
                    { code: "I", liquid: "15.9", highLowGas: "28.6", suctionGas: "28.6", branchKw: "56.1〜68.0", outdoorKw: "61.5〜68.0 (22-24HP)", notes: "—" },
                    { code: "J", liquid: "19.1", highLowGas: "28.6", suctionGas: "28.6", branchKw: "—", outdoorKw: "—", notes: "配管相当長90m超(主管): 61.5〜68.0kWの液管のみ1サイズUP値" },
                    { code: "K", liquid: "19.1", highLowGas: "28.6", suctionGas: "38.1", branchKw: "68.1〜", outdoorKw: "73.0〜 (26HP〜)", notes: "—" },
                    { code: "L", liquid: "22.2", highLowGas: "28.6", suctionGas: "38.1", branchKw: "—", outdoorKw: "—", notes: "配管相当長90m超(主管): 73.0kW〜の液管のみ1サイズUP値" }
                ]
            }
        };

        // 室内機形状スタイルと対応可能容量 (kW) のマッピング
        this.INDOOR_STYLES = {
            cassette_4way: {
                name: "天井カセット形 4方向吹出 (MMU)",
                allowedKws: [2.2, 2.8, 3.6, 4.5, 5.6, 7.1, 8.0, 9.0, 11.2, 14.0, 16.0]
            },
            wall_mounted: {
                name: "壁掛形 (MMK)",
                allowedKws: [2.2, 2.8, 3.6, 4.5, 5.6, 7.1, 8.0]
            },
            ceiling_suspended: {
                name: "天井吊形 (MMC)",
                allowedKws: [3.6, 4.5, 5.6, 7.1, 8.0, 11.2, 14.0, 16.0]
            },
            floor_standing: {
                name: "床置形 (MMF)",
                allowedKws: [2.2, 2.8, 3.6, 4.5, 5.6, 7.1, 8.0]
            },
            ducted: {
                name: "天井埋込ダクト形 (MMD)",
                allowedKws: [2.2, 2.8, 3.6, 4.5, 5.6, 7.1, 8.0, 9.0, 11.2, 14.0, 16.0, 22.4, 28.0]
            }
        };

        // シリーズデータベース
        this.SERIES_DATABASE = {
            super_multi_u_y: {
                name: "スーパーマルチu (冷暖切換)",
                maxIndoorUnits: 64,
                outdoorCapacities: [
                    { hp: "8", kw: 22.4, model: "MMY-MAP2246HP" },
                    { hp: "10", kw: 28.0, model: "MMY-MAP2806HP" },
                    { hp: "12", kw: 33.5, model: "MMY-MAP3356HP" },
                    { hp: "14", kw: 40.0, model: "MMY-MAP4006HP" },
                    { hp: "16", kw: 45.0, model: "MMY-MAP4506HP" },
                    { hp: "18", kw: 50.0, model: "MMY-MAP5006HP" },
                    { hp: "20", kw: 56.0, model: "MMY-MAP5606HP" },
                    { hp: "22", kw: 61.5, model: "MMY-MAP6156HP" },
                    { hp: "24", kw: 68.0, model: "MMY-MAP6806HP" }
                ],
                indoorTypes: [
                    { type: "22形 (0.8馬力)", kw: 2.2 },
                    { type: "28形 (1.0馬力)", kw: 2.8 },
                    { type: "36形 (1.3馬力)", kw: 3.6 },
                    { type: "45形 (1.6馬力)", kw: 4.5 },
                    { type: "56形 (2.0馬力)", kw: 5.6 },
                    { type: "71形 (2.5馬力)", kw: 7.1 },
                    { type: "80形 (3.0馬力)", kw: 8.0 },
                    { type: "90形 (3.2馬力)", kw: 9.0 },
                    { type: "112形 (4.0馬力)", kw: 11.2 },
                    { type: "140形 (5.0馬力)", kw: 14.0 },
                    { type: "160形 (6.0馬力)", kw: 16.0 },
                    { type: "224形 (8.0馬力)", kw: 22.4 },
                    { type: "280形 (10.0馬力)", kw: 28.0 }
                ]
            },
            super_multi_u_r: {
                name: "スーパーマルチu (冷暖同時 3管式)",
                maxIndoorUnits: 50,
                outdoorCapacities: [
                    { hp: "8", kw: 22.4, model: "MMY-MUP2241HR9" },
                    { hp: "10", kw: 28.0, model: "MMY-MUP2801HR9" },
                    { hp: "12", kw: 33.5, model: "MMY-MUP3351HR9" },
                    { hp: "14", kw: 40.0, model: "MMY-MUP4001HR9" },
                    { hp: "16", kw: 45.0, model: "MMY-MUP4501HR9" },
                    { hp: "18", kw: 50.0, model: "MMY-MUP5001HR9" },
                    { hp: "20", kw: 56.0, model: "MMY-MUP5601HR9" }
                ],
                indoorTypes: [
                    { type: "22形 (0.8馬力)", kw: 2.2 },
                    { type: "28形 (1.0馬力)", kw: 2.8 },
                    { type: "36形 (1.3馬力)", kw: 3.6 },
                    { type: "45形 (1.6馬力)", kw: 4.5 },
                    { type: "56形 (2.0馬力)", kw: 5.6 },
                    { type: "71形 (2.5馬力)", kw: 7.1 },
                    { type: "80形 (3.0馬力)", kw: 8.0 },
                    { type: "90形 (3.2馬力)", kw: 9.0 },
                    { type: "112形 (4.0馬力)", kw: 11.2 },
                    { type: "140形 (5.0馬力)", kw: 14.0 },
                    { type: "160形 (6.0馬力)", kw: 16.0 },
                    { type: "224形 (8.0馬力)", kw: 22.4 },
                    { type: "280形 (10.0馬力)", kw: 28.0 }
                ]
            },
            super_multi_mini: {
                name: "スーパーマルチminiシリーズ",
                maxIndoorUnits: 9,
                outdoorCapacities: [
                    { hp: "4", kw: 11.2, model: "MCY-MAP1121HS" },
                    { hp: "5", kw: 14.0, model: "MCY-MAP1401HS" },
                    { hp: "6", kw: 15.5, model: "MCY-MAP1551HS" },
                    { hp: "8", kw: 22.4, model: "MCY-MAP2241HS" },
                    { hp: "10", kw: 28.0, model: "MCY-MAP2801HS" }
                ],
                indoorTypes: [
                    { type: "22形 (0.8馬力)", kw: 2.2 },
                    { type: "28形 (1.0馬力)", kw: 2.8 },
                    { type: "36形 (1.3馬力)", kw: 3.6 },
                    { type: "45形 (1.6馬力)", kw: 4.5 },
                    { type: "56形 (2.0馬力)", kw: 5.6 },
                    { type: "71形 (2.5馬力)", kw: 7.1 },
                    { type: "80形 (3.0馬力)", kw: 8.0 },
                    { type: "112形 (4.0馬力)", kw: 11.2 },
                    { type: "140形 (5.0馬力)", kw: 14.0 }
                ]
            }
        };
    }

    getValidIndoorOptions(seriesId, styleId) {
        const series = this.SERIES_DATABASE[seriesId];
        const style = this.INDOOR_STYLES[styleId];
        if (!series || !style) return [];
        return series.indoorTypes.filter(opt => style.allowedKws.includes(opt.kw));
    }

    generateModelNumber(node, seriesId) {
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
                case 'cassette_4way': return `MMU-AP0${capCode}7HP`;
                case 'wall_mounted': return `MMK-AP0${capCode}7HP`;
                case 'ceiling_suspended': return `MMC-AP0${capCode}7HP`;
                case 'floor_standing': return `MMF-AP0${capCode}7HP`;
                case 'ducted': return `MMD-AP0${capCode}7HP`;
                default: return `MM-${capCode}`;
            }
        }

        if (node.type === 'fs_unit') {
            return this.generateFSUnitModel(node);
        }

        return '';
    }

    /** FSユニット(流路切換ユニット)の型番選定 */
    generateFSUnitModel(node) {
        const kw = this.getDownstreamCapacity(node);
        const count = this.countIndoorUnitsDownstream(node);

        if (count === 1 && kw <= 16.0) {
            return "RBM-FR1115U (個別用)";
        } else {
            return "RBM-FR4015U (マルチ用/グループ用)";
        }
    }

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

    /** 2管式配管サイズ選定 */
    selectTwoPipeSize(kw, isManualSizeUp = false) {
        let liquid = 9.5;
        let gas = 15.9;

        if (kw <= 5.6) {
            liquid = 6.4; gas = 12.7;
        } else if (kw <= 9.0) {
            liquid = 9.5; gas = 15.9;
        } else if (kw <= 16.0) {
            liquid = 9.5; gas = 19.1;
        } else if (kw <= 28.0) {
            liquid = 9.5; gas = 22.2;
        } else if (kw <= 45.0) {
            liquid = 12.7; gas = 28.6;
        } else if (kw <= 56.0) {
            liquid = 15.9; gas = 28.6;
        } else {
            liquid = 19.1; gas = 38.1;
        }

        if (isManualSizeUp) {
            liquid = this.sizeUpPipe(liquid, this.LIQUID_SIZES);
            gas = this.sizeUpPipe(gas, this.GAS_SIZES);
        }

        return { liquid, gas };
    }

    /** 3管式 (室外機〜FSユニット間) 配管サイズ選定 */
    selectThreePipeSize(outdoorKw, isManualSizeUp = false) {
        let liquid = 9.5;
        let dischargeGas = 15.9; // 吐出ガス
        let suctionGas = 19.1;   // 吸入ガス

        if (outdoorKw <= 22.4) { // 8HP
            liquid = 9.5; dischargeGas = 15.9; suctionGas = 19.1;
        } else if (outdoorKw <= 28.0) { // 10HP
            liquid = 9.5; dischargeGas = 19.1; suctionGas = 22.2;
        } else if (outdoorKw <= 45.0) { // 12-16HP
            liquid = 12.7; dischargeGas = 19.1; suctionGas = 28.6;
        } else if (outdoorKw <= 56.0) { // 18-20HP
            liquid = 15.9; dischargeGas = 22.2; suctionGas = 28.6;
        } else { // 24HP-
            liquid = 19.1; dischargeGas = 28.6; suctionGas = 38.1;
        }

        if (isManualSizeUp) {
            liquid = this.sizeUpPipe(liquid, this.LIQUID_SIZES);
            // ※3管式（冷暖同時）は技術資料に従い「液管のみ」サイズアップ（吐出ガス・吸入ガスはサイズアップしない）
        }

        return { liquid, dischargeGas, suctionGas };
    }

    sizeUpPipe(current, list) {
        const idx = list.indexOf(current);
        if (idx !== -1 && idx < list.length - 1) {
            return list[idx + 1];
        }
        return current;
    }

    /** 分岐ジョイント選定 (日本キャリア RBM-BY) */
    selectJointModel(kw) {
        if (kw <= 22.4) return "RBM-BY55";
        if (kw <= 68.0) return "RBM-BY105";
        return "RBM-BY205";
    }

    calculateSystem(rootNode, seriesId, isManualSizeUp = false) {
        if (!rootNode || rootNode.type !== 'outdoor') {
            return { error: 'Invalid root node' };
        }

        const warnings = [];
        // メーカー公式資料との一致確認が未完了。計算が正常終了しても設計上の確定値とはしない。
        warnings.push({
            type: 'danger',
            message: '【型式・施工基準未照合】このキャリアアプリの登録型式・冷媒・配管径テーブルは、対象メーカー公式資料との一致確認が完了していません。表示される管径・分岐部材・BOM・許容長の判定を確定設計値として使用せず、対象機種の正式な施工資料で照合してください。'
        });

        const totals = {
            liquidPipes: {},
            gasPipes: {},
            highGasPipes: {}, // 吐出ガス
            lowGasPipes: {},  // 吸入ガス
            joints: {},
            totalLength: 0
        };

        const totalIndoorKw = this.getDownstreamCapacity(rootNode);
        const totalIndoorCount = this.countIndoorUnitsDownstream(rootNode);
        const series = this.SERIES_DATABASE[seriesId];

        if (series) {
            const outdoorCap = rootNode.capacity;
            const ratio = (totalIndoorKw / outdoorCap) * 100;
            
            if (totalIndoorCount > series.maxIndoorUnits) {
                warnings.push({
                    type: 'danger',
                    message: `室内機の接続台数制限(${series.maxIndoorUnits}台)を超えています。現在: ${totalIndoorCount}台`
                });
            }

            if (ratio < 50 || ratio > 130) {
                warnings.push({
                    type: 'info',
                    message: `室外機容量に対する接続室内機合計比率が適正範囲(50%〜130%)を外れています。現在: ${ratio.toFixed(1)}% (${totalIndoorKw.toFixed(1)} kW / 室外機: ${outdoorCap.toFixed(1)} kW)`
                });
            }
        }

        this.processNodeSizing(rootNode, seriesId, isManualSizeUp, false, rootNode.capacity, totals, warnings);

        return {
            tree: rootNode,
            warnings: warnings,
            totals: totals
        };
    }

    processNodeSizing(node, seriesId, isManualSizeUp, inFSDownstream, outdoorCap, totals, warnings) {
        node.modelNumber = this.generateModelNumber(node, seriesId);

        if (node.children && node.children.length > 0) {
            node.children.forEach(child => {
                const childKw = this.getDownstreamCapacity(child);
                child.capacitySum = childKw;

                const len = child.length || 0;
                totals.totalLength += len;

                if (child.type === 'indoor') {
                    // ★末端の室内機につながる冷媒管はどのシリーズ・メーカーでも必ず2管（液管・ガス管）
                    const sizes = this.selectTwoPipeSize(childKw, isManualSizeUp);
                    child.pipeSizeText = `液管: φ${sizes.liquid} / ガス管: φ${sizes.gas}`;
                    child.pipes = { type: '2pipe', liquid: sizes.liquid, gas: sizes.gas };

                    totals.liquidPipes[sizes.liquid] = (totals.liquidPipes[sizes.liquid] || 0) + len;
                    totals.gasPipes[sizes.gas] = (totals.gasPipes[sizes.gas] || 0) + len;

                    if (seriesId === 'super_multi_u_r' && !inFSDownstream) {
                        warnings.push({
                            type: 'danger',
                            message: `冷暖同時(スーパーマルチu)系統では、室内機の上流にFSユニット(流路切替ユニット)の設置が必要です。(${child.name})`
                        });
                    }

                    this.processNodeSizing(child, seriesId, isManualSizeUp, inFSDownstream, outdoorCap, totals, warnings);
                } else if (seriesId === 'super_multi_u_r') {
                    // super_multi_u_r (冷暖同時 3管式)
                    if (!inFSDownstream) {
                        // FSユニット上流（室外機〜分岐継手、分岐継手〜分岐継手、分岐継手〜FSユニット）: 3管式
                        const sizes = this.selectThreePipeSize(outdoorCap, isManualSizeUp);
                        child.pipeSizeText = `液管: φ${sizes.liquid} / 吐出ガス: φ${sizes.dischargeGas} / 吸入ガス: φ${sizes.suctionGas}`;
                        child.pipes = { type: '3pipe', liquid: sizes.liquid, highGas: sizes.dischargeGas, lowGas: sizes.suctionGas };

                        totals.liquidPipes[sizes.liquid] = (totals.liquidPipes[sizes.liquid] || 0) + len;
                        totals.highGasPipes[sizes.dischargeGas] = (totals.highGasPipes[sizes.dischargeGas] || 0) + len;
                        totals.lowGasPipes[sizes.suctionGas] = (totals.lowGasPipes[sizes.suctionGas] || 0) + len;

                        const nextInFS = child.type === 'fs_unit';
                        this.processNodeSizing(child, seriesId, isManualSizeUp, nextInFS, outdoorCap, totals, warnings);
                    } else {
                        // FSユニット下流: 2管式
                        const sizes = this.selectTwoPipeSize(childKw, isManualSizeUp);
                        child.pipeSizeText = `液管: φ${sizes.liquid} / ガス管: φ${sizes.gas}`;
                        child.pipes = { type: '2pipe', liquid: sizes.liquid, gas: sizes.gas };

                        totals.liquidPipes[sizes.liquid] = (totals.liquidPipes[sizes.liquid] || 0) + len;
                        totals.gasPipes[sizes.gas] = (totals.gasPipes[sizes.gas] || 0) + len;

                        this.processNodeSizing(child, seriesId, isManualSizeUp, true, outdoorCap, totals, warnings);
                    }
                } else {
                    // 通常の2管式 (super_multi_u_y, super_multi_mini)
                    const sizes = this.selectTwoPipeSize(childKw, isManualSizeUp);
                    child.pipeSizeText = `液管: φ${sizes.liquid} / ガス管: φ${sizes.gas}`;
                    child.pipes = { type: '2pipe', liquid: sizes.liquid, gas: sizes.gas };

                    totals.liquidPipes[sizes.liquid] = (totals.liquidPipes[sizes.liquid] || 0) + len;
                    totals.gasPipes[sizes.gas] = (totals.gasPipes[sizes.gas] || 0) + len;

                    this.processNodeSizing(child, seriesId, isManualSizeUp, false, outdoorCap, totals, warnings);
                }

                    // 分岐継手は子ノードごとに重複集計せず、分岐ノード単位で集計する。

                    if (child.type === 'fs_unit' && seriesId !== 'super_multi_u_r') {
                        warnings.push({
                            type: 'danger',
                            message: `冷暖切換またはminiシリーズにFSユニットは追加できません。接続を削除してください。`
                        });
                    }

            });
        }

        // 分岐継手は、分岐ノードの下流合計容量から型番を決め、分岐1箇所につき1個集計する。
        if (node.type === 'branch') {
            node.jointModel = this.selectJointModel(this.getDownstreamCapacity(node));
            totals.joints[node.jointModel] = (totals.joints[node.jointModel] || 0) + 1;
        }

        if ((node.type === 'fs_unit') && node.modelNumber) {
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
   SpecChecker – 仕様・品番 定期チェックユーティリティ (日本キャリア用)
   ========================================================================== */
class SpecChecker {
    constructor(engineInstance) {
        this.engine = engineInstance;
        this.SNAPSHOT_KEY   = 'carrier_sizer_spec_snapshot';
        this.HISTORY_KEY    = 'carrier_sizer_spec_history';
        this.LAST_CHECK_KEY = 'carrier_sizer_last_check_date';
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
