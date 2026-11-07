# Web Interaktif: Sistem Kendali Industri (SMK Kelas XII TEI)

Web ini dibuat dari "Paket Perangkat Ajar Sistem Kendali Industri Kelas XII Teknik Elektronika Industri 2026/2027" (CP 046/H/KR/2025, Pembelajaran Mendalam 8-3-3-4). Isinya:

- **8 modul, 32 pertemuan** (P1-P32). Setiap pertemuan berisi materi untuk siswa, gambar dari dokumen, widget atau simulasi, tiket keluar yang bisa dijawab di HP (dengan contoh jawaban), dan alur pertemuan untuk guru (Pendahuluan 15, Memahami 30, Mengaplikasi 60, Merefleksi 15, Penutup 15 menit). Di akhir setiap modul ada asesmen, KKTP, remedial, dan pengayaan.
- **Lab PLC**: simulator ladder bergaya Omron seri CP. Program ditulis dalam mnemonik (LD, AND, OR, OUT, SET/RSET, KEEP, DIFU/DIFD, TIM/TIMH, CNT/CNTR, MOV, CMP, pembanding, ++B, SFT, END), ada program check, diagram ladder dengan aliran daya, monitor dan force, diagram waktu, dan tombol matikan-hidupkan daya. Lima stasiun: panel motor (DOL, kanan-kiri, bintang-segitiga, termasuk kontaktor lengket dan interlock hardware), konveyor berhitung, elektropneumatik (sampai 3 silinder), press elektrohidrolik dua tangan, dan stasiun sortir. Ada **9 misi** yang diuji otomatis dengan skenario normal dan gagal.
- **Lab gangguan**: multimeter virtual pada rangkaian kontrol DOL, 7 jenis gangguan, mode kasus misteri.
- **Lab commissioning**: menyusun urutan commissioning dan I/O check pada trainer yang menyimpan kesalahan wiring.
- **Diagram langkah**: ketik sekuens (misalnya `A+ B+ B- A-`), web menggambar diagram langkah, tabel transisi, dan program step bit yang bisa langsung diuji di Lab PLC.
- **Lab HMI**: layar mirip Omron NB (utama, setting bersandi, alarm), daftar tag yang bisa diubah untuk mencoba salah alamat/format BCD-BIN, dan checklist uji integrasi otomatis.
- **Lab jaringan**: dua PLC dengan Serial PLC Link, heartbeat dan watchdog, gangguan kabel/nomor unit/baud rate/PLC berhenti, mode diagnosis, cek alamat IP.
- **Alat hitung**: TIM/TIMH dan BCD, pembaca alamat Omron, gaya silinder F = p × A, arus start Y-Δ, alamat IP.
- **Asesmen**: kuis 40 soal (bank soal dokumen, dengan pembahasan), 16 soal uraian dengan pokok jawaban, 8 studi kasus, 8 program untuk diperbaiki (diuji otomatis), rubrik projek 100 poin, diagnostik, bobot, dan tingkat kinerja.
- **LKPD 1-8** digital (langkah, lembar bukti, diskusi, refleksi, rubrik unjuk kerja) dan **Log kerja** (I/O list, commissioning, test log, troubleshooting log, communication log, brief projek, konferensi, refleksi akhir) dengan unduhan CSV.
- **Perangkat guru**: prota, promes, kalender, RPM lengkap per modul, KKTP, remedial/pengayaan, jurnal guru, rekap kemajuan peserta didik, checklist penutupan tahun, rujukan.
- **Kumpulkan hasil**: siswa mengunduh laporan `.html` (berisi tiket keluar, LKPD, log, nilai lab), menyalin ringkasan teks, atau mengunduh program Lab PLC.

## Link website

- Website untuk siswa: https://nothinsphere.github.io/modul-ski/
- Repositori GitHub: https://github.com/nothinsphere/modul-ski

Untuk memperbarui website setelah mengubah file, jalankan di folder ini: `git add -A`, `git commit -m "pesan perubahan"`, lalu `git push`. Bisa juga dengan **Add file → Upload files** di halaman repositori. Website ikut berubah sekitar 1 menit kemudian.

## Cara membuka

- Untuk siswa (HP): bagikan link website di atas. Membuka `index.html` langsung dari pengelola file HP sering gagal.
- Di laptop: buka link website, atau dari folder `claude projek` jalankan `py -m http.server 8768 --directory modul-ski`, lalu buka `http://localhost:8768`. Bisa juga klik dua kali `index.html` (fitur offline tidak aktif).

Setiap kali mengubah file di folder `assets`, naikkan angka `?v=…` di `index.html` dan `CACHE` di baris atas `sw.js`. Tanpa itu, HP siswa bisa tetap memakai salinan lama.

## Memakai tanpa internet

| Situasi | Hasil |
|---|---|
| Halaman sudah terbuka, lalu internet putus | Semua fitur tetap jalan. |
| Membuka ulang link tanpa internet | Bisa, asalkan web pernah dibuka sekali dengan internet di browser yang sama (bukan mode penyamaran). |
| Membuka `index.html` dari folder laptop | Tidak butuh internet; font berganti ke font bawaan. |
| Tautan bertanda ↗ | Selalu butuh internet. |

