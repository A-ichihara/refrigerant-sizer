/**
 * Daikin Refrigerant Sizing Calculation Engine (完全版)
 * 
 * 対応シリーズ:
 * 1. VRV7 X (標準)
 * 2. VRV7 X 高COP (高効率)
 * 3. VRV7 A
 * 4. VRV7 RX (寒冷地仕様)
 * 5. VRV R (冷暖フリー 3管式)
 * 6. R32machiマルチ (店舗・オフィス)
 * 7. 設備用エアコンマルチ
 * 
 * 主な機能:
 * - メーカー品番（型番）の動的生成
 * - 液管・ガス管（2管式）/ 液管・高低圧ガス管・吸入ガス管（3管式）の配管サイズ選定
 * - 分岐継手（リフレネット）の自動選定
 * - 形状・シリーズ積集合による適合容量ロック
 * - 接続要領診断（総配管長・第1分岐後40m/90mルール）
 */

class RefrigerantSizerEngine {
    constructor() {
        // 液管サイズ一覧 (mm φ)
        this.LIQUID_SIZES = [6.4, 9.5, 12.7, 15.9, 19.1, 22.2, 25.4];
        // ガス管サイズ一覧 (mm φ) - 2管式・3管式共用
        this.GAS_SIZES = [9.5, 12.7, 15.9, 19.1, 22.2, 25.4, 28.6, 31.8, 34.9, 38.1, 41.3, 44.5, 54.0];

        // 室内機形状スタイルと対応可能容量 (kW) のマッピング
        this.INDOOR_STYLES = {
            cassette_4way: {
                name: "天井埋込カセット形 4方向吹出",
                allowedKws: [2.2, 2.8, 3.6, 4.5, 5.6, 7.1, 8.0, 9.0, 11.2, 14.0, 16.0]
            },
            wall_mounted: {
                name: "壁掛形",
                allowedKws: [2.2, 2.8, 3.6, 4.5, 5.6, 7.1, 8.0]
            },
            ceiling_suspended: {
                name: "天井吊形",
                allowedKws: [3.6, 4.5, 5.6, 7.1, 8.0, 11.2, 14.0, 16.0]
            },
            floor_standing: {
                name: "床置形",
                allowedKws: [2.2, 2.8, 3.6, 4.5, 5.6, 7.1, 8.0, 11.2, 14.0]
            },
            ducted: {
                name: "天井埋込ダクト形",
                allowedKws: [2.2, 2.8, 3.6, 4.5, 5.6, 7.1, 8.0, 9.0, 11.2, 14.0, 16.0, 22.4, 28.0, 45.0, 56.0]
            },
            industrial_floor: {
                name: "設備用床置形",
                allowedKws: [11.2, 14.0, 16.0, 22.4, 28.0, 45.0, 56.0]
            },
            industrial_ducted: {
                name: "設備用ダクト形",
                allowedKws: [11.2, 14.0, 16.0, 22.4, 28.0, 45.0, 56.0]
            }
        };

        // シリーズデータベース
        this.SERIES_DATABASE = {
            vrv7_x: {
                name: "VRV 7 Xシリーズ (冷暖切換)",
                refrigerant: "R32",
                pipeSystem: "2pipe",   // 2管式
                maxIndoorUnits: 64,
                maxPipingTotal: 1000,
                maxLongestPath: 165,
                outdoorCapacities: [
                    { hp: 5, kw: 14.0 }, { hp: 6, kw: 16.0 }, { hp: 8, kw: 22.4 }, { hp: 10, kw: 28.0 },
                    { hp: 12, kw: 33.5 }, { hp: 14, kw: 40.0 }, { hp: 16, kw: 45.0 }, { hp: 18, kw: 50.0 },
                    { hp: 20, kw: 56.0 }, { hp: 22, kw: 61.5 }, { hp: 24, kw: 68.0 }, { hp: 26, kw: 73.0 },
                    { hp: 28, kw: 78.5 }, { hp: 30, kw: 85.0 }, { hp: 32, kw: 90.0 }, { hp: 34, kw: 96.0 },
                    { hp: 36, kw: 101.0 }, { hp: 38, kw: 107.0 }, { hp: 40, kw: 113.0 }, { hp: 42, kw: 118.0 },
                    { hp: 44, kw: 124.0 }, { hp: 46, kw: 130.0 }, { hp: 48, kw: 135.0 }, { hp: 50, kw: 141.0 },
                    { hp: 52, kw: 146.0 }, { hp: 54, kw: 152.0 }, { hp: 56, kw: 157.0 }, { hp: 58, kw: 163.0 },
                    { hp: 60, kw: 168.0 }
                ],
                indoorTypes: [
                    { type: "22形 (0.8馬力)", kw: 2.2 }, { type: "28形 (1.0馬力)", kw: 2.8 }, { type: "36形 (1.25馬力)", kw: 3.6 },
                    { type: "45形 (1.6馬力)", kw: 4.5 }, { type: "56形 (2.0馬力)", kw: 5.6 }, { type: "71形 (2.5馬力)", kw: 7.1 },
                    { type: "80形 (3.0馬力)", kw: 8.0 }, { type: "90形 (3.2馬力)", kw: 9.0 }, { type: "112形 (4.0馬力)", kw: 11.2 },
                    { type: "140形 (5.0馬力)", kw: 14.0 }, { type: "160形 (6.0馬力)", kw: 16.0 }, { type: "224形 (8.0馬力)", kw: 22.4 },
                    { type: "280形 (10.0馬力)", kw: 28.0 }
                ]
            },
            vrv7_x_high_cop: {
                name: "VRV 7 X高COPシリーズ (冷暖切換)",
                refrigerant: "R32",
                pipeSystem: "2pipe",
                maxIndoorUnits: 64,
                maxPipingTotal: 1000,
                maxLongestPath: 165,
                outdoorCapacities: [
                    { hp: 5, kw: 14.0 }, { hp: 6, kw: 16.0 }, { hp: 8, kw: 22.4 }, { hp: 10, kw: 28.0 },
                    { hp: 12, kw: 33.5 }, { hp: 14, kw: 40.0 }, { hp: 16, kw: 45.0 }, { hp: 18, kw: 50.0 },
                    { hp: 20, kw: 56.0 }, { hp: 22, kw: 61.5 }, { hp: 24, kw: 68.0 }, { hp: 26, kw: 73.0 },
                    { hp: 28, kw: 78.5 }, { hp: 30, kw: 85.0 }, { hp: 32, kw: 90.0 }, { hp: 34, kw: 96.0 },
                    { hp: 36, kw: 101.0 }, { hp: 38, kw: 107.0 }, { hp: 40, kw: 113.0 }, { hp: 42, kw: 118.0 },
                    { hp: 44, kw: 124.0 }, { hp: 46, kw: 130.0 }, { hp: 48, kw: 135.0 }, { hp: 50, kw: 141.0 },
                    { hp: 52, kw: 146.0 }, { hp: 54, kw: 152.0 }
                ],
                indoorTypes: [
                    { type: "22形 (0.8馬力)", kw: 2.2 }, { type: "28形 (1.0馬力)", kw: 2.8 }, { type: "36形 (1.25馬力)", kw: 3.6 },
                    { type: "45形 (1.6馬力)", kw: 4.5 }, { type: "56形 (2.0馬力)", kw: 5.6 }, { type: "71形 (2.5馬力)", kw: 7.1 },
                    { type: "80形 (3.0馬力)", kw: 8.0 }, { type: "90形 (3.2馬力)", kw: 9.0 }, { type: "112形 (4.0馬力)", kw: 11.2 },
                    { type: "140形 (5.0馬力)", kw: 14.0 }, { type: "160形 (6.0馬力)", kw: 16.0 }, { type: "224形 (8.0馬力)", kw: 22.4 },
                    { type: "280形 (10.0馬力)", kw: 28.0 }
                ]
            },
            vrv7_a: {
                name: "VRV 7 Aシリーズ (冷暖切換)",
                refrigerant: "R32",
                pipeSystem: "2pipe",
                maxIndoorUnits: 64,
                maxPipingTotal: 1000,
                maxLongestPath: 165,
                outdoorCapacities: [
                    { hp: 5, kw: 14.0 }, { hp: 6, kw: 16.0 }, { hp: 8, kw: 22.4 }, { hp: 10, kw: 28.0 },
                    { hp: 12, kw: 33.5 }, { hp: 14, kw: 40.0 }, { hp: 16, kw: 45.0 }, { hp: 18, kw: 50.0 },
                    { hp: 20, kw: 56.0 }, { hp: 22, kw: 61.5 }, { hp: 24, kw: 68.0 }, { hp: 26, kw: 73.0 },
                    { hp: 28, kw: 78.5 }, { hp: 30, kw: 85.0 }, { hp: 32, kw: 90.0 }, { hp: 34, kw: 96.0 },
                    { hp: 36, kw: 101.0 }, { hp: 38, kw: 107.0 }, { hp: 40, kw: 113.0 }, { hp: 42, kw: 118.0 },
                    { hp: 44, kw: 124.0 }, { hp: 46, kw: 130.0 }, { hp: 48, kw: 135.0 }, { hp: 50, kw: 141.0 },
                    { hp: 52, kw: 146.0 }, { hp: 54, kw: 152.0 }, { hp: 56, kw: 157.0 }, { hp: 58, kw: 163.0 },
                    { hp: 60, kw: 168.0 }
                ],
                indoorTypes: [
                    { type: "22形 (0.8馬力)", kw: 2.2 }, { type: "28形 (1.0馬力)", kw: 2.8 }, { type: "36形 (1.25馬力)", kw: 3.6 },
                    { type: "45形 (1.6馬力)", kw: 4.5 }, { type: "56形 (2.0馬力)", kw: 5.6 }, { type: "71形 (2.5馬力)", kw: 7.1 },
                    { type: "80形 (3.0馬力)", kw: 8.0 }, { type: "90形 (3.2馬力)", kw: 9.0 }, { type: "112形 (4.0馬力)", kw: 11.2 },
                    { type: "140形 (5.0馬力)", kw: 14.0 }, { type: "160形 (6.0馬力)", kw: 16.0 }, { type: "224形 (8.0馬力)", kw: 22.4 },
                    { type: "280形 (10.0馬力)", kw: 28.0 }
                ]
            },
            vrv7_rx: {
                name: "高暖房VRV Hシリーズ (寒冷地仕様)",
                refrigerant: "R32",
                pipeSystem: "2pipe",
                maxIndoorUnits: 64,
                maxPipingTotal: 1000,
                maxLongestPath: 165,
                outdoorCapacities: [
                    { hp: 5, kw: 14.0 }, { hp: 6, kw: 16.0 }, { hp: 8, kw: 22.4 }, { hp: 10, kw: 28.0 },
                    { hp: 12, kw: 33.5 }, { hp: 14, kw: 40.0 }, { hp: 16, kw: 45.0 }, { hp: 18, kw: 50.0 },
                    { hp: 20, kw: 56.0 }, { hp: 22, kw: 61.5 }, { hp: 24, kw: 68.0 }, { hp: 26, kw: 73.0 },
                    { hp: 28, kw: 78.5 }, { hp: 30, kw: 85.0 }, { hp: 32, kw: 90.0 }, { hp: 34, kw: 96.0 },
                    { hp: 36, kw: 101.0 }, { hp: 38, kw: 107.0 }, { hp: 40, kw: 113.0 }, { hp: 42, kw: 118.0 },
                    { hp: 44, kw: 124.0 }, { hp: 46, kw: 130.0 }, { hp: 48, kw: 135.0 }, { hp: 50, kw: 141.0 },
                    { hp: 52, kw: 146.0 }, { hp: 54, kw: 152.0 }, { hp: 56, kw: 157.0 }, { hp: 58, kw: 163.0 },
                    { hp: 60, kw: 168.0 }
                ],
                indoorTypes: [
                    { type: "22形 (0.8馬力)", kw: 2.2 }, { type: "28形 (1.0馬力)", kw: 2.8 }, { type: "36形 (1.25馬力)", kw: 3.6 },
                    { type: "45形 (1.6馬力)", kw: 4.5 }, { type: "56形 (2.0馬力)", kw: 5.6 }, { type: "71形 (2.5馬力)", kw: 7.1 },
                    { type: "80形 (3.0馬力)", kw: 8.0 }, { type: "90形 (3.2馬力)", kw: 9.0 }, { type: "112形 (4.0馬力)", kw: 11.2 },
                    { type: "140形 (5.0馬力)", kw: 14.0 }, { type: "160形 (6.0馬力)", kw: 16.0 }, { type: "224形 (8.0馬力)", kw: 22.4 },
                    { type: "280形 (10.0馬力)", kw: 28.0 }
                ]
            },
            vrv_r: {
                name: "VRV 7 RXシリーズ (冷暖同時・3管式)",
                refrigerant: "R410A/R32",
                pipeSystem: "3pipe",   // ← 3管式フラグ
                maxIndoorUnits: 64,
                maxPipingTotal: 1000,
                maxLongestPath: 165,
                outdoorCapacities: [
                    { hp: 8, kw: 22.4 }, { hp: 10, kw: 28.0 }, { hp: 12, kw: 33.5 }, { hp: 14, kw: 40.0 },
                    { hp: 16, kw: 45.0 }, { hp: 18, kw: 50.0 }, { hp: 20, kw: 56.0 }, { hp: 22, kw: 61.5 },
                    { hp: 24, kw: 68.0 }, { hp: 26, kw: 73.0 }, { hp: 28, kw: 78.5 }, { hp: 30, kw: 85.0 },
                    { hp: 32, kw: 90.0 }, { hp: 34, kw: 96.0 }, { hp: 36, kw: 101.0 }, { hp: 38, kw: 107.0 },
                    { hp: 40, kw: 113.0 }, { hp: 42, kw: 118.0 }, { hp: 44, kw: 124.0 }, { hp: 46, kw: 130.0 },
                    { hp: 48, kw: 135.0 }, { hp: 50, kw: 141.0 }, { hp: 52, kw: 146.0 }, { hp: 54, kw: 152.0 }
                ],
                indoorTypes: [
                    { type: "22形 (0.8馬力)", kw: 2.2 }, { type: "28形 (1.0馬力)", kw: 2.8 }, { type: "36形 (1.25馬力)", kw: 3.6 },
                    { type: "45形 (1.6馬力)", kw: 4.5 }, { type: "56形 (2.0馬力)", kw: 5.6 }, { type: "71形 (2.5馬力)", kw: 7.1 },
                    { type: "80形 (3.0馬力)", kw: 8.0 }, { type: "90形 (3.2馬力)", kw: 9.0 }, { type: "112形 (4.0馬力)", kw: 11.2 },
                    { type: "140形 (5.0馬力)", kw: 14.0 }, { type: "160形 (6.0馬力)", kw: 16.0 }, { type: "224形 (8.0馬力)", kw: 22.4 },
                    { type: "280形 (10.0馬力)", kw: 28.0 }
                ]
            },
            machi_multi: {
                name: "machiマルチ",
                refrigerant: "R32",
                pipeSystem: "2pipe",
                maxIndoorUnits: 4,
                maxPipingTotal: 100,
                maxLongestPath: 50,
                outdoorCapacities: [
                    { hp: 3, kw: 8.0 }, { hp: 4, kw: 10.0 }, { hp: 5, kw: 12.5 },
                    { hp: 6, kw: 14.0 }, { hp: 8, kw: 22.4 }, { hp: 10, kw: 28.0 }
                ],
                indoorTypes: [
                    { type: "22形 (0.8馬力)", kw: 2.2 }, { type: "28形 (1.0馬力)", kw: 2.8 }, { type: "36形 (1.25馬力)", kw: 3.6 },
                    { type: "45形 (1.6馬力)", kw: 4.5 }, { type: "56形 (2.0馬力)", kw: 5.6 }, { type: "71形 (2.5馬力)", kw: 7.1 },
                    { type: "80形 (3.0馬力)", kw: 8.0 }, { type: "90形 (3.2馬力)", kw: 9.0 }, { type: "112形 (4.0馬力)", kw: 11.2 },
                    { type: "140形 (5.0馬力)", kw: 14.0 }, { type: "160形 (6.0馬力)", kw: 16.0 }
                ]
            },
            skyair: {
                name: "店舗・オフィス用エアコン (SkyAir)",
                refrigerant: "R32",
                pipeSystem: "2pipe",
                maxIndoorUnits: 4,
                maxPipingTotal: 120,
                maxLongestPath: 75,
                outdoorCapacities: [
                    { hp: 1.5, kw: 4.0 }, { hp: 2, kw: 5.0 }, { hp: 2.3, kw: 5.6 }, { hp: 2.5, kw: 6.3 },
                    { hp: 3, kw: 8.0 }, { hp: 4, kw: 10.0 }, { hp: 5, kw: 12.5 }, { hp: 6, kw: 14.0 },
                    { hp: 8, kw: 22.4 }, { hp: 10, kw: 28.0 }
                ],
                indoorTypes: [
                    { type: "40形 (1.5馬力)", kw: 4.0 }, { type: "50形 (2.0馬力)", kw: 5.0 }, { type: "56形 (2.3馬力)", kw: 5.6 },
                    { type: "63形 (2.5馬力)", kw: 6.3 }, { type: "80形 (3.0馬力)", kw: 8.0 }, { type: "112形 (4.0馬力)", kw: 11.2 },
                    { type: "140形 (5.0馬力)", kw: 14.0 }, { type: "160形 (6.0馬力)", kw: 16.0 }
                ]
            },
            package_industrial: {
                name: "設備用マルチ",
                refrigerant: "R410A/R32",
                pipeSystem: "2pipe",
                maxIndoorUnits: 1,
                maxPipingTotal: 300,
                maxLongestPath: 100,
                outdoorCapacities: [
                    { hp: 8, kw: 22.4 }, { hp: 10, kw: 28.0 }, { hp: 12, kw: 33.5 }, { hp: 14, kw: 40.0 },
                    { hp: 16, kw: 45.0 }, { hp: 18, kw: 50.0 }, { hp: 20, kw: 56.0 }, { hp: 22, kw: 61.5 },
                    { hp: 24, kw: 68.0 }, { hp: 26, kw: 73.0 }, { hp: 28, kw: 78.5 }, { hp: 30, kw: 85.0 },
                    { hp: 32, kw: 90.0 }, { hp: 34, kw: 96.0 }, { hp: 36, kw: 101.0 }, { hp: 38, kw: 107.0 },
                    { hp: 40, kw: 113.0 }, { hp: 42, kw: 118.0 }, { hp: 44, kw: 124.0 }, { hp: 46, kw: 130.0 },
                    { hp: 48, kw: 135.0 }, { hp: 50, kw: 141.0 }, { hp: 52, kw: 146.0 }, { hp: 54, kw: 152.0 },
                    { hp: 56, kw: 157.0 }, { hp: 58, kw: 163.0 }, { hp: 60, kw: 168.0 }
                ],
                indoorTypes: [
                    { type: "112形 (4.0馬力)", kw: 11.2 }, { type: "140形 (5.0馬力)", kw: 14.0 },
                    { type: "160形 (6.0馬力)", kw: 16.0 }, { type: "224形 (8.0馬力)", kw: 22.4 }, { type: "280形 (10.0馬力)", kw: 28.0 },
                    { type: "450形 (16.0馬力)", kw: 45.0 }, { type: "560形 (20.0馬力)", kw: 56.0 }
                ]
            }
        };
    }

