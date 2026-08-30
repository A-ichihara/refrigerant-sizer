/**
 * UI Renderer and Event Controller (日本キャリア版)
 * 
 * 機能:
 * 1. 系統ツリーをHTMLカードとしてレンダリング (FSユニット対応)
 * 2. SVGを用いた配管接続線描画 (3管式は点線、2管式は実線)
 * 3. 各ノードの選択、追加、編集、削除UI制御
 * 4. localStorage を用いた状態保持・復元 (carrier_sizer_... キー使用)
 * 5. サンプル系統データの読み込み (冷暖同時スーパーマルチu FS構成、同時ツインなど)
 * 6. 更新履歴モーダル制御
 */

class RefrigerantSizerUI {
    constructor(engine) {
        this.engine = engine;
        
        // localStorage からの状態復元
        let loadedTree = null;
        let loadedSeriesId = "super_multi_u_y";
        let loadedNodeId = "root";
        let loadedManualSizeUp = false;

        try {
            const savedTree = localStorage.getItem('carrier_sizer_system_tree');
            if (savedTree) loadedTree = JSON.parse(savedTree);
            const savedSeries = localStorage.getItem('carrier_sizer_active_series_id');
            if (savedSeries) loadedSeriesId = savedSeries;
            const savedNode = localStorage.getItem('carrier_sizer_active_node_id');
            if (savedNode) loadedNodeId = savedNode;
            const savedSizeUp = localStorage.getItem('carrier_sizer_enable_manual_sizeup');
            if (savedSizeUp) loadedManualSizeUp = savedSizeUp === 'true';
        } catch (e) {
            console.error("Failed to load state from localStorage", e);
        }

        this.activeSeriesId = loadedSeriesId;
        this.activeNodeId = loadedNodeId;
        this.enableManualSizeUp = loadedManualSizeUp;
        
        if (loadedTree) {
            this.systemTree = loadedTree;
        } else {
            // デフォルトの初期ツリー
            this.systemTree = {
                id: "root",
                name: "室外機 (Carrier)",
                type: "outdoor",
                capacity: 28.0, // 10 HP
                length: 0,
                children: [
                    {
                        id: "branch_1",
                        name: "分岐ジョイント A",
                        type: "branch",
                        length: 15,
                        children: [
                            {
                                id: "indoor_1",
                                name: "会議室 A (MMU)",
                                type: "indoor",
                                indoorStyle: "cassette_4way",
                                capacity: 5.6,
                                length: 8,
                                children: []
                            },
                            {
                                id: "indoor_2",
                                name: "役員室 B (MMK)",
                                type: "indoor",
                                indoorStyle: "wall_mounted",
                                capacity: 2.8,
                                length: 12,
                                children: []
                            }
                        ]
                    }
                ]
            };
        }
        
        this.canvas = document.getElementById('tree-canvas');
        this.svgCanvas = document.getElementById('connection-svg');
        this.propPanel = document.getElementById('property-editor');
        this.totalsPanel = document.getElementById('totals-panel');
        this.warningPanel = document.getElementById('warning-panel');
        this.seriesSelect = document.getElementById('series-select');

        this.init();
    }

    init() {
        this.bindEvents();
        if (this.seriesSelect) {
            this.seriesSelect.value = this.activeSeriesId;
        }
        const forceSUpBtn = document.getElementById('btn-force-sizeup');
        if (forceSUpBtn) {
            forceSUpBtn.classList.toggle('btn-primary', this.enableManualSizeUp);
        }
        this.update();
    }

    update() {
        this.validateAndRepairTreeForSeries(this.systemTree);

        const results = this.engine.calculateSystem(this.systemTree, this.activeSeriesId, this.enableManualSizeUp);
        
        if (results.error) {
            console.error(results.error);
            return;
        }

        this.sizerResult = results;

        try {
            localStorage.setItem('carrier_sizer_system_tree', JSON.stringify(this.systemTree));
            localStorage.setItem('carrier_sizer_active_series_id', this.activeSeriesId);
            localStorage.setItem('carrier_sizer_active_node_id', this.activeNodeId);
            localStorage.setItem('carrier_sizer_enable_manual_sizeup', this.enableManualSizeUp ? 'true' : 'false');
        } catch (e) {
            console.error("Failed to save state to localStorage", e);
        }
        
        this.renderTree(results.tree);
        this.drawConnections();
        this.renderTotals(results.totals);
        this.renderWarnings(results.warnings);
        this.renderPropertyEditor();
    }

    renderTree(node) {
        if (node.id === this.systemTree.id) {
            this.canvas.innerHTML = '<svg id="connection-svg" class="connection-svg"></svg>';
            this.svgCanvas = document.getElementById('connection-svg');
            
            const wrapper = document.createElement('div');
            wrapper.className = 'tree-wrapper';
            wrapper.appendChild(this.createNodeElement(node));
            this.canvas.appendChild(wrapper);
        }
    }

