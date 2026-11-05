/* Stasiun latihan: model perangkat lapangan (motor, konveyor, pneumatik, hidrolik, sortir), panel tombol-lampu, dan Lab PLC.
 * Model tidak menyentuh DOM agar bisa dijalankan cepat oleh pemeriksa misi. */
(function () {
  'use strict';
  const PLC = window.PLC;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem('ski:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('ski:' + k, JSON.stringify(v)); } catch (e) { /* penyimpanan tidak tersedia */ } }
  };
  const icon = id => `<svg aria-hidden="true"><use href="#i-${id}"/></svg>`;
  let toastTimer;
  function toast(msg) {
    let t = $('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2400);
  }
  window.U = { $, $$, esc, store, icon, toast };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const fmtId = (v, d) => Number(v).toLocaleString('id-ID', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });

  /* ============================== Model perangkat ============================== */
  // Kontaktor punya waktu tarik dan waktu lepas; kontak bisa lengket (fault).
  function contactor() { return { coil: false, on: false, t: 0, weld: false }; }
  function stepK(k, coil, dt, relMs) {
    k.coil = coil;
    if (k.weld) { k.on = true; return; }
    if (coil === k.on) { k.t = 0; return; }
    k.t += dt;
    if (k.t >= (coil ? 15 : (relMs || 40))) { k.on = coil; k.t = 0; }
  }
  const STATION = {};

  STATION.motor = {
    nama: 'Panel motor', sub: 'DOL, putar kanan-kiri, bintang-segitiga',
    inputs: [
      { addr: '0.00', sym: 'START', dev: 'S1 hijau', tipe: 'NO', c: 'g' }, { addr: '0.01', sym: 'STOP', dev: 'S0 merah', tipe: 'NC', c: 'r' },
      { addr: '0.02', sym: 'TOR', dev: 'F3 95-96', tipe: 'NC', kind: 'toggle', label: 'TOR trip', c: 'a' },
      { addr: '0.03', sym: 'FWD', dev: 'S2', tipe: 'NO' }, { addr: '0.04', sym: 'REV', dev: 'S3', tipe: 'NO' }, { addr: '0.06', sym: 'RESET', dev: 'S4 biru', tipe: 'NO', c: 'b' }
    ],
    outputs: [{ addr: '100.00', sym: 'K1' }, { addr: '100.01', sym: 'K2' }, { addr: '100.02', sym: 'K3' }, { addr: '100.03', sym: 'H1', dev: 'RUN' }, { addr: '100.04', sym: 'H2', dev: 'TRIP' }, { addr: '100.05', sym: 'H3', dev: 'batch' }],
    model(cfg) {
      const m = { drive: (cfg && cfg.drive) || 'dol', hw: true, K: [contactor(), contactor(), contactor()], hazard: 0, hazardMsg: '', state: 'berhenti', speed: 0, I: 0, dir: 0, rot: 0 };
      m.step = (dt, cpu) => {
        const q = [cpu.bit('100.00'), cpu.bit('100.01'), cpu.bit('100.02')];
        let c = q.slice();
        if (m.hw) {
          if (m.drive === 'rev') { c[0] = q[0] && !m.K[1].on; c[1] = q[1] && !m.K[0].on; }
          if (m.drive === 'yd') { c[1] = q[1] && !m.K[2].on; c[2] = q[2] && !m.K[1].on; }
        }
        m.K.forEach((k, i) => stepK(k, c[i], dt));
        const [a, b, d] = m.K.map(k => k.on);
        const short = (m.drive === 'rev' && a && b) || (m.drive === 'yd' && b && d);
        if (short) { m.hazard++; m.hazardMsg = m.drive === 'rev' ? 'HUBUNG SINGKAT ANTARFASA: kontak utama K1 dan K2 menutup bersamaan. MCB trip.' : 'HUBUNG SINGKAT: K2 (bintang) dan K3 (segitiga) menutup bersamaan. MCB trip.'; }
        let target = 0, f = 0;
        m.dir = 0; m.state = 'berhenti';
        if (m.drive === 'dol') { if (a) { target = 1; f = 1; m.dir = 1; m.state = 'jalan langsung (DOL)'; } }
        else if (m.drive === 'rev') {
          if (a && !b) { target = 1; f = 1; m.dir = 1; m.state = 'putar kanan'; }
          if (b && !a) { target = 1; f = 1; m.dir = -1; m.state = 'putar kiri'; }
        } else {
          if (a && b && !d) { target = 0.85; f = 1 / 3; m.dir = 1; m.state = 'hubungan bintang (arus start kecil)'; }
          else if (a && d && !b) { target = 1; f = 1; m.dir = 1; m.state = 'hubungan segitiga (kerja penuh)'; }
          else if (a) { target = m.speed; f = 0; m.dir = 1; m.state = 'transisi (hanya K1)'; }
        }
        if (short) { target = 0; f = 0; m.dir = 0; }
        m.speed += (target - m.speed) * Math.min(1, dt / (f ? 900 : 1600));
        const slip = clamp(target - m.speed + (f ? 0.03 : 0), 0, 1);
        m.I = f ? f * (0.45 + 5.8 * slip) : 0;
        m.rot += m.dir * m.speed * dt * 0.9;
      };
      return m;
    },
    view(box, sim) {
      box.innerHTML = `<div class="pl-motor"><svg viewBox="0 0 120 120" class="motor-svg" aria-hidden="true"><circle cx="60" cy="60" r="52" class="m-body"/><g class="m-rotor"><path d="M60 60L60 16A44 44 0 0 1 90 28Z"/><path d="M60 60L104 60A44 44 0 0 1 92 90Z"/><path d="M60 60L60 104A44 44 0 0 1 30 92Z"/><path d="M60 60L16 60A44 44 0 0 1 28 30Z"/></g><circle cx="60" cy="60" r="8" class="m-hub"/></svg>
        <div class="stack" style="gap:6px;min-width:0"><div class="kset">${['K1', 'K2', 'K3'].map((k, i) => `<span class="kbox" data-k="${i}">${k}</span>`).join('')}</div>
        <b class="m-state small">berhenti</b><div class="ibar"><i></i></div><span class="small muted m-i tnum">0,0 × In</span></div></div><p class="hazard" hidden></p>`;
      const rotor = $('.m-rotor', box), st = $('.m-state', box), bar = $('.ibar i', box), it = $('.m-i', box), hz = $('.hazard', box), ks = $$('.kbox', box);
      return () => {
        const m = sim.plant;
        rotor.setAttribute('transform', `rotate(${m.rot % 360} 60 60)`);
        st.textContent = 'Motor: ' + m.state; bar.style.width = clamp(m.I / 6.5 * 100, 0, 100) + '%'; it.textContent = fmtId(m.I, 1) + ' × In';
        ks.forEach((b, i) => { b.classList.toggle('on', m.K[i].on); b.classList.toggle('weld', m.K[i].weld); });
        hz.hidden = !m.hazard; hz.textContent = m.hazardMsg;
      };
    }
  };

  STATION.conv = {
    nama: 'Konveyor berhitung', sub: 'sensor B1, CNT, lampu batch',
    inputs: [
      { addr: '0.00', sym: 'START', dev: 'S1', tipe: 'NO', c: 'g' }, { addr: '0.01', sym: 'STOP', dev: 'S0', tipe: 'NC', c: 'r' },
      { addr: '0.02', sym: 'TOR', dev: 'F3', tipe: 'NC', kind: 'toggle', label: 'TOR trip', c: 'a' }, { addr: '0.05', sym: 'B1', dev: 'sensor produk', kind: 'auto', tipe: 'PNP' }, { addr: '0.06', sym: 'RESET', dev: 'S4', tipe: 'NO', c: 'b' }
    ],
    outputs: [{ addr: '100.00', sym: 'K1', dev: 'motor' }, { addr: '100.03', sym: 'H1', dev: 'RUN' }, { addr: '100.04', sym: 'H2', dev: 'hampir' }, { addr: '100.05', sym: 'H3', dev: 'batch' }],
    model() {
      const m = { items: [], passed: 0, bounce: false, auto: false, gap: 0, sensors: { B1: false }, run: false, K: contactor(), bt: 0 };
      m.add = () => { if (!m.items.some(x => x.x < 12)) m.items.push({ x: 0 }); };
      m.step = (dt, cpu) => {
        stepK(m.K, cpu.bit('100.00'), dt);
        m.run = m.K.on;
        if (m.auto && m.run) { m.gap -= dt; if (m.gap <= 0) { m.add(); m.gap = 1400; } }
        let hit = false;
        m.items.forEach(it => {
          if (m.run) it.x += dt * 0.022;
          const zone = it.x >= 56 && it.x <= 62;
          if (zone) {
            hit = true;
            if (m.bounce) { const z = it.x - 56; if ((z > 0.7 && z < 1.4) || (z > 3.8 && z < 4.4)) hit = false; }
          }
        });
        m.sensors.B1 = hit;
        const before = m.items.length;
        m.items = m.items.filter(it => it.x < 100);
        m.passed += before - m.items.length;
      };
      return m;
    },
    view(box, sim) {
      box.innerHTML = `<div class="pl-conv"><div class="belt"><span class="sens" style="left:58%"><i></i>B1</span><div class="items"></div><div class="rollers"></div></div>
        <div class="btn-row"><button type="button" class="btn btn-ghost small" data-a="add">${icon('plus')}Taruh produk</button><label class="small chk"><input type="checkbox" data-a="auto"> otomatis</label><label class="small chk"><input type="checkbox" data-a="bounce"> sensor bouncing</label><span class="small muted tnum" data-v="count"></span></div></div>`;
      const its = $('.items', box), sens = $('.sens', box), cnt = $('[data-v=count]', box), belt = $('.belt', box);
      box.addEventListener('click', e => { if (e.target.closest('[data-a=add]')) sim.plant.add(); });
      box.addEventListener('change', e => { const a = e.target.dataset.a; if (a === 'auto') sim.plant.auto = e.target.checked; if (a === 'bounce') sim.plant.bounce = e.target.checked; });
      return () => {
        const m = sim.plant;
        its.innerHTML = m.items.map(i => `<b style="left:${i.x}%"></b>`).join('');
        sens.classList.toggle('on', m.sensors.B1); belt.classList.toggle('run', m.run);
        cnt.textContent = `Produk lewat (hitungan manual): ${m.passed}`;
      };
    }
  };

  // Silinder elektropneumatik dengan katup 5/2. cylinders: A, B, C.
  const CYL = { A: ['0.04', '0.05', '100.00', '100.01'], B: ['0.06', '0.07', '100.02', '100.03'], C: ['0.08', '0.09', '100.04', '100.05'] };
  STATION.pneu = {
    nama: 'Elektropneumatik', sub: 'silinder, katup 5/2, sensor reed',
    inputs: [
      { addr: '0.00', sym: 'START', dev: 'S1', tipe: 'NO', c: 'g' }, { addr: '0.01', sym: 'KONTINU', dev: 'selector', tipe: 'NO', kind: 'toggle' }, { addr: '0.02', sym: 'RESET', dev: 'S4', tipe: 'NO', c: 'b' },
      { addr: '0.03', sym: 'ESTOP', dev: 'status E-stop', tipe: 'NC', kind: 'toggle', label: 'E-STOP', c: 'r' },
      { addr: '0.04', sym: '1B1', dev: 'A belakang', kind: 'auto', tipe: 'reed' }, { addr: '0.05', sym: '1B2', dev: 'A depan', kind: 'auto', tipe: 'reed' },
      { addr: '0.06', sym: '2B1', dev: 'B belakang', kind: 'auto', tipe: 'reed' }, { addr: '0.07', sym: '2B2', dev: 'B depan', kind: 'auto', tipe: 'reed' },
      { addr: '0.08', sym: '3B1', dev: 'C belakang', kind: 'auto', tipe: 'reed' }, { addr: '0.09', sym: '3B2', dev: 'C depan', kind: 'auto', tipe: 'reed' }
    ],
    outputs: [{ addr: '100.00', sym: '1Y1', dev: 'A+' }, { addr: '100.01', sym: '1Y2', dev: 'A-' }, { addr: '100.02', sym: '2Y1', dev: 'B+' }, { addr: '100.03', sym: '2Y2', dev: 'B-' }, { addr: '100.04', sym: '3Y1', dev: 'C+' }, { addr: '100.05', sym: '3Y2', dev: 'C-' }],
    model(cfg) {
      const names = (cfg && cfg.cyl) || ['A', 'B'];
      const m = { names, pos: { A: 0, B: 0, C: 0 }, valve: { A: 0, B: 0, C: 0 }, speed: 0.9, faults: {}, sensors: {}, single: false, conflict: false, log: [] };
      const ST = { A: 0, B: 1, C: 2 };
      m.sense = () => {
        names.forEach(n => {
          const i = ST[n] + 1;
          m.sensors[i + 'B1'] = m.pos[n] <= 0.02;
          m.sensors[i + 'B2'] = m.pos[n] >= 0.98 && !(m.faults.sensor && n === 'A');
        });
        ['A', 'B', 'C'].forEach(n => { if (!names.includes(n)) { const i = ST[n] + 1; m.sensors[i + 'B1'] = true; m.sensors[i + 'B2'] = false; } });
      };
      m.sense();
      m.step = (dt, cpu, field) => {
        const live = !field.ESTOP;
        names.forEach(n => {
          const [, , yp, ym] = CYL[n];
          const P = live && cpu.bit(yp), Q = live && cpu.bit(ym);
          if (m.single) m.valve[n] = P ? 1 : 0;
          else { if (P && Q) m.conflict = true; if (P && !Q) m.valve[n] = 1; if (Q && !P) m.valve[n] = 0; }
          let dir = m.valve[n] ? 1 : -1;
          if (m.faults.hose && n === 'B') dir = -dir;
          const sp = m.faults.lowp ? 0 : m.speed;
          const before = m.pos[n];
          m.pos[n] = clamp(m.pos[n] + dir * sp * dt / 1000, 0, 1);
          if ((before < 0.98 && m.pos[n] >= 0.98) || (before > 0.02 && m.pos[n] <= 0.02)) m.log.push(n + (m.pos[n] >= 0.98 ? '+' : '-'));
        });
        if (m.log.length > 40) m.log = m.log.slice(-40);
        m.sense();
      };
      return m;
    },
    view(box, sim) {
      const m0 = sim.plant;
      box.innerHTML = `<div class="pl-pneu">${m0.names.map(n => `<div class="cyl" data-c="${n}"><span class="cyl-n">${n}</span><div class="cyl-body"><span class="s0"></span><span class="s1"></span><i class="pis"></i><i class="rod"></i></div><span class="valve small tnum"></span></div>`).join('')}
        <div class="btn-row"><label class="small chk"><input type="checkbox" data-f="single"> katup solenoid tunggal</label><label class="small chk"><input type="checkbox" data-f="sensor"> 1B2 bergeser</label><label class="small chk"><input type="checkbox" data-f="hose"> selang B tertukar</label><label class="small chk"><input type="checkbox" data-f="lowp"> tekanan rendah</label></div>
        <p class="small muted seqlog"></p><p class="hazard" hidden></p></div>`;
      box.addEventListener('change', e => { const f = e.target.dataset.f; if (!f) return; if (f === 'single') sim.plant.single = e.target.checked; else sim.plant.faults[f] = e.target.checked; });
      const log = $('.seqlog', box), hz = $('.hazard', box);
      return () => {
        const m = sim.plant;
        m.names.forEach(n => {
          const el = $(`.cyl[data-c=${n}]`, box); if (!el) return;
          const p = m.pos[n] * 100;
          $('.pis', el).style.left = `calc(${p * 0.62}% + 2px)`;
          $('.rod', el).style.left = `calc(${p * 0.62}% + 12px)`;
          const i = ['A', 'B', 'C'].indexOf(n) + 1;
          $('.s0', el).classList.toggle('on', !!m.sensors[i + 'B1']);
          $('.s1', el).classList.toggle('on', !!m.sensors[i + 'B2']);
          $('.valve', el).textContent = m.valve[n] ? 'katup: maju' : 'katup: mundur';
        });
        log.textContent = m.log.length ? 'Gerak terakhir: ' + m.log.slice(-10).join(' ') : 'Gerak terakhir: belum ada.';
        hz.hidden = !m.conflict; hz.textContent = 'Dua solenoid katup yang sama aktif bersamaan. Periksa interlock output.';
      };
    }
  };

  STATION.press = {
    nama: 'Press elektrohidrolik', sub: 'katup 4/3, dua tangan, tahan 2 s',
    inputs: [
      { addr: '0.00', sym: 'S1', dev: 'tangan kiri', tipe: 'NO', c: 'g' }, { addr: '0.01', sym: 'S2', dev: 'tangan kanan', tipe: 'NO', c: 'g' }, { addr: '0.02', sym: 'POMPA', dev: 'selector', tipe: 'NO', kind: 'toggle' },
      { addr: '0.03', sym: 'ESTOP', dev: 'status E-stop', tipe: 'NC', kind: 'toggle', label: 'E-STOP', c: 'r' }, { addr: '0.06', sym: 'RESET', dev: 'S4', tipe: 'NO', c: 'b' },
      { addr: '0.04', sym: 'B1', dev: 'belakang', kind: 'auto', tipe: 'sensor' }, { addr: '0.05', sym: 'B2', dev: 'depan', kind: 'auto', tipe: 'sensor' }, { addr: '0.07', sym: 'PS', dev: 'pressure switch', kind: 'auto', tipe: '40 bar' }
    ],
    outputs: [{ addr: '100.00', sym: 'K1', dev: 'pompa' }, { addr: '100.01', sym: 'Y1', dev: 'maju' }, { addr: '100.02', sym: 'Y2', dev: 'mundur' }],
    model() {
      const m = { pos: 0, bar: 0, sensors: { B1: true, B2: false, PS: false }, block: 0.82, conflict: false, pump: false };
      m.step = (dt, cpu, field) => {
        const live = !field.ESTOP;
        m.pump = live && cpu.bit('100.00');
        const y1 = live && cpu.bit('100.01'), y2 = live && cpu.bit('100.02');
        if (y1 && y2) m.conflict = true;
        let dir = 0;
        if (m.pump) { if (y1 && !y2) dir = 1; if (y2 && !y1) dir = -1; }
        const limit = m.block > 0 ? m.block : 1;
        m.pos = clamp(m.pos + dir * 0.28 * dt / 1000, 0, limit);
        let target = m.pump ? 6 : 0;
        if (dir === 1 && m.pos >= limit) target = 50;
        else if (dir === 1) target = 18;
        else if (dir === -1) target = 12;
        else if (m.pos > 0 && !m.pump) target = m.bar;
        m.bar += (target - m.bar) * Math.min(1, dt / 350);
        m.sensors.B1 = m.pos <= 0.01; m.sensors.B2 = m.pos >= limit - 0.005 && limit >= 0.995; m.sensors.PS = m.bar >= 40;
      };
      return m;
    },
    view(box, sim) {
      box.innerHTML = `<div class="pl-press"><div class="press-v"><div class="pr-cyl"><i class="pr-rod"></i></div><div class="pr-work"></div></div>
        <div class="stack" style="gap:6px;min-width:0"><div class="stat-grid"><div><span>Tekanan</span><b class="tnum" data-v="bar">0 bar</b></div><div><span>Gaya (Ø 40 mm)</span><b class="tnum" data-v="f">0 N</b></div></div>
        <label class="small chk"><input type="checkbox" data-f="noblock"> tanpa benda (sampai sensor depan)</label><p class="hazard" hidden></p></div></div>`;
      const A = Math.PI * 0.04 * 0.04 / 4;
      box.addEventListener('change', e => { if (e.target.dataset.f === 'noblock') sim.plant.block = e.target.checked ? 1 : 0.82; });
      const rod = $('.pr-rod', box), b = $('[data-v=bar]', box), f = $('[data-v=f]', box), hz = $('.hazard', box), wk = $('.pr-work', box);
      return () => {
        const m = sim.plant;
        rod.style.height = (m.pos * 100) + '%'; b.textContent = fmtId(m.bar, 0) + ' bar'; f.textContent = fmtId(m.bar * 1e5 * A, 0) + ' N';
        wk.hidden = m.block >= 1;
        hz.hidden = !m.conflict; hz.textContent = 'Y1 dan Y2 aktif bersamaan. Tambahkan interlock output.';
      };
    }
  };

  STATION.sortir = {
    nama: 'Stasiun sortir', sub: 'GRAFCET, auto/manual, E-stop, hitungan',
    inputs: [
      { addr: '0.00', sym: 'START', dev: 'S1', tipe: 'NO', c: 'g' }, { addr: '0.01', sym: 'STOP', dev: 'STOP siklus', tipe: 'NC', c: 'r' }, { addr: '0.02', sym: 'RESET', dev: 'RESET', tipe: 'NO', c: 'b' },
      { addr: '0.03', sym: 'ESTOP', dev: 'status E-stop', tipe: 'NC', kind: 'toggle', label: 'E-STOP', c: 'r' }, { addr: '0.04', sym: 'AUTO', dev: 'selector', tipe: 'NO', kind: 'toggle' },
      { addr: '1.00', sym: 'JOGM', dev: 'jog konveyor', tipe: 'NO' }, { addr: '1.01', sym: 'JOGA', dev: 'jog silinder A', tipe: 'NO' }, { addr: '1.02', sym: 'JOGB', dev: 'jog silinder B', tipe: 'NO' },
      { addr: '0.05', sym: 'S1', dev: 'posisi sortir', kind: 'auto', tipe: 'foto' }, { addr: '0.06', sym: 'S2', dev: 'induktif', kind: 'auto', tipe: 'logam' }, { addr: '0.07', sym: 'A0', dev: 'A belakang', kind: 'auto', tipe: 'reed' }, { addr: '0.08', sym: 'A1', dev: 'A depan', kind: 'auto', tipe: 'reed' },
      { addr: '0.09', sym: 'B0', dev: 'B belakang', kind: 'auto', tipe: 'reed' }, { addr: '0.10', sym: 'B1', dev: 'B depan', kind: 'auto', tipe: 'reed' }, { addr: '0.11', sym: 'S0', dev: 'benda masuk', kind: 'auto', tipe: 'foto' }
    ],
    outputs: [{ addr: '100.00', sym: 'M1', dev: 'konveyor' }, { addr: '100.01', sym: 'Y1', dev: 'A maju' }, { addr: '100.02', sym: 'Y2', dev: 'B maju' }, { addr: '100.03', sym: 'H1', dev: 'READY' }, { addr: '100.04', sym: 'H2', dev: 'ALARM' }],
    model() {
      const m = { items: [], a: 0, b: 0, binL: 0, binN: 0, wrong: 0, sensors: { S0: false, S1: false, S2: false, A0: true, A1: false, B0: true, B1: false }, run: false, jam: false, s2bad: false, a1bad: false };
      m.add = metal => { if (!m.items.some(i => i.x < 18)) m.items.push({ x: 0, metal, stuck: m.jam }); };
      m.step = (dt, cpu, field) => {
        const live = !field.ESTOP;
        m.run = live && cpu.bit('100.00');
        const y1 = live && cpu.bit('100.01'), y2 = live && cpu.bit('100.02');
        m.a = clamp(m.a + (y1 ? 1 : -1) * 1.1 * dt / 1000, 0, 1);
        m.b = clamp(m.b + (y2 ? 1 : -1) * 1.1 * dt / 1000, 0, 1);
        const front = m.items.reduce((p, i) => Math.max(p, i.x), -1);
        m.items.forEach(it => {
          if (m.run && !(it.stuck && it.x >= 38) && it.x < 60) it.x = Math.min(60, it.x + dt * 0.024);
        });
        m.items = m.items.filter(it => {
          if (it.x >= 59.5 && m.a > 0.55) { m.binL++; if (!it.metal) m.wrong++; return false; }
          if (it.x >= 59.5 && m.b > 0.55) { m.binN++; if (it.metal) m.wrong++; return false; }
          return true;
        });
        void front;
        const at = m.items.find(i => i.x >= 59.5);
        m.sensors.S1 = !!at;
        m.sensors.S2 = !!(at && at.metal && !m.s2bad);
        m.sensors.S0 = m.items.some(i => i.x >= 6 && i.x <= 11);
        m.sensors.A0 = m.a <= 0.02; m.sensors.A1 = m.a >= 0.98 && !m.a1bad; m.sensors.B0 = m.b <= 0.02; m.sensors.B1 = m.b >= 0.98;
      };
      return m;
    },
    view(box, sim) {
      box.innerHTML = `<div class="pl-sort"><div class="so-field"><div class="so-belt"><div class="items"></div></div><span class="so-sens" style="left:8%"><i></i>S0</span><span class="so-sens" style="left:60%"><i></i>S1/S2</span>
        <div class="so-cyl a"><i></i><span>A</span></div><div class="so-cyl b"><i></i><span>B</span></div><div class="so-bin l"><b class="tnum" data-v="l">0</b>logam</div><div class="so-bin n"><b class="tnum" data-v="n">0</b>nonlogam</div></div>
        <div class="btn-row"><button type="button" class="btn btn-ghost small" data-a="m">${icon('plus')}Benda logam</button><button type="button" class="btn btn-ghost small" data-a="n">${icon('plus')}Benda nonlogam</button></div>
        <div class="btn-row"><label class="small chk"><input type="checkbox" data-f="jam"> benda macet</label><label class="small chk"><input type="checkbox" data-f="s2bad"> sensor induktif rusak</label><label class="small chk"><input type="checkbox" data-f="a1bad"> sensor A1 tidak terbaca</label><span class="small muted" data-v="wrong"></span></div></div>`;
      box.addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (b) sim.plant.add(b.dataset.a === 'm'); });
      box.addEventListener('change', e => { const f = e.target.dataset.f; if (f) sim.plant[f] = e.target.checked; });
      const its = $('.items', box), ca = $('.so-cyl.a i', box), cb = $('.so-cyl.b i', box), sn = $$('.so-sens', box), l = $('[data-v=l]', box), n = $('[data-v=n]', box), w = $('[data-v=wrong]', box), belt = $('.so-belt', box);
      return () => {
        const m = sim.plant;
        its.innerHTML = m.items.map(i => `<b class="${i.metal ? 'mt' : 'nm'}" style="left:${i.x}%"></b>`).join('');
        ca.style.height = (m.a * 30 + 4) + 'px'; cb.style.height = (m.b * 30 + 4) + 'px';
        sn[0].classList.toggle('on', m.sensors.S0); sn[1].classList.toggle('on', m.sensors.S1);
        l.textContent = m.binL; n.textContent = m.binN; belt.classList.toggle('run', m.run);
        w.textContent = m.wrong ? `Salah sortir: ${m.wrong}` : '';
      };
    }
  };

  // Tampilan sederhana untuk rangkaian relay: dipakai di materi Modul 1.
  STATION.relay = {
    nama: 'Rangkaian relay', sub: '',
    inputs: [
      { addr: '0.00', sym: 'S1', dev: 'START 13-14', tipe: 'NO', c: 'g', raw: true }, { addr: '0.01', sym: 'S0', dev: 'STOP 11-12', tipe: 'NO', c: 'r', raw: true }, { addr: '0.02', sym: 'F3', dev: 'test TOR', tipe: 'NO', kind: 'toggle', label: 'TOR trip', c: 'a', raw: true },
      { addr: '0.03', sym: 'S2', dev: 'KANAN', tipe: 'NO' }, { addr: '0.04', sym: 'S3', dev: 'KIRI', tipe: 'NO' }
    ],
    outputs: [{ addr: '100.00', sym: 'K1' }, { addr: '100.01', sym: 'K2' }, { addr: '100.02', sym: 'K3' }, { addr: '100.03', sym: 'H1', dev: 'RUN' }, { addr: '100.04', sym: 'H2', dev: 'TRIP' }],
    model(cfg) { return STATION.motor.model(cfg); },
    view(box, sim) { return STATION.motor.view(box, sim); }
  };

  const symsOf = st => { const s = {}; st.inputs.concat(st.outputs).forEach(x => { s[x.sym] = x.addr; }); return s; };

  /* ============================== Simulasi: PLC + stasiun ============================== */
  function Sim(stId, cfg) {
    this.stId = stId; this.st = STATION[stId]; this.cfg = cfg || {};
    this.cpu = new PLC.Cpu(); this.field = {}; this.plant = this.st.model(this.cfg); this.prog = null; this.acc = 0; this.running = true;
    this.syms = Object.assign(symsOf(this.st), this.cfg.syms || {});
  }
  Sim.prototype = {
    load(text) {
      const p = PLC.compile(text, this.syms);
      this.prog = p;
      if (!p.errors.length) this.cpu.load(p); else this.cpu.prog = null;
      this.onLoad && this.onLoad(p);
      return p;
    },
    resetPlant() { this.plant = this.st.model(this.cfg); },
    step(dt) {
      const { st, cpu, field, plant } = this;
      for (const i of st.inputs) {
        let v;
        if (i.kind === 'auto') v = !!plant.sensors[i.sym];
        else { const pressed = !!field[i.sym]; v = i.tipe === 'NC' ? !pressed : pressed; }
        cpu.setIn(i.addr, v);
      }
      if (this.running) cpu.scan(dt);
      plant.step(dt, cpu, field);
    },
    run(ms) { const n = Math.round(ms / 10); for (let i = 0; i < n; i++) this.step(10); },
    q(sym) { return this.cpu.bit(this.syms[sym] || sym); },
    tap(sym, ms) { this.field[sym] = true; this.run(ms || 150); this.field[sym] = false; this.run(150); },
    hold(sym, on) { this.field[sym] = !!on; this.run(60); }
  };

  const LIVE = new Set();
  let lastTs = 0, frame = 0;
  function loop(ts) {
    const dt = Math.min(ts - lastTs || 16, 100); lastTs = ts; frame++;
    LIVE.forEach(s => {
      if (!s.el || !s.el.isConnected) { LIVE.delete(s); return; }
      if (s.el.offsetParent === null) return;
      s.acc += dt * (s.speed || 1);
      while (s.acc >= 10) { s.step(10); s.acc -= 10; s.tick && s.tick(); }
      if (s.draw && (frame % 2 === 0)) s.draw();
    });
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  /* ============================== Panel lapangan ============================== */
  function fieldPanel(box, sim, opt) {
    opt = opt || {};
    const st = sim.st;
    const manual = st.inputs.filter(i => i.kind !== 'auto' && !(opt.hide || []).includes(i.sym));
    const leds = st.inputs.filter(i => !(opt.hide || []).includes(i.sym));
    const outs = st.outputs.filter(o => !(opt.hideOut || []).includes(o.sym));
    box.innerHTML = `<div class="fp-btns">${manual.map(i => `<button type="button" class="fbtn ${i.c || ''}${i.kind === 'toggle' ? ' tog' : ''}" data-s="${i.sym}" aria-pressed="false"><span class="cap"></span><b>${esc(i.label || i.sym)}</b><small>${esc(i.dev || '')}${i.raw ? '' : ' · ' + i.tipe}</small></button>`).join('')}</div>
      <div class="fp-io"><div class="io-group"><span class="io-t">Input</span>${leds.map(i => `<span class="led" data-a="${i.addr}" title="${esc(i.sym)}"><i></i><b>${i.addr}</b><small>${esc(i.sym)}</small></span>`).join('')}</div>
      <div class="io-group"><span class="io-t">Output</span>${outs.map(o => `<span class="led out" data-a="${o.addr}"><i></i><b>${o.addr}</b><small>${esc(o.sym)}${o.dev ? ' ' + esc(o.dev) : ''}</small></span>`).join('')}</div></div>`;
    const setBtn = (b, on) => { b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); };
    $$('.fbtn', box).forEach(b => {
      const s = b.dataset.s;
      if (b.classList.contains('tog')) {
        b.addEventListener('click', () => { sim.field[s] = !sim.field[s]; setBtn(b, sim.field[s]); });
      } else {
        const down = e => { e.preventDefault(); if (opt.isLatch && opt.isLatch()) { sim.field[s] = !sim.field[s]; setBtn(b, sim.field[s]); return; } sim.field[s] = true; setBtn(b, true); try { b.setPointerCapture(e.pointerId); } catch (x) { /* abaikan */ } };
        const up = () => { if (opt.isLatch && opt.isLatch()) return; sim.field[s] = false; setBtn(b, false); };
        b.addEventListener('pointerdown', down);
        b.addEventListener('pointerup', up);
        b.addEventListener('pointercancel', up);
        b.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); sim.field[s] = true; setBtn(b, true); } });
        b.addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Enter') { sim.field[s] = false; setBtn(b, false); } });
        b.addEventListener('contextmenu', e => e.preventDefault());
      }
    });
    const els = $$('.led', box).map(el => ({ el, a: PLC.parseBit(el.dataset.a) }));
    return () => { for (const x of els) x.el.classList.toggle('on', sim.cpu.gb(x.a)); };
  }

  /* ============================== Lab mini: satu rangkaian + ladder (dipakai di materi) ============================== */
  // cfg: { st, text, drive, names, hide, hideOut, vars:[{t,text,note}], note, nameLabel }
  function mini(box, cfg) {
    const sim = new Sim(cfg.st, { drive: cfg.drive, cyl: cfg.cyl });
    if (cfg.names) sim.names = cfg.names;
    box.classList.add('mini');
    const vars = cfg.vars || null;
    box.innerHTML = `${vars ? `<div class="seg" data-m="vars">${vars.map((v, i) => `<button type="button" data-i="${i}" class="${i ? '' : 'on'}">${esc(v.t)}</button>`).join('')}</div><p class="small muted" data-m="note" ${vars[0].note ? '' : 'hidden'}>${esc(vars[0].note || '')}</p>` : ''}
      <div class="mini-grid"><div class="stack"><div data-m="plant"></div><div data-m="field"></div>${cfg.hwToggle ? '<label class="small chk"><input type="checkbox" data-m="hw" checked> interlock kontak bantu NC terpasang</label>' : ''}${cfg.weldToggle ? '<label class="small chk"><input type="checkbox" data-m="weld"> kontak utama K1 lengket</label>' : ''}${cfg.latchToggle ? '<label class="small chk"><input type="checkbox" data-m="latch"> tombol jadi tahan (untuk mouse: klik sekali = tekan, klik lagi = lepas)</label>' : ''}<div class="btn-row"><button type="button" class="btn btn-ghost small" data-m="rst">${icon('reset')}Reset</button></div></div><div class="mini-lad" data-m="lad"></div></div>`;
    let drawPlant, drawField, lad;
    const build = (text, v) => {
      sim.resetPlant();
      sim.plant.hw = v && v.hw !== undefined ? v.hw : cfg.hw !== undefined ? cfg.hw : true;
      if (cfg.hwToggle) sim.plant.hw = $('[data-m=hw]', box).checked;
      if (cfg.weldToggle) sim.plant.K[0].weld = $('[data-m=weld]', box).checked;
      sim.field = {};
      const p = sim.load(text);
      lad = PLC.ladder($('[data-m=lad]', box), p, sim.cpu, { names: cfg.names });
      drawPlant = sim.st.view($('[data-m=plant]', box), sim);
      drawField = fieldPanel($('[data-m=field]', box), sim, { hide: cfg.hide, hideOut: cfg.hideOut, isLatch: () => { const l = $('[data-m=latch]', box); return !!(l && l.checked); } });
    };
    build(vars ? vars[0].text : cfg.text, vars && vars[0]);
    if (vars) $('[data-m=vars]', box).addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      $$('[data-m=vars] button', box).forEach(x => x.classList.toggle('on', x === b));
      const v = vars[+b.dataset.i]; const n = $('[data-m=note]', box); n.textContent = v.note || ''; n.hidden = !v.note;
      build(v.text, v);
    });
    const cur = () => { const b = vars && $('[data-m=vars] button.on', box); return vars ? vars[+b.dataset.i] : null; };
    $('[data-m=rst]', box).addEventListener('click', () => { const v = cur(); build(v ? v.text : cfg.text, v); });
    if (cfg.hwToggle) $('[data-m=hw]', box).addEventListener('change', e => { sim.plant.hw = e.target.checked; });
    if (cfg.weldToggle) $('[data-m=weld]', box).addEventListener('change', e => { sim.plant.K[0].weld = e.target.checked; if (!e.target.checked) { sim.plant.K[0].on = false; sim.plant.hazard = 0; } });
    sim.el = box;
    sim.draw = () => { lad && lad.update(); drawPlant && drawPlant(); drawField && drawField(); };
    LIVE.add(sim);
    return sim;
  }

  /* ============================== Program contoh ============================== */
  const PRE = {
    dol: `; Rung 0 - Motor DOL: STOP dan TOR berkontak NC di lapangan
LD      0.00      ; START
OR      100.00    ; pengunci K1
AND     0.01      ; STOP
AND     0.02      ; TOR
OUT     100.00    ; K1 motor
; Rung 1 - Lampu RUN
LD      100.00
OUT     100.03    ; H1 RUN
; Rung 2 - Lampu TRIP
LD NOT  0.02
OUT     100.04    ; H2 TRIP
END(001)`,
    setrst: `; DOL versi SET/RSET: RSET ditulis sesudah SET agar STOP berprioritas
LD      0.00      ; START
SET     100.00
LD NOT  0.01      ; STOP ditekan
OR NOT  0.02      ; TOR trip
RSET    100.00
LD      100.00
OUT     100.03
END(001)`,
    toggle: `; Satu tombol ON/OFF: DIFU membuat pulsa satu scan, KEEP menyimpan status
LD      0.00      ; tombol
DIFU    W0.00     ; pulsa tepi naik
LD      W0.00
AND NOT W0.01     ; set bila sedang OFF
LD      W0.00
AND     W0.01     ; reset bila sedang ON
KEEP(011) W0.01
LD      W0.01
OUT     100.03    ; H1
END(001)`,
    rev: `; Rung 0 - Putar kanan (K1): interlock tombol 0.04 dan output 100.01
LD      0.03      ; FWD
OR      100.00    ; pengunci K1
AND     0.01      ; STOP
AND     0.02      ; TOR
AND NOT 0.04      ; tombol REV
AND NOT 100.01    ; K2
OUT     100.00    ; K1 kanan
; Rung 1 - Putar kiri (K2): interlock tombol 0.03 dan output 100.00
LD      0.04      ; REV
OR      100.01    ; pengunci K2
AND     0.01      ; STOP
AND     0.02      ; TOR
AND NOT 0.03      ; tombol FWD
AND NOT 100.00    ; K1
OUT     100.01    ; K2 kiri
END(001)`,
    revgap: `; Putar kanan-kiri dengan jeda 2 s sebelum pembalikan
LD      0.03      ; FWD
OR      100.00
AND     0.01
AND     0.02
AND NOT 0.04
AND NOT 100.01
AND NOT W1.00     ; sedang jeda
OUT     100.00
LD      0.04      ; REV
OR      100.01
AND     0.01
AND     0.02
AND NOT 0.03
AND NOT 100.00
AND NOT W1.00
OUT     100.01
; Jeda aktif sejak motor mati sampai T000 selesai
LD      100.00
OR      100.01
SET     W1.01     ; motor pernah jalan
LD      W1.01
AND NOT 100.00
AND NOT 100.01
OUT     W1.00
LD      W1.00
TIM     000 #20   ; jeda 2,0 s
LD      T000
RSET    W1.01
END(001)`,
    yd: `; Rung 0 - Kontaktor utama K1
LD      0.00      ; START
OR      100.00    ; K1
AND     0.01      ; STOP
AND     0.02      ; TOR
OUT     100.00    ; K1 utama
; Rung 1 - Waktu hubungan bintang 5,0 s (TIM satuan 0,1 s)
LD      100.00
TIM     000 #50
; Rung 2 - K2 bintang, lepas saat T000 ON; interlock K3
LD      100.00
AND NOT T000      ; waktu Y
AND NOT 100.02    ; K3
OUT     100.01    ; K2 bintang
; Rung 3 - Jeda transisi 0,3 s
LD      T000
TIM     001 #3
; Rung 4 - K3 segitiga; interlock K2
LD      100.00
AND     T001      ; jeda
AND NOT 100.01    ; K2
OUT     100.02    ; K3 segitiga
END(001)`,
    conv: `; Konveyor berhitung dengan CNT 000 #10
LD      0.00      ; START
OR      100.00    ; pengunci
AND     0.01      ; STOP
AND     0.02      ; TOR
AND NOT C000      ; berhenti saat batch selesai
OUT     100.00    ; K1 motor konveyor
LD      100.00
OUT     100.03    ; H1 RUN
; Masukan hitung dan masukan reset
LD      0.05      ; sensor produk B1
LD      0.06      ; tombol RESET
CNT     000 #10   ; hitung turun 10 -> 0
LD      C000
OUT     100.05    ; H3 batch selesai
END(001)`,
    convwarn: `; Konveyor berhitung + peringatan: 2 produk lagi
LD      0.00
OR      100.00
AND     0.01
AND     0.02
AND NOT C000
OUT     100.00
LD      100.00
OUT     100.03
LD      0.05
LD      0.06
CNT     000 #10
LD      C000
OUT     100.05
; PV counter dibandingkan dengan konstanta BCD
LD <=   C000 #0002
AND NOT C000
OUT     100.04    ; H2 hampir selesai
END(001)`,
    one: `; Satu silinder: siklus tunggal, atau kontinu dengan selector
; E-stop mengunci sampai RESET agar mesin tidak bergerak sendiri
LD NOT  0.03      ; E-stop ditekan
OR      A200.11
SET     W0.01     ; butuh RESET
LD NOT  0.03
RSET    W0.00
LD      0.02      ; RESET
AND     0.03
RSET    W0.01
; Syarat maju: START atau selector, di posisi awal, aman
LD      0.00      ; START
OR      0.01      ; KONTINU
AND     0.04      ; 1B1 di belakang
AND     0.03
AND NOT W0.01
SET     W0.00     ; maju
; Sampai depan -> mundur
LD      0.05      ; 1B2 di depan
RSET    W0.00
; Keluaran
LD      W0.00
OUT     100.00    ; 1Y1 maju
LD NOT  W0.00
AND NOT 0.04
AND NOT W0.01
OUT     100.01    ; 1Y2 mundur
END(001)`,
    press: `; Pompa jalan saat selector ON dan E-stop aman
LD      0.02      ; POMPA
AND     0.03      ; E-stop aman
OUT     100.00    ; K1 pompa
; Jendela dua tangan 0,5 s, dihitung sejak tombol pertama
LD      0.00
OR      0.01
TIM     000 #5
; Dua tangan sah: keduanya ON dalam jendela, lalu harus tetap ditahan
LD      0.00
AND     0.01
AND NOT T000
OR      W0.00
AND     0.00
AND     0.01
AND     0.03
OUT     W0.00
LD      W0.00
DIFU    W0.04     ; satu mulai per penekanan
; Pengaman: siklus pertama atau E-stop
LD      A200.11
OR NOT  0.03
RSET    W0.01
RSET    W0.02
RSET    W0.03
; Mulai maju dari posisi awal
LD      W0.04
AND     0.04      ; B1
AND     100.00
SET     W0.01     ; langkah maju
; Sampai depan atau tekanan tercapai -> tahan
LD      W0.01
LD      0.05      ; B2
OR      0.07      ; pressure switch
AND LD
SET     W0.02     ; langkah tahan
RSET    W0.01
; Tahan 2,0 s
LD      W0.02
TIM     001 #20
LD      T001
SET     W0.03     ; langkah mundur
RSET    W0.02
; Sampai belakang -> selesai; RESET memulangkan silinder
LD      W0.03
AND     0.04
RSET    W0.03
LD      0.06      ; RESET
AND     0.03
AND NOT 0.04
SET     W0.03
; Keluaran dengan interlock Y1-Y2
LD      W0.01
AND     W0.00     ; dilepas = katup ke tengah
AND NOT 100.02
OUT     100.01    ; Y1 maju
LD      W0.03
AND NOT 100.01
OUT     100.02    ; Y2 mundur
END(001)`,
    sortir: `; Pengaman: siklus pertama, E-stop, atau MANUAL -> semua langkah OFF
LD      A200.11
OR NOT  0.03
OR NOT  0.04
RSET    W0.00
RSET    W0.01
RSET    W0.02
RSET    W0.03
RSET    W0.04
RSET    W0.05
RSET    W1.00
; RESET + homing: katup tunggal mundur sendiri, langkah 0 aktif saat A0.B0
LD      0.02      ; RESET
AND     0.03
AND     0.04
AND     0.07      ; A0
AND     0.09      ; B0
SET     W0.00
RSET    W0.01
RSET    W0.02
RSET    W0.03
RSET    W0.04
RSET    W0.05
RSET    W1.01
RSET    W1.02
; Langkah 0 -> 1
LD      W0.00
AND     0.00      ; START
AND     0.04      ; AUTO
AND     0.07      ; A0
AND     0.09      ; B0
AND NOT W1.01
SET     W0.01
RSET    W0.00
; STOP siklus: diingat sampai akhir siklus
LD NOT  0.01
AND     0.04
SET     W1.00
; Langkah 1 -> 2 (logam) atau 1 -> 3 (nonlogam)
LD      W0.01
AND     0.05      ; S1
AND     0.06      ; S2
SET     W0.02
RSET    W0.01
@++B(594) D0      ; hitung logam
LD      W0.01
AND     0.05      ; S1
AND NOT 0.06      ; S2
SET     W0.03
RSET    W0.01
@++B(594) D1      ; hitung nonlogam
; Sampai depan -> mundur
LD      W0.02
AND     0.08      ; A1
SET     W0.04
RSET    W0.02
LD      W0.03
AND     0.10      ; B1
SET     W0.05
RSET    W0.03
; Sampai belakang -> siklus berikut atau langkah 0
LD      W0.04
AND     0.07      ; A0
LD      W0.05
AND     0.09      ; B0
OR LD
OUT     W1.04     ; dorongan selesai
LD      W1.04
AND NOT W1.00
SET     W0.01
LD      W1.04
AND     W1.00
SET     W0.00
RSET    W1.00
LD      W1.04
RSET    W0.04
RSET    W0.05
; Watchdog: gerak silinder maks 3 s, benda sampai S1 maks 8 s
LD      W0.02
OR      W0.03
TIM     010 #30
LD      W0.04
OR      W0.05
TIM     011 #30
LD      0.11      ; S0 benda masuk
SET     W1.02
LD      0.05
RSET    W1.02
LD      W1.02
AND     100.00
TIM     012 #80
LD      T010
OR      T011
OR      T012
SET     W1.01     ; alarm
; Keluaran
LD      W0.01
AND NOT W1.01
LD      1.00      ; JOGM
AND NOT 0.04
OR LD
OUT     100.00    ; M1
LD      W0.02
AND NOT W1.01
LD      1.01      ; JOGA, interlock B di belakang
AND NOT 0.04
AND     0.09
OR LD
OUT     100.01    ; Y1
LD      W0.03
AND NOT W1.01
LD      1.02      ; JOGB, interlock A di belakang
AND NOT 0.04
AND     0.07
OR LD
OUT     100.02    ; Y2
LD      W0.00
OUT     100.03    ; H1 READY
LD      W1.01
OR NOT  0.03
OUT     100.04    ; H2 ALARM
END(001)`
  };

  // Menghasilkan program metode step bit dari notasi sekuens, mis. "A+ B+ B- A-".
  function parseSeq(txt) {
    const toks = txt.toUpperCase().replace(/[−–]/g, '-').trim().split(/[\s,]+/).filter(Boolean);
    if (toks.length < 2) return { err: 'Tulis minimal dua langkah, misalnya A+ A-.' };
    if (toks.length > 14) return { err: 'Maksimal 14 langkah.' };
    const pos = {}, steps = [];
    for (const t of toks) {
      const m = t.match(/^([ABC])([+-])$/);
      if (!m) return { err: `"${t}" tidak dikenal. Pakai silinder A, B, C dengan tanda + (maju) atau - (mundur).` };
      const c = m[1], d = m[2] === '+';
      if (pos[c] === undefined) { if (!d) return { err: `${c} masih di belakang, jadi langkah pertamanya harus ${c}+.` }; }
      else if (pos[c] === d) return { err: `${t} tidak mungkin: silinder ${c} sudah ${d ? 'di depan' : 'di belakang'}.` };
      pos[c] = d; steps.push({ c, d });
    }
    const open = Object.keys(pos).filter(c => pos[c]);
    if (open.length) return { err: `Sekuens harus berakhir di posisi awal. Tambahkan ${open.map(c => c + '-').join(' ')}.` };
    return { steps, cyl: ['A', 'B', 'C'].filter(c => c in pos) };
  }
  const SENS = { A: ['0.04', '0.05', '1B1', '1B2'], B: ['0.06', '0.07', '2B1', '2B2'], C: ['0.08', '0.09', '3B1', '3B2'] };
  const stepBit = k => `W${Math.floor(k / 16)}.${String(k % 16).padStart(2, '0')}`;
  function seqProgram(txt) {
    const r = parseSeq(txt); if (r.err) return r;
    const { steps, cyl } = r, n = steps.length, home = stepBit(n + 1), L = [];
    const homes = cyl.map(c => SENS[c][0]);
    L.push(`; Sekuens ${steps.map(s => s.c + (s.d ? '+' : '-')).join(' ')} (katup 5/2 solenoid ganda, metode step bit)`);
    L.push('; Siklus pertama atau E-stop: semua langkah OFF', 'LD      A200.11', 'OR NOT  0.03');
    for (let k = 0; k <= n + 1; k++) L.push(`RSET    ${stepBit(k)}`);
    L.push(`; RESET: pulangkan semua silinder lalu siap di langkah awal`, 'LD      0.02      ; RESET', 'AND     0.03');
    for (let k = 0; k <= n; k++) L.push(`AND NOT ${stepBit(k)}`);
    L.push(`SET     ${home}`);
    L.push(`LD      ${home}`);
    homes.forEach(a => L.push(`AND     ${a}`));
    L.push(`SET     ${stepBit(0)}`, `RSET    ${home}`);
    L.push(`; Langkah awal -> ${steps[0].c}${steps[0].d ? '+' : '-'}`, `LD      ${stepBit(0)}`, 'AND     0.00      ; START');
    homes.forEach(a => L.push(`AND     ${a}`));
    L.push(`SET     ${stepBit(1)}`, `RSET    ${stepBit(0)}`);
    steps.forEach((s, i) => {
      const sensor = SENS[s.c][s.d ? 1 : 0], nm = SENS[s.c][s.d ? 3 : 2];
      L.push(`; ${s.c}${s.d ? '+' : '-'} selesai saat ${nm} ON`, `LD      ${stepBit(i + 1)}`, `AND     ${sensor}      ; ${nm}`);
      L.push(`SET     ${i === n - 1 ? stepBit(0) : stepBit(i + 2)}`, `RSET    ${stepBit(i + 1)}`);
    });
    L.push('; Keluaran solenoid');
    cyl.forEach(c => {
      const [, , yp, ym] = CYL[c];
      const ps = steps.map((s, i) => (s.c === c && s.d ? stepBit(i + 1) : null)).filter(Boolean);
      const ms = steps.map((s, i) => (s.c === c && !s.d ? stepBit(i + 1) : null)).filter(Boolean);
      ps.forEach((b, i) => L.push(`${i ? 'OR ' : 'LD '}     ${b}`));
      L.push(`OUT     ${yp}    ; ${c}+`);
      ms.forEach((b, i) => L.push(`${i ? 'OR ' : 'LD '}     ${b}`));
      L.push(`OR      ${home}`, `OUT     ${ym}    ; ${c}-`);
    });
    L.push('END(001)');
    return { text: L.join('\n'), steps, cyl };
  }
  PRE.seq = seqProgram('A+ B+ B- A-').text;
  PRE.pick = seqProgram('B+ C+ B- A+ B+ C- B- A-').text;

  const PRESETS = {
    motor: [
      { id: 'dol', t: 'DOL dengan pengunci (Gambar 2.1)', text: PRE.dol, drive: 'dol' }, { id: 'setrst', t: 'DOL versi SET/RSET', text: PRE.setrst, drive: 'dol' }, { id: 'toggle', t: 'Toggle satu tombol (DIFU + KEEP)', text: PRE.toggle, drive: 'dol' },
      { id: 'rev', t: 'Putar kanan-kiri (Gambar 4.1)', text: PRE.rev, drive: 'rev' }, { id: 'yd', t: 'Bintang-segitiga (Gambar 4.2)', text: PRE.yd, drive: 'yd' }
    ],
    conv: [{ id: 'conv', t: 'Konveyor berhitung CNT #10', text: PRE.conv }, { id: 'convwarn', t: 'Konveyor + peringatan pembanding', text: PRE.convwarn }],
    pneu: [{ id: 'one', t: 'Satu silinder + sensor', text: PRE.one, cyl: ['A'] }, { id: 'seq', t: 'Sekuens A+ B+ B- A-', text: PRE.seq, cyl: ['A', 'B'] }, { id: 'pick', t: 'Pick-and-place 8 langkah', text: PRE.pick, cyl: ['A', 'B', 'C'] }],
    press: [{ id: 'press', t: 'Siklus press dua tangan', text: PRE.press }],
    sortir: [{ id: 'sortir', t: 'Sortir logam/nonlogam (Gambar 7.1)', text: PRE.sortir }]
  };

  /* ============================== Misi: diuji otomatis pada salinan simulasi ============================== */
  const hazardFree = s => !s.plant.hazard;
  const MISSIONS = [
    { id: 1, st: 'motor', drive: 'dol', p: 'P11', t: 'DOL dengan pengunci', d: 'START menyalakan K1 dan tetap ON setelah dilepas. STOP dan TOR trip mematikan K1. H1 mengikuti K1, H2 menyala saat TOR trip.',
      test(s) { const r = []; s.run(100); s.tap('START'); r.push(['START: K1 ON dan terkunci', s.q('K1')]); r.push(['H1 RUN menyala', s.q('H1')]); s.tap('STOP'); r.push(['STOP: K1 OFF', !s.q('K1')]); s.tap('START'); s.hold('TOR', true); r.push(['TOR trip: K1 OFF', !s.q('K1')]); r.push(['H2 TRIP menyala', s.q('H2')]); s.tap('START'); r.push(['START saat TOR trip: K1 tetap OFF', !s.q('K1')]); s.hold('TOR', false); s.run(100); r.push(['Setelah TOR normal, K1 tidak start sendiri', !s.q('K1')]); return r; } },
    { id: 2, st: 'motor', drive: 'dol', p: 'P12', t: 'STOP berprioritas dengan SET/RSET', d: 'Buat latch K1 dengan SET dan RSET. Saat START dan STOP ditekan bersamaan, K1 harus OFF.',
      test(s) { const r = []; const has = s.prog.rungs.some(x => x.ops.some(o => o.op === 'SET')) && s.prog.rungs.some(x => x.ops.some(o => o.op === 'RSET')); r.push(['Program memakai SET dan RSET', has]); s.run(100); s.tap('START'); r.push(['START: K1 terkunci', s.q('K1')]); s.tap('STOP'); r.push(['STOP: K1 OFF', !s.q('K1')]); s.field.START = true; s.field.STOP = true; s.run(200); r.push(['START + STOP bersamaan: K1 OFF', !s.q('K1')]); s.field.START = false; s.field.STOP = false; s.run(100); s.cpu.powerCycle(); s.run(100); r.push(['Daya pulih: K1 tidak start sendiri', !s.q('K1')]); return r; } },
    { id: 3, st: 'motor', drive: 'dol', p: 'P12', t: 'Toggle satu tombol', d: 'Tombol START menyalakan H1 pada tekanan pertama dan mematikannya pada tekanan kedua. Tahan tombol tidak boleh membuat lampu berkedip.',
      test(s) {
        const r = []; let ch = 0, last = false;
        const press = ms => { ch = 0; last = s.q('H1'); s.field.START = true; for (let i = 0; i < ms / 10; i++) { s.step(10); if (s.q('H1') !== last) { ch++; last = s.q('H1'); } } s.field.START = false; s.run(150); };
        s.run(100);
        press(150); r.push(['Tekan 1: H1 ON (berubah satu kali)', s.q('H1') && ch === 1]);
        press(150); r.push(['Tekan 2: H1 OFF (berubah satu kali)', !s.q('H1') && ch === 1]);
        press(1000); r.push(['Ditahan 1 detik: H1 berubah tepat satu kali, tidak berkedip', s.q('H1') && ch === 1]);
        return r;
      } },
    { id: 4, st: 'motor', drive: 'rev', p: 'P13', t: 'Putar kanan-kiri berinterlock', d: 'FWD menjalankan K1, REV menjalankan K2, STOP mematikan keduanya. Output K1 dan K2 tidak pernah ON bersamaan, termasuk saat tombol arah lawan ditekan atau kedua tombol ditekan sekaligus. Interlock hardware tetap terpasang.',
      test(s) {
        const r = []; let both = false;
        const watch = ms => { for (let i = 0; i < ms / 10; i++) { s.step(10); if (s.q('K1') && s.q('K2')) both = true; } };
        s.run(100); s.field.FWD = true; watch(150); s.field.FWD = false; watch(150);
        r.push(['FWD: K1 ON terkunci', s.q('K1') && !s.q('K2')]);
        s.field.REV = true; watch(300); s.field.REV = false; watch(300);
        r.push(['REV saat putar kanan: output tidak pernah bersamaan', !both]);
        s.tap('STOP'); r.push(['STOP: semua OFF', !s.q('K1') && !s.q('K2')]);
        s.field.REV = true; watch(150); s.field.REV = false; watch(150);
        r.push(['REV: K2 ON terkunci', s.q('K2') && !s.q('K1')]);
        s.tap('STOP'); s.field.FWD = true; s.field.REV = true; watch(300); s.field.FWD = false; s.field.REV = false; watch(200);
        r.push(['FWD + REV bersamaan: tidak keduanya ON', !both]);
        r.push(['Tidak terjadi hubung singkat', hazardFree(s)]);
        return r;
      } },
    { id: 5, st: 'motor', drive: 'yd', p: 'P14', t: 'Starter bintang-segitiga', d: 'START: K1 + K2 selama 5,0 s, K2 lepas, jeda minimal 0,2 s, lalu K1 + K3. K2 dan K3 tidak pernah ON bersamaan. STOP mematikan semua.',
      test(s) {
        const r = []; s.run(100); s.field.START = true; s.run(200); s.field.START = false;
        r.push(['START: K1 dan K2 ON', s.q('K1') && s.q('K2')]);
        let t = 200, tOff = null, tOn = null, both = false;
        for (let i = 0; i < 800; i++) { s.step(10); t += 10; if (s.q('K2') && s.q('K3')) both = true; if (tOff === null && !s.q('K2')) tOff = t; if (tOn === null && s.q('K3')) tOn = t; }
        r.push(['K2 (bintang) bertahan sekitar 5 s', tOff !== null && tOff >= 4800 && tOff <= 5300]);
        r.push(['Ada jeda transisi minimal 0,2 s sebelum K3', tOff !== null && tOn !== null && tOn - tOff >= 200]);
        r.push(['K2 dan K3 tidak pernah bersamaan', !both]);
        r.push(['Setelah jeda: K1 dan K3 ON', s.q('K1') && s.q('K3')]);
        s.tap('STOP'); r.push(['STOP: semua OFF', !s.q('K1') && !s.q('K2') && !s.q('K3')]);
        r.push(['Tidak terjadi hubung singkat', hazardFree(s)]);
        return r;
      } },
    { id: 6, st: 'conv', p: 'P15', t: 'Konveyor berhitung', d: 'START menjalankan K1. Setelah 10 produk melewati B1, K1 berhenti dan H3 menyala. RESET mengulang batch.',
      test(s) { const r = []; s.run(100); s.tap('RESET'); s.tap('START'); r.push(['START: konveyor jalan', s.q('K1')]); const pass = () => { s.field.__x = 0; s.plant.items.push({ x: 50 }); s.run(800); }; for (let i = 0; i < 9; i++) pass(); r.push(['9 produk: masih jalan', s.q('K1') && !s.q('H3')]); pass(); r.push(['10 produk: K1 berhenti', !s.q('K1')]); r.push(['H3 batch selesai menyala', s.q('H3')]); s.tap('RESET'); r.push(['RESET: H3 padam', !s.q('H3')]); s.tap('START'); r.push(['START lagi: jalan', s.q('K1')]); return r; } },
    { id: 7, st: 'pneu', cyl: ['A', 'B'], p: 'P19', t: 'Sekuens A+ B+ B- A-', d: 'Setelah RESET, START menjalankan satu siklus berurutan A+ B+ B- A- dan berhenti di posisi awal. Tiap langkah menunggu sensor. E-stop menghentikan sekuens.',
      test(s) { const r = []; s.run(100); s.tap('RESET'); s.run(300); s.plant.log = []; s.tap('START'); s.run(7000); r.push(['Urutan gerak A+ B+ B- A-', s.plant.log.join(' ') === 'A+ B+ B- A-']); r.push(['Berhenti di posisi awal', s.plant.pos.A === 0 && s.plant.pos.B === 0]); s.plant.log = []; s.run(1000); r.push(['Tidak mengulang sendiri', s.plant.log.length === 0]); s.plant.faults.sensor = true; s.tap('START'); s.run(4000); r.push(['1B2 tidak terbaca: B tidak bergerak (menunggu sensor)', s.plant.pos.B === 0]); s.plant.faults.sensor = false; s.field.ESTOP = true; s.run(300); s.field.ESTOP = false; s.run(300); s.plant.log = []; s.run(2000); r.push(['E-stop dilepas: tidak bergerak sendiri', s.plant.log.length === 0]); s.tap('RESET'); s.run(2500); r.push(['RESET memulangkan silinder', s.plant.pos.A === 0 && s.plant.pos.B === 0]); return r; } },
    { id: 8, st: 'press', p: 'P21', t: 'Press dua tangan', d: 'Silinder maju hanya bila S1 dan S2 ditekan dalam 0,5 s dan tetap ditahan. Dilepas: berhenti. Satu tangan atau terlambat: tidak maju.',
      test(s) { const r = []; s.field.POMPA = true; s.run(200); s.field.S1 = true; s.run(1000); r.push(['Satu tangan: tidak maju', s.plant.pos === 0]); s.field.S2 = true; s.run(500); r.push(['Tangan kedua terlambat: tidak maju', s.plant.pos === 0]); s.field.S1 = false; s.field.S2 = false; s.run(200); s.field.S1 = true; s.run(100); s.field.S2 = true; s.run(700); r.push(['Dua tangan dalam 0,5 s: maju', s.plant.pos > 0.05]); s.field.S2 = false; s.run(100); const p = s.plant.pos; s.run(500); r.push(['Satu dilepas: berhenti', Math.abs(s.plant.pos - p) < 0.01]); s.field.S1 = false; s.run(100); r.push(['Y1 dan Y2 tidak pernah bersamaan', !s.plant.conflict]); return r; } },
    { id: 9, st: 'sortir', p: 'P28', t: 'Sortir logam dan nonlogam', d: 'Mode AUTO: RESET, START, lalu benda logam didorong A dan nonlogam didorong B. D0 menghitung logam dan D1 nonlogam (BCD).',
      test(s) { const r = []; s.field.AUTO = true; s.run(200); s.tap('RESET'); r.push(['RESET: H1 READY menyala', s.q('H1')]); s.tap('START'); r.push(['START: konveyor jalan', s.q('M1')]); s.plant.add(true); s.run(6500); s.plant.add(false); s.run(6500); s.plant.add(true); s.run(6500); r.push(['Logam masuk bak logam (2)', s.plant.binL === 2]); r.push(['Nonlogam masuk bak nonlogam (1)', s.plant.binN === 1]); r.push(['Tidak ada salah sortir', s.plant.wrong === 0]); r.push(['D0 = 2 dan D1 = 1', s.cpu.word('D0') === 2 && s.cpu.word('D1') === 1]); s.field.ESTOP = true; s.run(300); r.push(['E-stop: konveyor berhenti', !s.q('M1')]); s.field.ESTOP = false; s.run(500); r.push(['E-stop dilepas: tidak jalan sendiri', !s.q('M1')]); return r; } }
  ];
  function runTest(def, text) {
    const s = new Sim(def.st, { drive: def.drive, cyl: def.cyl });
    const p = s.load(text);
    if (p.errors.length) return { ok: false, res: [[`Baris ${p.errors[0].line}: ${p.errors[0].msg}`, false]] };
    if (!p.rungs.length) return { ok: false, res: [['Program masih kosong', false]] };
    let res;
    try { res = def.test(s); } catch (e) { res = [['Pengujian berhenti: ' + e.message, false]]; }
    return { ok: res.every(x => x[1]), res };
  }

  /* ============================== Lab PLC (halaman penuh) ============================== */
  function mountLab(box) {
    const saved = store.get('lab', { st: 'motor', pre: 'dol', text: {} });
    if (!PRESETS[saved.st]) saved.st = 'motor';
    box.innerHTML = `<div class="lab-top">
        <label class="field">Stasiun<select data-l="st">${Object.keys(PRESETS).map(k => `<option value="${k}">${esc(STATION[k].nama)}</option>`).join('')}</select></label>
        <label class="field">Program contoh<select data-l="pre"></select></label>
        <div class="stack lab-ctl"><div class="btn-row"><button class="btn btn-primary small" type="button" data-l="run">${icon('play')}RUN</button><button class="btn btn-ghost small" type="button" data-l="power">${icon('reset')}Matikan-hidupkan daya</button><label class="small chk"><input type="checkbox" data-l="latch"> tombol jadi tahan</label></div><span class="small muted" data-l="stat"></span></div>
      </div>
      <div class="lab-grid">
        <div class="stack lab-left">
          <div class="panel"><h3 data-l="sttitle"></h3><div data-l="plant"></div><div data-l="field"></div><div data-l="extra"></div></div>
          <div class="panel"><h3>Diagram waktu</h3><div class="trace" data-l="trace"></div><p class="small muted">20 detik terakhir. Ketuk nama alamat di tab Monitor untuk menambah atau melepas sinyal.</p></div>
        </div>
        <div class="stack lab-right">
          <nav class="tabnav lab-tabs" role="tablist"><button type="button" class="on" data-t="lad">Ladder</button><button type="button" data-t="edit">Mnemonik</button><button type="button" data-t="mon">Monitor</button><button type="button" data-t="mis">Misi</button></nav>
          <div class="panel lt" data-p="lad"><div data-l="lad"></div></div>
          <div class="panel lt" data-p="edit" hidden><div class="keypad-row" data-l="keys"></div><textarea class="mono code-area" data-l="text" rows="16" spellcheck="false" autocapitalize="characters" autocomplete="off"></textarea>
            <div class="btn-row"><button class="btn btn-primary small" type="button" data-l="load">${icon('down')}Program check + unduh ke PLC</button><button class="btn btn-ghost small" type="button" data-l="copy">${icon('copy')}Salin</button></div><div data-l="check"></div></div>
          <div class="panel lt" data-p="mon" hidden><div data-l="mon"></div></div>
          <div class="panel lt" data-p="mis" hidden><p class="small muted">Tulis programnya di tab Mnemonik, lalu tekan <b>Uji program</b>. Pemeriksa menjalankan program pada salinan stasiun dan mencoba skenario normal dan gagal.</p><div class="stack" data-l="mis"></div></div>
        </div>
      </div>`;
    const L = k => $(`[data-l=${k}]`, box);
    let sim, drawPlant, drawField, lad, trace = [], watch = {}, curPre = null;
    const save = () => { const d = store.get('lab', { text: {} }); d.st = L('st').value; d.pre = L('pre').value; d.text = d.text || {}; d.text[d.st + ':' + d.pre] = L('text').value; store.set('lab', d); };
    const WATCH_DEF = { motor: ['0.00', '100.00', '100.01', '100.02'], conv: ['0.05', '100.00', '100.05'], pneu: ['100.00', '100.02', '0.05', '0.07'], press: ['0.00', '0.01', '100.01', '100.02'], sortir: ['100.00', '100.01', '100.02', '0.05'] };

    function presetsFor(st) { return PRESETS[st].concat([{ id: 'kosong', t: '(program kosong)', text: '; Tulis programmu di sini\n\nEND(001)' }]); }
    function setStation(st, preId, keepText) {
      L('st').value = st;
      L('pre').innerHTML = presetsFor(st).map(p => `<option value="${p.id}">${esc(p.t)}</option>`).join('');
      if (preId && presetsFor(st).some(p => p.id === preId)) L('pre').value = preId;
      setPreset(keepText);
    }
    function setPreset(keepText) {
      const st = L('st').value, pre = presetsFor(st).find(p => p.id === L('pre').value) || presetsFor(st)[0];
      curPre = pre;
      const d = store.get('lab', { text: {} });
      const text = (keepText && d.text && d.text[st + ':' + pre.id]) || pre.text;
      L('text').value = text;
      build();
    }
    function build() {
      const st = L('st').value, pre = curPre;
      sim = new Sim(st, { drive: pre.drive || (st === 'motor' ? 'dol' : undefined), cyl: pre.cyl });
      window.__labSim = sim;
      const p = sim.load(L('text').value);
      L('sttitle').textContent = sim.st.nama + (sim.st.sub ? ' · ' + sim.st.sub : '');
      drawPlant = sim.st.view(L('plant'), sim);
      drawField = fieldPanel(L('field'), sim, { isLatch: () => L('latch').checked });
      if (st === 'motor') {
        L('extra').innerHTML = `<div class="btn-row"><label class="field" style="min-width:12rem">Rangkaian daya<select data-x="drive"><option value="dol">DOL</option><option value="rev">Kanan-kiri</option><option value="yd">Bintang-segitiga</option></select></label><label class="small chk"><input type="checkbox" data-x="hw" checked> interlock hardware (NC) terpasang</label><label class="small chk"><input type="checkbox" data-x="weld"> K1 lengket</label></div>`;
        const dr = $('[data-x=drive]', L('extra')); dr.value = sim.plant.drive;
        dr.addEventListener('change', () => { sim.plant.drive = dr.value; sim.plant.hazard = 0; });
        $('[data-x=hw]', L('extra')).addEventListener('change', e => { sim.plant.hw = e.target.checked; });
        $('[data-x=weld]', L('extra')).addEventListener('change', e => { sim.plant.K[0].weld = e.target.checked; if (!e.target.checked) { sim.plant.K[0].on = false; sim.plant.hazard = 0; } });
      } else L('extra').innerHTML = '';
      showCheck(p);
      lad = PLC.ladder(L('lad'), p, sim.cpu);
      trace = []; watch = {}; (WATCH_DEF[st] || []).forEach(a => { watch[a] = true; });
      buildMon();
      missions();
      sim.el = box; sim.draw = draw; sim.tick = tick;
      updateRun();
      LIVE.forEach(s => { if (s !== sim && s.el === box) LIVE.delete(s); });
      LIVE.add(sim);
    }
    let sampleT = 0;
    function tick() {
      sampleT += 10;
      if (sampleT >= 100) { sampleT = 0; const row = {}; Object.keys(watch).forEach(a => { row[a] = sim.cpu.bit(a); }); trace.push(row); if (trace.length > 200) trace.shift(); }
    }
    function drawTrace() {
      const keys = Object.keys(watch), w = 600, rowH = 26;
      const name = a => { const s = sim.st.inputs.concat(sim.st.outputs).find(x => x.addr === a); return s ? s.sym : a; };
      L('trace').innerHTML = `<svg viewBox="0 0 ${w} ${keys.length * rowH + 6}" preserveAspectRatio="none" style="width:100%" aria-hidden="true">${keys.map((a, i) => {
        const y0 = i * rowH + 20, y1 = i * rowH + 6;
        let d = '', px = w - 66, prev = null;
        const X = k => 60 + (k + 200 - trace.length) * (w - 66) / 200;
        trace.forEach((r, k) => { const yy = r[a] ? y1 : y0; d += prev === null ? `M${X(k)} ${yy}` : (prev === yy ? `H${X(k)}` : `V${yy}H${X(k)}`); prev = yy; });
        void px;
        return `<text x="2" y="${y0 - 2}" class="tr-n">${esc(name(a))}</text><path d="M60 ${y0}H${w}" class="tr-b"/><path d="${d}" class="tr-s"/>`;
      }).join('')}</svg>`;
    }
    let f2 = 0;
    function draw() {
      lad && lad.update(); drawPlant && drawPlant(); drawField && drawField();
      f2++;
      if (f2 % 6 === 0) { drawTrace(); if (!L('mon').closest('.lt').hidden) monUpdate(); }
      L('stat').textContent = `${sim.running ? 'RUN' : 'PROGRAM'} · ${(sim.cpu.t / 1000).toFixed(1).replace('.', ',')} s · ${sim.cpu.scans.toLocaleString('id-ID')} scan${sim.cpu.err ? ' · ' + sim.cpu.err : ''}`;
    }
    function updateRun() { L('run').innerHTML = sim.running ? `${icon('x')}Mode PROGRAM` : `${icon('play')}Mode RUN`; L('run').classList.toggle('btn-primary', !sim.running); L('run').classList.toggle('btn-ghost', sim.running); }
    function showCheck(p) {
      const c = L('check');
      if (p.errors.length) c.innerHTML = `<div class="verdict bad"><b>Program check: ${p.errors.length} kesalahan. Program tidak diunduh.</b><ul class="list small">${p.errors.map(e => `<li>Baris ${e.line}: ${esc(e.msg)}</li>`).join('')}</ul></div>`;
      else c.innerHTML = `<div class="verdict ${p.warns.length ? 'warn' : 'good'}"><b>Program check: 0 kesalahan, ${p.warns.length} peringatan. ${p.rungs.length} rung diunduh.</b>${p.warns.length ? `<ul class="list small">${p.warns.map(e => `<li>Baris ${e.line}: ${esc(e.msg)}</li>`).join('')}</ul>` : ''}</div>`;
    }
    function buildMon() {
      const st = sim.st, rows = st.inputs.concat(st.outputs);
      const dyn = [];
      sim.prog.rungs.forEach(r => r.ops.forEach(o => { if (o.addr && o.addr.a !== 'CIO' && !dyn.includes(o.addr.txt)) dyn.push(o.addr.txt); }));
      L('mon').innerHTML = `<h3>Bit</h3><div class="tbl-wrap"><table class="tbl mono small mon"><thead><tr><th>Alamat</th><th>Simbol</th><th>Status</th><th>Force</th></tr></thead><tbody>
        ${rows.concat(dyn.map(a => ({ addr: a, sym: '' }))).map(x => `<tr><td><button type="button" class="linkish" data-wt="${x.addr}">${x.addr}</button></td><td>${esc(x.sym)}</td><td data-b="${x.addr}"></td><td class="fc"><button type="button" class="btn btn-ghost tiny" data-fs="${x.addr}">Set</button><button type="button" class="btn btn-ghost tiny" data-fr="${x.addr}">Rst</button><button type="button" class="btn btn-ghost tiny" data-fx="${x.addr}">Batal</button></td></tr>`).join('')}</tbody></table></div>
        <h3>Word, timer, counter</h3><div class="tbl-wrap"><table class="tbl mono small"><thead><tr><th>Alamat</th><th>Isi (heksa/BCD)</th></tr></thead><tbody data-l="words"></tbody></table></div><p class="small muted">Force dipakai hanya atas izin guru dan wajib dibatalkan setelah uji.</p>`;
      L('mon').onclick = e => {
        const t = e.target;
        if (t.dataset.wt) { if (watch[t.dataset.wt]) delete watch[t.dataset.wt]; else watch[t.dataset.wt] = true; trace = []; }
        if (t.dataset.fs) { sim.cpu.force(t.dataset.fs, true); }
        if (t.dataset.fr) { sim.cpu.force(t.dataset.fr, false); }
        if (t.dataset.fx) { sim.cpu.force(t.dataset.fx, null); }
      };
    }
    function monUpdate() {
      $$('[data-b]', L('mon')).forEach(td => {
        const a = td.dataset.b, on = sim.cpu.bit(a), f = sim.cpu.forced[Object.values(PLC.parseBit(a)).slice(0, 3).join(':')];
        td.innerHTML = `<span class="tag ${on ? 'ok' : ''}">${on ? 'ON' : 'OFF'}</span>${f !== undefined ? ' <span class="tag warn">F</span>' : ''}`;
      });
      const tb = L('words'); if (!tb) return;
      const rows = [];
      sim.prog.rungs.forEach(r => r.ops.forEach(o => {
        if (o.op === 'TIM' || o.op === 'TIMH') rows.push(['T' + String(o.n).padStart(3, '0'), PLC.hex4(sim.cpu.gw({ a: 'T', w: o.n })) + (sim.cpu.T[o.n] && sim.cpu.T[o.n].flag ? ' · flag ON' : '')]);
        if (o.op === 'CNT' || o.op === 'CNTR') rows.push(['C' + String(o.n).padStart(3, '0'), PLC.hex4(sim.cpu.gw({ a: 'C', w: o.n })) + (sim.cpu.C[o.n] && sim.cpu.C[o.n].flag ? ' · flag ON' : '')]);
        if (o.a && o.a.a === 'D') rows.push([o.a.txt, PLC.hex4(sim.cpu.gw(o.a))]);
      }));
      tb.innerHTML = rows.length ? rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('') : '<tr><td colspan="2">Belum ada.</td></tr>';
    }
    function missions() {
      const st = L('st').value, done = store.get('misi', {});
      const list = MISSIONS.filter(m => m.st === st);
      L('mis').innerHTML = list.map(m => `<div class="q${done[m.id] ? ' done' : ''}" data-mi="${m.id}"><div class="q-head"><span class="n">${m.p}</span><b>${esc(m.t)}</b>${done[m.id] ? '<span class="tag ok">lulus</span>' : ''}</div><p class="small">${esc(m.d)}</p><div class="btn-row"><button type="button" class="btn btn-primary small" data-go="${m.id}">Uji program</button></div><div data-res="${m.id}"></div></div>`).join('') + (MISSIONS.length !== list.length ? `<p class="small muted">Misi lain ada di stasiun: ${[...new Set(MISSIONS.filter(m => m.st !== st).map(m => STATION[m.st].nama))].join(', ')}.</p>` : '');
    }
    L('mis').addEventListener('click', e => {
      const b = e.target.closest('[data-go]'); if (!b) return;
      const m = MISSIONS.find(x => x.id === +b.dataset.go);
      const out = runTest(m, L('text').value);
      $(`[data-res="${m.id}"]`, box).innerHTML = `<ul class="checks small">${out.res.map(([t, ok]) => `<li class="${ok ? 'pass' : 'fail'}">${ok ? '✓' : '✕'} ${esc(t)}</li>`).join('')}</ul>`;
      if (out.ok) { const d = store.get('misi', {}); d[m.id] = true; store.set('misi', d); toast('Misi lulus'); const q = b.closest('.q'); q.classList.add('done'); if (!$('.tag.ok', q)) $('.q-head', q).insertAdjacentHTML('beforeend', '<span class="tag ok">lulus</span>'); }
      else toast('Masih ada skenario yang gagal');
    });
    const KEYS = ['LD ', 'LD NOT ', 'AND ', 'AND NOT ', 'OR ', 'OR NOT ', 'OUT ', 'AND LD', 'OR LD', 'SET ', 'RSET ', 'KEEP(011) ', 'DIFU(013) ', 'TIM 000 #', 'CNT 000 #', 'END(001)'];
    L('keys').innerHTML = KEYS.map(k => `<button type="button" class="btn btn-ghost tiny mono" data-k="${esc(k)}">${esc(k.trim())}</button>`).join('');
    L('keys').addEventListener('click', e => {
      const b = e.target.closest('[data-k]'); if (!b) return;
      const ta = L('text'), s = ta.selectionStart, v = ta.value;
      const atStart = s === 0 || v[s - 1] === '\n';
      const ins = (atStart ? '' : '\n') + b.dataset.k;
      ta.value = v.slice(0, s) + ins + v.slice(ta.selectionEnd);
      ta.selectionStart = ta.selectionEnd = s + ins.length; ta.focus(); save();
    });
    L('st').addEventListener('change', () => { setStation(L('st').value, null, true); save(); });
    L('pre').addEventListener('change', () => { setPreset(true); save(); });
    L('text').addEventListener('input', save);
    L('load').addEventListener('click', () => { build(); save(); const p = sim.prog; toast(p.errors.length ? 'Program check gagal' : 'Program diunduh ke PLC'); });
    L('copy').addEventListener('click', () => { window.U.copy && window.U.copy(L('text').value); });
    L('run').addEventListener('click', () => { sim.running = !sim.running; if (!sim.running) { /* mode PROGRAM: output OFF */ sim.cpu.m.CIO = {}; } updateRun(); });
    L('power').addEventListener('click', () => { sim.cpu.powerCycle(); sim.field = {}; $$('.fbtn', L('field')).forEach(b => { b.classList.remove('on'); }); toast('Daya dimatikan lalu dihidupkan: W, output, dan timer hilang; H dan D bertahan'); });
    $('.lab-tabs', box).addEventListener('click', e => {
      const b = e.target.closest('[data-t]'); if (!b) return;
      $$('.lab-tabs button', box).forEach(x => x.classList.toggle('on', x === b));
      $$('.lt', box).forEach(p => { p.hidden = p.dataset.p !== b.dataset.t; });
    });
    setStation(saved.st, saved.pre, true);
    return {
      open(st, pre, text, cyl) {
        setStation(st, pre, false);
        if (cyl) curPre = Object.assign({}, curPre, { cyl });
        if (text) { L('text').value = text; build(); }
        save();
      },
      text: () => L('text').value,
      missions: () => MISSIONS.map(m => ({ id: m.id, p: m.p, t: m.t, st: STATION[m.st].nama, ok: !!store.get('misi', {})[m.id] }))
    };
  }

  window.STN = { Sim, mini, mountLab, fieldPanel, runTest, PRE, MISSIONS, STATION, PRESETS, parseSeq, seqProgram, LIVE, CYL };
})();
