(function(){
  function toggleToolsGuiProxy() {
    if (typeof window.toggleToolsGui === 'function') window.toggleToolsGui();
  }

  function installHotkey() {
    document.addEventListener('keydown', e => {
      if (e.key === 'Shift' && e.location === 2) {
        toggleToolsGuiProxy();
      }
    });
  }

  function bootstrapToolsGuiBindings() {
    window.CSEToolsGui = {
      toggleToolsGuiProxy,
      installHotkey,
    };
    installHotkey();
  }

  bootstrapToolsGuiBindings();
})();