    createNodeElement(node) {
        const container = document.createElement('div');
        container.className = 'tree-node-container';
        container.setAttribute('data-id', node.id);

        const card = document.createElement('div');
        card.className = `node-card`;
        if (node.id === this.activeNodeId) card.classList.add('active');

        let badgeText = '室外';
        let badgeClass = 'badge-outdoor';
        if (node.type === 'branch') { badgeText = '分岐'; badgeClass = 'badge-branch'; }
        else if (node.type === 'indoor') { badgeText = '室内'; badgeClass = 'badge-indoor'; }
        else if (node.type === 'fs_unit') { badgeText = 'FSﾕﾆｯﾄ'; badgeClass = 'badge-fs'; }

        let capText = '';
        if (node.type === 'outdoor') {
            capText = `${node.capacity.toFixed(1)} kW (${this.getHpFromKw(node.capacity)}馬力)`;
        } else if (node.type === 'indoor') {
            capText = `${node.capacity.toFixed(1)} kW (${this.getIndoorLabelFromKw(node.capacity)})`;
        } else {
            capText = `下流: ${(node.capacitySum || 0).toFixed(1)} kW`;
        }

        card.innerHTML = `
            <div class="node-header">
                <span class="node-badge ${badgeClass}">${badgeText}</span>
                <span class="node-title" title="${node.name}">${node.name}</span>
            </div>
            <div class="node-info">
                <span>容量:</span>
                <span><strong>${capText}</strong></span>
            </div>
            ${node.length > 0 ? `<div class="node-info"><span>配管長:</span><span>${node.length} m</span></div>` : ''}
            ${node.modelNumber ? `<div class="node-catalog-model">${node.modelNumber}</div>` : ''}
            ${node.pipeSizeText ? `<div class="pipe-info">${node.pipeSizeText}</div>` : ''}
        `;

        card.addEventListener('click', (e) => {
            e.stopPropagation();
            this.setActiveNode(node.id);
        });

        container.appendChild(card);

        if (node.children && node.children.length > 0) {
            const childrenContainer = document.createElement('div');
            childrenContainer.className = 'tree-children';
            node.children.forEach(child => {
                childrenContainer.appendChild(this.createNodeElement(child));
            });
            container.appendChild(childrenContainer);
        }

        return container;
    }

    drawConnections() {
        if (!this.svgCanvas) return;
        
        const paths = this.svgCanvas.querySelectorAll('path');
        paths.forEach(p => p.remove());

        this.svgCanvas.setAttribute('width', this.canvas.scrollWidth);
        this.svgCanvas.setAttribute('height', this.canvas.scrollHeight);

        this.drawNodeConnectorRecursive(this.systemTree);
    }

    drawNodeConnectorRecursive(node) {
        if (node.children && node.children.length > 0) {
            const parentContainer = this.canvas.querySelector(`[data-id="${node.id}"]`);
            if (!parentContainer) return;

            const parentCard = parentContainer.querySelector(':scope > .node-card');
            const parentRect = parentCard.getBoundingClientRect();
            const canvasRect = this.canvas.getBoundingClientRect();

            const startX = (parentRect.right - canvasRect.left) + this.canvas.scrollLeft;
            const startY = (parentRect.top + parentRect.height / 2 - canvasRect.top) + this.canvas.scrollTop;

            node.children.forEach(child => {
                const childContainer = this.canvas.querySelector(`[data-id="${child.id}"]`);
                if (!childContainer) return;

                const childCard = childContainer.querySelector(':scope > .node-card');
                const childRect = childCard.getBoundingClientRect();

                const endX = (childRect.left - canvasRect.left) + this.canvas.scrollLeft;
                const endY = (childRect.top + childRect.height / 2 - canvasRect.top) + this.canvas.scrollTop;

                const controlOffset = Math.abs(endX - startX) * 0.5;
                const cp1X = startX + controlOffset;
                const cp1Y = startY;
                const cp2X = endX - controlOffset;
                const cp2Y = endY;

                const pathData = `M ${startX} ${startY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${endX} ${endY}`;
                
                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                path.setAttribute('d', pathData);
                
                let isThreePipe = false;
                if (child.pipes && child.pipes.type === '3pipe') {
                    isThreePipe = true;
                }

                path.setAttribute('class', 'connection-path');
                if (isThreePipe) {
                    path.classList.add('three-pipe');
                }

                this.svgCanvas.appendChild(path);

                // 配管道中への冷媒サイズ記号（ラベル）自動記入
                if (child.pipeLiquid || child.pipeGas || child.pipeHighGas) {
                    let labelText = `L:φ${child.pipeLiquid || '-'} G:φ${child.pipeGas || '-'}`;
                    if (child.pipeHighGas) {
                        labelText = `L:φ${child.pipeLiquid} H:φ${child.pipeHighGas} S:φ${child.pipeLowGas}`;
                    }
                    const midX = (startX + endX) / 2;
                    const midY = (startY + endY) / 2;
                    const labelWidth = (child.pipeHighGas) ? 140 : 104;

                    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                    
                    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                    rect.setAttribute('class', 'pipe-label-bg');
                    rect.setAttribute('x', midX - (labelWidth / 2));
                    rect.setAttribute('y', midY - 11);
                    rect.setAttribute('width', labelWidth);
                    rect.setAttribute('height', 22);

                    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                    text.setAttribute('class', 'pipe-label-text');
                    text.setAttribute('x', midX);
                    text.setAttribute('y', midY);
                    text.textContent = labelText;

                    g.appendChild(rect);
                    g.appendChild(text);
                    this.svgCanvas.appendChild(g);
                }

                this.drawNodeConnectorRecursive(child);
            });
        }
    }

    setActiveNode(id) {
        this.activeNodeId = id;
        
        const cards = this.canvas.querySelectorAll('.node-card');
        cards.forEach(c => c.classList.remove('active'));
        
        const activeContainer = this.canvas.querySelector(`[data-id="${id}"]`);
        if (activeContainer) {
            const activeCard = activeContainer.querySelector(':scope > .node-card');
            if (activeCard) activeCard.classList.add('active');
        }

        this.renderPropertyEditor();
        this.drawConnections();
    }

