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


### 2026-10-20 継続調査の最新追記

- Panasonic UXEシリーズ旧資料について、公式ドメインの検索可能な本文から、最大配管長L1の相当長が90mを超える場合に主管LMの液管・吐出管・吸入管を1ランク上げる条件を再取得した。旧PDFの直接アクセスは現時点で公式トップへリダイレクトされるため、原本の表・脚注・ページ画像は未確認。詳細は [UXE3長配管調査メモ](./panasonic-refrigerant-sizer/docs/uxe3-auto-size-up.md) を参照。
- 公式製品情報では18HPの組合せ機に XPA-P504UXE3（構成品番 CU-P224UXE3 + CU-P280UXE3）が見つかった。アプリの18～20HPモデル登録名・容量と公式組合せ構成の照合は未完了。コードは変更していない。
- 調査メモ更新コミット 67ff67ab1efbeeeaf5ff3e74049c9eb8aea07039 のGitHub Actions run [39377385210](https://github.com/A-ichihara/refrigerant-sizer/actions/runs/39377385210) は成功。これはドキュメント変更のCI成功であり、UXE3管径表やサイズアップロジックの正しさを検証したものではない。
- GHP 4社の未検証サイズアップ適用は引き続き停止中。主管区間・相当長・型式適用範囲・BOM反映を検証するまでは再有効化しない。


### 2026-10-20 追加調査：アイシン・ハイブリッド公式資料のページ単位照合

- アイシン公式2026年4月版「ハイブリッド空調システム（R410A）」PDFの本文を確認。P.4にGHP450形＋EHP224形の連絡キット～第一分岐の配管判定表、P.5に標準組合せ型式 ASGP450F2ZD + AEGP224F2（塩害仕様は ASGP450F2ZDE + AEGP224F2E）を確認した。資料：https://www.aisin.com/jp/product/energy/ghp/pdf/301_all.pdf
- アプリの `aisin_ghp_hybrid` は `AHGP450P` / `AHGP560P` / `AHGP710P`、R32登録であり、この公式R410Aハイブリッド資料の型式・冷媒・GHP/EHP構成とは一致しない。別世代の型式が存在しないとは断定しないが、現状は正式選定に使わない。詳細は [GHPシリーズ・型式照合台帳](./docs/ghp-series-model-verification.md)。
- 該当調査は文書のみ更新。エンジン、型式テーブル、サイズアップ動作は変更していない。GHP 4社の未検証サイズアップは停止を維持する。


### 2026-10-20 追加調査：Panasonic UXEの主管長50m条件

- UXE旧資料の検索可能な本文から、主管 `LM = LA + LB`、LM実長上限80m、L1最大実長150m（相当長175m）、L1相当長90m超で主管LMの吸込・吐出・液管を1ランク増径する条件に加え、**LMが50mを超える場合は、90m条件とは別に、50mまでの部分の吸込管・吐出管を1ランク増径する**条件を確認した。L1最大・ΔL・各分岐管・液管総和長の制約も調査メモに追記。原本ページ画像と次頁の管径表は未確認のため、コードは変更していない。
- 詳細: [UXE3長配管調査メモ](./panasonic-refrigerant-sizer/docs/uxe3-auto-size-up.md)。この条件はUXEシリーズの資料に限定し、他シリーズに流用しない。

### 2026-10-20 追加監査：UXE3の型式・80m上限・UI警告

- Panasonic公式の型式別仕様書で、CU-P335UXE3は12馬力・33.5kW、R410A、機器接続管は吸込φ25.4／吐出φ19.05／液φ12.7を確認。PA-P504UXE3は18馬力の組合せ機（CU-P280UXE3 + CU-P224UXE3）、冷房50.4kW、R410A、組合せ主管寸法は吸込φ28.58／吐出φ22.22／液φ15.88。これらの「機器接続寸法」と系統の主管選定表は同一と決めつけない。
- Panasonic公式の配管系統図作成ソフト更新履歴（2024-11-14）に、UXE3のメイン配管長80m上限超過がエラーリストに出ない不具合の修正記録がある。現行アプリに同等のLM実長80m検査があるか未確認。
- 現行UXE3 UIの名称は「冷暖同時 3管式」、直結警告は「冷暖同時(MF3)」と記載する一方、公式シリーズ名は「冷暖フリーUXE3」。別シリーズ名表示と用語不一致は回帰テスト付きで見直す候補。
- UXE3の手動サイズアップ引数は再帰処理で各子区間の選定にも渡る。公式の主管LM限定条件（L1相当長90m超、LM>50mの部分増径）を再現していない。UI/エンジンコードは今回変更せず、詳細を [UXE3調査メモ](./panasonic-refrigerant-sizer/docs/uxe3-auto-size-up.md) に追記。
- 更新コミット `315ad28cee81aa8cae301558e11cb47037c4d144` は調査文書のみ。公式仕様書・ツール更新履歴への参照を記録したものであり、UXE3自動サイズアップが実装済みであることを意味しない。

### 2026-10-20 追加：Panasonic公式ソフト更新履歴によるUXE3主管80m上限の裏付け

- Panasonic公式「PAC・GHP配管系統図作成ソフト」更新履歴：https://hvac.panasonic.com/search/tool/soft-piping.html
- 2024-11-14の更新履歴に、冷暖フリーUXE3のメイン配管長80m上限超過がエラーリストに表示されない不具合を修正した記録がある。設計資料の `LM ≦ 80m` と整合する。
- これは上限検査の必要性を裏付けるが、アプリでの検査対象区間や境界値の実装方法までは示さない。UXE3の主管LM区間を正確に識別できるようになるまで、総配管長や最遠経路長で代用しない。
- 80m上限検査は、L1相当長90m超による主管増径条件とは別。いずれも区間モデルと公式配管表が確定するまで、自動増径機能は有効化しない。
- 詳細：[UXE3調査メモ](./panasonic-refrigerant-sizer/docs/uxe3-auto-size-up.md)。調査文書のみの更新コミット `ca6011bda1aeae1a5d82229f4ef4d237f296abe4`。
### 2026-10-20 追加：UXEシリーズ主管サイズ（LA）表の検索可能テキストを確認

- Panasonic公式旧UXEシリーズ資料の検索可能テキストで、主管サイズ（LA）表の8～24馬力帯を確認した。8/10/12/14/16/18/20/22/24馬力に対応する形式は224/280/335/400/450/504/560/615/680。管径は [UXE3調査メモ](./panasonic-refrigerant-sizer/docs/uxe3-auto-size-up.md) に表で記録。
- 特に12～16馬力の主管LA表は吸込φ25.40mm、18馬力は吸込φ28.58・吐出φ22.22・液φ12.7mm。現行 `selectThreePipeSize()` には差異がある。ただし、LA表と現行コードが選定する区間の対応が確定していないため、コードへ直接転記しない。
- 現行コードの3管式は「室外機～電磁弁キット間」を選定するが、公式資料の主管はLM=LA+LB。LA、LB、LM、LOとアプリツリーの各辺を対応づける区間モデルの確認が必要。
- 公式検索テキストの取得は進展だが、原本ページ画像の直接確認は未完了。エンジン・型式データベースは変更なし。調査文書コミット `926e2d1c2a4c9a0c437c1d3a9cb517d96a4b1cee`。
### 2026-10-20 追加：UXE3型式マスターの容量範囲・総合品番の差異

- 公式UXE主管LA表は8～48馬力帯（形式224～1350）を掲載するが、現行 `fsv_uxe3` は8～20馬力のみ登録。対応範囲をどうするか検討が必要。
- 公式表では18馬力は形式504・組合せ10+8、20馬力は形式560・組合せ10+10。一方、現行マスターは18馬力 `U-P500UXE3` / 50.0kW、20馬力 `U-P560UXE3` / 56.0kW。公式総合品番・冷房能力・構成機の対応が未確定のため、型式や容量を一括置換しない。
- 8～16馬力についてもアプリの `U-P...` と公式個別室外機の `CU-P...` を区別する必要がある。単体機と組合せ機の形式、相当馬力、冷房能力、構成室外機、主管径を別項目として整理する設計を検討。
- 詳細は [UXE3調査メモ](./panasonic-refrigerant-sizer/docs/uxe3-auto-size-up.md) の追補5・6。調査文書のみで、エンジン・型式データベースは変更していない。
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

> **監査上の注意（2026-10-20）:** 以下の表は旧引き継ぎ情報であり、現行の公式原本表・脚注との照合が完了していない。設計根拠として確定扱いせず、コード変更の期待値にも使わないこと。現行コードの基準径も正しいと確認済みではない。最新の確認状況は [`uxe3-auto-size-up.md`](./panasonic-refrigerant-sizer/docs/uxe3-auto-size-up.md) を参照。

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


## 2026-10-20 追記：UXE3資料の暫定扱いと最新CI確認

- 旧UXE3設計資料URLは今回の調査環境で公式サイトのトップへリダイレクトされ、PDF原本の図表・脚注を直接確認できなかった。このため `panasonic-refrigerant-sizer/docs/uxe3-auto-size-up.md` の増径条件は「暫定読取」に明示的に格下げした。
- 既存の引き継ぎ書6.4節にあるUXE3主管サイズ表も、原本照合が未完了の旧情報であることを明記した。表の値を確定値としてコードやテストに流用しない。
- 作業手順書のCI一覧を現行5テストに更新。コミット `fd39c88b3c6e8faf2468cc765d921c075a42ef68` のGitHub Actions run `39375318352` は成功し、5テストすべて通過した。

CI結果：https://github.com/A-ichihara/refrigerant-sizer/actions/runs/39375318352



## 2026-10-20 追記：暫定90m警告の文言テストと最新CI

- GHP 4社の2管式回帰テストで、90m超の警告が「暫定トリガー」であること、および実長をメーカー公式の相当長判定と混同しないことを検査するアサーションを追加した。
- 作業手順書のCI一覧を現行の5テスト構成に修正し、古い「3テスト」「UXE3テストがCI未実行」という記述を現状に合わせた。
- 最新CI run `39375840773` は `success`。対象コミット `663756ea8efcf67b0b9a664883346441a5c59d80`。5つのテストステップがすべて成功した。
- 実行結果：https://github.com/A-ichihara/refrigerant-sizer/actions/runs/39375840773
- この結果は回帰テストの成功を示すものであり、メーカー公式の全型式照合、ブラウザでの手動操作、GHP自動増径の有効化を意味しない。GHPサイズアップボタンと計算処理の安全停止は継続する。


## 2026-10-20 追記：UXE3シリーズ名称と警告文を公式表記に統一

Panasonic公式製品情報ではUXE3は「冷暖フリービル用マルチUXE3室外機」と表記され、冷房排熱を暖房に利用する3管式として説明されている。公式製品情報例：
- https://www2.panasonic.biz/jp/ai/products/search/detail?b_cd=501&bh_cd=5&c=search&item_cd=CU-P450UXE3&item_no=CU-P450UXE3
- https://www2.panasonic.biz/jp/ai/products/search/detail?b_cd=501&bh_cd=5&c=search&item_cd=CU-P224UXE3&item_no=CU-P224UXE3

そのため、Panasonic EHPのUXE3選択肢・エンジン内のシリーズ名と直結時警告に残っていた「冷暖同時(MF3)」表記を、UXE3固有の「冷暖フリー」表記へ修正した。アルゴリズム、管径、サイズアップの停止措置は変更していない。

- エンジン変更: `476593962150c2a5a9c6873e37f4a87aca92f2a1`
- UI選択肢変更: `ccb6f4e5b812b2b947daacdd885ad7235fac1bec`
- 直結警告の回帰テスト追加: `07f5787904987cecf94ff30852f8eb8b090953e6`
- エンジン変更CI: [run 39379587509](https://github.com/A-ichihara/refrigerant-sizer/actions/runs/39379587509) — success
- UI変更CI: [run 39379601664](https://github.com/A-ichihara/refrigerant-sizer/actions/runs/39379601664) — success
- 回帰テスト変更CI: [run 39379606197](https://github.com/A-ichihara/refrigerant-sizer/actions/runs/39379606197) — success

これは表示上の用語整合性修正であり、UXE3の型式・容量マスターの不整合や主管サイズアップ条件が解決したことを意味しない。引き続き、公式配管表とアプリ区間モデルの照合は未完了。


## 2026-10-20 追加監査：UXE3 18/20馬力の組合せ室外機品番を修正

Panasonic公式の型式別仕様書で、UXE3の18馬力と20馬力が単体機ではなく組合せ室外ユニットであることを再確認した。

- 18馬力：総合品番 **PA-P504UXE3**、構成 CU-P280UXE3 + CU-P224UXE3、冷房能力 **50.4 kW**。公式仕様書: https://hvac.panasonic.com/search/add-on/hvac/fileDownload2.jsp?hinban=PA-P504UXE3&itemID=t000100153626&volumeName=00001
- 20馬力：総合品番 **PA-P560UXE3**、構成 CU-P280UXE3 + CU-P280UXE3、冷房能力 **56.0 kW**。公式仕様書: https://hvac.panasonic.com/search/add-on/hvac/fileDownload2.jsp?hinban=PA-P560UXE3&itemID=t000100154276&volumeName=00001

上記に基づき、SERIES_DATABASE.fsv_uxe3.outdoorCapacities の18馬力を 50.0 / U-P500UXE3 から 50.4 / PA-P504UXE3 へ修正し、20馬力のモデル番号を U-P560UXE3 から PA-P560UXE3 へ修正した。20馬力の容量56.0kWは公式仕様書と一致するため維持した。

- エンジン修正コミット：cd1938b2c33d50accc0957fa491c6bb631f3b535
- 公式品番と容量の回帰テスト追加コミット：43829895759a9dbaad30d64b1a0e47a759b65238

これは型式マスターの明白な品番・容量不一致を修正したものであり、UXE3の主管サイズ表・長配管増径条件を確定したものではない。主管径と自動増径の保留は継続する。U-P224UXE3 など8～16馬力の表示名についても、単体機の公式品番表記との整合は別途監査対象とする。


## 2026-10-20 追記：UXE3単体室外機の正式品番表記を修正

公式型式別仕様書に合わせ、UXE3の8～16馬力の品番を U-P224/280/335/400/450UXE3 から CU-P224/280/335/400/450UXE3 に修正した。18/20馬力の組合せ室外機は PA-P504UXE3 / PA-P560UXE3 とする。対象型式の公式資料例：
- CU-P224UXE3：https://hvac.panasonic.com/search/add-on/hvac/fileDownload2.jsp?hinban=CU-P224UXE3&itemID=t000100039271&volumeName=00001
- CU-P335UXE3：https://hvac.panasonic.com/search/add-on/hvac/fileDownload2.jsp?hinban=CU-P335UXE3&itemID=t000100045060&volumeName=00001
- PA-P504UXE3：https://hvac.panasonic.com/search/add-on/hvac/fileDownload2.jsp?hinban=PA-P504UXE3&itemID=t000100153626&volumeName=00001
- PA-P560UXE3：https://hvac.panasonic.com/search/add-on/hvac/fileDownload2.jsp?hinban=PA-P560UXE3&itemID=t000100154276&volumeName=00001

- エンジン修正コミット：6589c955c3064d9c938741e3ac484d7bee34c1b2
- 回帰テスト拡張コミット：e54506f7161ff77f1d7fecc343be5712f710a789

この変更は品番表記と18馬力の冷房能力値に限定する。公式主管LA表と現行ツリー区間の対応、UXE3長配管時の増径条件、BOM区間分割は未解決であり、サイズアップは引き続き未適用とする。


## 2026-10-20 UXE3上流分岐の3管式集計・誤警告修正

エンジンの従来実装では、室外機→分岐→電磁弁キットの合法な構造において、室外機直下の分岐を「電磁弁キットなしの直接接続」と誤判定し、分岐辺の3管式材料数量を加算せず、後続の電磁弁キットに対する再帰処理を誤る問題があった。電磁弁キット上流のbranchは3管式として集計し、solenoid_kitに入った時点で下流2管式へ切り替えるよう修正した。

- エンジン変更：6ff0028531e4fed3d31075bb620093b78b6711d6
- 回帰テスト追加：4d8c8e229149169a98a448a906a6852afa563e42
- 回帰テストでは室外機→分岐→2つの電磁弁キット→各室内機の39m系統を使用し、上流3管31m、下流2管8m、液管39m、電磁弁キット2個、直結誤警告なしを確認する。

これは既存の基準管径選定値を変更せず、接続構造の判定とBOM集計の漏れを修正したもの。UXE3の公式主管径・長配管自動増径は引き続き未確定・未適用。


## 2026-10-20 UXE3 18HP旧保存データの互換対応

UXE3 18HP室外機の公式容量を50.0→50.4kWに訂正した結果、旧localStorageおよび旧JSONエクスポートで保存された50.0kWの室外機が型式照合不能になる可能性が判明。`engine.migrateLegacyOutdoorCapacity(rootNode, seriesId)` を追加し、UXE3の室外機容量が厳密に旧値50.0kWである場合に限って50.4kWへ補正する。UIのlocalStorage復元時とJSONインポート時に適用。室内機・配管長・分岐構成および他シリーズの50.0kWは変更しない。

- エンジン：10ee7335959a5fd3c6a935ccc8720aa3b486d8dd
- UI：51e924746b414de3c6ed1f0d97b2b05f495ab9a0
- 回帰テスト：375e769dc74b5829d7f906cf647f1e967fc9ef12
- 管径の公式適合性・増径条件は引き続き別途検証が必要。


## 2026-10-20 UXE3手動増径の安全停止

UXE3の手動サイズアップが上流3管・下流2管の全区間を一律増径していたため、メーカー指定の増径対象区間・管種を検証できるまで停止。`engine.calculateSystem` はUXE3に限り `isManualSizeUp=true` を無効化し、明示的な危険警告を返す。UIの手動増径ボタン・配管サイズ表のトグルもUXE3では無効化し、過去の保存フラグもUXE3では再適用しない。UX3等の別シリーズの操作は変更しない。なおUXE3の標準管径表の公式適合性も未検証であり、設計確定値ではない。

- エンジン：af0386355a51e0d8d762ee453bf34ee0daae706b
- UI：e63ba732055e03bfbd2cda3e2e8d2a56a21e691b
- 回帰テスト：5360e52eedd2daa6fd8a529dc8f2fbfa67b242a2

## 2026-10-20 UXE3手動サイズアップ停止表示を明確化

UXE3選択中は手動サイズアップボタンが無効になる既存の安全停止について、無効化だけでは画面上で理由が分かりにくいため、ボタンラベルを「主管サイズUP（停止中）」へ切り替えるようUIを修正した。UX3等の別シリーズ選択時は従来の「主管サイズUP」に戻る。ツールチップにも停止理由を表示する。

- UI変更コミット：aa19a4ecf0e8d6ab7c252db8cda83fdd6436805a
- 回帰テスト追加コミット：3e87a96d962a220dc270d85408d353348976aadb
- テストは uxe3-solenoid-downstream.test.cjs 内でUI初期化・更新処理の停止状態とラベル文言を検査する。DOMを用いた実ブラウザ試験ではない。
- GitHub Actions run `39431524802`（コミット `6cc857c1b89143a507a139fa772fa1c8db4f0310`）は `success`。GHP安全性、GHPサイズアップUI、Carrier、GHP配管区間、Panasonic UXE3の5テストステップすべて成功。結果：https://github.com/A-ichihara/refrigerant-sizer/actions/runs/39431524802

UXE3のメーカー公式基準管径・長配管増径は引き続き未確定・未適用であり、この変更は表示の明確化のみ。設計計算値を保証するものではない。

## 2026-10-20 UXE3基準配管径の未検証警告を常時表示

監査の結果、UXE3のメーカー公式主管表（LA/LB/LM/LO等の区間別指定）と、現行ツリー上の各配管辺との対応が確定していないため、手動増径の停止警告だけでは、標準計算結果が確定径と誤認されるおそれがある。そこで、UXE3の計算結果には常に「【UXE3基準配管径未検証】」警告を追加した。公式配管設計資料またはP-SPECで照合するまで設計確定値として使わないよう案内する。

- エンジン変更：a063be55a85bf78ec64ee9d57cae206a1c4687f9
- 回帰テスト追加：dadbaf24b3abb1b9d0a8287d3bdb864a1883c081
- 調査メモ：panasonic-refrigerant-sizer/docs/uxe3-auto-size-up.md に追記（コミット fb6e5f367d71213753a3a6c19810382bd53a7913）
- この警告は選定ロジックの修正ではなく、未検証状態の誤認防止策。UXE3基準径と自動増径の公式適合性は未確定・未適用。
- GitHub Actions run `39431669743`（コミット `6c1bc012d58c895826429eaceb7dd71cbd54c159`）は `success`。GHP安全性、GHPサイズアップUI、Carrier、GHP配管区間、Panasonic UXE3の5テストステップすべて成功。結果：https://github.com/A-ichihara/refrigerant-sizer/actions/runs/39431669743
