# GHPシリーズ・型式照合台帳（暫定）

更新日: 2026-10-20

## 目的と判定

4社のアプリ内 `SERIES_DATABASE` に登録されたシリーズ名・室外機型式が、公式資料のどの世代・冷媒・配管規則に対応するかを明示する。**この台帳は型式の正当性を保証しない。** 公式資料にあるシリーズ名称を、コード中の似た名称だけで対応付けない。

- **未照合**: コード上の登録を確認したが、公式の同一型式・冷媒・施工資料との一致が未確認。
- **要区別**: メーカー公式に複数世代・冷媒が存在し、名称だけでは施工条件を特定できない。

## アプリ登録の棚卸し

| メーカー | コード上のシリーズID | コードにある型式例 | 状態 |
| --- | --- | --- | --- |
| アイシン | `aisin_ghp_xair` | `AXGP355P` | 未照合・要区別 |
| アイシン | `aisin_ghp_standard` | `AGP355P` | 未照合 |
| アイシン | `aisin_ghp_hybrid` | 型式はengine.jsを参照 | 未照合・要区別 |
| アイシン | `aisin_ghp_heat_recovery` | 型式はengine.jsを参照 | 未照合・要区別 |
| ダイキン | `daikin_ghp_super_combi` | `GHP355CKH` | 未照合 |
| ダイキン | `daikin_ghp_standard` | `GHP355UKH` | 未照合 |
| ダイキン | `daikin_ghp_cold` | 型式はengine.jsを参照 | 未照合 |
| ダイキン | `daikin_ghp_hr` | 型式はengine.jsを参照 | 未照合 |
| ダイキン | `daikin_ghp_chiller` | 型式はengine.jsを参照 | 未照合 |
| ヤンマー | `yanmar_ghp_highpower` | `YG-355HP` | 未照合 |
| ヤンマー | `yanmar_ghp_standard` | `YG-355J` | 未照合 |
| ヤンマー | `yanmar_ghp_chiller` | 型式はengine.jsを参照 | 未照合 |
| ヤンマー | `yanmar_ghp_exe_captor` | 型式はengine.jsを参照 | 未照合 |
| パナソニック | `panasonic_ghp_e_series` | `U-P355GE2` | 未照合 |
| パナソニック | `panasonic_ghp_standard` | `U-P355GF2` | 未照合 |
| パナソニック | `panasonic_ghp_cold` | 型式はengine.jsを参照 | 未照合 |
| パナソニック | `panasonic_ghp_multi_free` | 型式はengine.jsを参照 | 未照合 |
| パナソニック | `panasonic_ghp_twin_drive` | 型式はengine.jsを参照 | 未照合 |

計 **18シリーズ**。型式例は登録値の転記であり、実在型式としての検証済み表示ではない。

## 公式情報で確認できる世代の違い

アイシンの公式ラインアップは2026年時点でHシリーズ「エグゼアIV」（R32）、Gシリーズ「エグゼアIII」、Fシリーズ「エグゼアII」（冷暖フリー）などを別に掲載している。アプリの `xair` 等の名称だけではH/G/F/E5のどの施工資料が適用されるか確定できない。

- https://www.aisin.com/jp/product/energy/ghp/lineup/
- https://www.aisin.com/jp/product/energy/ghp/download/index.html
- https://www.aisin.com/jp/product/energy/ghp/compunit/setup/

2026年6月版のR32カタログと、R410Aの旧資料は混同しないこと。G/F/E5シリーズ間でも第一分岐以降の最遠配管長が異なるため、`maxFarDistance` やサイズアップ閾値を一律に変更してはいけない。

## 実装着手の判定基準

1. メーカーの正式型式とアプリ内型式が一致すること。
2. 冷媒種、シリーズ世代、2管式/3管式、設計/施工資料の発行年が一致すること。
3. 最遠配管長の**実長**と**相当長**、主管サイズアップ閾値の境界（以上/超）、対象管種、対象区間が明確であること。
4. 分岐後の管径が主配管径を超えない等のメーカー制約を確認すること。
5. 該当型式の正常系・閾値境界・分岐前後の回帰テストを追加し、BOMと表示径の双方を確認すること。

上記が揃わないシリーズについて、公式資料に基づく自動サイズアップの実装済みとは表示しない。


## アイシン4シリーズのコード内冷媒・型式の詳細監査（2026-10-20）

`aisin-ghp-refrigerant-sizer/js/engine.js` の `SERIES_DATABASE` を直接確認した結果:

| シリーズID | コード内の冷媒 | 登録室外機型式（全件） | 判定 |
| --- | --- | --- | --- |
| `aisin_ghp_xair` | R410A | AXGP355P, AXGP450P, AXGP560P, AXGP710P, AXGP850P | **公式型式との一致未確認** |
| `aisin_ghp_standard` | R410A | AGP355P, AGP450P, AGP560P, AGP710P, AGP850P | **公式型式との一致未確認** |
| `aisin_ghp_hybrid` | R32 | AHGP450P, AHGP560P, AHGP710P | **要重点確認**：公式のFシリーズ・ハイブリッド空調システムはR410Aカタログ掲載。現行R32ハイブリッドの同一型式・構成である根拠が未確認 |
| `aisin_ghp_heat_recovery` | R410A | AXGP450PR, AXGP560PR, AXGP710PR, AXGP850PR | **公式型式との一致未確認** |