    renderPropertyEditor() {
        if (!this.activeNodeId) {
            this.propPanel.innerHTML = '<div style="color: var(--text-muted); font-size: 0.85rem; text-align: center; margin-top: 2rem;">系統図内の機器をクリックして、プロパティを編集します。</div>';
            return;
        }

        const node = this.findNodeById(this.systemTree, this.activeNodeId);
        if (!node) {
            this.activeNodeId = null;
            this.renderPropertyEditor();
            return;
        }

        const currentSeries = this.engine.SERIES_DATABASE[this.activeSeriesId];
        let editorHtml = '';
        
        editorHtml += `
            <div style="background:rgba(255,255,255,0.02); padding:12px; border-radius:var(--radius-sm); border:1px dashed var(--border-color); margin-bottom:1.25rem;">
                <label style="color:var(--color-secondary); font-size:0.7rem; text-transform:uppercase; font-weight:700;">メーカー品番 (自動決定)</label>
                <div style="font-family:var(--font-mono); font-size:1.05rem; font-weight:700; color:var(--text-primary); margin-top:3px;">
                    ${node.modelNumber || '-'}
                </div>
            </div>
        `;

        editorHtml += `
            <div class="form-group">
                <label>名称</label>
                <input type="text" class="form-input" id="edit-name" value="${node.name}">
            </div>
        `;

        if (node.type === 'outdoor') {
            editorHtml += `
                <div class="form-group">
                    <label>室外機馬力 (システム容量)</label>
                    <select class="form-select" id="edit-capacity">
            `;
            currentSeries.outdoorCapacities.forEach(opt => {
                const selected = Math.abs(opt.kw - node.capacity) < 0.1 ? 'selected' : '';
                editorHtml += `<option value="${opt.kw}" ${selected}>${opt.hp} 馬力 (${opt.kw.toFixed(1)} kW) [${opt.model}]</option>`;
            });
            editorHtml += `</select></div>`;
        } else if (node.type === 'indoor') {
            editorHtml += `
                <div class="form-group">
                    <label>室内機形状スタイル</label>
                    <select class="form-select" id="edit-indoor-style">
            `;
            Object.keys(this.engine.INDOOR_STYLES).forEach(key => {
                const styleObj = this.engine.INDOOR_STYLES[key];
                const selected = node.indoorStyle === key ? 'selected' : '';
                editorHtml += `<option value="${key}" ${selected}>${styleObj.name}</option>`;
            });
            editorHtml += `</select></div>`;

            const allowedOptions = this.engine.getValidIndoorOptions(this.activeSeriesId, node.indoorStyle || 'cassette_4way');
            editorHtml += `
                <div class="form-group">
                    <label>室内ユニット容量</label>
                    <select class="form-select" id="edit-capacity">
            `;
            allowedOptions.forEach(opt => {
                const selected = Math.abs(opt.kw - node.capacity) < 0.1 ? 'selected' : '';
                editorHtml += `<option value="${opt.kw}" ${selected}>${opt.type} (${opt.kw.toFixed(1)} kW)</option>`;
            });
            editorHtml += `</select></div>`;
        }

        if (node.type !== 'outdoor') {
            editorHtml += `
                <div class="form-group">
                    <label>上流分岐からの配管長 (m)</label>
                    <input type="number" class="form-input" id="edit-length" min="0" max="150" value="${node.length}">
                </div>
            `;
        }

        editorHtml += `<div style="display:flex; flex-direction:column; gap:8px; margin-top:1.25rem; border-top:1px solid var(--border-color); padding-top:1rem;">`;

        if (node.type === 'outdoor' || node.type === 'branch' || node.type === 'fs_unit') {
            editorHtml += `<button class="btn btn-outline" id="btn-add-branch">➕ 分岐ジョイントを追加</button>`;
            
            // super_multi_u_r (冷暖同時) シリーズの場合のみFSユニット追加可能
            if (this.activeSeriesId === 'super_multi_u_r' && node.type !== 'fs_unit') {
                editorHtml += `<button class="btn btn-outline" id="btn-add-fs" style="border-color:var(--color-primary-glow);">🟠 FSユニットを追加</button>`;
            }
            editorHtml += `<button class="btn btn-outline" id="btn-add-indoor">➕ 室内ユニットを追加</button>`;
        }

        if (node.type !== 'outdoor') {
            editorHtml += `<button class="btn btn-danger" id="btn-delete-node" style="margin-top:8px;">🗑️ この機器を削除</button>`;
        }

        editorHtml += `</div>`;

        this.propPanel.innerHTML = editorHtml;
        this.bindEditorEvents(node);
    }

