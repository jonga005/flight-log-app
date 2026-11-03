'use strict';
// Data layer facade. All UI modules talk to `Data`; the adapter (LocalAdapter
// or SupabaseAdapter, chosen by window.APP_CONFIG.mode) does the persistence.
//
// Entry shape: { id, created_at, updated_at, deleted_at, source, ...32 fields }
// Settings are loaded once into memory; getSetting is synchronous and
// setSetting writes through to the adapter.

const META_KEYS = ['id', 'created_at', 'updated_at', 'deleted_at', 'source'];

function makeUuid() {
  if (window.crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // RFC4122 v4 fallback (non-secure contexts such as file://)
  const b = new Uint8Array(16);
  if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.random() * 256 | 0;
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
  return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
}

function toEntry(raw) {
  const e = normalizeFields(raw);
  META_KEYS.forEach(k => { e[k] = (raw && raw[k] !== undefined) ? raw[k] : null; });
  return e;
}

function entryByDate(a, b) {
  if (a.date < b.date) return -1;
  if (a.date > b.date) return 1;
  return String(a.created_at || '').localeCompare(String(b.created_at || ''));
}

// ---------------------------------------------------------------------------
// LocalAdapter: dev mode. Base rows come from the JSON backup; edits live in a
// localStorage overlay so they survive reloads without touching the backup.
// ---------------------------------------------------------------------------
const LocalAdapter = {
  STORAGE_KEY: 'flightlog_dev_overlay',
  base: [],
  baseExported: '',
  overlay: null,

  emptyOverlay() { return { added: {}, updated: {}, deleted: {}, settings: {}, history: {} }; },

  async init() {
    this.overlay = this.emptyOverlay();
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (raw) this.overlay = Object.assign(this.emptyOverlay(), JSON.parse(raw));
    } catch (e) { console.warn('LocalAdapter: could not read overlay', e); }
    const url = (window.APP_CONFIG && APP_CONFIG.localDataUrl) || 'backups/2026-09-14_master_raw.json';
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('Could not load ' + url + ' (' + res.status + ')');
    const json = await res.json();
    this.base = Array.isArray(json) ? json : (json.rows || []);
    this.baseExported = json.exported ? (json.exported + 'T00:00:00.000Z') : new Date(0).toISOString();
  },

  persist() {
    try { localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.overlay)); }
    catch (e) { console.error('LocalAdapter: could not persist overlay', e); }
  },

  async loadEntries() {
    const ov = this.overlay;
    const out = this.base.map((row, i) => {
      const id = 'hist-' + i;
      let e = Object.assign({}, row, {
        id, source: 'historical', created_at: this.baseExported, updated_at: this.baseExported, deleted_at: null
      });
      if (ov.updated[id]) e = Object.assign({}, ov.updated[id]);
      if (ov.deleted[id]) e.deleted_at = ov.deleted[id];
      return e;
    });
    Object.keys(ov.added).forEach(id => {
      const e = Object.assign({}, ov.added[id]);
      if (ov.deleted[id]) e.deleted_at = ov.deleted[id];
      out.push(e);
    });
    return out;
  },

  async loadSettings() { return Object.assign({}, this.overlay.settings); },

  pushHistory(id, action, before, after) {
    const h = this.overlay.history;
    if (!h[id]) h[id] = [];
    h[id].push({ changed_at: new Date().toISOString(), action, before, after });
  },

  async insert(e) {
    this.overlay.added[e.id] = e;
    this.pushHistory(e.id, 'create', null, e);
    this.persist();
  },
  async insertMany(list) {
    list.forEach(e => { this.overlay.added[e.id] = e; this.pushHistory(e.id, 'create', null, e); });
    this.persist();
  },
  async update(e, before) {
    if (this.overlay.added[e.id]) this.overlay.added[e.id] = e;
    else this.overlay.updated[e.id] = e;
    this.pushHistory(e.id, 'update', before, e);
    this.persist();
  },
  async remove(e, before) {
    this.overlay.deleted[e.id] = e.deleted_at;
    this.pushHistory(e.id, 'delete', before, e);
    this.persist();
  },
  async history(id) { return (this.overlay.history[id] || []).slice(); },
  async saveSetting(key, value) {
    this.overlay.settings[key] = value;
    this.persist();
  },
  // Dev helper: wipe all local edits.
  resetOverlay() { this.overlay = this.emptyOverlay(); this.persist(); }
};

