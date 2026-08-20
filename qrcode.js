// RUNLU stable bootstrap.
// This file is intentionally small and should rarely change. It always asks for the
// release loader with a unique query string, so normal browser HTTP cache cannot pin
// Warehouse OS to an older set of hotfix layers.
(() => {
  if(window.__RUNLU_RELEASE_BOOTSTRAP__) return;
  window.__RUNLU_RELEASE_BOOTSTRAP__=true;
  const bust=Date.now();
  document.write(
    '<script src="qrcode-core.js?runlu-core=1"><\/script>'+
    `<script src="release-loader.js?cb=${bust}"><\/script>`
  );
})();
