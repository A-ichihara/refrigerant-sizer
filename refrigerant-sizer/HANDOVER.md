# 冷媒配管サイズ選定システム 作業引き継ぎ書

> 作成日: 2026-10-12  
> 引き継ぎ元: Google Deepmind Antigravity  
> プロジェクトリポジトリ: https://github.com/A-ichihara/refrigerant-sizer/tree/main/refrigerant-sizer

---

## 重要な現行状況（2026-10-20追記）

この引き継ぎ書には過去の実装方針・未完了タスクが残っている。配管径の技術判断については、旧記載よりも現行の監査メモと作業手順書を優先すること。特に、旧版の「全メーカー共通で相当長90m以上なら主管を1サイズアップ」という記述は撤回済みであり、使用してはならない。

- 作業手順: [修正・検証 作業手順書](./docs/repair-work-procedure.md)
- GHPサイズアップ監査: [GHP主管サイズアップ監査メモ](./docs/ghp-main-pipe-size-up-audit.md)
- GHP型式照合: [GHPシリーズ・型式照合台帳](./docs/ghp-series-model-verification.md)
  - [ダイキンGHP 登録型式・冷媒の照合メモ](./docs/daikin-ghp-model-verification.md)
  - [ヤンマー／パナソニックGHP 登録型式・冷媒の照合メモ](./docs/ghp-yanmar-panasonic-model-verification.md)
- Panasonic EHP UXE3長配管条件: [調査メモ](./panasonic-refrigerant-sizer/docs/uxe3-auto-size-up.md)
- Carrier回帰確認: [テスト記録](./docs/carrier-engine-regression.md)

現行GitHub Actionsで実行するテストは、GHP安全性、GHPサイズアップUI安全性、Carrierエンジン、GHP配管区間、Panasonic UXE3の電磁弁キット下流配管の5ファイル。Panasonic UXE3の既存回帰テストを `.github/workflows/ghp-regression.yml` に追加済み。2026-10-20時点で、4テストを含むworkflow run `39367754651` と、監査メモ更新後のrun `39370841295` の両方が成功している。ただし、CI成功はメーカー公式資料との全配管径照合や実ブラウザ確認を意味しない。

---

## 1. プロジェクト概要

空調メーカー各社（ダイキン・三菱電機・パナソニック・キャリア・日立・東芝・ヤンマーGHP・ダイキンGHP）の冷媒配管サイズを自動選定するWebアプリケーション群。

**ローカルで直接ファイルを開くHTML/CSS/JSのみ（フレームワーク・サーバー不要）**

### ディレクトリ構成

```
e:\Antigravity\refrigerant-sizer-main\refrigerant-sizer\
├── daikin-refrigerant-sizer\         ← ダイキンEHP（基準・完成形）
│   ├── index.html
│   ├── css\styles.css
│   └── js\
│       ├── engine.js                 ← 計算エンジン（全系統）
│       ├── ui.js                     ← UIコントローラー
│       └── app.js                    ← 初期化
├── daikin-ghp-refrigerant-sizer\     ← ダイキンGHP
├── mitsubishi-refrigerant-sizer\     ← 三菱電機EHP  ← 今回作業対象
├── panasonic-refrigerant-sizer\      ← パナソニックEHP  ← 今回作業対象（途中）
├── carrier-refrigerant-sizer\        ← キャリア・東芝EHP
├── hitachi-refrigerant-sizer\        ← 日立EHP
├── yanmar-ghp-refrigerant-sizer\     ← ヤンマーGHP
└── index.html                        ← 全社選択トップページ
```

---

## 2. ユーザーからの依頼内容（元の要件）

1. **UIレイアウトの統一（最優先）**: 全メーカーの見た目を「ダイキンEHP」に完全に揃える
   - 内容・文言・色合いだけが違う状態にする
   - 3カラムレイアウト（左: プロパティ | 中央: キャンバス | 右: 集計・警告）

