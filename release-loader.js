// RUNLU stable release loader.
// qrcode.js requests this file with a unique cache-busting query on every page load.
// Keep historical business hotfix files immutable when possible; the release token below
// guarantees that any intentionally revised layer is fetched again for this release.
(() => {
  const RELEASE='096';
  const files=[
    'build062-hotfix.js',
    'build063-hotfix.js',
    'build064-hotfix.js',
    'build065-hotfix.js',
    'build066-hotfix.js',
    'build067-hotfix.js',
    'build068-hotfix.js',
    'build069-hotfix.js',
    'build070-hotfix.js',
    'build070-guard.js',
    'build071-hotfix.js',
    'build072-hotfix.js',
    'build072-adoption.js',
    'build072-carpet-identity.js',
    'build073-hotfix.js',
    'build074-hotfix.js',
    'build075-hotfix.js',
    'build078-hotfix.js',
    'build079-hotfix.js',
    'build080-hotfix.js',
    'build081-hotfix.js',
    'build083-hotfix.js',
    'build084-hotfix.js',
    'build085-hotfix.js',
    'build087-hotfix.js',
    'build088-hotfix.js',
    'build089-cache-coherence.js',
    'build090-conflict-isolated-refresh.js',
    'build091-carpet-edit-duplicate-guard.js',
    'build092-return-child-idempotency.js',
    'build093-exact-carpet-target.js',
    'build094-supplier-pickup.js',
    'build095-stock-receiving-accounting.js',
    'build096-flooring-return.js',
    'build082-version-authority.js'
  ];

  document.documentElement.setAttribute('data-runlu-loaded-build',RELEASE);
  window.__RUNLU_LOADED_RELEASE__=RELEASE;

  document.write(files.map(src=>`<script src="${src}?r=${RELEASE}"><\/script>`).join(''));
})();