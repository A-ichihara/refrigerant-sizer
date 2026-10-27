/**
 * Daikin Refrigerant Sizing Calculation Engine (完全版)
 * 
 * 対応シリーズ:
 * 1. VRV7 X (標準)
 * 2. VRV7 X 高COP (高効率)
 * 3. VRV7 A
 * 4. VRV R (冷暖フリー 3管式)
 * 5. R32machiマルチ (店舗・オフィス)
 * 6. 設備用エアコンマルチ
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

        // 全部入り冷媒サイズマスター表 (添付Excel表完全準拠)
        this.MASTER_PIPE_TABLES = {
            cooling_heating_switch: {
                title: "ダイキンEHP 【冷暖切替】 冷媒管サイズ表 (全パターン網羅)",
                systemType: "2pipe",
                rules: [
                    "① 室外機〜室内機間の配管相当長が90mを超える場合 → 主管の液管・ガス管共1サイズアップする。",
                    "② 第1分岐〜最遠の室内機までの配管長が40mを超える場合 → 第1分岐〜最遠の室内機が接続している分岐管までの液管・ガス管共1サイズアップする。",
                    "③ 室外内・外機間高低差が50mを超える場合（室外機が下の場合は40mを超える場合） → 室外機〜第1分岐まで（主管）の液管のみ1サイズアップする。",
                    "④ その他条件についてはダイキン技術資料、カタログの冷媒配管接続要領を必ず読むこと。"
                ],
                headers: ["記号", "液管 (mm)", "ガス管 (mm)", "室内機 (kW)", "分岐後 (kW)", "室内機合計kW / 室外機 (kW)", "備考 / サイズUP値"],
                rows: [
                    { code: "1", liquid: "6.4", gas: "12.7", indoorKw: "1.6〜5.6", branchKw: "—", outdoorKw: "—", notes: "—" },
                    { code: "2", liquid: "9.5", gas: "15.9", indoorKw: "7.1〜16.0", branchKw: "〜17.5", outdoorKw: "—", notes: "—" },
                    { code: "3", liquid: "9.5", gas: "19.1", indoorKw: "22.4", branchKw: "17.6〜22.9", outdoorKw: "22.4", notes: "—" },
                    { code: "4", liquid: "9.5", gas: "22.2", indoorKw: "28.0", branchKw: "23.0〜28.9", outdoorKw: "28.0", notes: "—" },
                    { code: "5", liquid: "12.7", gas: "19.1", indoorKw: "—", branchKw: "—", outdoorKw: "—", notes: "分岐〜最遠室内機間(②) : \"2\"の1サイズUPの値" },
                    { code: "6", liquid: "12.7", gas: "22.2", indoorKw: "—", branchKw: "29.0〜42.9", outdoorKw: "33.5, 40.0", notes: "配管相当長(①) : 22.4kWの1サイズUPの値(サイズUP対象 : 主管) / 分岐〜最遠室内機間(②) : \"3\"の1サイズUPの値" },
                    { code: "7", liquid: "12.7", gas: "25.4", indoorKw: "45.0, 56.0", branchKw: "43.0〜61.9", outdoorKw: "45.0〜61.5 (設備用PAC40.0 最大45.0)", notes: "配管相当長(①) : 28.0kWの1サイズUPの値(サイズUP対象 : 主管) / 分岐〜最遠室内機間(②) : \"4\"の1サイズUPの値" },
                    { code: "8", liquid: "12.7", gas: "28.6", indoorKw: "—", branchKw: "—", outdoorKw: "—", notes: "—" },
                    { code: "9", liquid: "15.9", gas: "25.4", indoorKw: "—", branchKw: "—", outdoorKw: "—", notes: "配管相当長(①) : 33.5, 40.0kWの1サイズUPの値(サイズUP対象 : 主管) / 分岐〜最遠室内機間(②) : \"5\"の1サイズUPの値" },
                    { code: "10", liquid: "15.9", gas: "28.6", indoorKw: "—", branchKw: "62.0〜86.9", outdoorKw: "67.0〜85.0", notes: "配管相当長(①) : 45.0〜61.5kWの1サイズUPの値(サイズUP対象 : 主管) / 分岐〜最遠室内機間(②) : \"6\"の1サイズUPの値" },
                    { code: "11", liquid: "15.9", gas: "31.8", indoorKw: "—", branchKw: "87.0〜112.9", outdoorKw: "90.0〜112.0", notes: "—" },
                    { code: "12", liquid: "19.1", gas: "31.8", indoorKw: "—", branchKw: "—", outdoorKw: "—", notes: "配管相当長(①) : 67.0〜85.0kWの1サイズUPの値(サイズUP対象 : 主管) / 分岐〜最遠室内機間(②) : \"10\"の1サイズUPの値" },
                    { code: "13", liquid: "19.1", gas: "38.1", indoorKw: "—", branchKw: "113.0〜", outdoorKw: "118.0〜", notes: "配管相当長(①) : 90.0〜112.0kWの1サイズUPの値(サイズUP対象 : 主管) / 分岐〜最遠室内機間(②) : \"10\"の1サイズUPの値" },
                    { code: "14", liquid: "22.2", gas: "38.1", indoorKw: "—", branchKw: "—", outdoorKw: "—", notes: "配管相当長(①) : 118.0kW〜の1サイズUPの値(サイズUP対象 : 主管) / 分岐〜最遠室内機間(②) : \"13\"の1サイズUPの値 (ガス管φ38.1のサイズUPは不可)" }
                ]
            },
            cooling_heating_free: {
                title: "ダイキンEHP 【冷暖フリー】 冷媒管サイズ表 (全パターン網羅)",
                systemType: "3pipe",
                rules: [
                    "① 室外機〜室内機間の配管相当長が90mを超える場合 → 主管の液管のみ1サイズアップする。",
                    "② 第1分岐〜最遠の室内機までの配管長が40mを超える場合 → 第1分岐〜最遠の室内機が接続している分岐管までの液管のみサイズアップする。",
                    "③ 室外内・外機間高低差が50mを超える場合（室外機が下の場合は40mを超える場合） → 室外機〜第1分岐まで（主管）の液管のみ1サイズアップする。",
                    "④ その他条件についてはダイキン技術資料、カタログの冷媒配管接続要領を必ず読むこと。"
                ],
                headers: ["記号", "液管 (mm)", "高低圧ガス管 (mm)", "吸入ガス管 (mm)", "分岐後 (kW)", "室内機合計kW / 室外機 (kW)", "備考 / サイズUP値"],
                rows: [
                    { code: "A", liquid: "9.5", highLowGas: "12.7", suctionGas: "15.9", branchKw: "〜17.4", outdoorKw: "—", notes: "—" },
                    { code: "B", liquid: "9.5", highLowGas: "15.9", suctionGas: "19.1", branchKw: "17.5〜22.9", outdoorKw: "22.4", notes: "—" },
                    { code: "C", liquid: "9.5", highLowGas: "15.9", suctionGas: "22.2", branchKw: "23.0〜28.9", outdoorKw: "28.0", notes: "—" },
                    { code: "D", liquid: "12.7", highLowGas: "12.7", suctionGas: "15.9", branchKw: "—", outdoorKw: "—", notes: "分岐〜最遠室内機間(②) : \"A\"の1サイズUPの値" },
                    { code: "E", liquid: "12.7", highLowGas: "15.9", suctionGas: "19.1", branchKw: "—", outdoorKw: "—", notes: "配管相当長(①) : 22.4kWの液管のみ1サイズUPの値(サイズUP対象 : 主管) / 分岐〜最遠室内機間(②) : \"B\"の液管のみ1サイズUPの値" },
                    { code: "F", liquid: "12.7", highLowGas: "15.9", suctionGas: "22.2", branchKw: "—", outdoorKw: "—", notes: "配管相当長(①) : 28.0kWの液管のみ1サイズUPの値(サイズUP対象 : 主管) / 分岐〜最遠室内機間(②) : \"C\"の液管のみ1サイズUPの値" },
                    { code: "G", liquid: "12.7", highLowGas: "19.1", suctionGas: "22.2", branchKw: "29.0〜42.9", outdoorKw: "33.5, 40.0", notes: "—" },
                    { code: "H", liquid: "12.7", highLowGas: "19.1", suctionGas: "25.4", branchKw: "43.0〜46.9", outdoorKw: "45.0", notes: "—" },
                    { code: "I", liquid: "12.7", highLowGas: "22.2", suctionGas: "25.4", branchKw: "47.0〜61.9", outdoorKw: "50.0〜61.5", notes: "—" },
                    { code: "J", liquid: "15.9", highLowGas: "19.1", suctionGas: "22.2", branchKw: "—", outdoorKw: "—", notes: "配管相当長(①) : 33.5, 40.0kWの液管のみ1サイズUPの値(サイズUP対象 : 主管) / 分岐〜最遠室内機間(②) : \"G\"の液管のみ1サイズUPの値" },
                    { code: "K", liquid: "15.9", highLowGas: "19.1", suctionGas: "25.4", branchKw: "—", outdoorKw: "—", notes: "配管相当長(①) : 45.0kWの液管のみ1サイズUPの値(サイズUP対象 : 主管) / 分岐〜最遠室内機間(②) : \"H\"の液管のみ1サイズUPの値" },
                    { code: "L", liquid: "15.9", highLowGas: "22.2", suctionGas: "25.4", branchKw: "—", outdoorKw: "—", notes: "配管相当長(①) : 50.0〜61.5kWの液管のみ1サイズUPの値(サイズUP対象 : 主管) / 分岐〜最遠室内機間(②) : \"I\"の液管のみ1サイズUPの値" },
                    { code: "M", liquid: "15.9", highLowGas: "22.2", suctionGas: "28.6", branchKw: "62.0〜74.9", outdoorKw: "67.0〜73.0", notes: "—" },
                    { code: "N", liquid: "15.9", highLowGas: "25.4", suctionGas: "28.6", branchKw: "75.0〜86.9", outdoorKw: "77.5〜85.0", notes: "—" },
                    { code: "O", liquid: "15.9", highLowGas: "25.4", suctionGas: "31.8", branchKw: "87.0〜101.9", outdoorKw: "90.0〜100.0", notes: "—" },
                    { code: "P", liquid: "15.9", highLowGas: "28.6", suctionGas: "31.8", branchKw: "102.0〜112.9", outdoorKw: "106.0〜112.0", notes: "—" },
                    { code: "Q", liquid: "19.1", highLowGas: "22.2", suctionGas: "28.6", branchKw: "—", outdoorKw: "—", notes: "配管相当長(①) : 67.0〜73.0kWの液管のみ1サイズUPの値(サイズUP対象 : 主管) / 分岐〜最遠室内機間(②) : \"M\"の液管のみ1サイズUPの値" },
                    { code: "R", liquid: "19.1", highLowGas: "25.4", suctionGas: "28.6", branchKw: "—", outdoorKw: "—", notes: "配管相当長(①) : 77.5〜85.0kWの液管のみ1サイズUPの値(サイズUP対象 : 主管) / 分岐〜最遠室内機間(②) : \"N\"の液管のみ1サイズUPの値" },
                    { code: "S", liquid: "19.1", highLowGas: "25.4", suctionGas: "31.8", branchKw: "—", outdoorKw: "—", notes: "配管相当長(①) : 90.0〜100.0kWの液管のみ1サイズUPの値(サイズUP対象 : 主管) / 分岐〜最遠室内機間(②) : \"O\"の液管のみ1サイズUPの値" },
                    { code: "T", liquid: "19.1", highLowGas: "28.6", suctionGas: "31.8", branchKw: "—", outdoorKw: "—", notes: "配管相当長(①) : 106.0〜112.0kWの液管のみ1サイズUPの値(サイズUP対象 : 主管) / 分岐〜最遠室内機間(②) : \"P\"の液管のみ1サイズUPの値" },
                    { code: "U", liquid: "19.1", highLowGas: "28.6", suctionGas: "38.1", branchKw: "113.0〜", outdoorKw: "118.0〜150.0", notes: "—" },
                    { code: "V", liquid: "22.2", highLowGas: "28.6", suctionGas: "38.1", branchKw: "—", outdoorKw: "—", notes: "配管相当長(①) : 118.0〜150.0kWの液管のみ1サイズUPの値(サイズUP対象 : 主管) / 分岐〜最遠室内機間(②) : \"U\"の液管のみ1サイズUPの値" }
                ]
            }
        };

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
                    { hp: 8, kw: 22.4 }, { hp: 10, kw: 28.0 }, { hp: 12, kw: 33.5 }, { hp: 14, kw: 40.0 },
                    { hp: 16, kw: 45.0 }, { hp: 18, kw: 50.0 }, { hp: 20, kw: 56.0 }, { hp: 22, kw: 61.5 },
                    { hp: 24, kw: 67.0 }, { hp: 26, kw: 73.0 }, { hp: 28, kw: 77.5 }, { hp: 30, kw: 85.0 },
                    { hp: 32, kw: 90.0 }, { hp: 34, kw: 95.0 }, { hp: 36, kw: 100.0 }, { hp: 38, kw: 106.0 },
                    { hp: 40, kw: 112.0 }, { hp: 42, kw: 118.0 }, { hp: 44, kw: 122.0 }, { hp: 46, kw: 128.0 },
                    { hp: 48, kw: 136.0 }
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
                    { hp: 8, kw: 22.4 }, { hp: 10, kw: 28.0 }, { hp: 12, kw: 33.5 }, { hp: 14, kw: 40.0 },
                    { hp: 16, kw: 45.0 }, { hp: 18, kw: 50.0 }, { hp: 20, kw: 56.0 }, { hp: 22, kw: 61.5 },
                    { hp: 24, kw: 67.0 }, { hp: 26, kw: 73.0 }, { hp: 28, kw: 77.5 }, { hp: 30, kw: 85.0 },
                    { hp: 32, kw: 90.0 }, { hp: 34, kw: 95.0 }, { hp: 36, kw: 100.0 }
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
                    { hp: 8, kw: 22.4 }, { hp: 10, kw: 28.0 }, { hp: 12, kw: 33.5 }, { hp: 14, kw: 40.0 },
                    { hp: 16, kw: 45.0 }, { hp: 18, kw: 50.0 }, { hp: 20, kw: 56.0 }, { hp: 22, kw: 61.5 },
                    { hp: 24, kw: 67.0 }, { hp: 26, kw: 73.0 }, { hp: 28, kw: 77.5 }, { hp: 30, kw: 85.0 },
                    { hp: 32, kw: 90.0 }, { hp: 34, kw: 95.0 }, { hp: 36, kw: 100.0 }, { hp: 38, kw: 106.0 },
                    { hp: 40, kw: 112.0 }, { hp: 42, kw: 118.0 }, { hp: 44, kw: 122.0 }, { hp: 46, kw: 128.0 },
                    { hp: 48, kw: 136.0 }, { hp: 50, kw: 140.0 }, { hp: 52, kw: 145.0 }, { hp: 54, kw: 150.0 }
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
                name: "VRV 7 Rシリーズ (冷暖同時・3管式)",
                refrigerant: "R32",
                pipeSystem: "3pipe",   // ← 3管式フラグ
                maxIndoorUnits: 64,
                maxPipingTotal: 1000,
                maxLongestPath: 165,
                outdoorCapacities: [
                    { hp: 8, kw: 22.4 }, { hp: 10, kw: 28.0 }, { hp: 12, kw: 33.5 }, { hp: 14, kw: 40.0 },
                    { hp: 16, kw: 45.0 }, { hp: 18, kw: 50.0 }, { hp: 20, kw: 56.0 }, { hp: 22, kw: 61.5 },
                    { hp: 24, kw: 67.0 }, { hp: 26, kw: 73.0 }, { hp: 28, kw: 77.5 }, { hp: 30, kw: 85.0 },
                    { hp: 32, kw: 90.0 }, { hp: 34, kw: 95.0 }, { hp: 36, kw: 100.0 }, { hp: 38, kw: 106.0 },
                    { hp: 40, kw: 112.0 }, { hp: 42, kw: 118.0 }, { hp: 44, kw: 122.0 }, { hp: 46, kw: 128.0 },
                    { hp: 48, kw: 136.0 }, { hp: 50, kw: 140.0 }, { hp: 52, kw: 145.0 }, { hp: 54, kw: 150.0 }
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
                // 系列最大は 33.5kW の 23台。実際の上限は室外機容量別
                // (getMachiMaxIndoorUnits 参照: 8.0→6台 … 33.5→23台)
                maxIndoorUnits: 23,
                maxPipingTotal: 300,
                maxLongestPath: 90,
                outdoorCapacities: [
                    { hp: 3, kw: 8.0 }, { hp: 4, kw: 11.2 }, { hp: 5, kw: 14.0 },
                    { hp: 6, kw: 16.0 }, { hp: 8, kw: 22.4 }, { hp: 10, kw: 28.0 }, { hp: 12, kw: 33.5 }
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
                case 'vrv_r':           return `REYA${kwNum}A`;  // 冷暖フリー
                case 'machi_multi':     return `RXTA${kwNum}F`;
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

    /**
     * BSユニット品番選定 (冷暖フリー Rシリーズ)
     * 出典: CP24089DXX P108 (RX) / P116 (R)「室内ユニット〜BSユニット接続許容範囲」
     * - 個別BSユニット: 直下が室内機のみの場合。Q=下流室内ユニット合計容量。
     *   Q≦5.6・3台以下→BSVA56A、5.6＜Q≦16.0・8台以下→BSVA160A、16.0＜Q≦28.0・8台以下→BSVA280A
     * - 集合BSユニット: 直下に分岐継手を含む場合。分岐数で選定。
     *   4分岐以下→BS4A160A (全分岐合計Q≦44.8)、6分岐以下→BS6A160A (Q≦67.2)、
     *   8分岐以下→BS8A160A (Q≦85.0)、10分岐以下→BS10A160A、12分岐以下→BS12A160A
     *   (BS10A/BS12A の全分岐合計Q上限はカタログ抽出テキストにないため未検証)。
     *   1分岐あたり Q≦16.0kW・5台以下。
     * 選定範囲外の場合は null を返す (呼び出し側で警告する)。
     */
    generateBSUnitModel(node) {
        const indoorCount = this.countIndoors(node);
        const q = this.computeDownstreamCapacities(node);
        const branchChildren = (node.children || []).filter(c => c.type === 'branch');

        if (branchChildren.length === 0) {
            // 個別BSユニット
            if (q <= 5.6 && indoorCount <= 3)  return "BSVA56A";
            if (q <= 16.0 && indoorCount <= 8) return "BSVA160A";
            if (q <= 28.0 && indoorCount <= 8) return "BSVA280A";
            return null;
        }

        // 集合BSユニット: 1分岐あたりの制限 (Q≦16.0kW・5台以下) を満たさない分岐があれば選定不可
        for (const b of branchChildren) {
            if (this.computeDownstreamCapacities(b) > 16.0) return null;
            if (this.countIndoors(b) > 5) return null;
        }
        const n = branchChildren.length;
        if (n <= 4 && q <= 44.8)  return "BS4A160A";
        if (n <= 6 && q <= 67.2)  return "BS6A160A";
        if (n <= 8 && q <= 85.0)  return "BS8A160A";
        if (n <= 10) return "BS10A160A";
        if (n <= 12) return "BS12A160A";
        return null;
    }

    /**
     * BSユニットの選定範囲チェック。範囲外の理由を文字列の配列で返す (範囲内なら [])。
     * 出典は generateBSUnitModel と同じ (CP24089DXX P108/P116)。
     */
    validateBSUnit(node) {
        const issues = [];
        const indoorCount = this.countIndoors(node);
        const q = this.computeDownstreamCapacities(node);
        const branchChildren = (node.children || []).filter(c => c.type === 'branch');

        if (branchChildren.length === 0) {
            // 個別BSユニット
            if (q > 28.0) issues.push(`下流合計容量 Q=${q.toFixed(1)}kW が個別BSユニットの上限（28.0kW）を超えています`);
            if (indoorCount > 8) issues.push(`下流台数 ${indoorCount}台 が個別BSユニットの上限（8台）を超えています`);
        } else {
            // 集合BSユニット
            // (全分岐合計Qの上限は、分岐数より大きい機種へのカスケード選定で吸収されるため、ここでは判定しない。
            //  BS10A/BS12A の合計Q上限はカタログ抽出テキストにないため未検証)
            const n = branchChildren.length;
            if (n > 12) issues.push(`分岐数 ${n}分岐 が集合BSユニットの上限（12分岐）を超えています`);
            for (const b of branchChildren) {
                const bq = this.computeDownstreamCapacities(b);
                const bn = this.countIndoors(b);
                if (bq > 16.0) issues.push(`分岐「${b.name}」の合計容量 ${bq.toFixed(1)}kW が1分岐あたりの上限（16.0kW）を超えています`);
                if (bn > 5) issues.push(`分岐「${b.name}」の台数 ${bn}台 が1分岐あたりの上限（5台）を超えています`);
            }
        }
        return issues;
    }

    // ==================== 2管式 配管サイズ選定 ====================

    /**
     * 室内機配管サイズ選定 (2管式共通・全シリーズ・全メーカー末端)
     * 添付技術資料 【冷暖切替】 記号1, 2, 3, 4, 7に基づく
     */
    getIndoorPipeSize(kw) {
        if (kw <= 5.6)  return { liquid: 6.4, gas: 12.7 }; // 記号1: 1.6〜5.6kW
        if (kw <= 16.0) return { liquid: 9.5, gas: 15.9 }; // 記号2: 7.1〜16.0kW
        if (kw <= 22.4) return { liquid: 9.5, gas: 19.1 }; // 記号3: 22.4kW
        if (kw <= 28.0) return { liquid: 9.5, gas: 22.2 }; // 記号4: 28.0kW
        return { liquid: 12.7, gas: 25.4 };                // 記号7: 45.0, 56.0kW
    }

    getBranchPipeSize(capacityKw, seriesId) {
        if (seriesId === 'machi_multi') {
            // machi 分岐後配管: P098 に分岐後配管サイズ表はないため、P096 の主管サイズに帯を合わせる (未検証)。
            // 16.0kW以下→9.5/15.9、22.4kW以下→9.5/19.1、28.0kW以下→9.5/22.2、それ以上→12.7/25.4
            if (capacityKw <= 16.0) return { liquid: 9.5, gas: 15.9 };
            if (capacityKw <= 22.4) return { liquid: 9.5, gas: 19.1 };
            if (capacityKw <= 28.0) return { liquid: 9.5, gas: 22.2 };
            return { liquid: 12.7, gas: 25.4 };
        }
        if (seriesId === 'skyair') {
            if (capacityKw < 16.0) return { liquid: 9.5, gas: 15.9 };
            if (capacityKw < 22.4) return { liquid: 9.5, gas: 19.1 };
            return { liquid: 9.5, gas: 22.2 };
        }
        if (seriesId === 'package_industrial') {
            if (capacityKw <= 22.4) return { liquid: 9.5,  gas: 19.1 };
            if (capacityKw <= 28.0) return { liquid: 9.5,  gas: 22.2 };
            if (capacityKw <= 45.0) return { liquid: 12.7, gas: 28.6 };
            if (capacityKw <= 61.5) return { liquid: 15.9, gas: 28.6 };
            if (capacityKw <= 101.0) return { liquid: 19.1, gas: 34.9 };
            return { liquid: 19.1, gas: 41.3 };
        }
        // 標準VRV (vrv7_x, vrv7_x_high_cop, vrv7_a) 添付技術資料【冷暖切替】準拠
        if (capacityKw <= 17.5)  return { liquid: 9.5,  gas: 15.9 }; // 記号2: 〜17.5kW
        if (capacityKw <= 22.9)  return { liquid: 9.5,  gas: 19.1 }; // 記号3: 17.6〜22.9kW
        if (capacityKw <= 28.9)  return { liquid: 9.5,  gas: 22.2 }; // 記号4: 23.0〜28.9kW
        if (capacityKw <= 42.9)  return { liquid: 12.7, gas: 22.2 }; // 記号6: 29.0〜42.9kW
        if (capacityKw <= 61.9)  return { liquid: 12.7, gas: 25.4 }; // 記号7: 43.0〜61.9kW
        if (capacityKw <= 86.9)  return { liquid: 15.9, gas: 28.6 }; // 記号10: 62.0〜86.9kW
        if (capacityKw <= 112.9) return { liquid: 15.9, gas: 31.8 }; // 記号11: 87.0〜112.9kW
        return { liquid: 19.1, gas: 38.1 };                          // 記号13: 113.0kW〜
    }

    getOutdoorMainPipeSize(outdoorKw, seriesId) {
        if (seriesId === 'machi_multi') {
            // machi 主管 (CP24089DXX P096): 80〜160A (〜16.0kW) →液9.5/ガス15.9、
            // 224A (22.4kW) →9.5/19.1、280A (28.0kW) →9.5/22.2、335A (33.5kW) →液12.7/ガス25.4
            if (outdoorKw <= 16.0) return { liquid: 9.5, gas: 15.9 };
            if (outdoorKw <= 22.4) return { liquid: 9.5, gas: 19.1 };
            if (outdoorKw <= 28.0) return { liquid: 9.5, gas: 22.2 };
            return { liquid: 12.7, gas: 25.4 };
        }
        if (seriesId === 'skyair') {
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
            return { liquid: 19.1, gas: 41.3 };
        }
        // 標準VRV全シリーズ共通 添付技術資料【冷暖切替】準拠
        if (outdoorKw <= 22.4)  return { liquid: 9.5,  gas: 19.1 }; // 記号3: 22.4kW
        if (outdoorKw <= 28.0)  return { liquid: 9.5,  gas: 22.2 }; // 記号4: 28.0kW
        if (outdoorKw <= 40.0)  return { liquid: 12.7, gas: 22.2 }; // 記号6: 33.5, 40.0kW
        if (outdoorKw <= 61.5)  return { liquid: 12.7, gas: 25.4 }; // 記号7: 45.0〜61.5kW
        if (outdoorKw <= 85.0)  return { liquid: 15.9, gas: 28.6 }; // 記号10: 67.0〜85.0kW
        if (outdoorKw <= 112.0) return { liquid: 15.9, gas: 31.8 }; // 記号11: 90.0〜112.0kW
        return { liquid: 19.1, gas: 38.1 };                          // 記号13: 118.0kW〜
    }

    // ==================== 3管式（VRV R冷暖フリー）配管サイズ選定 ====================

    /**
     * 3管式（液・高低圧ガス・吸入ガス）の分岐後配管サイズを返す
     * 添付技術資料 【冷暖フリー】 準拠 (記号A, B, C, G, H, I, M, N, O, P, U)
     */
    getBranchPipeSize3(capacityKw) {
        if (capacityKw <= 17.4)  return { liquid: 9.5,  highLowGas: 12.7, suctionGas: 15.9 }; // 記号A: 〜17.4kW
        if (capacityKw <= 22.9)  return { liquid: 9.5,  highLowGas: 15.9, suctionGas: 19.1 }; // 記号B: 17.5〜22.9kW
        if (capacityKw <= 28.9)  return { liquid: 9.5,  highLowGas: 15.9, suctionGas: 22.2 }; // 記号C: 23.0〜28.9kW
        if (capacityKw <= 42.9)  return { liquid: 12.7, highLowGas: 19.1, suctionGas: 22.2 }; // 記号G: 29.0〜42.9kW
        if (capacityKw <= 46.9)  return { liquid: 12.7, highLowGas: 19.1, suctionGas: 25.4 }; // 記号H: 43.0〜46.9kW
        if (capacityKw <= 61.9)  return { liquid: 12.7, highLowGas: 22.2, suctionGas: 25.4 }; // 記号I: 47.0〜61.9kW
        if (capacityKw <= 74.9)  return { liquid: 15.9, highLowGas: 22.2, suctionGas: 28.6 }; // 記号M: 62.0〜74.9kW
        if (capacityKw <= 86.9)  return { liquid: 15.9, highLowGas: 25.4, suctionGas: 28.6 }; // 記号N: 75.0〜86.9kW
        if (capacityKw <= 101.9) return { liquid: 15.9, highLowGas: 25.4, suctionGas: 31.8 }; // 記号O: 87.0〜101.9kW
        if (capacityKw <= 112.9) return { liquid: 15.9, highLowGas: 28.6, suctionGas: 31.8 }; // 記号P: 102.0〜112.9kW
        return { liquid: 19.1, highLowGas: 28.6, suctionGas: 38.1 };                          // 記号U: 113.0kW〜
    }

    /**
     * 3管式の室外機主管サイズを返す
     * 添付技術資料 【冷暖フリー】 準拠 (記号B, C, G, H, I, M, N, O, P, U)
     */
    getOutdoorMainPipeSize3(outdoorKw) {
        if (outdoorKw <= 22.4)  return { liquid: 9.5,  highLowGas: 15.9, suctionGas: 19.1 }; // 記号B: 22.4kW
        if (outdoorKw <= 28.0)  return { liquid: 9.5,  highLowGas: 15.9, suctionGas: 22.2 }; // 記号C: 28.0kW
        if (outdoorKw <= 40.0)  return { liquid: 12.7, highLowGas: 19.1, suctionGas: 22.2 }; // 記号G: 33.5, 40.0kW
        if (outdoorKw <= 45.0)  return { liquid: 12.7, highLowGas: 19.1, suctionGas: 25.4 }; // 記号H: 45.0kW
        if (outdoorKw <= 61.5)  return { liquid: 12.7, highLowGas: 22.2, suctionGas: 25.4 }; // 記号I: 50.0〜61.5kW
        if (outdoorKw <= 73.0)  return { liquid: 15.9, highLowGas: 22.2, suctionGas: 28.6 }; // 記号M: 67.0〜73.0kW
        if (outdoorKw <= 85.0)  return { liquid: 15.9, highLowGas: 25.4, suctionGas: 28.6 }; // 記号N: 77.5〜85.0kW
        if (outdoorKw <= 100.0) return { liquid: 15.9, highLowGas: 25.4, suctionGas: 31.8 }; // 記号O: 90.0〜100.0kW
        if (outdoorKw <= 112.0) return { liquid: 15.9, highLowGas: 28.6, suctionGas: 31.8 }; // 記号P: 106.0〜112.0kW
        return { liquid: 19.1, highLowGas: 28.6, suctionGas: 38.1 };                          // 記号U: 118.0〜150.0kW
    }

    // ==================== 分岐継手選定 ====================

    /**
     * REFNETジョイント選定
     * 出典: CP22187DXX P189「REFNET配管部材」
     * - 2管式 (VRV 7 X / X高COP / A):
     *   第1分岐用は室外機容量による: 14.0〜18.0kW→KHR26C22T、22.4・28.0kW→KHR26C33T、
     *   33.5〜67.0kW→KHR26C72T、73.0kW以上→KHR26C73T。
     *   第2分岐以下は下流室内ユニット合計容量による: 22.4kW未満→KHR26C22T、
     *   22.4以上〜33.0kW未満→KHR26C33T、33.0以上〜71.0kW未満→KHR26C72T、71.0kW以上→KHR26C73T。
     *   (P189 に VRV 7 専用の第1分岐表はなく、第1分岐の帯は同ページの更新用VRV QX/Q/VE-upQ 表による。
     *    第2分岐以下の帯は同ページの全表で共通)
     * - 3管式 (VRV 7 R / 冷暖フリーVRV RX・R):
     *   第1分岐用 (3本配管部): 22.4・28.0kW→KHR25C33T、33.5〜67.0kW→KHR25C72T、73.0kW以上→KHR25C73T。
     *   第2分岐以下 (3本配管部): 22.4kW未満→KHR25C22T、22.4以上〜33.0kW未満→KHR25C33T、
     *   33.0以上〜71.0kW未満→KHR25C72T、71.0kW以上→KHR25C73T。
     *   BSユニットより下流・冷房専用系統 (2本配管部) は2管式の第2分岐以下の帯で KHR26C**T。
     * - machi / SkyAir / 設備用は公式の選定表が報告にないため変更しない (未決)。
     *
     * @param {number} capacityKw 下流室内ユニット合計容量 (第1分岐用では使わない)
     * @param {string} seriesId
     * @param {object} [options]
     * @param {boolean} [options.isFirstBranch] 第1分岐 (室外機直下の分岐) か
     * @param {number} [options.outdoorKw] 室外機容量 (第1分岐用)
     * @param {boolean} [options.isTwoPipeSection] 3管式システム内の2本配管部 (BSユニット下流等) か
     */
    getJointModel(capacityKw, seriesId, options = {}) {
        if (seriesId === 'machi_multi' || seriesId === 'skyair') {
            return capacityKw < 22.4 ? "KHRP26M22T" : "KHRP26M33T";
        }
        if (seriesId === 'package_industrial') {
            if (capacityKw < 29.0)  return "BHFP22P90";
            if (capacityKw < 64.0)  return "BHFP22P135";
            if (capacityKw < 104.0) return "BHFP22P224";
                                    return "BHFP22P375";
        }
        const isFirstBranch = !!options.isFirstBranch;
        const outdoorKw = options.outdoorKw;
        const isTwoPipeSection = !!options.isTwoPipeSection;
        if (seriesId === 'vrv_r') {
            if (isTwoPipeSection) {
                // BSユニットより下流・冷房専用系統 (2本配管部): 2管式の第2分岐以下の帯
                return this._jointModelSecondOrLater2Pipe(capacityKw);
            }
            if (isFirstBranch && outdoorKw != null) {
                if (outdoorKw <= 28.0) return "KHR25C33T";
                if (outdoorKw <= 67.0) return "KHR25C72T";
                return "KHR25C73T";
            }
            // 第2分岐以下 (3本配管部)
            if (capacityKw < 22.4) return "KHR25C22T";
            if (capacityKw < 33.0) return "KHR25C33T";
            if (capacityKw < 71.0) return "KHR25C72T";
            return "KHR25C73T";
        }
        // 標準VRV (2管式)
        if (isFirstBranch && outdoorKw != null) {
            if (outdoorKw <= 18.0) return "KHR26C22T";
            if (outdoorKw <= 28.0) return "KHR26C33T";
            if (outdoorKw <= 67.0) return "KHR26C72T";
            return "KHR26C73T";
        }
        return this._jointModelSecondOrLater2Pipe(capacityKw);
    }

    /** 2管式の第2分岐以下 (下流合計容量による) */
    _jointModelSecondOrLater2Pipe(capacityKw) {
        if (capacityKw < 22.4) return "KHR26C22T";
        if (capacityKw < 33.0) return "KHR26C33T";
        if (capacityKw < 71.0) return "KHR26C72T";
        return "KHR26C73T";
    }

    // ==================== 接続容量比・台数制限 ====================

    /**
     * 系列ごとの接続容量比 (室内ユニット合計容量 / 室外機容量) の許容範囲を返す。
     * 出典: CP24089DXX P082 (X)、P086 (X高COP)、P092 (A)、P116 (R)、P098 (machi)、P108 (RX)。
     * - X: 50〜200%。ただし 118〜136kW は 50〜130%、16形・22形・28形の室内機を含む場合も最大130%。
     *   (壁ビルトイン形・床置ダクト形を含む場合の130%上限は、室内機形式がエンジンにないため判定できない。未決)
     * - X高COP: 75〜200%。16形・22形・28形を含む場合は最大130% (同上)。
     * - A / R / machi: 50〜130%。
     * - 設備用: 80〜120% (従来値。設備用カタログ CP25146A-1 は未取得のため未検証)。
     * - SkyAir: 50〜130% (従来値。スカイエアカタログ CP26016A-1 は未取得のため未検証)。
     * 16形=160形 (16.0kW)、22形=2.2kW、28形=2.8kW。
     */
    getConnectionRatioRange(seriesId, outdoorKw, tree) {
        const hasSmallIndoor = tree ? this._treeHasIndoorCapacity(tree, [2.2, 2.8, 16.0]) : false;
        switch (seriesId) {
            case 'vrv7_x': {
                const capped = outdoorKw >= 118.0 || hasSmallIndoor;
                return { min: 50, max: capped ? 130 : 200 };
            }
            case 'vrv7_x_high_cop': {
                return { min: 75, max: hasSmallIndoor ? 130 : 200 };
            }
            case 'vrv7_a':
            case 'vrv_r':
            case 'machi_multi':
                return { min: 50, max: 130 };
            case 'package_industrial':
                return { min: 80, max: 120 };
            default:
                return { min: 50, max: 130 };
        }
    }

    /** ツリー内に指定容量の室内機が1台でもあるか */
    _treeHasIndoorCapacity(node, capacities) {
        if (!node) return false;
        if (node.type === 'indoor' && capacities.some(kw => Math.abs(node.capacity - kw) < 0.1)) return true;
        if (node.children) return node.children.some(c => this._treeHasIndoorCapacity(c, capacities));
        return false;
    }

    /**
     * machiマルチの室外機容量別・接続可能室内ユニット台数。
     * 出典: CP24089DXX P098。
     */
    getMachiMaxIndoorUnits(outdoorKw) {
        const table = [
            { kw: 8.0, max: 6 }, { kw: 11.2, max: 8 }, { kw: 14.0, max: 10 }, { kw: 16.0, max: 11 },
            { kw: 22.4, max: 16 }, { kw: 28.0, max: 19 }, { kw: 33.5, max: 23 }
        ];
        const match = table.find(t => Math.abs(t.kw - outdoorKw) < 0.1);
        return match ? match.max : 23;
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
            const maxUnits = this.getMachiMaxIndoorUnits(tree.capacity);
            if (indoorCount > maxUnits) {
                warnings.push(`R32machiマルチ（室外機：${hp}馬力）における室内機の接続最大台数は【${maxUnits}台】です（現在：${indoorCount}台）。台数を削減してください。`);
            }
            const machiRange = this.getConnectionRatioRange(seriesId, tree.capacity, tree);
            if (ratio < machiRange.min || ratio > machiRange.max) {
                warnings.push(`machiマルチの接続容量比が推奨範囲外です（現在の接続率：${ratio.toFixed(1)}% / 推奨：${machiRange.min}%〜${machiRange.max}%）。`);
            }
        } else if (seriesId === 'package_industrial') {
            if (indoorCount > 1) {
                warnings.push(`警告: 設備用エアコンはマルチ接続に対応していません。室内ユニットは1台のみ接続してください（現在：${indoorCount}台）。`);
            }
            const pkgRange = this.getConnectionRatioRange(seriesId, tree.capacity, tree);
            if (ratio < pkgRange.min || ratio > pkgRange.max) {
                warnings.push(`設備用エアコンの接続容量比が推奨範囲（${pkgRange.min}%〜${pkgRange.max}%）外です（現在の接続率：${ratio.toFixed(1)}%）。`);
            }
        } else {
            if (indoorCount > seriesConfig.maxIndoorUnits) {
                warnings.push(`${seriesConfig.name}における室内機の接続最大台数は【${seriesConfig.maxIndoorUnits}台】です（現在：${indoorCount}台）。`);
            }
            const range = this.getConnectionRatioRange(seriesId, tree.capacity, tree);
            if (ratio < range.min || ratio > range.max) {
                warnings.push(`${seriesConfig.name}の推奨接続率（${range.min}%〜${range.max}%）の範囲を逸脱しています（現在の接続率：${ratio.toFixed(1)}%）。`);
            }
        }

        // BSユニット選定範囲チェック (冷暖フリー時)
        if (is3Pipe) {
            const checkBSUnits = (node) => {
                if (node.type === 'bs_unit') {
                    const issues = this.validateBSUnit(node);
                    for (const issue of issues) {
                        warnings.push(`警告: BSユニット（${node.name}）: ${issue}。系統を分割するか、BSユニットの構成を見直してください。`);
                    }
                    if (node.modelNumber === null || node.modelNumber === undefined) {
                        warnings.push(`警告: BSユニット（${node.name}）に適合する現行品番がありません。カタログの選定範囲（個別：Q≦28.0kW・8台以下、集合：12分岐以下・1分岐あたりQ≦16.0kW・5台以下）を確認してください。`);
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
                connectionRatioRange: this.getConnectionRatioRange(seriesId, tree.capacity, tree),
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

    // 3管/2管ハイブリッドサイズ選定 (末端室内機は必ず2管)
    selectInitialSizesForNode(node, outdoorKw, seriesId, isFirstBranch = false) {
        const seriesConfig = this.SERIES_DATABASE[seriesId] || this.SERIES_DATABASE.vrv7_x;
        const is3Pipe = seriesConfig.pipeSystem === '3pipe';

        if (node.type === 'indoor') {
            // 末端の室内機につながる冷媒管はどのメーカー・全シリーズでも必ず2管（液管・ガス管）
            const s = this.getIndoorPipeSize(node.capacity);
            node.pipeLiquid = s.liquid;
            node.pipeGas = s.gas;
            delete node.pipeHighLowGas;
            delete node.pipeSuctionGas;
        } else if (is3Pipe && !node.inBSDownstream) {
            // BSユニット上流（3管区間: 室外機〜分岐継手、分岐継手〜分岐継手、分岐継手〜BSユニット）
            if (node.type === 'outdoor') {
                const s = this.getOutdoorMainPipeSize3(outdoorKw);
                node.pipeLiquid = s.liquid; node.pipeHighLowGas = s.highLowGas; node.pipeSuctionGas = s.suctionGas;
            } else {
                const s = this.getBranchPipeSize3(node.downstreamCapacity);
                node.pipeLiquid = s.liquid; node.pipeHighLowGas = s.highLowGas; node.pipeSuctionGas = s.suctionGas;
            }
            if (node.type === 'branch') {
                node.jointModel = this.getJointModel(node.downstreamCapacity, seriesId, { isFirstBranch, outdoorKw });
                node.modelNumber = node.jointModel;
            } else if (node.type === 'bs_unit') {
                node.jointModel = null;
                node.modelNumber = this.generateBSUnitModel(node);
            }
        } else {
            // BSユニット下流または通常シリーズ（2管区間）
            if (node.type === 'outdoor') {
                const s = this.getOutdoorMainPipeSize(outdoorKw, seriesId);
                node.pipeLiquid = s.liquid; node.pipeGas = s.gas;
            } else {
                const s = this.getBranchPipeSize(node.downstreamCapacity, seriesId);
                node.pipeLiquid = s.liquid; node.pipeGas = s.gas;
            }
            if (node.type === 'branch') {
                node.jointModel = this.getJointModel(node.downstreamCapacity, seriesId, {
                    isFirstBranch,
                    outdoorKw,
                    isTwoPipeSection: is3Pipe && !!node.inBSDownstream
                });
                node.modelNumber = node.jointModel;
            } else if (node.type === 'bs_unit') {
                node.jointModel = null;
                node.modelNumber = this.generateBSUnitModel(node);
            }
        }

        // 室外機の直下の分岐が第1分岐
        if (node.children) node.children.forEach(c => this.selectInitialSizesForNode(c, outdoorKw, seriesId, node.type === 'outdoor'));
    }

    applyMainPipeSizeUp(rootNode, is3Pipe) {
        if (rootNode.type !== 'outdoor') return;
        // 液管は2管式・3管式ともに1サイズアップ
        rootNode.pipeLiquid = this.getNextSize(rootNode.pipeLiquid, 'liquid');
        if (!is3Pipe) {
            // 2管式（冷暖切換）はガス管も1サイズアップ（ただしφ38.1はサイズアップ不可）
            if (rootNode.pipeGas < 38.1) {
                rootNode.pipeGas = this.getNextSize(rootNode.pipeGas, 'gas');
            }
        }
        // ※3管式（冷暖フリー）では技術資料に基づき「液管のみ」サイズアップ（高低圧・吸入ガス管はサイズアップしない）
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