2. **冷媒管サイズの修正**:
   - 室外機 → 分岐継手（BSユニット含む）→ 分岐継手 → 室内機 という区間別に表示
   - 末端の室内機につながる冷媒管は必ず2管
   - 3管式区間のサイズ見直し（抜け・誤りの修正）
   - 主管サイズアップ基準の正確化（カタログ準拠）

3. **各メーカーの名称対応**:
   - 室外機・分流ユニット・分岐管の名称はメーカーごとに異なる
   - 見た目はダイキン準拠、名称はメーカー固有名を使用

4. **サンプルデータ読み込みの修正**: 一部メーカーでサンプルが正常に読み込まれない問題を修正

5. **全部入り冷媒サイズ表**: 全パターンを網羅したマスター表を各メーカーに追加

---

## 3. 作業進捗状況

### ✅ 完了済み

| メーカー | HTMLレイアウト | CSSレイアウト | 全部入りサイズ表 | 3管サイズ確認 |
|---------|-------------|-------------|--------------|------------|
| ダイキンEHP | ✅ 3カラム（基準） | ✅ 完成 | ✅ あり | ✅ 2管/3管対応済み |
| ダイキンGHP | ✅ 3カラム | ✅ 完成 | 未確認 | 未確認 |
| ヤンマーGHP | ✅ 3カラム | ✅ 完成 | 未確認 | 未確認 |
| **三菱電機EHP** | ✅ 3カラム化完了 | ✅ CSS修正完了 | ✅ 追加完了（R2/Y両方） | ✅ ui.js修正完了 |
| **パナソニックEHP** | ✅ HTML書き換え完了 | ✅ CSS修正完了（途中） | ⚠️ モーダルはあるが`openMasterPipeSizeModal`関数が未追加 | 未確認 |

### ⚠️ 作業途中（次の担当者が続ける）

| メーカー | 残作業 |
|---------|------|
| **パナソニックEHP** | ui.jsに `openMasterPipeSizeModal`・`renderMasterPipeSizeTable` メソッドを追加。`bindEvents`に btn-master-pipesize イベントを追加。`renderWarnings`をダイキン準拠のalert-card形式に変更 |
| **キャリア・東芝EHP** | HTML・CSS・ui.jsをすべて3カラムレイアウトに変更 |
| **日立EHP** | HTML・CSS・ui.jsをすべて3カラムレイアウトに変更 |
| **ダイキンGHP** | 全部入り冷媒サイズ表の追加（GHP専用サイズ一覧） |
| **ヤンマーGHP** | 全部入り冷媒サイズ表の追加（GHP専用サイズ一覧） |
| **全メーカー** | サンプルデータ読み込みの最終確認・修正 |

---

## 4. ダイキンEHPを基準とした実装ルール

> **重要**: ダイキンEHPが「完成形・基準」です。他のメーカーはこれに合わせます。

### 4.1 HTMLレイアウト

```html
<header>
  <!-- ロゴ・シリーズ選択・ヘッダーアクション -->
</header>

<main>  <!-- grid-template-columns: 320px 1fr 340px; -->
  <!-- 左 -->
  <aside class="sidebar">
    <div class="sidebar-header"><h2>機器プロパティ</h2></div>
    <div class="sidebar-content" id="property-editor">...</div>
  </aside>

  <!-- 中央 -->
  <section class="canvas-container" id="tree-canvas">
    <svg id="connection-svg" class="connection-svg"></svg>
  </section>

  <!-- 右 -->
  <aside class="sidebar">
    <div class="sidebar-header"><h2>集計 &amp; 設計チェック</h2></div>
    <div class="sidebar-content">
      <div id="totals-panel"></div>
      <div id="warning-panel"></div>
    </div>
  </aside>
</main>
```

**必須モーダルID一覧（全メーカー共通）:**
- `history-modal-overlay` - 更新履歴
- `fix-modal-overlay` - 設計診断対処案
- `pipesize-modal-overlay` - 全区間冷媒サイズ詳細表
- `master-pipesize-modal-overlay` - **全部入り冷媒サイズマスター表（新規追加）**

