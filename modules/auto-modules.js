(function(){
  function bootstrapAutoBindings() {
    window.CSEAutoModules = {
      onUrlChanged() {
        if (typeof window.clearPremoveSchedule === 'function') window.clearPremoveSchedule();
        if (typeof window.clearAutoPlaySchedule === 'function') window.clearAutoPlaySchedule(true);
        if (window.isAutoPlayEnabled && typeof window.performAutoPlayTick === 'function') window.performAutoPlayTick();
      }
    };
  }

  bootstrapAutoBindings();
})();
