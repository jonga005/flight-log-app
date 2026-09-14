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