**必須ボタンID一覧（全メーカー共通）:**
- `btn-master-pipesize` - 全部入りマスター表表示
- `btn-show-pipesize` - 冷媒サイズ詳細表表示
- `btn-history` - 更新履歴
- `btn-load-sample` - サンプル読込
- `btn-force-sizeup` - 主管サイズUP
- `btn-reset` - リセット
- `btn-export` - 保存
- `btn-import` - 読込
- `btn-print` - 印刷

### 4.2 CSS重要設定

```css
/* Main Layout */
main {
    flex: 1;
    display: grid;
    grid-template-columns: 320px 1fr 340px;
    gap: 1.5rem;
    padding: 1.5rem;
    height: calc(100vh - 70px);
    overflow: hidden;
}

/* Canvas Container - scrollable */
.canvas-container {
    background: rgba(15, 22, 42, 0.5);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    position: relative;
    overflow: auto !important;
    display: block !important;
    padding: 2.5rem;
    box-shadow: inset 0 4px 20px rgba(0,0,0,0.4);
}

/* Tree Wrapper - inline-flex for proper layout */
.tree-wrapper {
    position: relative;
    z-index: 1;
    display: inline-flex !important;
    align-items: center;
    min-width: min-content;
    min-height: min-content;
    padding-right: 3rem;
    padding-bottom: 3rem;
    user-select: none;
}

/* Modal active class */
.modal-overlay.active,
.modal-overlay.show {
    opacity: 1;
    pointer-events: all;
}
```

### 4.3 各メーカーの色テーマ（CSSカスタムプロパティ）

| メーカー | `--color-primary` | `--color-secondary` | ロゴ色 |
|---------|-----------------|-------------------|------|
| ダイキンEHP | `#00a2e8` (青) | `#00d2ff` | `linear-gradient(135deg, #00a2e8, #00d2ff)` |
| 三菱電機EHP | `#e60012` (赤) | `#ff7878` | `linear-gradient(135deg, #e60012, #ff4d4d)` |
| パナソニックEHP | `#005aff` (青) | `#0088ff` | `linear-gradient(135deg, #005aff, #0088ff)` |
| キャリア・東芝EHP | `#003087` (紺) | `#0066cc` | 要確認 |
| 日立EHP | `#e60012` または `#cc0000` | 要確認 | 要確認 |
| ダイキンGHP | `#00a2e8` (青) | `#00d2ff` | ダイキンと同じ |
| ヤンマーGHP | `#e5171f` (赤) | `#ff4d4d` | ヤンマー赤 |

---

## 5. ui.jsの実装ルール

### 5.1 全メーカーで必要なメソッド

```javascript
class RefrigerantSizerUI {
    // ... (既存メソッド)
    
    // === 必須: 全部入りマスター表 ===
    openMasterPipeSizeModal() { ... }
    renderMasterPipeSizeTable(mode) { ... } // mode: 'switch' | 'free'
    
    // === 警告パネル（ダイキン準拠形式）===
    renderWarnings(warnings) {
        // alert-card クラスを使用（tab-btn不要）
        // ...
    }
    
    // === 集計パネル ===
    renderTotals(totals) { ... }
}
```

### 5.2 bindEventsに追加が必要なイベント

```javascript
// 全部入り冷媒サイズ表ボタン
const btnMasterPipe = document.getElementById('btn-master-pipesize');
if (btnMasterPipe) {
    btnMasterPipe.addEventListener('click', () => this.openMasterPipeSizeModal());
}

// マスター表モーダル閉じる
const masterCloseBtn = document.getElementById('master-pipesize-modal-close');
if (masterCloseBtn) {
    masterCloseBtn.addEventListener('click', () => {
        document.getElementById('master-pipesize-modal-overlay')?.classList.remove('active');
    });
}

// マスター表タブ切り替え
const tabSwitch = document.getElementById('tab-master-switch');
const tabFree = document.getElementById('tab-master-free');
if (tabSwitch && tabFree) {
    tabSwitch.addEventListener('click', () => {
        // タブのactive切り替え + this.renderMasterPipeSizeTable('switch');
    });
    tabFree.addEventListener('click', () => {
        // タブのactive切り替え + this.renderMasterPipeSizeTable('free');
    });
}
```

