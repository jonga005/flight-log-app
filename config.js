// Flight Log runtime configuration (committed).
//
// To point the app at a real Supabase project without committing secrets,
// create `config.local.js` next to this file (it is gitignored via *.local.js)
// containing e.g.:
//
//   window.APP_CONFIG = Object.assign(window.APP_CONFIG || {}, {
//     mode: 'supabase',
//     supabaseUrl: 'https://xxxx.supabase.co',
//     supabaseAnonKey: 'eyJ...'
//   });
//
// index.html loads config.local.js after this file; a 404 for it is harmless.
window.APP_CONFIG = {
  mode: 'local',                 // 'local' (dev, JSON backup + localStorage overlay) | 'supabase'
  supabaseUrl: '',
  supabaseAnonKey: '',
  localDataUrl: 'backups/2026-09-14_master_raw.json',
  pilotName: 'John H Gallaher'
};