// ---------------------------------------------------------------------------
// SupabaseAdapter: production. Tables: entries, entry_history, settings
// (see supabase/schema.sql). Uses supabase-js v2 UMD (window.supabase).
// ---------------------------------------------------------------------------
const SupabaseAdapter = {
  client: null,
  user: null,
  PAGE: 1000,

  async init() {
    const cfg = window.APP_CONFIG || {};
    if (!window.supabase || typeof supabase.createClient !== 'function') throw new Error('supabase-js not loaded');
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) throw new Error('APP_CONFIG.supabaseUrl / supabaseAnonKey not set (see config.js)');
    this.client = supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    const { data, error } = await this.client.auth.getSession();
    if (error) console.warn('getSession', error);
    this.user = data && data.session ? data.session.user : null;
  },

  auth: {
    getUser() { return SupabaseAdapter.user; },
    async signInPassword(email, password) {
      const { data, error } = await SupabaseAdapter.client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      SupabaseAdapter.user = data.user;
      return data.user;
    },
    async signInGoogle() {
      const { error } = await SupabaseAdapter.client.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin + window.location.pathname }
      });
      if (error) throw error;
    },
    async signOut() {
      await SupabaseAdapter.client.auth.signOut();
      SupabaseAdapter.user = null;
    },
    onChange(cb) {
      SupabaseAdapter.client.auth.onAuthStateChange((event, session) => {
        SupabaseAdapter.user = session ? session.user : null;
        cb(event, session);
      });
    }
  },

  rowOf(e) {
    const row = normalizeFields(e);
    row.id = e.id;
    row.source = e.source || 'manual';
    row.created_at = e.created_at;
    row.updated_at = e.updated_at;
    row.deleted_at = e.deleted_at || null;
    row.owner = this.user.id;
    return row;
  },

  fromRow(row) {
    // numeric columns come back as strings from PostgREST; normalizeFields coerces.
    const e = normalizeFields(row);
    META_KEYS.forEach(k => { e[k] = row[k] === undefined ? null : row[k]; });
    if (e.date && e.date.length > 10) e.date = e.date.substring(0, 10);
    return e;
  },

  async loadEntries() {
    const out = [];
    let from = 0;
    for (;;) {
      const { data, error } = await this.client.from('entries')
        .select('*')
        .is('deleted_at', null)
        .order('date', { ascending: true })
        .order('created_at', { ascending: true })
        .range(from, from + this.PAGE - 1);
      if (error) throw error;
      data.forEach(r => out.push(this.fromRow(r)));
      if (data.length < this.PAGE) break;
      from += this.PAGE;
    }
    return out;
  },

  async loadSettings() {
    const { data, error } = await this.client.from('settings').select('key,value');
    if (error) throw error;
    const s = {};
    (data || []).forEach(r => { s[r.key] = r.value; });
    return s;
  },

  async writeHistory(entryId, action, before, after) {
    const { error } = await this.client.from('entry_history').insert({
      entry_id: entryId, action, before: before || null, after: after || null, owner: this.user.id
    });
    if (error) console.error('entry_history insert failed', error);
  },

  async insert(e) {
    const { error } = await this.client.from('entries').insert(this.rowOf(e));
    if (error) throw error;
    await this.writeHistory(e.id, 'create', null, e);
  },

  async insertMany(list) {
    for (let i = 0; i < list.length; i += 200) {
      const chunk = list.slice(i, i + 200);
      const { error } = await this.client.from('entries').insert(chunk.map(e => this.rowOf(e)));
      if (error) throw error;
      const { error: herr } = await this.client.from('entry_history').insert(
        chunk.map(e => ({ entry_id: e.id, action: 'create', before: null, after: e, owner: this.user.id }))
      );
      if (herr) console.error('entry_history insert failed', herr);
    }
  },

  async update(e, before) {
    const row = this.rowOf(e);
    delete row.id; delete row.created_at; delete row.owner;
    const { error } = await this.client.from('entries').update(row).eq('id', e.id);
    if (error) throw error;
    await this.writeHistory(e.id, 'update', before, e);
  },

  async remove(e, before) {
    const { error } = await this.client.from('entries')
      .update({ deleted_at: e.deleted_at, updated_at: e.updated_at }).eq('id', e.id);
    if (error) throw error;
    await this.writeHistory(e.id, 'delete', before, e);
  },

  async history(id) {
    const { data, error } = await this.client.from('entry_history')
      .select('changed_at,action,before,after').eq('entry_id', id).order('changed_at', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async getAsset(path) {
    const { data, error } = await this.client.storage.from('assets').download(path);
    if (error) throw new Error(error.message || String(error));
    return new Uint8Array(await data.arrayBuffer());
  },

  async saveSetting(key, value) {
    const { error } = await this.client.from('settings')
      .upsert({ owner: this.user.id, key, value }, { onConflict: 'owner,key' });
    if (error) throw error;
  }
};

// ---------------------------------------------------------------------------
// Facade
// ---------------------------------------------------------------------------
const Data = (function () {
  let adapter = null;
  let mode = 'local';
  let entries = [];
  let settings = {};

  async function init() {
    mode = (window.APP_CONFIG && APP_CONFIG.mode) === 'supabase' ? 'supabase' : 'local';
    adapter = mode === 'supabase' ? SupabaseAdapter : LocalAdapter;
    await adapter.init();
  }

  async function load() {
    entries = (await adapter.loadEntries()).map(toEntry);
    settings = await adapter.loadSettings();
  }

  function all() {
    return entries.filter(e => !e.deleted_at).sort(entryByDate);
  }

  function get(id) { return entries.find(e => e.id === id) || null; }

  function stamp(fields, source) {
    const now = new Date().toISOString();
    return toEntry(Object.assign(normalizeFields(fields), {
      id: makeUuid(), created_at: now, updated_at: now, deleted_at: null, source: source || 'manual'
    }));
  }

  async function add(fields, source) {
    const e = stamp(fields, source);
    await adapter.insert(e);
    entries.push(e);
    return e;
  }

  async function addMany(list, source) {
    const stamped = list.map(f => stamp(f, source || 'import'));
    await adapter.insertMany(stamped);
    stamped.forEach(e => entries.push(e));
    return stamped;
  }

  async function update(id, fields) {
    const cur = get(id);
    if (!cur) throw new Error('Entry not found: ' + id);
    const before = Object.assign({}, cur);
    // partial update: only keys present in `fields` change
    const norm = normalizeFields(fields), patch = {};
    FIELDS.forEach(f => { if (Object.prototype.hasOwnProperty.call(fields, f.key)) patch[f.key] = norm[f.key]; });
    const e = toEntry(Object.assign({}, cur, patch, { id, updated_at: new Date().toISOString() }));
    await adapter.update(e, before);
    entries[entries.indexOf(cur)] = e;
    return e;
  }

  async function remove(id) {
    const cur = get(id);
    if (!cur) throw new Error('Entry not found: ' + id);
    const before = Object.assign({}, cur);
    const now = new Date().toISOString();
    const e = Object.assign({}, cur, { deleted_at: now, updated_at: now });
    await adapter.remove(e, before);
    entries[entries.indexOf(cur)] = e;
    return e;
  }

  async function history(id) { return adapter.history(id); }

  function getSetting(key, dflt) {
    return settings[key] === undefined || settings[key] === null ? dflt : settings[key];
  }
  async function setSetting(key, value) {
    settings[key] = value;
    await adapter.saveSetting(key, value);
  }

  function exportAll() {
    return {
      exported: new Date().toISOString(),
      app: 'flight-log',
      count: all().length,
      fields: FIELDS.map(f => ({ key: f.key, label: f.label, type: f.type })),
      rows: all().map(e => Object.assign({}, e))
    };
  }

  // Binary assets (e.g. the Exhibit 30 template). Supabase mode reads from the
  // private 'assets' storage bucket (authenticated); local mode reads assets/.
  async function getAsset(path) {
    if (adapter && typeof adapter.getAsset === 'function') return adapter.getAsset(path);
    const res = await fetch('assets/' + path);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return new Uint8Array(await res.arrayBuffer());
  }

  return {
    init, load, all, get, add, addMany, update, remove, history,
    getSetting, setSetting, exportAll, getAsset,
    mode: () => mode,
    adapter: () => adapter,
    auth: () => (adapter && adapter.auth) || null
  };
})();