    /**
     * シリーズとスタイルの積集合で有効な室内機容量オプションを返す
     */
    getValidIndoorOptions(seriesId, styleKey) {
        const seriesConfig = this.SERIES_DATABASE[seriesId] || this.SERIES_DATABASE.vrv7_x;
        const styleConfig = this.INDOOR_STYLES[styleKey] || this.INDOOR_STYLES.cassette_4way;
        return seriesConfig.indoorTypes.filter(type =>
            styleConfig.allowedKws.some(kw => Math.abs(kw - type.kw) < 0.1)
        );
    }

    /**
     * メーカー品番（型番）の動的生成
     */
    generateModelNumber(node, seriesId) {
        if (!node) return "-";

        if (node.type === 'outdoor') {
            const kwNum = Math.round(node.capacity * 10);
            switch (seriesId) {
                case 'vrv7_x_high_cop': return `RXHA${kwNum}A`;
                case 'vrv7_a':          return `RXYA${kwNum}A`;
                case 'vrv7_rx':         return `RQYHP${kwNum}A`;   // 寒冷地仕様
                case 'vrv_r':           return `REYA${kwNum}A`;  // 冷暖フリー
                case 'machi_multi':     return `RZYP${kwNum}F`;
                case 'skyair':          return `RZRP${kwNum}B`;
                case 'package_industrial': return `SZYP${kwNum}F`;
                case 'vrv7_x':
                default:                return `RXGA${kwNum}A`;
            }
        } else if (node.type === 'indoor') {
            const kwNum = Math.round(node.capacity * 10);
            const style = node.indoorStyle || 'cassette_4way';
            switch (style) {
                case 'wall_mounted':       return `FXYAP${kwNum}A`;
                case 'ceiling_suspended':  return `FXYHP${kwNum}A`;
                case 'floor_standing':     return `FXYVP${kwNum}A`;
                case 'industrial_floor':   return `FVYP${kwNum}A`;
                case 'industrial_ducted':  return `FXYSP${kwNum}A`;
                case 'ducted':
                    return kwNum > 280 ? `SVP${kwNum}A` : `FXYDP${kwNum}A`;
                case 'cassette_4way':
                default:                   return `FXYFP${kwNum}A`;
            }
        } else if (node.type === 'branch') {
            return node.jointModel || "-";
        } else if (node.type === 'bs_unit') {
            return this.generateBSUnitModel(node);
        }
        return "-";
    }