---

## 6. 冷媒配管サイズ選定ロジック（重要）

### 6.1 区間の考え方（全メーカー共通）

```
室外機 → [3管 or 2管] → BSユニット/分岐継手 → [2管] → 室内機
```

**2管式（冷暖切換）:**
- 室外機 → 分岐継手 → ... → 室内機 まで全て2管
- 各区間サイズ = その下流の室内機容量合計で決定

**3管式（冷暖同時）:**
- 室外機 → BSユニット（電磁弁キット/BCコントローラー/分流コントローラー/切替弁ユニット）: **3管**（液管 + 高圧ガス管 + 低圧ガス管）
- BSユニット → 室内機: **2管**（液管 + ガス管）
- **絶対ルール**: 末端の室内機に接続される配管は必ず2管

### 6.2 メーカー別 BSユニット名称対応表

| メーカー | BSユニット名称 | 型番例 | ノードtype |
|---------|-------------|------|-----------|
| ダイキン | BS接続ユニット | BS4Q31AV1 | `bs_unit` |
| 三菱電機 | BCコントローラー | CMB-P104V-J | `bc_controller` |
| パナソニック | 電磁弁キット | U-V3ME2 / U-V5ME2 | `bs_unit` |
| キャリア・東芝 | 切替弁ユニット | MCC-1401-GB2 | `bs_unit` |
| 日立 | 分流コントローラー | RCD-2.0FS | `bs_unit` |
| ダイキンGHP | BS分岐ユニット | BSHQ260A | `bs_unit` |

### 6.3 三菱電機 R2シリーズ 3管サイズ表（カタログ準拠）

**室外機 → 親BCコントローラー間（3管式）:**

| 室外機容量 | 液管 | 高圧ガス管 | 低圧ガス管 |
|---------|------|---------|---------|
| 22.4 kW (8HP) | φ9.52 | φ15.88 | φ19.05 |
| 28.0 kW (10HP) | φ9.52 | φ19.05 | φ22.2 |
| 33.5 kW (12HP) | φ12.7 | φ19.05 | φ28.58 |
| 40.0〜56.0 kW (14〜20HP) | φ15.88 | φ22.2 | φ28.58 |
| 67.0 kW (24HP) | φ19.05 | φ28.58 | φ34.93 |
| 80.0〜101.2 kW (28〜36HP) | φ19.05 | φ28.58 | φ41.28 |

**親BCコントローラー → 室内機間（2管式）:**

| 室内機容量 | 液管 | ガス管 |
|---------|------|------|
| ≦5.6 kW | φ6.35 | φ12.7 |
| ≦9.0 kW | φ9.52 | φ15.88 |
| ≦16.0 kW | φ9.52 | φ19.05 |
| >16.0 kW | φ9.52 | φ22.2 |

### 6.4 パナソニック UXE3シリーズ 電磁弁キット（3管式）サイズ

**室外機 → 電磁弁キット間（3管式）:**

| 室外機容量 | 液管 | 高圧ガス管 | 低圧ガス管 |
|---------|------|---------|---------|
| ≦22.4 kW | φ9.52 | φ15.88 | φ19.05 |
| ≦33.5 kW | φ9.52 | φ19.05 | φ22.2 |
| ≦56.0 kW | φ12.7 | φ22.2 | φ28.58 |
| ≦90.0 kW | φ15.88 | φ28.58 | φ34.93 |
| >90.0 kW | φ19.05 | φ34.93 | φ41.28 |

**電磁弁キット → 室内機間（2管式）:**

| 室内機容量 | 液管 | ガス管 |
|---------|------|------|
| ≦5.6 kW | φ6.35 | φ12.7 |
| ≦11.2 kW | φ9.52 | φ15.88 |
| ≦16.0 kW | φ9.52 | φ19.05 |
| >16.0 kW | φ12.7 | φ19.05 or φ22.2 |

