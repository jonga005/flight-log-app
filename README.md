# Flight Log (app)

Static pilot logbook web app: plain HTML/CSS/JS, no build step. Data lives in Supabase (Postgres + auth + private storage), so nothing personal is in this repository. The anon key in `config.js` is public by design; row-level security restricts every table to the signed-in owner.

- `js/data.js` - data facade with `LocalAdapter` (dev, JSON file) and `SupabaseAdapter`.
- `js/logbook.js`, `dashboard.js`, `summary.js`, `report.js`, `import.js`, `exhibit30.js`, `signature.js`, `export.js` - the five tabs plus import/export.
- `vendor/` - Chart.js, SheetJS, pdf-lib, supabase-js (bundled, no CDN).
- `supabase/schema.sql` - database schema and RLS policies.
- `tests/` - open `tests/run_tests.html` and `tests/run_ui_tests.html` over HTTP.

Local dev: `python -m http.server 8080` in this folder, then http://127.0.0.1:8080/. Put `mode:'local'` in `config.local.js` to use `backups/..._raw.json` instead of Supabase.

Backups and the nightly export job live in a separate private repository.
