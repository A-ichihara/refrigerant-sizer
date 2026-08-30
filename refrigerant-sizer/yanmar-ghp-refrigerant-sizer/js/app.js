/**
 * Application Entrypoint (Yanmar GHP Edition)
 */

document.addEventListener('DOMContentLoaded', () => {
    const engine = new RefrigerantSizerEngine();
    const ui = new RefrigerantSizerUI(engine);
    ui.setActiveNode("root");
    console.log("Yanmar GHP Piping Sizer initialized successfully.");
});
