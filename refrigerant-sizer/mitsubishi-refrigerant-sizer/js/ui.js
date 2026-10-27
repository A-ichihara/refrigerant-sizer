/**
 * UI Renderer and Event Controller (三菱電機版)
 * 
 * 機能:
 * 1. 系統ツリーをHTMLカードとして動的レンダリング (BCコントローラー/子BC対応)
 * 2. SVGを用いた配管接続線描画 (3管式は点線、2管式は実線)
 * 3. 各ノードの選択、追加、編集、削除UI制御
 * 4. localStorage を用いた状態保持・復元 (mitsubishi_sizer_... キー使用)
 * 5. サンプル系統データの読み込み (冷暖同時BC・子BC構成、同時ツインなど)
 * 6. 仕様・型番更新履歴モーダル制御
 */

class RefrigerantSizerUI {
    constructor(engine) {
        this.engine = engine;
        
        // localStorage からの状態復元
        let loadedTree = null;
        let loadedSeriesId = "city_multi_y";
        let loadedNodeId = "root";
        let loadedManualSizeUp = false;

        try {
            const savedTree = localStorage.getItem('mitsubishi_sizer_system_tree');
            if (savedTree) loadedTree = JSON.parse(savedTree);
            const savedSeries = localStorage.getItem('mitsubishi_sizer_active_series_id');
            if (savedSeries) loadedSeriesId = savedSeries;
            const savedNode = localStorage.getItem('mitsubishi_sizer_active_node_id');
            if (savedNode) loadedNodeId = savedNode;
            const savedSizeUp = localStorage.getItem('mitsubishi_sizer_enable_manual_sizeup');
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
                name: "室外機 (シティマルチ)",
                type: "outdoor",
                capacity: 28.0, // 10 HP
                length: 0,
                children: [
                    {
                        id: "branch_1",
                        name: "分岐管 A",
                        type: "branch",
                        length: 15,
                        children: [
                            {
                                id: "indoor_1",
                                name: "会議室 A (PLFY)",
                                type: "indoor",
                                indoorStyle: "cassette_4way",
                                capacity: 5.6,
                                length: 8,
                                children: []
                            },
                            {
                                id: "indoor_2",
                                name: "事務室 B (PKFY)",
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
        
        // DOM要素のキャッシュ
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

    /** アプリ状態の計算と再レンダリング */
    update() {
        // シリーズ変更時の容量ロック・自動クランプ
        this.validateAndRepairTreeForSeries(this.systemTree);

        // 配管計算エンジンの実行
        const results = this.engine.calculateSystem(this.systemTree, this.activeSeriesId, this.enableManualSizeUp);
        
        if (results.error) {
            console.error(results.error);
            return;
        }

        this.sizerResult = results;

        // localStorage へ保存
        try {
            localStorage.setItem('mitsubishi_sizer_system_tree', JSON.stringify(this.systemTree));
            localStorage.setItem('mitsubishi_sizer_active_series_id', this.activeSeriesId);
            localStorage.setItem('mitsubishi_sizer_active_node_id', this.activeNodeId);
            localStorage.setItem('mitsubishi_sizer_enable_manual_sizeup', this.enableManualSizeUp ? 'true' : 'false');
        } catch (e) {
            console.error("Failed to save state to localStorage", e);
        }
        
        // パネル描画
        this.renderTree(results.tree);
        this.drawConnections();
        this.renderTotals(results.totals);
        this.renderWarnings(results.warnings);
        this.renderPropertyEditor();
    }

    /** 系統図のレンダリング */
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

    /** 再帰的なノード要素(HTML)の生成 */
    createNodeElement(node) {
        const container = document.createElement('div');
        container.className = 'tree-node-container';
        container.setAttribute('data-id', node.id);

        // カード要素
        const card = document.createElement('div');
        card.className = `node-card`;
        if (node.id === this.activeNodeId) card.classList.add('active');

        // バッジ表記
        let badgeText = '室外ユニット';
        let badgeClass = 'type-outdoor';
        if (node.type === 'branch') { badgeText = '分配管'; badgeClass = 'type-branch'; }
        else if (node.type === 'indoor') { 
            const styleConfig = this.engine.INDOOR_STYLES ? this.engine.INDOOR_STYLES[node.indoorStyle || 'cassette_4way'] : null;
            const styleShort = styleConfig ? styleConfig.name.split(' ')[0] : 'カセット形';
            badgeText = `室内ユニット [${styleShort}]`; 
            badgeClass = 'type-indoor'; 
        }
        else if (node.type === 'bc_controller') { badgeText = 'BCコントローラー'; badgeClass = 'type-bs-unit'; }
        else if (node.type === 'sub_bc_controller') { badgeText = '子BCコントローラー'; badgeClass = 'type-sub-bc'; }

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
        } else if (node.type === 'bc_controller' || node.type === 'sub_bc_controller') {
            const childIndoors = this.countIndoors(node);
            specHtml = `
                <div class="spec-item"><span class="spec-lbl">下流合計:</span><span class="spec-val">${(node.capacitySum || 0).toFixed(1)} kW</span></div>
                <div class="spec-item"><span class="spec-lbl">接続台数:</span><span class="spec-val">${childIndoors} 台</span></div>
                <div class="spec-item"><span class="spec-lbl">配管長:</span><span class="spec-val">${node.length} m</span></div>
            `;
        } else {
            specHtml = `
                <div class="spec-item"><span class="spec-lbl">下流合計:</span><span class="spec-val">${(node.capacitySum || 0).toFixed(1)} kW</span></div>
                <div class="spec-item"><span class="spec-lbl">分配管型名:</span><span class="spec-val" style="color:var(--color-warning);">${node.modelNumber || node.jointModel || '-'}</span></div>
                <div class="spec-item"><span class="spec-lbl">配管長:</span><span class="spec-val">${node.length} m</span></div>
            `;
        }

        // 配管結果バッジ
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
            } else if (node.pipeLiquid && node.pipeGas) {
                pipeHtml = `
                    <div class="pipe-result-badge">
                        <div>液管: φ${node.pipeLiquid}</div>
                        <div>ガス管: φ${node.pipeGas}</div>
                    </div>
                `;
            } else if (node.pipeSizeText) {
                pipeHtml = `<div class="pipe-result-badge"><div>${node.pipeSizeText}</div></div>`;
            }
        } else {
            const is3Pipe = this.isThreePipeSystem();
            if (is3Pipe && node.pipeHighLowGas && node.pipeSuctionGas) {
                pipeHtml = `
                    <div class="pipe-result-badge" style="color: var(--text-muted);">
                        <div>液管: φ${node.pipeLiquid} (主配管)</div>
                        <div style="color:var(--color-warning);">高低圧ガス: φ${node.pipeHighLowGas} (主配管)</div>
                        <div style="color:var(--color-secondary);">吸入ガス: φ${node.pipeSuctionGas} (主配管)</div>
                    </div>
                `;
            } else if (node.pipeLiquid && node.pipeGas) {
                pipeHtml = `
                    <div class="pipe-result-badge" style="color: var(--text-muted);">
                        <div>液管: φ${node.pipeLiquid} (主配管)</div>
                        <div>ガス管: φ${node.pipeGas} (主配管)</div>
                    </div>
                `;
            } else if (node.pipeSizeText) {
                pipeHtml = `<div class="pipe-result-badge" style="color: var(--text-muted);"><div>${node.pipeSizeText}</div></div>`;
            }
        }

        // HTML 組み立て
        card.innerHTML = `
            <div class="node-header">
                <span class="node-type ${badgeClass}">${badgeText}</span>
                ${node.type !== 'outdoor' ? `<span class="spec-val" style="font-size:0.75rem;">${node.length}m</span>` : ''}
            </div>
            <div class="node-title" title="${node.name}">${node.name}</div>
            <div style="font-size: 0.725rem; font-family: var(--font-mono); color: var(--color-secondary); margin-bottom: 8px; padding: 2px 6px; background: rgba(255,255,255,0.03); border: 1px dashed rgba(255,255,255,0.08); border-radius: 4px; display: inline-block;">
                形名: ${node.modelNumber || node.jointModel || '-'}
            </div>
            <div class="node-specs">${specHtml}</div>
            ${pipeHtml}
        `;

        card.addEventListener('click', (e) => {
            e.stopPropagation();
            this.setActiveNode(node.id);
        });

        container.appendChild(card);

        // 子供たちがある場合、右側に描画
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

    /** SVG コネクター描画 */
    drawConnections() {
        if (!this.svgCanvas) return;
        
        // 既存パス・ラベルの完全クリア
        this.svgCanvas.innerHTML = '';

        const canvasRect = this.canvas.getBoundingClientRect();
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

            // 親の出力口（右側中央）
            const startX = (parentRect.right - canvasRect.left) + this.canvas.scrollLeft;
            const startY = (parentRect.top + parentRect.height / 2 - canvasRect.top) + this.canvas.scrollTop;

            node.children.forEach(child => {
                const childContainer = this.canvas.querySelector(`[data-id="${child.id}"]`);
                if (!childContainer) return;

                const childCard = childContainer.querySelector(':scope > .node-card');
                const childRect = childCard.getBoundingClientRect();

                // 子の入力口（左側中央）
                const endX = (childRect.left - canvasRect.left) + this.canvas.scrollLeft;
                const endY = (childRect.top + childRect.height / 2 - canvasRect.top) + this.canvas.scrollTop;

                // 制御点の設定 (水平S字カーブ)
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

                // スタイル付与
                path.setAttribute('class', 'connection-path');
                if (isThreePipe) {
                    path.classList.add('three-pipe');
                }

                this.svgCanvas.appendChild(path);

                // 配管サイズ取得 (child.pipeLiquid または child.pipes から)
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
                        segmentLabel = (child.type === 'bc_controller') ? '室外機→親BC' : '室外機→分岐';
                        segmentColor = '#00a2e8';
                    } else if (child.type === 'branch') {
                        segmentLabel = '分岐→分岐';
                        segmentColor = '#f59e0b';
                    } else if (child.type === 'bc_controller') {
                        segmentLabel = '→親BCコントローラー';
                        segmentColor = '#a855f7';
                    } else if (child.type === 'sub_bc_controller') {
                        segmentLabel = '→子BCコントローラー';
                        segmentColor = '#ec4899';
                    } else if (node.type === 'bc_controller' || node.type === 'sub_bc_controller') {
                        segmentLabel = 'BC→室内機';
                        segmentColor = '#10b981';
                    }

                    // 行数：見出し + 液管行（液管がある区間のみ）+ ガス行
                    // 室外機〜親BC間は高圧・低圧ガス管のみで液管がないため、液管行を表示しない。
                    const labelWidth = is3Pipe ? 130 : 118;
                    const rowH = 16;
                    const hasLiquid = pLiquid != null;
                    const rows = 1 + (hasLiquid ? 1 : 0) + (is3Pipe ? 2 : 1);
                    const boxH = rows * rowH + 6;
                    const boxY = midY - boxH / 2;
                    let rowNo = 1;

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
                    tHeader.setAttribute('y', boxY + rowH * rowNo - 2);
                    tHeader.setAttribute('fill', segmentColor);
                    tHeader.textContent = segmentLabel;
                    g.appendChild(tHeader);
                    rowNo++;

                    if (hasLiquid) {
                        const tLiq = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                        tLiq.setAttribute('class', 'pipe-label-text');
                        tLiq.setAttribute('x', midX);
                        tLiq.setAttribute('y', boxY + rowH * rowNo - 2);
                        tLiq.setAttribute('fill', '#e0f2fe');
                        tLiq.textContent = '液管: φ' + pLiquid;
                        g.appendChild(tLiq);
                        rowNo++;
                    }

                    if (is3Pipe) {
                        const tHLG = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                        tHLG.setAttribute('class', 'pipe-label-text');
                        tHLG.setAttribute('x', midX);
                        tHLG.setAttribute('y', boxY + rowH * rowNo - 2);
                        tHLG.setAttribute('fill', '#fbbf24');
                        tHLG.textContent = '高圧ガス: φ' + (pHighGas || '-');
                        g.appendChild(tHLG);
                        rowNo++;

                        const tSG = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                        tSG.setAttribute('class', 'pipe-label-text');
                        tSG.setAttribute('x', midX);
                        tSG.setAttribute('y', boxY + rowH * rowNo - 2);
                        tSG.setAttribute('fill', '#00d2ff');
                        tSG.textContent = '低圧ガス: φ' + (pLowGas || '-');
                        g.appendChild(tSG);
                        rowNo++;
                    } else {
                        const tGas = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                        tGas.setAttribute('class', 'pipe-label-text');
                        tGas.setAttribute('x', midX);
                        tGas.setAttribute('y', boxY + rowH * rowNo - 2);
                        tGas.setAttribute('fill', '#00d2ff');
                        tGas.textContent = 'ガス管: φ' + (pGas || '-');
                        g.appendChild(tGas);
                    }

                    this.svgCanvas.appendChild(g);
                }

                // 再帰
                this.drawNodeConnectorRecursive(child);
            });
        }
    }

    /** アクティブノード選択 */
    setActiveNode(id) {
        this.activeNodeId = id;
        
        // カードのハイライトクラス切り替え
        const cards = this.canvas.querySelectorAll('.node-card');
        cards.forEach(c => c.classList.remove('active'));
        
        const activeContainer = this.canvas.querySelector(`[data-id="${id}"]`);
        if (activeContainer) {
            const activeCard = activeContainer.querySelector(':scope > .node-card');
            if (activeCard) activeCard.classList.add('active');
        }

        this.renderPropertyEditor();
        this.drawConnections(); // パスハイライト再描画
    }

    /** 選択機器のプロパティエディタ描画 */
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
        
        // メーカー指定品番表示
        editorHtml += `
            <div style="background:rgba(255,255,255,0.02); padding:12px; border-radius:var(--radius-sm); border:1px dashed var(--border-color); margin-bottom:1.25rem;">
                <label style="color:var(--color-secondary); font-size:0.7rem; text-transform:uppercase; font-weight:700;">メーカー品番 (自動決定)</label>
                <div style="font-family:var(--font-mono); font-size:1.05rem; font-weight:700; color:var(--text-primary); margin-top:3px;">
                    ${node.modelNumber || node.jointModel || '-'}
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
            // 室内機形状スタイル
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

            // 容量選択
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

        // 配管長 (室外機以外の、親からこのノードまでの配管長)
        if (node.type !== 'outdoor') {
            editorHtml += `
                <div class="form-group">
                    <label>上流分岐からの配管長 (m)</label>
                    <input type="number" class="form-input" id="edit-length" min="0" max="150" value="${node.length}">
                </div>
            `;
        }

        // 下流追加・削除アクション
        editorHtml += `<div style="display:flex; flex-direction:column; gap:8px; margin-top:1.25rem; border-top:1px solid var(--border-color); padding-top:1rem;">`;

        if (node.type === 'outdoor' || node.type === 'branch') {
            editorHtml += `<button class="btn btn-outline" id="btn-add-branch">➕ 分岐ジョイントを追加</button>`;
            
            // R2シリーズの場合のみBCコントローラー追加可能
            if (this.activeSeriesId === 'city_multi_r2') {
                editorHtml += `<button class="btn btn-outline" id="btn-add-bc" style="border-color:var(--color-primary-glow);">🔴 BCコントローラー(親)を追加</button>`;
            }
            editorHtml += `<button class="btn btn-outline" id="btn-add-indoor">➕ 室内ユニットを追加</button>`;
        } else if (node.type === 'bc_controller') {
            editorHtml += `<button class="btn btn-outline" id="btn-add-sub-bc">🔴 子BCコントローラーを追加</button>`;
            editorHtml += `<button class="btn btn-outline" id="btn-add-indoor">➕ 室内ユニットを追加</button>`;
        } else if (node.type === 'sub_bc_controller') {
            editorHtml += `<button class="btn btn-outline" id="btn-add-indoor">➕ 室内ユニットを追加</button>`;
        }

        // 削除ボタン (室外機は削除不可)
        if (node.type !== 'outdoor') {
            editorHtml += `<button class="btn btn-danger" id="btn-delete-node" style="margin-top:8px;">🗑️ この機器を削除</button>`;
        }

        editorHtml += `</div>`;

        this.propPanel.innerHTML = editorHtml;
        this.bindEditorEvents(node);
    }

    /** エディタ内要素のイベントハンドラ */
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

        // アクションボタン
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

        const addBc = document.getElementById('btn-add-bc');
        if (addBc) {
            addBc.addEventListener('click', () => {
                node.children.push({
                    id: "bc_" + Date.now(),
                    name: "BCコントローラー(親)",
                    type: "bc_controller",
                    length: 10,
                    children: []
                });
                this.update();
            });
        }

        const addSubBc = document.getElementById('btn-add-sub-bc');
        if (addSubBc) {
            addSubBc.addEventListener('click', () => {
                node.children.push({
                    id: "sub_bc_" + Date.now(),
                    name: "子BCコントローラー",
                    type: "sub_bc_controller",
                    length: 5,
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

    /** 室内機容量適合クランプ */
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

    /** シリーズ変更時に不整合なノードの整合性を修復する */
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

        // R2シリーズ以外でBCコントローラーが存在する場合は自動修復（通常分岐に置換）
        if (this.activeSeriesId !== 'city_multi_r2') {
            if (node.type === 'bc_controller' || node.type === 'sub_bc_controller') {
                node.type = 'branch';
                node.name = node.name.replace('BCコントローラー', '分岐管');
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
        const is3Pipe = currentSeries && (currentSeries.pipeSystem === '3pipe' || this.activeSeriesId === 'city_multi_r2');
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
            else if (node.type === 'bc_controller') typeStr = "BCコントローラー";

            const nameStr = parentName ? `${parentName} ➔ ${node.name}` : node.name;
            const capStr = node.type === 'indoor' ? `${node.capacity.toFixed(1)} kW` : `${(node.capacitySum || node.capacity || 0).toFixed(1)} kW`;
            const lenStr = `${node.length || 0} m`;
            const modelStr = node.modelNumber || node.jointModel || "-";
            const sizedUpTag = node.isSizedUp ? ' <span style="color:var(--color-secondary); font-weight:700;">(サイズUP)</span>' : '';

            // エンジンは node.pipes（{liquid, gas} / {liquid, highGas, lowGas} /
            // {highGas, lowGas}）に選定結果を入れる。旧フィールド（node.pipeLiquid 等）は
            // エンジンが設定しないため、従来この表は全て「-」表示になっていた。
            let pipeLiquidStr = node.pipeLiquid ? `φ${node.pipeLiquid}` : (node.pipes && node.pipes.liquid != null ? `φ${node.pipes.liquid}` : "-");
            let pipeGasStr = node.pipeGas ? `φ${node.pipeGas}` : (node.pipes && node.pipes.gas != null ? `φ${node.pipes.gas}` : "-");
            let pipeHLGStr = node.pipeHighGas ? `φ${node.pipeHighGas}` : (node.pipes && node.pipes.highGas != null ? `φ${node.pipes.highGas}` : "-");
            let pipeSGStr = node.pipeLowGas ? `φ${node.pipeLowGas}` : (node.pipes && node.pipes.lowGas != null ? `φ${node.pipes.lowGas}` : "-");

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

    /** グローバルイベントのバインド */
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

        const btnMasterPipe = document.getElementById('btn-master-pipesize');
        if (btnMasterPipe) {
            btnMasterPipe.addEventListener('click', () => this.openMasterPipeSizeModal());
        }

        const masterCloseBtn = document.getElementById('master-pipesize-modal-close');
        if (masterCloseBtn) {
            masterCloseBtn.addEventListener('click', () => {
                const ov = document.getElementById('master-pipesize-modal-overlay');
                if (ov) ov.classList.remove('active');
            });
        }

        const masterOkBtn = document.getElementById('master-pipesize-modal-ok');
        if (masterOkBtn) {
            masterOkBtn.addEventListener('click', () => {
                const ov = document.getElementById('master-pipesize-modal-overlay');
                if (ov) ov.classList.remove('active');
            });
        }

        // マスター表タブ切り替え
        const tabSwitch = document.getElementById('tab-master-switch');
        const tabFree = document.getElementById('tab-master-free');
        if (tabSwitch && tabFree) {
            tabSwitch.addEventListener('click', () => {
                tabSwitch.style.background = 'rgba(16,185,129,0.15)';
                tabSwitch.style.color = '#10b981';
                tabSwitch.style.borderColor = '#10b981';
                tabFree.style.background = 'rgba(255,255,255,0.03)';
                tabFree.style.color = 'var(--text-secondary)';
                tabFree.style.borderColor = 'var(--border-color)';
                this.renderMasterPipeSizeTable('switch');
            });
            tabFree.addEventListener('click', () => {
                tabFree.style.background = 'rgba(16,185,129,0.15)';
                tabFree.style.color = '#10b981';
                tabFree.style.borderColor = '#10b981';
                tabSwitch.style.background = 'rgba(255,255,255,0.03)';
                tabSwitch.style.color = 'var(--text-secondary)';
                tabSwitch.style.borderColor = 'var(--border-color)';
                this.renderMasterPipeSizeTable('free');
            });
        }

        const btnReset = document.getElementById('btn-reset');
        if (btnReset) {
            btnReset.addEventListener('click', () => {
                const currentSeries = this.engine.SERIES_DATABASE[this.activeSeriesId];
                if (confirm("現在の系統設計をクリアして初期状態に戻しますか？")) {
                    this.systemTree = {
                        id: "root",
                        name: "室外機 (シティマルチ)",
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

    /** サンプルプリセットの読み込み */
    loadSamplePresetForSeries() {
        if (this.activeSeriesId === 'city_multi_r2') {
            // R2シリーズ用: 親BCと子BCを用いた冷暖同時系統
            this.systemTree = {
                id: "root",
                name: "室外機 PURY-P280EM-A (10馬力)",
                type: "outdoor",
                capacity: 28.0,
                length: 0,
                children: [
                    {
                        id: "bc_parent",
                        name: "親BCコントローラー",
                        type: "bc_controller",
                        length: 30, // 室外機〜親BC間 30m
                        children: [
                            {
                                id: "indoor_r1",
                                name: "会議室 A (PLFY)",
                                type: "indoor",
                                indoorStyle: "cassette_4way",
                                capacity: 5.6,
                                length: 8,
                                children: []
                            },
                            {
                                id: "indoor_r2",
                                name: "社長室 B (PKFY)",
                                type: "indoor",
                                indoorStyle: "wall_mounted",
                                capacity: 2.8,
                                length: 12,
                                children: []
                            },
                            {
                                id: "bc_sub",
                                name: "子BCコントローラー",
                                type: "sub_bc_controller",
                                length: 15, // 親BC〜子BC間 15m
                                children: [
                                    {
                                        id: "indoor_sub1",
                                        name: "事務室 C (PLFY)",
                                        type: "indoor",
                                        indoorStyle: "cassette_4way",
                                        capacity: 7.1,
                                        length: 6,
                                        children: []
                                    },
                                    {
                                        id: "indoor_sub2",
                                        name: "食堂 D (PEFY)",
                                        type: "indoor",
                                        indoorStyle: "ducted",
                                        capacity: 8.0,
                                        length: 10,
                                        children: []
                                    }
                                ]
                            }
                        ]
                    }
                ]
            };
        } else if (this.activeSeriesId === 'mr_slim_multi') {
            // Mr.Slim用: 同時トリプル構成 (分岐管1箇所から3分岐)
            this.systemTree = {
                id: "root",
                name: "室外機 PUZ-ZRMP140KA (6馬力)",
                type: "outdoor",
                capacity: 14.0,
                length: 0,
                children: [
                    {
                        id: "slim_branch",
                        name: "同時トリプル分岐管",
                        type: "branch",
                        length: 15,
                        children: [
                            {
                                id: "slim_in1",
                                name: "店舗エリア 東 (PLFY)",
                                type: "indoor",
                                indoorStyle: "cassette_4way",
                                capacity: 4.5,
                                length: 5,
                                children: []
                            },
                            {
                                id: "slim_in2",
                                name: "店舗エリア 中 (PLFY)",
                                type: "indoor",
                                indoorStyle: "cassette_4way",
                                capacity: 4.5,
                                length: 5,
                                children: []
                            },
                            {
                                id: "slim_in3",
                                name: "店舗エリア 西 (PLFY)",
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
            // Yシリーズ用: 通常のビル用マルチ系統 (分岐管2つ)
            this.systemTree = {
                id: "root",
                name: "室外機 PUHY-P280EM-A (10馬力)",
                type: "outdoor",
                capacity: 28.0,
                length: 0,
                children: [
                    {
                        id: "branch_y1",
                        name: "第1分岐管 A",
                        type: "branch",
                        length: 20,
                        children: [
                            {
                                id: "indoor_y1",
                                name: "応接室 A (PKFY)",
                                type: "indoor",
                                indoorStyle: "wall_mounted",
                                capacity: 3.6,
                                length: 8,
                                children: []
                            },
                            {
                                id: "branch_y2",
                                name: "第2分岐管 B",
                                type: "branch",
                                length: 15,
                                children: [
                                    {
                                        id: "indoor_y2",
                                        name: "ショールーム B (PLFY)",
                                        type: "indoor",
                                        indoorStyle: "cassette_4way",
                                        capacity: 11.2,
                                        length: 6,
                                        children: []
                                    },
                                    {
                                        id: "indoor_y3",
                                        name: "ロビー C (PCFY)",
                                        type: "indoor",
                                        indoorStyle: "ceiling_suspended",
                                        capacity: 11.2,
                                        length: 8,
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

    /** JSON エクスポート */
    exportJsonData() {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.systemTree, null, 2));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", `mitsubishi_piping_system_${this.activeSeriesId}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
    }

