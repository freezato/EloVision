(function(){
  function scanAndInjectEval() {
    const hasBoard = document.querySelector('chess-board, wc-chess-board, .board-layout-chessboard, [data-fen]');
    if (!hasBoard) return;
    if (typeof window.injectEvalToggleButton === 'function') {
      window.injectEvalToggleButton();
    }
  }

  function bootstrapEvalBindings() {
    window.CSEEvalTools = {
      scanAndInjectEval,
    };
  }

  bootstrapEvalBindings();
})();
