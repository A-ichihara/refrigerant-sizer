/**
 * UI Renderer and Event Controller (パナソニック版)
 * 
 * 機能:
 * 1. 系統ツリーをHTMLカードとしてレンダリング (電磁弁キット対応)
 * 2. SVGを用いた配管接続線描画 (3管式は点線、2管式は実線)
 * 3. 各ノードの選択、追加、編集、削除UI制御
 * 4. localStorage を用いた状態保持・復元 (panasonic_sizer_... キー使用)
 * 5. サンプル系統データの読み込み (冷暖同時MF3電磁弁構成、同時ツインなど)
 * 6. 更新履歴モーダル制御
 */

class RefrigerantSizerUI {
    constructor(engine) {
        this.engine = engine;
        
        // localStorage からの状態復元
        let loadedTree = null;
        let loadedSeriesId = "fsv_ux3";
        let loadedNodeId = "root";
        let loadedManualSizeUp = false;

        try {
            const savedTree = localStorage.getItem('panasonic_sizer_system_tree');
            if (savedTree) loadedTree = JSON.parse(savedTree);
            const savedSeries = localStorage.getItem('panasonic_sizer_active_series_id');
            if (savedSeries) loadedSeriesId = savedSeries;
            const savedNode = localStorage.getItem('panasonic_sizer_active_node_id');
            if (savedNode) loadedNodeId = savedNode;
            const savedSizeUp = localStorage.getItem('panasonic_sizer_enable_manual_sizeup');
            if (savedSizeUp) loadedManualSizeUp = savedSizeUp === 'true';
        } catch (e) {
            console.error("Failed to load state from localStorage", e);
        }

        this.activeSeriesId = loadedSeriesId;
        this.activeNodeId = loadedNodeId;
        this.enableManualSizeUp = loadedSeriesId === 'fsv_uxe3' ? false : loadedManualSizeUp;
        
        if (loadedTree) {
            this.engine.migrateLegacyOutdoorCapacity(loadedTree, this.activeSeriesId);
            this.systemTree = loadedTree;
        } else {
            // デフォルトの初期ツリー
            const currentSeries = this.engine.SERIES_DATABASE[this.activeSeriesId];
            this.systemTree = {
                id: "root",
                name: "室外機",
                type: "outdoor",
                capacity: currentSeries.outdoorCapacities[0].kw,
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
                                name: "会議室 A (S-P)",
                                type: "indoor",
                                indoorStyle: "cassette_4way",
                                capacity: 5.6,
                                length: 8,
                                children: []
                            },
                            {
                                id: "indoor_2",
                                name: "役員室 B (S-P)",
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
            forceSUpBtn.disabled = this.activeSeriesId === 'fsv_uxe3';
            forceSUpBtn.title = this.activeSeriesId === 'fsv_uxe3' ? 'UXE3の手動増径は公式条件未確認のため停止中' : '';
            const label = forceSUpBtn.querySelector('span');
            if (label) label.textContent = this.activeSeriesId === 'fsv_uxe3' ? '⚡ 主管サイズUP（停止中）' : '⚡ 主管サイズUP';
            forceSUpBtn.classList.toggle('btn-primary', this.enableManualSizeUp);
        }
        this.update();
    }

    update() {
        if (this.activeSeriesId === 'fsv_uxe3') this.enableManualSizeUp = false;
        const sizeUpButton = document.getElementById('btn-force-sizeup');
        if (sizeUpButton) {
            sizeUpButton.disabled = this.activeSeriesId === 'fsv_uxe3';
            sizeUpButton.title = sizeUpButton.disabled ? 'UXE3の手動増径は公式条件未確認のため停止中' : '';
            const label = sizeUpButton.querySelector('span');
            if (label) label.textContent = sizeUpButton.disabled ? '⚡ 主管サイズUP（停止中）' : '⚡ 主管サイズUP';
            sizeUpButton.classList.toggle('btn-primary', this.enableManualSizeUp);
        }
        this.validateAndRepairTreeForSeries(this.systemTree);

        const results = this.engine.calculateSystem(this.systemTree, this.activeSeriesId, this.enableManualSizeUp);
        
        if (results.error) {
            console.error(results.error);
            return;
        }

        this.sizerResult = results;

        try {
            localStorage.setItem('panasonic_sizer_system_tree', JSON.stringify(this.systemTree));
            localStorage.setItem('panasonic_sizer_active_series_id', this.activeSeriesId);
            localStorage.setItem('panasonic_sizer_active_node_id', this.activeNodeId);
            localStorage.setItem('panasonic_sizer_enable_manual_sizeup', this.enableManualSizeUp ? 'true' : 'false');
        } catch (e) {
            console.error("Failed to save state to localStorage", e);
        }
        
        this.renderTree(results.tree);
        this.drawConnections();
        this.renderTotals(results.totals);
        this.renderWarnings(results.warnings);
        this.renderSegmentAuditSummary(results.segmentAudit);
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

        // バッジ表記 (パナソニック公式呼称)
        let badgeText = '室外機';
        let badgeClass = 'type-outdoor';
        if (node.type === 'branch') { badgeText = '分岐用継手'; badgeClass = 'type-branch'; }
        else if (node.type === 'indoor') { 
            const styleConfig = this.engine.INDOOR_STYLES ? this.engine.INDOOR_STYLES[node.indoorStyle || 'cassette_4way'] : null;
            const styleShort = styleConfig ? styleConfig.name.split(' ')[0] : 'カセット形';
            badgeText = `室内機 [${styleShort}]`; 
            badgeClass = 'type-indoor'; 
        }
        else if (node.type === 'solenoid_kit') { badgeText = '電磁弁キット'; badgeClass = 'type-bs-unit'; }

        // スペック一覧
        let specHtml = '';
        if (node.type === 'outdoor') {
            specHtml = `
                <div class="spec-item"><span class="spec-lbl">定格容量:</span><span class="spec-val">${node.capacity.toFixed(1)} kW</span></div>
                <div class="spec-item"><span class="spec-lbl">馬力相当:</span><span class="spec-val">${this.getHpFromKw(node.capacity)} 馬力</span></div>
            `;
        } else if (node.type === 'indoor') {
            specHtml = `
                <div class="spec-item"><span class="spec-lbl">容量型番:</span><span class="spec-val">${this.getIndoorLabelFromKw(node.capacity)}</span></div>
                <div class="spec-item"><span class="spec-lbl">配管長:</span><span class="spec-val">${node.length} m</span></div>
            `;
        } else if (node.type === 'solenoid_kit') {
            const childIndoors = this.countIndoors(node);
            specHtml = `
                <div class="spec-item"><span class="spec-lbl">下流合計:</span><span class="spec-val">${(node.capacitySum || 0).toFixed(1)} kW</span></div>
                <div class="spec-item"><span class="spec-lbl">接続台数:</span><span class="spec-val">${childIndoors} 台</span></div>
                <div class="spec-item"><span class="spec-lbl">配管長:</span><span class="spec-val">${node.length} m</span></div>
            `;
        } else {
            specHtml = `
                <div class="spec-item"><span class="spec-lbl">下流合計:</span><span class="spec-val">${(node.capacitySum || 0).toFixed(1)} kW</span></div>
                <div class="spec-item"><span class="spec-lbl">継手品番:</span><span class="spec-val" style="color:var(--color-warning);">${node.jointModel || node.modelNumber || '-'}</span></div>
                <div class="spec-item"><span class="spec-lbl">配管長:</span><span class="spec-val">${node.length} m</span></div>
            `;
        }

        // 配管結果バッジ
        let pipeHtml = '';
        // UXE3の管径表は公式区間との対応照合が未完了。警告文だけでなく、各ノードの管径にも未検証表示を付ける。
        const unverifiedPipeLabel = this.activeSeriesId === 'fsv_uxe3'
            ? '<div class="pipe-size-unverified" role="note">管径参考値・未検証（公式区間照合未完了）</div>'
            : '';
        if (node.type !== 'outdoor') {
            if (node.pipes && node.pipes.type === '3pipe') {
                pipeHtml = `
                    <div class="pipe-result-badge">
                        ${unverifiedPipeLabel}
                        <div>液管: φ${node.pipes.liquid}</div>
                        <div style="color:var(--color-warning);">吐出ガス: φ${node.pipes.highGas}</div>
                        <div style="color:var(--color-secondary);">吸入ガス: φ${node.pipes.lowGas}</div>
                    </div>
                `;
            } else if (node.pipes && node.pipes.type === '2pipe') {
                pipeHtml = `
                    <div class="pipe-result-badge">
                        ${unverifiedPipeLabel}
                        <div>液管: φ${node.pipes.liquid}</div>
                        <div>ガス管: φ${node.pipes.gas}</div>
                    </div>
                `;
            } else if (node.pipeSizeText) {
                pipeHtml = `<div class="pipe-result-badge"><div>${node.pipeSizeText}</div></div>`;
            }
        } else {
            const is3Pipe = this.activeSeriesId === 'fsv_uxe3';
            if (is3Pipe) {
                const sizes = this.engine.selectThreePipeSize(node.capacity, this.activeSeriesId === 'fsv_uxe3' ? false : this.enableManualSizeUp);
                pipeHtml = `
                    <div class="pipe-result-badge" style="color: var(--text-muted);">
                        ${unverifiedPipeLabel}
                        <div>液管: φ${sizes.liquid} (主管)</div>
                        <div style="color:var(--color-warning);">吐出ガス: φ${sizes.dischargeGas} (主管)</div>
                        <div style="color:var(--color-secondary);">吸入ガス: φ${sizes.suctionGas} (主管)</div>
                    </div>
                `;
            } else {
                const sizes = this.engine.selectTwoPipeSize(node.capacity, this.activeSeriesId === 'fsv_uxe3' ? false : this.enableManualSizeUp);
                pipeHtml = `
                    <div class="pipe-result-badge" style="color: var(--text-muted);">
                        <div>液管: φ${sizes.liquid} (主管)</div>
                        <div>ガス管: φ${sizes.gas} (主管)</div>
                    </div>
                `;
            }
        }

        // HTML 組み立て (ダイキン共通レイアウト)
        card.innerHTML = `
            <div class="node-header">
                <span class="node-type ${badgeClass}">${badgeText}</span>
                ${node.type !== 'outdoor' ? `<span class="spec-val" style="font-size:0.75rem;">${node.length}m</span>` : ''}
            </div>
            <div class="node-title" title="${node.name}">${node.name}</div>
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
        
        this.svgCanvas.innerHTML = '';

        this.svgCanvas.setAttribute('width', this.canvas.scrollWidth);
        this.svgCanvas.setAttribute('height', this.canvas.scrollHeight);

        const currentTree = (this.sizerResult && this.sizerResult.tree) ? this.sizerResult.tree : this.systemTree;
        this.drawNodeConnectorRecursive(currentTree);
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
                const pLiquid = child.pipeLiquid || (child.pipes && child.pipes.liquid);
                const pGas = child.pipeGas || (child.pipes && child.pipes.gas);
                const pHighGas = child.pipeHighGas || (child.pipes && child.pipes.highGas);
                const pLowGas = child.pipeLowGas || (child.pipes && child.pipes.lowGas);

                if (pLiquid || pGas || pHighGas) {
                    const midX = (startX + endX) / 2;
                    const midY = (startY + endY) / 2;
                    const is3Pipe = !!pHighGas;

                    // 区間種別判定
                    let segmentLabel = '分岐→室内機';
                    let segmentColor = '#10b981';
                    if (node.type === 'outdoor') {
                        segmentLabel = '室外機→分岐';
                        segmentColor = '#00a2e8';
                    } else if (child.type === 'branch') {
                        segmentLabel = '分岐→分岐';
                        segmentColor = '#f59e0b';
                    } else if (child.type === 'solenoid_kit') {
                        segmentLabel = '→電磁弁キット';
                        segmentColor = '#a855f7';
                    } else if (child.type === 'bs_unit') {
                        segmentLabel = '→BSユニット';
                        segmentColor = '#a855f7';
                    }

                    const labelWidth = is3Pipe ? 130 : 118;
                    const rowH = 16;
                    const rows = is3Pipe ? 4 : 3;
                    const boxH = rows * rowH + 6;
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

                    if (is3Pipe) {
                        const tHLG = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                        tHLG.setAttribute('class', 'pipe-label-text');
                        tHLG.setAttribute('x', midX);
                        tHLG.setAttribute('y', boxY + rowH * 3 - 2);
                        tHLG.setAttribute('fill', '#fbbf24');
                        tHLG.textContent = '吐出ガス: φ' + (pHighGas || '-');
                        g.appendChild(tHLG);

                        const tSG = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                        tSG.setAttribute('class', 'pipe-label-text');
                        tSG.setAttribute('x', midX);
                        tSG.setAttribute('y', boxY + rowH * 4 - 2);
                        tSG.setAttribute('fill', '#00d2ff');
                        tSG.textContent = '吸入ガス: φ' + (pLowGas || '-');
                        g.appendChild(tSG);
                    } else {
                        const tGas = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                        tGas.setAttribute('class', 'pipe-label-text');
                        tGas.setAttribute('x', midX);
                        tGas.setAttribute('y', boxY + rowH * 3 - 2);
                        tGas.setAttribute('fill', '#00d2ff');
                        tGas.textContent = 'ガス管: φ' + (pGas || '-');
                        g.appendChild(tGas);
                    }

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

        if (this.activeSeriesId === 'fsv_uxe3' && node.type !== 'outdoor') {
            // 選択した区間は監査専用。公式資料との照合や管径の自動変更は行わない。
            const segmentOptions = [
                ['unclassified', '未分類（指定なし）'],
                ['main_LM', '主管 LM'],
                ['branch_main_LC_LH', '分岐後主管 LC～LH'],
                ['outdoor_interconnect_LO', '室外接続主配管 LO'],
                ['branch_to_solenoid', '分岐管～電磁弁キット'],
                ['solenoid_to_indoor', '電磁弁キット～室内機']
            ];
            const declared = node.edgeSpec && typeof node.edgeSpec === 'object'
                && typeof node.edgeSpec.segmentType === 'string'
                ? node.edgeSpec.segmentType : 'unclassified';
            editorHtml += `<div class="form-group">
                <label>UXE3 配管区間（監査用・メーカー未検証）</label>
                <select class="form-select" id="edit-uxe3-segment">`;
            segmentOptions.forEach(([value, label]) => {
                editorHtml += `<option value="${value}" ${declared === value ? 'selected' : ''}>${label}</option>`;
            });
            editorHtml += `</select>
                <div style="font-size:0.75rem;color:var(--color-secondary);margin-top:4px;">
                    選択は公式確認を意味せず、管径・配管長・BOMに影響しません。
                </div></div>`;
        }

        editorHtml += `<div style="display:flex; flex-direction:column; gap:8px; margin-top:1.25rem; border-top:1px solid var(--border-color); padding-top:1rem;">`;

        if (node.type === 'outdoor' || node.type === 'branch' || node.type === 'solenoid_kit') {
            editorHtml += `<button class="btn btn-outline" id="btn-add-branch">➕ 分岐ジョイントを追加</button>`;
            
            // UXE3（冷暖同時3管式）では電磁弁キット追加可能
            if ((this.activeSeriesId === 'fsv_uxe3' || this.activeSeriesId === 'fsv_mf3') && node.type !== 'solenoid_kit') {
                editorHtml += `<button class="btn btn-outline" id="btn-add-solenoid" style="border-color:var(--color-primary-glow);">🟣 電磁弁キットを追加</button>`;
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

        const editUxE3Segment = document.getElementById('edit-uxe3-segment');
        if (editUxE3Segment && this.activeSeriesId === 'fsv_uxe3' && node.type !== 'outdoor') {
            editUxE3Segment.addEventListener('change', (e) => {
                const allowed = new Set([
                    'unclassified', 'main_LM', 'branch_main_LC_LH',
                    'outdoor_interconnect_LO', 'branch_to_solenoid', 'solenoid_to_indoor'
                ]);
                const value = e.target.value;
                if (!allowed.has(value)) return;
                const oldSpec = node.edgeSpec && typeof node.edgeSpec === 'object'
                    && !Array.isArray(node.edgeSpec) ? node.edgeSpec : {};
                const segmentChanged = oldSpec.segmentType !== value;
                node.edgeSpec = {
                    ...oldSpec,
                    segmentType: value,
                    // 区間を変更した場合、前区間の容量基準を誤って引き継がない。
                    capacityBasis: segmentChanged ? 'not_resolved' : oldSpec.capacityBasis,
                    validationState: 'unverified'
                };
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

        const addSolenoid = document.getElementById('btn-add-solenoid');
        if (addSolenoid) {
            addSolenoid.addEventListener('click', () => {
                node.children.push({
                    id: "solenoid_" + Date.now(),
                    name: "電磁弁キット",
                    type: "solenoid_kit",
                    length: 8,
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

        // UXE3(冷暖同時)シリーズ以外で電磁弁キットが存在する場合は自動修復（通常分岐用継手に置換）
        if (this.activeSeriesId !== 'fsv_uxe3' && this.activeSeriesId !== 'fsv_mf3') {
            if (node.type === 'solenoid_kit') {
                node.type = 'branch';
                node.name = node.name.replace('電磁弁キット', '分岐用継手');
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
            fixAction = this.activeSeriesId === 'fsv_uxe3' ? null : () => { this.enableManualSizeUp = true; this.update(); };
        } else {
            suggestion = "💡 【対処方法】: 主配管のサイズアップを有効化し系統全体のバランスを改善します。";
            fixAction = this.activeSeriesId === 'fsv_uxe3' ? null : () => { this.enableManualSizeUp = true; this.update(); };
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
            toggle.disabled = this.activeSeriesId === 'fsv_uxe3';
            toggle.checked = this.enableManualSizeUp;
            if (label) label.textContent = this.enableManualSizeUp ? "サイズUP適用中" : "標準サイズ";
            
            toggle.onchange = (e) => {
                this.enableManualSizeUp = this.activeSeriesId === 'fsv_uxe3' ? false : e.target.checked;
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
        const is3Pipe = currentSeries && (currentSeries.pipeSystem === '3pipe' || this.activeSeriesId === 'fsv_mf3');
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
            else if (node.type === 'solenoid_kit') typeStr = "電磁弁キット";

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

        const btnMasterPipe = document.getElementById('btn-master-pipesize');
        if (btnMasterPipe) {
            btnMasterPipe.addEventListener('click', () => this.openMasterPipeSizeModal());
        }
        ['master-pipesize-modal-close', 'master-pipesize-modal-ok'].forEach(id => {
            const button = document.getElementById(id);
            if (button) button.addEventListener('click', () => {
                document.getElementById('master-pipesize-modal-overlay')?.classList.remove('active');
            });
        });
        const tabMasterSwitch = document.getElementById('tab-master-switch');
        const tabMasterFree = document.getElementById('tab-master-free');
        if (tabMasterSwitch && tabMasterFree) {
            tabMasterSwitch.addEventListener('click', () => {
                tabMasterSwitch.classList.add('btn-primary');
                tabMasterFree.classList.remove('btn-primary');
                this.renderMasterPipeSizeTable('switch');
            });
            tabMasterFree.addEventListener('click', () => {
                tabMasterFree.classList.add('btn-primary');
                tabMasterSwitch.classList.remove('btn-primary');
                this.renderMasterPipeSizeTable('free');
            });
        }

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
                if (this.activeSeriesId === 'fsv_uxe3') return;
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
                        name: "室外機 (FSV)",
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
                                this.engine.migrateLegacyOutdoorCapacity(parsed, this.activeSeriesId);
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
        if (this.activeSeriesId === 'fsv_uxe3' || this.activeSeriesId === 'fsv_mf3') {
            // UXE3用: 3管式冷暖同時電磁弁キット系統
            this.systemTree = {
                id: "root",
                name: "室外機 U-P280UXE3 (10馬力)",
                type: "outdoor",
                capacity: 28.0,
                length: 0,
                children: [
                    {
                        id: "branch_m1",
                        name: "第1分岐管 A (3管式)",
                        type: "branch",
                        length: 20,
                        children: [
                            {
                                id: "sol_1",
                                name: "電磁弁キット A (個別用)",
                                type: "solenoid_kit",
                                length: 10,
                                children: [
                                    {
                                        id: "indoor_sol1",
                                        name: "会議室 A (S-P)",
                                        type: "indoor",
                                        indoorStyle: "cassette_4way",
                                        capacity: 5.6,
                                        length: 5,
                                        children: []
                                    }
                                ]
                            },
                            {
                                id: "sol_2",
                                name: "電磁弁キット B (系統・グループ用)",
                                type: "solenoid_kit",
                                length: 15,
                                children: [
                                    {
                                        id: "branch_sub",
                                        name: "電磁弁下流分岐",
                                        type: "branch",
                                        length: 5,
                                        children: [
                                            {
                                                id: "indoor_sol2a",
                                                name: "事務室 B (S-P)",
                                                type: "indoor",
                                                indoorStyle: "cassette_4way",
                                                capacity: 7.1,
                                                length: 4,
                                                children: []
                                            },
                                            {
                                                id: "indoor_sol2b",
                                                name: "応接室 C (S-GP)",
                                                type: "indoor",
                                                indoorStyle: "wall_mounted",
                                                capacity: 3.6,
                                                length: 8,
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
        } else if (this.activeSeriesId === 'office_pack') {
            // パック用: 同時ツイン構成
            this.systemTree = {
                id: "root",
                name: "室外機 U-5P125 (5馬力)",
                type: "outdoor",
                capacity: 12.5,
                length: 0,
                children: [
                    {
                        id: "pack_branch",
                        name: "同時ツイン分岐管",
                        type: "branch",
                        length: 15,
                        children: [
                            {
                                id: "pack_in1",
                                name: "事務室 北 (S-GP)",
                                type: "indoor",
                                indoorStyle: "cassette_4way",
                                capacity: 5.6,
                                length: 6,
                                children: []
                            },
                            {
                                id: "pack_in2",
                                name: "事務室 南 (S-GP)",
                                type: "indoor",
                                indoorStyle: "cassette_4way",
                                capacity: 5.6,
                                length: 6,
                                children: []
                            }
                        ]
                    }
                ]
            };
        } else {
            // ME2用: 通常の切換マルチ
            this.systemTree = {
                id: "root",
                name: "室外機 U-10ME2H7 (10馬力)",
                type: "outdoor",
                capacity: 28.0,
                length: 0,
                children: [
                    {
                        id: "branch_me1",
                        name: "第1分岐管 A",
                        type: "branch",
                        length: 25,
                        children: [
                            {
                                id: "indoor_me1",
                                name: "食堂 A (S-GP)",
                                type: "indoor",
                                indoorStyle: "cassette_4way",
                                capacity: 11.2,
                                length: 5,
                                children: []
                            },
                            {
                                id: "branch_me2",
                                name: "第2分岐管 B",
                                type: "branch",
                                length: 15,
                                children: [
                                    {
                                        id: "indoor_me2",
                                        name: "ロビー B (S-GP)",
                                        type: "indoor",
                                        indoorStyle: "ceiling_suspended",
                                        capacity: 8.0,
                                        length: 7,
                                        children: []
                                    },
                                    {
                                        id: "indoor_me3",
                                        name: "応接室 C (S-GP)",
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
        downloadAnchor.setAttribute("download", `panasonic_piping_system_${this.activeSeriesId}.json`);
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

        // 吸入ガス管と吐出ガス管はサイズが異なる場合があるため、
        // それぞれのサイズキーを統合して個別に集計表示する。
        const threePipeSizes = [...new Set([
            ...Object.keys(totals.lowGasPipes),
            ...Object.keys(totals.highGasPipes)
        ])].sort((a, b) => parseFloat(a) - parseFloat(b));

        threePipeSizes.forEach(sz => {
            if (totals.lowGasPipes[sz]) {
                html += `<tr><td>吸入ガス管: φ${sz} mm</td><td style="text-align: right;">${totals.lowGasPipes[sz]} m</td></tr>`;
                hasPipes = true;
            }
            if (totals.highGasPipes[sz]) {
                html += `<tr><td>吐出ガス管: φ${sz} mm</td><td style="text-align: right;">${totals.highGasPipes[sz]} m</td></tr>`;
                hasPipes = true;
            }
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
                <h4 style="font-size: 0.78rem; color: var(--color-secondary); margin-bottom: 6px;">📦 分岐継手・電磁弁キット</h4>
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
            if (model.startsWith('CZ-P') && model.includes('HR')) {
                label = "電磁弁キット";
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

        const safeWarnings = Array.isArray(warnings) ? warnings : [];
        if (safeWarnings.length === 0) {
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

        // Warning text can contain imported metadata; escape it before inserting into HTML.
        const escapeHtml = (value) => String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');

        const warningMessages = safeWarnings.map((warning) => {
            if (warning && typeof warning === 'object') {
                if (typeof warning.message === 'string') return warning.message;
                try {
                    return JSON.stringify(warning);
                } catch (_) {
                    return '[表示できない警告データ]';
                }
            }
            return String(warning);
        });

        this.warningPanel.innerHTML = safeWarnings.map((warning, idx) => {
            const message = warningMessages[idx];
            const isInfo = Boolean(warning && typeof warning === 'object' && warning.type === 'info');
            const isCritical = Boolean(warning && typeof warning === 'object' && warning.type === 'error')
                || /警告|超過|エラー|不足|制限を超/.test(message);
            const alertClass = isCritical ? 'alert-card clickable' : 'alert-card warning clickable';
            const icon = isCritical ? '🚨' : (isInfo ? 'ℹ️' : '⚠️');
            const title = isCritical ? '設計エラー (クリックで対処方法を表示)' : '設計注意 (クリックで対処方法を表示)';

            return `
                <div class="${alertClass}" data-warning-idx="${idx}" style="margin-bottom:8px;">
                    <span class="alert-icon">${icon}</span>
                    <div class="alert-text">
                        <div class="alert-title">${title}</div>
                        <div class="alert-desc">${escapeHtml(message)} <span style="font-size:0.7rem; color:var(--color-secondary);">(クリックで該当機器を強調)</span></div>
                    </div>
                </div>
            `;
        }).join('');

        const warningItems = this.warningPanel.querySelectorAll('.alert-card.clickable');
        warningItems.forEach((item, idx) => {
            item.addEventListener('click', () => {
                const warningText = warningMessages[idx] || item.textContent;

                document.querySelectorAll('.node-card').forEach(nc => nc.classList.remove('error-blink'));
                const targetId = this.activeNodeId || 'root';
                const targetCard = document.querySelector(`[data-id="${targetId}"] > .node-card`) || document.querySelector('.node-card');
                if (targetCard) {
                    targetCard.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
                    targetCard.classList.add('error-blink');
                    setTimeout(() => targetCard.classList.remove('error-blink'), 3000);
                }

                this.openFixSuggestionModal(warningText);
            });
        });
    }

    // UXE3区間監査の概要のみを表示。宣言済みの区間も公式確認済みとは扱わない。
    renderSegmentAuditSummary(audit) {
        if (!this.warningPanel || !audit || audit.seriesId !== 'fsv_uxe3') return;
        const summary = audit.summary;
        if (!summary || !Number.isInteger(summary.totalEdges)
            || !Number.isInteger(summary.unclassified)
            || !Number.isInteger(summary.declared)) return;

        const card = document.createElement('div');
        card.className = 'alert-card warning';
        const content = document.createElement('div');
        content.className = 'alert-text';
        const title = document.createElement('div');
        title.className = 'alert-title';
        title.textContent = 'UXE3 配管区間の分類状況（未検証）';
        const description = document.createElement('div');
        description.className = 'alert-desc';
        description.textContent = `接続区間 ${summary.totalEdges}件／未分類 ${summary.unclassified}件／区間宣言あり ${summary.declared}件。宣言済み区間もメーカー資料との照合は未完了です。`;
        content.appendChild(title);
        content.appendChild(description);
        card.appendChild(content);
        this.warningPanel.prepend(card);

        // 個別区間は文字列として表示し、インポートしたIDをHTMLとして解釈しない。
        if (Array.isArray(audit.findings) && audit.findings.length > 0) {
            const details = document.createElement('details');
            const heading = document.createElement('summary');
            heading.textContent = '配管区間の監査一覧を表示（メーカー未検証）';
            details.appendChild(heading);
            const list = document.createElement('ul');
            audit.findings.forEach((edge, index) => {
                const item = document.createElement('li');
                const path = typeof edge?.path === 'string' ? edge.path : `区間${index + 1}`;
                const segment = typeof edge?.segmentType === 'string' ? edge.segmentType : 'unclassified';
                const state = edge?.declarationState === 'declared_unverified' ? '宣言あり・未検証' : '未分類';
                item.textContent = `${path}：${segment}（${state}）`;
                list.appendChild(item);
            });
            details.appendChild(list);
            this.warningPanel.appendChild(details);
        }
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

    countIndoors(node) {
        if (!node) return 0;
        let count = node.type === 'indoor' ? 1 : 0;
        if (node.children) {
            for (const child of node.children) {
                count += this.countIndoors(child);
            }
        }
        return count;
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
    openMasterPipeSizeModal() {
        const overlay = document.getElementById('master-pipesize-modal-overlay');
        if (!overlay) return;
        overlay.classList.add('active');
        this.renderMasterPipeSizeTable(this.activeSeriesId === 'fsv_uxe3' ? 'free' : 'switch');
    }

    renderMasterPipeSizeTable(mode) {
        const container = document.getElementById('master-pipesize-table-container');
        if (!container) return;

        // Keep the visible tab state in sync with the table, including when the modal first opens.
        const isThreePipeTab = mode === 'free';
        const tabSwitch = document.getElementById('tab-master-switch');
        const tabFree = document.getElementById('tab-master-free');
        if (tabSwitch && tabFree) {
            tabSwitch.classList.toggle('btn-primary', !isThreePipeTab);
            tabFree.classList.toggle('btn-primary', isThreePipeTab);
            tabSwitch.style.background = isThreePipeTab ? 'rgba(255,255,255,0.03)' : 'rgba(16,185,129,0.15)';
            tabSwitch.style.color = isThreePipeTab ? 'var(--text-secondary)' : '#10b981';
            tabSwitch.style.borderColor = isThreePipeTab ? 'var(--border-color)' : '#10b981';
            tabFree.style.background = isThreePipeTab ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.03)';
            tabFree.style.color = isThreePipeTab ? '#10b981' : 'var(--text-secondary)';
            tabFree.style.borderColor = isThreePipeTab ? '#10b981' : 'var(--border-color)';
        }

        const twoPipeRows = [
            ['〜 5.6 kW', 5.6], ['5.6 超〜9.0 kW', 9.0], ['9.0 超〜16.0 kW', 16.0],
            ['16.0 超〜22.4 kW', 22.4], ['22.4 超〜33.5 kW', 33.5],
            ['33.5 超〜50.0 kW', 50.0], ['50.0 超〜68.0 kW', 68.0], ['68.0 kW 超', 68.1]
        ];
        const threePipeRows = [
            ['〜 22.4 kW', 22.4], ['22.4 超〜28.0 kW', 28.0],
            ['28.0 超〜45.0 kW', 45.0], ['45.0 超〜56.0 kW', 56.0], ['56.0 kW 超', 56.1]
        ];
        const isThreePipe = mode === 'free';
        const rows = isThreePipe ? threePipeRows : twoPipeRows;
        const format = value => Number(value).toFixed(2).replace(/\.00$/, '').replace(/0$/, '');
        const body = rows.map(([label, kw]) => {
            const p = isThreePipe
                ? this.engine.selectThreePipeSize(kw, false)
                : this.engine.selectTwoPipeSize(kw, false);
            return isThreePipe
                ? `<tr><td>${label}</td><td>φ${format(p.liquid)}</td><td>φ${format(p.dischargeGas)}</td><td>φ${format(p.suctionGas)}</td></tr>`
                : `<tr><td>${label}</td><td>φ${format(p.liquid)}</td><td>φ${format(p.gas)}</td></tr>`;
        }).join('');

        container.innerHTML = `
            <div class="alert-card" style="margin-bottom:12px;">
                <strong>${isThreePipe ? 'UXE3（冷暖フリー・3管式）' : 'UX3（冷暖切換・2管式）'}</strong><br>
                この表は、現在の計算エンジンに登録されている容量区分と標準選定サイズを表示しています。
                メーカーの正式設計表そのものではありません。実設計では該当機種の最新技術資料との照合が必要です。
            </div>
            <div style="overflow-x:auto;">
                <table class="pipe-detail-table">
                    <thead><tr>${isThreePipe
                        ? '<th>室外機容量</th><th>液管</th><th>吐出ガス管（高圧）</th><th>吸入ガス管（低圧）</th>'
                        : '<th>下流容量区分</th><th>液管</th><th>ガス管</th>'}</tr></thead>
                    <tbody>${body}</tbody>
                </table>
            </div>
            <p style="font-size:0.75rem;color:var(--text-secondary);margin-top:10px;">
                ※ 手動サイズアップ設定はこの一覧には適用していません。主管の自動サイズアップ条件も別途確認が必要です。
            </p>
        `;
    }


}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = RefrigerantSizerUI;
} else {
    window.RefrigerantSizerUI = RefrigerantSizerUI;
}