    generateBSUnitModel(node) {
        const indoorCount = this.countIndoors(node);
        if (indoorCount === 1) {
            return node.downstreamCapacity <= 8.0 ? "BSBP80A" : "BSBP160A";
        }
        if (indoorCount <= 4)  return "BSBP43A";
        if (indoorCount <= 8)  return "BSBP83A";
        if (indoorCount <= 12) return "BSBP123A";
        return "BSBP163A";
    }

    // ==================== 2管式 配管サイズ選定 ====================

    getBranchPipeSize(capacityKw, seriesId) {
        if (seriesId === 'machi_multi' || seriesId === 'skyair') {
            if (capacityKw < 16.0)       return { liquid: 9.5, gas: 15.9 };
            if (capacityKw < 22.4)       return { liquid: 9.5, gas: 19.1 };
                                         return { liquid: 9.5, gas: 22.2 };
        }
        if (seriesId === 'package_industrial') {
            if (capacityKw < 16.0)       return { liquid: 9.5,  gas: 15.9 };
            if (capacityKw < 22.4)       return { liquid: 9.5,  gas: 19.1 };
            if (capacityKw < 33.0)       return { liquid: 9.5,  gas: 22.2 };
            if (capacityKw < 47.0)       return { liquid: 12.7, gas: 28.6 };
            if (capacityKw < 71.0)       return { liquid: 15.9, gas: 28.6 };
            if (capacityKw < 101.0)      return { liquid: 19.1, gas: 34.9 };
            if (capacityKw < 135.0)      return { liquid: 19.1, gas: 41.3 };
                                         return { liquid: 22.2, gas: 44.5 };
        }
        // 標準VRV (vrv7_x, vrv7_x_high_cop, vrv7_a, vrv7_rx)
        if (capacityKw < 16.0)           return { liquid: 9.5,  gas: 15.9 };
        if (capacityKw < 22.4)           return { liquid: 9.5,  gas: 19.1 };
        if (capacityKw < 33.0)           return { liquid: 9.5,  gas: 22.2 };
        if (capacityKw < 47.0)           return { liquid: 12.7, gas: 28.6 };
        if (capacityKw < 71.0)           return { liquid: 15.9, gas: 28.6 };
        if (capacityKw < 101.0)          return { liquid: 19.1, gas: 34.9 };
                                         return { liquid: 19.1, gas: 41.3 };
    }

