'use strict';
// Logbook field definitions. Keys are the canonical column names used in the
// data store, exports and the Supabase schema. Do not rename.
const FIELDS = [
  {key:'date',label:'Date',type:'date',hideable:false},
  {key:'tail_number',label:'Tail #',type:'text',hideable:false},
  {key:'aircraft',label:'Aircraft',type:'text',hideable:false},
  {key:'route_from',label:'From',type:'text',hideable:false},
  {key:'route_to',label:'To',type:'text',hideable:false},
  {key:'total_time',label:'Total Time',type:'num',hideable:false},
  {key:'single_engine',label:'Single',type:'num',hideable:true},
  {key:'multi_engine',label:'Multi',type:'num',hideable:true},
  {key:'jet',label:'Jet',type:'num',hideable:true},
  {key:'turbo_prop',label:'Turbo Prop',type:'num',hideable:true},
  {key:'actual_inst',label:'Act Inst',type:'num',hideable:true},
  {key:'sim_inst',label:'Sim Inst',type:'num',hideable:true},
  {key:'approaches',label:'Appr',type:'num',hideable:true},
  {key:'night',label:'Night',type:'num',hideable:true},
  {key:'night_landings',label:'Ngt Ldg',type:'num',hideable:true},
  {key:'day_landings',label:'Day Ldg',type:'num',hideable:true},
  {key:'cross_country',label:'XC',type:'num',hideable:true},
  {key:'pic',label:'PIC',type:'num',hideable:true},
  {key:'sic',label:'SIC',type:'num',hideable:true},
  {key:'c130_pic',label:'C130 PIC',type:'num',hideable:true},
  {key:'c130_total',label:'C130 Total',type:'num',hideable:true},
  {key:'c130_sic',label:'C130 SIC',type:'num',hideable:true},
  {key:'b737_pic',label:'B737 PIC',type:'num',hideable:true},
  {key:'b737_total',label:'B737 Total',type:'num',hideable:true},
  {key:'bae146_pic',label:'BAe146 PIC',type:'num',hideable:true},
  {key:'bae146_total',label:'BAe146 Total',type:'num',hideable:true},
  {key:'citation',label:'Citation',type:'num',hideable:true},
  {key:'over_12500',label:'>12,500',type:'num',hideable:true},
  {key:'p2_pic',label:'P2 PIC',type:'num',hideable:true},
  {key:'p2_sic',label:'P2 SIC',type:'num',hideable:true},
  {key:'drops',label:'Drops',type:'num',hideable:true},
  {key:'notes',label:'Notes',type:'textarea',hideable:false}
];
const NUM_FIELDS = FIELDS.filter(f => f.type === 'num');

// Entry panel layout. The form no longer follows table column visibility:
// these sections always show; every other number field sits behind
// "More fields" unless the entry already has a value in it. The 'auto'
// section is filled from aircraft type + role (see deriveFromType).
const FORM_SECTIONS = [
  { title: 'Time', keys: ['total_time', 'night'], role: true },
  { title: 'Filled from type & role', keys: ['pic', 'sic', 'multi_engine', 'jet', 'turbo_prop', 'cross_country', 'over_12500', 'b737_total', 'b737_pic', 'c130_total', 'c130_pic', 'c130_sic'], auto: true },
  { title: 'Landings & ops', keys: ['day_landings', 'night_landings', 'drops', 'approaches', 'actual_inst', 'sim_inst'] }
];

// Hours implied by aircraft type, total time and role, the same rules the
// import has always used. Cross-country is not included: the import works it
// out per leg, the entry form defaults it to the total.
function deriveFromType(aircraft, t, isPIC, isSIC) {
  const ac = String(aircraft || '').toUpperCase();
  const isSingleEngine = ac.includes('C182') || ac.includes('C210') || ac.includes('PA32') || ac.includes('C172');
  const isMulti = !isSingleEngine;
  const isB737 = ac.includes('B733') || ac.includes('B737') || ac.includes('737');
  const isBae146 = ac.includes('B462') || ac.includes('BAE') || ac.includes('RJ85') || ac.includes('146');
  const isC130 = ac.includes('LC-130') || ac.includes('C-130') || ac.includes('L382') || ac.includes('C130');
  const isCitation = ac.includes('CE-5') || ac.includes('C550') || ac.includes('C560') || ac.includes('CITATION');
  const isP2V = ac.includes('P2V');
  const isJet = isB737 || isBae146 || isCitation || ac.includes('G200') || ac.includes('CL-');
  const isTurboProp = isC130;
  const isOver12500 = isB737 || isBae146 || isC130 || isP2V || isCitation;
  return {
    single_engine: isSingleEngine ? t : 0, multi_engine: isMulti ? t : 0, jet: isJet ? t : 0, turbo_prop: isTurboProp ? t : 0,
    over_12500: isOver12500 ? t : 0,
    pic: isPIC ? t : 0, sic: isSIC ? t : 0,
    b737_total: isB737 ? t : 0, b737_pic: (isB737 && isPIC) ? t : 0,
    bae146_total: isBae146 ? t : 0, bae146_pic: (isBae146 && isPIC) ? t : 0,
    c130_total: isC130 ? t : 0, c130_pic: (isC130 && isPIC) ? t : 0, c130_sic: (isC130 && isSIC) ? t : 0,
    citation: isCitation ? t : 0,
    p2_pic: (isP2V && isPIC) ? t : 0, p2_sic: (isP2V && isSIC) ? t : 0
  };
}

