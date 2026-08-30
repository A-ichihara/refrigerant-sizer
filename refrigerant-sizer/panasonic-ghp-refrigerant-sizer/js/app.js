/**
 * Application Entrypoint (Panasonic GHP Edition)
 */

document.addEventListener('DOMContentLoaded', () => {
    const engine = new RefrigerantSizerEngine();
    const ui = new RefrigerantSizerUI(engine);
    ui.setActiveNode("root");
    console.log("Panasonic GHP Piping Sizer initialized successfully.");
});
