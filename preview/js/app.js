'use strict';
// Boot, tab routing, theme, auth gate and shared state.
//
// Shared state contract used by the feature modules:
//   App.state.all      all live entries (sorted by date)      -- set by App.refresh()
//   App.state.filtered entries matching the Log Book filters  -- set by Logbook.applyFilters()
// Dashboard and Summary operate on App.state.filtered (as the original app did);
// Report, Exhibit 30 and the currency panel use App.state.all.

const App = {
  state: { all: [], filtered: [], tab: 'logbook' },
  TABS: ['logbook', 'dashboard', 'summary', 'report', 'exhibit30'],

  $(id) { return document.getElementById(id); },

  // ---- theme -----------------------------------------------------------
  theme: {
    KEY: 'flightlog_theme',
    current() { return document.documentElement.getAttribute('data-theme') || 'light'; },
    apply(t) {
      document.documentElement.setAttribute('data-theme', t);
      const b = App.$('theme-toggle');
      if (b) b.textContent = t === 'dark' ? 'Light theme' : 'Dark theme';
    },
    init() {
      let t = null;
      try { t = localStorage.getItem(this.KEY); } catch (e) { /* ignore */ }
      const q = new URL(location.href).searchParams.get('theme'); // ?theme=dark|light (not persisted)
      if (q === 'dark' || q === 'light') t = q;
      if (!t) t = (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
      this.apply(t);
    },
    toggle() {
      const t = this.current() === 'dark' ? 'light' : 'dark';
      this.apply(t);
      try { localStorage.setItem(this.KEY, t); } catch (e) { /* ignore */ }
      if (App._started && App.state.tab === 'dashboard') Dashboard.render();
    }
  },

  // ---- toast / modals --------------------------------------------------
  toast(msg, kind) {
    const el = this.$('toast');
    el.textContent = msg;
    el.className = 'toast' + (kind === 'error' ? ' err' : '');
    el.hidden = false;
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => { el.hidden = true; }, kind === 'error' ? 6000 : 2800);
  },
  openModal(id) { this.$(id).hidden = false; },
  closeModal(id) { this.$(id).hidden = true; },

  // ---- data refresh ----------------------------------------------------
  refresh() {
    this.state.all = Data.all();
    Logbook.onDataChanged();   // repopulates dropdowns, applies filters, renders the table
    this.renderTab(this.state.tab);
  },

  // ---- tabs ------------------------------------------------------------
  showTab(name, updateUrl) {
    if (this.TABS.indexOf(name) < 0) name = 'logbook';
    this.state.tab = name;
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === 'page-' + name));
    if (updateUrl !== false) {
      const url = new URL(location.href);
      url.searchParams.set('tab', name);
      history.replaceState(null, '', url);
    }
    this.renderTab(name);
  },

  // Modules are top-level `const` objects (not window properties), so they
  // are referenced directly here.
  renderTab(name) {
    if (!this._started) return;
    if (name === 'logbook') Logbook.render();
    if (name === 'dashboard') Dashboard.render();
    if (name === 'summary') Summary.render();
    if (name === 'report') Report.render();
    if (name === 'exhibit30') Exhibit30.render();
  },

  // ---- boot ------------------------------------------------------------
  async boot() {
    this.theme.init();
    this.$('app').hidden = false;
    this.$('theme-toggle').addEventListener('click', () => this.theme.toggle());
    this.$('tabs').addEventListener('click', e => {
      const b = e.target.closest('.tab');
      if (b) this.showTab(b.dataset.tab);
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay').forEach(m => { if (!m.hidden) m.hidden = true; });
      }
    });
    if (window.APP_CONFIG && APP_CONFIG.pilotName) this.$('brand-name').textContent = APP_CONFIG.pilotName;

    try {
      await Data.init();
    } catch (e) {
      this.fatal('Could not initialise data layer: ' + e.message);
      return;
    }
    this.$('data-mode').textContent = Data.mode() === 'local' ? 'local dev data' : '';

    if (Data.mode() === 'supabase') {
      const auth = Data.auth();
      const so = this.$('signout-btn');
      so.addEventListener('click', async () => { await auth.signOut(); location.reload(); });
      if (!auth.getUser()) { this.showAuth(auth); return; }
      so.hidden = false;
      this.$('user-email').textContent = auth.getUser().email || '';
      auth.onChange((event, session) => { if (event === 'SIGNED_OUT' || !session) location.reload(); });
    }
    await this.start();
  },

  showAuth(auth) {
    this.$('loading').hidden = true;
    const card = this.$('auth-card');
    card.hidden = false;
    const err = this.$('auth-error');
    this.$('auth-form').addEventListener('submit', async e => {
      e.preventDefault();
      err.textContent = '';
      try {
        await auth.signInPassword(this.$('auth-email').value.trim(), this.$('auth-password').value);
        location.reload();
      } catch (ex) { err.textContent = ex.message || String(ex); }
    });
    this.$('auth-google').addEventListener('click', async () => {
      err.textContent = '';
      try { await auth.signInGoogle(); } catch (ex) { err.textContent = ex.message || String(ex); }
    });
    auth.onChange((event, session) => { if (session) location.reload(); });
  },

  async start() {
    try {
      await Data.load();
    } catch (e) {
      this.fatal('Could not load logbook data: ' + e.message);
      return;
    }
    this.state.all = Data.all();
    Logbook.init();
    Dashboard.init();
    Summary.init();
    Report.init();
    Signature.init();
    ImportMod.init();
    Exhibit30.init();
    this._started = true;
    Logbook.applyFilters();
    this.$('loading').hidden = true;
    this.$('main').hidden = false;
    const tab = new URL(location.href).searchParams.get('tab') || 'logbook';
    this.showTab(tab, false);
  },

  fatal(msg) {
    const el = this.$('loading');
    el.hidden = false;
    el.innerHTML = '<div class="error">' + escapeHtml(msg) + '</div>';
    console.error(msg);
  }
};

// Top-level `const` objects are not window properties; expose them for the
// browser console and the tests in tests/run_ui_tests.html.
Object.assign(window, { App, Data, LocalAdapter, SupabaseAdapter, Logbook, Dashboard, Summary, Report, ImportMod, Exhibit30, Signature, ExportMod });

document.addEventListener('DOMContentLoaded', () => App.boot());
