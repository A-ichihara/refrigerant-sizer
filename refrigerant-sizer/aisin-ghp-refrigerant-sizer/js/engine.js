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
                maxPipingTotal: 300,
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
                maxPipingTotal: 250,
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
                maxPipingTotal: 200,
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
                maxPipingTotal: 300,
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
        const warnings = [];

        // 1. Calculate downstream capacities
        this.computeDownstreamCapacities(tree);

        // 2. Size pipes for each node
        const longestPath = this.findLongestPath(tree);
        const forceSizeUp = enableManualSizeUp || (longestPath > 90);

        if (forceSizeUp) {
            warnings.push("最遠相当長が90mを超過（またはサイズUP手動適用）のため、主管サイズアップを適用しています。");
        }

        this.sizeNodePipes(tree, forceSizeUp);

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
            joints: {}
        };

        this.aggregateBOM(tree, totals);

        if (totals.connectionRatio > 130) {
            warnings.push(`接続容量率が 130% (${totals.connectionRatio.toFixed(1)}%) を超過しています。`);
        } else if (totals.connectionRatio < 50) {
            warnings.push(`接続容量率が 50% 未満 (${totals.connectionRatio.toFixed(1)}%) です。`);
        }

        if (totals.totalPipingLength > series.maxPipingTotal) {
            warnings.push(`総配管実長 (${totals.totalPipingLength.toFixed(1)}m) が制限 (${series.maxPipingTotal}m) を超過しています。`);
        }

        return { tree, totals, warnings };
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

    sizeNodePipes(node, forceSizeUp) {
        const cap = node.downstreamCapacity || node.capacity || 0;
        
        let liquid = "9.52";
        let gas = "15.88";

        if (cap <= 5.6) {
            liquid = "6.35"; gas = "12.7";
        } else if (cap <= 14.0) {
            liquid = "9.52"; gas = "15.88";
        } else if (cap <= 22.4) {
            liquid = "9.52"; gas = "19.05";
        } else if (cap <= 28.0) {
            liquid = "9.52"; gas = "22.2";
        } else if (cap <= 45.0) {
            liquid = "12.7"; gas = "28.58";
        } else if (cap <= 71.0) {
            liquid = "15.88"; gas = "31.75";
        } else {
            liquid = "19.05"; gas = "38.1";
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

        if (node.children) {
            for (const child of node.children) {
                this.sizeNodePipes(child, false);
            }
        }
    }

    assignModelNumbers(node, series) {
        if (node.type === 'outdoor') {
            const match = series.outdoorCapacities.find(c => Math.abs(c.kw - node.capacity) < 0.1);
            node.modelNumber = match ? match.model : "AGP-CUSTOM";
        } else if (node.type === 'indoor') {
            const typeNum = Math.round(node.capacity * 10);
            node.modelNumber = `AYP-P${typeNum}F`;
        } else if (node.type === 'branch') {
            const cap = node.downstreamCapacity || 0;
            if (cap <= 22.4) node.jointModel = "BHG-NP22T";
            else if (cap <= 45.0) node.jointModel = "BHG-NP45T";
            else node.jointModel = "BHG-NP71T";
            node.modelNumber = node.jointModel;
        }

        if (node.children) {
            for (const child of node.children) {
                this.assignModelNumbers(child, series);
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

    aggregateBOM(node, totals) {
        if (node.type !== 'outdoor') {
            if (node.pipeLiquid) totals.liquidPipes[node.pipeLiquid] = (totals.liquidPipes[node.pipeLiquid] || 0) + node.length;
            if (node.pipeGas) totals.gasPipes[node.pipeGas] = (totals.gasPipes[node.pipeGas] || 0) + node.length;
        }
        if (node.jointModel) totals.joints[node.jointModel] = (totals.joints[node.jointModel] || 0) + 1;

        if (node.children) {
            for (const child of node.children) this.aggregateBOM(child, totals);
        }
    }
}
