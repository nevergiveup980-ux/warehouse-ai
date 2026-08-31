// RUNLU stable release loader.
// qrcode.js requests this file with a unique cache-busting query on every page load.
// Keep historical business hotfix files immutable when possible; the release token below
// guarantees that any intentionally revised layer is fetched again for this release.
(() => {
  const RELEASE='110';
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
    'build097-flooring-po-handoff.js',
    'build098-flooring-handoff-after-access.js',
    'build099-job-specific-routing.js',
    'build100-flooring-handoff-routing-authority.js',
    'build101-job-specific-banner-dedupe.js',
    'build102-flooring-po-item-handoff.js',
    'build103-flooring-po-prefill-stability.js',
    'build104-flooring-central-task-authority.js',
    'build105-item-inventory-transfer.js',
    'build106-hide-zero-inventory.js',
    'build107-scan-gateway-stop-snap.js',
    'build108-carpet-sample-checkout.js',
    'build109-carpet-label-original-style.js',
    'build110-supplier-pickup-workflow.js',
    'build082-version-authority.js'
  ];

  document.documentElement.setAttribute('data-runlu-loaded-build',RELEASE);
  window.__RUNLU_LOADED_RELEASE__=RELEASE;

  document.write(files.map(src=>`<script src="${src}?r=${RELEASE}"><\/script>`).join(''));
})();
