/**
 * SpecChecker Test Suite
 * 
 * Node.js もしくはブラウザ環境で動作するテストスクリプトです。
 * 差分検出エンジンおよび30日周期判定のユニットテストを行います。
 */

// モックの localStorage
const mockLocalStorage = {
    store: {},
    getItem(key) {
        return this.store[key] || null;
    },
    setItem(key, val) {
        this.store[key] = String(val);
    },
    removeItem(key) {
        delete this.store[key];
    },
    clear() {
        this.store = {};
    }
};

// Node.js 環境での実行をサポート
if (typeof global !== 'undefined') {
    global.localStorage = mockLocalStorage;
}

// 簡易テストフレームワーク
function assert(condition, message) {
    if (!condition) {
        throw new Error(`❌ ASSERTION FAILED: ${message}`);
    }
}

async function runTests() {
    console.log("=== SpecChecker テスト開始 ===");
    
    // テスト用のエンジンモック
    const mockEngine = {
        SERIES_DATABASE: {
            vrv7_x: {
                name: "VRV7 X",
                outdoorCapacities: [
                    { hp: "8", kw: 22.4, model: "RXYP224D" },
                    { hp: "10", kw: 28.0, model: "RXYP280D" }
                ]
            }
        }
    };

    // SpecChecker インスタンス作成
    const checker = new SpecChecker(mockEngine);
    
    // 1. 初期化状態のテスト
    console.log("テスト1: 初回チェック実行");
    localStorage.clear();
    const res1 = checker.runCheck(true);
    assert(res1.executed === true, "初回は必ず実行されること");
    assert(res1.entry.type === 'initial', "初回のエントリタイプは 'initial' であること");
    assert(localStorage.getItem(checker.SNAPSHOT_KEY) !== null, "スナップショットが保存されていること");
    assert(localStorage.getItem(checker.LAST_CHECK_KEY) !== null, "最終チェック日時が保存されていること");
    
    // 2. 変更なし状態のテスト
    console.log("テスト2: 変更なしでの再チェック");
    const res2 = checker.runCheck(true);
    assert(res2.executed === true, "強制チェック(force=true)なので実行されること");
    assert(res2.entry.type === 'ok', "変更がない場合は 'ok' であること");
    assert(res2.entry.changes.length === 0, "変更リストが空であること");

    // 3. 仕様・品番追加の検知テスト
    console.log("テスト3: 仕様・品番の追加検知");
    mockEngine.SERIES_DATABASE.vrv7_x.outdoorCapacities.push({ hp: "12", kw: 33.5, model: "RXYP335D" });
    const res3 = checker.runCheck(true);
    assert(res3.entry.type === 'changed', "変更が検知されて 'changed' になること");
    assert(res3.entry.changes.some(c => c.type === 'added' && c.path.includes('outdoorCapacities')), "追加変更が検知されること");

    // 4. 仕様・品番変更の検知テスト
    console.log("テスト4: 仕様・品番の値変更検知");
    mockEngine.SERIES_DATABASE.vrv7_x.name = "VRV7 X 最新版";
    const res4 = checker.runCheck(true);
    assert(res4.entry.type === 'changed', "変更が検知されて 'changed' になること");
    const nameChange = res4.entry.changes.find(c => c.path === 'vrv7_x.name');
    assert(nameChange !== undefined, "シリーズ名変更が検知されること");
    assert(nameChange.oldVal === 'VRV7 X' && nameChange.newVal === 'VRV7 X 最新版', "新旧の値が正しいこと");

    // 5. 削除検知のテスト
    console.log("テスト5: 仕様・品番の削除検知");
    delete mockEngine.SERIES_DATABASE.vrv7_x.name;
    const res5 = checker.runCheck(true);
    assert(res5.entry.changes.some(c => c.path === 'vrv7_x.name' && c.type === 'removed'), "削除が検知されること");

    // 6. 30日周期判定のテスト
    console.log("テスト6: 30日周期判定のテスト");
    localStorage.clear();
    // 初回実行
    checker.runCheck(false);
    assert(checker.isCheckDue() === false, "実行直後はチェック不要であること");

    // 29日後の日付をセット
    const lastDate = new Date();
    lastDate.setDate(lastDate.getDate() - 29);
    localStorage.setItem(checker.LAST_CHECK_KEY, lastDate.toISOString());
    assert(checker.isCheckDue() === false, "29日経過時点ではチェック不要であること");

    // 31日後の日付をセット
    lastDate.setDate(lastDate.getDate() - 2); // 計31日前
    localStorage.setItem(checker.LAST_CHECK_KEY, lastDate.toISOString());
    assert(checker.isCheckDue() === true, "31日経過時点ではチェックが必要であること");

    console.log("🚀 全ての SpecChecker ユニットテストにパスしました！");
}

// 実行
if (typeof require !== 'undefined') {
    // Node.js 環境
    const fs = require('fs');
    const path = require('path');
    const engineCode = fs.readFileSync(path.join(__dirname, 'js/engine.js'), 'utf8');
    
    // グローバルスコープに定義
    const vm = require('vm');
    // SpecChecker は localStorage を使うため、vm コンテキストにもモックを渡す
    // （global.localStorage だけでは vm 内のコードから参照できない）
    const context = { window: {}, console, localStorage: mockLocalStorage };
    vm.createContext(context);
    vm.runInContext(engineCode, context);
    
    global.SpecChecker = context.window.SpecChecker;
    
    runTests().catch(err => {
        console.error(err);
        process.exit(1);
    });
} else {
    // ブラウザ環境 (DOMContentLoadedの後に実行)
    window.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
            runTests().catch(err => {
                console.error("Test failed: ", err);
            });
        }, 1000); // UI等のロード後に遅延実行
    });
}