    getOutdoorMainPipeSize(outdoorKw, seriesId) {
        if (seriesId === 'machi_multi' || seriesId === 'skyair') {
            if (outdoorKw <= 14.0) return { liquid: 9.5, gas: 15.9 };
            if (outdoorKw <= 22.4) return { liquid: 9.5, gas: 19.1 };
                                   return { liquid: 9.5, gas: 22.2 };
        }
        if (seriesId === 'package_industrial') {
            if (outdoorKw <= 22.4)  return { liquid: 9.5,  gas: 19.1 };
            if (outdoorKw <= 28.0)  return { liquid: 9.5,  gas: 22.2 };
            if (outdoorKw <= 45.0)  return { liquid: 12.7, gas: 28.6 };
            if (outdoorKw <= 61.5)  return { liquid: 15.9, gas: 28.6 };
            if (outdoorKw <= 101.0) return { liquid: 19.1, gas: 34.9 };
            if (outdoorKw <= 135.0) return { liquid: 19.1, gas: 41.3 };
                                    return { liquid: 22.2, gas: 44.5 };
        }
        // 標準VRV全シリーズ共通
        if (outdoorKw <= 14.0)  return { liquid: 9.5,  gas: 15.9 };
        if (outdoorKw <= 22.4)  return { liquid: 9.5,  gas: 19.1 };
        if (outdoorKw <= 28.0)  return { liquid: 9.5,  gas: 22.2 };
        if (outdoorKw <= 40.0)  return { liquid: 12.7, gas: 28.6 };
        if (outdoorKw <= 61.5)  return { liquid: 15.9, gas: 28.6 };
        if (outdoorKw <= 96.0)  return { liquid: 19.1, gas: 34.9 };
                                return { liquid: 19.1, gas: 41.3 };
    }