// Column presets for the Log Book table: the keys listed are shown, every
// other hideable column is hidden. 'current' is the default for a fresh setup.
const COLUMN_PRESETS = {
  current: { label: 'Current flying', show: ['pic', 'sic', 'night', 'day_landings', 'night_landings', 'drops'] },
  all: { label: 'Everything', show: null },
  historical: { label: 'Historical types', show: ['pic', 'sic', 'c130_total', 'b737_total', 'bae146_pic', 'bae146_total', 'citation', 'p2_pic', 'p2_sic'] }
};
function presetHiddenCols(name) {
  const p = COLUMN_PRESETS[name];
  if (!p || !p.show) return [];
  return FIELDS.filter(f => f.hideable && p.show.indexOf(f.key) < 0).map(f => f.key);
}
const FIELD_KEYS = FIELDS.map(f => f.key);
const FIELD_LABEL = {};
FIELDS.forEach(f => { FIELD_LABEL[f.key] = f.label; });

// Tail number -> aircraft type used to auto-fill the entry form and imports.
// User additions (from saved entries / imports) are merged in from the
// 'tail_map' setting at boot (see Logbook.init).
const TAIL_MAP = {"N5382N": "PA32", "N219AX": "G200", "N6094B": "C210", "N2621F": "C182", "Simulator": "RJ85", "T-44": "L-P2V-5", "T-45": "L-P2V-7", "T-06": "L-P2V-5", "T-12": "B462", "T-10": "B462", "T-11": "L-P2V-7", "T-07": "L-P2V-5", "T-43": "L-P2V-7", "T-05": "L-P2V-5", "T-410": "L-P2V-5", "T-40": "B462", "T-41": "B462", "N354AC": "RJ85", "N473NA": "B462", "T-01": "B462", "N163DD": "B462", "Sim": "LC-130", "N402LC": "L382G", "P4-LAE": "L382G", "T-132": "LC-130", "N403LC": "L382G", "T-133": "LC-130", "T-131": "LC-130", "N401LC": "L382G", "T-138": "LC-130", "N7793G": "C-310", "T-137": "B733 ", "T-134": "C-130", "N7793Q": "C-310", "N8652K": "C-340", "N619SW": "B733 ", "SIM": "B733 ", "B-138": "B733 ", "B-137": "B733 ", "N500TM": "CE-550", "FS201": "CE-560", "B-210": "B733 ", "N550CG": "CE-550", "FS207": "CE-550", "N552CG": "CE-550", "FS-201": "CE-560", "T-139": "B733 ", "T-210": "B733 ", "T-22": "B733 ", "B-133": "LC-130", "T-136": "LC-130", "B210": "B733 ", "B-132": "LC-130"};

// Return an object holding only the 32 logbook fields, coerced to the right
// types (numbers default to 0, strings to '').
function normalizeFields(src) {
  const r = {};
  FIELDS.forEach(f => {
    const v = src ? src[f.key] : undefined;
    if (f.type === 'num') {
      const n = typeof v === 'number' ? v : parseFloat(v);
      r[f.key] = Number.isFinite(n) ? n : 0;
    } else {
      r[f.key] = (v === null || v === undefined) ? '' : String(v);
    }
  });
  return r;
}

// Table/report number formatting identical to the original app:
// blank for zero, integer as-is, otherwise one decimal.
function fmtNum(v) {
  if (!v) return '';
  return v % 1 === 0 ? String(v) : v.toFixed(1);
}

// Local-time YYYY-MM-DD for a Date (never toISOString, which shifts to UTC).
function ymd(d) {
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return yy + '-' + mm + '-' + dd;
}

function sumKey(rows, key) {
  let s = 0;
  for (let i = 0; i < rows.length; i++) s += (rows[i][key] || 0);
  return s;
}

function escapeHtml(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