    /** 必要部材 (BOM) 表示パネルレンダリング */
    renderTotals(totals) {
        if (!this.totalsPanel) return;

        let html = '';

        // 1. 配管長さ集計
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

        // 3管用 (R2シリーズ)
        Object.keys(totals.highGasPipes).forEach(sz => {
            html += `<tr><td>吸入ガス管 (低圧): φ${sz} mm</td><td style="text-align: right;">${totals.lowGasPipes[sz] || 0} m</td></tr>`;
            html += `<tr><td>高低圧ガス管 (高圧): φ${sz} mm</td><td style="text-align: right;">${totals.highGasPipes[sz] || 0} m</td></tr>`;
            hasPipes = true;
        });

        // 2管用液管・ガス管
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

        // 2. 分岐管・BCコントローラー集計
        html += `
            <div>
                <h4 style="font-size: 0.78rem; color: var(--color-secondary); margin-bottom: 6px;">📦 分岐継手・BCコントローラー</h4>
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
            if (model.startsWith('CMB-P10')) {
                label = model.endsWith('KB') ? "子BCコントローラー" : "親BCコントローラー";
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
        `;

        this.totalsPanel.innerHTML = html;
    }

    /** 警告診断パネルの表示 */
    renderWarnings(warnings) {
        if (!this.warningPanel) return;

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
                <div class="alert-card ${isInfo ? 'warning' : ''}" style="cursor:pointer; margin-bottom:6px;" data-warning-idx="${idx}">
                    <div class="alert-icon">${isInfo ? 'ℹ️' : '🚨'}</div>
                    <div class="alert-text">
                        <div class="alert-title">${isInfo ? '情報' : '警告'}</div>
                        <div class="alert-desc">${msg}</div>
                        <div style="font-size:0.7rem; color:var(--color-secondary); margin-top:4px;">→ クリックで対処方法を確認</div>
                    </div>
                </div>
            `;
        });

        this.warningPanel.innerHTML = html;

        const warningItems = this.warningPanel.querySelectorAll('[data-warning-idx]');
        warningItems.forEach((item, idx) => {
            item.addEventListener('click', () => {
                const warningText = warnings[idx] ? (warnings[idx].message || warnings[idx]) : item.textContent;
                document.querySelectorAll('.node-card').forEach(nc => nc.classList.remove('error-blink'));
                let targetId = this.activeNodeId || 'root';
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

    // Node探索用ヘルパー
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

    isThreePipeSystem() {
        return this.activeSeriesId === 'city_multi_r2';
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

    // ===== 全部入り冷媒サイズマスター表 =====
    openMasterPipeSizeModal() {
        const overlay = document.getElementById('master-pipesize-modal-overlay');
        if (!overlay) return;
        overlay.classList.add('active');
        this.renderMasterPipeSizeTable('switch');
    }

    renderMasterPipeSizeTable(mode) {
        const container = document.getElementById('master-pipesize-table-container');
        if (!container) return;

        if (mode === 'switch') {
            // シティマルチ Yシリーズ 冷暖切換 (2管式) - 三菱電機技術資料準拠
            // 公式表は区間別に3表ある（Pipe A / Pipe B・C・D / Pipe a〜d）。D2・D5 準拠。
            container.innerHTML = `
                <div style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:12px; padding:10px 14px; background:rgba(230,0,18,0.06); border-radius:var(--radius-sm); border:1px solid rgba(230,0,18,0.15);">
                    <strong>シティマルチ Yシリーズ (冷暖切換・2管式)</strong><br>
                    室外機〜第一分岐間は室外機形番で選定（Pipe A）。分岐継手〜分岐継手間は下流容量合計で選定（Pipe B・C・D）。分岐継手〜室内機は室内機単体容量で選定（Pipe a〜d）。
                </div>
                <h4 style="font-size:0.85rem; color:var(--color-secondary); margin:12px 0 8px;">① 室外機 〜 第一分岐 (Pipe A)</h4>
                <table class="pipe-detail-table">
                    <thead>
                        <tr>
                            <th>室外機形番</th>
                            <th>室外機容量 (kW)</th>
                            <th>液管サイズ (φmm)</th>
                            <th>ガス管サイズ (φmm)</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr><td>P200</td><td>22.4 kW</td><td style="color:var(--color-secondary); font-weight:700;">φ9.52</td><td style="color:var(--color-secondary); font-weight:700;">φ22.2</td></tr>
                        <tr><td>P250 〜 P300</td><td>28.0 〜 33.5 kW</td><td style="color:var(--color-secondary); font-weight:700;">φ9.52</td><td style="color:var(--color-secondary); font-weight:700;">φ22.2</td></tr>
                        <tr><td>P350 〜 P400</td><td>40.0 〜 45.0 kW</td><td style="color:var(--color-secondary); font-weight:700;">φ12.7</td><td style="color:var(--color-secondary); font-weight:700;">φ28.58</td></tr>
                        <tr><td>P450 〜 P650</td><td>50.0 〜 73.5 kW</td><td style="color:var(--color-secondary); font-weight:700;">φ15.88</td><td style="color:var(--color-secondary); font-weight:700;">φ28.58</td></tr>
                        <tr><td>P700 〜 P800</td><td>80.0 〜 90.0 kW</td><td style="color:var(--color-secondary); font-weight:700;">φ19.05</td><td style="color:var(--color-secondary); font-weight:700;">φ34.93</td></tr>
                        <tr><td>P850 〜 P1350</td><td>95.0 〜 135.0 kW</td><td style="color:var(--color-secondary); font-weight:700;">φ19.05</td><td style="color:var(--color-secondary); font-weight:700;">φ41.28</td></tr>
                    </tbody>
                </table>
                <h4 style="font-size:0.85rem; color:var(--color-secondary); margin:16px 0 8px;">② 分岐継手 〜 分岐継手 (Pipe B・C・D)</h4>
                <table class="pipe-detail-table">
                    <thead>
                        <tr>
                            <th>下流容量合計 (kW)</th>
                            <th>液管サイズ (φmm)</th>
                            <th>ガス管サイズ (φmm)</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr><td>〜 14.0 kW</td><td style="color:var(--color-secondary); font-weight:700;">φ9.52</td><td style="color:var(--color-secondary); font-weight:700;">φ15.88</td></tr>
                        <tr><td>14.1 〜 20.0 kW</td><td style="color:var(--color-secondary); font-weight:700;">φ9.52</td><td style="color:var(--color-secondary); font-weight:700;">φ19.05</td></tr>
                        <tr><td>20.1 〜 30.0 kW</td><td style="color:var(--color-secondary); font-weight:700;">φ9.52</td><td style="color:var(--color-secondary); font-weight:700;">φ22.2</td></tr>
                        <tr><td>30.1 〜 40.0 kW</td><td style="color:var(--color-secondary); font-weight:700;">φ12.7</td><td style="color:var(--color-secondary); font-weight:700;">φ28.58</td></tr>
                        <tr><td>40.1 〜 65.0 kW</td><td style="color:var(--color-secondary); font-weight:700;">φ15.88</td><td style="color:var(--color-secondary); font-weight:700;">φ28.58</td></tr>
                        <tr><td>65.1 〜 80.0 kW</td><td style="color:var(--color-secondary); font-weight:700;">φ19.05</td><td style="color:var(--color-secondary); font-weight:700;">φ34.93</td></tr>
                        <tr><td>80.1 kW 〜</td><td style="color:var(--color-secondary); font-weight:700;">φ19.05</td><td style="color:var(--color-secondary); font-weight:700;">φ41.28</td></tr>
                    </tbody>
                </table>
                <h4 style="font-size:0.85rem; color:var(--color-secondary); margin:16px 0 8px;">③ 分岐継手 〜 室内機 (Pipe a〜d)</h4>
                <table class="pipe-detail-table">
                    <thead>
                        <tr>
                            <th>室内機形番</th>
                            <th>室内機容量 (kW)</th>
                            <th>液管サイズ (φmm)</th>
                            <th>ガス管サイズ (φmm)</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr><td>P10 〜 P50</td><td>〜 5.6 kW</td><td style="color:var(--color-secondary); font-weight:700;">φ6.35</td><td style="color:var(--color-secondary); font-weight:700;">φ12.7</td></tr>
                        <tr><td>P63 〜 P140</td><td>6.3 〜 14.0 kW</td><td style="color:var(--color-secondary); font-weight:700;">φ9.52</td><td style="color:var(--color-secondary); font-weight:700;">φ15.88</td></tr>
                        <tr><td>P200</td><td>22.4 kW</td><td style="color:var(--color-secondary); font-weight:700;">φ9.52</td><td style="color:var(--color-secondary); font-weight:700;">φ19.05</td></tr>
                        <tr><td>P250</td><td>28.0 kW</td><td style="color:var(--color-secondary); font-weight:700;">φ9.52</td><td style="color:var(--color-secondary); font-weight:700;">φ22.2</td></tr>
                    </tbody>
                </table>
                <div style="margin-top:1rem; padding:10px; background:rgba(255,255,255,0.02); border-radius:var(--radius-sm); border:1px solid var(--border-color); font-size:0.75rem; color:var(--text-secondary);">
                    ※ 第一分岐ジョイント (First Joint): P200〜P400 CMY-Y102LS-G2、P450〜P650 CMY-Y202S-G2、P700〜P1350 CMY-Y302S-G2<br>
                    ※ 分岐ジョイント (Branch Joint): 〜20.0 kW CMY-Y102SS-G2、20.1〜40.0 kW CMY-Y102LS-G2、40.1〜65.0 kW CMY-Y202S-G2、65.1 kW〜 CMY-Y302S-G2<br>
                    ※ 公式の増径は液管のみの条件付き（P250 は L1＞90m、P300 は L1＞40m で液管 12.7 など）。「最遠配管相当長90m以上で主管1サイズアップ」という則は公式資料にない。手動サイズアップは手動設定のみで、公式の増径条件は自動判定されない。<br>
                    ※ 実装の PUHY-P1360EM-A（136.0 kW）は公式 YNW-A の最大 P1350（135.0 kW）を超えるが、同じ帯域で選定される。
                </div>
            `;
        } else {
            // シティマルチ R2シリーズ 冷暖同時 (3管式) - 三菱電機技術資料準拠
            // D1・D3・D4 準拠。室外機〜親BC間は高圧・低圧ガス管の2管（液管なし）。
            container.innerHTML = `
                <div style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:12px; padding:10px 14px; background:rgba(230,0,18,0.06); border-radius:var(--radius-sm); border:1px solid rgba(230,0,18,0.15);">
                    <strong>シティマルチ R2シリーズ (冷暖同時・3管式)</strong><br>
                    室外機〜親BCコントローラー(CMB)間は高圧ガス管・低圧ガス管の2管（液管なし）。主管〜子BCコントローラー間は3管式。親BC・子BCコントローラー〜室内機間は2管式。
                </div>
                <h4 style="font-size:0.85rem; color:var(--color-secondary); margin:12px 0 8px;">① 室外機 〜 親BCコントローラー(CMB) (高圧・低圧ガス管のみ)</h4>
                <table class="pipe-detail-table">
                    <thead>
                        <tr>
                            <th>室外機容量 (kW)</th>
                            <th>馬力</th>
                            <th>高圧ガス管 (φmm)</th>
                            <th>低圧ガス管 (φmm)</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr><td>22.4 kW</td><td>8馬力</td><td style="color:#f59e0b; font-weight:700;">φ15.88</td><td style="color:#a78bfa; font-weight:700;">φ19.05</td></tr>
                        <tr><td>28.0 〜 33.5 kW</td><td>10〜12馬力</td><td style="color:#f59e0b; font-weight:700;">φ19.05</td><td style="color:#a78bfa; font-weight:700;">φ22.2</td></tr>
                        <tr><td>40.0 kW</td><td>14馬力</td><td style="color:#f59e0b; font-weight:700;">φ19.05</td><td style="color:#a78bfa; font-weight:700;">φ28.58</td></tr>
                        <tr><td>45.0 〜 67.0 kW</td><td>16〜24馬力</td><td style="color:#f59e0b; font-weight:700;">φ22.2</td><td style="color:#a78bfa; font-weight:700;">φ28.58</td></tr>
                        <tr><td>80.0 〜 90.0 kW</td><td>28〜32馬力</td><td style="color:#f59e0b; font-weight:700;">φ28.58</td><td style="color:#a78bfa; font-weight:700;">φ34.93</td></tr>
                        <tr><td>101.2 kW 〜</td><td>36馬力〜</td><td style="color:#f59e0b; font-weight:700;">φ28.58</td><td style="color:#a78bfa; font-weight:700;">φ41.28</td></tr>
                    </tbody>
                </table>
                <h4 style="font-size:0.85rem; color:var(--color-secondary); margin:16px 0 8px;">② 主管 〜 子BCコントローラー (3管式)</h4>
                <table class="pipe-detail-table">
                    <thead>
                        <tr>
                            <th>下流容量合計 (kW)</th>
                            <th>液管 (φmm)</th>
                            <th>高圧ガス管 (φmm)</th>
                            <th>低圧ガス管 (φmm)</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr><td>〜 20.0 kW</td><td style="color:var(--color-secondary); font-weight:700;">φ9.52</td><td style="color:#f59e0b; font-weight:700;">φ15.88</td><td style="color:#a78bfa; font-weight:700;">φ19.05</td></tr>
                        <tr><td>20.1 〜 30.0 kW</td><td style="color:var(--color-secondary); font-weight:700;">φ9.52</td><td style="color:#f59e0b; font-weight:700;">φ19.05</td><td style="color:#a78bfa; font-weight:700;">φ22.2</td></tr>
                        <tr><td>30.1 〜 35.0 kW</td><td style="color:var(--color-secondary); font-weight:700;">φ12.7</td><td style="color:#f59e0b; font-weight:700;">φ19.05</td><td style="color:#a78bfa; font-weight:700;">φ28.58</td></tr>
                        <tr><td>35.1 〜 40.0 kW</td><td style="color:var(--color-secondary); font-weight:700;">φ12.7</td><td style="color:#f59e0b; font-weight:700;">φ22.2</td><td style="color:#a78bfa; font-weight:700;">φ28.58</td></tr>
                        <tr><td>40.1 〜 60.0 kW</td><td style="color:var(--color-secondary); font-weight:700;">φ15.88</td><td style="color:#f59e0b; font-weight:700;">φ22.2</td><td style="color:#a78bfa; font-weight:700;">φ28.58</td></tr>
                        <tr><td>60.1 〜 65.0 kW</td><td style="color:var(--color-secondary); font-weight:700;">φ15.88</td><td style="color:#f59e0b; font-weight:700;">φ28.58</td><td style="color:#a78bfa; font-weight:700;">φ28.58</td></tr>
                        <tr><td>65.1 〜 80.0 kW</td><td style="color:var(--color-secondary); font-weight:700;">φ19.05</td><td style="color:#f59e0b; font-weight:700;">φ28.58</td><td style="color:#a78bfa; font-weight:700;">φ34.93</td></tr>
                        <tr><td>80.1 〜 100.0 kW</td><td style="color:var(--color-secondary); font-weight:700;">φ19.05</td><td style="color:#f59e0b; font-weight:700;">φ28.58</td><td style="color:#a78bfa; font-weight:700;">φ41.28</td></tr>
                        <tr><td>100.1 kW 〜</td><td style="color:var(--color-secondary); font-weight:700;">φ19.05</td><td style="color:#f59e0b; font-weight:700;">φ34.93</td><td style="color:#a78bfa; font-weight:700;">φ41.28</td></tr>
                    </tbody>
                </table>
                <h4 style="font-size:0.85rem; color:var(--color-secondary); margin:16px 0 8px;">③ 親BC・子BCコントローラー(CMB) 〜 室内機 (2管式)</h4>
                <table class="pipe-detail-table">
                    <thead>
                        <tr>
                            <th>室内機容量 (kW)</th>
                            <th>液管サイズ (φmm)</th>
                            <th>ガス管サイズ (φmm)</th>
                            <th>備考</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr><td>〜 5.0 kW (室内機単体)</td><td style="color:var(--color-secondary); font-weight:700;">φ6.35</td><td style="color:var(--color-secondary); font-weight:700;">φ12.7</td><td>BC〜室内機直結</td></tr>
                        <tr><td>5.1 〜 14.0 kW (室内機単体)</td><td style="color:var(--color-secondary); font-weight:700;">φ9.52</td><td style="color:var(--color-secondary); font-weight:700;">φ15.88</td><td>BC〜室内機直結</td></tr>
                        <tr><td>22.4 kW (室内機単体)</td><td style="color:var(--color-secondary); font-weight:700;">φ9.52</td><td style="color:var(--color-secondary); font-weight:700;">φ19.05</td><td>BC〜室内機直結</td></tr>
                        <tr><td>28.0 kW (室内機単体)</td><td style="color:var(--color-secondary); font-weight:700;">φ9.52</td><td style="color:var(--color-secondary); font-weight:700;">φ22.2</td><td>BC〜室内機直結</td></tr>
                    </tbody>
                </table>
                <div style="margin-top:1rem; padding:10px; background:rgba(255,255,255,0.02); border-radius:var(--radius-sm); border:1px solid var(--border-color); font-size:0.75rem; color:var(--text-secondary);">
                    ※ 親BCコントローラー型番: 室外機 40.0 kW 以下は CMB-P104V-J (〜4台)、CMB-P108V-J (〜8台)、CMB-P1016V-J (〜16台)。室外機 40.1〜101.2 kW は CMB-P108V-JA (〜8台)、CMB-P1012V-JA (〜12台)、CMB-P1016V-JA (〜16台)。室外機 101.2 kW 超は CMB-P1016V-KA のみ。<br>
                    ※ 子BCコントローラー型番: CMB-P104V-KB のみ<br>
                    ※ R2 の 2分岐ジョイント: 〜20.0 kW CMY-Y102SS-G2、20.1〜25.0 kW CMY-Y102LS-G2（1ポートの最大下流が P250 のため、25.0 kW 超の表はない）<br>
                    ※ R2 の増径則: 高圧ガス管Aが65mを超える場合、65m以降の全配管をφ28.58とする（自動判定なし）。P100以上の室内機を1ポートに接続するには集合キット CMY-R160-J1 が必要（2ポート使用。本アプリでは未対応）。
                </div>
            `;
        }
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
                if (!hasOk) { history.push(entry); hasOk = true; }
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
                badgeClass = 'history-badge-initial'; badgeText = '初期登録';
            } else if (entry.type === 'changed') {
                badgeClass = 'history-badge-changed'; badgeText = '仕様変更あり';
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
                    html += `<li><span class="history-change-icon">${changeIcon}</span><span>${desc}</span></li>`;
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
