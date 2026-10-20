/**
 * UI Renderer and Event Controller (Daikin GHP Edition)
 */

class RefrigerantSizerUI {
    constructor(engine) {
        this.engine = engine;
        
        let loadedTree = null;
        let loadedSeriesId = "daikin_ghp_super_combi";
        let loadedGasType = "city_gas_13a";
        let loadedNodeId = "root";
        let loadedManualSizeUp = false;

        try {
            const savedTree = localStorage.getItem('daikin_ghp_sizer_system_tree');
            if (savedTree) loadedTree = JSON.parse(savedTree);
            const savedSeries = localStorage.getItem('daikin_ghp_sizer_active_series_id');
            if (savedSeries) loadedSeriesId = savedSeries;
            const savedGas = localStorage.getItem('daikin_ghp_sizer_active_gas_type');
            if (savedGas) loadedGasType = savedGas;
            const savedNode = localStorage.getItem('daikin_ghp_sizer_active_node_id');
            if (savedNode) loadedNodeId = savedNode;
            const savedSizeUp = localStorage.getItem('daikin_ghp_sizer_enable_manual_sizeup');
            if (savedSizeUp) loadedManualSizeUp = savedSizeUp === 'true';
        } catch (e) {
            console.error("Failed to load state from localStorage", e);
        }

        this.activeSeriesId = loadedSeriesId;
        this.activeGasType = loadedGasType;
        this.activeNodeId = loadedNodeId;
        this.enableManualSizeUp = loadedManualSizeUp;
        
        if (loadedTree) {
            this.systemTree = loadedTree;
        } else {
            this.systemTree = {
                id: "root",
                name: "ダイキン GHP室外機 (スーパーコンビ 16馬力)",
                type: "outdoor",
                capacity: 45.0,
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
                                name: "オフィス 1A (カセット形)",
                                type: "indoor",
                                indoorStyle: "cassette_4way",
                                capacity: 11.2,
                                length: 8,
                                children: []
                            },
                            {
                                id: "indoor_2",
                                name: "オフィス 1B (ダクト形)",
                                type: "indoor",
                                indoorStyle: "ducted",
                                capacity: 14.0,
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
        this.gasSelect = document.getElementById('gas-type-select');

        this.init();
    }

    init() {
        this.bindEvents();
        if (this.seriesSelect) this.seriesSelect.value = this.activeSeriesId;
        if (this.gasSelect) this.gasSelect.value = this.activeGasType;
        const forceSUpBtn = document.getElementById('btn-force-sizeup');
        if (forceSUpBtn) { forceSUpBtn.disabled = true; forceSUpBtn.setAttribute('aria-disabled', 'true'); forceSUpBtn.classList.remove('btn-primary'); }
        this.update();
    }

    update() {
        const results = this.engine.calculateSystem(this.systemTree, this.activeSeriesId, this.enableManualSizeUp, this.activeGasType);
        
        if (results.error) {
            console.error(results.error);
            return;
        }

        this.sizerResult = results;

        try {
            localStorage.setItem('daikin_ghp_sizer_system_tree', JSON.stringify(this.systemTree));
            localStorage.setItem('daikin_ghp_sizer_active_series_id', this.activeSeriesId);
            localStorage.setItem('daikin_ghp_sizer_active_gas_type', this.activeGasType);
            localStorage.setItem('daikin_ghp_sizer_active_node_id', this.activeNodeId);
            localStorage.setItem('daikin_ghp_sizer_enable_manual_sizeup', this.enableManualSizeUp ? 'true' : 'false');
        } catch (e) {
            console.error("Failed to save state", e);
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
        card.className = `node-card ${node.id === this.activeNodeId ? 'active' : ''}`;
        
        let badgeClass = 'type-branch';
        let typeLabel = '分岐継手';
        if (node.type === 'outdoor') {
            badgeClass = 'type-outdoor';
            typeLabel = 'GHP室外機';
        } else if (node.type === 'indoor') {
            badgeClass = 'type-indoor';
            const styleConfig = this.engine.INDOOR_STYLES[node.indoorStyle || 'cassette_4way'];
            typeLabel = `室内機 [${styleConfig ? styleConfig.name.split(' ')[0] : 'カセット'}]`;
        } else if (node.type === 'bs_unit') {
            badgeClass = 'type-bs-unit';
            typeLabel = 'BSユニット';
        }

        let specHtml = '';
        if (node.type === 'outdoor') {
            specHtml = `
                <div class="spec-item"><span class="spec-lbl">定格容量:</span><span class="spec-val">${node.capacity.toFixed(1)} kW</span></div>
                <div class="spec-item"><span class="spec-lbl">燃料:</span><span class="spec-val" style="color:var(--color-secondary);">${this.activeGasType === 'lpg' ? 'LPガス' : '都市ガス13A'}</span></div>
            `;
        } else if (node.type === 'indoor') {
            specHtml = `
                <div class="spec-item"><span class="spec-lbl">容量型番:</span><span class="spec-val">${node.capacity.toFixed(1)} kW</span></div>
                <div class="spec-item"><span class="spec-lbl">配管長:</span><span class="spec-val">${node.length} m</span></div>
            `;
        } else if (node.type === 'bs_unit') {
            const childIndoors = this.engine.countIndoors(node);
            specHtml = `
                <div class="spec-item"><span class="spec-lbl">下流合計:</span><span class="spec-val">${node.downstreamCapacity ? node.downstreamCapacity.toFixed(1) : '0.0'} kW</span></div>
                <div class="spec-item"><span class="spec-lbl">接続台数:</span><span class="spec-val">${childIndoors} 台</span></div>
                <div class="spec-item"><span class="spec-lbl">配管長:</span><span class="spec-val">${node.length} m</span></div>
            `;
        } else {
            specHtml = `
                <div class="spec-item"><span class="spec-lbl">下流合計:</span><span class="spec-val">${node.downstreamCapacity ? node.downstreamCapacity.toFixed(1) : '0.0'} kW</span></div>
                <div class="spec-item"><span class="spec-lbl">継手型式:</span><span class="spec-val" style="color: var(--color-warning);">${node.jointModel || '-'}</span></div>
                <div class="spec-item"><span class="spec-lbl">配管長:</span><span class="spec-val">${node.length} m</span></div>
            `;
        }

        const is3Pipe = this.sizerResult && this.sizerResult.is3Pipe;
        let pipeHtml = '';
        if (node.type !== 'outdoor') {
            if (node.pipeHighLowGas !== undefined && node.pipeSuctionGas !== undefined) {
                pipeHtml = `
                    <div class="pipe-result-badge">
                        <div>液管: φ${node.pipeLiquid}</div>
                        <div style="color:var(--color-warning);">高低圧ガス: φ${node.pipeHighLowGas}</div>
                        <div style="color:var(--color-secondary);">吸入ガス: φ${node.pipeSuctionGas}</div>
                    </div>
                `;
            } else {
                pipeHtml = `
                    <div class="pipe-result-badge">
                        <div>液管: φ${node.pipeLiquid}</div>
                        <div>ガス管: φ${node.pipeGas}</div>
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

        card.innerHTML = `
            <div class="node-header">
                <span class="node-type ${badgeClass}">${typeLabel}</span>
                ${node.type !== 'outdoor' ? `<span class="spec-val" style="font-size:0.75rem;">${node.length}m</span>` : ''}
            </div>
            <div class="node-title">${node.name}</div>
            <div style="font-size: 0.725rem; font-family: var(--font-mono); color: var(--color-secondary); margin-bottom: 8px; padding: 2px 6px; background: rgba(255,255,255,0.03); border: 1px dashed rgba(255,255,255,0.08); border-radius: 4px; display: inline-block;">
                品番: ${node.modelNumber || '-'}
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

    drawConnections() {
        if (!this.svgCanvas) return;
        
        setTimeout(() => {
            this.svgCanvas.innerHTML = '';
            const canvasRect = this.canvas.getBoundingClientRect();
            
            this.svgCanvas.style.width = `${this.canvas.scrollWidth}px`;
            this.svgCanvas.style.height = `${this.canvas.scrollHeight}px`;

            const currentTree = (this.sizerResult && this.sizerResult.tree) ? this.sizerResult.tree : this.systemTree;

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
                    path.setAttribute('stroke', 'rgba(77, 144, 245, 0.35)');
                    path.setAttribute('stroke-width', '2');
                    path.setAttribute('stroke-dasharray', '4 4');
                    this.svgCanvas.appendChild(path);

                    // 配管道中への冷媒サイズ記号（ラベル）自動記入
                    const childId = childEl.getAttribute('data-id');
                    const nodeObj = this.findNodeById(currentTree, childId);
                    const pLiquid = nodeObj ? (nodeObj.pipeLiquid || (nodeObj.pipes && nodeObj.pipes.liquid)) : null;
                    const pGas = nodeObj ? (nodeObj.pipeGas || (nodeObj.pipes && nodeObj.pipes.gas)) : null;

                    if (nodeObj && (pLiquid || pGas)) {
                        const midX = (parentX + childX) / 2;
                        const midY = (parentY + childY) / 2;

                        // 区間種別判定
                        const parentId = nodeEl.getAttribute('data-id');
                        const parentObj = this.findNodeById(currentTree, parentId);
                        let segmentLabel = '分岐→室内機';
                        let segmentColor = '#10b981';
                        if (parentObj && parentObj.type === 'outdoor') {
                            segmentLabel = '室外機→分岐';
                            segmentColor = '#00a2e8';
                        } else if (nodeObj.type === 'branch') {
                            segmentLabel = '分岐→分岐';
                            segmentColor = '#f59e0b';
                        }

                        const labelWidth = 118;
                        const rowH = 16;
                        const boxH = 3 * rowH + 6;
                        const boxY = midY - boxH / 2;

                        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');

                        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                        rect.setAttribute('class', 'pipe-label-bg');
                        rect.setAttribute('x', midX - labelWidth / 2);
                        rect.setAttribute('y', boxY);
                        rect.setAttribute('width', labelWidth);
                        rect.setAttribute('height', boxH);
                        rect.setAttribute('rx', '5');
                        rect.setAttribute('stroke', segmentColor);
                        g.appendChild(rect);

                        const tHeader = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                        tHeader.setAttribute('class', 'pipe-label-header');
                        tHeader.setAttribute('x', midX);
                        tHeader.setAttribute('y', boxY + rowH - 2);
                        tHeader.setAttribute('fill', segmentColor);
                        tHeader.textContent = segmentLabel;
                        g.appendChild(tHeader);

                        const tLiq = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                        tLiq.setAttribute('class', 'pipe-label-text');
                        tLiq.setAttribute('x', midX);
                        tLiq.setAttribute('y', boxY + rowH * 2 - 2);
                        tLiq.setAttribute('fill', '#e0f2fe');
                        tLiq.textContent = '液管: φ' + (pLiquid || '-');
                        g.appendChild(tLiq);

                        const tGas = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                        tGas.setAttribute('class', 'pipe-label-text');
                        tGas.setAttribute('x', midX);
                        tGas.setAttribute('y', boxY + rowH * 3 - 2);
                        tGas.setAttribute('fill', '#00d2ff');
                        tGas.textContent = 'ガス管: φ' + (pGas || '-');
                        g.appendChild(tGas);

                        this.svgCanvas.appendChild(g);
                    }

                    drawForNode(childEl);
                });
            };

            const rootEl = this.canvas.querySelector('.tree-node-container');
            if (rootEl) drawForNode(rootEl);
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
        let editorHtml = `
            <div style="background:rgba(255,255,255,0.02); padding:12px; border-radius:var(--radius-sm); border:1px dashed var(--border-color); margin-bottom:1.25rem;">
                <label style="color:var(--color-secondary); font-size:0.7rem; text-transform:uppercase; font-weight:700;">メーカー指定品番 (自動決定)</label>
                <div style="font-family:var(--font-mono); font-size:1.05rem; font-weight:700; color:var(--text-primary); margin-top:3px;">
                    ${node.modelNumber || '-'}
                </div>
            </div>
            <div class="form-group">
                <label>名称</label>
                <input type="text" class="form-input" id="edit-name" value="${node.name}">
            </div>
        `;

        if (node.type === 'outdoor') {
            editorHtml += `
                <div class="form-group">
                    <label>GHP室外機馬力 (システム容量)</label>
                    <select class="form-select" id="edit-capacity">
                        ${currentSeries.outdoorCapacities.map(c => `
                            <option value="${c.kw}" ${Math.abs(node.capacity - c.kw) < 0.1 ? 'selected' : ''}>${c.hp} 馬力 (${c.kw.toFixed(1)} kW) [${c.model}]</option>
                        `).join('')}
                    </select>
                </div>
            `;
        } else if (node.type === 'indoor') {
            editorHtml += `
                <div class="form-group">
                    <label>室内機形状スタイル</label>
                    <select class="form-select" id="edit-style">
                        ${Object.keys(this.engine.INDOOR_STYLES).map(styleKey => `
                            <option value="${styleKey}" ${node.indoorStyle === styleKey ? 'selected' : ''}>${this.engine.INDOOR_STYLES[styleKey].name}</option>
                        `).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>室内機容量型番</label>
                    <select class="form-select" id="edit-capacity">
                        ${this.engine.INDOOR_CAPACITIES.map(i => `
                            <option value="${i.kw}" ${Math.abs(node.capacity - i.kw) < 0.1 ? 'selected' : ''}>${i.type}</option>
                        `).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>配管長 (上流からの長さ m)</label>
                    <input type="number" class="form-input" id="edit-length" min="1" max="150" value="${node.length}">
                </div>
            `;
        } else if (node.type === 'bs_unit') {
            editorHtml += `
                <div class="form-group">
                    <label>配管長 (上流主管・分岐からの長さ m)</label>
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
            const is3Pipe = currentSeries && currentSeries.pipeSystem === '3pipe';
            editorHtml += `
                <div style="margin-top: 1rem; border-top: 1px solid var(--border-color); padding-top: 1rem;">
                    <label style="font-size:0.775rem; font-weight:500; color:var(--text-secondary); margin-bottom:8px; display:block;">下流に機器を追加</label>
                    <div class="add-node-bar" style="display: flex; gap: 8px; flex-wrap: wrap;">
                        <button class="btn btn-primary" id="add-branch-btn" style="flex:1; font-size:0.75rem;">＋ 分岐継手</button>
                        ${(is3Pipe && node.type !== 'bs_unit') ? `<button class="btn" id="add-bs-btn" style="flex:1; font-size:0.75rem; background:rgba(234,179,8,0.15); border:1px solid rgba(234,179,8,0.3); color:#fef08a;">＋ BSユニット</button>` : ''}
                        <button class="btn btn-primary" id="add-indoor-btn" style="flex:1; font-size:0.75rem; background:linear-gradient(135deg, #10b981, #059669); color:white;">＋ 室内機</button>
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

        const nameInput = document.getElementById('edit-name');
        if (nameInput) nameInput.addEventListener('change', (e) => { node.name = e.target.value; this.update(); });

        const styleSelect = document.getElementById('edit-style');
        if (styleSelect) styleSelect.addEventListener('change', (e) => { node.indoorStyle = e.target.value; this.update(); });

        const capSelect = document.getElementById('edit-capacity');
        if (capSelect) capSelect.addEventListener('change', (e) => { node.capacity = parseFloat(e.target.value); this.update(); });

        const lenInput = document.getElementById('edit-length');
        if (lenInput) lenInput.addEventListener('change', (e) => { node.length = Math.max(0, parseFloat(e.target.value) || 0); this.update(); });

        const addBranchBtn = document.getElementById('add-branch-btn');
        if (addBranchBtn) addBranchBtn.addEventListener('click', () => this.addChildNode(node, 'branch'));

        const addBsBtn = document.getElementById('add-bs-btn');
        if (addBsBtn) addBsBtn.addEventListener('click', () => this.addChildNode(node, 'bs_unit'));

        const addIndoorBtn = document.getElementById('add-indoor-btn');
        if (addIndoorBtn) addIndoorBtn.addEventListener('click', () => this.addChildNode(node, 'indoor'));

        const delBtn = document.getElementById('delete-node-btn');
        if (delBtn) delBtn.addEventListener('click', () => this.deleteNode(node.id));
    }

    addChildNode(parent, type) {
        const id = `${type}_${Date.now()}`;
        let name = `室内機 ${parent.children.length + 1}`;
        let len = 5;
        let cap = 5.6;

        if (type === 'branch') {
            name = `分岐継手 ${parent.children.length + 1}`;
            len = 10;
            cap = 0;
        } else if (type === 'bs_unit') {
            name = `BSユニット ${parent.children.length + 1}`;
            len = 10;
            cap = 0;
        }

        const newChild = {
            id,
            name,
            type,
            length: len,
            capacity: cap,
            children: []
        };
        if (type === 'indoor') newChild.indoorStyle = "cassette_4way";
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

    renderTotals(totals) {
        const currentSeries = this.engine.SERIES_DATABASE[this.activeSeriesId];
        let totalsHtml = `
            <div class="config-card" style="margin-bottom: 1rem;">
                <div class="config-row"><span class="config-label">選択シリーズ:</span><span class="config-value" style="color: var(--color-secondary);">${currentSeries.name}</span></div>
                <div class="config-row"><span class="config-label">使用燃料:</span><span class="config-value" style="color: var(--color-primary);">${this.activeGasType === 'lpg' ? 'LPガス' : '都市ガス 13A'}</span></div>
                <div class="config-row"><span class="config-label">接続室内機数:</span><span class="config-value">${totals.indoorCount} 台 / 最大 ${currentSeries.maxIndoorUnits}台</span></div>
                <div class="config-row"><span class="config-label">室内機合計容量:</span><span class="config-value">${totals.totalIndoorCapacity.toFixed(1)} kW</span></div>
                <div class="config-row"><span class="config-label">容量接続率:</span><span class="config-value" style="color: ${totals.connectionRatio > 130 || totals.connectionRatio < 50 ? 'var(--color-danger)' : 'var(--color-success)'}">${totals.connectionRatio.toFixed(1)}%</span></div>
                <div class="config-row"><span class="config-label">最遠配管相当長:</span><span class="config-value">${totals.longestPath.toFixed(1)} m</span></div>
                <div class="config-row" style="border-top:1px solid rgba(255,255,255,0.05); padding-top:4px; margin-top:4px;"><span class="config-label">総配管実長:</span><span class="config-value">${totals.totalPipingLength.toFixed(1)} m / 制限 ${currentSeries.maxPipingTotal}m</span></div>
            </div>
            <div style="font-size:0.8rem; font-weight:600; text-transform:uppercase; color:var(--text-secondary); margin-bottom:8px;">GHP配管部材集計 (BOM)</div>
            <div style="display:flex; flex-direction:column; gap:8px;">
        `;

        for (const size of Object.keys(totals.liquidPipes || {}).sort()) {
            totalsHtml += `<div class="pipe-summary-item"><span class="pipe-size-label">φ${size} (液管)</span><span class="pipe-length-badge">${totals.liquidPipes[size].toFixed(1)} m</span></div>`;
        }
        for (const size of Object.keys(totals.highGasPipes || {}).sort()) {
            totalsHtml += `<div class="pipe-summary-item"><span class="pipe-size-label" style="color:var(--color-warning);">φ${size} (高低圧ガス管)</span><span class="pipe-length-badge" style="background:rgba(245,158,11,0.15); color:var(--color-warning);">${totals.highGasPipes[size].toFixed(1)} m</span></div>`;
        }
        for (const size of Object.keys(totals.lowGasPipes || {}).sort()) {
            totalsHtml += `<div class="pipe-summary-item"><span class="pipe-size-label" style="color:var(--color-secondary);">φ${size} (吸入ガス管)</span><span class="pipe-length-badge" style="background:rgba(56,189,248,0.15); color:var(--color-secondary);">${totals.lowGasPipes[size].toFixed(1)} m</span></div>`;
        }
        for (const size of Object.keys(totals.gasPipes || {}).sort()) {
            totalsHtml += `<div class="pipe-summary-item"><span class="pipe-size-label">φ${size} (ガス管)</span><span class="pipe-length-badge">${totals.gasPipes[size].toFixed(1)} m</span></div>`;
        }
        for (const model of Object.keys(totals.joints || {})) {
            totalsHtml += `<div class="pipe-summary-item"><span class="pipe-size-label" style="color:var(--text-primary); font-family:var(--font-mono);">${model}</span><span class="pipe-length-badge" style="background:rgba(245,158,11,0.15); color:var(--color-warning);">${totals.joints[model]} 個</span></div>`;
        }
        totalsHtml += `
            <div style="margin-top: 1rem; border-top: 1px solid var(--border-color); padding-top: 0.75rem;">
                <div style="font-size:0.75rem; font-weight:600; text-transform:uppercase; color:var(--text-secondary); margin-bottom:6px;">冷媒配管サイズ標準選定目安表 (GHP凡例)</div>
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
            this.warningPanel.innerHTML = `<div class="alert-card success"><span class="alert-icon">✓</span><div class="alert-text"><div class="alert-title">設計ステータス: 正常</div><div class="alert-desc">選択されたGHPシリーズの配管基準を満たしています。</div></div></div>`;
            return;
        }
        this.warningPanel.innerHTML = warnings.map((w, idx) => `
            <div class="alert-card warning clickable" data-warning-idx="${idx}" style="cursor:pointer;"><span class="alert-icon">⚠</span><div class="alert-text"><div class="alert-title">設計注意 (クリックで最適対処方法を表示)</div><div class="alert-desc" style="color:var(--text-primary);">${w}</div></div></div>
        `).join('');

        const alertCards = this.warningPanel.querySelectorAll('.alert-card.clickable');
        alertCards.forEach(card => {
            card.addEventListener('click', () => {
                const idx = parseInt(card.getAttribute('data-warning-idx'));
                const warningText = warnings[idx];

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

        if (warningText.includes("接続容量") && (warningText.includes("超過") || warningText.includes("未満"))) {
            if (this.sizerResult.totals.connectionRatio > 130) {
                suggestion = "💡 【対処方法】: GHP室外機の馬力（容量）を1段階大きいサイズにアップし、接続率を推奨範囲（50%〜130%）内に調整します。";
                fixAction = () => this.changeOutdoorCapacity(1);
            } else {
                suggestion = "💡 【対処方法】: GHP室外機の馬力（容量）を1段階小さいサイズにダウンし、接続率を推奨範囲内に調整します。";
                fixAction = () => this.changeOutdoorCapacity(-1);
            }
        } else if (warningText.includes("相当長") || warningText.includes("90m") || warningText.includes("制限") || warningText.includes("実長")) {
            suggestion = "💡 【対処方法】: GHP主管サイズアップ（1サイズ太径化）を適用し、長配管による圧力損失を軽減します。";
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

    /** GHP室外機容量の段階移動 */
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
        const is3Pipe = currentSeries && currentSeries.pipeSystem === '3pipe';
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
            if (node.type === 'outdoor') typeStr = "GHP室外機 (主管)";
            else if (node.type === 'indoor') typeStr = "室内機配管";

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
        if (this.gasSelect) {
            this.gasSelect.addEventListener('change', (e) => {
                this.activeGasType = e.target.value;
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
                if (confirm("系統設計を初期状態にリセットしますか？")) {
                    const currentSeries = this.engine.SERIES_DATABASE[this.activeSeriesId];
                    this.systemTree = {
                        id: "root",
                        name: "ダイキン GHP室外機",
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
            btnExport.addEventListener('click', () => {
                const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.systemTree, null, 2));
                const downloadAnchor = document.createElement('a');
                downloadAnchor.setAttribute("href", dataStr);
                downloadAnchor.setAttribute("download", `daikin_ghp_system_${Date.now()}.json`);
                document.body.appendChild(downloadAnchor);
                downloadAnchor.click();
                downloadAnchor.remove();
            });
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
                            }
                        } catch (err) { alert("形式エラー"); }
                    };
                    reader.readAsText(file);
                };
                input.click();
            });
        }

        const btnPrint = document.getElementById('btn-print');
        if (btnPrint) btnPrint.addEventListener('click', () => window.print());

        const btnHistory = document.getElementById('btn-history');
        if (btnHistory) btnHistory.addEventListener('click', () => this.openHistoryModal());

        const historyClose = document.getElementById('history-modal-close');
        if (historyClose) historyClose.addEventListener('click', () => this.closeHistoryModal());
        const historyOk = document.getElementById('history-modal-ok');
        if (historyOk) historyOk.addEventListener('click', () => this.closeHistoryModal());
    }

    openHistoryModal() {
        const modal = document.getElementById('history-modal-overlay');
        if (modal) {
            modal.classList.add('active');
            const container = document.getElementById('history-list-container');
            if (container) {
                container.innerHTML = `
                    <div class="history-entry">
                        <div class="history-entry-header">
                            <span class="history-badge history-badge-initial">初期リリース</span>
                            <span class="history-entry-date">2026-08-27</span>
                        </div>
                        <div style="font-size:0.85rem; font-weight:600;">ダイキン GHP選定システム 新規公開</div>
                        <ul class="history-changes-list">
                            <li><span class="history-change-icon">✓</span> GHP スーパーコンビ / 標準マルチ / 寒冷地対応マルチ シリーズ選定対応</li>
                            <li><span class="history-change-icon">✓</span> 都市ガス13A / LPガス 燃料切り替え・配管長診断追加</li>
                        </ul>
                    </div>
                `;
            }
        }
    }

    closeHistoryModal() {
        const modal = document.getElementById('history-modal-overlay');
        if (modal) modal.classList.remove('active');
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

    findParentNode(root, id) {
        if (!root.children) return null;
        for (const child of root.children) {
            if (child.id === id) return root;
            const parent = this.findParentNode(child, id);
            if (parent) return parent;
        }
        return null;
    }

    loadSamplePresetForSeries() {
        if (this.activeSeriesId === 'daikin_ghp_hr') {
            // 冷暖同時 3管式＋BSユニット サンプル
            this.systemTree = {
                id: "root",
                name: "GHP室外機 (冷暖同時 20馬力)",
                type: "outdoor",
                capacity: 56.0,
                length: 0,
                children: [
                    {
                        id: "branch_1",
                        name: "主分岐継手 A",
                        type: "branch",
                        length: 15,
                        children: [
                            {
                                id: "bs_1",
                                name: "BSユニット 1 (事務エリア)",
                                type: "bs_unit",
                                length: 12,
                                children: [
                                    { id: "indoor_1", name: "事務室 1A (カセット)", type: "indoor", indoorStyle: "cassette_4way", capacity: 11.2, length: 8, children: [] },
                                    { id: "indoor_2", name: "会議室 1B (ダクト)", type: "indoor", indoorStyle: "ducted", capacity: 14.0, length: 10, children: [] }
                                ]
                            },
                            {
                                id: "bs_2",
                                name: "BSユニット 2 (役員エリア)",
                                type: "bs_unit",
                                length: 18,
                                children: [
                                    { id: "indoor_3", name: "役員室 2A (壁掛)", type: "indoor", indoorStyle: "wall_mounted", capacity: 7.1, length: 10, children: [] },
                                    { id: "indoor_4", name: "応接室 2B (カセット)", type: "indoor", indoorStyle: "cassette_4way", capacity: 8.0, length: 8, children: [] }
                                ]
                            }
                        ]
                    }
                ]
            };
        } else if (this.activeSeriesId === 'daikin_ghp_chiller') {
            // GHPチラー サンプル
            this.systemTree = {
                id: "root",
                name: "GHPチラー室外機 (20馬力)",
                type: "outdoor",
                capacity: 56.0,
                length: 0,
                children: [
                    {
                        id: "indoor_1",
                        name: "温水熱交換器ユニット",
                        type: "indoor",
                        indoorStyle: "ceiling_suspended",
                        capacity: 56.0,
                        length: 20,
                        children: []
                    }
                ]
            };
        } else {
            // 2管式 標準・スーパーコンビ・寒冷地 サンプル (正常な階層ツリー)
            this.systemTree = {
                id: "root",
                name: "GHP室外機 (20馬力)",
                type: "outdoor",
                capacity: 56.0,
                length: 0,
                children: [
                    {
                        id: "branch_1",
                        name: "第1分岐継手 A",
                        type: "branch",
                        length: 20,
                        children: [
                            {
                                id: "indoor_1",
                                name: "1F ホール (カセット)",
                                type: "indoor",
                                indoorStyle: "cassette_4way",
                                capacity: 14.0,
                                length: 8,
                                children: []
                            },
                            {
                                id: "branch_2",
                                name: "第2分岐継手 B",
                                type: "branch",
                                length: 15,
                                children: [
                                    {
                                        id: "indoor_2",
                                        name: "2F 事務室 (カセット)",
                                        type: "indoor",
                                        indoorStyle: "cassette_4way",
                                        capacity: 14.0,
                                        length: 10,
                                        children: []
                                    },
                                    {
                                        id: "indoor_3",
                                        name: "2F 会議室 (ダクト)",
                                        type: "indoor",
                                        indoorStyle: "ducted",
                                        capacity: 11.2,
                                        length: 6,
                                        children: []
                                    },
                                    {
                                        id: "indoor_4",
                                        name: "2F 応接室 (壁掛)",
                                        type: "indoor",
                                        indoorStyle: "wall_mounted",
                                        capacity: 5.6,
                                        length: 12,
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
}