    // ==================== 3管式（VRV R冷暖フリー）配管サイズ選定 ====================

    /**
     * 3管式（液・高低圧ガス・吸入ガス）の分岐後配管サイズを返す
     */
    getBranchPipeSize3(capacityKw) {
        if (capacityKw < 16.0)  return { liquid: 9.5,  highLowGas: 15.9, suctionGas: 19.1 };
        if (capacityKw < 22.4)  return { liquid: 12.7, highLowGas: 19.1, suctionGas: 22.2 };
        if (capacityKw < 33.0)  return { liquid: 15.9, highLowGas: 22.2, suctionGas: 25.4 };
        if (capacityKw < 47.0)  return { liquid: 15.9, highLowGas: 22.2, suctionGas: 28.6 };
        if (capacityKw < 71.0)  return { liquid: 19.1, highLowGas: 25.4, suctionGas: 28.6 };
        if (capacityKw < 101.0) return { liquid: 19.1, highLowGas: 28.6, suctionGas: 31.8 };
                                 return { liquid: 19.1, highLowGas: 28.6, suctionGas: 38.1 };
    }

    /**
     * 3管式の室外機主管サイズを返す
     */
    getOutdoorMainPipeSize3(outdoorKw) {
        if (outdoorKw <= 22.4)  return { liquid: 9.5,  highLowGas: 15.9, suctionGas: 19.1 };
        if (outdoorKw <= 28.0)  return { liquid: 12.7, highLowGas: 19.1, suctionGas: 22.2 };
        if (outdoorKw <= 40.0)  return { liquid: 15.9, highLowGas: 22.2, suctionGas: 28.6 };
        if (outdoorKw <= 61.5)  return { liquid: 19.1, highLowGas: 25.4, suctionGas: 28.6 };
        if (outdoorKw <= 101.0) return { liquid: 19.1, highLowGas: 28.6, suctionGas: 31.8 };
                                 return { liquid: 19.1, highLowGas: 28.6, suctionGas: 38.1 };
    }

    // ==================== 分岐継手選定 ====================

    getJointModel(capacityKw, seriesId) {
        if (seriesId === 'machi_multi' || seriesId === 'skyair') {
            return capacityKw < 22.4 ? "KHRP26M22T" : "KHRP26M33T";
        }
        if (seriesId === 'package_industrial') {
            if (capacityKw < 29.0)  return "BHFP22P90";
            if (capacityKw < 64.0)  return "BHFP22P135";
            if (capacityKw < 104.0) return "BHFP22P224";
                                    return "BHFP22P375";
        }
        if (seriesId === 'vrv_r') {
            // 冷暖フリー用リフレネット
            if (capacityKw < 29.0)  return "KHRP26M22TA";
            if (capacityKw < 64.0)  return "KHRP26M33TA";
            if (capacityKw < 104.0) return "KHRP26M72TA";
                                    return "KHRP26M73TA";
        }
        // 標準VRV共通
        if (capacityKw < 29.0)  return "KHRP26A22T";
        if (capacityKw < 64.0)  return "KHRP26A33T";
        if (capacityKw < 104.0) return "KHRP26A72T";
                                 return "KHRP26A73T";
    }

    // ==================== サイズアップ ====================

    getNextSize(currentSize, type) {
        const sizes = type === 'liquid' ? this.LIQUID_SIZES : this.GAS_SIZES;
        const index = sizes.indexOf(currentSize);
        if (index !== -1 && index < sizes.length - 1) return sizes[index + 1];
        return currentSize;
    }

    // ==================== メイン計算 ====================

