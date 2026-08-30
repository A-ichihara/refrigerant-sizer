/**
 * Application Entrypoint (Aisin GHP Edition)
 */

document.addEventListener('DOMContentLoaded', () => {
    const engine = new RefrigerantSizerEngine();
    const ui = new RefrigerantSizerUI(engine);
    ui.setActiveNode("root");
    console.log("Aisin GHP Piping Sizer initialized successfully.");
});