### 6.5 主管サイズアップの条件（旧記載を訂正）

~~全メーカー共通: 最遠配管相当長 ≧ 90m の場合、主管を1サイズアップ~~

**この「全メーカー共通90m」ルールは誤りとして扱い、設計条件に使用しないこと。** メーカー・シリーズ・冷媒・世代によって、閾値（90m/100m、「以上」/「超える」）、対象管（液管・ガス管等）、対象区間、容量比率条件が異なる。現在のエンジンはサイズアップ処理に未解決の不整合があり、室外機ノードだけが変わって実配管区間やBOMに反映されないケースを確認済み。

実装判断は必ず次の現行監査資料に従うこと。

- [修正・検証 作業手順書](./docs/repair-work-procedure.md)
- [GHP主管サイズアップ監査メモ](./docs/ghp-main-pipe-size-up-audit.md)
- [GHPシリーズ・型式照合台帳](./docs/ghp-series-model-verification.md)

公式資料で対象型式と施工条件が一致するまで、サイズアップ結果を確定設計値として使用しない。

---

## 7. パナソニックEHPの残作業詳細

パナソニックのui.jsに以下を追加する必要があります：

### 7.1 bindEventsに追加

```javascript
// === 三菱電機ui.jsの同一コードを参考に追加 ===
const btnMasterPipe = document.getElementById('btn-master-pipesize');
if (btnMasterPipe) {
    btnMasterPipe.addEventListener('click', () => this.openMasterPipeSizeModal());
}
// + モーダル閉じるボタン + タブ切り替え
```

### 7.2 renderWarningsをダイキン準拠に変更

現在のパナソニックui.jsには `tab-btn` を参照するコードがある。
3カラムレイアウトではタブが不要なので、以下の形式に変更：

```javascript
renderWarnings(warnings) {
    if (!this.warningPanel) return;
    // tab-btnへの参照を削除
    // alert-card クラスを使用してダイキン形式で表示
}
```

### 7.3 追加するメソッド

```javascript
openMasterPipeSizeModal() {
    const overlay = document.getElementById('master-pipesize-modal-overlay');
    if (!overlay) return;
    overlay.classList.add('active');
    this.renderMasterPipeSizeTable('switch');
}

renderMasterPipeSizeTable(mode) {
    // mode === 'switch': UX3シリーズ 2管式
    // mode === 'free': UXE3シリーズ 3管式（電磁弁キット）
    // 上記6.4のサイズ表をHTMLテーブルで表示
}
```

---

## 8. キャリア・東芝・日立EHPの残作業

### 8.1 構造確認（作業前に必ずチェック）

```powershell
# 各ファイルの確認コマンド
Get-Content "e:\Antigravity\refrigerant-sizer-main\refrigerant-sizer\carrier-refrigerant-sizer\index.html"
Get-Content "e:\Antigravity\refrigerant-sizer-main\refrigerant-sizer\hitachi-refrigerant-sizer\index.html"
```

### 8.2 作業内容（三菱電機・パナソニックと同様）

1. **index.html**: 3カラムレイアウトに変更、必須モーダル・ボタン追加
2. **css/styles.css**: mainをgrid-template-columns: 320px 1fr 340px に変更
3. **js/ui.js**:
   - `openMasterPipeSizeModal` + `renderMasterPipeSizeTable` 追加
   - `renderWarnings` をalert-card形式に変更
   - `bindEvents` にbtn-master-pipesizeイベント追加

### 8.3 各社BSユニット型番（3管式）

**キャリア・東芝（切替弁ユニット）:**
- MCC-1401-GB2 (4台用)
- MCC-1402-GB2 (8台用)  
- MCC-1403-GB2 (13台用)

**日立（分流コントローラー）:**
- RCD-2.0FS (〜2馬力用)
- RCD-3.0FS (〜3馬力用)

---

## 9. ファイル修正時の注意事項