メーカー公式ラインアップで確認できた区分:
- Hシリーズ「エグゼアIV」はR32冷媒のビル用マルチ/まとマルチ（450〜850形）。
- Gシリーズ「エグゼアIII」はR410A冷媒のビル用マルチ/まとマルチ。
- Fシリーズ「エグゼアII」は冷暖フリー、GHPハイパワープラス、ハイブリッド空調システム等。
- E5シリーズはビル用マルチ（224〜355形）。

参照:
- https://www.aisin.com/jp/product/energy/ghp/lineup/
- https://www.aisin.com/jp/product/energy/ghp/compunit/index.html
- https://www.aisin.com/jp/product/energy/ghp/download/index.html
- https://www.aisin.com/jp/news/2026/010466.html

**重要:** `aisin_ghp_hybrid` のR32表記が誤りと断定したわけではない。ただし現時点で同一型式の公式仕様と一致を確認できておらず、冷媒種の異なるメーカー資料を使って管径を決めるのは危険。コード上の型式・冷媒を公式確認前に書き換えたり、該当シリーズの計算値を確定値として扱ったりしないこと。

### 次の照合手順

1. 上記18型式についてメーカーの型式別納入仕様書または施工説明書を検索し、完全一致の有無を記録する。
2. 型式が一致しなければ現行アプリの名称・冷媒・能力を根拠なしに修正せず、「未検証」と明示する。
3. 同一型式・同一冷媒・同一配管方式の公式資料を特定できたシリーズからサイズアップの境界値・対象管・主配管区間を確定する。


## アイシン・ハイブリッドの公式型式との具体的な不一致（2026-10-20）

アイシン公式「ハイブリッド空調システム 室外ユニット仕様表」に掲載された標準機の組み合わせは次のとおり。

- GHP側: **ASGP450F2ZD**（450形、16馬力）
- EHP側: **AEGP224F2**（224形、8馬力）
- 塩害仕様: GHP **ASGP450F2ZDE**、EHP **AEGP224F2E**

公式資料: https://www.aisin.com/jp/product/energy/ghp/pdf/f_hybrid.pdf?20260315=

対して、アプリの `aisin_ghp_hybrid` は室外機型式 `AHGP450P`、`AHGP560P`、`AHGP710P` を登録し、冷媒を `R32` と設定している。**少なくともこの公式Fシリーズ・ハイブリッドの型式とは一致しない。** また公式のハイブリッドはGHP+EHPの組合せシステムであり、GHP室外機だけの単一ツリーとして計算できるかも未検証。

**判定: 高優先度・公式Fシリーズ資料との不一致確認済み。ただし登録型式が他の公式シリーズで存在しないとまでは断定しない。** 同一型式のメーカー資料を確認するまでは、アプリの `aisin_ghp_hybrid` の計算結果を正式選定に使用しない。

安全な次の実装方針: 対象シリーズ選択時に未照合の警告を常時表示し、結果印刷にも残す。正式な型式・冷媒・GHP/EHP構成が確定するまで型式や計算テーブルを推測で置換しない。

## 2026-10-20 追補：アイシン現行ラインアップの世代混同を避ける

アイシン公式の現行ラインアップ資料を再確認した結果、シリーズ世代の区別を型式照合の必須条件として明記する。

- 公式の室外ユニット案内では、Hシリーズ「エグゼアIV」はR32、Gシリーズ「エグゼアIII」はR410Aとして別に掲載されている。
- 公式ニュースでは、Hシリーズ「GHP XAIR IV」はR32冷媒、2026年4月受注開始・2027年1月出荷開始予定と案内されている。
- したがって、アプリの `aisin_ghp_xair` がR410Aとして登録されている点は、現行の「XAIR IV / Hシリーズ」を意味するなら不一致となる。ただし、コードの `xair` が旧世代・別シリーズを意図している可能性もあり、名称だけを根拠に冷媒を変更してはならない。
- 判定は「旧世代を含む正式型式・世代との対応未確認」。公式カタログ上の能力帯が一致するだけでは、個別型式や配管ルールの適用根拠にならない。

公式参照:
- ラインアップ／仕様表: https://www.aisin.com/jp/product/energy/ghp/lineup/index.html
- 室外ユニット（H/R32・G/R410Aの区別）: https://www.aisin.com/jp/product/energy/ghp/compunit/index.html
- XAIR IV 発売情報: https://www.aisin.com/jp/news/2026/010466.html
- カタログダウンロード（2026年6月版R32、2026年4月版R410A）: https://www.aisin.com/jp/product/energy/ghp/download/index.html

## ダイキンGHPの詳細照合メモ

ダイキンGHPの5シリーズについて登録型式・冷媒・公式資料の照合状況を分離して記録した。詳細は[ダイキンGHP 登録型式・冷媒の照合メモ](./daikin-ghp-model-verification.md)を参照。型式の非実在を断定するものではなく、同一型式・同一冷媒・同一シリーズの公式設計資料が未特定であることを記録した。

## ヤンマー／パナソニックGHPの詳細照合メモ

両社の登録型式・冷媒・シリーズ構成の棚卸しは[ヤンマー／パナソニックGHP 登録型式・冷媒の照合メモ](./ghp-yanmar-panasonic-model-verification.md)に記録した。現時点の判定はいずれも「公式の同一型式・同一シリーズ資料との照合未完了」であり、非実在を断定するものではない。
