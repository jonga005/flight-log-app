'use strict';
// USFS Exhibit 30: fill the bundled template PDF with logbook-derived totals
// (pdf-lib). Field names and formulas are identical to the original
// generateExhibit30. Personal/employment text fields come from the
// 'exhibit30Data' setting and overwrite the template only when non-blank.
const Exhibit30 = {
  templateBytes: null,
  templateLabel: '',
  loading: false,
  AIRCRAFT_OPTIONS: ['C-130', 'B-737'],

  // Personal fields (settings key 'exhibit30Data') -> PDF text field names.
  PERSONAL_FIELDS: [
    { key: 'name', label: '1 Name', pdf: '1 Name Last First Middle Initial' },
    { key: 'email', label: '2 Email', pdf: '2 Email Address' },
    { key: 'phone', label: '3 Telephone', pdf: '3 Telephone No' },
    { key: 'address', label: '4 Home address', pdf: '4 Home Address Street City State  Zip Code', span: true },
    { key: 'employer1', label: '5 Employed by', pdf: '5 Employed by' },
    { key: 'employer1_addr', label: '6 Employer address', pdf: '6 Address', span: true },
    { key: 'employer1_phone', label: '7 Employer phone', pdf: '7 Telephone No' },
    { key: 'employer1_since', label: '8 Employed since', pdf: '8 Employed Since' },
    { key: 'employer2', label: '9 Previous employer', pdf: '9 Previous Employer' },
    { key: 'employer2_addr', label: '10 Address', pdf: '10 Address', span: true },
    { key: 'employer2_phone', label: '11 Telephone', pdf: '11 Telephone No' },
    { key: 'employer2_since', label: '12 Employed since', pdf: '12 Employed Since' },
    { key: 'employer3', label: '13 Previous employer', pdf: '13 Previous Employer' },
    { key: 'employer3_addr', label: '14 Address', pdf: '14 Address', span: true },
    { key: 'employer3_phone', label: '15 Telephone', pdf: '15 Telephone No' },
    { key: 'employer3_since', label: '16 Employed since', pdf: '16 Employed Since' },
    { key: 'airman_number', label: 'Airman certificate no.', pdf: 'Number' },
    { key: 'type_ratings', label: 'Type ratings', pdf: 'Text9' },
    { key: 'medical_class', label: 'Medical class', pdf: 'Text20' },
    { key: 'medical_date', label: 'Medical date', pdf: 'Text19' },
    { key: 'ac1', label: 'Box 19 aircraft 1', pdf: '1' },
    { key: 'ac2', label: 'Box 19 aircraft 2', pdf: '2' },
    { key: 'ac3', label: 'Box 19 aircraft 3', pdf: '3' },
    { key: 'faa35_ac', label: 'Box 35 make/model', pdf: 'MakeModel AC35' },
    { key: 'faa35_date', label: 'Box 35 date', pdf: 'Text39' },
    { key: 'faa36_ac', label: 'Box 36 make/model', pdf: 'MakeModel AC36' },
    { key: 'faa36_date', label: 'Box 36 date', pdf: 'Text40' },
    { key: 'prev_approval_date', label: '39 Previous USFS card approval', pdf: '39 Date of Previous USFS Card Approval' },
    { key: 'last_flight_check_date', label: '40 Last USFS flight check', pdf: '40 Date of Last USFS Flight Check' },
    { key: 'airtanker_missions', label: '43 Airtanker missions', pdf: '43 Airtanker Missions in the Last 12 Months Specify AKC AKP Etc' },
    { key: 'contract_nos', label: 'Contract numbers', pdf: 'Text37', span: true }
  ],

  $(id) { return document.getElementById(id); },

  init() {
    this.$('btn-e30-generate').addEventListener('click', () => this.generate());
    this.$('e30-template-file').addEventListener('change', e => this.loadCustomTemplate(e.target));
    this.$('e30-personal-toggle').addEventListener('click', () => {
      const b = this.$('e30-personal-body');
      b.hidden = !b.hidden;
      this.$('e30-personal-toggle').innerHTML = (b.hidden ? '&#9654;' : '&#9660;') + ' Personal / employment fields (saved with your settings)';
    });
    this.$('btn-e30-save-personal').addEventListener('click', () => this.savePersonal());
    this.buildPersonalForm();
  },

  render() {
    if (!this.templateBytes && !this.loading) this.loadBundledTemplate();
  },

  setTemplateStatus(msg, ok) {
    const s = this.$('e30-template-status');
    s.textContent = msg;
    s.style.color = ok === true ? 'var(--green)' : ok === false ? 'var(--red)' : '';
  },

  async loadBundledTemplate() {
    this.loading = true;
    try {
      this.templateBytes = await Data.getAsset('exhibit30_template.pdf');
      this.templateLabel = 'bundled template';
      this.setTemplateStatus('Bundled template loaded (' + Math.round(this.templateBytes.length / 1024) + ' KB).', true);
    } catch (e) {
      this.setTemplateStatus('Could not load bundled template (' + e.message + '). Choose a template file.', false);
    } finally { this.loading = false; }
  },

  loadCustomTemplate(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      this.templateBytes = new Uint8Array(e.target.result);
      this.templateLabel = file.name;
      this.setTemplateStatus('Template loaded: ' + file.name, true);
    };
    reader.readAsArrayBuffer(file);
  },

  // ---- personal fields ----------------------------------------------------
  personal() { return Object.assign({}, Data.getSetting('exhibit30Data', {})); },

  buildPersonalForm() {
    const p = this.personal();
    this.$('e30-personal-form').innerHTML = this.PERSONAL_FIELDS.map(f =>
      '<div class="form-group' + (f.span ? ' span2' : '') + '"><label>' + escapeHtml(f.label) + '</label><input type="text" id="e30p-' + f.key + '" value="' + escapeHtml(p[f.key] || '') + '"></div>'
    ).join('');
  },

  async savePersonal() {
    const p = this.personal();
    this.PERSONAL_FIELDS.forEach(f => { p[f.key] = this.$('e30p-' + f.key).value.trim(); });
    try {
      await Data.setSetting('exhibit30Data', p);
      this.$('e30-personal-status').textContent = 'Saved.';
    } catch (e) { this.$('e30-personal-status').textContent = 'Save failed: ' + e.message; }
  },

  // ---- computation (pure) -------------------------------------------------
  // Returns { fields: {pdfFieldName: string}, drops12, box31 } for the given
  // entries, aircraft selection ('C-130' | 'B-737' | 'Both') and reference date.
  compute(allData, selectedAC, now) {
    now = now || new Date();
    const date12mo = ymd(new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()));
    const date90d = ymd(new Date(now.getTime() - 90 * 86400000));
    const date60d = ymd(new Date(now.getTime() - 60 * 86400000));
    const sm = (data, key) => sumKey(data, key);
    const last12 = allData.filter(r => r.date >= date12mo);
    const last90 = allData.filter(r => r.date >= date90d);
    const last60 = allData.filter(r => r.date >= date60d);

    // NOTE: the original app used /b.?737/ here, which never matched the
    // logbook's "B733" code, so box 31 for B-737 was always 0. Aligned with
    // the import module's 737 rule (B733 / B737 / 737).
    const acPatterns = {
      'C-130': r => /c.?130|l.?382/i.test(r.aircraft || ''),
      'B-737': r => /b.?73[37]|737/i.test(r.aircraft || '')
    };
    const picHrs90 = acName => {
      const matcher = acPatterns[acName] || (r => (r.aircraft || '').includes(acName));
      return Math.round(last90.filter(r => r.pic > 0 && matcher(r)).reduce((s, r) => s + (r.pic || 0), 0) * 10) / 10;
    };
    const box31 = selectedAC === 'Both'
      ? picHrs90(this.AIRCRAFT_OPTIONS[0]) + '/' + picHrs90(this.AIRCRAFT_OPTIONS[1])
      : String(picHrs90(selectedAC));
    const drops12 = Math.round(sm(last12, 'drops'));
    const R = v => String(Math.round(v));

    const fields = {
      'Hours20 Total Pilot Time Airplane': R(sm(allData, 'total_time')),
      'Hours21 PilotinCommand PIC Airplane': R(sm(allData, 'pic')),
      'Hours22 Total PIC Multiengine over 12500lbs': R(sm(allData, 'over_12500')),
      'Hours23 Total PIC Night': R(sm(allData, 'night')),
      'Hours24 Total PIC Instrument': R(sm(allData, 'actual_inst') + sm(allData, 'sim_inst')),
      'Hours25 Total PIC Instrument Actual': R(sm(allData, 'actual_inst')),
      'Hours26 Total Flight Time Last 12 Months': R(sm(last12, 'total_time')),
      'Hours27 PIC Airplane Last 12 Months': R(sm(last12, 'pic')),
      // Boxes 28 and 29 intentionally map to the >12,500 lb total (long-standing practice).
      'Hours28 Total Mountainous Terrain': R(sm(allData, 'over_12500')),
      'Hours29 PIC Low Level Below 500 AGL': R(sm(allData, 'over_12500')),
      'Hours30 Night TO  Lndgs Previous 90 Days': R(sm(last90, 'night_landings')),
      'Hours31 PIC Make and Model Previous 90 Days': box31,
      'Hours32 Left Seat TO  Lndgs Previous 60 Days': R(sm(last60, 'day_landings') + sm(last60, 'night_landings')),
      // Box 19 aircraft totals: Text14/Text15 = A/C 1 (C-130) total / PIC; Text146/Text16 = A/C 2 (B-737)
      'Text14': R(sm(allData, 'c130_total')),
      'Text15': R(sm(allData, 'c130_pic')),
      'Text146': R(sm(allData, 'b737_total')),
      'Text16': R(sm(allData, 'b737_pic')),
      // Box 33 PIC single engine land, Box 34 PIC multi-engine land
      'Text24': R(sm(allData, 'single_engine')),
      'Text26': R(sm(allData, 'pic') - sm(allData, 'single_engine'))
    };
    return { fields, drops12, box31 };
  },

  // ---- PDF fill ---------------------------------------------------------------
  async fill(templateBytes, computed, personal, mode) {
    const pdfDoc = await PDFLib.PDFDocument.load(templateBytes);
    const form = pdfDoc.getForm();
    const setTxt = (name, value) => { try { form.getTextField(name).setText(String(value)); } catch (e) { /* field missing in this template */ } };

    // personal fields first (only non-blank values overwrite the template)
    if (personal) {
      this.PERSONAL_FIELDS.forEach(f => { const v = personal[f.key]; if (v !== undefined && v !== null && String(v).trim() !== '') setTxt(f.pdf, v); });
    }
    Object.keys(computed.fields).forEach(name => setTxt(name, computed.fields[name]));

    // Airtanker missions: append drops count when the field has text but no number yet
    const missionsField = '43 Airtanker Missions in the Last 12 Months Specify AKC AKP Etc';
    let missions = '';
    try { missions = form.getTextField(missionsField).getText() || ''; } catch (e) { /* ignore */ }
    if (computed.drops12 > 0 && missions && !missions.match(/\d/)) setTxt(missionsField, missions.trim() + ' ' + computed.drops12);

    if (mode === 'flat') form.flatten();
    return pdfDoc.save();
  },

  async generate() {
    if (!this.templateBytes) { App.toast('Template not loaded yet. Wait a moment or choose a template file.', 'error'); return; }
    if (typeof PDFLib === 'undefined') { App.toast('PDF library not loaded.', 'error'); return; }
    const selectedAC = this.$('e30-aircraft-select').value;
    const mode = this.$('e30-output-mode').value;
    const status = this.$('e30-status');
    status.textContent = 'Generating…';
    try {
      const computed = this.compute(App.state.all, selectedAC, new Date());
      const pdfBytes = await this.fill(this.templateBytes, computed, this.personal(), mode);
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const preview = this.$('exhibit30-preview');
      preview.classList.add('has-pdf');
      preview.innerHTML = '<iframe src="' + url + '" title="Exhibit 30 preview"></iframe>';
      const acLabel = selectedAC === 'Both' ? 'All' : selectedAC.replace('-', '');
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Gallaher_Exhibit30_' + acLabel + '_' + ymd(new Date()) + '.pdf';
      document.body.appendChild(a); a.click(); a.remove();
      status.textContent = 'Generated from ' + this.templateLabel + ' (box 31: ' + computed.box31 + ').';
    } catch (e) {
      status.textContent = 'Failed: ' + e.message;
      App.toast('Exhibit 30 generation failed: ' + e.message, 'error');
    }
  }
};
