/* Widget materi dan alat praktik: siklus scan, alamat Omron, NPN/PNP, multimeter, commissioning, diagram langkah,
 * kalkulator, GRAFCET sortir, Lab HMI, dan Lab jaringan. Setiap widget dipasang lewat atribut data-w. */
(function () {
  'use strict';
  const { $, $$, esc, store, icon, toast } = window.U;
  const PLC = window.PLC, STN = window.STN;
  const fmt = (v, d) => Number(v).toLocaleString('id-ID', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });
  const W = {};

  /* ---------------- Lab mini (rangkaian relay dan PLC di dalam materi) ---------------- */
  const RELAY_NAMES = {
    '0.02!': { top: 'F3 95-96', bot: 'TOR' }, '0.02': { top: 'F3 97-98', bot: 'TOR trip' }, '0.01!': { top: 'S0 11-12', bot: 'STOP' },
    '0.00': { top: 'S1 13-14', bot: 'START' }, '100.00': { top: 'K1 13-14', bot: 'pengunci' }, '100.00!': { top: 'K1 21-22', bot: 'interlock' },
    '100.01': { top: 'K2 13-14', bot: 'pengunci' }, '100.01!': { top: 'K2 21-22', bot: 'interlock' }, '100.02!': { top: 'K3 21-22', bot: 'interlock' },
    '0.03': { top: 'S2 13-14', bot: 'KANAN' }, '0.03!': { top: 'S2 21-22', bot: 'interlock tombol' }, '0.04': { top: 'S3 13-14', bot: 'KIRI' }, '0.04!': { top: 'S3 21-22', bot: 'interlock tombol' },
    '100.03': { top: 'H1', bot: 'lampu RUN' }, '100.04': { top: 'H2', bot: 'lampu TRIP' }, T000: { top: 'KT 67-68', bot: 'kontak tunda' }, 'T000!': { top: 'KT 55-56', bot: 'kontak tunda' },
    '100.00()': { top: 'K1 A1-A2', bot: 'kontaktor' }, '100.01()': { top: 'K2 A1-A2', bot: 'kontaktor' }, '100.02()': { top: 'K3 A1-A2', bot: 'kontaktor' }, '100.03()': { top: 'H1', bot: 'lampu RUN' }, '100.04()': { top: 'H2', bot: 'lampu TRIP' }
  };
  const R_DOL = (seal) => `; Jalur 1 - Kumparan K1 dengan pengunci (self-holding)
LD NOT  0.02
AND NOT 0.01
LD      0.00
${seal}
AND LD
OUT     100.00
; Jalur 2 - Lampu RUN
LD      100.00
OUT     100.03
; Jalur 3 - Lampu TRIP
LD      0.02
OUT     100.04
END(001)`;
  const R_REV = il => `; Jalur 1 - K1 putar kanan
LD NOT  0.02
AND NOT 0.01
LD      0.03
OR      100.00
AND LD
${il ? 'AND NOT 0.04\nAND NOT 100.01\n' : ''}OUT     100.00
; Jalur 2 - K2 putar kiri
LD NOT  0.02
AND NOT 0.01
LD      0.04
OR      100.01
AND LD
${il ? 'AND NOT 0.03\nAND NOT 100.00\n' : ''}OUT     100.01
END(001)`;
  const R_YD = `; Jalur 1 - K1 utama dengan pengunci
LD NOT  0.02
AND NOT 0.01
LD      0.00
OR      100.00
AND LD
OUT     100.00
; Jalur 2 - Timer KT (on-delay 5 s)
LD      100.00
TIM     000 #50
; Jalur 3 - K2 bintang lewat kontak tunda NC dan interlock K3
LD      100.00
AND NOT T000
AND NOT 100.02
OUT     100.01
; Jalur 4 - K3 segitiga lewat kontak tunda NO dan interlock K2
LD      100.00
AND     T000
AND NOT 100.01
OUT     100.02
END(001)`;
  const P = STN.PRE;
  const MINI = {
    'relay-dol': { st: 'relay', drive: 'dol', names: RELAY_NAMES, hide: ['S2', 'S3'], hideOut: ['K2', 'K3'], vars: [
      { t: 'Benar', text: R_DOL('OR      100.00'), note: 'K1 13-14 diparalel dengan S1: setelah START dilepas, arus tetap mengalir lewat kontak bantu K1.' },
      { t: 'Pengunci NC (salah)', text: R_DOL('OR NOT  100.00'), note: 'Kontak pengunci memakai NC 21-22: begitu K1 menarik, kontaknya membuka, K1 lepas, kontak menutup lagi. Kontaktor bergetar (chatter).' },
      { t: 'Pengunci seri (salah)', text: R_DOL('AND     100.00'), note: 'Kontak pengunci dipasang seri dengan START: K1 tidak pernah bisa menarik karena kontaknya sendiri masih terbuka.' }] },
    'relay-rev': { st: 'relay', drive: 'rev', names: RELAY_NAMES, hide: ['S1'], hideOut: ['K3', 'H1', 'H2'], vars: [
      { t: 'Interlock kontak bantu + tombol', text: R_REV(true), hw: true, note: 'K2 21-22 di jalur K1 dan K1 21-22 di jalur K2. Tombol lawan juga memutus jalur (interlock tombol).' },
      { t: 'Tanpa interlock (berbahaya)', text: R_REV(false), hw: false, note: 'Tekan KANAN lalu KIRI: kedua kontaktor menutup dan terjadi hubung singkat antarfasa.' }] },
    'relay-yd': { st: 'relay', drive: 'yd', names: Object.assign({}, RELAY_NAMES, { '100.01!': { top: 'K2 21-22', bot: 'interlock' } }), hide: ['S2', 'S3'], hideOut: ['H1', 'H2'], text: R_YD, hw: true },
    'plc-dol': { st: 'motor', drive: 'dol', hide: ['FWD', 'REV', 'RESET'], hideOut: ['K2', 'K3', 'H3'], vars: [
      { t: 'Ladder benar', text: P.dol, note: 'STOP dan TOR berkontak NC di lapangan, jadi input-nya ON saat normal dan ditulis kontak NO di ladder.' },
      { t: 'STOP ditulis NC (salah)', text: P.dol.replace('AND     0.01      ; STOP', 'AND NOT 0.01      ; STOP'), note: 'Input STOP ON saat normal. Kontak NC di ladder justru terbuka, sehingga motor tidak bisa start sama sekali.' }] },
    'plc-latch': { st: 'motor', drive: 'dol', hide: ['FWD', 'REV', 'RESET', 'TOR'], hideOut: ['K2', 'K3', 'H2', 'H3'], vars: [
      { t: 'SET/RSET (STOP prioritas)', text: P.setrst, note: 'RSET ditulis setelah SET. Tahan START dan STOP bersamaan: K1 OFF.' },
      { t: 'RSET sebelum SET', text: `; RSET ditulis duluan: SET di bawahnya menang\nLD NOT  0.01\nOR NOT  0.02\nRSET    100.00\nLD      0.00\nSET     100.00\nLD      100.00\nOUT     100.03\nEND(001)`, note: 'Instruksi yang dieksekusi terakhir menentukan. Tahan START dan STOP bersamaan: K1 tetap ON. Ini tidak aman.' },
      { t: 'Toggle (DIFU + KEEP)', text: P.toggle, note: 'Satu tombol: tekan pertama ON, tekan kedua OFF. DIFU membuat pulsa hanya satu scan.' }] },
    'plc-rev': { st: 'motor', drive: 'rev', hide: ['START', 'RESET'], hideOut: ['K3', 'H1', 'H2', 'H3'], text: P.rev, hwToggle: true, weldToggle: true },
    'plc-yd': { st: 'motor', drive: 'yd', hide: ['FWD', 'REV', 'RESET'], hideOut: ['H1', 'H2', 'H3'], hwToggle: true, vars: [
      { t: 'Dengan jeda 0,3 s', text: P.yd, note: 'T000 = waktu bintang 5,0 s, T001 = jeda transisi 0,3 s.' },
      { t: 'Tanpa jeda', text: P.yd.replace('AND     T001      ; jeda', 'AND     T000      ; tanpa jeda'), note: 'Matikan interlock hardware lalu coba: K3 bisa menarik sebelum kontak K2 benar-benar lepas.' }] },
    'plc-conv': { st: 'conv', vars: [{ t: 'CNT #10', text: P.conv }, { t: '+ peringatan pembanding', text: P.convwarn, note: 'LD <= C000 #0002: H2 menyala saat sisa hitungan 2 atau kurang.' }] },
    'pneu-valve': { st: 'pneu', cyl: ['A'], hide: ['KONTINU', '1B1', '1B2', '2B1', '2B2', '3B1', '3B2'], hideOut: ['2Y1', '2Y2', '3Y1', '3Y2'], text: `; Tombol langsung ke solenoid (latihan)\nLD      0.00      ; START = Y1\nOUT     100.00    ; 1Y1 maju\nLD      0.02      ; RESET = Y2\nOUT     100.01    ; 1Y2 mundur\nEND(001)` },
    'pneu-one': { st: 'pneu', cyl: ['A'], hide: ['2B1', '2B2', '3B1', '3B2'], hideOut: ['2Y1', '2Y2', '3Y1', '3Y2'], text: P.one },
    'pneu-seq': { st: 'pneu', cyl: ['A', 'B'], hide: ['KONTINU', '3B1', '3B2'], hideOut: ['3Y1', '3Y2'], text: P.seq },
    'pneu-pick': { st: 'pneu', cyl: ['A', 'B', 'C'], hide: ['KONTINU'], text: P.pick },
    press: { st: 'press', text: P.press, latchToggle: true }
  };
  Object.keys(MINI).forEach(k => { W['mini-' + k] = box => STN.mini(box, MINI[k]); });

  /* ---------------- Siklus scan ---------------- */
  W.scan = box => {
    box.innerHTML = `<div class="scan-loop"><span data-ph="0">1 · Baca input</span><span data-ph="1">2 · Eksekusi program</span><span data-ph="2">3 · Perbarui output</span><span data-ph="3">4 · Komunikasi &amp; diagnosis</span></div>
      <div class="hdr-ctl"><label class="field">Waktu scan<input type="range" min="2" max="150" value="20" data-k="scan"><output class="mono" data-o="scan"></output></label>
      <label class="field">Lebar pulsa input<input type="range" min="2" max="150" value="30" data-k="pw"><output class="mono" data-o="pw"></output></label></div>
      <div class="scan-tl" data-o="tl"></div><div class="btn-row"><button type="button" class="btn btn-ghost small" data-k="rnd">${icon('dice')}Acak posisi pulsa</button><span class="small" data-o="res" aria-live="polite"></span></div>`;
    let pulses = [];
    const rnd = () => { pulses = Array.from({ length: 6 }, (_, i) => 40 + i * 150 + Math.random() * 90); };
    rnd();
    const draw = () => {
      const sc = +$('[data-k=scan]', box).value, pw = +$('[data-k=pw]', box).value, Wd = 1000;
      $('[data-o=scan]', box).textContent = sc + ' ms'; $('[data-o=pw]', box).textContent = pw + ' ms';
      const reads = []; for (let t = 0; t < Wd; t += sc) reads.push(t);
      let got = 0;
      const ps = pulses.map(p => { const c = reads.some(r => r >= p && r < p + pw); if (c) got++; return { p, c }; });
      const X = t => 10 + t * 0.98;
      $('[data-o=tl]', box).innerHTML = `<svg viewBox="0 0 1000 120" style="width:100%" aria-hidden="true"><text x="10" y="14" class="tr-n">Input fisik</text>
        ${ps.map(o => `<rect x="${X(o.p)}" y="22" width="${Math.max(2, pw * 0.98)}" height="22" class="${o.c ? 'pul-ok' : 'pul-miss'}"/>`).join('')}<path d="M10 44H990" class="tr-b"/>
        <text x="10" y="66" class="tr-n">Saat input dibaca (awal tiap scan)</text>${reads.map(r => `<path d="M${X(r)} 72V86" class="rd"/>`).join('')}
        <text x="10" y="106" class="tr-n">Bit input di program</text>${ps.filter(o => o.c).map(o => { const r = reads.find(x => x >= o.p); const e = reads.find(x => x >= o.p + pw) || r + sc; return `<rect x="${X(r)}" y="96" width="${(e - r) * 0.98}" height="14" class="pul-bit"/>`; }).join('')}</svg>`;
      $('[data-o=res]', box).innerHTML = `<b>${got} dari 6</b> pulsa terbaca. ${pw < sc ? 'Pulsa lebih pendek dari waktu scan bisa terlewat. Solusinya: input interrupt, high-speed counter, atau fungsi pulse catch.' : 'Pulsa lebih lebar dari waktu scan selalu terbaca minimal satu kali.'}`;
    };
    box.addEventListener('input', draw);
    $('[data-k=rnd]', box).addEventListener('click', () => { rnd(); draw(); });
    draw();
    let ph = 0; const spans = $$('.scan-loop span', box);
    const t = setInterval(() => { if (!box.isConnected) return clearInterval(t); if (box.offsetParent === null) return; spans.forEach((s, i) => s.classList.toggle('on', i === ph)); ph = (ph + 1) % 4; }, 700);
  };

  /* ---------------- Pembaca alamat Omron + TIM/BCD ---------------- */
  const AREA = {
    CIO: (a) => a.w < 100 ? ['Input (CIO)', 'Bit dari perangkat lapangan: tombol, sensor, kontak TOR. Diperbarui setiap awal scan.', 'tidak (selalu dibaca ulang dari terminal)'] : a.w < 200 ? ['Output (CIO)', 'Bit ke kontaktor, katup solenoid, dan lampu. Dikirim ke terminal di akhir scan.', 'tidak'] : a.w < 290 ? ['Serial PLC Link (CIO 200-289, CP1E)', 'Word yang dipertukarkan antar-PLC lewat RS-485.', 'tidak'] : ['CIO lain', 'Area CIO di luar input/output contoh trainer.', 'tidak'],
    W: () => ['Work (W)', 'Bit bantu internal untuk logika program, misalnya langkah sekuens atau pengunci.', 'tidak: hilang saat daya padam'],
    H: () => ['Holding (H)', 'Bit/word yang mempertahankan isi saat daya padam (didukung kapasitor/baterai PLC).', 'ya'],
    A: (a) => a.w === 200 && a.b === 11 ? ['Auxiliary (A) · P_First_Cycle', 'ON hanya pada scan pertama setelah RUN. Dipakai untuk inisialisasi.', 'diatur sistem'] : ['Auxiliary (A)', 'Flag dan status sistem.', 'diatur sistem'],
    T: () => ['Timer (T)', 'Completion flag timer: ON saat waktu habis. Sebagai word, isinya present value (PV).', 'tidak'],
    C: () => ['Counter (C)', 'Completion flag counter: ON saat hitungan mencapai 0. PV counter dipertahankan saat daya padam.', 'ya (PV)'],
    CF: () => ['Condition flag', 'Flag sistem seperti P_On, P_1s, P_EQ.', 'diatur sistem'],
    D: () => ['Data Memory (D)', 'Word data: setpoint, hasil hitung, data dari HMI. Tidak bisa dipakai sebagai kontak.', 'ya']
  };
  W.addr = box => {
    box.innerHTML = `<label class="field">Ketik alamat<input type="text" class="mono" value="100.03" data-k="a" autocomplete="off" autocapitalize="characters" spellcheck="false"></label>
      <div class="btn-row chips">${['0.00', '0.01', '100.03', 'W0.10', 'H1.02', 'A200.11', 'T000', 'C000', 'D100', '0.1', '0.16', 'W10'].map(x => `<button type="button" class="btn btn-ghost tiny mono" data-x="${x}">${x}</button>`).join('')}</div>
      <div class="stat-grid" data-o="out"></div><div class="bitrow" data-o="bits"></div>`;
    const inp = $('[data-k=a]', box);
    const draw = () => {
      const v = inp.value.trim(); let html = '', bits = '';
      try {
        let a;
        try { a = PLC.parseBit(v); } catch (e) { if (/^D\d+$|^[WHA]?\d+$/i.test(v) && !/\./.test(v)) { a = Object.assign(PLC.parseWord(v), { word: true }); } else throw e; }
        const f = AREA[a.a](a);
        html = `<div class="wide"><span>Area</span><b>${esc(f[0])}</b></div>` + (a.word ? `<div><span>Jenis</span><b>word (16 bit)</b></div><div><span>Nomor word</span><b class="mono">${a.w}</b></div>` : a.a === 'T' || a.a === 'C' || a.a === 'CF' ? `<div><span>Nomor</span><b class="mono">${a.w}</b></div>` : `<div><span>Word</span><b class="mono">${a.w}</b></div><div><span>Bit</span><b class="mono">${String(a.b).padStart(2, '0')}</b></div>`) + `<div><span>Bertahan saat daya padam?</span><b>${esc(f[2])}</b></div><div class="wide"><span>Fungsi</span><b style="font-weight:500">${esc(f[1])}</b></div>`;
        if (!a.word && ['CIO', 'W', 'H', 'A'].includes(a.a)) bits = `<span class="small muted">Word ${a.a === 'CIO' ? '' : a.a}${a.w}: bit 15 … 00</span><div class="bits16">${Array.from({ length: 16 }, (_, i) => 15 - i).map(b => `<i class="${b === a.b ? 'on' : ''}">${String(b).padStart(2, '0')}</i>`).join('')}</div>`;
      } catch (e) { html = `<div class="wide"><span>Belum benar</span><b class="err-t">${esc(e)}</b></div>`; }
      $('[data-o=out]', box).innerHTML = html; $('[data-o=bits]', box).innerHTML = bits;
    };
    inp.addEventListener('input', draw);
    box.addEventListener('click', e => { const b = e.target.closest('[data-x]'); if (b) { inp.value = b.dataset.x; draw(); } });
    draw();
  };
  W.tim = box => {
    box.innerHTML = `<div class="hdr-ctl"><label class="field">Instruksi<select data-k="i"><option value="TIM">TIM (satuan 0,1 s)</option><option value="TIMH">TIMH (satuan 0,01 s)</option></select></label>
      <label class="field">Set value (SV)<input type="text" class="mono" value="#50" data-k="sv" autocomplete="off" spellcheck="false"></label><label class="field">Atau waktu yang diinginkan (s)<input type="number" step="0.01" min="0" value="" data-k="s" inputmode="decimal"></label></div>
      <div class="stat-grid" data-o="o"></div><div class="bitrow" data-o="b"></div>`;
    const draw = from => {
      const ins = $('[data-k=i]', box).value, unit = ins === 'TIM' ? 0.1 : 0.01, svI = $('[data-k=sv]', box), sI = $('[data-k=s]', box);
      if (from === 's' && sI.value !== '') { const n = Math.round(+sI.value / unit); svI.value = n > 9999 ? '#9999' : '#' + n; }
      const m = svI.value.trim().toUpperCase().match(/^#([0-9A-F]{1,4})$/);
      let h;
      if (!m) h = `<div class="wide"><span>SV</span><b class="err-t">Tulis konstanta BCD dengan tanda #, misalnya #50. Tanda &amp; (desimal biner) tidak dipakai untuk SV TIM bawaan.</b></div>`;
      else {
        const w = parseInt(m[1], 16), v = PLC.fromBCD(w);
        if (isNaN(v)) h = `<div class="wide"><span>SV</span><b class="err-t">#${m[1]} bukan BCD: setiap digit harus 0-9.</b></div>`;
        else {
          h = `<div><span>Waktu tunda</span><b class="tnum">${fmt(v * unit, ins === 'TIM' ? 1 : 2)} s</b></div><div><span>Hitungan</span><b class="mono">${v} × ${fmt(unit, 2)} s</b></div><div class="wide"><span>Isi word SV (BCD)</span><b class="mono">${PLC.hex4(w)}</b></div>`;
          $('[data-o=b]', box).innerHTML = `<div class="bits16 bcd">${Array.from({ length: 16 }, (_, i) => 15 - i).map(b => `<i class="${(w >> b) & 1 ? 'on' : ''}">${(w >> b) & 1}</i>`).join('')}</div><span class="small muted">Setiap 4 bit menyimpan satu digit desimal (BCD): ${PLC.hex4(w).split('').join(' · ')}</span>`;
        }
      }
      if (!m || isNaN(PLC.fromBCD(parseInt(m[1], 16)))) $('[data-o=b]', box).innerHTML = '';
      $('[data-o=o]', box).innerHTML = h;
    };
    box.addEventListener('input', e => draw(e.target.dataset.k));
    box.addEventListener('change', () => draw());
    draw();
  };

  /* ---------------- Sensor NPN/PNP ke input DC ---------------- */
  W.npn = box => {
    box.innerHTML = `<div class="btn-row"><div class="seg" data-k="t"><button type="button" class="on" data-v="PNP">Sensor PNP</button><button type="button" data-v="NPN">Sensor NPN</button></div>
      <div class="seg" data-k="c"><button type="button" class="on" data-v="0">COM input ke 0 V</button><button type="button" data-v="24">COM input ke +24 V</button></div>
      <button type="button" class="btn btn-ghost small" data-k="obj" aria-pressed="false">Dekatkan benda</button></div><div data-o="svg"></div><p class="small" data-o="res" aria-live="polite"></p>`;
    let t = 'PNP', com = 0, obj = false;
    const draw = () => {
      const out = obj ? (t === 'PNP' ? 24 : 0) : null;
      const flow = out !== null && Math.abs(out - (com ? 24 : 0)) === 24;
      $('[data-o=svg]', box).innerHTML = `<svg viewBox="0 0 520 210" style="width:100%" aria-hidden="true">
        <path d="M20 20H500" class="rail p"/><text x="502" y="24" class="rl">+24 V</text><path d="M20 190H500" class="rail n"/><text x="502" y="194" class="rl">0 V</text>
        <rect x="70" y="80" width="90" height="56" rx="8" class="sen"/><text x="115" y="104" class="st">${t}</text><text x="115" y="122" class="ss">proximity</text>
        <path d="M90 80V20" class="w bn"/><text x="94" y="52" class="wl">BN</text><path d="M140 136V190" class="w bu"/><text x="146" y="170" class="wl">BU</text>
        <path d="M160 108H300" class="w bk ${flow ? 'flow' : ''}"/><text x="200" y="100" class="wl">BK = ${out === null ? 'mengambang' : out + ' V'}</text>
        <rect x="300" y="74" width="140" height="70" rx="8" class="plcbox"/><text x="370" y="94" class="ss">PLC input DC</text>
        <circle cx="330" cy="120" r="9" class="ledc ${flow ? 'on' : ''}"/><text x="330" y="142" class="ss">0.05</text><path d="M339 120H400" class="w ${flow ? 'flow' : ''}"/><text x="414" y="124" class="ss">COM</text>
        <path d="M440 120H470V${com ? 20 : 190}" class="w ${flow ? 'flow' : ''}"/><circle cx="470" cy="${com ? 20 : 190}" r="4" class="dot"/></svg>`;
      $('[data-o=res]', box).innerHTML = !obj ? 'Benda belum terdeteksi: keluaran sensor terbuka, input 0.05 OFF.' :
        flow ? `<b class="ok-t">Input 0.05 ON.</b> Ada beda tegangan 24 V antara terminal input dan COM, sehingga arus mengalir lewat LED input.` :
          `<b class="err-t">Input 0.05 tetap OFF.</b> Keluaran sensor ${t} = ${out} V dan COM juga ${com} V: tidak ada beda tegangan, tidak ada arus. ${t === 'PNP' ? 'Untuk sensor PNP, COM input ke 0 V.' : 'Untuk sensor NPN, COM input ke +24 V.'}`;
    };
    box.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      const seg = b.closest('[data-k]');
      if (b.dataset.k === 'obj') { obj = !obj; b.setAttribute('aria-pressed', obj); b.classList.toggle('on', obj); }
      else if (seg) { $$('button', seg).forEach(x => x.classList.toggle('on', x === b)); if (seg.dataset.k === 't') t = b.dataset.v; else com = +b.dataset.v; }
      draw();
    });
    draw();
  };

  /* ---------------- Lab gangguan: multimeter pada rangkaian DOL ---------------- */
  const FAULTS = [
    { id: 'fuse', t: 'Sekering kontrol F2 putus', sym: 'Semua lampu padam dan K1 tidak menarik.' },
    { id: 'w23', t: 'Kabel nomor 3 (antara TOR dan STOP) lepas', sym: 'Motor tidak mau start, lampu sumber menyala.' },
    { id: 'tor', t: 'TOR trip (95-96 terbuka)', sym: 'Motor tidak mau start, lampu TRIP menyala.' },
    { id: 's1', t: 'Kontak START tidak menutup', sym: 'Motor tidak mau start, lampu sumber menyala.' },
    { id: 'coil', t: 'Kumparan K1 putus', sym: 'Motor tidak mau start, lampu sumber menyala.' },
    { id: 'seal', t: 'Kabel kontak pengunci K1 13-14 lepas', sym: 'K1 hanya menarik selama START ditekan.' },
    { id: 'nc', t: 'Pengunci terpasang di kontak NC 21-22', sym: 'K1 bergetar terus begitu panel diberi daya.' }
  ];
  // Titik ukur: 1 setelah F2, 2 setelah F3, 3 setelah S0, 4 = A1 kumparan, 5 = N (A2). Titik 0 = sumber sebelum F2.
  function circuit(f, st) {
    const E = [[0, 1, f !== 'fuse'], [1, 2, !st.trip && f !== 'tor'], [2, 3, !st.stop && f !== 'w23'], [3, 4, st.start && f !== 's1'],
      [3, 4, f === 'seal' ? false : f === 'nc' ? !st.k : st.k]];
    const par = [0, 1, 2, 3, 4, 5];
    const find = x => par[x] === x ? x : (par[x] = find(par[x]));
    E.forEach(([a, b, c]) => { if (c) par[find(a)] = find(b); });
    return { find, coilOk: f !== 'coil' };
  }
  W.meter = box => {
    const S = store.get('meter', { solved: 0, tries: 0 });
    box.innerHTML = `<div class="meter-top"><div class="seg" data-k="mode"><button type="button" class="on" data-v="free">Latihan bebas</button><button type="button" data-v="case">Kasus misteri</button></div><span class="small muted" data-o="score"></span></div>
      <div class="case-box" data-o="case" hidden></div>
      <div class="btn-row"><button type="button" class="btn btn-ghost small" data-k="pwr" aria-pressed="false">Panel: OFF</button><button type="button" class="btn btn-ghost small hold" data-k="start">Tahan START</button><button type="button" class="btn btn-ghost small hold" data-k="stop">Tahan STOP</button><span class="tag" data-o="k1">K1 OFF</span></div>
      <div data-o="svg"></div>
      <div class="hdr-ctl"><div class="field">Mode multimeter<div class="seg" data-k="mm"><button type="button" class="on" data-v="ohm">Ω kontinuitas (panel OFF)</button><button type="button" data-v="v">V DC (panel ON, diawasi guru)</button></div></div>
      <div class="field">Probe<div class="small" data-o="probe">Ketuk dua titik ukur bernomor pada gambar.</div></div></div>
      <div class="lcd" data-o="lcd">---</div>
      <div data-o="free"><label class="field">Pasang gangguan (mode latihan)<select data-k="fault"><option value="">Tanpa gangguan</option>${FAULTS.map(f => `<option value="${f.id}">${esc(f.t)}</option>`).join('')}</select></label></div>
      <h4>Catatan pengukuran</h4><ol class="list small mlog" data-o="log"></ol>`;
    let mode = 'free', fault = '', pwr = false, mm = 'ohm', probes = [], st = { start: false, stop: false, trip: false, k: false }, log = [], chatter = 0, caseF = null, answered = false;
    const pick = () => FAULTS[Math.floor(Math.random() * FAULTS.length)].id;
    function solveK() {
      if (!pwr) { st.k = false; return; }
      st.trip = fault === 'tor';
      for (let i = 0; i < 4; i++) {
        const c = circuit(fault, st);
        const en = c.find(4) === c.find(0) && c.coilOk;
        if (fault === 'nc' && en === st.k) { st.k = !en; chatter++; break; }
        st.k = en;
      }
    }
    function reading() {
      if (probes.length < 2) return '---';
      const [p, q] = probes;
      st.trip = fault === 'tor';
      if (mm === 'ohm') {
        if (pwr) return 'Matikan panel dulu';
        const c = circuit(fault, Object.assign({}, st, { k: false }));
        if (c.find(p) === c.find(q)) return '0,2 Ω';
        const side = n => c.find(n) === c.find(4) ? 'a' : c.find(n) === c.find(5) ? 'b' : null;
        const s1 = side(p), s2 = side(q);
        if (s1 && s2 && s1 !== s2 && c.coilOk) return '≈ 560 Ω';
        return 'OL';
      }
      if (!pwr) return '0,0 V';
      const c = circuit(fault, st);
      const v = n => c.find(n) === c.find(0) ? 24 : (c.find(n) === c.find(5) || (c.find(n) === c.find(4) && c.coilOk) ? 0 : null);
      const a = v(p), b = v(q);
      if (a === null || b === null) return '0,0 V (titik mengambang)';
      return fmt(Math.abs(a - b), 1) + ' V';
    }
    const TP = { 0: [40, 30], 1: [110, 30], 2: [210, 30], 3: [300, 30], 4: [470, 30], 5: [560, 30] };
    function draw() {
      solveK();
      const c = circuit(fault, st), live = n => pwr && c.find(n) === c.find(0);
      const seg = (x1, x2, n) => `<path d="M${x1} 70H${x2}" class="cw ${live(n) ? 'live' : ''}"/>`;
      $('[data-o=svg]', box).innerHTML = `<svg viewBox="0 0 600 150" style="width:100%" class="msvg" aria-label="Rangkaian kontrol DOL dengan titik ukur 0 sampai 5">
        ${seg(20, 70, 0)}<rect x="70" y="62" width="30" height="16" class="fuse ${fault === 'fuse' ? 'bad' : ''}"/><text x="85" y="98" class="ct">F2</text>${seg(100, 160, 1)}
        <path d="M160 70h10M170 56v28M186 56v28M186 70h10" class="cc"/><path d="M162 86L194 54" class="cc"/><text x="178" y="104" class="ct">F3 95-96</text>${seg(196, 250, 2)}
        <path d="M250 70h10M260 56v28M276 56v28M276 70h10" class="cc"/><path d="M252 86L284 54" class="cc"/><text x="268" y="104" class="ct">S0</text>${seg(286, 330, 3)}
        <path d="M330 70V120H360M440 120H460V70" class="cw ${live(3) ? 'live' : ''}"/><path d="M360 120h10M370 106v28M386 106v28M386 120h54" class="cc"/><text x="378" y="146" class="ct">K1 13-14</text>
        <path d="M330 70h30M360 70h10M370 56v28M386 56v28M386 70h20" class="cc"/><text x="378" y="48" class="ct">S1 START</text>${seg(406, 500, 4)}
        <circle cx="520" cy="70" r="16" class="coil ${st.k ? 'on' : ''} ${fault === 'coil' ? 'bad' : ''}"/><text x="520" y="74" class="ct">K1</text><path d="M536 70H585" class="cw"/>
        ${Object.entries(TP).map(([n, [x]]) => `<g class="tp ${probes.includes(+n) ? 'sel' : ''}" data-tp="${n}" tabindex="0" role="button" aria-label="Titik ukur ${n}"><circle cx="${x}" cy="70" r="11"/><text x="${x}" y="74">${n}</text></g>`).join('')}</svg>`;
      $('[data-o=k1]', box).textContent = st.k ? 'K1 ON' : 'K1 OFF'; $('[data-o=k1]', box).className = 'tag ' + (st.k ? 'ok' : '');
      $('[data-o=lcd]', box).textContent = reading();
      $('[data-o=probe]', box).textContent = probes.length ? `Merah di titik ${probes[0]}${probes[1] !== undefined ? `, hitam di titik ${probes[1]}` : ''}` : 'Ketuk dua titik ukur bernomor pada gambar.';
      $('[data-o=log]', box).innerHTML = log.map(l => `<li>${esc(l)}</li>`).join('') || '<li class="muted">Belum ada.</li>';
      $('[data-o=score]', box).textContent = `Kasus selesai: ${S.solved} dari ${S.tries}`;
    }
    function newCase() {
      caseF = pick(); fault = caseF; answered = false; log = []; probes = []; pwr = false;
      const f = FAULTS.find(x => x.id === caseF);
      const opts = FAULTS.map(x => x).sort(() => Math.random() - 0.5);
      $('[data-o=case]', box).innerHTML = `<p><b>Gejala:</b> ${esc(f.sym)}</p><p class="small muted">Ukur dulu dengan multimeter (kontinuitas saat panel OFF), lalu tentukan penyebabnya. Usahakan dengan sesedikit mungkin pengukuran (metode half-split).</p>
        <label class="field">Diagnosis<select data-k="ans"><option value="">Pilih penyebab…</option>${opts.map(x => `<option value="${x.id}">${esc(x.t)}</option>`).join('')}</select></label><div class="btn-row"><button type="button" class="btn btn-primary small" data-k="check">Periksa diagnosis</button><button type="button" class="btn btn-ghost small" data-k="new">Kasus baru</button><button type="button" class="btn btn-ghost small" data-k="tolog">${icon('down')}Simpan ke Troubleshooting Log</button></div><div data-o="verdict"></div>`;
      draw();
    }
    box.addEventListener('click', e => {
      const tp = e.target.closest('[data-tp]');
      if (tp) { const n = +tp.dataset.tp; if (probes.length >= 2) probes = []; if (!probes.includes(n)) probes.push(n); draw(); if (probes.length === 2) { log.push(`${mm === 'ohm' ? 'Ω' : 'V'} titik ${probes[0]}-${probes[1]}${st.start ? ' (START ditahan)' : ''}${pwr ? ' [panel ON]' : ''}: ${reading()}`); draw(); } return; }
      const b = e.target.closest('button'); if (!b) return;
      const seg = b.closest('.seg');
      if (seg && seg.dataset.k === 'mm') { $$('button', seg).forEach(x => x.classList.toggle('on', x === b)); mm = b.dataset.v; probes = []; draw(); }
      if (seg && seg.dataset.k === 'mode') {
        $$('button', seg).forEach(x => x.classList.toggle('on', x === b)); mode = b.dataset.v;
        $('[data-o=case]', box).hidden = mode !== 'case'; $('[data-o=free]', box).hidden = mode === 'case';
        if (mode === 'case') newCase(); else { fault = $('[data-k=fault]', box).value; draw(); }
      }
      if (b.dataset.k === 'pwr') { pwr = !pwr; b.textContent = 'Panel: ' + (pwr ? 'ON' : 'OFF'); b.classList.toggle('on', pwr); chatter = 0; draw(); if (pwr && fault === 'nc') log.push('Panel ON: K1 bergetar (chatter).'); }
      if (b.dataset.k === 'new') newCase();
      if (b.dataset.k === 'check') {
        const v = $('[data-k=ans]', box).value; if (!v) { toast('Pilih penyebab dulu'); return; }
        const ok = v === caseF, n = log.length;
        if (!answered) { S.tries++; if (ok) S.solved++; store.set('meter', S); answered = true; }
        $('[data-o=verdict]', box).innerHTML = `<div class="verdict ${ok ? 'good' : 'bad'}"><b>${ok ? 'Tepat.' : 'Belum tepat.'}</b> Penyebab sebenarnya: ${esc(FAULTS.find(x => x.id === caseF).t)}. Kamu melakukan ${n} pengukuran. ${n > 4 ? 'Coba half-split: ukur di tengah rangkaian (titik 0-3) dulu, lalu bagi dua lagi bagian yang terbuka.' : ''}</div>`;
        draw();
      }
      if (b.dataset.k === 'tolog') {
        const T = store.get('log:trb', []);
        T.push({ c: ['Lab gangguan', FAULTS.find(x => x.id === caseF).sym, ($('[data-k=ans]', box).selectedOptions[0] || {}).text || '', log.join('; '), answered ? 'diagnosis sudah diperiksa' : ''] });
        store.set('log:trb', T); toast('Ditambahkan ke Troubleshooting Log');
      }
    });
    const hold = (k, on) => { st[k] = on; draw(); };
    $$('.hold', box).forEach(b => {
      const k = b.dataset.k;
      b.addEventListener('pointerdown', e => { e.preventDefault(); hold(k, true); b.classList.add('on'); });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, () => { if (st[k]) { hold(k, false); b.classList.remove('on'); } }));
    });
    $('[data-k=fault]', box).addEventListener('change', e => { fault = e.target.value; log = []; draw(); });
    box.addEventListener('keydown', e => { const tp = e.target.closest('[data-tp]'); if (tp && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); tp.dispatchEvent(new MouseEvent('click', { bubbles: true })); } });
    draw();
  };

  /* ---------------- Lab commissioning: urutan + I/O check dengan gangguan tersembunyi ---------------- */
  const COM_STEPS = ['Power OFF + LOTO: inspeksi visual, marker, ferrule, terminal kencang.', 'Uji kontinuitas tiap jalur; pastikan +24 V tidak terhubung ke 0 V.', 'Izin guru, power ON tanpa beban; cek LED POWER, ERR/ALM padam.', 'Hubungkan USB, CX-Programmer online, PLC pada mode PROGRAM.', 'I/O check input: tekan tiap perangkat, LED dan bit monitoring ON.', 'I/O check output: force set/reset satu per satu, beban sesuai.', 'Batalkan semua forcing; unduh program uji; mode MONITOR/RUN.', 'Uji fungsi sesuai test log; catat versi program dan tanda tangan.'];
  const IOL = [['0.00', 'START', 'S1 tombol hijau', 'NO'], ['0.01', 'STOP', 'S0 tombol merah', 'NC'], ['0.02', 'TOR', 'F3 kontak 95-96', 'NC'], ['0.03', 'FWD', 'S2 tombol kanan', 'NO'], ['0.04', 'REV', 'S3 tombol kiri', 'NO'], ['0.05', 'PRODUK', 'B1 proximity PNP', 'PNP'], ['0.06', 'RESET', 'S4 tombol biru', 'NO'],
    ['100.00', 'K1', 'kontaktor kanan/utama'], ['100.01', 'K2', 'kontaktor kiri/bintang'], ['100.02', 'K3', 'kontaktor segitiga'], ['100.03', 'H1', 'lampu RUN'], ['100.04', 'H2', 'lampu TRIP'], ['100.05', 'H3', 'lampu batch']];
  const SCEN = [
    { swap: { '0.03': '0.04', '0.04': '0.03' }, dead: ['100.01'], outSwap: {}, bad: ['0.03', '0.04', '100.01'], msg: 'Kabel FWD dan REV tertukar di terminal 0.03/0.04; kumparan K2 tidak mendapat COM.' },
    { swap: {}, dead: ['0.05'], outSwap: { '100.03': '100.04', '100.04': '100.03' }, bad: ['0.05', '100.03', '100.04'], msg: 'COM input untuk sensor PNP terhubung ke +24 V (sensor tidak terbaca); kabel lampu H1 dan H2 tertukar.' },
    { swap: {}, dead: ['0.06'], invert: ['0.01'], outSwap: {}, bad: ['0.01', '0.06'], msg: 'STOP terpasang di kontak NO (input OFF saat normal, tidak fail-safe); kabel RESET lepas.' }
  ];
  W.comm = box => {
    const saved = store.get('comm', { score: null });
    let order = [], sc = null, marks = {}, forced = {}, pressed = {}, done = false;
    box.innerHTML = `<h4>1 · Susun urutan commissioning</h4><p class="small muted">Ketuk langkah sesuai urutan yang benar.</p><div class="ord-pool" data-o="pool"></div><ol class="list small ord-out" data-o="ord"></ol><div data-o="ordres"></div>
      <h4>2 · I/O check trainer</h4><p class="small muted">Trainer ini menyimpan beberapa kesalahan wiring yang belum diketahui. Uji setiap titik, lalu tandai <b>sesuai</b> atau <b>tidak sesuai</b> dengan I/O list.</p>
      <div class="btn-row"><button type="button" class="btn btn-ghost small" data-k="newsc">${icon('dice')}Trainer lain</button><span class="small muted" data-o="last">${saved.score !== null ? `Nilai terakhir: ${saved.score}` : ''}</span></div>
      <div class="tbl-wrap"><table class="tbl small iochk"><thead><tr><th>Alamat</th><th>Simbol / perangkat</th><th>Uji</th><th>Hasil</th><th>Tanda</th></tr></thead><tbody data-o="rows"></tbody></table></div>
      <div class="btn-row"><button type="button" class="btn btn-ghost small" data-k="unforce">Batalkan semua forcing</button><button type="button" class="btn btn-primary small" data-k="finish">Selesai, nilai lembar I/O check</button><button type="button" class="btn btn-ghost small" data-k="tolog">${icon('down')}Simpan ke lembar commissioning</button></div><div data-o="fin"></div>`;
    const pool = COM_STEPS.map((s, i) => i).sort(() => Math.random() - 0.5);
    function drawOrd() {
      $('[data-o=pool]', box).innerHTML = pool.filter(i => !order.includes(i)).map(i => `<button type="button" class="ord-item" data-i="${i}">${esc(COM_STEPS[i])}</button>`).join('');
      $('[data-o=ord]', box).innerHTML = order.map(i => `<li>${esc(COM_STEPS[i])}</li>`).join('');
      const r = $('[data-o=ordres]', box);
      if (order.length === COM_STEPS.length) {
        const ok = order.every((v, i) => v === i);
        r.innerHTML = `<div class="verdict ${ok ? 'good' : 'bad'}">${ok ? '<b>Urutan benar.</b> Power-off check selalu sebelum power-on, dan forcing dibatalkan sebelum program dijalankan.' : '<b>Urutan belum tepat.</b> Ingat: semua pemeriksaan tanpa daya dulu, I/O check sebelum uji fungsi, forcing dibatalkan sebelum RUN.'} <button type="button" class="btn btn-ghost tiny" data-k="ordreset">Ulangi</button></div>`;
        store.set('comm-order', ok);
      } else r.innerHTML = order.length ? '<button type="button" class="btn btn-ghost tiny" data-k="ordreset">Ulangi</button>' : '';
    }
    function phys(addr) { // apa yang benar-benar terjadi di trainer
      if (addr.startsWith('0.')) {
        if (sc.dead.includes(addr)) return null;
        return sc.swap[addr] || addr;
      }
      if (sc.dead.includes(addr)) return null;
      return sc.outSwap[addr] || addr;
    }
    function drawRows() {
      $('[data-o=rows]', box).innerHTML = IOL.map(([a, s, d, t]) => {
        const isIn = a.startsWith('0.');
        let res = '';
        if (isIn) {
          const p = phys(a), inv = (sc.invert || []).includes(a);
          const atRest = t === 'NC' ? !inv : inv;
          const rest = `LED ${a} saat diam: ${atRest ? 'ON' : 'OFF'}`;
          res = pressed[a] ? (p === null ? 'tidak ada LED yang berubah' : `LED ${p} ${t === 'NC' && !inv ? 'OFF' : 'ON'}`) : (t === 'NC' || inv ? rest : '');
        } else if (forced[a]) { const p = phys(a); res = p === null ? 'tidak ada beban bekerja' : `${IOL.find(x => x[0] === p)[2]} bekerja`; }
        return `<tr><td class="mono">${a}</td><td><b>${s}</b> · ${esc(d)}${t ? ' · ' + t : ''}</td><td>${isIn ? `<button type="button" class="btn btn-ghost tiny" data-press="${a}">${a === '0.05' ? 'Dekatkan benda' : 'Tekan perangkat'}</button>` : `<button type="button" class="btn btn-ghost tiny ${forced[a] ? 'on' : ''}" data-force="${a}">${forced[a] ? 'Force: SET' : 'Force set'}</button>`}</td><td class="small">${esc(res)}</td>
          <td><div class="seg tiny-seg"><button type="button" data-m="${a}" data-v="1" class="${marks[a] === 1 ? 'on' : ''}">sesuai</button><button type="button" data-m="${a}" data-v="0" class="${marks[a] === 0 ? 'on' : ''}">tidak</button></div></td></tr>`;
      }).join('');
    }
    function newSc() { sc = SCEN[Math.floor(Math.random() * SCEN.length)]; marks = {}; forced = {}; pressed = {}; done = false; $('[data-o=fin]', box).innerHTML = ''; drawRows(); }
    box.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.classList.contains('ord-item')) { order.push(+b.dataset.i); drawOrd(); return; }
      if (b.dataset.k === 'ordreset') { order = []; drawOrd(); return; }
      if (b.dataset.press) { const a = b.dataset.press; pressed[a] = true; drawRows(); setTimeout(() => { pressed[a] = false; drawRows(); }, 1600); return; }
      if (b.dataset.force) { forced[b.dataset.force] = !forced[b.dataset.force]; drawRows(); return; }
      if (b.dataset.m) { marks[b.dataset.m] = +b.dataset.v; drawRows(); return; }
      if (b.dataset.k === 'unforce') { forced = {}; drawRows(); toast('Semua forcing dibatalkan'); return; }
      if (b.dataset.k === 'newsc') { newSc(); return; }
      if (b.dataset.k === 'finish') {
        const miss = IOL.filter(r => marks[r[0]] === undefined).length;
        if (miss) { toast(`Masih ada ${miss} titik yang belum ditandai`); return; }
        const right = IOL.filter(r => (marks[r[0]] === 0) === sc.bad.includes(r[0])).length;
        const leftForce = Object.values(forced).some(Boolean);
        const score = Math.round(right / IOL.length * 100) - (leftForce ? 10 : 0);
        store.set('comm', { score, ts: Date.now() }); done = true;
        $('[data-o=last]', box).textContent = `Nilai terakhir: ${score}`;
        $('[data-o=fin]', box).innerHTML = `<div class="verdict ${score >= 75 ? 'good' : 'bad'}"><b>${right} dari ${IOL.length} titik ditandai benar${leftForce ? ', tetapi masih ada forcing aktif (−10)' : ''}. Nilai ${score}.</b><p class="small">Kesalahan di trainer ini: ${esc(sc.msg)}</p></div>`;
        return;
      }
      if (b.dataset.k === 'tolog') {
        const T = store.get('log:com', []);
        IOL.forEach(([a, s]) => { if (marks[a] !== undefined) T.push({ c: [a + ' ' + s, a.startsWith('0.') ? 'I/O check input' : 'I/O check output (force)', 'sesuai I/O list', marks[a] ? 'sesuai' : 'tidak sesuai', ''] }); });
        store.set('log:com', T); toast('Ditambahkan ke Lembar Commissioning');
      }
    });
    drawOrd(); newSc(); void done;
  };

  /* ---------------- Diagram langkah dari notasi sekuens ---------------- */
  W.seq = box => {
    box.innerHTML = `<label class="field">Notasi sekuens<input type="text" class="mono" value="${esc(store.get('seq', 'A+ B+ B- A-'))}" data-k="s" autocomplete="off" autocapitalize="characters" spellcheck="false"></label>
      <div class="btn-row chips">${['A+ A-', 'A+ B+ B- A-', 'A+ B+ A- B-', 'A+ B+ B- B+ B- A-', 'B+ C+ B- A+ B+ C- B- A-'].map(x => `<button type="button" class="btn btn-ghost tiny mono" data-x="${x}">${x}</button>`).join('')}</div>
      <div data-o="err"></div><div data-o="svg"></div><div class="tbl-wrap" data-o="tbl"></div>
      <details class="reveal"><summary>Program step bit (mnemonik)</summary><div><pre class="code-pre mono" data-o="code"></pre><div class="btn-row"><a class="btn btn-primary small" href="#lab" data-k="lab">${icon('play')}Coba di Lab PLC</a></div></div></details>`;
    const inp = $('[data-k=s]', box);
    const draw = () => {
      store.set('seq', inp.value);
      const r = STN.seqProgram(inp.value);
      $('[data-o=err]', box).innerHTML = r.err ? `<p class="ferr">${esc(r.err)}</p>` : '';
      if (r.err) { $('[data-o=svg]', box).innerHTML = ''; $('[data-o=tbl]', box).innerHTML = ''; $('[data-o=code]', box).textContent = ''; return; }
      const n = r.steps.length, Wd = 640, x0 = 110, dx = (Wd - x0 - 20) / n, rowH = 64;
      const SN = { A: ['1B1', '1B2'], B: ['2B1', '2B2'], C: ['3B1', '3B2'] };
      let svg = '';
      for (let k = 0; k <= n; k++) svg += `<path d="M${x0 + k * dx} 16V${16 + r.cyl.length * rowH}" class="tr-b"/><text x="${x0 + k * dx}" y="12" class="tr-n" text-anchor="middle">${k === n ? (k + 1) + '=1' : k + 1}</text>`;
      r.cyl.forEach((c, i) => {
        const yb = 16 + i * rowH + 50, yt = 16 + i * rowH + 18;
        let pos = 0, d = `M${x0} ${yb}`;
        r.steps.forEach((s, k) => { const nx = x0 + (k + 1) * dx; if (s.c === c) { pos = s.d ? 1 : 0; d += `L${nx} ${pos ? yt : yb}`; } else d += `L${nx} ${pos ? yt : yb}`; });
        svg += `<text x="4" y="${yt + 20}" class="st-c">Silinder ${c}</text><text x="${Wd - 4}" y="${yt + 4}" class="tr-n" text-anchor="end">1</text><text x="${Wd - 4}" y="${yb + 4}" class="tr-n" text-anchor="end">0</text><path d="${d}" class="st-line"/>`;
      });
      r.steps.forEach((s, k) => { svg += `<text x="${x0 + (k + 0.5) * dx}" y="${16 + r.cyl.length * rowH + 14}" class="st-t" text-anchor="middle">${SN[s.c][s.d ? 1 : 0]}</text>`; });
      $('[data-o=svg]', box).innerHTML = `<svg viewBox="0 0 ${Wd} ${r.cyl.length * rowH + 40}" style="width:100%" role="img" aria-label="Diagram langkah-perpindahan">${svg}</svg><p class="small muted">Teks merah di bawah = sensor yang menjadi syarat pindah ke langkah berikutnya.</p>`;
      const sb = k => `W${Math.floor(k / 16)}.${String(k % 16).padStart(2, '0')}`;
      $('[data-o=tbl]', box).innerHTML = `<table class="tbl small"><thead><tr><th>Langkah</th><th>Bit</th><th>Aksi</th><th>Syarat transisi</th><th>Berikutnya</th></tr></thead><tbody>
        <tr><td>awal</td><td class="mono">${sb(0)}</td><td>semua di belakang, menunggu</td><td>START dan semua sensor belakang ON</td><td>1</td></tr>
        ${r.steps.map((s, k) => `<tr><td>${k + 1}</td><td class="mono">${sb(k + 1)}</td><td>${s.c}${s.d ? '+ (maju)' : '- (mundur)'}</td><td>${SN[s.c][s.d ? 1 : 0]} ON</td><td>${k === n - 1 ? 'awal' : k + 2}</td></tr>`).join('')}</tbody></table>`;
      $('[data-o=code]', box).textContent = r.text;
      $('[data-k=lab]', box).onclick = () => { setTimeout(() => window.LABAPI && window.LABAPI.open('pneu', 'kosong', r.text, r.cyl), 30); };
    };
    inp.addEventListener('input', draw);
    box.addEventListener('click', e => { const b = e.target.closest('[data-x]'); if (b) { inp.value = b.dataset.x; draw(); } });
    draw();
  };

  /* ---------------- Kalkulator ---------------- */
  W.force = box => {
    box.innerHTML = `<div class="hdr-ctl"><label class="field">Diameter piston D (mm)<input type="number" value="40" min="1" data-k="d" inputmode="decimal"></label><label class="field">Diameter batang d (mm)<input type="number" value="22" min="0" data-k="r" inputmode="decimal"></label><label class="field">Tekanan p (bar)<input type="number" value="50" min="0" data-k="p" inputmode="decimal"></label></div><div class="stat-grid" data-o="o"></div><ol class="list small" data-o="steps"></ol>`;
    const draw = () => {
      const D = +$('[data-k=d]', box).value, d = +$('[data-k=r]', box).value, p = +$('[data-k=p]', box).value;
      if (!(D > 0) || d < 0 || d >= D || p < 0) { $('[data-o=o]', box).innerHTML = '<div class="wide"><span>Isian</span><b class="err-t">Diameter batang harus lebih kecil dari diameter piston, dan semua nilai positif.</b></div>'; $('[data-o=steps]', box).innerHTML = ''; return; }
      const A = Math.PI * (D / 1000) ** 2 / 4, Ar = A - Math.PI * (d / 1000) ** 2 / 4, Pa = p * 1e5;
      $('[data-o=o]', box).innerHTML = `<div><span>Gaya maju</span><b class="tnum">${fmt(Pa * A, 0)} N</b></div><div><span>≈</span><b class="tnum">${fmt(Pa * A / 1000, 2)} kN</b></div><div><span>Gaya mundur (sisi batang)</span><b class="tnum">${fmt(Pa * Ar, 0)} N</b></div><div><span>Setara massa ≈</span><b class="tnum">${fmt(Pa * A / 9.81, 0)} kg</b></div>`;
      $('[data-o=steps]', box).innerHTML = `<li>A = π × (${fmt(D / 1000, 3)} m)² ÷ 4 = ${fmt(A, 6)} m²</li><li>p = ${fmt(p)} bar × 100.000 = ${fmt(Pa)} Pa (1 bar = 10⁵ Pa = 10⁵ N/m²)</li><li>F = p × A = ${fmt(Pa)} × ${fmt(A, 6)} = ${fmt(Pa * A, 0)} N</li><li>Sisi batang: luas dikurangi luas batang (${fmt(Ar, 6)} m²), jadi gaya mundur lebih kecil.</li>`;
    };
    box.addEventListener('input', draw); draw();
  };
  W.yd = box => {
    box.innerHTML = `<div class="hdr-ctl"><label class="field">Arus nominal In (A)<input type="number" value="10" min="0.1" step="0.1" data-k="i" inputmode="decimal"></label><label class="field">Kelipatan arus start DOL<input type="range" min="5" max="7" step="0.5" value="6" data-k="k"><output class="mono" data-o="k"></output></label></div><div class="stat-grid" data-o="o"></div><div class="cmpbar" data-o="bar"></div>`;
    const draw = () => {
      const I = +$('[data-k=i]', box).value || 0, k = +$('[data-k=k]', box).value; $('[data-o=k]', box).textContent = k + '×';
      const dol = I * k, y = dol / 3;
      $('[data-o=o]', box).innerHTML = `<div><span>Arus start DOL</span><b class="tnum">${fmt(dol, 1)} A</b></div><div><span>Arus start bintang</span><b class="tnum">${fmt(y, 1)} A</b></div><div><span>Torsi start bintang</span><b>⅓ torsi DOL</b></div><div><span>Tegangan per kumparan</span><b>1/√3 ≈ 58%</b></div>`;
      $('[data-o=bar]', box).innerHTML = `<div><span>DOL</span><i style="width:100%"></i></div><div><span>Bintang</span><i style="width:33.3%"></i></div><div><span>In</span><i class="n" style="width:${100 / k}%"></i></div>`;
    };
    box.addEventListener('input', draw); draw();
  };
  W.ip = box => {
    box.innerHTML = `<div class="hdr-ctl"><label class="field">Alamat PLC<input type="text" class="mono" value="192.168.250.1" data-k="a" autocomplete="off"></label><label class="field">Prefix<select data-k="p"><option value="24">/24 (255.255.255.0)</option><option value="16">/16 (255.255.0.0)</option><option value="25">/25 (255.255.255.128)</option></select></label><label class="field">Alamat PC<input type="text" class="mono" value="192.168.250.100" data-k="b" autocomplete="off"></label></div><div data-o="o"></div>`;
    const P4 = s => { const m = s.trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/); if (!m) return null; const o = m.slice(1).map(Number); if (o.some(x => x > 255)) return null; return ((o[0] << 24) >>> 0) + (o[1] << 16) + (o[2] << 8) + o[3]; };
    const S = n => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
    const draw = () => {
      const a = P4($('[data-k=a]', box).value), b = P4($('[data-k=b]', box).value), p = +$('[data-k=p]', box).value;
      if (a === null || b === null) { $('[data-o=o]', box).innerHTML = '<p class="ferr">Tulis alamat IPv4 seperti 192.168.250.1 (empat angka 0-255).</p>'; return; }
      const mask = p === 0 ? 0 : (0xffffffff << (32 - p)) >>> 0, na = (a & mask) >>> 0, nb = (b & mask) >>> 0, bc = (na | ~mask) >>> 0;
      let v, cls = 'good';
      if (a === b) { v = 'Alamat sama dengan PLC: terjadi alamat IP ganda. Kedua perangkat bisa putus-sambung.'; cls = 'bad'; }
      else if (na !== nb) { v = `PC berada di jaringan lain (${S(nb)}/${p}). PC tidak bisa langsung berkomunikasi dengan PLC tanpa router.`; cls = 'bad'; }
      else if (b === na || b === bc) { v = `${S(b)} adalah alamat ${b === na ? 'jaringan' : 'broadcast'}, tidak boleh dipakai perangkat.`; cls = 'bad'; }
      else v = 'Valid: satu jaringan dengan PLC dan bukan alamat jaringan/broadcast. Pastikan juga tidak dipakai perangkat lain di tabel alamat lab.';
      $('[data-o=o]', box).innerHTML = `<div class="stat-grid"><div><span>Alamat jaringan</span><b class="mono">${S(na)}/${p}</b></div><div><span>Broadcast</span><b class="mono">${S(bc)}</b></div><div><span>Rentang host</span><b class="mono">${S(na + 1)} - ${S(bc - 1)}</b></div></div><div class="verdict ${cls}">${esc(v)}</div>`;
    };
    box.addEventListener('input', draw); draw();
  };

  /* ---------------- GRAFCET sortir: simulasi + langkah aktif ---------------- */
  W.grafcet = box => {
    const sim = new STN.Sim('sortir');
    sim.load(P.sortir);
    box.innerHTML = `<div class="mini-grid"><div class="stack"><div data-o="plant"></div><div data-o="field"></div></div><div class="stack"><div data-o="g"></div><div class="stat-grid"><div><span>D0 logam (BCD)</span><b class="tnum" data-o="d0">0</b></div><div><span>D1 nonlogam (BCD)</span><b class="tnum" data-o="d1">0</b></div><div class="wide"><span>Status</span><b data-o="st"></b></div></div></div></div>
      <p class="small muted">Coba: AUTO → RESET → START → taruh benda. Lalu tekan STOP siklus di tengah, E-STOP di tengah gerak, dan pasang gangguan "sensor A1 tidak terbaca" untuk melihat watchdog.</p>`;
    const G = [[0, 150, 20, 'H1 READY'], [1, 150, 90, 'M1 konveyor jalan'], [2, 70, 180, 'Y1: A maju · D0+1'], [3, 230, 180, 'Y2: B maju · D1+1'], [4, 70, 250, 'A mundur'], [5, 230, 250, 'B mundur']];
    $('[data-o=g]', box).innerHTML = `<svg viewBox="0 0 320 300" style="width:100%;max-width:360px" class="grafcet" role="img" aria-label="GRAFCET stasiun sortir dengan langkah aktif">
      <path d="M150 50V78M150 120V140H70V168M150 140H230V168M70 210V238M230 210V238M70 280V292H230V280M150 292V296H10V64H150" class="gl"/>
      <path d="M140 62h20M60 154h20M220 154h20M60 224h20M220 224h20M140 292h20" class="gt"/>
      <text x="166" y="66" class="gtx">START·A0·B0·AUTO</text><text x="84" y="150" class="gtx">S1·S2</text><text x="244" y="150" class="gtx">S1·/S2</text><text x="84" y="228" class="gtx">A1</text><text x="244" y="228" class="gtx">B1</text><text x="166" y="290" class="gtx">A0 / B0</text>
      ${G.map(([n, x, y, a]) => `<g class="gs" data-s="${n}"><rect x="${x - 16}" y="${y}" width="32" height="30" rx="2"/>${n === 0 ? `<rect x="${x - 12}" y="${y + 4}" width="24" height="22" rx="1" class="inner"/>` : ''}<text x="${x}" y="${y + 20}">${n}</text><text x="${x + (x > 150 ? -22 : 22)}" y="${y + 19}" class="ga" text-anchor="${x > 150 ? 'end' : 'start'}">${n === 2 || n === 4 ? '' : ''}</text></g>`).join('')}
      </svg><ul class="small list" style="margin:0">${G.map(([n, , , a]) => `<li><b>Langkah ${n}</b>: ${esc(a)}</li>`).join('')}</ul>`;
    const drawPlant = sim.st.view($('[data-o=plant]', box), sim), drawField = STN.fieldPanel($('[data-o=field]', box), sim);
    const gs = $$('.gs', box);
    sim.el = box;
    sim.draw = () => {
      drawPlant(); drawField();
      gs.forEach(g => g.classList.toggle('on', sim.cpu.bit('W0.0' + g.dataset.s)));
      $('[data-o=d0]', box).textContent = PLC.hex4(sim.cpu.word('D0')).replace(/^0+(?=\d)/, '');
      $('[data-o=d1]', box).textContent = PLC.hex4(sim.cpu.word('D1')).replace(/^0+(?=\d)/, '');
      const al = sim.cpu.bit('W1.01'), es = !sim.cpu.bit('0.03');
      $('[data-o=st]', box).textContent = es ? 'E-stop aktif: semua langkah di-reset, daya aktuator diputus' : al ? 'ALARM watchdog: tekan RESET setelah penyebab diatasi' : !sim.cpu.bit('0.04') ? 'MANUAL: jog per aktuator dengan interlock' : sim.cpu.bit('W1.00') ? 'STOP siklus diminta: berhenti di akhir siklus' : 'AUTO';
    };
    STN.LIVE.add(sim);
  };

  /* ---------------- Lab HMI (NB-like) ---------------- */
  const HMI_PROG = `; Stasiun konveyor penanda dengan HMI
; Setpoint awal 5,0 s bila D100 masih kosong
LD      A200.11
AND =   D100 #0000
MOV(021) #0050 D100
; START fisik/HMI, STOP fisik/HMI berprioritas, TOR, E-stop
LD      0.00      ; START fisik
OR      W10.00    ; START_HMI
OR      W1.00     ; pengunci
AND     0.01      ; STOP fisik (NC)
AND NOT W10.01    ; STOP_HMI
AND     0.02      ; TOR (NC)
AND     0.03      ; E-stop status (NC)
OUT     W1.00     ; sistem jalan
; Produk tiba di B1: tahan selama setpoint D100
LD      0.05
AND     W1.00
DIFU    W1.01     ; tepi naik produk
LD      W1.01
LD      T000
OR NOT  W1.00
KEEP(011) W0.10   ; langkah tahan
LD      W0.10
TIM     000 D100  ; SV dari HMI (BCD, 0,1 s)
LD      W1.00
AND NOT W0.10
AND NOT C000
OUT     100.00    ; K1 konveyor
LD      W1.00
OUT     100.03    ; H1 RUN
; Sisa batch
LD      W1.01
LD      0.06      ; RESET fisik
OR      W10.02    ; RESET_HMI
CNT     000 #10
LD      C000
OUT     100.05    ; H3 batch selesai
; Alarm ke HMI
LD NOT  0.02
OUT     W20.00    ; ALM_TOR
LD NOT  0.03
OUT     W20.01    ; ALM_ESTOP
LD      100.00
AND NOT 0.05
TIM     001 #150  ; 15 s jalan tanpa produk
LD      T001
OUT     W20.02    ; ALM_TIMEOUT
LD      W20.00
OR      W20.01
OR      W20.02
OUT     100.04    ; H2 alarm
END(001)`;
  STN.STATION.hmi = {
    nama: 'Konveyor penanda + HMI', sub: '',
    inputs: [{ addr: '0.00', sym: 'START', dev: 'S1', tipe: 'NO', c: 'g' }, { addr: '0.01', sym: 'STOP', dev: 'S0', tipe: 'NC', c: 'r' }, { addr: '0.02', sym: 'TOR', dev: 'F3', tipe: 'NC', kind: 'toggle', label: 'TOR trip', c: 'a' }, { addr: '0.03', sym: 'ESTOP', dev: 'status E-stop', tipe: 'NC', kind: 'toggle', label: 'E-STOP', c: 'r' }, { addr: '0.06', sym: 'RESET', dev: 'S4', tipe: 'NO', c: 'b' }, { addr: '0.05', sym: 'B1', dev: 'sensor produk', kind: 'auto', tipe: 'PNP' }],
    outputs: [{ addr: '100.00', sym: 'K1' }, { addr: '100.03', sym: 'H1' }, { addr: '100.04', sym: 'H2' }, { addr: '100.05', sym: 'H3' }],
    model() { const m = STN.STATION.conv.model(); const s = m.step; m.step = (dt, cpu, field) => { s(dt, cpu, field); if (field.ESTOP) m.run = false; }; return m; },
    view(box, sim) { return STN.STATION.conv.view(box, sim); }
  };
  const TAGS0 = [
    { n: 'START_HMI', a: 'W10.00', o: 'Bit switch momentary', rw: 'Tulis' }, { n: 'STOP_HMI', a: 'W10.01', o: 'Bit switch momentary', rw: 'Tulis' }, { n: 'RESET_HMI', a: 'W10.02', o: 'Bit switch momentary', rw: 'Tulis' },
    { n: 'K1_RUN', a: '100.00', o: 'Bit lamp', rw: 'Baca' }, { n: 'ALM_TOR', a: 'W20.00', o: 'Bit lamp/alarm', rw: 'Baca' }, { n: 'ALM_ESTOP', a: 'W20.01', o: 'Bit lamp/alarm', rw: 'Baca' }, { n: 'ALM_TIMEOUT', a: 'W20.02', o: 'Bit alarm', rw: 'Baca' },
    { n: 'T_HOLD_PV', a: 'T000', o: 'Numeric display', rw: 'Baca', f: 'BCD', dec: 1 }, { n: 'T_HOLD_SP', a: 'D100', o: 'Numeric input', rw: 'Tulis', f: 'BCD', dec: 1, min: 10, max: 99 }, { n: 'BATCH_PV', a: 'C000', o: 'Numeric display', rw: 'Baca', f: 'BCD', dec: 0 }
  ];
  const HMI_CHECK = [['start', 'START dari HMI menjalankan konveyor'], ['stop', 'STOP dari HMI menghentikan konveyor (berprioritas)'], ['sp', 'Setpoint baru dipakai sebagai waktu tahan'], ['lim', 'Nilai di luar batas ditolak HMI'], ['pass', 'Layar setting dilindungi sandi'], ['alm', 'Alarm TOR/E-stop muncul dengan pesan yang jelas'], ['ack', 'Alarm di-acknowledge operator']];
  W.hmi = box => {
    const sim = new STN.Sim('hmi');
    sim.load(HMI_PROG);
    let tags = store.get('hmi-tags', null) || TAGS0.map(t => Object.assign({}, t));
    if (tags.length !== TAGS0.length) tags = TAGS0.map(t => Object.assign({}, t));
    const chk = store.get('hmi-check', {});
    let screen = 'main', unlocked = false, hist = [], prevAl = {}, acked = {};
    box.innerHTML = `<div class="hmi-grid"><div class="stack"><div class="nb" data-o="nb"></div><p class="small muted">Layar meniru HMI Omron NB. Tombol di layar menulis bit W; PLC yang memutuskan. E-stop tetap tombol fisik.</p></div>
      <div class="stack"><div class="panel"><h3>Perangkat lapangan</h3><div data-o="plant"></div><div data-o="field"></div></div></div></div>
      <div class="panel"><h3>Daftar tag (ubah untuk mencoba salah alamat/format)</h3><div class="tbl-wrap"><table class="tbl small"><thead><tr><th>Nama tag</th><th>Alamat</th><th>Objek</th><th>Akses</th><th>Format</th></tr></thead><tbody data-o="tags"></tbody></table></div><div class="btn-row"><button type="button" class="btn btn-ghost small" data-k="tagreset">${icon('reset')}Kembalikan daftar tag</button></div></div>
      <div class="panel"><h3>Checklist uji integrasi</h3><ul class="checks small" data-o="chk"></ul></div>`;
    const mark = k => { if (!chk[k]) { chk[k] = true; store.set('hmi-check', chk); drawChk(); } };
    const drawChk = () => { $('[data-o=chk]', box).innerHTML = HMI_CHECK.map(([k, t]) => `<li class="${chk[k] ? 'pass' : ''}">${chk[k] ? '✓' : '○'} ${esc(t)}</li>`).join(''); };
    const tag = n => tags.find(t => t.n === n);
    const bitOf = n => { try { return sim.cpu.bit(tag(n).a); } catch (e) { return null; } };
    const writeBit = (n, v) => { try { const a = tag(n).a; const pa = PLC.parseBit(a); sim.cpu.sb(pa, v); } catch (e) { toast('Alamat tag ' + n + ' tidak valid: komunikasi menolak'); } };
    const readNum = n => {
      const t = tag(n); let w;
      try { w = sim.cpu.word(t.a); } catch (e) { return '####'; }
      const v = t.f === 'BCD' ? PLC.fromBCD(w) : w;
      if (isNaN(v)) return 'ERR';
      return t.dec ? fmt(v / 10, 1) : String(v);
    };
    const MSG = { ALM_TOR: 'TOR konveyor trip. Periksa beban motor, reset TOR, lalu START.', ALM_ESTOP: 'E-stop ditekan di panel konveyor. Pastikan area aman, lepas E-stop, lalu START.', ALM_TIMEOUT: 'Konveyor jalan 15 s tanpa produk di B1. Periksa umpan produk atau sensor B1.' };
    function drawTags() {
      $('[data-o=tags]', box).innerHTML = tags.map((t, i) => `<tr><td class="mono">${t.n}</td><td><input class="mono tag-in" data-ti="${i}" value="${esc(t.a)}" aria-label="Alamat ${t.n}"></td><td>${esc(t.o)}</td><td>${t.rw}</td><td>${t.f ? `<select data-tf="${i}" aria-label="Format ${t.n}"><option${t.f === 'BCD' ? ' selected' : ''}>BCD</option><option${t.f === 'BIN' ? ' selected' : ''}>BIN</option></select>` : '–'}</td></tr>`).join('');
    }
    function drawNb() {
      const nb = $('[data-o=nb]', box);
      const head = t => `<div class="nb-head"><b>${t}</b><span>${unlocked ? 'Teknisi' : 'Operator'}</span></div>`;
      if (screen === 'main') {
        nb.innerHTML = head('STASIUN KONVEYOR - LAYAR UTAMA') + `<div class="nb-body"><div class="nb-col"><div class="btn-row"><button type="button" class="nbb go" data-h="START_HMI">START</button><button type="button" class="nbb stop" data-h="STOP_HMI">STOP</button></div>
          <label class="nb-num">Waktu tahan berjalan (s)<b data-n="T_HOLD_PV"></b></label><label class="nb-num">Setpoint waktu tahan (s)<b data-n="T_HOLD_SP"></b></label></div>
          <div class="nb-col"><span class="nb-lamp" data-l="K1_RUN"><i></i>MOTOR RUN</span><span class="nb-lamp al" data-l="ALM_TOR"><i></i>TOR TRIP</span><span class="nb-lamp al" data-l="ALM_ESTOP"><i></i>E-STOP</span><label class="nb-num">Sisa batch<b data-n="BATCH_PV"></b></label></div></div>
          <div class="nb-foot"><button type="button" class="nbb" data-h="RESET_HMI">RESET BATCH</button><button type="button" class="nbb nav" data-go="set">SETTING</button><button type="button" class="nbb nav" data-go="alm">ALARM</button></div>`;
      } else if (screen === 'set') {
        nb.innerHTML = head('SETTING') + (unlocked ? `<div class="nb-body"><div class="nb-col"><label class="nb-num">Setpoint waktu tahan (1,0 - 9,9 s)<span class="btn-row"><input type="number" step="0.1" data-k="spv" value="${readNum('T_HOLD_SP')}" inputmode="decimal"><button type="button" class="nbb" data-k="spok">OK</button></span></label><p class="nb-msg" data-o="spmsg"></p></div></div>` :
          `<div class="nb-body"><div class="nb-col"><label class="nb-num">Sandi teknisi (latihan: 1234)<span class="btn-row"><input type="password" data-k="pw" inputmode="numeric" autocomplete="off"><button type="button" class="nbb" data-k="pwok">Masuk</button></span></label><p class="nb-msg" data-o="pwmsg"></p></div></div>`) + `<div class="nb-foot"><button type="button" class="nbb nav" data-go="main">UTAMA</button>${unlocked ? '<button type="button" class="nbb nav" data-k="logout">KELUAR</button>' : ''}</div>`;
      } else {
        nb.innerHTML = head('ALARM') + `<div class="nb-body"><div class="nb-col" style="grid-column:1/-1"><ul class="nb-alarms">${hist.length ? hist.slice(-6).reverse().map(h => `<li class="${h.on ? 'act' : ''}${acked[h.id] ? ' ack' : ''}"><b>${h.t}</b> ${esc(MSG[h.n])}</li>`).join('') : '<li>Tidak ada alarm.</li>'}</ul></div></div><div class="nb-foot"><button type="button" class="nbb" data-k="ack">ACK</button><button type="button" class="nbb nav" data-go="main">UTAMA</button></div>`;
      }
      $$('.nbb[data-h]', nb).forEach(b => {
        const n = b.dataset.h;
        b.addEventListener('pointerdown', e => { e.preventDefault(); writeBit(n, true); b.classList.add('on'); if (n === 'START_HMI') setTimeout(() => { if (sim.cpu.bit('100.00') || sim.cpu.bit('W1.00')) mark('start'); }, 150); if (n === 'STOP_HMI' && sim.cpu.bit('W1.00')) setTimeout(() => { if (!sim.cpu.bit('W1.00')) mark('stop'); }, 150); });
        ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, () => { if (b.classList.contains('on')) { writeBit(n, false); b.classList.remove('on'); } }));
      });
    }
    function updNb() {
      $$('[data-n]', box).forEach(el => { el.textContent = readNum(el.dataset.n); });
      $$('[data-l]', box).forEach(el => { const v = bitOf(el.dataset.l); el.classList.toggle('on', !!v); el.classList.toggle('bad', v === null); });
      ['ALM_TOR', 'ALM_ESTOP', 'ALM_TIMEOUT'].forEach(n => {
        const v = !!bitOf(n);
        if (v && !prevAl[n]) { hist.push({ id: hist.length, n, on: true, t: new Date().toLocaleTimeString('id-ID') }); if (n !== 'ALM_TIMEOUT') mark('alm'); if (screen === 'alm') drawNb(); }
        if (!v && prevAl[n]) { hist.forEach(h => { if (h.n === n) h.on = false; }); if (screen === 'alm') drawNb(); }
        prevAl[n] = v;
      });
    }
    box.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.go) { screen = b.dataset.go; drawNb(); }
      if (b.dataset.k === 'pwok') { if ($('[data-k=pw]', box).value === '1234') { unlocked = true; mark('pass'); drawNb(); } else $('[data-o=pwmsg]', box).textContent = 'Sandi salah.'; }
      if (b.dataset.k === 'logout') { unlocked = false; drawNb(); }
      if (b.dataset.k === 'ack') { hist.forEach(h => { acked[h.id] = true; }); if (hist.length) mark('ack'); drawNb(); }
      if (b.dataset.k === 'spok') {
        const v = Math.round(+$('[data-k=spv]', box).value * 10), t = tag('T_HOLD_SP'), msg = $('[data-o=spmsg]', box);
        if (!(v >= t.min && v <= t.max)) { msg.textContent = `Ditolak: batas ${fmt(t.min / 10, 1)} - ${fmt(t.max / 10, 1)} s.`; mark('lim'); return; }
        try { sim.cpu.setWord(t.a, t.f === 'BCD' ? PLC.toBCD(v) : v); } catch (x) { msg.textContent = 'Alamat setpoint tidak valid.'; return; }
        const raw = sim.cpu.word('D100'), bcd = PLC.fromBCD(raw);
        msg.textContent = `Tertulis ke ${t.a} = ${PLC.hex4(raw)} (heksa). ${t.f === 'BIN' ? (isNaN(bcd) ? 'PLC membaca SV sebagai BCD: bukan BCD, timer error.' : `PLC membaca SV sebagai BCD = ${fmt(bcd / 10, 1)} s, bukan ${fmt(v / 10, 1)} s!`) : 'Format cocok dengan TIM (BCD).'}`;
        if (t.f === 'BCD' && t.a.toUpperCase() === 'D100') mark('sp');
      }
      if (b.dataset.k === 'tagreset') { tags = TAGS0.map(t => Object.assign({}, t)); store.set('hmi-tags', null); drawTags(); drawNb(); }
    });
    box.addEventListener('change', e => {
      if (e.target.dataset.ti !== undefined) { tags[+e.target.dataset.ti].a = e.target.value.trim(); store.set('hmi-tags', tags); }
      if (e.target.dataset.tf !== undefined) { tags[+e.target.dataset.tf].f = e.target.value; store.set('hmi-tags', tags); }
    });
    const drawPlant = sim.st.view($('[data-o=plant]', box), sim), drawField = STN.fieldPanel($('[data-o=field]', box), sim);
    drawTags(); drawNb(); drawChk();
    sim.el = box; sim.draw = () => { drawPlant(); drawField(); updNb(); };
    STN.LIVE.add(sim);
  };
  W.hmi.CHECK = HMI_CHECK;

  /* ---------------- Lab jaringan: dua PLC dengan Serial PLC Link ---------------- */
  const NET_A = `; PLC A - stasiun sortir (polling unit), kirim CIO 200-209
LD      P_1s
OUT     200.00    ; heartbeat A -> B
; Produk siap: hanya bila B siap dan komunikasi sehat
LD      0.00      ; tombol/sensor produk siap
AND     211.00    ; status B: siap
AND NOT W30.00
SET     200.01    ; produk siap -> B
; ACK dari B: reset permintaan, tambah hitungan
LD      210.01
RSET    200.01
@++B(594) 201     ; jumlah produk terkirim
; Watchdog heartbeat B (diam > 3 s = alarm)
LD      210.00
TIM     010 #30
LD NOT  210.00
TIM     011 #30
LD      T010
OR      T011
OUT     W30.00    ; alarm komunikasi
LD      W30.00
OUT     100.04    ; lampu alarm A
LD NOT  W30.00
OUT     100.00    ; konveyor A boleh jalan
END(001)`;
  const NET_B = `; PLC B - stasiun pengemas (polled unit 0), kirim CIO 210-219
LD      P_1s
OUT     210.00    ; heartbeat B -> A
; Status siap: tidak sibuk dan komunikasi sehat
LD NOT  W30.00
AND NOT W0.01
OUT     211.00
; Terima produk: balas ACK dan kemas 2 s
LD      200.01
AND NOT W30.00
SET     210.01    ; ACK
SET     W0.01     ; sibuk
LD NOT  200.01
RSET    210.01
LD      W0.01
TIM     001 #20
LD      T001
RSET    W0.01
LD      W0.01
OUT     100.00    ; mesin pengemas
; Watchdog heartbeat A
LD      200.00
TIM     010 #30
LD NOT  200.00
TIM     011 #30
LD      T010
OR      T011
OUT     W30.00
LD      W30.00
OUT     100.04    ; lampu alarm B: berhenti aman
END(001)`;
  const NET_F = [
    { id: 'cable', t: 'Kabel RS-485 lepas', lay: 'fisik', ev: { fisik: 'LED komunikasi option board kedua PLC padam; terminal A/B salah satu PLC kosong.', konfig: 'Setelan kedua PLC sama dan benar.', prog: 'Heartbeat A berkedip di PLC A, tetapi 200.00 di PLC B diam.' } },
    { id: 'unit', t: 'Nomor polled unit B salah (1, bukan 0)', lay: 'konfigurasi', ev: { fisik: 'Kabel dan terminator terpasang; LED komunikasi PLC A berkedip mencari unit.', konfig: 'PLC Settings B: Serial PLC Link (Slave), unit No. 1. PLC A hanya mempolling unit No. 0.', prog: 'Area 210-219 di PLC A tidak pernah berubah.' } },
    { id: 'stop', t: 'PLC A dalam mode PROGRAM (heartbeat berhenti)', lay: 'program', ev: { fisik: 'Kabel baik, LED komunikasi menyala.', konfig: 'Setelan port kedua PLC benar.', prog: 'PLC A tidak RUN: 200.00 diam terus di status terakhir. PLC B mendeteksi heartbeat mati.' } },
    { id: 'baud', t: 'Baud rate PLC B berbeda', lay: 'konfigurasi', ev: { fisik: 'Kabel terpasang; LED komunikasi berkedip tidak teratur.', konfig: 'PLC A 115.200 bit/s, PLC B 38.400 bit/s.', prog: 'Tidak ada data yang masuk di kedua arah.' } }
  ];
  W.net = box => {
    const A = new PLC.Cpu(), B = new PLC.Cpu();
    const pa = PLC.compile(NET_A), pb = PLC.compile(NET_B);
    A.load(pa); B.load(pb);
    const S = store.get('net', { solved: 0, tries: 0 });
    let fault = '', hidden = null, linkT = 0, log = [], reveal = {}, prodBtn = false, answered = false;
    box.innerHTML = `<div class="net-top"><div class="seg" data-k="mode"><button type="button" class="on" data-v="free">Latihan bebas</button><button type="button" data-v="case">Diagnosis gangguan</button></div><span class="small muted" data-o="score"></span></div>
      <div class="net-grid"><div class="net-plc" data-p="A"><h4>PLC A · sortir</h4><div class="led-row"><span class="led" data-b="A:200.00"><i></i>heartbeat A</span><span class="led" data-b="A:210.00"><i></i>dari B</span><span class="led" data-b="A:200.01"><i></i>produk siap</span><span class="led out" data-b="A:100.04"><i></i>alarm</span></div><button type="button" class="btn btn-ghost small" data-k="prod">Produk siap (0.00)</button><span class="small">Terkirim: <b data-o="cnt">0</b></span></div>
      <div class="net-link"><span data-o="link">RS-485</span></div>
      <div class="net-plc" data-p="B"><h4>PLC B · pengemas</h4><div class="led-row"><span class="led" data-b="B:210.00"><i></i>heartbeat B</span><span class="led" data-b="B:200.00"><i></i>dari A</span><span class="led" data-b="B:210.01"><i></i>ACK</span><span class="led out" data-b="B:100.00"><i></i>kemas</span><span class="led out" data-b="B:100.04"><i></i>alarm</span></div></div></div>
      <div class="tbl-wrap"><table class="tbl small mono"><thead><tr><th>Word/bit</th><th>Arah</th><th>Isi</th><th>Di A</th><th>Di B</th></tr></thead><tbody data-o="tbl"></tbody></table></div>
      <div data-o="free"><div class="btn-row">${NET_F.map(f => `<label class="small chk"><input type="radio" name="nf" value="${f.id}"> ${esc(f.t)}</label>`).join('')}<label class="small chk"><input type="radio" name="nf" value="" checked> normal</label></div></div>
      <div data-o="case" hidden></div><h4>Communication log</h4><ol class="list small" data-o="log"></ol>`;
    const rows = [['200.00', 'A→B', 'heartbeat A'], ['200.01', 'A→B', 'produk siap'], ['201', 'A→B', 'jumlah terkirim (BCD)'], ['210.00', 'B→A', 'heartbeat B'], ['210.01', 'B→A', 'ACK'], ['211.00', 'B→A', 'status siap']];
    const linkOk = () => !['cable', 'unit', 'baud'].includes(fault);
    const addLog = t => { log.push(`${(A.t / 1000).toFixed(1).replace('.', ',')} s · ${t}`); if (log.length > 12) log.shift(); };
    let prevAlarm = { A: false, B: false };
    const sim = {
      el: box, acc: 0,
      step(dt) {
        A.run = fault !== 'stop';
        A.setIn('0.00', prodBtn);
        A.scan(dt); B.scan(dt);
        linkT += dt;
        if (linkT >= 40) { linkT = 0; if (linkOk()) { for (let w = 200; w < 210; w++) B.m.CIO[w] = A.m.CIO[w] || 0; for (let w = 210; w < 220; w++) A.m.CIO[w] = B.m.CIO[w] || 0; } }
        ['A', 'B'].forEach(k => { const c = k === 'A' ? A : B, al = c.bit('W30.00'); if (al !== prevAlarm[k]) { addLog(`${k}: ${al ? 'ALARM komunikasi (heartbeat diam > 3 s)' : 'komunikasi pulih'}`); prevAlarm[k] = al; } });
      },
      draw() {
        $$('[data-b]', box).forEach(el => { const [k, a] = el.dataset.b.split(':'); el.classList.toggle('on', (k === 'A' ? A : B).bit(a)); });
        $('[data-o=cnt]', box).textContent = PLC.fromBCD(A.word('201')) || 0;
        $('[data-o=link]', box).textContent = linkOk() ? 'RS-485 · data link' : 'RS-485 · tidak ada data';
        $('[data-o=link]', box).parentNode.classList.toggle('bad', !linkOk());
        $('[data-o=tbl]', box).innerHTML = rows.map(([a, d, t]) => { const isW = !a.includes('.'); const v = c => isW ? PLC.hex4(c.word(a)) : c.bit(a) ? '1' : '0'; return `<tr><td>${a}</td><td>${d}</td><td>${t}</td><td>${v(A)}</td><td>${v(B)}</td></tr>`; }).join('');
        $('[data-o=log]', box).innerHTML = log.map(l => `<li>${esc(l)}</li>`).join('') || '<li class="muted">Belum ada kejadian.</li>';
        $('[data-o=score]', box).textContent = `Diagnosis benar: ${S.solved} dari ${S.tries}`;
      }
    };
    const b = $('[data-k=prod]', box);
    b.addEventListener('pointerdown', e => { e.preventDefault(); prodBtn = true; b.classList.add('on'); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, () => { if (prodBtn) addLog('A: tombol produk siap'); prodBtn = false; b.classList.remove('on'); }));
    function newCase() {
      hidden = NET_F[Math.floor(Math.random() * NET_F.length)]; fault = hidden.id; reveal = {}; answered = false; addLog('Kasus baru: data dari A tidak sampai ke B.');
      drawCase();
    }
    function drawCase() {
      $('[data-o=case]', box).innerHTML = `<p><b>Gejala:</b> lampu alarm komunikasi menyala dan stasiun berhenti aman. Periksa lapis demi lapis, lalu tentukan penyebabnya.</p>
        <div class="btn-row"><button type="button" class="btn btn-ghost small" data-r="fisik">Periksa lapis fisik</button><button type="button" class="btn btn-ghost small" data-r="konfig">Periksa konfigurasi</button><button type="button" class="btn btn-ghost small" data-r="prog">Monitor program/data</button></div>
        <ul class="list small">${Object.keys(reveal).map(k => `<li><b>${k === 'fisik' ? 'Fisik' : k === 'konfig' ? 'Konfigurasi' : 'Program/data'}:</b> ${esc(hidden.ev[k])}</li>`).join('')}</ul>
        <label class="field">Penyebab<select data-k="ans"><option value="">Pilih…</option>${NET_F.map(f => `<option value="${f.id}">${esc(f.t)}</option>`).join('')}</select></label><div class="btn-row"><button type="button" class="btn btn-primary small" data-k="check">Periksa</button><button type="button" class="btn btn-ghost small" data-k="new">Kasus baru</button><button type="button" class="btn btn-ghost small" data-k="tolog">${icon('down')}Simpan ke Communication Log</button></div><div data-o="v"></div>`;
    }
    box.addEventListener('click', e => {
      const t = e.target.closest('button'); if (!t) return;
      const seg = t.closest('.seg');
      if (seg && seg.dataset.k === 'mode') {
        $$('button', seg).forEach(x => x.classList.toggle('on', x === t));
        const c = t.dataset.v === 'case'; $('[data-o=case]', box).hidden = !c; $('[data-o=free]', box).hidden = c;
        if (c) newCase(); else { fault = ''; $$('[name=nf]', box).forEach(r => { r.checked = r.value === ''; }); }
      }
      if (t.dataset.r) { reveal[t.dataset.r] = true; addLog(`Pemeriksaan ${t.dataset.r === 'konfig' ? 'konfigurasi' : t.dataset.r}`); drawCase(); }
      if (t.dataset.k === 'new') newCase();
      if (t.dataset.k === 'check') {
        const v = $('[data-k=ans]', box).value; if (!v) { toast('Pilih penyebab dulu'); return; }
        const ok = v === hidden.id; if (!answered) { S.tries++; if (ok) S.solved++; store.set('net', S); answered = true; }
        $('[data-o=v]', box).innerHTML = `<div class="verdict ${ok ? 'good' : 'bad'}"><b>${ok ? 'Tepat.' : 'Belum tepat.'}</b> Penyebab: ${esc(hidden.t)} (lapis ${hidden.lay}). ${ok ? 'Perbaikan diterapkan: amati heartbeat pulih dan alarm padam setelah ±3 s.' : ''}</div>`;
        if (ok) { fault = ''; addLog('Perbaikan: ' + hidden.t); }
      }
      if (t.dataset.k === 'tolog') { const T = store.get('log:net', []); log.forEach(l => T.push({ c: ['PLC A/B', 'CIO 200-219', 'heartbeat dan data mengalir', l, ''] })); store.set('log:net', T); toast('Ditambahkan ke Communication Log'); }
    });
    box.addEventListener('change', e => { if (e.target.name === 'nf') { fault = e.target.value; addLog(fault ? 'Gangguan dipasang: ' + NET_F.find(f => f.id === fault).t : 'Kembali normal'); } });
    STN.LIVE.add(sim);
  };

  window.WG = W;
})();