## Catatan isi (perbaikan dan tambahan terhadap dokumen)

Periksa kembali sebelum dipakai untuk penilaian.

- **Salah ketik**: penutup Pertemuan 12 "inti sET/RSET" ditulis "SET/RSET".
- **K3, butir program**: dokumen menulis "ubah wiring hanya pada mode PROGRAM dengan daya keluaran terputus", yang bertentangan dengan butir pertama (wiring hanya saat power-off + LOTO). Di web ditulis: perubahan program online hanya pada mode PROGRAM, sedangkan wiring tetap diubah saat power-off dengan LOTO.
- **Interlock K1-K2 pada bintang-segitiga**: I/O list dokumen menulis K2 "interlock K1/K3". Pada putar kanan-kiri K1 dan K2 saling di-interlock, tetapi pada bintang-segitiga K1 dan K2 justru aktif bersamaan. Web menjelaskan bahwa interlock K1 harus dilepas dari jalur K2 saat trainer dipakai untuk bintang-segitiga (Pertemuan 4 dan I/O list Pertemuan 8).
- **Gambar 3.1**: gambar menyederhanakan satu COM keluaran. Pada CP1E 30 titik, COM output relai terbagi beberapa kelompok, jadi semua COM yang mencatu aktuator harus lewat E-stop. Juga dicatat bahwa PLC model "-A" dicatu 100-240 VAC; 24 VDC di gambar adalah catu I/O.
- **Serial PLC Link**: CIO 200-289 berlaku untuk CP1E (tipe N/NA yang mendukung). Judul Gambar 8.1 menyebut CP1E/CP1L; di web ditambahkan bahwa CP1L/CP1H memakai CIO 3100-3189.
- **Sekuens A+ B+ B- A-**: tabel dokumen hanya mengaktifkan langkah awal bila silinder sudah di posisi awal, padahal Pertemuan 19 meminta "RESET ke posisi awal" dan katup solenoid ganda menahan posisi setelah E-stop. Program di web menambah langkah homing `W0.05` (RESET → A- dan B- → langkah awal). Generator diagram langkah memakai pola yang sama.
- **Hitungan ganda (Pertemuan 15)**: dokumen menyebut deteksi tepi sebagai salah satu solusi. Karena CNT sudah bereaksi pada tepi naik, web menjelaskan bahwa pulsa ganda berasal dari sinyal sensor (posisi sensor, bouncing, input time constant).
- **Bintang-segitiga**: ditambahkan bahwa torsi start juga turun menjadi sekitar sepertiga (dokumen menyebut arus saja).
- **Kendali dua tangan**: ditambahkan bahwa mesin press sungguhan wajib memakai modul/relay keselamatan bersertifikat (ISO 13851); program PLC di web hanya latihan logika.
- **Program HMI**: potongan program dokumen memakai 100.00 sebagai pengunci sekaligus motor. Program lengkap di Lab HMI memakai W1.00 sebagai pengunci "sistem jalan" agar motor bisa berhenti selama waktu tahan, lalu jalan lagi.
- **Tambahan pengembang** (tidak ada di dokumen, perlu dicek guru): tabel I/O stasiun sortir (termasuk sensor S0 benda masuk untuk watchdog) dan stasiun press hidrolik; pembahasan 40 soal kuis (kuncinya dari dokumen dan sudah dicek ulang); pokok jawaban uraian kecuali butir 10 (kunci asli dokumen); contoh jawaban 32 tiket keluar; 8 studi kasus; 8 program perbaiki; tingkat skor 1-4 pada rubrik projek (dokumen hanya memuat indikator cakap).
- Rumus waktu, KKTP 75, bobot bukti, rubrik projek 100 poin, LKPD, dan format lampiran diambil apa adanya dari dokumen (`assets/data.js` dibangkitkan dari docx).

## Revisi setelah tinjauan (8 November 2026)