### 9.1 絶対に変えてはいけないもの

- **各メーカーのengine.jsの計算ロジック**: 冷媒サイズ選定の核心部分
- **localStorage のキー名**: 保存されている設計データが消える
- **`#property-editor` / `#totals-panel` / `#warning-panel`**: ui.jsが動的にHTMLを挿入するID
- **`js/engine.js` → `js/ui.js` → `js/app.js`のロード順序**

### 9.2 三菱電機ui.jsの状態

`e:\Antigravity\refrigerant-sizer-main\refrigerant-sizer\mitsubishi-refrigerant-sizer\js\ui.js`

現在の末尾状態（ユーザーが手動修正済み）:
```javascript
} else {
    window.RefrigerantSizerUI = RefrigerantSizerUI;
}
// ←ここで終わり（正常）
```

`openHistoryModal` / `closeHistoryModal` / `renderHistoryModal` が **class内に正しく存在するか**、ブラウザのコンソールでエラーが出ないかを確認すること。

### 9.3 モーダルの開閉

- 開く: `overlay.classList.add('active')`
- 閉じる: `overlay.classList.remove('active')`
- CSS側に `.modal-overlay.active { opacity: 1; pointer-events: all; }` が必要

---

## 10. GitHubリポジトリへのアップロード

リポジトリURL: https://github.com/A-ichihara/refrigerant-sizer

```bash
# 変更ファイルの確認
git status

# 全変更をコミット
git add -A
git commit -m "feat: 三菱電機・パナソニック 3カラムレイアウト対応・全部入りサイズ表追加"

# プッシュ
git push origin main
```

**変更されたファイル一覧:**
- `mitsubishi-refrigerant-sizer/index.html` - 3カラムHTML
- `mitsubishi-refrigerant-sizer/css/styles.css` - 3カラムCSS
- `mitsubishi-refrigerant-sizer/js/ui.js` - renderWarnings修正・マスター表追加
- `panasonic-refrigerant-sizer/index.html` - 3カラムHTML（新規書き換え）
- `panasonic-refrigerant-sizer/css/styles.css` - 3カラムCSS

---

## 11. 動作確認方法

1. ファイルエクスプローラーで `index.html` をブラウザで開く
2. ブラウザの開発者ツール（F12）でコンソールエラーがないことを確認
3. 「サンプル読込」ボタンで系統図が正常表示されることを確認
4. 「📑 全部入り冷媒サイズ表」ボタンでモーダルが開くことを確認
5. 系統図のノードをクリックして左サイドバーにプロパティが表示されることを確認

---

## 12. 優先順位

1. **高**: パナソニックEHP ui.js の残作業（openMasterPipeSizeModal追加）
2. **高**: 全メーカーの動作確認（三菱電機・パナソニックEHP）
3. **中**: キャリア・東芝EHP の3カラム化
4. **中**: 日立EHP の3カラム化
5. **低**: ダイキンGHP・ヤンマーGHP の全部入りサイズ表追加
6. **低**: サンプルデータ読み込みの最終確認・修正

---

## 13. 2026-10-20 引継ぎ追記（この節を旧記載より優先）

### GHP 4メーカーのサイズアップ機能は一時停止中

以下4エンジンでは、公式条件・対象配管区間・BOM反映の整合性が未検証のため、自動・手動サイズアップを計算結果に適用しない安全措置を入れた。90mという共通閾値を正式な設計条件として扱ってはいけない。

- アイシン GHP engine: `f6722c88a416e581bfac33ef40712845e16faa77`
- ダイキン GHP engine: `a05c7af37ba387aab54041dad3f67ac53d2b863e`
- ヤンマー GHP engine: `1f92c6587ddee16aae287d68883ffd4b08e5eb59`
- パナソニック GHP engine: `25c778f8227d7282b939fdd1d5bac288325419e1`
- 安全回帰テスト: `475f1c0a190dc26e03a07ee6d916742b4fea7c21`
- 監査資料: `refrigerant-sizer/docs/ghp-main-pipe-size-up-audit.md`

