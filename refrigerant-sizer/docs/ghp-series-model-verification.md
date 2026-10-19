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
