/**
 * Application Entrypoint
 * 
 * Initializes the sizing calculation engine and visual interface controller,
 * then mounts them to the active browser window.
 */

document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize core logic sizer engine
    const engine = new RefrigerantSizerEngine();

    // 2. Initialize SpecChecker for auto periodic updates (30-day interval check)
    const checker = new SpecChecker(engine);
    window._specChecker = checker;

    // 3. Run periodic check
    const checkResult = checker.runCheck(false); // force=false

    // 4. Initialize visual controller with engine
    const ui = new RefrigerantSizerUI(engine);

    // 5. Highlight/Select root outdoor unit on startup
    ui.setActiveNode("root");

    // 6. If specs changed in this check, show warning indicator on history button
    if (checkResult.executed && checkResult.entry && checkResult.entry.type === 'changed') {
        const btnHistory = document.getElementById('btn-update-history');
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
            
            // モーダルを開いたらアラートドットを消す
            btnHistory.addEventListener('click', () => {
                const activeDot = document.getElementById('history-alert-dot');
                if (activeDot) activeDot.remove();
            }, { once: true });
        }
    }

    console.log("Daikin HVAC Piping Sizer initialized successfully.");
});
