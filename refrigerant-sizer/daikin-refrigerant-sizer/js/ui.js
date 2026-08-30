/**
 * UI Renderer and Event Controller (Fully Featured with Catalog Codes & Advanced Layout Validation)
 * 
 * Manages:
 * 1. Rendering the system tree dynamically as HTML cards (with Style and Model Number Badges).
 * 2. Drawing connector paths using SVG.
 * 3. Handling node selection, addition, editing, and deletion.
 * 4. Syncing user modifications with the multi-series engine (locking valid capacities).
 * 5. Managing local file save/load, presets, and PDF printing.
 */

class RefrigerantSizerUI {
    constructor(engine) {
        this.engine = engine;
        
        // localStorage からの状態復元
        let loadedTree = null;
        let loadedSeriesId = "vrv7_x";
        let loadedNodeId = "root";
        let loadedManualSizeUp = false;

        try {
            const savedTree = localStorage.getItem('daikin_sizer_system_tree');
            if (savedTree) loadedTree = JSON.parse(savedTree);
            const savedSeries = localStorage.getItem('daikin_sizer_active_series_id');
            if (savedSeries) loadedSeriesId = savedSeries;
            const savedNode = localStorage.getItem('daikin_sizer_active_node_id');
            if (savedNode) loadedNodeId = savedNode;
            const savedSizeUp = localStorage.getItem('daikin_sizer_enable_manual_sizeup');
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
                name: "室外機 (システム)",
                type: "outdoor",
                capacity: 28.0, // 10 HP
                length: 0,
                children: [
                    {
                        id: "branch_1",
                        name: "分岐継手 A",
                        type: "branch",
                        length: 15,
                        children: [
                            {
                                id: "indoor_1",
                                name: "会議室 A (室内機)",
                                type: "indoor",
                                indoorStyle: "cassette_4way",
                                capacity: 5.6,
                                length: 8,
                                children: []
                            },
                            {
                                id: "indoor_2",
                                name: "応接室 B (室内機)",
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
        
        // Cache DOM elements
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
        // セレクトボックス等の初期表示状態を復元
        if (this.seriesSelect) {
            this.seriesSelect.value = this.activeSeriesId;
        }
        const forceSUpBtn = document.getElementById('btn-force-sizeup');
        if (forceSUpBtn) {
            forceSUpBtn.classList.toggle('btn-primary', this.enableManualSizeUp);
        }
        this.update();
    }

    /**
     * Compute and render the entire application state.
     */
    update() {
        // Automatically validate/repair capacity choices if they mismatch series or style options
        this.validateAndRepairTreeForSeries(this.systemTree);

        // Run sizer calculation engine
        const results = this.engine.calculateSystem(this.systemTree, this.activeSeriesId, this.enableManualSizeUp);
        
        if (results.error) {
            console.error(results.error);
            return;
        }

        this.sizerResult = results;

        // localStorage へ最新状態を保存
        try {
            localStorage.setItem('daikin_sizer_system_tree', JSON.stringify(this.systemTree));
            localStorage.setItem('daikin_sizer_active_series_id', this.activeSeriesId);
            localStorage.setItem('daikin_sizer_active_node_id', this.activeNodeId);
            localStorage.setItem('daikin_sizer_enable_manual_sizeup', this.enableManualSizeUp ? 'true' : 'false');
        } catch (e) {
            console.error("Failed to save state to localStorage", e);
        }
        
        // Render panels
        this.renderTree(results.tree);
        this.drawConnections();
        this.renderTotals(results.totals);
        this.renderWarnings(results.warnings);
        this.renderPropertyEditor();
    }

    /**
     * Render the tree as interactive HTML elements.
     */
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

    /**
     * Recursively generate DOM for a node.
     */
    createNodeElement(node) {
        const container = document.createElement('div');
        container.className = 'tree-node-container';
        container.setAttribute('data-id', node.id);

        const card = document.createElement('div');
        card.className = `node-card ${node.id === this.activeNodeId ? 'active' : ''}`;
        
        let badgeClass = 'type-branch';
        let typeLabel = '分岐継手';
        if (node.type === 'outdoor') {
            badgeClass = 'type-outdoor';
            typeLabel = '室外機';
        } else if (node.type === 'indoor') {
            badgeClass = 'type-indoor';
            
            const styleConfig = this.engine.INDOOR_STYLES[node.indoorStyle || 'cassette_4way'];
            const styleShort = styleConfig ? styleConfig.name.split(' ')[0] : 'カセット形';
            typeLabel = `室内機 [${styleShort}]`;
        } else if (node.type === 'bs_unit') {
            badgeClass = 'type-bs-unit';
            typeLabel = 'BSユニット';
        }

        // Prepare specs
        let specHtml = '';
        if (node.type === 'outdoor') {
            specHtml = `
                <div class="spec-item"><span class="spec-lbl">定格容量:</span><span class="spec-val">${node.capacity.toFixed(1)} kW</span></div>
                <div class="spec-item"><span class="spec-lbl">馬力相当:</span><span class="spec-val">${this.getHpFromKw(node.capacity)} HP</span></div>
            `;
        } else if (node.type === 'indoor') {
            specHtml = `
                <div class="spec-item"><span class="spec-lbl">容量型番:</span><span class="spec-val">${this.getIndoorLabelFromKw(node.capacity)}</span></div>
                <div class="spec-item"><span class="spec-lbl">配管長:</span><span class="spec-val">${node.length} m</span></div>
            `;
        } else if (node.type === 'bs_unit') {
            const childIndoors = this.engine.countIndoors(node);
            specHtml = `
                <div class="spec-item"><span class="spec-lbl">下流合計:</span><span class="spec-val">${node.downstreamCapacity.toFixed(1)} kW</span></div>
                <div class="spec-item"><span class="spec-lbl">接続台数:</span><span class="spec-val">${childIndoors} 台</span></div>
                <div class="spec-item"><span class="spec-lbl">配管長:</span><span class="spec-val">${node.length} m</span></div>
            `;
        } else {
            specHtml = `
                <div class="spec-item"><span class="spec-lbl">下流合計:</span><span class="spec-val">${node.downstreamCapacity.toFixed(1)} kW</span></div>
                <div class="spec-item"><span class="spec-lbl">継手型式:</span><span class="spec-val" style="color: var(--color-warning);">${node.jointModel || '-'}</span></div>
                <div class="spec-item"><span class="spec-lbl">配管長:</span><span class="spec-val">${node.length} m</span></div>
            `;
        }

        // Piping output (3管 / 2管 ハイブリッド自動表示)
        const is3Pipe = this.sizerResult && this.sizerResult.is3Pipe;
        let pipeHtml = '';
        if (node.type !== 'outdoor') {
            const liqCorrected    = node.liquidCorrected    ? ' <span style="font-size:0.6rem; opacity:0.8;">[縮小]</span>' : '';
            const hlgCorrected    = node.highLowGasCorrected? ' <span style="font-size:0.6rem; opacity:0.8;">[縮小]</span>' : '';
            const sgCorrected     = node.suctionGasCorrected? ' <span style="font-size:0.6rem; opacity:0.8;">[縮小]</span>' : '';
            const gasCorrected    = node.gasCorrected       ? ' <span style="font-size:0.6rem; opacity:0.8;">[縮小]</span>' : '';
            
            if (node.pipeHighLowGas !== undefined && node.pipeSuctionGas !== undefined) {
                pipeHtml = `
                    <div class="pipe-result-badge">
                        <div>液管: φ${node.pipeLiquid}${liqCorrected}</div>
                        <div style="color:var(--color-warning);">高低圧ガス: φ${node.pipeHighLowGas}${hlgCorrected}</div>
                        <div style="color:var(--color-secondary);">吸入ガス: φ${node.pipeSuctionGas}${sgCorrected}</div>
                    </div>
                `;
            } else {
                pipeHtml = `
                    <div class="pipe-result-badge">
                        <div>液管: φ${node.pipeLiquid}${liqCorrected}</div>
                        <div>ガス管: φ${node.pipeGas}${gasCorrected}</div>
                    </div>
                `;
            }
        } else {
            if (is3Pipe) {
                pipeHtml = `
                    <div class="pipe-result-badge" style="color: var(--text-muted);">
                        <div>液管: φ${node.pipeLiquid} ${node.isSizedUp ? '(サイズUP)' : '(主管)'}</div>
                        <div style="color:var(--color-warning);">高低圧ガス: φ${node.pipeHighLowGas} ${node.isSizedUp ? '(サイズUP)' : '(主管)'}</div>
                        <div style="color:var(--color-secondary);">吸入ガス: φ${node.pipeSuctionGas} ${node.isSizedUp ? '(サイズUP)' : '(主管)'}</div>
                    </div>
                `;
            } else {
                pipeHtml = `
                    <div class="pipe-result-badge" style="color: var(--text-muted);">
                        <div>液管: φ${node.pipeLiquid} ${node.isSizedUp ? '(サイズUP)' : '(主管)'}</div>
                        <div>ガス管: φ${node.pipeGas} ${node.isSizedUp ? '(サイズUP)' : '(主管)'}</div>
                    </div>
                `;
            }
        }

        const modelNum = node.modelNumber || '-';

        card.innerHTML = `
            <div class="node-header">
                <span class="node-type ${badgeClass}">${typeLabel}</span>
                ${node.type !== 'outdoor' ? `<span class="spec-val" style="font-size:0.75rem;">${node.length}m</span>` : ''}
            </div>
            <div class="node-title">${node.name}</div>
            
            <!-- Manufacturer Dynamic Model Number Display (品番表示) -->
            <div style="font-size: 0.725rem; font-family: var(--font-mono); color: var(--color-secondary); margin-bottom: 8px; padding: 2px 6px; background: rgba(255,255,255,0.03); border: 1px dashed rgba(255,255,255,0.08); border-radius: 4px; display: inline-block;">
                品番: ${modelNum}
            </div>
            
            <div class="node-specs">${specHtml}</div>
            ${pipeHtml}
        `;

        card.addEventListener('click', (e) => {
            e.stopPropagation();
            this.setActiveNode(node.id);
        });

        container.appendChild(card);

        if (node.children && node.children.length > 0) {
            const childrenWrapper = document.createElement('div');
            childrenWrapper.className = 'children-container';
            for (const child of node.children) {
                childrenWrapper.appendChild(this.createNodeElement(child));
            }
            container.appendChild(childrenWrapper);
        }

        return container;
    }

    /**
     * Draw SVG organic connection lines.
     */
    drawConnections() {
        if (!this.svgCanvas) return;
        
        setTimeout(() => {
            this.svgCanvas.innerHTML = '';
            const canvasRect = this.canvas.getBoundingClientRect();
            
            this.svgCanvas.style.width = `${this.canvas.scrollWidth}px`;
            this.svgCanvas.style.height = `${this.canvas.scrollHeight}px`;

            const drawForNode = (nodeEl) => {
                const card = nodeEl.querySelector(':scope > .node-card');
                const childrenContainer = nodeEl.querySelector(':scope > .children-container');
                
                if (!card || !childrenContainer) return;

                const parentRect = card.getBoundingClientRect();
                const parentX = (parentRect.right - canvasRect.left) + this.canvas.scrollLeft;
                const parentY = (parentRect.top + parentRect.height / 2 - canvasRect.top) + this.canvas.scrollTop;

                const childElements = childrenContainer.querySelectorAll(':scope > .tree-node-container');
                childElements.forEach(childEl => {
                    const childCard = childEl.querySelector(':scope > .node-card');
                    if (!childCard) return;

                    const childRect = childCard.getBoundingClientRect();
                    const childX = (childRect.left - canvasRect.left) + this.canvas.scrollLeft;
                    const childY = (childRect.top + childRect.height / 2 - canvasRect.top) + this.canvas.scrollTop;

                    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                    const controlOffset = Math.abs(childX - parentX) * 0.5;
                    const cp1X = parentX + controlOffset;
                    const cp1Y = parentY;
                    const cp2X = childX - controlOffset;
                    const cp2Y = childY;
                    
                    const d = `M ${parentX} ${parentY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${childX} ${childY}`;
                    
                    path.setAttribute('d', d);
                    path.setAttribute('fill', 'none');
                    path.setAttribute('stroke', 'rgba(0, 210, 255, 0.35)');
                    path.setAttribute('stroke-width', '2');
                    path.setAttribute('stroke-dasharray', '4 4');
                    this.svgCanvas.appendChild(path);

                    // 配管道中への冷媒サイズ記号（ラベル）自動記入
                    const childId = childEl.getAttribute('data-id');
                    const nodeObj = this.findNodeById(this.systemTree, childId);
                    if (nodeObj && (nodeObj.pipeLiquid || nodeObj.pipeGas || nodeObj.pipeSuctionGas)) {
                        let labelText = `L:φ${nodeObj.pipeLiquid || '-'} G:φ${nodeObj.pipeGas || '-'}`;
                        if (nodeObj.pipeHighLowGas !== undefined && nodeObj.pipeSuctionGas !== undefined) {
                            labelText = `L:φ${nodeObj.pipeLiquid} H:φ${nodeObj.pipeHighLowGas} S:φ${nodeObj.pipeSuctionGas}`;
                        }
                        const midX = (parentX + childX) / 2;
                        const midY = (parentY + childY) / 2;
                        const labelWidth = (nodeObj.pipeHighLowGas !== undefined) ? 140 : 104;

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

                    drawForNode(childEl);
                });
            };

            const rootEl = this.canvas.querySelector('.tree-node-container');
            if (rootEl) {
                drawForNode(rootEl);
            }
        }, 30);
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
    }

    /**
     * Render the property editor with series-specific AND style-specific capacity options (displaying dynamic model numbers).
     */
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
        
        // Dynamic Catalog Model Number Display Box
        editorHtml += `
            <div style="background:rgba(255,255,255,0.02); padding:12px; border-radius:var(--radius-sm); border:1px dashed var(--border-color); margin-bottom:1.25rem;">
                <label style="color:var(--color-secondary); font-size:0.7rem; text-transform:uppercase; font-weight:700;">メーカー指定品番 (自動決定)</label>
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
                        ${currentSeries.outdoorCapacities.map(c => `
                            <option value="${c.kw}" ${Math.abs(node.capacity - c.kw) < 0.1 ? 'selected' : ''}>${c.hp} HP (${c.kw.toFixed(1)} kW)</option>
                        `).join('')}
                    </select>
                </div>
            `;
        } else if (node.type === 'indoor') {
            const activeStyle = node.indoorStyle || 'cassette_4way';
            const validOptions = this.engine.getValidIndoorOptions(this.activeSeriesId, activeStyle);
            const isIndustrial = this.activeSeriesId === 'package_industrial';
            const allowedStyles = isIndustrial
                ? ['industrial_floor', 'industrial_ducted']
                : ['cassette_4way', 'wall_mounted', 'ceiling_suspended', 'floor_standing', 'ducted'];

            editorHtml += `
                <div class="form-group">
                    <label>室内機形状スタイル</label>
                    <select class="form-select" id="edit-style">
                        ${Object.keys(this.engine.INDOOR_STYLES)
                            .filter(styleKey => allowedStyles.includes(styleKey))
                            .map(styleKey => `
                                <option value="${styleKey}" ${activeStyle === styleKey ? 'selected' : ''}>${this.engine.INDOOR_STYLES[styleKey].name}</option>
                            `).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>室内機容量型番 (形状連動済み)</label>
                    <select class="form-select" id="edit-capacity">
                        ${validOptions.map(i => `
                            <option value="${i.kw}" ${Math.abs(node.capacity - i.kw) < 0.1 ? 'selected' : ''}>${i.type}</option>
                        `).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>配管長 (上流分岐からの長さ m)</label>
                    <input type="number" class="form-input" id="edit-length" min="1" max="150" value="${node.length}">
                </div>
            `;
        } else {
            editorHtml += `
                <div class="form-group">
                    <label>配管長 (上流からの長さ m)</label>
                    <input type="number" class="form-input" id="edit-length" min="1" max="150" value="${node.length}">
                </div>
            `;
        }

        if (node.type !== 'indoor') {
            editorHtml += `
                <div style="margin-top: 1rem; border-top: 1px solid var(--border-color); padding-top: 1rem;">
                    <label style="font-size:0.775rem; font-weight:500; color:var(--text-secondary); margin-bottom:8px; display:block;">下流に機器を追加</label>
                    <div class="add-node-bar" style="display: flex; gap: 8px; flex-wrap: wrap;">
                        <button class="btn btn-primary" id="add-branch-btn" style="flex:1; font-size:0.75rem; padding:6px 8px;">＋ 分岐継手</button>
                        ${this.activeSeriesId === 'vrv_r' ? `<button class="btn btn-primary" id="add-bs-btn" style="flex:1; font-size:0.75rem; padding:6px 8px; background:linear-gradient(135deg, #f59e0b, #d97706); color:white;">＋ BSユニット</button>` : ''}
                        <button class="btn btn-primary" id="add-indoor-btn" style="flex:1; font-size:0.75rem; padding:6px 8px; background:linear-gradient(135deg, #10b981, #059669); color:white;">＋ 室内機</button>
                    </div>
                </div>
            `;
        }

        if (node.id !== this.systemTree.id) {
            editorHtml += `
                <div style="margin-top: 1.5rem; border-top: 1px solid var(--border-color); padding-top: 1rem;">
                    <button class="btn btn-danger" id="delete-node-btn" style="width:100%; justify-content:center;">機器を削除</button>
                </div>
            `;
        }

        this.propPanel.innerHTML = editorHtml;

        // Sync inputs
        const nameInput = document.getElementById('edit-name');
        nameInput.addEventListener('change', (e) => {
            node.name = e.target.value;
            this.update();
        });

        const styleSelect = document.getElementById('edit-style');
        if (styleSelect) {
            styleSelect.addEventListener('change', (e) => {
                node.indoorStyle = e.target.value;
                this.clampCapacityForStyle(node);
                this.update();
            });
        }

        const capSelect = document.getElementById('edit-capacity');
        if (capSelect) {
            capSelect.addEventListener('change', (e) => {
                node.capacity = parseFloat(e.target.value);
                this.update();
            });
        }

        const lenInput = document.getElementById('edit-length');
        if (lenInput) {
            lenInput.addEventListener('change', (e) => {
                node.length = Math.max(0, parseFloat(e.target.value) || 0);
                this.update();
            });
        }

        const addBranchBtn = document.getElementById('add-branch-btn');
        if (addBranchBtn) {
            addBranchBtn.addEventListener('click', () => this.addChildNode(node, 'branch'));
        }

        const addBsBtn = document.getElementById('add-bs-btn');
        if (addBsBtn) {
            addBsBtn.addEventListener('click', () => this.addChildNode(node, 'bs_unit'));
        }

        const addIndoorBtn = document.getElementById('add-indoor-btn');
        if (addIndoorBtn) {
            addIndoorBtn.addEventListener('click', () => this.addChildNode(node, 'indoor'));
        }

        const delBtn = document.getElementById('delete-node-btn');
        if (delBtn) {
            delBtn.addEventListener('click', () => this.deleteNode(node.id));
        }
    }

    addChildNode(parent, type) {
        const id = `${type}_${Date.now()}`;
        let name = '';
        if (type === 'branch') {
            name = `分岐継手 ${parent.children.length + 1}`;
        } else if (type === 'bs_unit') {
            name = `BSユニット ${parent.children.length + 1}`;
        } else {
            name = `室内機 ${parent.children.length + 1}`;
        }

        const newChild = {
            id,
            name,
            type,
            length: type === 'branch' ? 10 : (type === 'bs_unit' ? 15 : 5),
            capacity: type === 'indoor' ? (this.activeSeriesId === 'package_industrial' ? 22.4 : 2.8) : 0,
            children: []
        };

        if (type === 'indoor') {
            newChild.indoorStyle = this.activeSeriesId === 'package_industrial' ? "industrial_floor" : "cassette_4way";
        }

        parent.children.push(newChild);
        this.activeNodeId = id;
        this.update();
    }

    deleteNode(id) {
        const parent = this.findParentNode(this.systemTree, id);
        if (parent) {
            parent.children = parent.children.filter(c => c.id !== id);
            this.activeNodeId = parent.id;
            this.update();
        }
    }

    /**
     * Render layout sizer metrics (Total system length, 1st branch constraints).
     */
    renderTotals(totals) {
        const currentSeries = this.engine.SERIES_DATABASE[this.activeSeriesId];
        
        let totalsHtml = `
            <div class="config-card" style="margin-bottom: 1rem;">
                <div class="config-row">
                    <span class="config-label">選択シリーズ:</span>
                    <span class="config-value" style="color: var(--color-secondary);">${currentSeries.name}</span>
                </div>
                <div class="config-row">
                    <span class="config-label">冷媒種別:</span>
                    <span class="config-value">${currentSeries.refrigerant}</span>
                </div>
                <div class="config-row">
                    <span class="config-label">接続室内機数:</span>
                    <span class="config-value">${totals.indoorCount} 台 / 最大 ${this.activeSeriesId === 'machi_multi' ? '2〜4' : currentSeries.maxIndoorUnits}台</span>
                </div>
                <div class="config-row">
                    <span class="config-label">室内機合計容量:</span>
                    <span class="config-value">${totals.totalIndoorCapacity.toFixed(1)} kW</span>
                </div>
                <div class="config-row">
                    <span class="config-label">容量接続率:</span>
                    <span class="config-value" style="color: ${totals.connectionRatio > 130 || totals.connectionRatio < 50 ? 'var(--color-danger)' : 'var(--color-success)'}">
                        ${totals.connectionRatio.toFixed(1)}%
                    </span>
                </div>
                <div class="config-row">
                    <span class="config-label">最遠配管相当長:</span>
                    <span class="config-value">${totals.longestPath.toFixed(1)} m</span>
                </div>
                
                <!-- NEW: Total System Piping Length display (総配管実長) -->
                <div class="config-row" style="border-top: 1px solid rgba(255,255,255,0.05); padding-top: 4px; margin-top: 4px;">
                    <span class="config-label">総配管実長:</span>
                    <span class="config-value" style="color: ${totals.totalPipingLength > currentSeries.maxPipingTotal ? 'var(--color-danger)' : 'var(--text-primary)'}">
                        ${totals.totalPipingLength.toFixed(1)} m / 制限 ${currentSeries.maxPipingTotal}m
                    </span>
                </div>
                
                <!-- NEW: 1st Branch Rule display (第1分岐以降最遠実長) -->
                <div class="config-row">
                    <span class="config-label">第1分岐以降最遠長:</span>
                    <span class="config-value" style="color: ${totals.firstBranchToIndoorMax > 90.0 ? 'var(--color-danger)' : (totals.firstBranchToIndoorMax > 40.0 ? 'var(--color-warning)' : 'var(--color-success)')}">
                        ${totals.firstBranchToIndoorMax.toFixed(1)} m / 制限 40m (最大90m)
                    </span>
                </div>
            </div>
            
            <div style="font-size:0.8rem; font-weight:600; text-transform:uppercase; color:var(--text-secondary); margin-bottom:8px;">冷媒配管部材集計 (BOM)</div>
            <div style="display:flex; flex-direction:column; gap:8px; max-height:160px; overflow-y:auto; padding-right:4px;">
        `;

        const allLiqSizes = Object.keys(totals.liquidPipes).sort((a,b) => parseFloat(a)-parseFloat(b));
        if (allLiqSizes.length > 0) {
            totalsHtml += `<div style="font-size:0.75rem; color:var(--color-secondary); margin-top:4px;">液管 (銅管)</div>`;
            for (const size of allLiqSizes) {
                totalsHtml += `
                    <div class="pipe-summary-item">
                        <span class="pipe-size-label">φ${size} (液管)</span>
                        <span class="pipe-length-badge">${totals.liquidPipes[size].toFixed(1)} m</span>
                    </div>
                `;
            }
        }

        // 2管式: ガス管（単管）
        const allGasSizes = Object.keys(totals.gasPipes).sort((a,b) => parseFloat(a)-parseFloat(b));
        if (allGasSizes.length > 0) {
            totalsHtml += `<div style="font-size:0.75rem; color:var(--color-primary); margin-top:8px;">ガス管 (銅管)</div>`;
            for (const size of allGasSizes) {
                totalsHtml += `
                    <div class="pipe-summary-item">
                        <span class="pipe-size-label">φ${size} (ガス管)</span>
                        <span class="pipe-length-badge">${totals.gasPipes[size].toFixed(1)} m</span>
                    </div>
                `;
            }
        }

        // 3管式: 高低圧ガス管
        const allHLGSizes = Object.keys(totals.highLowGasPipes || {}).sort((a,b) => parseFloat(a)-parseFloat(b));
        if (allHLGSizes.length > 0) {
            totalsHtml += `<div style="font-size:0.75rem; color:var(--color-warning); margin-top:8px;">高低圧ガス管 [3管式] (断熱要)</div>`;
            for (const size of allHLGSizes) {
                totalsHtml += `
                    <div class="pipe-summary-item">
                        <span class="pipe-size-label" style="color:var(--color-warning);">φ${size} (高低圧ガス)</span>
                        <span class="pipe-length-badge" style="background:rgba(245,158,11,0.12); color:var(--color-warning);">${totals.highLowGasPipes[size].toFixed(1)} m</span>
                    </div>
                `;
            }
        }

        // 3管式: 吸入ガス管
        const allSGSizes = Object.keys(totals.suctionGasPipes || {}).sort((a,b) => parseFloat(a)-parseFloat(b));
        if (allSGSizes.length > 0) {
            totalsHtml += `<div style="font-size:0.75rem; color:var(--color-secondary); margin-top:8px;">吸入ガス管 [3管式] (断熱要)</div>`;
            for (const size of allSGSizes) {
                totalsHtml += `
                    <div class="pipe-summary-item">
                        <span class="pipe-size-label" style="color:var(--color-secondary);">φ${size} (吸入ガス)</span>
                        <span class="pipe-length-badge">${totals.suctionGasPipes[size].toFixed(1)} m</span>
                    </div>
                `;
            }
        }

        totalsHtml += `
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
        totalsHtml += `</div>`;
        this.totalsPanel.innerHTML = totalsHtml;
    }

    renderWarnings(warnings) {
        if (!warnings || warnings.length === 0) {
            this.warningPanel.innerHTML = `
                <div class="alert-card success">
                    <span class="alert-icon">✓</span>
                    <div class="alert-text">
                        <div class="alert-title">設計ステータス: 正常</div>
                        <div class="alert-desc">選択されたシリーズの接続要領・配管基準を満たしています。</div>
                    </div>
                </div>
            `;
            return;
        }

        this.warningPanel.innerHTML = warnings.map((w, idx) => {
            const isCritical = w.includes("警告") || w.includes("超過");
            const alertClass = isCritical ? "alert-card clickable" : "alert-card warning clickable";
            const icon = isCritical ? "❌" : "⚠";
            const title = isCritical ? "設計エラー (クリックで最適対処方法を表示)" : "設計注意 (クリックで最適対処方法を表示)";
            
            return `
                <div class="${alertClass}" data-warning-idx="${idx}" style="margin-bottom:8px; border-color: ${isCritical ? 'rgba(239, 68, 68, 0.4)' : 'rgba(245, 158, 11, 0.2)'}; background: ${isCritical ? 'rgba(239, 68, 68, 0.08)' : 'rgba(245, 158, 11, 0.08)'}">
                    <span class="alert-icon">${icon}</span>
                    <div class="alert-text">
                        <div class="alert-title">${title}</div>
                        <div class="alert-desc" style="color:var(--text-primary); font-weight:500;">${w}</div>
                    </div>
                </div>
            `;
        }).join('');

        const alertCards = this.warningPanel.querySelectorAll('.alert-card.clickable');
        alertCards.forEach(card => {
            card.addEventListener('click', () => {
                const idx = parseInt(card.getAttribute('data-warning-idx'));
                const warningText = warnings[idx];
                
                // ハイライト
                document.querySelectorAll('.node-card').forEach(nc => nc.classList.remove('error-blink'));
                let targetId = this.activeNodeId || 'root';
                const targetCard = document.querySelector(`[data-id="${targetId}"] > .node-card`) || document.querySelector('.node-card');
                if (targetCard) {
                    targetCard.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
                    targetCard.classList.add('error-blink');
                    setTimeout(() => targetCard.classList.remove('error-blink'), 3000);
                }

                // ④ 対処方法モーダル提示
                this.openFixSuggestionModal(warningText);
            });
        });
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

        // エラー内容に応じた最適な対処法と修正アクションの決定
        let suggestion = "";
        let fixAction = null;

        if (warningText.includes("接続容量") && (warningText.includes("超過") || warningText.includes("逸脱") || warningText.includes("範囲外"))) {
            if (this.sizerResult.totals.connectionRatio > 130) {
                suggestion = "💡 【対処方法】: 室外機の馬力（容量）を1段階大きいサイズにアップし、接続率を推奨範囲（50%〜130%）内に調整します。";
                fixAction = () => this.changeOutdoorCapacity(1);
            } else {
                suggestion = "💡 【対処方法】: 室外機の馬力（容量）を1段階小さいサイズにダウンし、接続率を推奨範囲内に調整します。";
                fixAction = () => this.changeOutdoorCapacity(-1);
            }
        } else if (warningText.includes("最遠") || warningText.includes("第1分岐") || warningText.includes("40m") || warningText.includes("90m")) {
            suggestion = "💡 【対処方法】: 主管サイズアップ（1サイズ太径化）を強制適用し、長配管による圧力損失を補正・許容範囲内に収めます。";
            fixAction = () => { this.enableManualSizeUp = true; this.update(); };
        } else if (warningText.includes("総配管") || warningText.includes("許容限界")) {
            suggestion = "💡 【対処方法】: 主管サイズアップを強制適用して圧力損失を軽減します。必要に応じて配管長を短縮してください。";
            fixAction = () => { this.enableManualSizeUp = true; this.update(); };
        } else if (warningText.includes("台数")) {
            suggestion = "💡 【対処方法】: 室内ユニットの接続台数をメーカー許容最大台数以下に調整します。";
            fixAction = () => { alert("接続台数制限を超過しています。系統図から末端の室内機を削除または系統分割を行ってください。"); };
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

    /**
     * Map old node capacities to closest valid capacities in newly switched series.
     */
    validateAndRepairTreeForSeries(node) {
        const seriesConfig = this.engine.SERIES_DATABASE[this.activeSeriesId];
        const isIndustrial = this.activeSeriesId === 'package_industrial';
        
        if (node.type === 'outdoor') {
            const closest = seriesConfig.outdoorCapacities.reduce((prev, curr) => {
                return (Math.abs(curr.kw - node.capacity) < Math.abs(prev.kw - node.capacity) ? curr : prev);
            });
            node.capacity = closest.kw;
        } else if (node.type === 'indoor') {
            if (isIndustrial) {
                if (node.indoorStyle !== 'industrial_floor' && node.indoorStyle !== 'industrial_ducted') {
                    node.indoorStyle = "industrial_floor";
                }
            } else {
                if (node.indoorStyle === 'industrial_floor' || node.indoorStyle === 'industrial_ducted' || !node.indoorStyle) {
                    node.indoorStyle = "cassette_4way";
                }
            }
            this.clampCapacityForStyle(node);
        }

        if (node.children) {
            for (const child of node.children) {
                this.validateAndRepairTreeForSeries(child);
            }
        }
    }

    /**
     * Force clamp existing capacity value into realistic limits mapped to targeted style.
     */
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

        const is3Pipe = this.sizerResult.is3Pipe;
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
            else if (node.type === 'bs_unit') typeStr = "BSユニット";

            const nameStr = parentName ? `${parentName} ➔ ${node.name}` : node.name;
            const capStr = node.type === 'indoor' ? `${node.capacity.toFixed(1)} kW` : `${(node.downstreamCapacity || node.capacity || 0).toFixed(1)} kW`;
            const lenStr = `${node.length || 0} m`;
            const modelStr = node.modelNumber || node.jointModel || "-";
            const sizedUpTag = node.isSizedUp ? ' <span style="color:var(--color-secondary); font-weight:700;">(サイズUP)</span>' : '';

            let pipeLiquidStr = node.pipeLiquid ? `φ${node.pipeLiquid}` : "-";
            let pipeGasStr = node.pipeGas ? `φ${node.pipeGas}` : "-";
            let pipeHLGStr = node.pipeHighLowGas ? `φ${node.pipeHighLowGas}` : "-";
            let pipeSGStr = node.pipeSuctionGas ? `φ${node.pipeSuctionGas}` : "-";

            html += `
                <tr>
                    <td style="font-weight:600;">${nameStr}</td>
                    <td><span class="node-type type-${node.type === 'bs_unit' ? 'bs-unit' : node.type}">${typeStr}</span></td>
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
                        name: "室外機 (システム)",
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
        const btnHistory = document.getElementById('btn-update-history') || document.getElementById('btn-history');
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

    /**
     * Load presets suited to the currently selected active series (fully styled).
     */
    loadSamplePresetForSeries() {
        if (this.activeSeriesId === 'machi_multi') {
            this.systemTree = {
                id: "root",
                name: "室外機 (machiマルチ 6馬力)",
                type: "outdoor",
                capacity: 14.0, // 6HP
                length: 0,
                children: [
                    {
                        id: "branch_1",
                        name: "分岐継手 A",
                        type: "branch",
                        length: 12,
                        children: [
                            {
                                id: "indoor_1",
                                name: "事務室 A (室内機)",
                                type: "indoor",
                                indoorStyle: "cassette_4way",
                                capacity: 3.6, // 36形
                                length: 5,
                                children: []
                            },
                            {
                                id: "indoor_2",
                                name: "役員室 B (室内機)",
                                type: "indoor",
                                indoorStyle: "wall_mounted",
                                capacity: 2.8, // 28形
                                length: 8,
                                children: []
                            },
                            {
                                id: "indoor_3",
                                name: "ショールーム C (室内機)",
                                type: "indoor",
                                indoorStyle: "ceiling_suspended",
                                capacity: 5.6, // 56形
                                length: 6,
                                children: []
                            }
                        ]
                    }
                ]
            };
        } else if (this.activeSeriesId === 'skyair') {
            this.systemTree = {
                id: "root",
                name: "室外機 (SkyAir 6馬力)",
                type: "outdoor",
                capacity: 14.0, // 6HP
                length: 0,
                children: [
                    {
                        id: "branch_1",
                        name: "同時マルチ分岐継手",
                        type: "branch",
                        length: 15,
                        children: [
                            {
                                id: "indoor_1",
                                name: "店舗フロアA (室内機)",
                                type: "indoor",
                                indoorStyle: "cassette_4way",
                                capacity: 7.1, // 71形
                                length: 8,
                                children: []
                            },
                            {
                                id: "indoor_2",
                                name: "店舗フロアB (室内機)",
                                type: "indoor",
                                indoorStyle: "cassette_4way",
                                capacity: 7.1, // 71形
                                length: 8,
                                children: []
                            }
                        ]
                    }
                ]
            };
        } else if (this.activeSeriesId === 'package_industrial') {
            this.systemTree = {
                id: "root",
                name: "室外機 (設備用 10馬力)",
                type: "outdoor",
                capacity: 28.0, // 10HP
                length: 0,
                children: [
                    {
                        id: "indoor_1",
                        name: "機械室 (設備用室内機)",
                        type: "indoor",
                        indoorStyle: "industrial_floor",
                        capacity: 28.0, // 280形
                        length: 15,
                        children: []
                    }
                ]
            };
        } else if (this.activeSeriesId === 'vrv7_rx') {
            // 高暖房VRV Hシリーズ 寒冷地仕様サンプル
            this.systemTree = {
                id: "root",
                name: "室外機 (高暖房VRV H 20馬力)",
                type: "outdoor",
                capacity: 56.0, // 20 HP
                length: 0,
                children: [
                    {
                        id: "branch_1",
                        name: "主分岐 A",
                        type: "branch",
                        length: 20,
                        children: [
                            {
                                id: "indoor_1",
                                name: "事務室 A (室内機)",
                                type: "indoor",
                                indoorStyle: "cassette_4way",
                                capacity: 11.2, // 112形
                                length: 8,
                                children: []
                            },
                            {
                                id: "branch_2",
                                name: "廊下分岐 B",
                                type: "branch",
                                length: 15,
                                children: [
                                    {
                                        id: "indoor_2",
                                        name: "会議室 B (室内機)",
                                        type: "indoor",
                                        indoorStyle: "ducted",
                                        capacity: 16.0, // 160形
                                        length: 10,
                                        children: []
                                    },
                                    {
                                        id: "indoor_3",
                                        name: "応接室 C (室内機)",
                                        type: "indoor",
                                        indoorStyle: "wall_mounted",
                                        capacity: 5.6, // 56形
                                        length: 12,
                                        children: []
                                    }
                                ]
                            }
                        ]
                    }
                ]
            };
        } else if (this.activeSeriesId === 'vrv_r') {
            // VRV 7 RX 冷暖フリー 3管式＋BSユニットサンプル
            this.systemTree = {
                id: "root",
                name: "室外機 (VRV 7 RX 10馬力)",
                type: "outdoor",
                capacity: 28.0, // 10HP
                length: 0,
                children: [
                    {
                        id: "bs_1",
                        name: "BSユニット A",
                        type: "bs_unit",
                        length: 20,
                        children: [
                            {
                                id: "indoor_1",
                                name: "応接室 (室内機)",
                                type: "indoor",
                                indoorStyle: "cassette_4way",
                                capacity: 5.6, // 56形
                                length: 8,
                                children: []
                            },
                            {
                                id: "indoor_2",
                                name: "会議室 (室内機)",
                                type: "indoor",
                                indoorStyle: "cassette_4way",
                                capacity: 5.6, // 56形
                                length: 10,
                                children: []
                            }
                        ]
                    }
                ]
            };
        } else {
            // 標準 VRV 7 (X / X高COP / A)
            this.systemTree = {
                id: "root",
                name: "室外機 (VRV 7 X 16馬力)",
                type: "outdoor",
                capacity: 45.0, // 16 HP
                length: 0,
                children: [
                    {
                        id: "branch_1",
                        name: "主分岐 A",
                        type: "branch",
                        length: 25,
                        children: [
                            {
                                id: "branch_2",
                                name: "1階系統分岐 B",
                                type: "branch",
                                length: 12,
                                children: [
                                    {
                                        id: "indoor_1",
                                        name: "カフェ東 (室内機)",
                                        type: "indoor",
                                        indoorStyle: "cassette_4way",
                                        capacity: 11.2, // 112形
                                        length: 6,
                                        children: []
                                    },
                                    {
                                        id: "indoor_2",
                                        name: "カフェ西 (室内機)",
                                        type: "indoor",
                                        indoorStyle: "cassette_4way",
                                        capacity: 14.0, // 140形
                                        length: 8,
                                        children: []
                                    }
                                ]
                            },
                            {
                                id: "branch_3",
                                name: "2階系統分岐 C",
                                type: "branch",
                                length: 18,
                                children: [
                                    {
                                        id: "indoor_3",
                                        name: "北事務室 (室内機)",
                                        type: "indoor",
                                        indoorStyle: "ducted",
                                        capacity: 14.0, // 140形
                                        length: 12,
                                        children: []
                                    },
                                    {
                                        id: "indoor_4",
                                        name: "役員室 (室内機)",
                                        type: "indoor",
                                        indoorStyle: "wall_mounted",
                                        capacity: 5.6, // 56形
                                        length: 15,
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
        downloadAnchor.setAttribute("download", `daikin-refrigerant-design-${this.activeSeriesId}-${Date.now()}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
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
        return match ? match.type.split(' ')[0] : `${(kw * 10).toFixed(0)}形`;
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

        // 最終チェック日時の表示
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

        // 「変更無し」の重複排除 (type === 'ok' の連続重複を防止)
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
                badgeText = '仕様・品番変更検知';
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

// Export for browser
if (typeof module !== 'undefined' && module.exports) {
    module.exports = RefrigerantSizerUI;
} else {
    window.RefrigerantSizerUI = RefrigerantSizerUI;
}
