# ヤンマー／パナソニックGHP 登録型式・冷媒の照合メモ

更新日: 2026-10-20  
対象: GHPアプリの `SERIES_DATABASE` 登録値

## 結論

以下はアプリのコードに登録された型式・冷媒・シリーズ名を棚卸しした記録であり、メーカー公式仕様との適合を認定するものではない。今回参照した公式カタログ・製品情報からは、全登録型式について同一型式・同一冷媒・同一シリーズの設計／施工資料を一対一で特定できていない。型式検索で見つからないことだけを根拠に、型式が存在しないとは断定しない。

## ヤンマーGHP 登録内容

対象ファイル: `refrigerant-sizer/yanmar-ghp-refrigerant-sizer/js/engine.js`

| シリーズID | アプリ表示名 | 冷媒 | 登録室外機型式 | 判定 |
| --- | --- | --- | --- | --- |
| `yanmar_ghp_highpower` | GHP ハイパワーエグゼ | R410A | YG-355HP, YG-450HP, YG-560HP, YG-710HP, YG-850HP | 型式別施工資料との一致未確認 |
| `yanmar_ghp_standard` | GHP 標準マルチ（Jシリーズ） | R410A | YG-355J, YG-450J, YG-560J, YG-710J, YG-850J | 型式別施工資料との一致未確認 |
| `yanmar_ghp_chiller` | GHP チラー／寒冷地対応マルチ | R410A | YGC-450W, YGC-560W, YGC-710W | チラー／寒冷地の専用資料との一致未確認 |
| `yanmar_ghp_exe_captor` | GHP エグゼキャプター（冷暖同時・HR・3管式） | R410A | YHR-450EC, YHR-560EC, YHR-710EC, YHR-850EC | 型式・3管式仕様との一致未確認 |

公式参考資料:
- ヤンマーGHPカタログ（2020年版のウェブカタログ）: https://www.yanmar.com/media/jp/2020/ebook/ghp-dh_202011/HTML/index276.html

この資料はロング配管条件の調査参考として使われているが、アプリ内の各シリーズ・全型式と一対一に一致する最新の設計／施工資料が特定できたわけではない。特にチラー／寒冷地系と冷暖同時3管式を、標準マルチの条件で代用しない。

## パナソニックGHP 登録内容

対象ファイル: `refrigerant-sizer/panasonic-ghp-refrigerant-sizer/js/engine.js`

| シリーズID | アプリ表示名 | 冷媒 | 登録室外機型式 | 判定 |
| --- | --- | --- | --- | --- |
| `panasonic_ghp_e_series` | GHP Eシリーズ | R410A | U-P355GE2, U-P450GE2, U-P560GE2, U-P710GE2, U-P850GE2 | 型式別施工資料との一致未確認 |
| `panasonic_ghp_standard` | GHP 標準マルチ（Fシリーズ） | R410A | U-P355GF2, U-P450GF2, U-P560GF2, U-P710GF2, U-P850GF2 | 型式別施工資料との一致未確認 |
| `panasonic_ghp_cold` | GHP 寒冷地対応マルチ（Cシリーズ） | R410A | U-P355GC2, U-P450GC2, U-P560GC2, U-P710GC2 | 型式別施工資料との一致未確認 |
| `panasonic_ghp_multi_free` | GHP 冷暖同時マルチ（MF・3管式） | R410A | U-P450GMF2, U-P560GMF2, U-P710GMF2, U-P850GMF2 | 型式・3管式仕様との一致未確認 |
| `panasonic_ghp_twin_drive` | GHP ハイブリッド・ツインドライブ | R410A | U-P450GTD2, U-P560GTD2, U-P710GTD2 | ハイブリッド構成の専用資料との一致未確認 |

公式参考資料:
- Panasonic公式製品情報・資料ダウンロード: https://hvac.panasonic.com/search/add-on/hvac/fileDownload2.jsp?hinban=U-GZ710S1DRE&itemID=t000100059456&volumeName=00001

上記のリンクは公式技術資料の参照先であるが、登録されたすべての型式の配管条件を確認済みという意味ではない。E/F/C/MF/Twin Driveの世代、冷媒、接続構成を個別に照合し、別シリーズの配管径表や増径条件を流用しない。ハイブリッド系統はGHP単独のツリーで構成を正しく表現できるかも別途確認する。

## 共通の実装上の注意

両社の各エンジンでは、コード上の登録冷媒・型式だけでメーカー公式の適用条件が確定したとは扱わないこと。シリーズ別の公式資料が確認できるまで、管径、分岐部材、BOM、許容配管長を確定設計値として使用しない。

現行GHP 4社エンジンのサイズアップ処理には、入力経路長90m超または手動指定時に室外機ノードだけが増径され、配管区間やBOMに反映されない既知不具合がある。閾値だけを変更する修正は行わず、次の情報をそろえてから実装する。

1. 完全一致する型式、冷媒、シリーズ世代、配管方式。
2. 実長／相当長の定義と継手相当長の扱い。
3. 増径の閾値（以上／超）、対象管種、対象区間、サイズアップ段階。
4. 容量比率・分岐後の管径制限など、同時に適用される条件。
5. 公式図表に基づく閾値境界テストと、管径・配管長・BOMの整合テスト。

関連:
- [GHP主管サイズアップ監査メモ](./ghp-main-pipe-size-up-audit.md)
- [GHPシリーズ・型式照合台帳](./ghp-series-model-verification.md)
- [修正・検証 作業手順書](./repair-work-procedure.md)