    bindEditorEvents(node) {
        const editName = document.getElementById('edit-name');
        if (editName) {
            editName.addEventListener('change', (e) => {
                node.name = e.target.value;
                this.update();
            });
        }

        const editCap = document.getElementById('edit-capacity');
        if (editCap) {
            editCap.addEventListener('change', (e) => {
                node.capacity = parseFloat(e.target.value);
                this.update();
            });
        }

        const editStyle = document.getElementById('edit-indoor-style');
        if (editStyle) {
            editStyle.addEventListener('change', (e) => {
                node.indoorStyle = e.target.value;
                this.clampCapacityForStyle(node);
                this.update();
            });
        }

        const editLen = document.getElementById('edit-length');
        if (editLen) {
            editLen.addEventListener('change', (e) => {
                node.length = Math.max(0, parseFloat(e.target.value) || 0);
                this.update();
            });
        }

        const addBranch = document.getElementById('btn-add-branch');
        if (addBranch) {
            addBranch.addEventListener('click', () => {
                node.children.push({
                    id: "branch_" + Date.now(),
                    name: "新しい分岐",
                    type: "branch",
                    length: 5,
                    children: []
                });
                this.update();
            });
        }

        const addFs = document.getElementById('btn-add-fs');
        if (addFs) {
            addFs.addEventListener('click', () => {
                node.children.push({
                    id: "fs_" + Date.now(),
                    name: "FSユニット (流路切換)",
                    type: "fs_unit",
                    length: 10,
                    children: []
                });
                this.update();
            });
        }

        const addIndoor = document.getElementById('btn-add-indoor');
        if (addIndoor) {
            addIndoor.addEventListener('click', () => {
                const validOptions = this.engine.getValidIndoorOptions(this.activeSeriesId, 'cassette_4way');
                node.children.push({
                    id: "indoor_" + Date.now(),
                    name: "新しい室内機",
                    type: "indoor",
                    indoorStyle: "cassette_4way",
                    capacity: validOptions[0] ? validOptions[0].kw : 2.8,
                    length: 5,
                    children: []
                });
                this.update();
            });
        }

        const deleteBtn = document.getElementById('btn-delete-node');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => {
                if (confirm("この機器および下流のすべての接続を削除しますか？")) {
                    const parent = this.findParentNode(this.systemTree, node.id);
                    if (parent) {
                        parent.children = parent.children.filter(c => c.id !== node.id);
                        this.activeNodeId = parent.id;
                        this.update();
                    }
                }
            });
        }
    }

    clampCapacityForStyle(node) {
        const validOptions = this.engine.getValidIndoorOptions(this.activeSeriesId, node.indoorStyle || 'cassette_4way');
        if (validOptions.length === 0) return;

        const exists = validOptions.some(opt => Math.abs(opt.kw - node.capacity) < 0.1);
        if (!exists) {
            const closest = validOptions.reduce((prev, curr) => {
                return (Math.abs(curr.kw - node.capacity) < Math.abs(prev.kw - node.capacity) ? curr : prev);
            });
            node.capacity = closest.kw;
        }
    }

    validateAndRepairTreeForSeries(node) {
        if (node.type === 'outdoor') {
            const currentSeries = this.engine.SERIES_DATABASE[this.activeSeriesId];
            const capMatch = currentSeries.outdoorCapacities.some(c => Math.abs(c.kw - node.capacity) < 0.1);
            if (!capMatch) {
                node.capacity = currentSeries.outdoorCapacities[0].kw;
            }
        } else if (node.type === 'indoor') {
            this.clampCapacityForStyle(node);
        }

        // 冷暖同時シリーズ以外でFSユニットが存在する場合は自動修復（通常分岐に置換）
        if (this.activeSeriesId !== 'super_multi_u_r') {
            if (node.type === 'fs_unit') {
                node.type = 'branch';
                node.name = node.name.replace('FSユニット', '分岐ジョイント');
            }
        }

        if (node.children) {
            node.children.forEach(c => this.validateAndRepairTreeForSeries(c));
        }
    }

    /** ④ エラー・警告の最適対処方法提案モーダルの制御 */
    openFixSuggestionModal(warningText) {
        const overlay = document.getElementById('fix-modal-overlay');
        const errDiv = document.getElementById('fix-modal-error-text');
        const sugDiv = document.getElementById('fix-modal-suggestion-text');
        const btnOk = document.getElementById('fix-modal-ok');
        const btnCancel = document.getElementById('fix-modal-cancel');
        const btnClose = document.getElementById('fix-modal-close');

        if (!overlay || !errDiv || !sugDiv) return;

        errDiv.textContent = warningText;

        let suggestion = "";
        let fixAction = null;

        if (warningText.includes("接続容量") && (warningText.includes("超過") || warningText.includes("未満") || warningText.includes("範囲外"))) {
            if (this.sizerResult && this.sizerResult.totals && this.sizerResult.totals.connectionRatio > 130) {
                suggestion = "💡 【対処方法】: 室外機の馬力（容量）を1段階大きいサイズにアップし、接続率を推奨範囲（50%〜130%）内に調整します。";
                fixAction = () => this.changeOutdoorCapacity(1);
            } else {
                suggestion = "💡 【対処方法】: 室外機の馬力（容量）を1段階小さいサイズにダウンし、接続率を推奨範囲内に調整します。";
                fixAction = () => this.changeOutdoorCapacity(-1);
            }
        } else if (warningText.includes("最遠") || warningText.includes("相当長") || warningText.includes("実長")) {
            suggestion = "💡 【対処方法】: 主管サイズアップ（1サイズ太径化）を強制適用し、長配管による圧力損失を補正します。";
            fixAction = () => { this.enableManualSizeUp = true; this.update(); };
        } else {
            suggestion = "💡 【対処方法】: 主配管のサイズアップを有効化し系統全体のバランスを改善します。";
            fixAction = () => { this.enableManualSizeUp = true; this.update(); };
        }

        sugDiv.textContent = suggestion;
        overlay.classList.add('active');

        const closeFixModal = () => overlay.classList.remove('active');
        btnCancel.onclick = closeFixModal;
        btnClose.onclick = closeFixModal;
        btnOk.onclick = () => {
            closeFixModal();
            if (fixAction) fixAction();
        };
    }

    /** 室外機容量の段階移動 */
    changeOutdoorCapacity(step) {
        const seriesConfig = this.engine.SERIES_DATABASE[this.activeSeriesId];
        if (!seriesConfig || !seriesConfig.outdoorCapacities) return;
        const currentKw = this.systemTree.capacity;
        const idx = seriesConfig.outdoorCapacities.findIndex(c => Math.abs(c.kw - currentKw) < 0.1);
        if (idx !== -1) {
            const newIdx = Math.max(0, Math.min(seriesConfig.outdoorCapacities.length - 1, idx + step));
            this.systemTree.capacity = seriesConfig.outdoorCapacities[newIdx].kw;
            this.update();
        }
    }

    /** ⑤ 全区間冷媒サイズ詳細表モーダルの制御 */
    openPipeSizeModal() {
        const overlay = document.getElementById('pipesize-modal-overlay');
        const toggle = document.getElementById('pipesize-modal-sizeup-toggle');
        const label = document.getElementById('sizeup-toggle-label');
        const btnOk = document.getElementById('pipesize-modal-ok');
        const btnClose = document.getElementById('pipesize-modal-close');

        if (!overlay) return;

        if (toggle) {
            toggle.checked = this.enableManualSizeUp;
            if (label) label.textContent = this.enableManualSizeUp ? "サイズUP適用中" : "標準サイズ";
            
            toggle.onchange = (e) => {
                this.enableManualSizeUp = e.target.checked;
                if (label) label.textContent = this.enableManualSizeUp ? "サイズUP適用中" : "標準サイズ";
                const forceSUpBtn = document.getElementById('btn-force-sizeup');
                if (forceSUpBtn) forceSUpBtn.classList.toggle('btn-primary', this.enableManualSizeUp);
                this.update();
                this.renderPipeSizeTable();
            };
        }

        this.renderPipeSizeTable();
        overlay.classList.add('active');

        const closeModal = () => overlay.classList.remove('active');
        btnOk.onclick = closeModal;
        btnClose.onclick = closeModal;
    }

    /** システム全区間の配管サイズテーブル生成 */
    renderPipeSizeTable() {
        const container = document.getElementById('pipesize-table-container');
        if (!container || !this.sizerResult) return;

        const currentSeries = this.engine.SERIES_DATABASE[this.activeSeriesId];
        const is3Pipe = currentSeries && (currentSeries.pipeSystem === '3pipe');
        const currentTree = this.sizerResult.tree;
        
        let html = `
            <table class="pipe-detail-table">
                <thead>
                    <tr>
                        <th>区間 / 機器名称</th>
                        <th>種別</th>
                        <th>下流容量</th>
                        <th>配管実長</th>
                        <th>液管サイズ</th>
                        ${is3Pipe ? '<th>高低圧ガス管</th><th>吸入ガス管</th>' : '<th>ガス管サイズ</th>'}
                        <th>型番 / 状態</th>
                    </tr>
                </thead>
                <tbody>
        `;

        const traverse = (node, parentName = "") => {
            let typeStr = "分岐継手";
            if (node.type === 'outdoor') typeStr = "室外機 (主管)";
            else if (node.type === 'indoor') typeStr = "室内機配管";

            const nameStr = parentName ? `${parentName} ➔ ${node.name}` : node.name;
            const capStr = node.type === 'indoor' ? `${node.capacity.toFixed(1)} kW` : `${(node.capacitySum || node.capacity || 0).toFixed(1)} kW`;
            const lenStr = `${node.length || 0} m`;
            const modelStr = node.modelNumber || node.jointModel || "-";
            const sizedUpTag = node.isSizedUp ? ' <span style="color:var(--color-secondary); font-weight:700;">(サイズUP)</span>' : '';

            let pipeLiquidStr = node.pipeLiquid ? `φ${node.pipeLiquid}` : "-";
            let pipeGasStr = node.pipeGas ? `φ${node.pipeGas}` : "-";
            let pipeHLGStr = node.pipeHighGas ? `φ${node.pipeHighGas}` : "-";
            let pipeSGStr = node.pipeLowGas ? `φ${node.pipeLowGas}` : "-";

            html += `
                <tr>
                    <td style="font-weight:600;">${nameStr}</td>
                    <td><span class="node-type type-${node.type}">${typeStr}</span></td>
                    <td>${capStr}</td>
                    <td>${lenStr}</td>
                    <td style="font-family:var(--font-mono); font-weight:600; color:var(--text-primary);">${pipeLiquidStr}</td>
                    ${is3Pipe ? `
                        <td style="font-family:var(--font-mono); font-weight:600; color:var(--color-warning);">${pipeHLGStr}</td>
                        <td style="font-family:var(--font-mono); font-weight:600; color:var(--color-secondary);">${pipeSGStr}</td>
                    ` : `
                        <td style="font-family:var(--font-mono); font-weight:600; color:var(--color-secondary);">${pipeGasStr}</td>
                    `}
                    <td style="font-size:0.75rem; font-family:var(--font-mono);">${modelStr}${sizedUpTag}</td>
                </tr>
            `;

            if (node.children) {
                node.children.forEach(c => traverse(c, node.name));
            }
        };

        traverse(currentTree);
        html += `</tbody></table>`;

        container.innerHTML = html;
    }

    bindEvents() {
        window.addEventListener('resize', () => this.drawConnections());

        const btnShowPipe = document.getElementById('btn-show-pipesize');
        if (btnShowPipe) {
            btnShowPipe.addEventListener('click', () => this.openPipeSizeModal());
        }

        if (this.seriesSelect) {
            this.seriesSelect.addEventListener('change', (e) => {
                this.activeSeriesId = e.target.value;
                this.update();
            });
        }

        const forceSUpBtn = document.getElementById('btn-force-sizeup');
        if (forceSUpBtn) {
            forceSUpBtn.addEventListener('click', () => {
                this.enableManualSizeUp = !this.enableManualSizeUp;
                forceSUpBtn.classList.toggle('btn-primary', this.enableManualSizeUp);
                this.update();
            });
        }

        const btnPresets = document.getElementById('btn-load-sample');
        if (btnPresets) {
            btnPresets.addEventListener('click', () => this.loadSamplePresetForSeries());
        }

        const btnReset = document.getElementById('btn-reset');
        if (btnReset) {
            btnReset.addEventListener('click', () => {
                const currentSeries = this.engine.SERIES_DATABASE[this.activeSeriesId];
                if (confirm("現在の系統設計をクリアして初期状態に戻しますか？")) {
                    this.systemTree = {
                        id: "root",
                        name: "室外機 (Carrier)",
                        type: "outdoor",
                        capacity: currentSeries.outdoorCapacities[0].kw,
                        length: 0,
                        children: []
                    };
                    this.activeNodeId = "root";
                    this.update();
                }
            });
        }

        const btnExport = document.getElementById('btn-export');
        if (btnExport) {
            btnExport.addEventListener('click', () => this.exportJsonData());
        }

        const btnImport = document.getElementById('btn-import');
        if (btnImport) {
            btnImport.addEventListener('click', () => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.json';
                input.onchange = (e) => {
                    const file = e.target.files[0];
                    const reader = new FileReader();
                    reader.onload = (readerEvent) => {
                        try {
                            const parsed = JSON.parse(readerEvent.target.result);
                            if (parsed.type === 'outdoor' && parsed.id) {
                                this.systemTree = parsed;
                                this.activeNodeId = parsed.id;
                                this.update();
                            } else {
                                alert("無効な系統データ形式です。");
                            }
                        } catch (err) {
                            alert("ファイルの読み込み中にエラーが発生しました。");
                        }
                    };
                    reader.readAsText(file);
                };
                input.click();
            });
        }

        const btnPrint = document.getElementById('btn-print');
        if (btnPrint) {
            btnPrint.addEventListener('click', () => window.print());
        }

        // ===== 更新履歴モーダル =====
        const btnHistory = document.getElementById('btn-history') || document.getElementById('btn-update-history');
        if (btnHistory) {
            btnHistory.addEventListener('click', () => this.openHistoryModal());
        }

        const historyModalClose = document.getElementById('history-modal-close');
        if (historyModalClose) {
            historyModalClose.addEventListener('click', () => this.closeHistoryModal());
        }

        const historyModalOk = document.getElementById('history-modal-ok');
        if (historyModalOk) {
            historyModalOk.addEventListener('click', () => this.closeHistoryModal());
        }

        const historyOverlay = document.getElementById('history-modal-overlay');
        if (historyOverlay) {
            historyOverlay.addEventListener('click', (e) => {
                if (e.target === historyOverlay) this.closeHistoryModal();
            });
        }

        const btnForceCheck = document.getElementById('btn-force-spec-check');
        if (btnForceCheck) {
            btnForceCheck.addEventListener('click', () => {
                btnForceCheck.disabled = true;
                btnForceCheck.textContent = '🔄 チェック中...';
                setTimeout(() => {
                    if (window._specChecker) {
                        window._specChecker.runCheck(true);
                    }
                    this.renderHistoryModal();
                    btnForceCheck.disabled = false;
                    btnForceCheck.textContent = '🔍 今すぐチェック';
                }, 200);
            });
        }
    }

    loadSamplePresetForSeries() {
        if (this.activeSeriesId === 'super_multi_u_r') {
            // u 冷暖同時: 3管FSユニット系統
            this.systemTree = {
                id: "root",
                name: "室外機 MMY-MUP2801HR9 (10馬力)",
                type: "outdoor",
                capacity: 28.0,
                length: 0,
                children: [
                    {
                        id: "branch_fs1",
                        name: "第1分岐管 (3管式)",
                        type: "branch",
                        length: 22,
                        children: [
                            {
                                id: "fs_unit1",
                                name: "FSユニット A",
                                type: "fs_unit",
                                length: 12,
                                children: [
                                    {
                                        id: "indoor_fs1",
                                        name: "会議室 A (MMU)",
                                        type: "indoor",
                                        indoorStyle: "cassette_4way",
                                        capacity: 5.6,
                                        length: 6,
                                        children: []
                                    }
                                ]
                            },
                            {
                                id: "fs_unit2",
                                name: "FSユニット B (マルチ用)",
                                type: "fs_unit",
                                length: 18,
                                children: [
                                    {
                                        id: "branch_sub_fs",
                                        name: "FS下流分岐",
                                        type: "branch",
                                        length: 5,
                                        children: [
                                            {
                                                id: "indoor_fs2a",
                                                name: "事務室 B (MMU)",
                                                type: "indoor",
                                                indoorStyle: "cassette_4way",
                                                capacity: 7.1,
                                                length: 5,
                                                children: []
                                            },
                                            {
                                                id: "indoor_fs2b",
                                                name: "食堂 C (MMU)",
                                                type: "indoor",
                                                indoorStyle: "cassette_4way",
                                                capacity: 7.1,
                                                length: 5,
                                                children: []
                                            }
                                        ]
                                    }
                                ]
                            }
                        ]
                    }
                ]
            };
        } else if (this.activeSeriesId === 'super_multi_mini') {
            // mini用: 同時トリプル
            this.systemTree = {
                id: "root",
                name: "室外機 MCY-MAP1401HS (5馬力)",
                type: "outdoor",
                capacity: 14.0,
                length: 0,
                children: [
                    {
                        id: "mini_branch",
                        name: "同時トリプル分岐管",
                        type: "branch",
                        length: 15,
                        children: [
                            {
                                id: "mini_in1",
                                name: "店舗エリア1 (MMU)",
                                type: "indoor",
                                indoorStyle: "cassette_4way",
                                capacity: 4.5,
                                length: 5,
                                children: []
                            },
                            {
                                id: "mini_in2",
                                name: "店舗エリア2 (MMU)",
                                type: "indoor",
                                indoorStyle: "cassette_4way",
                                capacity: 4.5,
                                length: 5,
                                children: []
                            },
                            {
                                id: "mini_in3",
                                name: "店舗エリア3 (MMU)",
                                type: "indoor",
                                indoorStyle: "cassette_4way",
                                capacity: 4.5,
                                length: 5,
                                children: []
                            }
                        ]
                    }
                ]
            };
        } else {
            // u 冷暖切換
            this.systemTree = {
                id: "root",
                name: "室外機 MMY-MAP2806HP (10馬力)",
                type: "outdoor",
                capacity: 28.0,
                length: 0,
                children: [
                    {
                        id: "branch_u1",
                        name: "第1分岐管 A",
                        type: "branch",
                        length: 20,
                        children: [
                            {
                                id: "indoor_u1",
                                name: "事務室 A (MMU)",
                                type: "indoor",
                                indoorStyle: "cassette_4way",
                                capacity: 11.2,
                                length: 5,
                                children: []
                            },
                            {
                                id: "branch_u2",
                                name: "第2分岐管 B",
                                type: "branch",
                                length: 15,
                                children: [
                                    {
                                        id: "indoor_u2",
                                        name: "会議室 B (MMU)",
                                        type: "indoor",
                                        indoorStyle: "cassette_4way",
                                        capacity: 8.0,
                                        length: 7,
                                        children: []
                                    },
                                    {
                                        id: "indoor_u3",
                                        name: "応接室 C (MMK)",
                                        type: "indoor",
                                        indoorStyle: "wall_mounted",
                                        capacity: 4.5,
                                        length: 10,
                                        children: []
                                    }
                                ]
                            }
                        ]
                    }
                ]
            };
        }

        this.activeNodeId = "root";
        this.update();
    }

    exportJsonData() {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.systemTree, null, 2));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", `carrier_piping_system_${this.activeSeriesId}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
    }

    renderTotals(totals) {
        if (!this.totalsPanel) return;

        let html = '';

        html += `
            <div style="margin-bottom: 1rem;">
                <h4 style="font-size: 0.78rem; color: var(--color-secondary); margin-bottom: 6px;">📐 冷媒配管サイズ別長さ</h4>
                <table class="bom-table">
                    <thead>
                        <tr>
                            <th>管種・サイズ (JISミリ外径)</th>
                            <th style="text-align: right;">長さ (m)</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        let hasPipes = false;

        Object.keys(totals.highGasPipes).forEach(sz => {
            html += `<tr><td>吸入ガス管: φ${sz} mm</td><td style="text-align: right;">${totals.lowGasPipes[sz] || 0} m</td></tr>`;
            html += `<tr><td>吐出ガス管: φ${sz} mm</td><td style="text-align: right;">${totals.highGasPipes[sz] || 0} m</td></tr>`;
            hasPipes = true;
        });

        Object.keys(totals.liquidPipes).sort((a,b)=>parseFloat(a)-parseFloat(b)).forEach(sz => {
            html += `<tr><td>液管: φ${sz} mm</td><td style="text-align: right;">${totals.liquidPipes[sz]} m</td></tr>`;
            hasPipes = true;
        });
        Object.keys(totals.gasPipes).sort((a,b)=>parseFloat(a)-parseFloat(b)).forEach(sz => {
            html += `<tr><td>ガス管: φ${sz} mm</td><td style="text-align: right;">${totals.gasPipes[sz]} m</td></tr>`;
            hasPipes = true;
        });

        if (!hasPipes) {
            html += `<tr><td colspan="2" style="text-align:center; color:var(--text-muted);">配管は接続されていません</td></tr>`;
        }

        html += `
                    </tbody>
                </table>
                <div style="font-size:0.75rem; color:var(--text-muted); margin-top:6px; text-align:right;">
                    総配管長: <strong>${totals.totalLength} m</strong>
                </div>
            </div>
        `;

        html += `
            <div>
                <h4 style="font-size: 0.78rem; color: var(--color-secondary); margin-bottom: 6px;">📦 分岐継手・FSユニット</h4>
                <table class="bom-table">
                    <thead>
                        <tr>
                            <th>品名 / 指定型番</th>
                            <th style="text-align: right;">数量</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        let hasJoints = false;
        Object.keys(totals.joints).forEach(model => {
            let label = "分岐ジョイント管";
            if (model.startsWith('RBM-FR')) {
                label = "FSユニット";
            }
            html += `<tr><td>${label}<br><strong style="font-family:var(--font-mono);">${model}</strong></td><td style="text-align: right;">${totals.joints[model]} 個</td></tr>`;
            hasJoints = true;
        });

        if (!hasJoints) {
            html += `<tr><td colspan="2" style="text-align:center; color:var(--text-muted);">分岐部材はありません</td></tr>`;
        }

        html += `
                    </tbody>
                </table>
            </div>
            <div style="margin-top: 1rem; border-top: 1px solid var(--border-color); padding-top: 0.75rem;">
                <div style="font-size:0.75rem; font-weight:600; text-transform:uppercase; color:var(--text-secondary); margin-bottom:6px;">冷媒配管サイズ標準選定目安表 (凡例)</div>
                <table style="width:100%; font-size:0.7rem; border-collapse:collapse; text-align:left; color:var(--text-secondary);">
                    <thead>
                        <tr style="border-bottom:1px solid var(--border-color); color:var(--text-primary);">
                            <th style="padding:2px 0;">下流容量(kW)</th>
                            <th style="padding:2px 0;">液管径</th>
                            <th style="padding:2px 0;">ガス管径</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr><td style="padding:2px 0;">〜 5.6 (2馬力)</td><td>φ6.35</td><td>φ12.70</td></tr>
                        <tr><td style="padding:2px 0;">〜 14.0 (5馬力)</td><td>φ9.52</td><td>φ15.88</td></tr>
                        <tr><td style="padding:2px 0;">〜 22.4 (8馬力)</td><td>φ9.52</td><td>φ19.05</td></tr>
                        <tr><td style="padding:2px 0;">〜 28.0 (10馬力)</td><td>φ9.52</td><td>φ22.20</td></tr>
                        <tr><td style="padding:2px 0;">〜 45.0 (16馬力)</td><td>φ12.70</td><td>φ28.58</td></tr>
                        <tr><td style="padding:2px 0;">〜 71.0 (25馬力)</td><td>φ15.88</td><td>φ31.75</td></tr>
                        <tr><td style="padding:2px 0;">71.0 超 (30馬力〜)</td><td>φ19.05</td><td>φ38.10</td></tr>
                    </tbody>
                </table>
            </div>
        `;

        this.totalsPanel.innerHTML = html;
    }

    renderWarnings(warnings) {
        if (!this.warningPanel) return;

        const warningBtn = document.querySelector(".tab-btn[onclick*='warnings']");
        if (warningBtn) {
            warningBtn.innerHTML = `⚠️ 設計診断 (${warnings.length})`;
            warningBtn.style.color = warnings.length > 0 ? 'var(--color-danger)' : '';
        }

        if (warnings.length === 0) {
            this.warningPanel.innerHTML = `
                <div style="text-align:center; padding:2rem 0; color:var(--color-success);">
                    <div style="font-size:2rem; margin-bottom:8px;">✅</div>
                    <div style="font-size:0.8rem; font-weight:600;">設計チェッククリア</div>
                    <div style="font-size:0.7rem; color:var(--text-muted); margin-top:2px;">配管接続・容量比率共に正常です。</div>
                </div>
            `;
            return;
        }

        let html = '';
        warnings.forEach((w, idx) => {
            const isInfo = w.type === 'info';
            const msg = w.message || w;
            html += `
                <div class="warning-item ${isInfo ? 'warning-info' : ''} clickable" data-warning-idx="${idx}" style="cursor:pointer;">
                    <div style="font-size: 0.95rem;">${isInfo ? 'ℹ️' : '🚨'}</div>
                    <div>${msg} <span style="font-size:0.7rem; color:var(--color-secondary);">(クリックで該当機器強調)</span></div>
                </div>
            `;
        });

        this.warningPanel.innerHTML = html;

        const warningItems = this.warningPanel.querySelectorAll('.warning-item.clickable');
        warningItems.forEach((item, idx) => {
            item.addEventListener('click', () => {
                const warningText = warnings[idx]?.message || warnings[idx] || item.textContent;

                document.querySelectorAll('.node-card').forEach(nc => nc.classList.remove('error-blink'));
                let targetId = this.activeNodeId || 'root';
                const targetCard = document.querySelector(`[data-id="${targetId}"] > .node-card`) || document.querySelector('.node-card');
                if (targetCard) {
                    targetCard.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
                    targetCard.classList.add('error-blink');
                    setTimeout(() => targetCard.classList.remove('error-blink'), 3000);
                }

                // ④ 対処方法モーダル表示
                this.openFixSuggestionModal(warningText);
            });
        });
    }

    findNodeById(node, id) {
        if (node.id === id) return node;
        if (node.children) {
            for (const child of node.children) {
                const found = this.findNodeById(child, id);
                if (found) return found;
            }
        }
        return null;
    }

    findParentNode(node, childId) {
        if (node.children && node.children.some(c => c.id === childId)) {
            return node;
        }
        if (node.children) {
            for (const child of node.children) {
                const found = this.findParentNode(child, childId);
                if (found) return found;
            }
        }
        return null;
    }

    getHpFromKw(kw) {
        const currentSeries = this.engine.SERIES_DATABASE[this.activeSeriesId];
        const match = currentSeries.outdoorCapacities.find(c => Math.abs(c.kw - kw) < 0.1);
        return match ? match.hp : (kw / 2.8).toFixed(1);
    }

    getIndoorLabelFromKw(kw) {
        const currentSeries = this.engine.SERIES_DATABASE[this.activeSeriesId];
        const match = currentSeries.indoorTypes.find(i => Math.abs(i.kw - kw) < 0.1);
        return match ? match.type.split(' ')[0] : `P${(kw * 10).toFixed(0)}形`;
    }

    // ===== 更新履歴モーダル制御 =====
    openHistoryModal() {
        const overlay = document.getElementById('history-modal-overlay');
        if (overlay) {
            overlay.classList.add('show');
            this.renderHistoryModal();
        }
    }

    closeHistoryModal() {
        const overlay = document.getElementById('history-modal-overlay');
        if (overlay) {
            overlay.classList.remove('show');
        }
    }

    renderHistoryModal() {
        const statusDiv = document.getElementById('history-check-status');
        const container = document.getElementById('history-list-container');
        if (!statusDiv || !container) return;

        const checker = window._specChecker;
        if (!checker) {
            container.innerHTML = '<div class="history-empty">更新チェックエンジンがロードされていません。</div>';
            return;
        }

        const lastCheck = checker.getLastCheckDate();
        const nextCheckText = lastCheck 
            ? new Date(lastCheck.getTime() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString()
            : '次回起動時';

        statusDiv.innerHTML = `
            <strong>最終チェック日:</strong> ${lastCheck ? lastCheck.toLocaleString() : '未実行'}<br>
            <strong>次回自動チェック予定:</strong> ${nextCheckText} (前回から30日経過後)
        `;

        const rawHistory = checker.getHistory();
        if (rawHistory.length === 0) {
            container.innerHTML = '<div class="history-empty">変更履歴はまだありません。</div>';
            return;
        }

        // 「変更無し」の重複排除
        const history = [];
        let hasOk = false;
        rawHistory.forEach(entry => {
            if (entry.type === 'ok') {
                if (!hasOk) {
                    history.push(entry);
                    hasOk = true;
                }
            } else {
                history.push(entry);
            }
        });

        let html = '';
        history.forEach(entry => {
            const dateStr = new Date(entry.date).toLocaleString();
            let badgeClass = 'history-badge-ok';
            let badgeText = '仕様変更なし';

            if (entry.type === 'initial') {
                badgeClass = 'history-badge-initial';
                badgeText = '初期登録';
            } else if (entry.type === 'changed') {
                badgeClass = 'history-badge-changed';
                badgeText = '仕様変更あり';
            }

            html += `
                <div class="history-entry">
                    <div class="history-entry-header">
                        <span class="history-badge ${badgeClass}">${badgeText}</span>
                        <strong>${entry.label}</strong>
                        <span class="history-entry-date">${dateStr}</span>
                    </div>
            `;

            if (entry.changes && entry.changes.length > 0) {
                html += '<ul class="history-changes-list">';
                entry.changes.forEach(chg => {
                    let changeIcon = '✏️';
                    let desc = '';
                    if (chg.type === 'added') {
                        changeIcon = '➕';
                        desc = `<strong style="color:var(--color-success);">${chg.path}</strong> が追加されました (値: ${chg.newVal})`;
                    } else if (chg.type === 'removed') {
                        changeIcon = '❌';
                        desc = `<strong style="color:var(--color-danger);">${chg.path}</strong> が削除されました (旧値: ${chg.oldVal})`;
                    } else {
                        desc = `<strong>${chg.path}</strong> が変更されました: <span style="text-decoration:line-through; color:var(--text-muted);">${chg.oldVal}</span> ➡️ <strong style="color:var(--color-secondary);">${chg.newVal}</strong>`;
                    }
                    html += `
                        <li>
                            <span class="history-change-icon">${changeIcon}</span>
                            <span>${desc}</span>
                        </li>
                    `;
                });
                html += '</ul>';
            } else if (entry.type !== 'initial') {
                html += `<div style="font-size:0.78rem; color:var(--text-muted); margin-top:0.25rem;">データベース定義に更新はありません。</div>`;
            } else {
                html += `<div style="font-size:0.78rem; color:var(--text-muted); margin-top:0.25rem;">初期スナップショットを登録しました。以降の仕様・品番変更を監視します。</div>`;
            }

            html += `</div>`;
        });

        container.innerHTML = html;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = RefrigerantSizerUI;
} else {
    window.RefrigerantSizerUI = RefrigerantSizerUI;
}
