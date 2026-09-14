// Flight Log runtime configuration (committed).
//
// The Supabase anon key below is public by design: every visitor's browser
// uses it to reach the API, and row-level security (see supabase/schema.sql)
// restricts all data to the signed-in owner. Anonymous requests return nothing.
//
// For local development create `config.local.js` next to this file (it is
// gitignored via *.local.js), e.g. to run against the JSON dataset instead:
//
//   window.APP_CONFIG = Object.assign(window.APP_CONFIG || {}, { mode: 'local' });
//
// index.html loads config.local.js after this file; a 404 for it is harmless.
window.APP_CONFIG = {
  mode: 'supabase',              // 'local' (dev, JSON backup + localStorage overlay) | 'supabase'
  supabaseUrl: 'https://zwqpupzuvndeeommueyc.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp3cXB1cHp1dm5kZWVvbW11ZXljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk0MDU0MzEsImV4cCI6MjEwNDk4MTQzMX0.uf8NvFGfCognYuzBtVugkEGNhuO2It4dUieLJHvTsfk',
  localDataUrl: 'backups/2026-09-14_master_raw.json',
  pilotName: 'John H Gallaher'
};
