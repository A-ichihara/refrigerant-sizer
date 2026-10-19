# GHP配管区間モデル設計案（未実装）

作成: 2026-10-20。**メーカー・シリーズ別の施工資料との照合が終わるまで数値ロジックには適用しない。**

## 現状の問題

GHP 4社の `calculateSystem` は `findLongestPath(tree)` が返す**実長**を共通閾値90mと比較している。 `sizeNodePipes` のサイズアップは `outdoor` ノードのみに適用され、`aggregateBOM` は `outdoor` ノードの延長を集計しない。従って、主管サイズアップの有無で配管BOMの**管径別内訳が変わらない**再現ケースがある。

また、現在のツリーでは各ノードの `length` は「そのノードへ至る配管区間」と解釈される。主管を室外機ノードの属性として変更しても、第一分岐へ至る実際の配管区間（子ノードの `length`）は変更されない。

## 目標データモデル（案）

```js
{
  nodes: [{ id, type, capacity, modelNumber }],
  segments: [{
    id,
    fromNodeId,
    toNodeId,
    actualLengthM,
    equivalentLengthM: null, // 未入力ならnull。実長から勝手に推定しない
    role: "outdoor_to_first_branch", // 以下の役割から選択
    refrigerantCircuit: "two_pipe",  // または three_pipe_high_low
    pipeSize: { liquid: null, gas: null, highGas: null, lowGas: null },
    sizeUpRule: null, // メーカー/シリーズ/機種で照合済みの規則IDのみ
    sourceDocument: null
  }]
}
```

区間の役割:
- `outdoor_to_first_branch`: 室外機から第一分岐まで（主管候補）
- `outdoor_to_connection_kit`: 複数室外機・ハイブリッドの連結キットまで
- `connection_kit_to_first_branch`: 連結キットから第一分岐まで（主管候補）
- `branch_to_branch`: 分岐から次の分岐まで
- `branch_to_indoor`: 分岐から室内機まで
- `branch_to_bs` / `bs_to_indoor`: 3管式の冷暖切換ユニット前後
- `direct_outdoor_to_indoor`: 分岐のない直結系統

## 段階的な移行手順

1. 既存のツリー入力・JSON保存形式を変更せず、ノードと親子関係から**計算用セグメントを生成**するアダプターを作る。分岐が複数ある場合も「最初の分岐」を構造から判定する。
2. 各セグメントの `actualLengthM` と `role` をテストする。配管長は既存のBOM集計と一致させる。**この段階では管径を変更しない。**
3. 継手・分岐相当長、室外機から最遠室内機までの相当長、第一分岐以降の実長を**別の指標**として実装する。相当長データがない場合は未判定とする。
4. メーカー・シリーズ・型式・冷媒・施工資料の版を紐づけた選定ルールを作る。閾値の `>` / `>=` も公式資料に従い、共通90mルールを廃止する。
5. 対象となる主管**セグメントだけ**をアップサイズし、その結果から管径別BOMを生成する。非対象の分岐・室内機接続管には波及させない。3管式・ハイブリッドは別途検証する。
6. 旧JSON互換性、複数分岐、直結、3管式、90m・100m前後の境界、BOM合計一致、印刷を回帰テストする。

## メーカー公式資料から分かった注意点

- アイシン公式の**ハイブリッド**施工資料では「連結キット～第一分岐」を主配管と明示し、最遠配管**相当長**が100mを超える場合の管径変更例を記載している。これは**その資料の対象機種**に限定され、現行アプリの `aisin_ghp_hybrid` にそのまま転用してはいけない。
- アイシンの別のR410A施工資料には、相当長が100m**以上**の場合の記載もあり、シリーズ・施工資料によって比較演算子を区別する必要がある。
- アイシンの「第一分岐以降の最遠配管長90m」は**別の許容長条件**であり、これを「主管サイズアップ90m」と同一視してはいけない。

参照先:
- https://www.aisin.com/jp/product/energy/ghp/pdf/301_all.pdf
- https://www.aisin.com/jp/product/energy/ghp/compunit/setup/
- https://www.aisin.com/jp/product/energy/ghp/compunit/hybrid/index.html

## 受け入れ条件

- セグメント別の管径・実長を合計したBOMが一致する。
- 自動サイズアップの適用理由（資料、機種、相当長、閾値、対象セグメント）を追跡できる。
- 相当長未入力・機種未照合の場合は自動選定を確定扱いにせず、警告を残す。
- 既存のJSON保存・読込・系統図表示・印刷を壊さない。
