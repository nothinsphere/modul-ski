/* Mesin simulasi PLC bergaya Omron seri CP (untuk pembelajaran, bukan pengganti CX-Programmer).
 * compile(teks mnemonik) -> rung (pohon seri/paralel); Cpu.scan(dt) -> satu siklus: baca input, eksekusi, perbarui output.
 * ladder(box, prog, cpu) -> menggambar diagram ladder SVG dengan aliran daya langsung. */
window.PLC = (function () {
  'use strict';
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // Flag sistem (simbol CX-Programmer).
  const SYS = { P_FIRST_CYCLE: 'A200.11', P_ER: 'CF003', P_GT: 'CF005', P_EQ: 'CF006', P_LT: 'CF007', P_0_1S: 'CF100', P_0_2S: 'CF101', P_1S: 'CF102', P_0_02S: 'CF103', P_1MIN: 'CF104', P_ON: 'CF113', P_OFF: 'CF114' };
  const CLOCK = { 100: 100, 101: 200, 102: 1000, 103: 20, 104: 60000 };

  function fromBCD(w) { let v = 0, m = 1; for (let i = 0; i < 4; i++) { const d = (w >> (i * 4)) & 15; if (d > 9) return NaN; v += d * m; m *= 10; } return v; }
  function toBCD(v) { v = Math.max(0, Math.min(9999, Math.round(v))); let w = 0; for (let i = 0; i < 4; i++) { w |= (v % 10) << (i * 4); v = Math.floor(v / 10); } return w; }
  const hex4 = w => (w & 0xffff).toString(16).toUpperCase().padStart(4, '0');

  // Membaca alamat bit; melempar pesan berbahasa Indonesia bila salah.
  function parseBit(tok, syms) {
    const raw = tok;
    tok = tok.toUpperCase();
    if (syms && syms[tok]) tok = syms[tok].toUpperCase();
    if (SYS[tok]) tok = SYS[tok];
    let m;
    if ((m = tok.match(/^CF(\d{3})$/))) return { a: 'CF', w: +m[1], b: 0, txt: raw };
    if ((m = tok.match(/^(?:T|TIM)\s*(\d{1,4})$/))) return { a: 'T', w: +m[1], b: 0, txt: 'T' + m[1].padStart(3, '0') };
    if ((m = tok.match(/^(?:C|CNT)\s*(\d{1,4})$/))) return { a: 'C', w: +m[1], b: 0, txt: 'C' + m[1].padStart(3, '0') };
    if ((m = tok.match(/^([WHA]?)(\d{1,4})\.(\d+)$/))) {
      if (m[3].length !== 2) throw `"${raw}": bit ditulis dua digit, misalnya ${m[1]}${m[2]}.0${m[3][0]}.`;
      const b = +m[3];
      if (b > 15) throw `"${raw}": bit hanya 00 sampai 15 (satu word = 16 bit).`;
      const w = +m[2], a = m[1] || 'CIO';
      if (a === 'W' && w > 511) throw `"${raw}": area W pada contoh ini W0 sampai W511 (CP1E: W0-W99).`;
      if (a === 'H' && w > 511) throw `"${raw}": area H pada contoh ini H0 sampai H511 (CP1E: H0-H49).`;
      return { a, w, b, txt: (m[1] || '') + w + '.' + m[3] };
    }
    if (/^D\d+$/.test(tok)) throw `"${raw}" adalah word data, tidak bisa dipakai sebagai kontak atau koil.`;
    if (/^\d+$/.test(tok)) throw `"${raw}": tulis lengkap word.bit, misalnya ${tok}.00.`;
    throw `"${raw}" bukan alamat yang dikenal.`;
  }
  // Membaca operand word: konstanta #, &, atau area memori.
  function parseWord(tok, syms) {
    const raw = tok;
    tok = tok.toUpperCase();
    if (syms && syms[tok]) tok = syms[tok].toUpperCase();
    let m;
    if ((m = tok.match(/^#([0-9A-F]{1,4})$/))) return { k: parseInt(m[1], 16), txt: '#' + m[1] };
    if ((m = tok.match(/^&(\d{1,5})$/))) { if (+m[1] > 65535) throw `"${raw}" terlalu besar untuk satu word.`; return { k: +m[1], txt: '&' + m[1] }; }
    if ((m = tok.match(/^D(\d{1,5})$/))) return { a: 'D', w: +m[1], txt: 'D' + m[1] };
    if ((m = tok.match(/^([WHA])(\d{1,4})$/))) return { a: m[1], w: +m[2], txt: m[1] + m[2] };
    if ((m = tok.match(/^(?:T|TIM)\s*(\d{1,4})$/))) return { a: 'T', w: +m[1], txt: 'T' + m[1].padStart(3, '0') };
    if ((m = tok.match(/^(?:C|CNT)\s*(\d{1,4})$/))) return { a: 'C', w: +m[1], txt: 'C' + m[1].padStart(3, '0') };
    if ((m = tok.match(/^(\d{1,4})$/))) return { a: 'CIO', w: +m[1], txt: m[1] };
    throw `"${raw}" bukan operand word yang dikenal (contoh: #0050, &10, D100, W10, T000).`;
  }

  const CMP = { '=': (a, b) => a === b, '<>': (a, b) => a !== b, '<': (a, b) => a < b, '<=': (a, b) => a <= b, '>': (a, b) => a > b, '>=': (a, b) => a >= b };
  const ONE = ['OUT', 'OUT NOT', 'SET', 'RSET', 'TIM', 'TIMH', 'DIFU', 'DIFD', 'MOV', 'CMP', '++B', '--B'];
  const MULTI = { CNT: 2, KEEP: 2, CNTR: 3, SFT: 3 };

  function compile(text, syms) {
    syms = syms || {};
    const U = {}; Object.keys(syms).forEach(k => { U[k.toUpperCase()] = syms[k]; });
    const P = { rungs: [], errors: [], warns: [], text, syms, hasEnd: false };
    const err = (line, msg) => P.errors.push({ line, msg });
    let stack = [], cur = null, title = '', rTitle = '', ended = false;
    const series = (a, b) => { if (a.t === 's') { a.k.push(b); return a; } return { t: 's', k: [a, b] }; };
    const para = (a, b) => { if (a.t === 'p') { a.k.push(b); return a; } return { t: 'p', k: [a, b] }; };
    text.split(/\r?\n/).forEach((rawLine, i) => {
      const line = i + 1;
      let src = rawLine, comment = '';
      const ci = src.search(/;|\/\//);
      if (ci >= 0) { comment = src.slice(ci).replace(/^(;|\/\/)\s*/, '').trim(); src = src.slice(0, ci); }
      src = src.trim();
      if (!src) { if (comment) title = comment; return; }
      if (ended) { P.warns.push({ line, msg: 'Baris setelah END tidak dieksekusi.' }); return; }
      let s = src.toUpperCase().replace(/\s+/g, ' ').replace(/\(\d{3}\)/g, '');
      s = s.replace(/^LDNOT\b/, 'LD NOT').replace(/^ANDNOT\b/, 'AND NOT').replace(/^ORNOT\b/, 'OR NOT').replace(/^OUTNOT\b/, 'OUT NOT').replace(/^ANDLD\b/, 'AND LD').replace(/^ORLD\b/, 'OR LD');
      s = s.replace(/^(LD|AND|OR)\s*(<>|<=|>=|=|<|>)\s*/, '$1 CMP$2 ');
      const edge = s[0] === '@'; if (edge) s = s.slice(1);
      const parts = s.split(' ');
      let op = parts[0], args = parts.slice(1);
      if (['LD', 'AND', 'OR', 'OUT'].includes(op) && args[0] === 'NOT') { op += ' NOT'; args = args.slice(1); }
      if ((op === 'AND' || op === 'OR') && args[0] === 'LD' && args.length === 1) { op += ' LD'; args = []; }
      if (op === 'TIM' && args.length === 1) { const m = args[0].match(/^(\d+)(#.*)?$/); if (m && m[2]) args = [m[1], m[2]]; }
      try {
        if (op === 'END') { P.hasEnd = true; ended = true; if (stack.length) throw 'Ada blok logika yang belum dipakai sebelum END.'; cur = null; return; }
        if (op === 'NOP') return;
        const bc = /^(LD|AND|OR)( NOT)?$/.exec(op);
        if (bc) {
          const base = bc[1], not = !!bc[2];
          let node;
          if (args[0] && args[0].startsWith('CMP')) {
            const c = args[0].slice(3);
            if (args.length !== 3) throw `Pembanding ditulis ${base} ${c} operand1 operand2, misalnya ${base} ${c} C000 #0002.`;
            node = { t: 'cmp', op: c, a: parseWord(args[1], U), b: parseWord(args[2], U), not, label: comment, line };
          } else {
            if (args.length !== 1) throw `${op} butuh satu alamat, misalnya ${op} 0.00.`;
            node = { t: 'c', addr: parseBit(args[0], U), not, label: comment, line, src: args[0] };
          }
          if (base === 'LD') {
            if (cur) { cur = null; }
            if (!stack.length) { rTitle = title; title = ''; }
            stack.push(node);
          } else if (stack.length) {
            const top = stack.pop();
            stack.push(base === 'AND' ? series(top, node) : para(top, node));
          } else if (cur && base === 'AND') {
            // AND setelah OUT: rung baru dengan logika sebelumnya ditambah kontak ini.
            stack.push({ t: 's', k: [JSON.parse(JSON.stringify(cur.blocks[0])), node] });
            cur = null;
          } else throw `${op} harus didahului LD.`;
          return;
        }
        if (op === 'AND LD' || op === 'OR LD') {
          if (stack.length < 2) throw `${op} menggabungkan dua blok, tetapi hanya ada ${stack.length} blok.`;
          const b = stack.pop(), a = stack.pop();
          stack.push(op === 'AND LD' ? series(a, b) : para(a, b));
          return;
        }
        const need = MULTI[op];
        if (!need && !ONE.includes(op)) throw `Instruksi "${src.split(/\s+/)[0]}" tidak dikenal simulator ini.`;
        const o = { op, edge, label: comment, line };
        if (op === 'OUT' || op === 'OUT NOT' || op === 'SET' || op === 'RSET' || op === 'DIFU' || op === 'DIFD' || op === 'KEEP') {
          if (args.length !== 1) throw `${op} butuh satu alamat bit.`;
          o.addr = parseBit(args[0], U);
          if (['T', 'C', 'CF'].includes(o.addr.a) || (o.addr.a === 'A')) throw `${args[0]} tidak boleh ditulis sebagai koil.`;
        } else if (op === 'TIM' || op === 'TIMH' || op === 'CNT' || op === 'CNTR') {
          if (args.length !== 2) throw `${op} ditulis ${op} nomor SV, misalnya ${op} 000 #0050.`;
          if (!/^\d{1,4}$/.test(args[0])) throw `Nomor ${op} harus angka, misalnya 000.`;
          o.n = +args[0]; o.sv = parseWord(args[1], U);
          if (o.sv.txt && o.sv.txt[0] === '&') throw `SV ${op} memakai format BCD: tulis #, bukan & (contoh #0050).`;
          if (o.sv.k !== undefined && isNaN(fromBCD(o.sv.k))) throw `${o.sv.txt} bukan BCD (digit A-F tidak boleh dipakai sebagai SV).`;
        } else if (op === 'MOV' || op === 'CMP') {
          if (args.length !== 2) throw `${op} butuh dua operand.`;
          o.a = parseWord(args[0], U); o.b = parseWord(args[1], U);
          if (op === 'MOV' && o.b.k !== undefined) throw 'Tujuan MOV tidak boleh konstanta.';
          if (op === 'MOV' && (o.b.a === 'T' || o.b.a === 'C')) throw 'Simulator ini tidak menulis PV timer/counter lewat MOV.';
        } else if (op === '++B' || op === '--B') {
          if (args.length !== 1) throw `${op} butuh satu word.`;
          o.a = parseWord(args[0], U);
          if (o.a.k !== undefined) throw `${op} tidak bisa menaikkan konstanta.`;
        } else if (op === 'SFT') {
          if (args.length !== 2) throw 'SFT ditulis SFT word_awal word_akhir.';
          o.a = parseWord(args[0], U); o.b = parseWord(args[1], U);
        }
        if (need) {
          if (stack.length !== need) throw `${op} butuh ${need} blok masukan (LD ...) sebelum instruksi, ditemukan ${stack.length}.`;
          const blocks = stack; stack = [];
          P.rungs.push({ blocks, ops: [o], line, title: rTitle });
          cur = null; title = ''; rTitle = '';
          return;
        }
        if (stack.length > 1) throw `Masih ada ${stack.length} blok terpisah. Gabungkan dengan AND LD atau OR LD sebelum ${op}.`;
        if (!stack.length && !cur) throw `${op} butuh kondisi (LD ...) di depannya.`;
        if (stack.length) {
          const block = stack.pop();
          cur = { blocks: [block], ops: [o], line, title: rTitle };
          P.rungs.push(cur);
          title = ''; rTitle = '';
        } else cur.ops.push(o);
      } catch (e) { if (typeof e === 'string') err(line, e); else throw e; }
    });
    if (stack.length) err(text.split(/\r?\n/).length, 'Program berakhir, tetapi ada kondisi LD yang belum punya keluaran.');
    if (!ended && P.rungs.length) P.warns.push({ line: text.split(/\r?\n/).length, msg: 'Akhiri program dengan END(001).' });
    // Program check: koil ganda, nomor timer/counter ganda, keluaran ke area input.
    const seen = {}, tn = {}, cn = {};
    P.rungs.forEach(r => r.ops.forEach(o => {
      if (o.op === 'OUT' || o.op === 'OUT NOT') {
        const k = o.addr.txt;
        if (seen[k]) P.warns.push({ line: o.line, msg: `Koil ganda: ${k} sudah ditulis di baris ${seen[k]}. Rung terakhir yang menentukan.` });
        else seen[k] = o.line;
        if (o.addr.a === 'CIO' && o.addr.w < 100) P.warns.push({ line: o.line, msg: `${k} adalah area input. Bit ini ditimpa saat pembaruan input.` });
      }
      if (o.op === 'TIM' || o.op === 'TIMH') { if (tn[o.n] || cn[o.n]) P.warns.push({ line: o.line, msg: `Nomor T${String(o.n).padStart(3, '0')} dipakai lebih dari sekali.` }); tn[o.n] = 1; }
      if (o.op === 'CNT' || o.op === 'CNTR') { if (cn[o.n] || tn[o.n]) P.warns.push({ line: o.line, msg: `Nomor C${String(o.n).padStart(3, '0')} dipakai lebih dari sekali (timer dan counter berbagi nomor).` }); cn[o.n] = 1; }
    }));
    return P;
  }

  const key = a => `${a.a}:${a.w}:${a.b}`;

  function Cpu() { this.reset(); }
  Cpu.prototype = {
    reset() {
      this.m = { CIO: {}, W: {}, H: {}, A: {}, D: {} };
      this.T = {}; this.C = {}; this.forced = {}; this.inp = []; this.t = 0; this.first = true; this.flags = {}; this.err = ''; this.prog = null; this.run = true; this.scans = 0;
    },
    load(prog) {
      this.prog = prog; this.T = {}; this.C = {}; this.first = true; this.err = ''; this.scans = 0; this.t = 0;
      ['CIO', 'W', 'A'].forEach(a => { this.m[a] = {}; });
      prog.rungs.forEach(r => r.ops.forEach(o => { o.last = false; if (o.op === 'CNT' || o.op === 'CNTR') { o.lastA = false; o.lastB = false; } }));
    },
    // Mati-hidup daya: W, CIO, dan timer hilang; H, D, dan counter bertahan.
    powerCycle() {
      ['CIO', 'W', 'A'].forEach(a => { this.m[a] = {}; });
      this.T = {}; this.first = true; this.t = 0;
      if (this.prog) this.prog.rungs.forEach(r => r.ops.forEach(o => { o.last = false; o.lastA = false; o.lastB = false; }));
    },
    gb(a) {
      const f = this.forced[key(a)];
      if (f !== undefined) return f;
      switch (a.a) {
        case 'T': { const t = this.T[a.w]; return !!(t && t.flag); }
        case 'C': { const c = this.C[a.w]; return !!(c && c.flag); }
        case 'CF': {
          if (a.w === 113) return true;
          if (a.w === 114) return false;
          if (CLOCK[a.w]) { const p = CLOCK[a.w]; return (this.t % p) < p / 2; }
          return !!this.flags[a.w];
        }
        case 'A': if (a.w === 200 && a.b === 11) return this.first; break;
      }
      return !!(((this.m[a.a][a.w] || 0) >> a.b) & 1);
    },
    sb(a, v) {
      if (this.forced[key(a)] !== undefined) return;
      const M = this.m[a.a]; let w = M[a.w] || 0;
      if (v) w |= 1 << a.b; else w &= ~(1 << a.b);
      M[a.w] = w & 0xffff;
    },
    gw(o) {
      if (o.k !== undefined) return o.k;
      if (o.a === 'T') { const t = this.T[o.w]; return t ? toBCD(Math.ceil(t.rem / t.unit)) : 0; }
      if (o.a === 'C') { const c = this.C[o.w]; return c ? toBCD(c.pv) : 0; }
      return this.m[o.a][o.w] || 0;
    },
    sw(o, v) { this.m[o.a][o.w] = v & 0xffff; },
    // Membaca/menulis bit dengan alamat teks (dipakai panel monitor dan pengujian).
    bit(s) { return this.gb(parseBit(s)); },
    word(s) { return this.gw(parseWord(s)); },
    setWord(s, v) { this.sw(parseWord(s), v); },
    setIn(addr, v) {
      const a = typeof addr === 'string' ? parseBit(addr) : addr;
      const hit = this.inp.find(x => x.a.a === a.a && x.a.w === a.w && x.a.b === a.b);
      if (hit) hit.v = !!v; else this.inp.push({ a, v: !!v });
    },
    force(addr, v) { const a = parseBit(addr); if (v === null) delete this.forced[key(a)]; else { this.forced[key(a)] = !!v; const M = this.m[a.a]; if (M) { let w = M[a.w] || 0; if (v) w |= 1 << a.b; else w &= ~(1 << a.b); M[a.w] = w & 0xffff; } } },
    flow(n, inp) {
      let out;
      if (n.t === 'c') { n.closed = this.gb(n.addr) !== n.not; out = inp && n.closed; }
      else if (n.t === 'cmp') { n.closed = CMP[n.op](this.gw(n.a), this.gw(n.b)) !== n.not; out = inp && n.closed; }
      else if (n.t === 's') { let x = inp; for (const k of n.k) x = this.flow(k, x); out = x; }
      else { let any = false; for (const k of n.k) { const o = this.flow(k, inp); any = any || o; } out = any; }
      n.in = inp; n.out = out;
      return out;
    },
    exec(o, v, vals) {
      const fire = o.edge ? (v && !o.last) : v;
      switch (o.op) {
        case 'OUT': this.sb(o.addr, v); break;
        case 'OUT NOT': this.sb(o.addr, !v); break;
        case 'SET': if (fire) this.sb(o.addr, true); break;
        case 'RSET': if (fire) this.sb(o.addr, false); break;
        case 'KEEP': if (vals[1]) this.sb(o.addr, false); else if (vals[0]) this.sb(o.addr, true); break;
        case 'DIFU': this.sb(o.addr, v && !o.last); break;
        case 'DIFD': this.sb(o.addr, !v && o.last); break;
        case 'TIM': case 'TIMH': {
          const unit = o.op === 'TIM' ? 100 : 10, sv = fromBCD(this.gw(o.sv));
          if (isNaN(sv)) { this.flags[3] = true; this.err = `${o.op} ${o.n}: SV ${hex4(this.gw(o.sv))} bukan BCD.`; break; }
          const t = this.T[o.n] || (this.T[o.n] = { rem: sv * unit, flag: false, unit, sv });
          t.unit = unit; t.sv = sv;
          if (!v) { t.rem = sv * unit; t.flag = false; }
          else { if (t.rem > 0) t.rem -= this.dt; if (t.rem <= 0) { t.rem = 0; t.flag = true; } }
          break;
        }
        case 'CNT': {
          const sv = fromBCD(this.gw(o.sv));
          if (isNaN(sv)) { this.flags[3] = true; this.err = `CNT ${o.n}: SV bukan BCD.`; break; }
          const c = this.C[o.n] || (this.C[o.n] = { pv: sv, flag: false, sv });
          c.sv = sv;
          if (vals[1]) { c.pv = sv; c.flag = false; }
          else if (vals[0] && !o.lastA) { if (c.pv > 0) c.pv--; if (c.pv === 0) c.flag = true; }
          o.lastA = vals[0];
          break;
        }
        case 'CNTR': {
          const sv = fromBCD(this.gw(o.sv));
          if (isNaN(sv)) break;
          const c = this.C[o.n] || (this.C[o.n] = { pv: 0, flag: false, sv });
          c.sv = sv;
          if (vals[2]) { c.pv = 0; c.flag = false; }
          else {
            if (vals[0] && !o.lastA) { if (c.pv === sv) { c.pv = 0; c.flag = true; } else { c.pv++; c.flag = false; } }
            if (vals[1] && !o.lastB) { if (c.pv === 0) { c.pv = sv; c.flag = true; } else { c.pv--; c.flag = false; } }
          }
          o.lastA = vals[0]; o.lastB = vals[1];
          break;
        }
        case 'MOV': if (fire) this.sw(o.b, this.gw(o.a)); break;
        case 'CMP': if (fire) { const a = this.gw(o.a), b = this.gw(o.b); this.flags[5] = a > b; this.flags[6] = a === b; this.flags[7] = a < b; } break;
        case '++B': case '--B': if (fire) { const x = fromBCD(this.gw(o.a)); if (isNaN(x)) { this.flags[3] = true; this.err = `${o.op} ${o.a.txt}: isi word bukan BCD.`; break; } this.sw(o.a, toBCD(o.op === '++B' ? (x + 1) % 10000 : (x + 9999) % 10000)); } break;
        case 'SFT': {
          if (vals[2]) { for (let w = o.a.w; w <= o.b.w; w++) this.m[o.a.a][w] = 0; }
          else if (vals[1] && !o.lastA) {
            let carry = vals[0] ? 1 : 0;
            for (let w = o.a.w; w <= o.b.w; w++) { const x = this.m[o.a.a][w] || 0; this.m[o.a.a][w] = ((x << 1) | carry) & 0xffff; carry = (x >> 15) & 1; }
          }
          o.lastA = vals[1];
          break;
        }
      }
      o.last = v;
    },
    scan(dt) {
      this.dt = dt;
      for (const i of this.inp) this.sb(i.a, i.v);
      if (this.prog && this.run) {
        for (const r of this.prog.rungs) {
          const vals = r.blocks.map(b => this.flow(b, true));
          for (const o of r.ops) this.exec(o, vals[0], vals);
        }
      }
      this.t += dt; this.first = false; this.scans++;
    }
  };

  /* ============================== Gambar ladder ============================== */
  const CW = 84, RH = 62, ML = 26, OW = 122, TH = 18;
  const size = n => {
    if (n.t === 'c' || n.t === 'cmp') return { w: 1, h: 1 };
    if (n.t === 's') { let w = 0, h = 1; n.k.forEach(k => { const s = size(k); w += s.w; h = Math.max(h, s.h); }); return { w, h }; }
    let w = 0, h = 0; n.k.forEach(k => { const s = size(k); w = Math.max(w, s.w); h += s.h; }); return { w, h };
  };
  const trim = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

  function ladder(box, P, cpu, opt) {
    opt = opt || {};
    const names = opt.names || {};
    const rev = {}; Object.keys(P.syms || {}).forEach(k => { rev[String(P.syms[k]).toUpperCase()] = k; });
    const lab = (txt, label, not, coil) => {
      const n = (coil && names[txt + '()']) || (not && names[txt + '!']) || names[txt]; if (n) return n;
      return { top: txt, bot: rev[txt.toUpperCase()] || label || '' };
    };
    if (!P.rungs.length) { box.innerHTML = '<p class="small muted lad-empty">Belum ada rung. Tulis program di tab Mnemonik.</p>'; return { update() {} }; }
    let LW = 1; P.rungs.forEach(r => r.blocks.forEach(b => { LW = Math.max(LW, size(b).w); }));
    const px = c => ML + c * CW, W = px(LW) + OW + 8;
    let svg = '', refs = [], dyn = [], yTop = 8;
    const wire = (d, node, prop) => { refs.push({ node, prop }); svg += `<path class="lw" data-r="${refs.length - 1}" d="${d}"/>`; };
    const y = (top, row) => top + 34 + row * RH;
    function draw(n, x, row, wid, top) {
      const yy = y(top, row);
      if (n.t === 'c' || n.t === 'cmp') {
        const xl = px(x), xr = xl + CW, xc = xl + CW / 2;
        wire(`M${xl} ${yy}H${xc - 9}`, n, 'in');
        wire(`M${xc + 9} ${yy}H${px(x + wid)}`, n, 'out');
        refs.push({ node: n, prop: 'closed', g: true });
        if (n.t === 'c') {
          const L = lab(n.addr.txt, n.label, n.not);
          svg += `<g class="lc" data-r="${refs.length - 1}"><path d="M${xc - 9} ${yy - 15}V${yy + 15}M${xc + 9} ${yy - 15}V${yy + 15}${n.not ? `M${xc - 17} ${yy + 15}L${xc + 17} ${yy - 15}` : ''}"/>
            <text class="la" x="${xc}" y="${yy - 21}">${esc(trim(L.top, 11))}</text><text class="ll" x="${xc}" y="${yy + 28}">${esc(trim(L.bot, 13))}</text></g>`;
        } else {
          svg += `<g class="lc" data-r="${refs.length - 1}"><rect x="${xc - 26}" y="${yy - 15}" width="52" height="30" rx="3" class="lb"/><text class="lk" x="${xc}" y="${yy - 3}">${esc(n.op)}${n.not ? ' NOT' : ''}</text><text class="ll" x="${xc}" y="${yy + 10}">${esc(trim(n.a.txt + ' ' + n.b.txt, 12))}</text></g>`;
        }
      } else if (n.t === 's') {
        let cx = x, rest = wid;
        n.k.forEach((k, i) => { const s = size(k), w = i === n.k.length - 1 ? rest : s.w; draw(k, cx, row, w, top); cx += w; rest -= w; });
      } else {
        let r = row, last = row;
        n.k.forEach(k => { draw(k, x, r, wid, top); last = r; r += size(k).h; });
        wire(`M${px(x)} ${y(top, row)}V${y(top, last)}`, n, 'in');
        wire(`M${px(x + wid)} ${y(top, row)}V${y(top, last)}`, n, 'out');
      }
    }
    function drawOp(o, x, yy, rowsSpan) {
      const cx = x + OW / 2, ad = o.addr ? lab(o.addr.txt, o.label, false, true) : null;
      const pv = (cond, fn, tx, cls) => { dyn.push(fn); svg += `<text class="${cls || 'lv'}" x="${cx}" y="${tx}" data-d="${dyn.length - 1}"></text>`; };
      if (o.op === 'OUT' || o.op === 'OUT NOT') {
        refs.push({ addr: o.addr, g: true, not: false });
        svg += `<g class="lc coil" data-r="${refs.length - 1}"><path d="M${cx - 9} ${yy - 15}Q${cx - 19} ${yy} ${cx - 9} ${yy + 15}M${cx + 9} ${yy - 15}Q${cx + 19} ${yy} ${cx + 9} ${yy + 15}${o.op === 'OUT NOT' ? `M${cx - 15} ${yy + 14}L${cx + 15} ${yy - 14}` : ''}"/>
          <text class="la" x="${cx}" y="${yy - 21}">${esc(trim(ad.top, 13))}</text><text class="ll" x="${cx}" y="${yy + 28}">${esc(trim(ad.bot, 15))}</text></g>`;
        svg += `<path class="lwire0" d="M${x} ${yy}H${cx - 15}M${cx + 15} ${yy}H${x + OW}"/>`;
        return;
      }
      const h = (rowsSpan || 1) * RH - 14, by = yy - 24;
      let line2 = '', line3 = '';
      if (o.addr) { line2 = ad.top; line3 = ad.bot; }
      else if (o.op === 'TIM' || o.op === 'TIMH' || o.op === 'CNT' || o.op === 'CNTR') { line2 = (o.op[0] === 'T' ? 'T' : 'C') + String(o.n).padStart(3, '0') + ' ' + o.sv.txt; }
      else if (o.op === 'MOV' || o.op === 'CMP' || o.op === 'SFT') line2 = o.a.txt + (o.op === 'CMP' ? ' : ' : ' → ') + o.b.txt;
      else line2 = o.a ? o.a.txt : '';
      svg += `<rect class="lb" x="${x + 6}" y="${by}" width="${OW - 12}" height="${h}" rx="3"/><text class="lk" x="${cx}" y="${by + 13}">${esc((o.edge ? '@' : '') + o.op)}</text><text class="la" x="${cx}" y="${by + 26}">${esc(trim(line2, 15))}</text>`;
      svg += `<path class="lwire0" d="M${x} ${yy}H${x + 6}M${x + OW - 6} ${yy}H${x + OW}"/>`;
      if (line3 && !(o.op === 'TIM' || o.op === 'TIMH')) svg += `<text class="ll" x="${cx}" y="${by + 38}">${esc(trim(line3, 15))}</text>`;
      if (o.op === 'TIM' || o.op === 'TIMH') {
        const u = o.op === 'TIM' ? 10 : 100;
        pv(1, c => { const t = c.T[o.n]; return t ? 'sisa ' + (Math.ceil(t.rem / t.unit) / u).toFixed(o.op === 'TIM' ? 1 : 2).replace('.', ',') + ' s' : ''; }, by + 39);
      }
      if (o.op === 'CNT' || o.op === 'CNTR') pv(1, c => { const t = c.C[o.n]; return t ? 'PV ' + t.pv : ''; }, by + 39);
      if (o.op === 'CNT' || o.op === 'CNTR' || o.op === 'KEEP' || o.op === 'SFT') { /* label pin digambar pemanggil */ }
    }
    P.rungs.forEach((r, ri) => {
      const top = yTop + (r.title ? TH : 0);
      if (r.title) svg += `<text class="lt" x="${ML + 2}" y="${yTop + 12}">${esc(trim(r.title, Math.floor((W - ML) / 6.2)))}</text>`;
      let rows = 0;
      svg += `<text class="ln" x="4" y="${y(top, 0) + 4}">${ri}</text>`;
      if (r.blocks.length === 1) {
        const b = r.blocks[0], s = size(b);
        draw(b, 0, 0, LW, top);
        wire(`M${ML - 8} ${y(top, 0)}H${px(0)}`, { in: true }, 'in');
        r.ops.forEach((o, i) => drawOp(o, px(LW), y(top, i)));
        if (r.ops.length > 1) wire(`M${px(LW)} ${y(top, 0)}V${y(top, r.ops.length - 1)}`, b, 'out');
        rows = Math.max(s.h, r.ops.length);
      } else {
        const PIN = { CNT: ['CP', 'R'], KEEP: ['S', 'R'], CNTR: ['I', 'D', 'R'], SFT: ['IN', 'SP', 'R'] }[r.ops[0].op];
        let cur = 0;
        const pinRows = [];
        r.blocks.forEach(b => { draw(b, 0, cur, LW, top); wire(`M${ML - 8} ${y(top, cur)}H${px(0)}`, { in: true }, 'in'); pinRows.push(cur); cur += size(b).h; });
        rows = cur;
        drawOp(r.ops[0], px(LW), y(top, 0), rows);
        r.blocks.forEach((b, i) => { svg += `<text class="lp" x="${px(LW) + 9}" y="${y(top, pinRows[i]) + 22}">${PIN[i]}</text>`; });
      }
      yTop = top + 12 + rows * RH + 6;
    });
    const H = yTop + 6;
    svg = `<path class="lrail" d="M${ML - 8} 4V${H - 4}M${W - 6} 4V${H - 4}"/>` + svg;
    box.innerHTML = `<div class="lad-scroll"><svg class="lad" viewBox="0 0 ${W} ${H}" style="width:max(100%,${Math.round(W * 0.85)}px)" role="img" aria-label="Diagram ladder dengan aliran daya">${svg}</svg></div>`;
    const els = Array.from(box.querySelectorAll('[data-r]'));
    const dels = Array.from(box.querySelectorAll('[data-d]'));
    function update() {
      for (const el of els) {
        const r = refs[+el.dataset.r];
        let on;
        if (r.addr) on = cpu.gb(r.addr);
        else on = !!r.node[r.prop];
        el.classList.toggle('on', on);
      }
      for (const el of dels) el.textContent = dyn[+el.dataset.d](cpu);
    }
    update();
    return { update };
  }

  return { compile, Cpu, ladder, parseBit, parseWord, fromBCD, toBCD, hex4, SYS };
})();