各GHP画面の操作名・ツールチップ・モーダル説明も「停止中」に更新済み。画面文言の変更は、ブラウザ動作確認済みという意味ではない。

- アイシン UI: `00e16fc730f24c3986d120afae4259825194572b`
- ダイキン UI: `9a623a938bffc81d58a50d81839cd50334140f6d`
- ヤンマー UI: `5d1dc742052092aa178c1512a2e83415926e985b`
- パナソニック UI: `cb063189baebb9f02cc63f0ac293bbc7ce14b5a2`
- 監査資料へのUI変更記録: `ca60c268cc70e8a8b0e7a27a4d51626912baea17`

### テスト・CIの確認状況

テストコードとGitHub Actionsは存在するが、現時点で最新コミットに対するActionsの成功結果は確認できていない。ローカル実行も未実施。したがって「テスト合格」「CI成功」と報告しないこと。利用可能な実行環境を確保してから、少なくとも以下を実行する。

```bash
node --test refrigerant-sizer/tests/ghp-safety-regression.test.cjs
node --test refrigerant-sizer/tests/ghp-sizeup-ui-safety.test.cjs
node --test refrigerant-sizer/tests/carrier-engine-regression.test.cjs
node --test refrigerant-sizer/tests/ghp-piping-segments.test.cjs
node --test refrigerant-sizer/panasonic-refrigerant-sizer/tests/uxe3-solenoid-downstream.test.cjs
```

### 次の作業順

1. GHP画面・エンジン・回帰テストの整合性を再確認し、実行できるテストは実行して結果を記録する。
2. GHP各社の型式・シリーズ・冷媒・2管式/3管式を公式資料と照合する。未確定の条件をコードへ推測で流用しない。
3. Panasonic EHP（`refrigerant-sizer/panasonic-refrigerant-sizer/`）のUXE3長配管増径は、`docs/uxe3-auto-size-up.md` のとおり主管LM・相当長L1・50m境界をモデル化できるまで自動適用しない。2014年UXE資料とアプリ内型式の適用一致も未確定。
4. 公式条件、区間分割、配管径表示、材料集計（BOM）を一体で実装し、境界値の回帰テストを追加してから機能を再有効化する。

費用の発生しない調査・編集・テスト整備は、ユーザーから追加承認を求めず継続してよい。有料資料・サービスの利用や費用発生前には必ず確認する。

### 2026-10-20 追記: サイズアップUIの操作自体を無効化

表示だけではクリックできてしまうため、GHP 4メーカーのサイズアップボタンに `disabled` / `aria-disabled` を設定し、UI初期化時にも無効状態を強制するよう修正した。保存済みの手動指定が有効状態のボタン表示として復元されないよう、`btn-primary` も解除する。

- アイシン UI: `15533f6c304a2db1835cf27668d0a71d4d359a39`
- ダイキン UI: `33458e3ab9f9eeee508fb112d3a2bb7815beb3e7`
- ヤンマー UI: `66fda25a8f24065f28091338dfd84cacf0ca17b4`
- パナソニック UI: `b5a50eb3deae2966d9f99800dce82e209b6e854b`
- UI無効化のソース回帰テスト: `0116af68dddc8e294c8dee062f852f8191a17158`

当時はCI status APIでステータスチェックが空で、ワークフロー実行一覧も取得できていなかった。その後、GitHub Actionsの実行一覧をREST APIで確認でき、4テストの成功を確認した。最新確認は下記「GitHub Actions回帰テスト成功」を参照。



## 2026-10-20 追記：Panasonic UXE3 主管サイズ監査

- 公式資料と現行コードの不一致候補は検出したが、該当するUXE主管サイズ表を原本図表として確定できていない。
- そのため、12～16馬力の基準サイズ変更は撤回済み。現行コードは変更前へ戻しているが、従来コードが正しいと確認できたわけではない。
- 未検証の期待値テストは削除し、CIワークフローからも除去済み。
- 詳細と必要な再確認項目は [UXE3自動増径・主管表監査メモ](./panasonic-refrigerant-sizer/docs/uxe3-auto-size-up.md) を参照。
- UXE3長配管自動増径は未実装。主管LM、相当長L1、50m境界の区間分割と材料集計の設計が必要。