- **Hasil misi dan "Perbaiki program"**: setiap uji dicatat bersama versi program (kode 6 karakter), waktu, dan rinciannya. Kartu menampilkan *uji terakhir* (lulus/gagal) terpisah dari *riwayat pernah lulus*. Mengubah program langsung ditandai "versi ini belum diuji". Laporan menuliskan hubungan tiap hasil dengan program yang sekarang dan menyertakan cuplikan program yang pernah lulus. Catatan lulus dari versi web sebelumnya dimigrasikan sebagai riwayat.
- **Rubrik projek**: nilai angka (Σ bobot × skor/4) dipisahkan dari keputusan kompetensi. Guru meninjau empat syarat esensial (K3 kritis, pengaman/E-stop, fungsi inti, bukti uji) dan mengisi nama validator. Satu syarat gagal = belum tercapai walaupun nilai tinggi; syarat belum ditinjau atau validator kosong = menunggu validasi; nilai < 75 = belum tercapai. Rubrik LKPD memakai aturan yang sama (satu isian syarat esensial).
- **Status simpan**: bilah atas menampilkan "Tersimpan HH.MM" hanya setelah penulisan berhasil. Bila browser menolak penyimpanan, muncul peringatan merah dengan tombol "Coba simpan lagi" dan "Unduh cadangan sekarang"; isian tetap ada di memori selama halaman terbuka.
- **Cadangan (.json)** di Kumpulkan hasil: unduh dan pulihkan pekerjaan siswa (format `modul-ski`, versi 1, maks 2 MB). File diperiksa (aplikasi, versi, jenis dan ukuran data, kunci yang dikenal) dan ditampilkan pratinjaunya. Pemulihan mengganti, tidak menggabungkan; bila nama berbeda harus dikonfirmasi; bila gagal di tengah, data lama dikembalikan. Catatan guru (rubrik projek, jurnal, rekap, checklist penutupan) tidak ikut cadangan siswa.
- **Laporan** memuat rubrik projek (skor per aspek, bobot, kontribusi, nilai, syarat esensial, keputusan, catatan, validator). Bila nama yang dinilai tidak cocok dengan identitas laporan, siswa harus memilih "sertakan" atau "jangan sertakan" sebelum mengunduh.
- **Menu HP**: saat tertutup tidak bisa dijangkau Tab; saat terbuka fokus pindah ke menu, bagian lain halaman tidak bisa difokus, Esc dan tombol tutup mengembalikan fokus ke tombol menu.
- **Lab PLC**: tombol mode memakai kata kerja ("Beralih ke PROGRAM/RUN") dan mode saat ini ditampilkan terpisah. Ada penanda bila program di editor belum diunduh ke simulator, dan hasil program check menyebut versi yang diperiksa.
- **Gambar**: tombol "Perbesar gambar" membuka penampil dengan zoom 100-400% dan geser; Esc/Tutup mengembalikan fokus.
- **Navigasi pertemuan**: bilah "Lompat ke P…" yang menempel di setiap modul (pertemuan yang sedang dibaca ditandai), plus tautan pertemuan sebelum/sesudah di akhir setiap pertemuan.
- **Perbaikan lain**: tombol "Tambah baris" di LKPD tidak lagi memasang pendengar ganda.
- Uji regresi: 9 program contoh tetap lulus pemeriksa misi bawaan (DOL, SET/RSET, toggle, kanan-kiri, bintang-segitiga, konveyor, sekuens pneumatik, press dua tangan, sortir). Ini pemeriksaan bawaan simulator, bukan bukti kesamaan penuh dengan PLC Omron sungguhan. Skenario baru yang diuji di browser: lulus lalu gagal, edit setelah uji, gerbang syarat esensial (contoh K3 = 1, lainnya 4 → nilai 94 tetap "menunggu validasi"), penyimpanan gagal lalu dicoba ulang, cadangan darurat, pemulihan (termasuk file rusak, aplikasi lain, versi lebih baru, kunci asing, tipe salah, terlalu besar, batal, dan gagal di tengah), kelengkapan laporan, fokus menu tertutup/terbuka, penampil gambar. Belum diuji di HP Android/iOS fisik dan pembaca layar.

## Perilaku simulator (ringkas)

- Satu scan = 10 ms: input dibaca, rung dieksekusi atas-ke-bawah, output diperbarui. Koil ganda, nomor timer ganda, dan OUT ke area input diberi peringatan saat program check.
- TIM satuan 0,1 s, TIMH 0,01 s, SV BCD (`#50`). SV yang bukan BCD ditolak. CNT menghitung turun pada tepi naik; saat program diunduh PV diisi SV (di PLC sungguhan PV counter bertahan, jadi tekan RESET sebelum batch pertama).
- Matikan-hidupkan daya: W, output, dan timer hilang; H, D, dan PV counter bertahan; P_First_Cycle ON satu scan.
- Kontaktor punya waktu tarik ±15 ms dan lepas ±40 ms. Tanpa interlock hardware, pembalikan langsung atau kontak K1 lengket menimbulkan "hubung singkat" di panel motor.
- E-stop di stasiun pneumatik, press, sortir, dan HMI memutus daya aktuator (hard-wired) sekaligus memberi status ke input PLC.
- Semua data siswa tersimpan di `localStorage` browser masing-masing (awalan `ski:`), tidak dikirim ke mana pun. Cadangan .json bisa dipindah antarbrowser.

## Mengubah isi

- Materi siswa, identitas, alat: `index.html`
- Isi dari dokumen (RPM, LKPD, bank soal, format): `assets/data.js`
- Tiket keluar, pembahasan kuis, uraian, studi kasus, perbaiki program, glosarium, laporan: `assets/app.js`
- Mesin PLC dan gambar ladder: `assets/plc.js`
- Stasiun, program contoh, misi Lab PLC: `assets/stations.js`
- Widget (multimeter, commissioning, NPN/PNP, diagram langkah, HMI, jaringan, kalkulator): `assets/widgets.js`
