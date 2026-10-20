# Carrier エンジン回帰確認メモ

更新日: 2026-10-20

## 対象

- エンジン: `refrigerant-sizer/carrier-refrigerant-sizer/js/engine.js`
- UI: `refrigerant-sizer/carrier-refrigerant-sizer/js/ui.js`
- 回帰テスト: `refrigerant-sizer/tests/carrier-engine-regression.test.cjs`
- CI: `.github/workflows/ghp-regression.yml` 内で Carrier テストも実行

## 修正内容

`processNodeSizing` のFSユニット警告条件を、すべてのシリーズで一律に警告する条件から、`seriesId !== 'super_multi_u_r'` の場合に警告する条件へ変更した。

現行コードのシリーズ定義では、`super_multi_u_r` は「スーパーマルチu（冷暖同時 3管式）」、`super_multi_u_y` は「スーパーマルチu（冷暖切換）」、`super_multi_mini` は「スーパーマルチminiシリーズ」。したがって、冷暖同時3管式でFSユニットを使用する系統に対して、禁止警告が誤って表示される問題を回避する。

## 回帰テスト

実行コマンド:

```sh
node --test refrigerant-sizer/tests/carrier-engine-regression.test.cjs
```

検証項目:

1. エンジンを読み込め、`calculateSystem` が関数として存在する。
2. `super_multi_u_r` ではFSユニット禁止警告が出ない。
3. `super_multi_u_y` ではFSユニット禁止警告が出る。
4. `super_multi_mini` ではFSユニット禁止警告が出る。
5. Carrier UIソースが構文エラーなく解析できる。
6. 代表的な2管式・3管式の系統で、配管長が各エッジにつき一度ずつ集計される。

## CI確認結果

2026-10-20 の GitHub Actions 実行 `39350137755` は成功。Carrier回帰テスト、GHP安全回帰テスト、GHP配管区間テストがすべて成功した。

実行結果: https://github.com/A-ichihara/refrigerant-sizer/actions/runs/39350137755

## 未確認事項・制限

- これらはコードの回帰確認であり、メーカー全機種・全型式への適合保証ではない。
- FSユニットの実際の接続可否、最大接続台数、容量制限、型番選定および配管径は、対象型式・冷媒・適用版の公式設計工事資料と照合する必要がある。
- 今回の配管長テストは代表的なツリー形状に対するものであり、任意の複雑な系統すべてを網羅するものではない。
- 既存エンジンのサイズ表・長配管増径条件について、公式資料に対する全件照合は完了していない。