## 2026-10-20 追記：UXE3主管サイズ表の未検証変更を撤回

前回追加したPanasonic UXE3 8～16馬力の主管サイズ変更は、公式PDFの該当表を原本画像で直接確認できておらず、引き継ぎ書の既存表との不整合も残るため撤回した。

- エンジンを変更前の分岐へ復旧：`05798a37cb1ca166919e24da54db6df20e8fef6f`
- 未検証の回帰テストを削除：`54dff00bafc3da893391da5b8c2000ec87b14f24`
- GitHub Actionsから該当テストを除去：`198b176597d54b642228bfb1ca06d7bd314053ee`
- 調査メモ更新：`26042f356d5d89e322cf57bb4fcb52ad3cf5e309`

重要：復旧は従来コードの正しさを保証しない。UXE3の主管サイズは未確定項目として扱い、公式原本表・脚注・対象型式とDB容量の対応を直接照合するまで、再変更しない。


## 2026-10-20 追記：GitHub Actions回帰テスト成功

GitHub Actions run `39367754651`（コミット `aa0d0993c64269b1894e9e8828d25e7d5be4261a`）で、次の4ステップがすべて成功した。

- GHP安全性回帰テスト
- Carrierエンジン回帰テスト
- GHP配管区間回帰テスト
- Panasonic UXE3電磁弁キット下流配管回帰テスト

実行結果：https://github.com/A-ichihara/refrigerant-sizer/actions/runs/39367754651

今回のCI成功は、これらの自動テストが通過したことを示す。公式カタログとの配管径照合、実ブラウザでのUI確認、または未実装の長配管自動増径が検証済みであることを意味しない。


## 2026-10-20 追記：監査メモ更新後のCI確認

GHPサイズアップ監査メモの現行状態への整合修正を含むコミット `58f302cb52f158bdbae03f9a646f6a484d8127be` について、GitHub Actions run `39370841295` が `success` で完了した。

実行結果：https://github.com/A-ichihara/refrigerant-sizer/actions/runs/39370841295

この確認により、当該コミットの4つの回帰テストワークフローが成功したことを確認した。ローカル実行・実ブラウザでの操作確認・公式資料に基づく全機種の配管径監査は別途であり、未確認項目を完了扱いにしない。


## 2026-10-20 追記：GHPサイズアップUIの停止状態を回帰テスト化

4社すべてのGHP画面で、サイズアップボタンがHTML上で無効化されていること、UI初期化時にも無効状態が強制されることを確認する静的回帰テスト `refrigerant-sizer/tests/ghp-sizeup-ui-safety.test.cjs` を追加し、`.github/workflows/ghp-regression.yml` に組み込んだ。テストはHTML属性とUI初期化コードを検査するものであり、実ブラウザの操作試験を代替するものではない。GitHub Actions run `39373327226`（コミット `6f9248b3af4e98e0df27e8c4bd210f5034ad22f3`）で、既存4テストと新規UI安全性テストの計5テストすべてが成功した。実行結果：https://github.com/A-ichihara/refrigerant-sizer/actions/runs/39373327226


## 2026-10-20 追記：5テスト構成のCI成功

GitHub Actions run `39373327226` は `success` で完了。GHP安全性、GHPサイズアップUI安全性、Carrierエンジン、GHP配管区間、Panasonic UXE3電磁弁キット下流配管の5テストすべて成功を確認した。

https://github.com/A-ichihara/refrigerant-sizer/actions/runs/39373327226

なお、途中のrun `39373280045` は新規UIテストの正規表現エスケープ誤りで失敗したが、テストコードを修正し、後続run `39373327226` で全テストの成功を確認した。失敗結果を隠さず記録し、修正後の結果と区別する。