    setBSDownstreamFlags(node, inBSDownstream = false) {
        if (node.type === 'bs_unit') {
            node.inBSDownstream = false; // BSユニット自体は3管で接続
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

    calculateSystem(rootNode, seriesId = 'vrv7_x', enableSizeUp = false) {
        if (!rootNode || rootNode.type !== 'outdoor') {
            return { error: "Root node must be an outdoor unit" };
        }

        const seriesConfig = this.SERIES_DATABASE[seriesId] || this.SERIES_DATABASE.vrv7_x;
        const is3Pipe = seriesConfig.pipeSystem === '3pipe';
        const warnings = [];
        
        const tree = JSON.parse(JSON.stringify(rootNode));

        // 0. BSユニット下流フラグ設定 (冷暖フリー対応)
        this.setBSDownstreamFlags(tree, false);

        // 品番注入
        this.injectModelNumbers(tree, seriesId);

        // 1. 下流容量集計（ボトムアップ）
        this.computeDownstreamCapacities(tree);

        // 2. 初期配管サイズ選定
        this.selectInitialSizesForNode(tree, tree.capacity, seriesId);

        // 3. 最遠配管長の算出
        const paths = [];
        this.findLongestPaths(tree, 0, [], paths);
        let longestPath = paths.length > 0 ? Math.max(...paths.map(p => p.length)) : 0;

        // 4. 主管サイズアップ（90m以上またはマニュアル）
        const shouldSizeUp = enableSizeUp || (longestPath >= 90.0 && seriesId !== 'machi_multi' && seriesId !== 'skyair');
        if (shouldSizeUp) {
            this.applyMainPipeSizeUp(tree, is3Pipe);
            warnings.push(longestPath >= 90.0
                ? `最遠配管相当長が90mを超えているため（実測：${longestPath.toFixed(1)}m）、主管サイズを自動的に1サイズアップしました。`
                : "主配管のサイズアップ設定が強制適用されています。");
        }

        // 5. サイズ逆転防止（トップダウン）
        this.preventInversionForNode(tree, null);

        // 6. 接続要領診断
        const totalPipingLength = this.sumTotalPipingLength(tree);
        const firstBranchToIndoorMax = this.calculateFirstBranchToIndoorMax(tree);
        const totalIndoorCap = tree.downstreamCapacity;
        const ratio = (totalIndoorCap / tree.capacity) * 100;
        const indoorCount = this.countIndoors(tree);

        // 総配管長
        if (totalPipingLength > seriesConfig.maxPipingTotal) {
            warnings.push(`警告: システム全体の総配管実長（${totalPipingLength.toFixed(1)}m）が、メーカー許容限界値（${seriesConfig.maxPipingTotal}m）を超えています。配管を短縮するか系統を分割してください。`);
        }

        // 第1分岐後の40m/90mルール
        if (firstBranchToIndoorMax > 90.0) {
            warnings.push(`警告: 第1分岐以降の最遠配管実長（${firstBranchToIndoorMax.toFixed(1)}m）が、メーカー設計上限（90m）を超過しており設計不可です。第1分岐継手の位置を室外機側に近づけてください。`);
        } else if (firstBranchToIndoorMax > 40.0) {
            warnings.push(`注意: 第1分岐以降の最遠配管実長が40mを超えています（現在：${firstBranchToIndoorMax.toFixed(1)}m）。冷媒配管接続要領に準拠するためには、配管径の1サイズアップや異径継手の使用が必要になります。`);
        }

        // 最遠長
        if (longestPath > seriesConfig.maxLongestPath) {
            warnings.push(`警告: システムの最遠配管長（${longestPath.toFixed(1)}m）が、メーカー許容上限（${seriesConfig.maxLongestPath}m）を超えています。`);
        }

        // 各シリーズ固有チェック
        if (seriesId === 'machi_multi') {
            const match = seriesConfig.outdoorCapacities.find(o => Math.abs(o.kw - tree.capacity) < 0.1);
            const hp = match ? match.hp : 3;
            const maxUnits = hp <= 3 ? 2 : hp <= 5 ? 3 : 4;
            if (indoorCount > maxUnits) {
                warnings.push(`R32machiマルチ（室外機：${hp}馬力）における室内機の接続最大台数は【${maxUnits}台】です（現在：${indoorCount}台）。台数を削減してください。`);
            }
            if (ratio < 80 || ratio > 120) {
                warnings.push(`machiマルチの接続容量比が推奨範囲外です（現在の接続率：${ratio.toFixed(1)}% / 推奨：80%〜120%）。`);
            }
        } else if (seriesId === 'package_industrial') {
            if (indoorCount > 1) {
                warnings.push(`警告: 設備用エアコンはマルチ接続に対応していません。室内ユニットは1台のみ接続してください（現在：${indoorCount}台）。`);
            }
            if (ratio < 80 || ratio > 120) {
                warnings.push(`設備用エアコンの接続容量比が推奨範囲（80%〜120%）外です（現在の接続率：${ratio.toFixed(1)}%）。`);
            }
        } else {
            if (indoorCount > seriesConfig.maxIndoorUnits) {
                warnings.push(`${seriesConfig.name}における室内機の接続最大台数は【${seriesConfig.maxIndoorUnits}台】です（現在：${indoorCount}台）。`);
            }
            if (ratio < 50 || ratio > 130) {
                warnings.push(`${seriesConfig.name}の推奨接続率（50%〜130%）の範囲を逸脱しています（現在の接続率：${ratio.toFixed(1)}%）。`);
            }
        }

        // BSユニット台数制限チェック (冷暖フリー時)
        if (is3Pipe) {
            const checkBSUnits = (node) => {
                if (node.type === 'bs_unit') {
                    const N = this.countIndoors(node);
                    if (N > 16) {
                        warnings.push(`警告: BSユニット（${node.name}）の下流接続台数が制限（16台）を超えています（現在：${N}台）。系統を分割してください。`);
                    }
                }
                if (node.children) {
                    node.children.forEach(c => checkBSUnits(c));
                }
            };
            checkBSUnits(tree);
        }

        // 3管式専用警告
        if (is3Pipe) {
            warnings.push("情報: VRV Rシリーズ（冷暖フリー）の配管集計には、断熱施工が必要な「液管」「高低圧ガス管」「吸入ガス管」の3系統が含まれます。各管の断熱材種別は設備設計資料をご確認ください。");
        }

        // 7. 部材集計
        const summary = { liquidPipes: {}, gasPipes: {}, highLowGasPipes: {}, suctionGasPipes: {}, joints: {} };
        this.accumulateTotals(tree, summary);

        return {
            tree,
            warnings,
            is3Pipe,
            totals: {
                totalIndoorCapacity: totalIndoorCap,
                connectionRatio: ratio,
                longestPath,
                indoorCount,
                totalPipingLength,
                firstBranchToIndoorMax,
                liquidPipes: summary.liquidPipes,
                gasPipes: summary.gasPipes,
                highLowGasPipes: summary.highLowGasPipes,
                suctionGasPipes: summary.suctionGasPipes,
                joints: summary.joints
            }
        };
    }

    // ==================== ヘルパー ====================

    injectModelNumbers(node, seriesId) {
        node.modelNumber = this.generateModelNumber(node, seriesId);
        if (node.children) node.children.forEach(c => this.injectModelNumbers(c, seriesId));
    }

    sumTotalPipingLength(node) {
        let len = node.length || 0;
        if (node.children) node.children.forEach(c => { len += this.sumTotalPipingLength(c); });
        return len;
    }

    calculateFirstBranchToIndoorMax(rootNode) {
        if (!rootNode.children || rootNode.children.length === 0) return 0;
        const firstBranch = rootNode.children[0];
        const paths = [];
        this.findLongestPaths(firstBranch, 0, [], paths);
        if (paths.length === 0) return 0;
        const fbLen = firstBranch.length || 0;
        return Math.max(...paths.map(p => Math.max(0, p.length - fbLen)));
    }

    countIndoors(node) {
        if (node.type === 'indoor') return 1;
        let c = 0;
        if (node.children) node.children.forEach(ch => { c += this.countIndoors(ch); });
        return c;
    }

    computeDownstreamCapacities(node) {
        if (node.type === 'indoor') { node.downstreamCapacity = node.capacity; return node.capacity; }
        let sum = 0;
        if (node.children) node.children.forEach(c => { sum += this.computeDownstreamCapacities(c); });
        node.downstreamCapacity = sum;
        return sum;
    }

    // 3管/2管ハイブリッドサイズ選定
    selectInitialSizesForNode(node, outdoorKw, seriesId) {
        const seriesConfig = this.SERIES_DATABASE[seriesId] || this.SERIES_DATABASE.vrv7_x;
        const is3Pipe = seriesConfig.pipeSystem === '3pipe';

        if (is3Pipe && !node.inBSDownstream) {
            // BSユニット上流（3管）
            if (node.type === 'outdoor') {
                const s = this.getOutdoorMainPipeSize3(outdoorKw);
                node.pipeLiquid = s.liquid; node.pipeHighLowGas = s.highLowGas; node.pipeSuctionGas = s.suctionGas;
            } else {
                const s = this.getBranchPipeSize3(node.downstreamCapacity);
                node.pipeLiquid = s.liquid; node.pipeHighLowGas = s.highLowGas; node.pipeSuctionGas = s.suctionGas;
            }
            if (node.type === 'branch') {
                node.jointModel = this.getJointModel(node.downstreamCapacity, seriesId);
                node.modelNumber = node.jointModel;
            } else if (node.type === 'bs_unit') {
                node.jointModel = null;
                node.modelNumber = this.generateBSUnitModel(node);
            }
        } else {
            // BSユニット下流または通常シリーズ（2管）
            if (node.type === 'outdoor') {
                const s = this.getOutdoorMainPipeSize(outdoorKw, seriesId);
                node.pipeLiquid = s.liquid; node.pipeGas = s.gas;
            } else {
                const s = this.getBranchPipeSize(node.downstreamCapacity, seriesId);
                node.pipeLiquid = s.liquid; node.pipeGas = s.gas;
            }
            if (node.type === 'branch') {
                node.jointModel = this.getJointModel(node.downstreamCapacity, seriesId);
                node.modelNumber = node.jointModel;
            } else if (node.type === 'bs_unit') {
                node.jointModel = null;
                node.modelNumber = this.generateBSUnitModel(node);
            }
        }

        if (node.children) node.children.forEach(c => this.selectInitialSizesForNode(c, outdoorKw, seriesId));
    }

    applyMainPipeSizeUp(rootNode, is3Pipe) {
        if (rootNode.type !== 'outdoor') return;
        rootNode.pipeLiquid = this.getNextSize(rootNode.pipeLiquid, 'liquid');
        if (is3Pipe) {
            rootNode.pipeHighLowGas = this.getNextSize(rootNode.pipeHighLowGas, 'gas');
            rootNode.pipeSuctionGas = this.getNextSize(rootNode.pipeSuctionGas, 'gas');
        } else {
            rootNode.pipeGas = this.getNextSize(rootNode.pipeGas, 'gas');
        }
        rootNode.isSizedUp = true;
    }

    // 3管/2管ハイブリッド逆転防止
    preventInversionForNode(node, parent) {
        if (parent) {
            // 親が3管で子が3管の場合
            if (parent.pipeHighLowGas !== undefined && node.pipeHighLowGas !== undefined) {
                if (node.pipeLiquid > parent.pipeLiquid) { node.pipeLiquid = parent.pipeLiquid; node.liquidCorrected = true; }
                if (node.pipeHighLowGas > parent.pipeHighLowGas) { node.pipeHighLowGas = parent.pipeHighLowGas; node.highLowGasCorrected = true; }
                if (node.pipeSuctionGas > parent.pipeSuctionGas) { node.pipeSuctionGas = parent.pipeSuctionGas; node.suctionGasCorrected = true; }
            }
            // 親が3管で子が2管の場合（BSユニットの直下など）
            else if (parent.pipeHighLowGas !== undefined && node.pipeGas !== undefined) {
                if (node.pipeLiquid > parent.pipeLiquid) { node.pipeLiquid = parent.pipeLiquid; node.liquidCorrected = true; }
                if (node.pipeGas > parent.pipeSuctionGas) { node.pipeGas = parent.pipeSuctionGas; node.gasCorrected = true; }
            }
            // 親が2管で子が2管の場合
            else if (parent.pipeGas !== undefined && node.pipeGas !== undefined) {
                if (node.pipeLiquid > parent.pipeLiquid) { node.pipeLiquid = parent.pipeLiquid; node.liquidCorrected = true; }
                if (node.pipeGas > parent.pipeGas)       { node.pipeGas = parent.pipeGas; node.gasCorrected = true; }
            }
        }
        if (node.children) node.children.forEach(c => this.preventInversionForNode(c, node));
    }

    findLongestPaths(node, currentLength, currentPath, paths) {
        const newLen = currentLength + (node.length || 0);
        const newPath = [...currentPath, node];
        if (node.type === 'indoor') { paths.push({ length: newLen, path: newPath }); return; }
        if (node.children && node.children.length > 0) {
            node.children.forEach(c => this.findLongestPaths(c, newLen, newPath, paths));
        } else {
            paths.push({ length: newLen, path: newPath });
        }
    }

    accumulateTotals(node, summary) {
        if (node.type !== 'outdoor' && node.length > 0) {
            const len = node.length;
            const liq = node.pipeLiquid;
            summary.liquidPipes[liq] = (summary.liquidPipes[liq] || 0) + len;

            if (node.pipeHighLowGas !== undefined && node.pipeSuctionGas !== undefined) {
                // 3管として集計
                const hlg = node.pipeHighLowGas;
                const sg  = node.pipeSuctionGas;
                summary.highLowGasPipes[hlg] = (summary.highLowGasPipes[hlg] || 0) + len;
                summary.suctionGasPipes[sg]  = (summary.suctionGasPipes[sg]  || 0) + len;
            } else if (node.pipeGas !== undefined) {
                // 2管として集計
                const gs = node.pipeGas;
                summary.gasPipes[gs] = (summary.gasPipes[gs] || 0) + len;
            }
        }
        if (node.type === 'branch' && node.jointModel) {
            summary.joints[node.jointModel] = (summary.joints[node.jointModel] || 0) + 1;
        } else if (node.type === 'bs_unit' && node.modelNumber) {
            // BSユニット自体も継手・機器類として集計
            summary.joints[node.modelNumber] = (summary.joints[node.modelNumber] || 0) + 1;
        }
        if (node.children) node.children.forEach(c => this.accumulateTotals(c, summary));
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = RefrigerantSizerEngine;
} else {
    window.RefrigerantSizerEngine = RefrigerantSizerEngine;
}

/* ==========================================================================
   SpecChecker – 仕様・品番 定期チェックユーティリティ
   ==========================================================================
   概要:
     SERIES_DATABASE のスナップショット（JSON文字列）を localStorage に保存し、
     前回スナップショットとの差分を検出して変更履歴を記録します。
     外部マスターへの通信は行わず、engine.js 内の定義が変更された際に
     自動的に検知します（コード更新時のセルフチェック）。
   
   localStorage キー:
     - daikin_sizer_spec_snapshot  : 前回の SERIES_DATABASE JSON
     - daikin_sizer_spec_history   : 変更履歴の JSON 配列
     - daikin_sizer_last_check_date: 最終チェック日（ISO string）
   
   チェック間隔: 30日（設定可能）
   ========================================================================== */
class SpecChecker {
    constructor(engineInstance) {
        this.engine = engineInstance;
        this.SNAPSHOT_KEY   = 'daikin_sizer_spec_snapshot';
        this.HISTORY_KEY    = 'daikin_sizer_spec_history';
        this.LAST_CHECK_KEY = 'daikin_sizer_last_check_date';
        this.CHECK_INTERVAL_DAYS = 30;
    }

    /** 現在のSERIES_DATABASEをJSONスナップショットとして返す */
    _currentSnapshot() {
        // engine が持つ SERIES_DATABASE を対象にする
        const db = this.engine && this.engine.SERIES_DATABASE ? this.engine.SERIES_DATABASE : {};
        return JSON.stringify(db, null, 2);
    }

    /** 最終チェック日を取得（Dateオブジェクト or null） */
    getLastCheckDate() {
        const raw = localStorage.getItem(this.LAST_CHECK_KEY);
        return raw ? new Date(raw) : null;
    }

    /** チェックが必要か判定（30日経過 or 未チェック） */
    isCheckDue() {
        const last = this.getLastCheckDate();
        if (!last) return true;
        const diff = (Date.now() - last.getTime()) / (1000 * 60 * 60 * 24);
        return diff >= this.CHECK_INTERVAL_DAYS;
    }

    /** 履歴を全件取得（新しい順） */
    getHistory() {
        try {
            return JSON.parse(localStorage.getItem(this.HISTORY_KEY) || '[]');
        } catch {
            return [];
        }
    }

    /** 履歴に1件追加（最大50件保持） */
    _addHistory(entry) {
        const history = this.getHistory();
        history.unshift(entry); // 先頭に追加
        if (history.length > 50) history.splice(50);
        localStorage.setItem(this.HISTORY_KEY, JSON.stringify(history));
    }

    /**
     * チェックを実行する
     * @param {boolean} force - trueの場合は30日経過に関わらず強制実行
     * @returns {{ executed: boolean, entry: object|null }}
     */
    runCheck(force = false) {
        if (!force && !this.isCheckDue()) {
            return { executed: false, entry: null };
        }

        const now      = new Date();
        const nowIso   = now.toISOString();
        const current  = this._currentSnapshot();
        const previous = localStorage.getItem(this.SNAPSHOT_KEY);

        // 最終チェック日を更新
        localStorage.setItem(this.LAST_CHECK_KEY, nowIso);

        // 初回（前回スナップショットなし）
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

        // 差分検出
        const changes = this._diffSnapshots(previous, current);

        // スナップショットを更新
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

    /**
     * 2つのJSONスナップショット文字列を比較して変更点の配列を返す
     * 変更点: { path, type('added'|'removed'|'modified'), oldVal, newVal }
     */
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
                // 配列の場合は JSON 文字列比較
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

    /** 長い値を要約表現に変換（表示用） */
    _summary(val) {
        if (Array.isArray(val)) return `[配列: ${val.length}件]`;
        if (typeof val === 'object' && val !== null) return `{オブジェクト}`;
        return String(val);
    }
}

if (typeof window !== 'undefined') {
    window.SpecChecker = SpecChecker;
}
