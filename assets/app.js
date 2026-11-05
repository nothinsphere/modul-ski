/* Aplikasi utama: navigasi, peta 32 pertemuan, isi guru dari data.js, kuis, LKPD digital, log kerja, dan kumpulkan hasil. */
(function () {
  'use strict';
  const D = window.SKI, STN = window.STN, WG = window.WG;
  const { $, $$, esc, store, icon, toast } = window.U;
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const fmt = (v, d) => Number(v).toLocaleString('id-ID', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });
  function copyText(text) {
    const fallback = () => { const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; } ta.remove(); toast(ok ? 'Disalin' : 'Gagal menyalin, pilih teks secara manual'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => toast('Disalin'), fallback); else fallback();
  }
  window.U.copy = copyText;
  function saveFile(name, text, type) {
    const blob = new Blob([text], { type: (type || 'text/plain') + ';charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('Mengunduh ' + name);
  }
  const csv = rows => '﻿' + rows.map(r => r.map(v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const MODS = D.modul;
  const MEET = MODS.flatMap(m => m.pertemuan.map(p => Object.assign({ mod: m.no, kode: m.kode }, p)));

  /* ============================== Tema ============================== */
  const rootEl = document.documentElement;
  function applyTheme(t) {
    if (t) rootEl.dataset.theme = t; else delete rootEl.dataset.theme;
    const dark = t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    $('#theme-btn use').setAttribute('href', dark ? '#i-sun' : '#i-moon');
  }
  applyTheme(store.get('theme', null));
  $('#theme-btn').addEventListener('click', () => {
    const cur = rootEl.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark'; store.set('theme', next); applyTheme(next);
  });

  /* ============================== Navigasi ============================== */
  const VIEWS = $$('.view').map(v => v.id.slice(2));
  const onShow = {};
  let current = null;
  const sidebar = $('#sidebar'), scrim = $('#scrim');
  function openDrawer() { sidebar.classList.add('open'); scrim.hidden = false; $('#menu-btn').setAttribute('aria-expanded', 'true'); }
  function closeDrawer() { sidebar.classList.remove('open'); scrim.hidden = true; $('#menu-btn').setAttribute('aria-expanded', 'false'); }
  $('#menu-btn').addEventListener('click', openDrawer);
  $('#tab-menu').addEventListener('click', openDrawer);
  scrim.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });
  function showTab(panel) {
    const view = panel.closest('.view');
    $$('.tab-panel', view).forEach(p => { p.hidden = p !== panel; });
    $$('[data-tab-for]', view).forEach(a => { const on = a.dataset.tabFor === panel.id; a.classList.toggle('on', on); a.setAttribute('aria-selected', on ? 'true' : 'false'); });
    store.set('tab:' + view.id, panel.id);
    mountWidgets(panel);
  }
  function ensureTab(view) {
    const panels = $$('.tab-panel', view);
    if (!panels.length || panels.filter(p => !p.hidden).length === 1) return;
    const saved = store.get('tab:' + view.id, null);
    showTab(panels.find(p => p.id === saved) || panels[0]);
  }
  function mountWidgets(root) {
    $$('[data-w]', root).forEach(el => {
      if (el._m || (el.closest('.tab-panel') && el.closest('.tab-panel').hidden)) return;
      const f = WG[el.dataset.w]; if (!f) return;
      el._m = true;
      try { f(el); } catch (e) { el.innerHTML = `<p class="ferr">Widget gagal dimuat: ${esc(e.message)}</p>`; console.error(e); }
    });
    const lab = $('[data-lab]', root);
    if (lab && !lab._m) { lab._m = true; window.LABAPI = STN.mountLab(lab); }
  }
  const TITLE = 'Sistem Kendali Industri';
  function route() {
    let id = decodeURIComponent(location.hash.slice(1)) || 'beranda';
    let anchor = null;
    if (!VIEWS.includes(id)) {
      const el = document.getElementById(id), v = el && el.closest('.view');
      if (v) { anchor = el; id = v.id.slice(2); } else id = 'beranda';
    }
    const viewChanged = current !== id;
    const panel = anchor && anchor.closest('.tab-panel');
    if (panel) showTab(panel); else ensureTab($('#v-' + id));
    if (viewChanged) {
      $$('.view').forEach(v => { v.hidden = v.id !== 'v-' + id; });
      current = id;
      const view = $('#v-' + id);
      $('#topbar-title').textContent = view.dataset.title;
      document.title = view.dataset.title === 'Beranda' ? TITLE : view.dataset.title + ' · ' + TITLE;
      $$('.nav-link').forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + id));
      if (/^m\d$/.test(id)) { store.set('lastMod', id); $('.tabbar [data-tab="materi"]').setAttribute('href', '#' + id); }
      const tab = /^m\d$|^info$|^k3$|^peta$|^beranda$/.test(id) ? 'materi' : ['lab', 'asesmen', 'lkpd'].includes(id) ? id : '';
      $$('.tabbar a').forEach(a => a.classList.toggle('active', a.dataset.tab === tab));
      mountWidgets(view);
      if (onShow[id]) onShow[id]();
    }
    closeDrawer();
    if (panel && anchor === panel) {
      const head = $('.chap-head', $('#v-' + id)), y = head.getBoundingClientRect().bottom + window.scrollY - 60;
      if (viewChanged) window.scrollTo(0, 0); else if (window.scrollY > y) window.scrollTo(0, y);
    } else if (anchor) setTimeout(() => anchor.scrollIntoView({ block: 'start' }), 0);
    else window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);
  $('.tabbar [data-tab="materi"]').setAttribute('href', '#' + store.get('lastMod', 'm1'));
  // Tab di dalam halaman (tautan #id panel).
  document.addEventListener('click', e => {
    const a = e.target.closest('a[data-tab-for]'); if (!a) return;
    const p = document.getElementById(a.dataset.tabFor); if (!p || p.closest('.view').hidden) return;
    e.preventDefault(); showTab(p); history.replaceState(null, '', '#' + p.id);
  });

  /* ============================== Peta 32 pertemuan ============================== */
  const TAHAP = [['Pendahuluan', 15, 'tb1'], ['Memahami', 30, 'tb2'], ['Mengaplikasi', 60, 'tb3'], ['Merefleksi', 15, 'tb4'], ['Penutup', 15, 'tb5']];
  const jpCfg = () => { const c = store.get('jp', { per: 3, min: 45 }); return { per: clamp(+c.per || 3, 1, 12), min: [30, 35, 40, 45].includes(+c.min) ? +c.min : 45 }; };
  function split(total) {
    const mins = TAHAP.map(([, m]) => Math.max(5, Math.round(total * m / 135 / 5) * 5));
    mins[2] += total - mins.reduce((a, b) => a + b, 0);
    return TAHAP.map(([n, , c], i) => [n, mins[i], c]);
  }
  function updateProgress() {
    const done = MEET.filter(m => store.get('meet' + m.no, false)).length;
    $('#prog-text').textContent = `${done}/${MEET.length}`;
    $('#prog-bar').style.width = (done / MEET.length * 100) + '%';
  }
  function meetDetail(m, total) {
    const seg = split(total);
    return `<div class="timebar" aria-hidden="true">${seg.map(([nm, mn, cls]) => `<div class="${cls}" style="flex:${mn}" title="${esc(nm)}"><b>${mn}'</b></div>`).join('')}</div>
      <dl class="meet-dl">${seg.map(([nm, mn]) => `<dt>${esc(nm)} · ${mn} menit</dt><dd>${esc(m.tahap[nm])}</dd>`).join('')}<dt>Bukti utama</dt><dd>${esc(m.bukti)}</dd></dl>`;
  }
  function renderMeetings() {
    const box = $('#meet-list'), { per, min } = jpCfg(), total = per * min;
    $('#jp-per').value = per; $('#jp-min').value = min;
    $('#jp-total').textContent = `${MEET.length} pertemuan × ${per} JP = ${MEET.length * per} JP`;
    $('#jp-note').textContent = `${per} × ${min} menit = ${total} menit per pertemuan. Pembagian 15 : 30 : 60 : 15 : 15 ikut disesuaikan.`;
    let html = '', last = 0;
    MEET.forEach(m => {
      if (m.mod !== last) {
        if (last) html += '</div>';
        const M = MODS[m.mod - 1];
        html += `<div class="meet-group"><h3><span class="rbar b${m.mod}"></span><a href="#m${m.mod}">Modul ${m.mod} · ${esc(M.judul.charAt(0) + M.judul.slice(1).toLowerCase())}</a><span class="tag">${M.kode} · ${M.semester}</span></h3>`;
        last = m.mod;
      }
      const on = store.get('meet' + m.no, false);
      html += `<div class="meet${on ? ' done' : ''}"><label class="meet-row"><input type="checkbox" data-meet="${m.no}"${on ? ' checked' : ''} aria-label="Pertemuan ${m.no} selesai"><span class="no">${m.no}</span><span class="t">${esc(m.judul)}</span></label>
        <div class="d"><span class="tag">TP ${m.kode}</span><span class="tag mask">${per} JP · ${total} menit</span><a href="#p${m.no}">Buka materi</a></div>
        <details class="meet-more"><summary>Rincian pertemuan</summary>${meetDetail(m, total)}</details></div>`;
    });
    box.innerHTML = html + '</div>';
    $$('input[data-meet]', box).forEach(cb => cb.addEventListener('change', () => { store.set('meet' + cb.dataset.meet, cb.checked); cb.closest('.meet').classList.toggle('done', cb.checked); updateProgress(); syncMeetChecks(); }));
  }
  ['#jp-per', '#jp-min'].forEach(s => $(s).addEventListener('change', () => { store.set('jp', { per: clamp(+$('#jp-per').value || 3, 1, 12), min: +$('#jp-min').value }); renderMeetings(); renderMeetBoxes(); }));
  $('#pola-tbl').innerHTML = `<thead><tr><th>Tahap</th><th>Menit</th><th>Fokus</th></tr></thead><tbody>${D.pola.map(r => `<tr><td><b>${esc(r[0])}</b></td><td class="tnum">${r[1]}</td><td>${esc(r[2])}</td></tr>`).join('')}</tbody>`;

  /* ============================== Halaman modul: kepala, alur pertemuan, tiket keluar ============================== */
  const EXIT_KEY = {
    1: 'Kontak NC membuat rangkaian fail-safe: bila kabel tombol STOP putus atau kontaknya rusak terbuka, rangkaian ikut terputus dan motor berhenti. Dengan kontak NO, kabel putus justru membuat STOP tidak berfungsi sementara motor tetap jalan.',
    2: 'Kontak bantu K1 13-14 dipasang paralel dengan S1 (START). Setelah K1 menarik, kontak ini menutup dan menjadi jalur arus pengganti sehingga K1 tetap ON walau START dilepas.',
    3: 'Kontak bantu NC K2 21-22 di jalur kumparan K1, dan K1 21-22 di jalur kumparan K2. Interlock tombol: kontak NC tombol lawan juga dipasang seri.',
    4: 'K2 menyatukan ujung kumparan (titik bintang), sedangkan K3 menghubungkan ujung yang sama ke fasa. Bila keduanya menutup, fasa terhubung langsung lewat titik bintang: hubung singkat antarfasa.',
    5: 'Amati gejala → matikan daya dan LOTO → baca diagram → uji kontinuitas bertahap (half-split) dari sumber ke kumparan → temukan dan perbaiki penyebab → izin guru, power ON, uji ulang dan catat.',
    6: 'Baca input → eksekusi program → perbarui output → layanan komunikasi/diagnosis. Akibatnya: perubahan input baru dibaca di scan berikutnya, pulsa yang lebih pendek dari waktu scan bisa terlewat, dan output fisik baru berubah di akhir scan.',
    7: 'Kontak NC di lapangan membuat input ON saat normal. Agar rung tertutup saat normal, input itu ditulis sebagai kontak NO. Saat STOP ditekan atau kabel putus, input OFF dan rung terbuka (fail-safe).',
    8: 'Ke 0 V. Sensor PNP mengeluarkan +24 V saat aktif, sehingga arus mengalir dari keluaran sensor, melewati input PLC, ke COM yang terhubung 0 V.',
    9: 'Contoh: inspeksi visual (terminal kencang, ferrule, marker), uji kontinuitas tiap jalur dan pastikan +24 V tidak terhubung ke 0 V, cek polaritas dan sekering terpasang, lalu izin guru.',
    10: 'I/O check membuktikan tiap titik wiring terhubung ke alamat yang benar (tanpa program). Uji fungsi membuktikan program menjalankan urutan kerja yang diminta. Wiring benar belum menjamin program benar, dan sebaliknya.',
    11: 'Itu koil ganda. Rung yang dieksekusi terakhir menentukan status output, sehingga rung pertama seolah tidak berpengaruh dan perilaku sulit ditebak.',
    12: 'Bit retentif tetap ON setelah daya pulih, sehingga motor bisa berputar sendiri tanpa START. Ini bahaya bagi orang yang sedang berada di dekat mesin. Motor harus selalu butuh START ulang.',
    13: 'Interlock program (kontak NC output K2 dan tombol REV di rung K1, dan sebaliknya) dan interlock hardware (kontak bantu NC kontaktor lawan pada jalur kumparan).',
    14: '#50 × 0,1 s = 5,0 s. TIM memakai satuan 0,1 s dan SV ditulis dalam BCD.',
    15: 'Masukan hitung (CP): setiap tepi naik mengurangi PV satu. Masukan reset (R): mengembalikan PV ke SV dan mematikan completion flag.',
    16: 'Jawaban bebas. Contoh: monitoring online, karena terlihat kontak mana yang memutus aliran daya; atau cross-reference, karena menunjukkan semua rung yang menulis alamat yang sama.',
    17: 'Pegas mengembalikan katup ke posisi awal, sehingga silinder kerja ganda bergerak mundur ke posisi belakang.',
    18: 'Sensor posisi membuktikan gerak benar-benar selesai. Timer hanya menebak: bila tekanan turun atau benda macet, timer tetap melanjutkan langkah walaupun silinder belum sampai.',
    19: 'Langkah B+ (W0.02) aktif dan sensor 2B2 (B depan, 0.07) ON → SET W0.03 dan RSET W0.02.',
    20: 'A = π × 0,04² / 4 = 0,001257 m²; p = 50 bar = 5.000.000 Pa; F = p × A ≈ 6.283 N ≈ 6,3 kN.',
    21: 'Kedua solenoid saling melawan: posisi katup tidak pasti, kumparan bisa panas, dan silinder bergerak tak terduga. Karena itu Y1 dan Y2 diinterlock.',
    22: 'Monitor bit output: bila output PLC ON (LED output dan LED katup menyala) tetapi katup tidak berpindah, masalahnya di katup/kumparan. Bila output tidak ON padahal syarat sudah terpenuhi, periksa program.',
    23: 'HMI dan komunikasinya bisa gagal atau macet. Fungsi keselamatan harus tetap bekerja, jadi E-stop dipasang hard-wired memutus daya aktuator.',
    24: 'W10.00 dipakai sebagai kontak NO yang diparalel dengan tombol START fisik (OR W10.00) pada rung pengunci motor.',
    25: 'Contoh: "TOR motor konveyor 1 trip. Matikan konveyor, periksa beban yang macet, reset TOR di panel, lalu tekan START."',
    26: 'Contoh: langkah 1, aksi "M1 konveyor jalan", transisi ke langkah 2 bila S1 · S2 (benda logam di posisi sortir).',
    27: 'STOP siklus menyelesaikan siklus yang sedang berjalan lalu berhenti di langkah 0. E-stop menghentikan segera, me-reset semua langkah, memutus daya aktuator, dan butuh RESET + homing sebelum START.',
    28: 'Dengan watchdog timer: saat benda masuk (S0) timer mulai; bila benda tidak sampai di S1 dalam batas waktu, alarm menyala dan konveyor berhenti.',
    29: 'Jawaban bebas berdasarkan data uji, misalnya: menggeser posisi sensor S2 menurunkan salah sortir dari 3 menjadi 0 dari 20 benda.',
    30: 'Misalnya 192.168.250.100, subnet mask 255.255.255.0: satu jaringan dengan PLC (192.168.250.x), bukan .0 atau .255, dan belum dipakai perangkat lain.',
    31: 'Heartbeat adalah bit yang terus berganti. Selama berubah, komunikasi dan PLC pengirim terbukti hidup. Bila berhenti berubah lebih dari batas waktu (mis. 3 s), stasiun penerima menganggap komunikasi putus.',
    32: 'Stasiun berhenti terkendali di posisi aman, menyalakan alarm, tidak menjalankan langkah yang butuh data dari stasiun lain, dan tidak restart sendiri setelah komunikasi pulih.'
  };
  function renderMeetBoxes() {
    const { per, min } = jpCfg(), total = per * min, ex = store.get('exit', {});
    MEET.forEach(m => {
      const host = $(`#p${m.no} .meet-box`);
      if (!host) return;
      host.innerHTML = `<div class="exit-card"><div class="exit-h"><span class="tag mask">Tiket keluar P${m.no}</span><label class="small chk"><input type="checkbox" data-meetchk="${m.no}"${store.get('meet' + m.no, false) ? ' checked' : ''}> pertemuan selesai</label></div>
        <p><b>${esc(m.exit)}</b></p><textarea rows="3" data-exit="${m.no}" placeholder="Tulis jawabanmu di sini (tersimpan di HP ini)">${esc(ex[m.no] || '')}</textarea>
        <details class="reveal"><summary>Contoh jawaban</summary><div><p>${esc(EXIT_KEY[m.no] || '')}</p></div></details></div>
        <details class="reveal guru-flow"><summary>Alur pertemuan ${m.no} untuk guru (${total} menit)</summary><div>${meetDetail(m, total)}</div></details>`;
    });
  }
  function syncMeetChecks() { $$('[data-meetchk]').forEach(cb => { cb.checked = store.get('meet' + cb.dataset.meetchk, false); }); }
  // Nilai ditangkap seketika; hanya penulisan ke penyimpanan yang ditunda (agar isian lain tidak membatalkannya).
  const exitCache = store.get('exit', {}), saveExit = debounce(() => store.set('exit', exitCache), 300);
  document.addEventListener('input', e => {
    const t = e.target; if (!t.dataset || !t.dataset.exit) return;
    exitCache[t.dataset.exit] = t.value; saveExit();
  });
  document.addEventListener('change', e => {
    const t = e.target; if (!t.dataset || !t.dataset.meetchk) return;
    store.set('meet' + t.dataset.meetchk, t.checked); updateProgress(); renderMeetings();
  });
  function renderModHeads() {
    MODS.forEach(m => {
      const h = $(`[data-modhead="${m.no}"]`);
      if (h) h.innerHTML = `<div class="mod-card"><div class="stat-grid"><div><span>TP / ATP</span><b>${esc(m.kode)}</b></div><div><span>Alokasi</span><b>${m.pertemuan.length} pertemuan · P${m.ptm[0]}-${m.ptm[1]}</b></div><div><span>Semester</span><b>${esc(m.semester)}</b></div></div>
        <p><b>Tujuan pembelajaran:</b> ${esc(m.tujuan)}</p><p class="small"><b>Pemahaman bermakna:</b> ${esc(m.bermakna)}</p>
        <div class="pemantik">${m.pemantik.map(q => `<span>${esc(q)}</span>`).join('')}</div><p class="small muted"><b>Produk:</b> ${esc(m.produk)}</p></div>`;
      const f = $(`[data-modfoot="${m.no}"]`);
      if (f) f.innerHTML = `<details class="reveal"><summary>Asesmen, KKTP, remedial, dan pengayaan Modul ${m.no}</summary><div>
        <div class="tbl-wrap"><table class="tbl small"><thead><tr><th>Tahap</th><th>Teknik / instrumen</th><th>Bukti dan keputusan</th></tr></thead><tbody>${m.asesmen.map(r => `<tr><td><b>${esc(r[0])}</b></td><td>${esc(r[1])}</td><td>${esc(r[2])}</td></tr>`).join('')}</tbody></table></div>
        <div class="tbl-wrap"><table class="tbl small"><thead><tr><th>Kriteria esensial</th><th>Bukti yang diperiksa</th></tr></thead><tbody>${m.kktp.map(r => `<tr><td><b>${esc(r[0])}</b></td><td>${esc(r[1])}</td></tr>`).join('')}</tbody></table></div>
        <p class="small">Tercapai bila kriteria esensial terpenuhi dan nilai operasional minimal 75. Jika fungsi inti, K3, atau bukti uji belum tampak, keputusan ditunda sampai perbaikan dikumpulkan.</p>
        <p><b>Remedial:</b> ${esc(m.remedial)}</p><p><b>Pengayaan:</b> ${esc(m.pengayaan)}</p><p class="small muted"><b>Sumber:</b> ${esc(m.sumber)}</p></div></details>`;
    });
  }

  /* ============================== Identitas, K3, guru ============================== */
  function fillStatic() {
    const t = (sel, html) => { const el = $(sel); if (el) el.innerHTML = html; };
    t('#id-tbl', `<tbody>${Object.entries(D.identitas).filter(([k]) => k !== 'NIP').map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}<tr><th>Alokasi</th><td>${esc(D.pengesahan['Asumsi alokasi'])}</td></tr><tr><th>Platform</th><td>${esc(D.pengesahan.Platform)}</td></tr><tr><th>Lingkup</th><td>${esc(D.pengesahan.Lingkup)}</td></tr></tbody>`);
    t('#cp-text', esc(D.cp));
    t('#tp-tbl', `<thead><tr><th>Kode</th><th>Tujuan pembelajaran</th><th>Ptm</th><th>JP</th><th>Bukti utama</th></tr></thead><tbody>${D.atpOp.map((r, i) => `<tr><td><a href="#m${i + 1}"><b>${esc(r[0])}</b></a></td><td><b>${esc(r[1])}.</b> ${esc(r[2])}</td><td class="tnum">${r[3]}</td><td class="tnum">${r[4]}</td><td class="small">${esc(r[5])}</td></tr>`).join('')}</tbody>`);
    t('#alur-list', D.alur.map((a, i) => `<li><a href="#m${i + 1}">Modul ${i + 1}</a>: ${esc(a)}</li>`).join(''));
    t('#karakter-tbl', `<tbody>${Object.entries(D.karakter).map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}${Object.entries(D.profil).map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</tbody>`);
    t('#kerangka-tbl', `<thead><tr><th>Komponen</th><th>Isi</th><th>Penerapan</th></tr></thead><tbody>${D.kerangka.map(r => `<tr><td><b>${esc(r[0])}</b></td><td>${esc(r[1])}</td><td>${esc(r[2])}</td></tr>`).join('')}</tbody>`);
    t('#k3-list', D.k3.map((k, i) => { const j = k.indexOf(':'); const a = j > 0 && j < 40 ? k.slice(0, j) : ''; return `<li><label><input type="checkbox" data-save="k3-${i}"><span>${a ? `<b>${esc(a)}:</b>${esc(k.slice(j + 1))}` : esc(k)}</span></label></li>`; }).join(''));
    t('#projek-tbl', `<thead><tr><th>Tahap</th><th>Modul</th><th>Milestone</th><th>Bukti</th></tr></thead><tbody>${D.projek.map(r => `<tr><td><b>${esc(r[0])}</b></td><td>${esc(r[1])}</td><td>${esc(r[2])}</td><td>${esc(r[3])}</td></tr>`).join('')}</tbody>`);
    t('#projek-intro', esc(D.projekIntro));
    // Guru
    t('#g-prota', `<thead><tr><th>Semester</th><th>TP / modul</th><th>Ptm</th><th>JP</th><th>Produk utama</th></tr></thead><tbody>${D.prota.map(r => `<tr>${r.map((c, i) => `<td${i === 4 ? ' class="small"' : ''}>${esc(c)}</td>`).join('')}</tr>`).join('')}<tr><td colspan="3"><b>Jumlah</b></td><td><b>96</b></td><td></td></tr></tbody>`);
    t('#g-promes', `<thead><tr><th>Mgg / Ptm</th><th>TP</th><th>Subbab pertemuan</th><th>Alokasi / bukti</th></tr></thead><tbody>${D.promes.map((r, i) => `${i === 0 ? '<tr><th colspan="4">Semester ganjil</th></tr>' : i === 16 ? '<tr><th colspan="4">Semester genap</th></tr>' : ''}<tr><td class="tnum">${esc(r[0])}</td><td>${esc(r[1])}</td><td><a href="#p${i + 1}">${esc(r[2])}</a></td><td class="small">${esc(r[3])}</td></tr>`).join('')}</tbody>`);
    t('#g-kalender', `<tbody>${Object.entries(D.kalender).map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</tbody>`);
    t('#g-dasar', D.dasar.map(x => `<li>${esc(x)}</li>`).join(''));
    t('#g-arsitektur', D.arsitektur.map(x => `<li>${esc(x)}</li>`).join(''));
    t('#g-kktp', `<thead><tr><th>TP</th><th>Ambang</th><th>Kriteria esensial</th></tr></thead><tbody>${D.kktp.map(r => `<tr><td><b>${esc(r[0])}</b> ${esc(r[1])}</td><td class="tnum">${r[2]}</td><td class="small">${esc(r[4])}</td></tr>`).join('')}</tbody>`);
    t('#g-kktp-note', esc(D.kktpKeputusan));
    t('#g-tingkat', `<thead><tr><th>Tingkat</th><th>Rentang</th><th>Deskripsi</th></tr></thead><tbody>${D.tingkat.map(r => `<tr><td><b>${esc(r[0])}</b></td><td class="tnum">${esc(r[1])}</td><td>${esc(r[2])}</td></tr>`).join('')}</tbody>`);
    t('#g-bobot', `<thead><tr><th>Komponen</th><th>Bobot</th><th>Contoh bukti</th></tr></thead><tbody>${D.bobot.map(r => `<tr><td><b>${esc(r[0])}</b></td><td>${esc(r[1])}</td><td class="small">${esc(r[2])}</td></tr>`).join('')}</tbody>`);
    t('#g-remedial', `<tbody>${Object.entries(D.remedial).map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</tbody>`);
    t('#g-diag', D.diagnostik.map(x => `<li>${esc(x)}</li>`).join(''));
    t('#g-diag-tindak', `<tbody>${D.diagnostikTindak.map(r => `<tr><th>${esc(r[0])}</th><td>${esc(r[1])}</td></tr>`).join('')}</tbody>`);
    t('#g-tutup', D.checklistAkhir.map((x, i) => `<li><label><input type="checkbox" data-save="tutup-${i}"><span>${esc(x)}</span></label></li>`).join(''));
    t('#g-rujukan', D.rujukan.map(x => `<li>${esc(x)}</li>`).join(''));
    t('#g-refleksi', `<p><b>Refleksi murid:</b> ${esc(D.refleksiMurid)}</p><p><b>Refleksi guru:</b> ${esc(D.refleksiGuru)}</p>`);
    const sel = $('#rpm-sel');
    if (sel) {
      sel.innerHTML = MODS.map(m => `<option value="${m.no}">Modul ${m.no} · ${esc(m.kode)} · ${esc(m.fokus)}</option>`).join('');
      const draw = () => {
        const m = MODS[+sel.value - 1];
        const kv = rows => `<div class="tbl-wrap"><table class="tbl kv small"><tbody>${rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</tbody></table></div>`;
        $('#rpm-out').innerHTML = `<h3>Modul ${m.no} · ${esc(m.judul)}</h3>${kv([['ATP / Fokus', m.kode + ' / ' + m.fokus], ['Semester', m.semester], ['Alokasi', m.alokasi], ['Produk autentik', m.produk]])}
          <h4>A. Identifikasi</h4>${kv([['Identifikasi murid', m.murid], ['Materi pelajaran', m.materi], ['Dimensi profil lulusan', m.profil], ['Lintas disiplin', m.lintas]])}
          <h4>B. Desain pembelajaran</h4>${kv([['Tujuan pembelajaran', m.tujuan], ['Topik', m.topik], ['Pemahaman bermakna', m.bermakna], ['Pertanyaan pemantik', m.pemantik.join(' | ')], ['Praktik pedagogis', m.pedagogi], ['Kemitraan', m.kemitraan], ['Lingkungan belajar', m.lingkungan], ['Pemanfaatan digital', m.digital], ['Diferensiasi', m.diferensiasi]])}
          <h4>C. Pengalaman belajar</h4>${m.pertemuan.map(p => `<details class="reveal"><summary>Pertemuan ${p.no}: ${esc(p.judul)}</summary><div>${meetDetail(p, 135)}</div></details>`).join('')}
          <p class="small muted">Asesmen, KKTP, remedial, dan pengayaan modul ini ada di akhir halaman <a href="#m${m.no}">Modul ${m.no}</a>.</p>`;
      };
      sel.addEventListener('change', draw); draw();
    }
  }

  /* ============================== Tabel isian (log kerja, jurnal guru, rekap) ============================== */
  function tableEditor(box, key, cols, opt) {
    opt = opt || {};
    let rows = store.get(key, []);
    const read = () => rows;
    const persist = debounce(() => store.set(key, rows), 250);
    const draw = () => {
      rows = store.get(key, []);
      box.innerHTML = `<div class="tbl-wrap"><table class="tbl small edit-tbl"><thead><tr><th>No</th>${cols.map(c => `<th>${esc(c)}</th>`).join('')}<th></th></tr></thead><tbody>${rows.map((r, i) => `<tr><td class="tnum">${i + 1}</td>${cols.map((c, k) => `<td><textarea rows="1" data-r="${i}" data-c="${k}" aria-label="${esc(c)} baris ${i + 1}">${esc((r.c || [])[k] || '')}</textarea></td>`).join('')}<td><button type="button" class="icon-btn small-x" data-del="${i}" aria-label="Hapus baris ${i + 1}">${icon('x')}</button></td></tr>`).join('') || `<tr><td colspan="${cols.length + 2}" class="muted">Belum ada baris. Tekan "Tambah baris".</td></tr>`}</tbody></table></div>
        <div class="btn-row"><button type="button" class="btn btn-ghost small" data-add>${icon('plus')}Tambah baris</button><button type="button" class="btn btn-ghost small" data-csv>${icon('down')}Unduh CSV</button></div>`;
    };
    box.addEventListener('input', e => { const t = e.target; if (t.dataset.r === undefined) return; const r = rows[+t.dataset.r]; r.c = r.c || []; r.c[+t.dataset.c] = t.value; persist(); });
    box.addEventListener('click', e => {
      if (e.target.closest('[data-add]')) { rows.push({ c: cols.map(() => '') }); store.set(key, rows); draw(); }
      const d = e.target.closest('[data-del]'); if (d) { rows.splice(+d.dataset.del, 1); store.set(key, rows); draw(); }
      if (e.target.closest('[data-csv]')) saveFile(`${opt.file || key.replace(/\W+/g, '-')}.csv`, csv([['No', ...cols]].concat(read().map((r, i) => [i + 1, ...(r.c || [])]))), 'text/csv');
    });
    draw();
    return { draw };
  }
  function kvForm(box, key, fields) {
    const v = store.get(key, {}), persist = debounce(() => store.set(key, v), 250);
    box.innerHTML = fields.map((f, i) => `<label class="field">${esc(f)}<textarea rows="2" data-k="${i}">${esc(v[i] || '')}</textarea></label>`).join('');
    box.addEventListener('input', e => { const t = e.target; if (t.dataset.k === undefined) return; v[t.dataset.k] = t.value; persist(); });
  }
  const LOGS = [['io', 'I/O List dan Wiring Check', 'Pertemuan 8-10, 18, 26'], ['com', 'Lembar Commissioning dan I/O Check', 'Pertemuan 9-10'], ['test', 'Test Log Program PLC', 'Modul 4-7'], ['trb', 'Troubleshooting Log', 'Pertemuan 5, 16, 22'], ['net', 'Communication Log', 'Modul 8']];
  const LOGEDS = {};
  function renderLogs() {
    LOGS.forEach(([k]) => { const box = $(`#log-${k}`); if (box && !box._m) { box._m = true; LOGEDS[k] = tableEditor(box, 'log:' + k, D.format[k].filter(c => c !== 'No'), { file: 'log-' + k }); } });
    const b = $('#log-brief'); if (b && !b._m) { b._m = true; kvForm(b, 'brief', D.format.brief); }
    const k2 = $('#log-konf'); if (k2 && !k2._m) { k2._m = true; kvForm(k2, 'konf', D.format.konferensi); }
    const r = $('#log-refl'); if (r && !r._m) { r._m = true; kvForm(r, 'refl', D.refleksiAkhir); }
  }
  onShow.log = () => { renderLogs(); Object.values(LOGEDS).forEach(x => x.draw()); };
  onShow.guru = () => {
    const j = $('#g-jurnal'); if (j && !j._m) { j._m = true; tableEditor(j, 'guru:jurnal', D.format.jurnal.filter(c => c !== 'No'), { file: 'jurnal-guru' }); }
    const r = $('#g-rekap'); if (r && !r._m) { r._m = true; tableEditor(r, 'guru:rekap', D.format.rekap.filter(c => c !== 'No'), { file: 'rekap-kemajuan' }); }
  };

  /* ============================== LKPD digital ============================== */
  const LK_LAB = { 1: ['#m1', 'Lab gangguan', '#gangguan'], 2: ['#m2', 'Lab PLC', '#lab'], 3: ['#m3', 'Lab commissioning', '#commissioning'], 4: ['#m4', 'Lab PLC', '#lab'], 5: ['#m5', 'Diagram langkah', '#langkah'], 6: ['#m6', 'Lab HMI', '#hmi'], 7: ['#m7', 'Lab PLC (stasiun sortir)', '#lab'], 8: ['#m8', 'Lab jaringan', '#jaringan'] };
  function lkpdState(n) { return store.get('lkpd:' + n, { steps: {}, rows: [[], [], [], [], []], dis: {}, self: {}, selfB: {}, refl: {}, rub: {} }); }
  function lkpdProgress(n) {
    const s = lkpdState(n), L = D.lkpd[n - 1];
    const parts = [Object.values(s.steps).filter(Boolean).length / L.langkah.length, (s.rows || []).filter(r => r && r.some(Boolean)).length >= 3 ? 1 : (s.rows || []).filter(r => r && r.some(Boolean)).length / 3, Object.values(s.dis).filter(x => x && x.trim()).length / L.diskusi.length, Object.keys(s.self).length / D.lkRefleksi.length];
    return Math.round(parts.reduce((a, b) => a + b, 0) / parts.length * 100);
  }
  function rubScore(s) { const v = Object.values(s.rub || {}); return v.length === 4 ? Math.round(v.reduce((a, b) => a + b, 0) / 16 * 100) : null; }
  function renderLKPD() {
    const box = $('#lkpd-list');
    box.innerHTML = D.lkpd.map(L => `<details class="lkpd" data-lk="${L.no}"><summary><span class="rbar b${L.no}"></span>LKPD ${L.no} · ${esc(L.judul)}<span class="tag" data-prog="${L.no}">${lkpdProgress(L.no)}%</span></summary><div class="lkpd-body" data-body="${L.no}"></div></details>`).join('');
    box.addEventListener('toggle', e => { const d = e.target; if (d.open && !d._m) { d._m = true; drawLK(+d.dataset.lk); } }, true);
  }
  function drawLK(n) {
    const L = D.lkpd[n - 1], s = lkpdState(n), b = $(`[data-body="${n}"]`), lab = LK_LAB[n];
    const RUBL = D.lkRubrik[0].slice(1);
    b.innerHTML = `<div class="tbl-wrap"><table class="tbl kv small"><tbody><tr><th>Tujuan pembelajaran</th><td>${esc(L.tp)}</td></tr><tr><th>Tujuan LKPD</th><td>${esc(L.tujuan)}</td></tr><tr><th>Bukti dikumpulkan</th><td>${esc(L.bukti)}</td></tr></tbody></table></div>
      <p class="small">Materi: <a href="${lab[0]}">Modul ${n}</a> · Alat bantu di web: <a href="${lab[2]}">${esc(lab[1])}</a></p>
      <h4>A. Alat, bahan, dan keselamatan/etika</h4><p class="small"><b>Alat dan bahan:</b> ${esc(L.alat)}</p><div class="callout warn"><p class="small"><b>Keselamatan dan etika:</b> ${esc(L.k3)}</p></div>
      <h4>B. Langkah kerja</h4><ul class="checklist">${L.langkah.map((x, i) => `<li><label><input type="checkbox" data-st="${i}"${s.steps[i] ? ' checked' : ''}><span>${i + 1}. ${esc(x)}</span></label></li>`).join('')}</ul>
      <h4>C. Lembar bukti / hasil pengamatan</h4><div class="tbl-wrap"><table class="tbl small edit-tbl"><thead><tr><th>No</th>${L.kolom.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${(s.rows || []).map((r, i) => `<tr><td class="tnum">${i + 1}</td>${L.kolom.map((c, k) => `<td><textarea rows="1" data-row="${i}" data-col="${k}" aria-label="${esc(c)} baris ${i + 1}">${esc((r || [])[k] || '')}</textarea></td>`).join('')}</tr>`).join('')}</tbody></table></div>
      <div class="btn-row"><button type="button" class="btn btn-ghost small" data-addrow>${icon('plus')}Tambah baris</button></div>
      <h4>D. Pertanyaan diskusi</h4>${L.diskusi.map((q, i) => `<label class="field">${i + 1}. ${esc(q)}<textarea rows="3" data-dis="${i}">${esc(s.dis[i] || '')}</textarea></label>`).join('')}
      <h4>E. Refleksi dan penilaian diri</h4><div class="tbl-wrap"><table class="tbl small"><thead><tr><th>Pernyataan</th><th>Ya / belum</th><th>Bukti / rencana perbaikan</th></tr></thead><tbody>${D.lkRefleksi.map((q, i) => `<tr><td>${esc(q)}</td><td><div class="seg tiny-seg"><button type="button" data-self="${i}" data-v="1" class="${s.self[i] === 1 ? 'on' : ''}">Ya</button><button type="button" data-self="${i}" data-v="0" class="${s.self[i] === 0 ? 'on' : ''}">Belum</button></div></td><td><textarea rows="1" data-selfb="${i}" aria-label="Bukti">${esc(s.selfB[i] || '')}</textarea></td></tr>`).join('')}</tbody></table></div>
      ${['Hal yang paling saya pahami', 'Kesulitan dan strategi saya', 'Perbaikan berikutnya'].map((q, i) => `<label class="field">${q}<textarea rows="2" data-refl="${i}">${esc(s.refl[i] || '')}</textarea></label>`).join('')}
      <h4>F. Rubrik unjuk kerja (diisi guru atau teman)</h4><div class="stack">${D.lkRubrik.slice(1).map((r, i) => `<fieldset class="rubric-row" style="border:0;margin:0;padding:0"><legend class="head"><b>${esc(r[0])}</b></legend><div class="rubric-opts">${r.slice(1).map((dsc, k) => `<label><input type="radio" name="lkr${n}-${i}" data-rub="${i}" value="${4 - k}"${s.rub[i] === 4 - k ? ' checked' : ''}><b>${esc(RUBL[k])}</b>${esc(dsc)}</label>`).join('')}</div></fieldset>`).join('')}</div>
      <div class="rubric-total"><span class="small muted">Nilai = skor / 16 × 100</span><b class="tnum" data-score>${rubScore(s) === null ? '–' : rubScore(s)}</b><span class="small muted">${rubScore(s) !== null ? (rubScore(s) >= 75 ? 'KKTP tercapai' : 'perlu tindak lanjut') : ''}</span></div>`;
    const save = () => { store.set('lkpd:' + n, s); $(`[data-prog="${n}"]`).textContent = lkpdProgress(n) + '%'; };
    b.addEventListener('change', e => {
      const t = e.target;
      if (t.dataset.st !== undefined) { s.steps[t.dataset.st] = t.checked; save(); }
      if (t.dataset.rub !== undefined) { s.rub[t.dataset.rub] = +t.value; save(); const sc = rubScore(s); $('[data-score]', b).textContent = sc === null ? '–' : sc; $('[data-score]', b).nextElementSibling.textContent = sc !== null ? (sc >= 75 ? 'KKTP tercapai' : 'perlu tindak lanjut') : ''; }
    });
    const saveLater = debounce(save, 250);
    b.addEventListener('input', e => {
      const t = e.target;
      if (t.dataset.row !== undefined) { s.rows[+t.dataset.row] = s.rows[+t.dataset.row] || []; s.rows[+t.dataset.row][+t.dataset.col] = t.value; }
      else if (t.dataset.dis !== undefined) s.dis[t.dataset.dis] = t.value;
      else if (t.dataset.selfb !== undefined) s.selfB[t.dataset.selfb] = t.value;
      else if (t.dataset.refl !== undefined) s.refl[t.dataset.refl] = t.value;
      else return;
      saveLater();
    });
    b.addEventListener('click', e => {
      const x = e.target.closest('[data-self]'); if (x) { s.self[x.dataset.self] = +x.dataset.v; save(); $$(`[data-self="${x.dataset.self}"]`, b).forEach(y => y.classList.toggle('on', y === x)); }
      if (e.target.closest('[data-addrow]')) { s.rows.push([]); save(); drawLK(n); }
    });
  }

  /* ============================== Kuis ============================== */
  const QEX = ['Kontak NC (normally closed) tertutup saat tombol tidak ditekan; NO justru terbuka.', 'Kontak bantu K1 13-14 yang diparalel dengan START menahan arus kumparan setelah START dilepas: inilah pengunci (self-holding).', 'TOR memanas saat arus melebihi setelan, lalu membuka kontak 95-96 sehingga kumparan kontaktor terputus.', 'Interlock mencegah K1 dan K2 menutup bersamaan, karena itu berarti dua fasa terhubung langsung (hubung singkat).', 'Hubungan bintang menurunkan arus start menjadi sekitar sepertiga DOL. Torsi start juga turun menjadi sepertiga, jadi A salah.',
    'Satu siklus scan: baca input, eksekusi program dari atas ke bawah, perbarui output, lalu layanan komunikasi.', 'Pada CP1E, input mulai CIO 0.00 dan output mulai CIO 100.00.', 'Area H (holding) mempertahankan isinya saat daya padam; W hilang.', 'Ladder Diagram (LD) memakai simbol kontak dan koil seperti rangkaian relay.', 'Input STOP ON saat normal. Kabel putus membuat input OFF sehingga mesin berhenti: fail-safe.',
    'Sensor PNP mengeluarkan +24 V, jadi COM input harus 0 V agar ada beda tegangan.', 'Power-off check dilakukan sebelum daya diberikan: inspeksi, kontinuitas, polaritas.', 'I/O check membuktikan setiap titik terhubung ke alamat yang benar.', 'Ferrule merapikan ujung kabel serabut agar terjepit kuat dan tidak ada serat yang lepas.', 'Forcing yang tertinggal bisa menjalankan output tanpa kendali program, jadi wajib dibatalkan dan dicatat.',
    'Pada koil ganda, rung yang dieksekusi terakhir menentukan status output.', 'DIFU(013) ON selama satu scan saat kondisinya berubah dari OFF ke ON.', 'TIM bersatuan 0,1 s: #50 = 50 × 0,1 s = 5,0 s.', 'CNT punya masukan hitung (tepi naik mengurangi PV) dan masukan reset.', 'Kontak kontaktor bisa lengket atau program bisa gagal; interlock hardware tetap memutus jalur kumparan lawan.',
    'FRL = filter, regulator, lubricator: menyaring, mengatur tekanan, dan melumasi udara.', 'Katup solenoid tunggal berpegas kembali ke posisi pegas saat solenoid kehilangan daya.', 'Sensor reed mendeteksi magnet pada piston, sehingga menunjukkan posisi silinder.', 'F = p × A = 5.000.000 Pa × 0,001 m² = 5.000 N.', 'Relief valve membuka saat tekanan mencapai setelan, sehingga tekanan sistem tidak melebihi batas.',
    'HMI adalah sarana operator untuk mengoperasikan dan memantau mesin. PLC tetap yang mengendalikan.', 'Momentary bernilai ON hanya selama ditekan, seperti tombol tekan fisik.', 'Batas input mencegah operator memasukkan setpoint di luar rentang aman.', 'Fungsi keselamatan tidak boleh bergantung pada HMI atau komunikasi yang bisa gagal.', 'Pesan alarm yang baik menyebut apa yang terjadi, di mana, dan tindakan yang harus dilakukan.',
    'Sensor induktif hanya bereaksi terhadap logam.', 'Transisi adalah syarat perpindahan dari satu langkah ke langkah berikutnya.', 'STOP siklus menunggu siklus selesai; E-stop menghentikan segera.', 'Watchdog timer memberi alarm bila transisi yang diharapkan tidak terjadi dalam batas waktu.', 'Setelah E-stop dilepas, mesin tidak boleh bergerak sendiri: perlu RESET dan homing sebelum START.',
    'RS-485 multidrop: beberapa perangkat pada satu pasang kabel.', 'Satu jaringan /24 dengan 192.168.250.1 berarti 192.168.250.x. Pilihan B sama dengan alamat PLC (ganda).', 'Serial PLC Link CP1E memakai CIO 200-289.', 'Heartbeat berubah terus; bila berhenti berubah, komunikasi dianggap putus.', 'Jaringan OT lab diisolasi dan setiap perubahan konfigurasi dicatat.'];
  (function quiz() {
    const box = $('#quiz'), Q = D.soal;
    let ans = store.get('quiz', {}), filter = 'all';
    $('#quiz-filter').innerHTML = '<button type="button" class="on" data-f="all">Semua</button>' + MODS.map(m => `<button type="button" data-f="${m.no}">M${m.no}</button>`).join('');
    const draw = () => {
      box.innerHTML = Q.map((q, i) => {
        if (filter !== 'all' && q.m !== +filter) return '';
        const chosen = ans[i], done = chosen !== undefined;
        return `<div class="q${done ? ' done' : ''}" data-q="${i}"><div class="q-head"><span class="n">${i + 1}</span><b>${esc(q.q)}</b><span class="tag">M${q.m}</span></div>
          <div class="q-opts" role="radiogroup">${q.o.map((o, k) => `<label class="${done && k === q.a ? 'right' : done && k === chosen ? 'wrong' : ''}"><input type="radio" name="q${i}" value="${k}"${chosen === k ? ' checked' : ''}${done ? ' disabled' : ''}><span>${String.fromCharCode(65 + k)}. ${esc(o)}</span></label>`).join('')}</div>
          ${done ? `<p class="q-expl">${chosen === q.a ? '<b>Benar.</b> ' : '<b>Kurang tepat.</b> '}${esc(QEX[i])}</p>` : ''}</div>`;
      }).join('');
      const n = Object.keys(ans).length, right = Object.entries(ans).filter(([i, k]) => Q[i] && Q[i].a === k).length;
      $('#quiz-num').textContent = `${right}/${Q.length}`;
      $('#quiz-msg').textContent = n === 0 ? 'Belum ada jawaban.' : n < Q.length ? `${n} dari ${Q.length} soal dijawab.` : right >= 34 ? 'Selesai. Hebat!' : right >= 30 ? 'Selesai, sudah mencapai 75%.' : 'Selesai. Baca lagi modul yang masih salah lalu ulangi.';
    };
    $('#quiz-filter').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; $$('#quiz-filter button').forEach(x => x.classList.toggle('on', x === b)); filter = b.dataset.f; draw(); });
    box.addEventListener('change', e => { const inp = e.target.closest('input[type=radio]'); if (!inp) return; ans[+inp.closest('.q').dataset.q] = +inp.value; store.set('quiz', ans); const y = window.scrollY; draw(); window.scrollTo(0, y); });
    $('#quiz-reset').addEventListener('click', () => { ans = {}; store.set('quiz', ans); draw(); });
    draw();
  })();
  // Uraian: soal dari dokumen + pokok jawaban (butir 10 kunci asli; lainnya pokok jawaban pengembang).
  const UR_KEY = ['Daya: MCB 3 fasa → K1 1-2/3-4/5-6 → TOR → motor. Kontrol: sekering → TOR 95-96 → STOP (NC) → START (NO) paralel K1 13-14 → kumparan A1-A2. Fungsi: proteksi hubung singkat (MCB/sekering), beban lebih (TOR), berhenti fail-safe (STOP NC), pengunci (K1 13-14).',
    'Interlock ganda = kontak bantu NC kontaktor lawan + kontak NC tombol lawan. Test log memuat: kanan, STOP, kiri, upaya pembalikan langsung, dua tombol bersamaan, TOR trip. Gangguan ditulis dengan gejala, bukti ukur, perbaikan, dan uji ulang.',
    'Input dibaca sekali di awal scan. Pulsa yang lebih pendek dari waktu scan bisa jatuh di antara dua pembacaan dan terlewat. Solusi: input interrupt, high-speed counter, pulse catch, atau memperpanjang sinyal di sisi sensor.',
    'Lihat Gambar 4.2: rung K1 dengan pengunci, TIM 000 #50 untuk waktu bintang, K2 = K1 · NOT T000 · NOT K3, TIM 001 #3 jeda, K3 = K1 · T001 · NOT K2. Tabel simbol START 0.00, STOP 0.01, TOR 0.02, K1-K3 100.00-100.02.',
    'Contoh: 0.00 START (NO), 0.01 STOP (NC), 0.05 sensor PNP; 100.00 K1, 100.03 H1, 100.04 H2. Karena sensor PNP mengeluarkan +24 V, COM input dihubungkan ke 0 V; tombol juga disuplai dari +24 V.',
    'I/O check: tiap input ditekan dan diamati LED/bit-nya, tiap output di-force satu per satu, dibandingkan dengan I/O list. Uji fungsi: program dijalankan dan urutan kerja diuji. I/O check membuktikan wiring, uji fungsi membuktikan program.',
    'Lihat contoh program konveyor CNT 000 #10. Kasus normal: 10 produk → berhenti, H3 ON. Batas: produk ke-9 dan ke-10, RESET saat batch belum selesai. Gagal: sensor bouncing, TOR trip, START saat batch selesai.',
    'Hipotesis: interlock program terlalu ketat (kontak output lawan belum OFF), jeda pembalikan, kontak bantu interlock hardware rusak/terbuka, atau tombol REV tidak masuk. Uji: monitor bit 0.04, 100.00, 100.01; ukur kontak bantu NC saat power-off; perbaiki satu penyebab lalu uji ulang.',
    'Diagram langkah seperti Gambar 5.1. Transisi: START·1B1·2B1 → A+; 1B2 → B+; 2B2 → B-; 2B1 → A-; 1B1 → selesai.',
    D.kunciUraian10,
    'Layar utama: START/STOP momentary (W10.00/W10.01), lampu status (100.00, W20.00, W20.01), tampilan PV T000 dan C000, setpoint D100 BCD batas 1,0-9,9 s, navigasi ke Setting (bersandi) dan Alarm. Lampirkan daftar tag lengkap.',
    'PLC, HMI, dan komunikasi bisa gagal. E-stop hard-wired: kontak NC E-stop memutus COM keluaran/daya aktuator, dan kontak bantunya dibaca PLC sebagai status (0.03). Contoh pada Gambar 3.1.',
    'Deskripsi: benda masuk, berhenti di S1, S2 menentukan logam/nonlogam, A atau B mendorong, hitung. GRAFCET seperti Gambar 7.1. Kondisi tidak normal: benda macet (watchdog), sensor gagal, E-stop, STOP siklus.',
    'Mode MANUAL (jog dengan interlock), AUTO (GRAFCET), STOP siklus (berhenti di akhir siklus), E-stop (reset semua langkah, daya aktuator putus), RESET + homing (kembali ke posisi awal tanpa menjalankan siklus). Test log menguji setiap transisi mode.',
    'Konfigurasi polling unit dan polled unit (atau dua node Ethernet), peta data CIO 200-209/210-219, heartbeat dengan P_1s dan watchdog 3 s. Communication log memuat data, arah, harapan, hasil monitoring.',
    'Fisik: kabel, terminator, LED komunikasi. Konfigurasi: mode link, nomor unit, baud rate, alamat. Program: alamat data, handshake, heartbeat. Mulai dari lapis fisik, ubah satu hal setiap kali, catat di communication log.'];
  (function uraian() {
    $('#uraian').innerHTML = D.uraian.map((u, i) => `<details class="reveal"><summary>${i + 1}. ${esc(u)} <span class="tag">M${Math.floor(i / 2) + 1}</span></summary><div><p>${esc(UR_KEY[i] || '')}</p>${i === 9 ? '<p class="small muted">Kunci dari dokumen perangkat ajar.</p>' : '<p class="small muted">Pokok jawaban dari pengembang web; nilai dengan pedoman skor.</p>'}</div></details>`).join('');
    $('#uraian-skor').innerHTML = `<thead><tr><th>Skor</th><th>Deskripsi</th></tr></thead><tbody>${D.skorUraian.map(r => `<tr><td class="tnum"><b>${r[0]}</b></td><td>${esc(r[1])}</td></tr>`).join('')}</tbody>`;
  })();
  const CASES = [
    { m: 1, t: 'Motor tidak mau start, lampu sumber menyala', d: 'Rangkaian DOL di trainer. START ditekan, K1 diam. Tidak ada bau terbakar.', o: [['Matikan daya, kunci (LOTO), lalu uji kontinuitas jalur kontrol bertahap dari TOR ke kumparan (half-split).', 1, 'Tepat. Mulai dari kondisi aman dan bukti ukur. Half-split mempercepat menemukan titik terbuka.'], ['Ganti kontaktor K1 dengan yang baru.', 0, 'Mengganti komponen tanpa bukti membuang waktu dan belum tentu menyelesaikan masalah.'], ['Jembatani TOR sementara agar motor bisa jalan.', 0, 'Mem-bypass pengaman dilarang. Bila TOR trip, ada penyebab beban lebih.'], ['Ukur tegangan 380 V di terminal motor tanpa pengawasan.', 0, 'Pengukuran bertegangan hanya dengan probe aman dan pengawasan guru, setelah uji kontinuitas.']] },
    { m: 2, t: 'Benar di simulator, tetapi motor tidak start di trainer', d: 'Ladder DOL memakai AND NOT 0.01 untuk STOP. Di simulator CX-Programmer berhasil karena input dibiarkan OFF.', o: [['Lihat LED input 0.01 saat STOP tidak ditekan, lalu ganti kontaknya menjadi kontak NO (AND 0.01).', 1, 'Tepat. Tombol STOP berkontak NC di lapangan membuat input ON saat normal. Kontak NC di ladder terbuka, jadi rung tidak pernah tertutup.'], ['Ganti tombol STOP fisik dengan tombol NO.', 0, 'Itu membuat rangkaian tidak fail-safe: kabel putus tidak lagi menghentikan mesin.'], ['Tambahkan SET 100.00 di rung baru.', 0, 'Menambah latch tidak memperbaiki logika STOP yang terbalik, dan berbahaya.'], ['Unduh ulang program.', 0, 'Programnya sendiri yang salah, bukan proses unduh.']] },
    { m: 3, t: 'LED sensor menyala, LED input PLC tidak', d: 'Sensor proximity PNP baru dipasang ke 0.05. LED di badan sensor menyala saat ada benda, tetapi LED input 0.05 tetap padam.', o: [['Periksa ke mana COM input dihubungkan: untuk sensor PNP harus ke 0 V.', 1, 'Tepat. Bila COM ke +24 V, keluaran PNP (+24 V) dan COM sama-sama +24 V sehingga tidak ada arus.'], ['Ganti sensor dengan yang baru.', 0, 'Sensor bekerja (LED-nya menyala). Masalahnya di sisi rangkaian input.'], ['Ubah alamat di program menjadi 0.06.', 0, 'LED input fisik sudah padam, jadi masalahnya sebelum program.'], ['Naikkan tegangan catu menjadi 48 V.', 0, 'Melebihi rating input dan berbahaya.']] },
    { m: 4, t: 'Konveyor berhenti sebelum 10 produk', d: 'Batch selalu berhenti di sekitar 6-7 produk. Monitoring menunjukkan PV CNT kadang turun 2 untuk satu produk.', o: [['Amati sinyal sensor B1 di diagram waktu/monitoring: cari pulsa ganda (bouncing atau benda terbaca dua kali), lalu perbaiki posisi sensor atau input filter.', 1, 'Tepat. CNT sudah menghitung pada tepi naik; pulsa ganda berasal dari sinyal sensor. Bukti dulu, baru perbaikan.'], ['Ganti CNT #10 menjadi #13.', 0, 'Menutupi gejala; hitungan tetap tidak akurat.'], ['Tambahkan DIFU di depan CNT.', 0, 'CNT sudah bereaksi pada tepi naik. DIFU tidak menghapus pulsa ganda dari sensor.'], ['Ganti PLC.', 0, 'PLC menghitung tepat sesuai sinyal yang diterima.']] },
    { m: 5, t: 'Sekuens berhenti setelah A+', d: 'Pada sekuens A+ B+ B- A-, silinder A sudah maju penuh tetapi B tidak pernah bergerak. Tidak ada alarm.', o: [['Periksa LED input 1B2 (0.05) saat A di depan; sensor mungkin bergeser sehingga syarat transisi tidak terpenuhi.', 1, 'Tepat. Langkah berikutnya menunggu sensor. Bila 1B2 tidak ON, program memang (benar) berhenti menunggu.'], ['Ganti syarat transisi dengan timer 2 detik.', 0, 'Timer menghilangkan bukti gerak. Bila silinder macet, langkah tetap dilanjutkan.'], ['Naikkan tekanan menjadi 10 bar.', 0, 'A sudah sampai depan; tekanan bukan masalahnya, dan 10 bar di atas tekanan kerja trainer.'], ['Force 2Y1 secara permanen.', 0, 'Forcing permanen melewati logika program dan berbahaya.']] },
    { m: 6, t: 'Setpoint 5,0 s tetapi waktu tahan hanya 3,2 s', d: 'Operator memasukkan 5,0 pada numeric input T_HOLD_SP (D100). Program memakai TIM 000 D100.', o: [['Periksa format numeric input: harus BCD karena TIM membaca SV sebagai BCD.', 1, 'Tepat. Dengan format BIN, 50 ditulis sebagai 0032 heksa, lalu dibaca TIM sebagai BCD 32 = 3,2 s.'], ['Ganti TIM dengan TIMH.', 0, 'Satuannya berubah menjadi 0,01 s; waktu justru makin pendek.'], ['Kalikan setpoint dengan 1,5 di HMI.', 0, 'Menambal angka tanpa memperbaiki penyebab.'], ['Ganti alamat D100 menjadi H100.', 0, 'Masalahnya format data, bukan area memori.']] },
    { m: 7, t: 'Konveyor langsung jalan setelah E-stop dilepas', d: 'Saat uji penerimaan, E-stop ditekan di tengah siklus. Begitu E-stop diputar lepas, konveyor dan silinder langsung bergerak lagi.', o: [['Ubah program: E-stop me-reset semua bit langkah, dan mesin baru jalan lagi setelah RESET + homing lalu START.', 1, 'Tepat. Restart tak terduga sangat berbahaya. E-stop dilepas tidak boleh menjalankan mesin.'], ['Tambahkan lampu peringatan saja.', 0, 'Lampu tidak mencegah gerak yang membahayakan.'], ['Pindahkan E-stop ke layar HMI.', 0, 'E-stop wajib hard-wired.'], ['Catat sebagai kondisi normal di manual operasi.', 0, 'Ini cacat keselamatan dan harus diperbaiki sebelum serah terima.']] },
    { m: 8, t: 'Data stasiun A tidak sampai ke stasiun B', d: 'Alarm komunikasi menyala di kedua stasiun. Kemarin sistem berjalan normal; hari ini ada kelompok lain memakai trainer.', o: [['Periksa berlapis mulai dari fisik (kabel RS-485, terminator, LED komunikasi), lalu konfigurasi (mode, nomor unit, baud rate), lalu program, sambil mencatat di communication log.', 1, 'Tepat. Diagnosis berlapis dan tercatat mencegah perubahan acak.'], ['Ubah semua setelan PLC ke bawaan pabrik.', 0, 'Menghapus bukti dan bisa merusak konfigurasi kelompok lain.'], ['Matikan watchdog heartbeat agar alarm hilang.', 0, 'Alarm adalah fungsi keselamatan; mematikannya membuat stasiun bekerja dengan data basi.'], ['Hubungkan PLC ke Wi-Fi sekolah.', 0, 'Melanggar aturan isolasi jaringan OT.']] }
  ];
  (function cases() {
    const box = $('#case-list'), ans = store.get('cases', {});
    const draw = () => {
      box.innerHTML = CASES.map((c, i) => { const pick = ans[i]; return `<div class="q${pick !== undefined ? ' done' : ''}" data-c="${i}"><div class="q-head"><span class="n">M${c.m}</span><b>${esc(c.t)}</b></div><p class="small">${esc(c.d)}</p>
        <div class="q-opts">${c.o.map(([t, ok], k) => `<label class="${pick !== undefined && ok ? 'right' : pick === k && !ok ? 'wrong' : ''}"><input type="radio" name="c${i}" value="${k}"${pick === k ? ' checked' : ''}><span>${esc(t)}</span></label>`).join('')}</div>${pick !== undefined ? `<p class="q-expl">${esc(c.o[pick][2])}</p>` : ''}</div>`; }).join('');
    };
    box.addEventListener('change', e => { const inp = e.target.closest('input'); if (!inp) return; ans[+inp.closest('.q').dataset.c] = +inp.value; store.set('cases', ans); const y = window.scrollY; draw(); window.scrollTo(0, y); });
    draw();
  })();
  // Perbaiki program: program rusak diuji dengan skenario misi Lab PLC.
  const MI = id => STN.MISSIONS.find(m => m.id === id);
  const DEBUG = [
    { mi: 1, t: 'Motor hanya jalan selama START ditekan', h: 'Cari kontak yang seharusnya menahan K1.', text: STN.PRE.dol.replace('OR      100.00    ; pengunci K1\n', '') },
    { mi: 1, t: 'Motor tidak mau start, lampu TRIP menyala terus', h: 'Ingat: STOP dan TOR berkontak NC di lapangan. Ada dua baris yang terbalik.', text: STN.PRE.dol.replace('AND     0.01      ; STOP', 'AND NOT 0.01      ; STOP').replace('LD NOT  0.02\nOUT     100.04', 'LD      0.02\nOUT     100.04') },
    { mi: 2, t: 'START + STOP bersamaan: motor tetap jalan', h: 'Urutan SET dan RSET menentukan prioritas.', text: `LD NOT  0.01      ; STOP ditekan\nOR NOT  0.02      ; TOR trip\nRSET    100.00\nLD      0.00      ; START\nSET     100.00\nLD      100.00\nOUT     100.03\nEND(001)` },
    { mi: 3, t: 'Lampu berkedip saat tombol ditahan', h: 'Logika toggle butuh pulsa satu scan.', text: STN.PRE.toggle.replace('DIFU    W0.00     ; pulsa tepi naik', 'OUT     W0.00     ; (tanpa deteksi tepi)') },
    { mi: 4, t: 'K1 dan K2 bisa aktif bersamaan', h: 'Kedua rung kehilangan interlock tombol dan interlock output.', text: STN.PRE.rev.replace('AND NOT 0.04      ; tombol REV\nAND NOT 100.01    ; K2\n', '').replace('AND NOT 0.03      ; tombol FWD\nAND NOT 100.00    ; K1\n', '') },
    { mi: 5, t: 'Bintang hanya sebentar dan K3 menyusul tanpa jeda', h: 'Periksa SV timer dan syarat K3.', text: STN.PRE.yd.replace('TIM     000 #50', 'TIM     000 #5').replace('AND     T001      ; jeda', 'AND     T000      ; jeda') },
    { mi: 6, t: 'Konveyor tidak pernah berhenti di 10 produk', h: 'Periksa urutan masukan CNT dan rung motor.', text: STN.PRE.conv.replace('AND NOT C000      ; berhenti saat batch selesai\n', '').replace('LD      0.05      ; sensor produk B1\nLD      0.06      ; tombol RESET', 'LD      0.06      ; tombol RESET\nLD      0.05      ; sensor produk B1') },
    { mi: 7, t: 'Sekuens A+ B+ B- A- melompati B+', h: 'Satu syarat transisi memakai sensor yang salah.', text: STN.PRE.seq.replace('AND     0.07      ; 2B2', 'AND     0.05      ; 2B2') }
  ];
  (function debug() {
    const box = $('#debug-list'), solved = store.get('dbg', {}), drafts = store.get('dbg-draft', {});
    box.innerHTML = DEBUG.map((d, i) => `<div class="q${solved[i] ? ' done' : ''}" data-d="${i}"><div class="q-head"><span class="n">${i + 1}</span><b>${esc(d.t)}</b><span class="tag">${MI(d.mi).p}</span>${solved[i] ? '<span class="tag ok">lulus</span>' : ''}</div>
      <p class="small">Target: ${esc(MI(d.mi).d)}</p><details class="reveal"><summary>Petunjuk</summary><div><p>${esc(d.h)}</p></div></details>
      <textarea class="mono code-area" rows="10" spellcheck="false" autocapitalize="characters" data-dt="${i}">${esc(drafts[i] || d.text)}</textarea>
      <div class="btn-row"><button type="button" class="btn btn-primary small" data-chk="${i}">Periksa</button><button type="button" class="btn btn-ghost small" data-orig="${i}">${icon('reset')}Kembalikan soal</button><a class="btn btn-ghost small" href="#lab" data-tolab="${i}">${icon('play')}Coba di Lab PLC</a></div><div data-out="${i}"></div></div>`).join('');
    const saveDrafts = debounce(() => store.set('dbg-draft', drafts), 300);
    box.addEventListener('input', e => { const t = e.target; if (t.dataset.dt === undefined) return; drafts[t.dataset.dt] = t.value; saveDrafts(); });
    box.addEventListener('click', e => {
      const c = e.target.closest('[data-chk]');
      if (c) {
        const i = +c.dataset.chk, d = DEBUG[i], out = STN.runTest(MI(d.mi), $(`[data-dt="${i}"]`, box).value);
        $(`[data-out="${i}"]`, box).innerHTML = `<ul class="checks small">${out.res.map(([t, ok]) => `<li class="${ok ? 'pass' : 'fail'}">${ok ? '✓' : '✕'} ${esc(t)}</li>`).join('')}</ul>`;
        if (out.ok) { const s = store.get('dbg', {}); s[i] = true; store.set('dbg', s); toast('Lulus'); const q = c.closest('.q'); q.classList.add('done'); }
      }
      const o = e.target.closest('[data-orig]'); if (o) { const i = +o.dataset.orig; $(`[data-dt="${i}"]`, box).value = DEBUG[i].text; delete drafts[i]; store.set('dbg-draft', drafts); }
      const l = e.target.closest('[data-tolab]'); if (l) { const i = +l.dataset.tolab, m = MI(DEBUG[i].mi); const txt = $(`[data-dt="${i}"]`, box).value; setTimeout(() => window.LABAPI && window.LABAPI.open(m.st, (STN.PRESETS[m.st].find(p => p.drive === m.drive) || STN.PRESETS[m.st].find(p => p.cyl && m.cyl && p.cyl.length === m.cyl.length) || STN.PRESETS[m.st][0]).id, txt, m.cyl), 30); }
    });
  })();

  /* ============================== Rubrik projek ============================== */
  (function rubric() {
    const LV = [['4 · Mahir', 1], ['3 · Cakap', 0.75], ['2 · Layak', 0.5], ['1 · Baru berkembang', 0.25]];
    let sel = store.get('rub-projek', {});
    $('#rub-name').value = store.get('rub-name', '');
    $('#rub-name').addEventListener('input', debounce(() => store.set('rub-name', $('#rub-name').value), 300));
    const calc = () => {
      const A = D.rubrik, filled = A.every((_, i) => sel[i]);
      const sum = A.reduce((p, r, i) => p + (sel[i] ? +r[1] * sel[i] / 4 : 0), 0);
      $('#rub-total').textContent = filled ? fmt(sum, 1).replace(/,0$/, '') : '–';
      $('#rub-detail').textContent = filled ? `${sum >= 75 ? 'Tercapai (≥ 75)' : 'Belum tercapai'}. Nilai = Σ bobot × skor/4.` : `Pilih skor untuk ${A.filter((_, i) => !sel[i]).length} aspek lagi.`;
    };
    $('#rubric').innerHTML = D.rubrik.map((r, i) => `<fieldset class="rubric-row" style="border:0;margin:0;padding-inline:0"><legend class="head" style="display:flex;width:100%"><span style="color:var(--ink);font-family:var(--font-body)">${esc(r[0])}</span><span style="margin-left:auto">bobot ${r[1]}</span></legend><p class="small muted" style="margin:0 0 6px">Indikator cakap: ${esc(r[2])}</p>
      <div class="rubric-opts">${LV.map(([l], k) => `<label><input type="radio" name="rp${i}" value="${4 - k}"${sel[i] === 4 - k ? ' checked' : ''}><b>${l}</b>${k === 0 ? 'melampaui indikator, terverifikasi' : k === 1 ? 'indikator terpenuhi' : k === 2 ? 'sebagian, dengan bantuan' : 'belum tampak'}</label>`).join('')}</div></fieldset>`).join('');
    $('#rubric').addEventListener('change', e => { const inp = e.target.closest('input'); if (!inp) return; sel[+inp.name.slice(2)] = +inp.value; store.set('rub-projek', sel); calc(); });
    calc();
  })();

  /* ============================== Kumpulkan hasil ============================== */
  (function kumpul() {
    const ID = ['nama', 'kelas', 'absen', 'kelompok'];
    const idv = store.get('kp-id', {});
    const syncId = () => { ID.forEach(k => { idv[k] = $('#kp-' + k).value.trim(); }); store.set('kp-id', idv); };
    ID.forEach(k => { $('#kp-' + k).value = idv[k] || ''; $('#kp-' + k).addEventListener('input', debounce(syncId, 250)); });
    function data() {
      syncId();
      const ans = store.get('quiz', {}), Q = D.soal, ex = store.get('exit', {}), cs = store.get('cases', {}), dbg = store.get('dbg', {}), mis = store.get('misi', {});
      const perMod = MODS.map(m => { const idx = Q.map((q, i) => i).filter(i => Q[i].m === m.no); return { m: m.no, n: idx.length, benar: idx.filter(i => ans[i] === Q[i].a).length }; });
      const hmi = store.get('hmi-check', {}), met = store.get('meter', { solved: 0, tries: 0 }), net = store.get('net', { solved: 0, tries: 0 }), com = store.get('comm', { score: null });
      return {
        id: Object.assign({}, idv), meet: MEET.filter(m => store.get('meet' + m.no, false)).map(m => m.no),
        exit: MEET.filter(m => (ex[m.no] || '').trim()).map(m => ({ no: m.no, q: m.exit, a: ex[m.no] })),
        quiz: { benar: perMod.reduce((p, x) => p + x.benar, 0), dij: Object.keys(ans).length, total: Q.length, perMod },
        kasus: { dij: Object.keys(cs).length, tepat: Object.entries(cs).filter(([i, k]) => CASES[i] && CASES[i].o[k] && CASES[i].o[k][1]).length, total: CASES.length },
        dbg: DEBUG.map((d, i) => i).filter(i => dbg[i]).map(i => i + 1), mis: STN.MISSIONS.filter(m => mis[m.id]).map(m => m.p + ' ' + m.t),
        meter: met, net, com, hmi: window.WG.hmi.CHECK.filter(([k]) => hmi[k]).length,
        lkpd: D.lkpd.map(L => ({ no: L.no, t: L.judul, p: lkpdProgress(L.no), s: lkpdState(L.no), nilai: rubScore(lkpdState(L.no)) })),
        logs: LOGS.map(([k, t]) => ({ k, t, rows: store.get('log:' + k, []) }))
      };
    }
    function cards(d) {
      const c = (t, v, s) => `<div class="kp-card"><span>${t}</span><b>${v}</b><small>${s}</small></div>`;
      return c('Pertemuan', `${d.meet.length}/${MEET.length}`, d.meet.length ? 'dicentang selesai' : 'belum dicentang') + c('Tiket keluar', `${d.exit.length}/${MEET.length}`, 'jawaban tertulis') +
        c('Kuis', `${d.quiz.benar}/${d.quiz.total}`, `${d.quiz.dij} soal dijawab`) + c('Studi kasus', `${d.kasus.tepat}/${d.kasus.total}`, `${d.kasus.dij} dijawab`) +
        c('Perbaiki program', `${d.dbg.length}/${DEBUG.length}`, d.dbg.length ? 'lulus no. ' + d.dbg.join(', ') : 'belum ada') + c('Misi Lab PLC', `${d.mis.length}/${STN.MISSIONS.length}`, d.mis.length ? 'lulus' : 'belum ada') +
        c('Lab gangguan', `${d.meter.solved}/${d.meter.tries}`, 'kasus didiagnosis benar') + c('Commissioning', d.com.score === null ? '–' : d.com.score, 'nilai I/O check') +
        c('Uji integrasi HMI', `${d.hmi}/${window.WG.hmi.CHECK.length}`, 'butir checklist') + c('Lab jaringan', `${d.net.solved}/${d.net.tries}`, 'diagnosis benar') +
        c('LKPD', `${d.lkpd.filter(l => l.p >= 75).length}/8`, 'terisi ≥ 75%');
    }
    const tbl = (head, rows) => `<table><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.map(r => `<tr>${r.map(v => `<td>${esc(v === null || v === undefined || v === '' ? '–' : v)}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${head.length}">–</td></tr>`}</tbody></table>`;
    function detail(d, full) {
      let h = '<h3>Kuis per modul</h3>' + tbl(['Modul', 'Benar'], d.quiz.perMod.map(x => [x.m, `${x.benar}/${x.n}`]));
      h += '<h3>LKPD</h3>' + tbl(['No', 'Judul', 'Terisi', 'Nilai rubrik'], d.lkpd.map(l => [l.no, l.t, l.p + '%', l.nilai === null ? '' : l.nilai]));
      h += '<h3>Misi Lab PLC lulus</h3>' + (d.mis.length ? `<p>${esc(d.mis.join('; '))}</p>` : '<p>–</p>');
      if (!full) return h;
      h += '<h3>Tiket keluar</h3>' + tbl(['P', 'Pertanyaan', 'Jawaban'], d.exit.map(x => [x.no, x.q, x.a]));
      d.lkpd.forEach(l => {
        const L = D.lkpd[l.no - 1], s = l.s;
        if (l.p === 0) return;
        h += `<h3>LKPD ${l.no} · ${esc(l.t)}</h3><p>Langkah selesai: ${Object.values(s.steps).filter(Boolean).length}/${L.langkah.length}</p>`;
        h += tbl(L.kolom, (s.rows || []).filter(r => r && r.some(Boolean)).map(r => L.kolom.map((c, k) => r[k] || '')));
        h += tbl(['Pertanyaan', 'Jawaban'], L.diskusi.map((q, i) => [q, s.dis[i] || '']));
        h += tbl(['Pernyataan', 'Ya/belum', 'Bukti'], D.lkRefleksi.map((q, i) => [q, s.self[i] === 1 ? 'Ya' : s.self[i] === 0 ? 'Belum' : '', s.selfB[i] || '']));
        h += tbl(['Refleksi', 'Isi'], ['Hal yang paling saya pahami', 'Kesulitan dan strategi saya', 'Perbaikan berikutnya'].map((q, i) => [q, s.refl[i] || '']));
      });
      d.logs.forEach(L => { if (L.rows.length) h += `<h3>${esc(L.t)}</h3>` + tbl(D.format[L.k].filter(c => c !== 'No'), L.rows.map(r => r.c || [])); });
      const brief = store.get('brief', {}); if (Object.keys(brief).length) h += '<h3>Brief projek</h3>' + tbl(['Bagian', 'Isi'], D.format.brief.map((f, i) => [f, brief[i] || '']));
      const refl = store.get('refl', {}); if (Object.keys(refl).length) h += '<h3>Refleksi akhir tahun</h3>' + tbl(['Pertanyaan', 'Jawaban'], D.refleksiAkhir.map((f, i) => [f, refl[i] || '']));
      const lab = store.get('lab', {}); const lt = lab.text && lab.text[lab.st + ':' + lab.pre]; if (lt) h += `<h3>Program terakhir di Lab PLC</h3><pre>${esc(lt)}</pre>`;
      return h;
    }
    function text(d) {
      return [`HASIL BELAJAR · Sistem Kendali Industri XII TEI`, `${d.id.nama || '(nama belum diisi)'} · ${d.id.kelas || '-'} · absen ${d.id.absen || '-'}${d.id.kelompok ? ' · ' + d.id.kelompok : ''}`,
        `Pertemuan selesai: ${d.meet.length}/32 · Tiket keluar: ${d.exit.length}/32`, `Kuis: ${d.quiz.benar}/${d.quiz.total} (${d.quiz.perMod.map(x => `M${x.m} ${x.benar}/${x.n}`).join(', ')})`,
        `Studi kasus: ${d.kasus.tepat}/${d.kasus.total} · Perbaiki program: ${d.dbg.length}/${DEBUG.length} · Misi Lab PLC: ${d.mis.length}/${STN.MISSIONS.length}`,
        `Lab gangguan: ${d.meter.solved}/${d.meter.tries} · Commissioning: ${d.com.score === null ? '-' : d.com.score} · HMI: ${d.hmi}/7 · Jaringan: ${d.net.solved}/${d.net.tries}`,
        `LKPD: ${d.lkpd.map(l => `${l.no}:${l.p}%`).join(' ')}`, `Dibuat: ${new Date().toLocaleString('id-ID')}`].join('\n');
    }
    function render() { const d = data(); $('#kp-rekap').innerHTML = cards(d); $('#kp-detail').innerHTML = detail(d, false); }
    $('#kp-copy').addEventListener('click', () => { render(); copyText(text(data())); });
    const slug = n => (n || 'siswa').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'siswa';
    $('#kp-download').addEventListener('click', () => {
      render(); const d = data();
      if (!d.id.nama) { toast('Isi nama dulu.'); $('#kp-nama').focus(); return; }
      const html = `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Hasil belajar SKI · ${esc(d.id.nama)}</title>
<style>body{font:15px/1.5 system-ui,sans-serif;margin:24px auto;max-width:960px;padding:0 16px;color:#16211c}h1{font-size:1.5rem;margin:0}h2{margin-top:28px;font-size:1.2rem}h3{margin:20px 0 6px;font-size:1rem}table{border-collapse:collapse;width:100%;font-size:13px;margin:6px 0}th,td{border:1px solid #c8d3cd;padding:5px 8px;text-align:left;vertical-align:top;white-space:pre-wrap}th{background:#edf3ef}.kp{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px}.kp-card{border:1px solid #c8d3cd;border-radius:8px;padding:8px 10px;display:grid}.kp-card b{font-size:1.3rem}.kp-card small,.kp-card span{color:#55655d}pre{white-space:pre-wrap;background:#f3f6f4;padding:10px;border-radius:6px;font-size:12px}@media print{body{margin:0}}</style></head><body>
<h1>Hasil belajar · Sistem Kendali Industri</h1><p><b>${esc(d.id.nama)}</b> · ${esc(d.id.kelas || '-')} · absen ${esc(d.id.absen || '-')}${d.id.kelompok ? ' · ' + esc(d.id.kelompok) : ''}<br>Dibuat ${esc(new Date().toLocaleString('id-ID'))} dari web media ajar Sistem Kendali Industri kelas XII TEI.</p>
<h2>Rekap</h2><div class="kp">${cards(d)}</div><h2>Rincian</h2>${detail(d, true)}</body></html>`;
      saveFile(`hasil-ski-${slug(d.id.nama)}.html`, html, 'text/html');
    });
    $('#kp-prog').addEventListener('click', () => { const lab = store.get('lab', {}); const t = lab.text && lab.text[lab.st + ':' + lab.pre]; if (!t) { toast('Belum ada program di Lab PLC'); return; } syncId(); saveFile(`program-${slug(idv.nama)}.txt`, t); });
    onShow.kumpul = render;
  })();

  /* ============================== Glosarium & cheat sheet ============================== */
  const GLOSS = [['AND LD / OR LD', 'Instruksi Omron yang menggabungkan dua blok logika secara seri / paralel.', 2], ['BCD', 'Binary coded decimal: setiap digit desimal disimpan dalam 4 bit. SV timer Omron bawaan memakai BCD.', 4], ['Bintang-segitiga', 'Starter yang mula-mula menghubungkan kumparan motor bintang (arus dan torsi start ⅓), lalu segitiga.', 1],
    ['Commissioning', 'Rangkaian pemeriksaan sebelum mesin dipakai: power-off check, power-on, I/O check, uji fungsi, dokumentasi.', 3], ['Completion flag', 'Bit timer/counter yang ON saat waktu habis atau hitungan selesai (T000, C000).', 4], ['CNT', 'Counter turun Omron: masukan hitung dan reset; flag ON saat PV mencapai 0.', 4], ['COM', 'Terminal bersama untuk sekelompok input atau output PLC.', 3],
    ['CX-Programmer', 'Software pemrograman PLC Omron (bagian dari CX-One), dengan simulasi dan monitoring.', 2], ['Diagram langkah', 'Diagram perpindahan silinder terhadap langkah sekuens.', 5], ['DIFU / DIFD', 'Deteksi tepi naik / turun: output ON selama satu scan.', 4], ['DOL', 'Direct on line: motor langsung dihubungkan ke jaringan lewat kontaktor.', 1],
    ['E-stop', 'Emergency stop: tombol NC hard-wired yang memutus daya aktuator.', 1], ['Fail-safe', 'Rancangan yang menuju kondisi aman bila komponen atau kabel gagal.', 1], ['Ferrule', 'Selongsong ujung kabel serabut agar terjepit rapi di terminal.', 3], ['Force', 'Memaksa bit ON/OFF dari software untuk uji; wajib dibatalkan.', 3],
    ['FRL', 'Filter, regulator, lubricator: unit pelayanan udara bertekanan.', 5], ['GRAFCET', 'Diagram fungsi sekuensial: langkah, aksi, dan transisi (IEC 60848).', 7], ['Half-split', 'Strategi mencari gangguan dengan mengukur di tengah rangkaian lalu membagi dua bagian yang bermasalah.', 1], ['Heartbeat', 'Bit yang terus berganti untuk membuktikan komunikasi dan PLC pengirim hidup.', 8],
    ['HMI', 'Human-machine interface: layar operator untuk operasi, monitoring, setpoint, dan alarm.', 6], ['Homing', 'Mengembalikan aktuator ke posisi awal sebelum siklus otomatis.', 7], ['Host Link', 'Protokol serial Omron untuk komunikasi PC/HMI ke PLC.', 8], ['I/O list', 'Daftar alamat, simbol, perangkat lapangan, tipe, nomor kabel, terminal.', 3],
    ['IEC 61131-3', 'Standar bahasa PLC: LD, FBD, ST, IL, SFC.', 2], ['Interlock', 'Penguncian silang agar dua aksi berbahaya tidak terjadi bersamaan.', 1], ['ISO 1219', 'Standar simbol dan penamaan komponen fluida (1A, 1V1, 1B1, 1Y1).', 5], ['Katup 4/3', 'Katup 4 lubang 3 posisi; posisi tengah menahan/menutup aliran.', 5], ['Katup 5/2', 'Katup 5 lubang 2 posisi untuk silinder kerja ganda.', 5],
    ['KEEP(011)', 'Latch Omron dengan masukan set dan reset; reset berprioritas.', 4], ['Koil ganda', 'Satu alamat ditulis OUT di lebih dari satu rung; rung terakhir menang.', 4], ['Kontaktor', 'Sakelar elektromagnetik untuk arus beban: kumparan A1-A2, kontak utama, kontak bantu.', 1], ['LOTO', 'Lock-out/tag-out: mengunci dan memberi tanda sumber daya yang dimatikan.', 1],
    ['Modbus', 'Protokol industri terbuka (RTU serial, TCP Ethernet).', 8], ['NPN / PNP', 'Jenis keluaran sensor transistor: NPN menarik ke 0 V, PNP memberi +24 V.', 3], ['P_First_Cycle', 'Flag A200.11: ON hanya pada scan pertama setelah RUN.', 4], ['Pengunci', 'Self-holding: kontak output diparalel dengan START agar tetap ON.', 1],
    ['Piramida otomasi', 'Lapisan lapangan, kendali, supervisi, MES, ERP.', 8], ['Power-off check', 'Pemeriksaan tanpa daya: visual, kontinuitas, polaritas, isolasi +24 V/0 V.', 3], ['Relief valve', 'Katup pembatas tekanan maksimum sistem hidrolik.', 5], ['RS-485', 'Media serial diferensial multidrop untuk jaringan industri.', 8],
    ['Serial PLC Link', 'Pertukaran data siklik antar-PLC Omron lewat RS-485; CP1E memakai CIO 200-289.', 8], ['SET / RSET', 'Menyalakan / mematikan bit dan mempertahankannya; yang dieksekusi terakhir menang.', 4], ['Siklus scan', 'Baca input, eksekusi program, perbarui output, komunikasi; berulang terus.', 2], ['Step bit', 'Satu bit W per langkah sekuens; hanya satu yang aktif.', 5],
    ['SV / PV', 'Set value (nilai setelan) dan present value (nilai berjalan) timer/counter.', 4], ['TIM / TIMH', 'Timer Omron bersatuan 0,1 s / 0,01 s, on-delay.', 4], ['TOR', 'Thermal overload relay: pengaman beban lebih motor (95-96 NC, 97-98 NO).', 1], ['Watchdog timer', 'Timer yang memberi alarm bila transisi tidak terjadi dalam batas waktu.', 7]];
  (function glossary() {
    const tb = $('#glo-table tbody');
    const draw = q => {
      const re = q ? new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig') : null, hl = s => re ? esc(s).replace(re, '<mark>$1</mark>') : esc(s);
      const rows = GLOSS.filter(([a, b]) => !q || (a + ' ' + b).toLowerCase().includes(q.toLowerCase()));
      tb.innerHTML = rows.length ? rows.map(([a, b, c]) => `<tr><td><b>${hl(a)}</b></td><td>${hl(b)}</td><td><a href="#m${c}">M${c}</a></td></tr>`).join('') : '<tr><td colspan="3" class="muted">Istilah tidak ditemukan.</td></tr>';
    };
    $('#glo-search').addEventListener('input', e => draw(e.target.value.trim()));
    draw('');
  })();

  /* ============================== Checklist tersimpan, offline ============================== */
  fillStatic(); renderModHeads(); renderMeetBoxes(); renderMeetings(); updateProgress(); renderLKPD();
  $$('input[data-save]').forEach(cb => { cb.checked = store.get('chk:' + cb.dataset.save, false); cb.addEventListener('change', () => store.set('chk:' + cb.dataset.save, cb.checked)); });
  const netbar = $('#netbar'), updateNet = () => { netbar.hidden = navigator.onLine; };
  window.addEventListener('online', updateNet); window.addEventListener('offline', updateNet); updateNet();
  $$('a[href^="http"]').forEach(a => { a.classList.add('ext'); a.target = '_blank'; a.rel = 'noopener'; if (!a.title) a.title = 'Membuka situs lain (butuh internet)'; });
  document.addEventListener('click', e => { if (e.target.closest('a.ext') && !navigator.onLine) toast('Tautan ini butuh internet. Materi, lab, dan kuis tetap bisa dipakai offline.'); });
  const offStatus = $('#offline-status'), setOff = (t, c) => { if (offStatus) { offStatus.textContent = t; offStatus.className = 'tag ' + (c || ''); } };
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || /^(localhost|127\.0\.0\.1)$/.test(location.hostname))) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').then(() => navigator.serviceWorker.ready).then(() => caches.keys())
        .then(keys => setOff(keys.some(k => k.startsWith('modul-ski-')) ? 'Tersimpan: bisa dibuka ulang tanpa internet di browser ini' : 'Sedang menyimpan…', keys.length ? 'ok' : ''))
        .catch(() => setOff('Tidak bisa disimpan untuk offline di browser ini', 'warn'));
    });
  } else setOff(location.protocol === 'file:' ? 'Dibuka dari file lokal: tidak perlu internet' : 'Penyimpanan offline tidak tersedia di sini', location.protocol === 'file:' ? 'ok' : 'warn');
  route();
})();
