/**
 * Application Entrypoint (パナソニック版)
 */

document.addEventListener('DOMContentLoaded', () => {
    // 1. 計算エンジンの初期化
    const engine = new RefrigerantSizerEngine();

    // 2. 定期チェック用 SpecChecker の初期化と実行 (30日周期)
    const checker = new SpecChecker(engine);
    window._specChecker = checker;

    const checkResult = checker.runCheck(false); // force=false

    // 3. UIコントローラーの初期化
    const ui = new RefrigerantSizerUI(engine);

    // 4. 初回起動時のルート室外機選択
    ui.setActiveNode("root");

    // 5. 今回のチェックでデータベース定義の更新が検出された場合、履歴ボタンにドット表示
    if (checkResult.executed && checkResult.entry && checkResult.entry.type === 'changed') {
        const btnHistory = document.getElementById('btn-history') || document.getElementById('btn-update-history');
        if (btnHistory) {
            btnHistory.style.position = 'relative';
            const dot = document.createElement('span');
            dot.style.position = 'absolute';
            dot.style.top = '-2px';
            dot.style.right = '-2px';
            dot.style.width = '8px';
            dot.style.height = '8px';
            dot.style.backgroundColor = 'var(--color-danger)';
            dot.style.borderRadius = '50%';
            dot.style.boxShadow = '0 0 6px var(--color-danger)';
            dot.id = 'history-alert-dot';
            btnHistory.appendChild(dot);
            
            // モーダルオープンで警告ドットを削除
            btnHistory.addEventListener('click', () => {
                const activeDot = document.getElementById('history-alert-dot');
                if (activeDot) activeDot.remove();
            }, { once: true });
        }
    }

    console.log("Panasonic HVAC Piping Sizer initialized successfully.");
});
