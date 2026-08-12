# RUNLU Warehouse OS

Production repository for RUNLU Warehouse OS.

- Current stable version: **6.5.3 Build054** (see `version.json`)
- Production site: `warehouse.runlu.ca`
- GitHub Pages entry point: `index.html`
- Cloud/AI gateway worker: `worker.js`
- Database bootstrap/reference: `supabase_setup.sql`
- Voice companion assets: `voice/`

## Repository layout

- `index.html` — current production Warehouse OS application
- `version.json` — current release/version metadata
- `worker.js` / `worker.min.js` — server-side gateway worker sources
- `voice/` — voice companion application
- `docs/history/builds/` — historical build/release notes
- `docs/history/version-notes/` — historical V5/V6 update notes
- `docs/setup/` — cloud and voice setup notes
- `archive/legacy-builds/` — superseded app snapshots kept for reference

## Maintenance rule

Keep the repository root focused on files required by the current deployed application. Historical notes and superseded snapshots belong under `docs/` or `archive/`.

For future changes: use a feature/release branch, validate there, open a pull request, then merge to `main` after review.
