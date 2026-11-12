/* =====================================================================
 * app.js — Inti aplikasi OBE Tracker v5 (PWA GitHub Pages)
 *   boot cepat (cache IndexedDB + SWR), login SSO Google (Gerbang → tiket → API),
 *   pengajuan akses mandiri, menu & navigasi instan, indikator sinkron, penjaga tutup tab.
 * ===================================================================== */
import * as E from './engine.js';
import { db, Store, Sync, api, Sesi, Fire, Bus, DEMO, LS } from './data.js';
import { h, $id, State, showToast, showCustomDialog, openModal, closeModal, modalTerbuka, aman } from './ui.js';
import * as Admin from './admin.js';
import { renderInputNilai, formNilai, hapusNilai } from './nilai.js';
import { renderLaporan } from './laporan.js';
import { downloadTemplate, handleExcelUpload } from './excel.js';

const PAGES = {
  dashboard: () => Admin.renderAdminDashboard(),
  'manajemen-user': t => Admin.renderManajemenUser(t),
  'data-master': t => Admin.renderDataMaster(t),
  mapping: t => Admin.renderMappingPage(t),
  'input-nilai': t => renderInputNilai(t),
  laporan: t => renderLaporan(t === null || t === undefined ? undefined : t),
  settings: () => Admin.renderSettings()
};
const AKSES = { admin: Object.keys(PAGES), dosen: ['input-nilai', 'laporan'], mahasiswa: ['laporan'] };
const AWAL = { admin: 'dashboard', dosen: 'input-nilai', mahasiswa: 'laporan' };

// ---------- Loading screen ----------
const loadingText = t => { const el = $id('loading-text'); if (el) el.innerText = t; };
function tutupLoader() { const l = $id('global-loading'); if (!l || l.classList.contains('hidden')) return; l.style.opacity = '0'; setTimeout(() => l.classList.add('hidden'), 300); }
function tampilLogin() {
  $id('main-dashboard').classList.add('hidden'); $id('login-page').classList.remove('hidden'); tutupLoader();
  tombolLogin();
  if (DEMO) $id('demo-box').classList.remove('hidden');
  if (!DEMO) api('ping', {}, { method: 'GET', timeout: 15000 }); // hangatkan server Apps Script
}

// ---------- Branding ----------
function branding(b) {
  const st = b || db.settings[0] || LS.get('obe4_brand', {}) || {};
  if (!b && Store.siap) LS.set('obe4_brand', { namaProdi: st.namaProdi || '', fakultas: st.fakultas || '', logoUrl: st.logoUrl || '' });
  if (st.namaProdi) document.querySelectorAll('.app-brand-name').forEach(el => { el.innerText = st.namaProdi; });
  if (st.fakultas) document.querySelectorAll('.app-brand-fakultas').forEach(el => { el.innerText = st.fakultas; });
  if (st.logoUrl && /^data:image\//.test(st.logoUrl)) {
    document.querySelectorAll('.app-brand-icon').forEach(el => { el.innerHTML = `<img src="${h(st.logoUrl)}" class="w-full h-full object-contain" alt="">`; el.classList.remove('p-1.5', 'p-2', 'bg-gradient-to-br'); el.classList.add('bg-transparent'); });
    document.querySelectorAll('.app-brand-icon-login').forEach(el => { el.innerHTML = `<img src="${h(st.logoUrl)}" class="w-full h-full object-contain" alt="">`; el.classList.add('bg-transparent'); el.classList.remove('hidden'); });
  }
}

// ---------- Menu ----------
const navBtn = (id, ikon, teks) => `<button onclick="loadPage('${id}')" id="nav-${id}" class="w-full flex items-center space-x-3 px-8 py-3.5 text-gray-500 hover:bg-gray-50 transition group"><i class="fas ${ikon} w-5 text-gray-400 group-hover:text-brand-light transition"></i><span class="font-bold text-sm tracking-wide">${teks}</span></button>`;
const subItem = (page, tab, ikon, teks, tambah) => `<div class="w-full flex items-center justify-between pl-16 pr-8 py-3 text-gray-500 hover:text-brand-light hover:bg-brand-soft/50 text-sm transition group cursor-pointer" onclick="loadPage('${page}', '${tab}')"><div class="flex items-center space-x-3"><i class="fas ${ikon} text-[10px]"></i><span class="font-medium">${teks}</span></div>${tambah ? `<i onclick="event.stopPropagation(); openMasterForm('${tambah}')" class="fas fa-plus-circle text-gray-300 hover:text-brand-light transition text-lg" title="Tambah"></i>` : ''}</div>`;
const grup = (id, ikon, teks, isi) => `<div class="relative group"><button onclick="toggleSubmenu('${id}')" class="w-full flex items-center justify-between px-8 py-3.5 text-gray-500 hover:bg-gray-50 transition"><div class="flex items-center space-x-3"><i class="fas ${ikon} w-5 text-gray-400 group-hover:text-brand-light transition"></i><span class="font-bold text-sm tracking-wide">${teks}</span></div><i id="arrow-${id}" class="fas fa-chevron-right text-[10px] transition-transform duration-300"></i></button><div id="submenu-${id}" class="submenu-enter bg-gray-50/50 border-y border-gray-100/50">${isi}</div></div>`;
function renderMenu() {
  const r = State.user.role; let html = '';
  if (r === 'admin') {
    html = navBtn('dashboard', 'fa-home', 'Beranda') +
      grup('user', 'fa-users-cog', 'Manajemen User', subItem('manajemen-user', 'tab-dosen', 'fa-chalkboard-teacher', 'Data Dosen', 'dosen') + subItem('manajemen-user', 'tab-mhs', 'fa-user-graduate', 'Data Mahasiswa', 'mhs')) +
      grup('master', 'fa-database', 'Data Master', subItem('data-master', 'tab-profil', 'fa-user-tie', 'Profil Lulusan', 'profil') + subItem('data-master', 'tab-cpl', 'fa-list-check', 'Capaian (CPL)', 'cpl') + subItem('data-master', 'tab-mk', 'fa-book', 'Mata Kuliah', 'mk') + subItem('data-master', 'tab-cpmk', 'fa-bullseye', 'Data CPMK', 'cpmk')) +
      grup('mapping', 'fa-project-diagram', 'Pemetaan OBE', `<button onclick="loadPage('mapping', 'cpl-profil')" class="w-full flex items-center space-x-3 pl-16 py-3 text-gray-500 hover:text-brand-light hover:bg-brand-soft/50 text-sm transition"><i class="fas fa-user-tie text-[10px]"></i><span class="font-medium">Mapping CPL <i class="fas fa-arrow-right mx-1 text-[8px]"></i> Profil</span></button><button onclick="loadPage('mapping', 'cpmk-cpl')" class="w-full flex items-center space-x-3 pl-16 py-3 text-gray-500 hover:text-brand-light hover:bg-brand-soft/50 text-sm transition"><i class="fas fa-sitemap text-[10px]"></i><span class="font-medium">Mapping CPMK <i class="fas fa-arrow-right mx-1 text-[8px]"></i> CPL</span></button>`) +
      navBtn('input-nilai', 'fa-edit', 'Input Nilai CPMK') + navBtn('laporan', 'fa-chart-pie', 'Laporan Evaluasi') + '<div class="my-3 border-t border-gray-100"></div>' + navBtn('settings', 'fa-cog', 'Pengaturan Instansi');
  } else if (r === 'dosen') html = navBtn('input-nilai', 'fa-edit', 'Input Nilai CPMK') + navBtn('laporan', 'fa-chart-pie', 'Laporan Evaluasi');
  else html = navBtn('laporan', 'fa-user-graduate', 'Laporanku (CPL & PL)');
  $id('nav-menu').innerHTML = html;
}
let activeSubmenu = null;
function toggleSubmenu(id) {
  const sub = $id('submenu-' + id), arrow = $id('arrow-' + id);
  if (activeSubmenu && activeSubmenu !== id) { const os = $id('submenu-' + activeSubmenu), oa = $id('arrow-' + activeSubmenu); if (os) os.classList.remove('submenu-open'); if (oa) oa.classList.remove('rotate-90'); }
  sub.classList.toggle('submenu-open'); arrow.classList.toggle('rotate-90'); activeSubmenu = sub.classList.contains('submenu-open') ? id : null;
}
let sidebarOpen = false;
function toggleSidebar() {
  const sb = $id('sidebar-container'), ov = $id('sidebar-overlay'); sidebarOpen = !sidebarOpen;
  sb.classList.toggle('-translate-x-full', !sidebarOpen); ov.classList.toggle('hidden', !sidebarOpen);
}
function closeSidebar() { if (window.innerWidth < 768 && sidebarOpen) toggleSidebar(); }

// Navigasi bawah melayang (HP)
function bottomNav() {
  const old = $id('obe-bnav'); if (old) old.remove();
  const r = State.user.role, items = r === 'admin' ? [['dashboard', 'fa-home', 'Beranda'], ['manajemen-user', 'fa-users-cog', 'User', 'tab-dosen'], ['data-master', 'fa-database', 'Master', 'tab-profil'], ['mapping', 'fa-project-diagram', 'Peta', 'cpmk-cpl'], ['input-nilai', 'fa-edit', 'Nilai'], ['laporan', 'fa-chart-pie', 'Laporan']]
    : r === 'dosen' ? [['input-nilai', 'fa-edit', 'Nilai'], ['laporan', 'fa-chart-pie', 'Laporan']] : [['laporan', 'fa-user-graduate', 'Laporanku']];
  const n = document.createElement('nav'); n.id = 'obe-bnav'; n.className = 'md:hidden fixed bottom-3 inset-x-3 z-50 flex justify-around rounded-2xl border border-white/40 bg-white/80 backdrop-blur-md shadow-2xl p-1.5';
  n.innerHTML = items.map(i => `<button data-p="${i[0]}" data-t="${i[3] || ''}" class="flex-1 flex flex-col items-center py-1.5 rounded-xl text-gray-400 text-[10px] font-bold"><i class="fas ${i[1]} text-base mb-0.5"></i>${i[2]}</button>`).join('');
  n.onclick = e => { const b = e.target.closest('button'); if (b) loadPage(b.dataset.p, b.dataset.t || null); };
  $id('app-container').appendChild(n);
}
function tandaiNav(p) {
  document.querySelectorAll('#nav-menu button').forEach(b => b.classList.remove('sidebar-active'));
  const a = $id('nav-' + p); if (a) a.classList.add('sidebar-active');
  const n = $id('obe-bnav'); if (n) n.querySelectorAll('button').forEach(b => { const on = b.dataset.p === p; b.classList.toggle('text-brand', on); b.classList.toggle('bg-brand-soft', on); b.classList.toggle('text-gray-400', !on); });
}

// ---------- Navigasi instan (tanpa jeda buatan) ----------
let renderToken = 0;
function loadPage(pageId, tabId = null) {
  if (!State.user) return;
  if (!AKSES[State.user.role].includes(pageId)) pageId = AWAL[State.user.role];
  closeSidebar(); tandaiNav(pageId);
  if (pageId !== 'laporan' && Store.view !== 'ALL') Store.lihatSemester('ALL');
  State.halaman = pageId; State.tab = tabId;
  const container = $id('content-view'), my = ++renderToken;
  container.innerHTML = '<div class="text-center py-20"><i class="fas fa-circle-notch fa-spin text-4xl text-brand-light/50"></i></div>';
  const sc = $id('content-scroll'); if (sc) sc.scrollTop = 0;
  // 1 frame untuk menggambar spinner, lalu render (tanpa setTimeout 150 ms seperti versi lama)
  requestAnimationFrame(() => setTimeout(() => { if (my !== renderToken) return; aman(() => PAGES[pageId](tabId)); }, 0));
}
function rerender() {
  if (!State.user || !State.halaman) return;
  if (modalTerbuka()) { State.kotor = true; return; }
  const ae = document.activeElement; if (ae && $id('content-view').contains(ae) && /INPUT|TEXTAREA|SELECT/.test(ae.tagName) && ae.type !== 'checkbox') { State.kotor = true; return; }
  const sc = $id('content-scroll'), top = sc ? sc.scrollTop : 0;
  aman(() => PAGES[State.halaman](State.halaman === 'laporan' ? undefined : State.tab));
  if (sc) sc.scrollTop = top;
}

// ---------- Inisialisasi setelah login ----------
function initApp(user) {
  State.user = user;
  $id('login-page').classList.add('hidden'); $id('main-dashboard').classList.remove('hidden');
  $id('display-name').innerText = user.name || user.username; $id('display-role').innerText = user.role;
  const em = $id('display-email'); if (em) { em.textContent = user.email || ''; em.title = user.email || ''; }
  $id('user-avatar').innerText = (user.name || user.username || 'U').charAt(0).toUpperCase();
  renderMenu(); bottomNav(); branding();
  tutupLoader();
  loadPage(AWAL[user.role]);
}

// ---------- Login SSO Google ----------
// Alur: tombol → Gerbang SSO (Apps Script, Execute as: User accessing → Session.getActiveUser)
//       → kembali ke situs ini dengan #sso=<tiket> → API memverifikasi tiket + state → sesi aplikasi.
const KST = 'obe5_sso_state', KP = 'obe5_publik';
function pesanLogin(teks, jenis) {
  const m = $id('login-msg'), i = $id('login-info');
  m.classList.add('hidden'); i.classList.add('hidden');
  if (!teks) return;
  const el = jenis === 'info' ? i : m; el.textContent = teks; el.classList.remove('hidden');
}
function tombolLogin(teks, sibuk) {
  const b = $id('login-btn'); if (!b) return;
  b.disabled = !!sibuk; b.classList.toggle('opacity-70', !!sibuk); b.classList.toggle('cursor-wait', !!sibuk);
  $id('login-btn-text').textContent = teks || 'Masuk dengan Google';
}
function acakState() { const a = new Uint8Array(24); crypto.getRandomValues(a); return btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function simpanPublik(r) { LS.set(KP, { branding: r.branding, sso: r.sso || {}, at: Date.now() }); }
function urlGerbang() { return (window.APP_CONFIG && window.APP_CONFIG.SSO_URL) || ((LS.get(KP, null) || {}).sso || {}).url || ''; }

async function masukGoogle() {
  if (DEMO) return pesanLogin('Mode demo: login Google aktif setelah server diatur. Pilih peran di bawah untuk mencoba.', 'info');
  pesanLogin('');
  let url = urlGerbang();
  if (!url) {
    tombolLogin('Menghubungkan ke server...', true);
    const r = await api('publik', {}, { method: 'GET', timeout: 25000 });
    if (r.ok) simpanPublik(r);
    url = urlGerbang(); tombolLogin();
    if (!r.ok) return pesanLogin(r.pesan || 'Server belum dapat dihubungi.');
  }
  if (!url) return pesanLogin('Login Google belum diatur di server (GERBANG_URL kosong). Hubungi admin prodi.');
  const st = acakState(); LS.set(KST, { s: st, at: Date.now() });
  tombolLogin('Membuka halaman Google...', true);
  location.href = url + (url.includes('?') ? '&' : '?') + 'state=' + encodeURIComponent(st);
}

// Dipanggil saat boot bila alamat memuat #sso=<tiket> (kembali dari Gerbang)
async function prosesKembaliSso() {
  const m = /^#sso=([^&]+)/.exec(location.hash || ''); if (!m) return false;
  let tiket = ''; try { tiket = decodeURIComponent(m[1]); } catch (e) { }
  history.replaceState(null, '', location.pathname + location.search); // tiket tidak tertinggal di alamat/riwayat
  const st = LS.get(KST, null); LS.del(KST);
  tampilLogin();
  if (!st || !st.s || Date.now() - st.at > 15 * 60e3) { pesanLogin('Sesi login di browser ini tidak ditemukan atau kedaluwarsa. Klik Masuk dengan Google lagi.'); return true; }
  tombolLogin('Memeriksa akun Google...', true);
  const r = await api('ssoMasuk', { tiket, state: st.s }, { timeout: 45000 });
  await selesaikanMasuk(r);
  return true;
}

let loginJalan = false;
async function selesaikanMasuk(r) {
  if (r.ok && r.perluDaftar) { tombolLogin(); tampilDaftar(r); return; }
  if (!r.ok) { tombolLogin(); pesanLogin(r.pesan || 'Gagal masuk.', r.kode === 'MENUNGGU' ? 'info' : 'error'); return; }
  loginJalan = true;
  Sesi.set({ token: r.token, exp: r.exp, user: r.user });
  try {
    if (!DEMO) { tombolLogin('Menghubungkan database...', true); await Fire.tukar(r.fb); }
    tombolLogin('Memuat data...', true);
    await Store.muat(r.user, { cacheDulu: true });
  } catch (e) { console.error(e); Sesi.clear(); tombolLogin(); loginJalan = false; return pesanLogin(e.message); }
  Sync.mulai(r.user.username);
  tombolLogin(); pesanLogin(''); loginJalan = false;
  initApp(r.user);
}

// Pengajuan akses mandiri (DAFTAR_MANDIRI=true): email belum tertaut ke NIM/NIDN
let tiketDaftar = '';
function tampilDaftar(r) {
  tiketDaftar = r.tiketDaftar || '';
  $id('daftar-email').textContent = r.email || '';
  $id('daftar-form').classList.remove('hidden'); $id('login-help').classList.add('hidden');
  pesanLogin('Email ' + (r.email || '') + ' belum tertaut ke data prodi. Ajukan akses dengan NIM/NIDN Anda.', 'info');
  setTimeout(() => { const el = $id('daftar-username'); if (el) el.focus(); }, 200);
}
async function kirimDaftar() {
  const u = $id('daftar-username').value.trim(), n = $id('daftar-nama').value.trim(), btn = $id('daftar-btn');
  if (!u || !n) return pesanLogin('Isi NIM/NIDN dan nama lengkap.');
  btn.disabled = true; btn.textContent = 'Mengirim...';
  const r = await api('ssoDaftar', { tiketDaftar, peran: $id('daftar-peran').value, username: u, nama: n });
  btn.disabled = false; btn.textContent = 'Kirim Permintaan Akses';
  if (!r.ok) return pesanLogin(r.pesan);
  $id('daftar-form').classList.add('hidden'); $id('login-help').classList.remove('hidden'); tiketDaftar = '';
  $id('daftar-username').value = ''; $id('daftar-nama').value = '';
  pesanLogin(r.pesan, 'info');
}

// Mode demo (tanpa server): masuk sebagai akun contoh
async function masukDemo(username) {
  if (!DEMO || loginJalan) return;
  pesanLogin(''); tombolLogin('Memuat data...', true);
  await selesaikanMasuk(await api('demoMasuk', { username }));
}

async function logout() {
  if (Sync.sibuk()) {
    showToast('Menyimpan perubahan terakhir...');
    const ok = await Sync.kuras(20000);
    if (!ok) return showCustomDialog('tanya', 'Masih ada ' + Sync.ops.length + ' perubahan yang belum tersimpan ke server (koneksi bermasalah). Jika keluar sekarang, perubahan itu tetap disimpan di perangkat ini dan dikirim saat Anda login lagi dengan akun yang sama.', () => keluar(true), { judul: 'Belum tersimpan', ok: 'Tetap keluar' });
  }
  keluar(false);
}
async function keluar(simpanAntrean) {
  if (!simpanAntrean) Sync.reset(); else { clearTimeout(Sync.timer); Sync.kunci = ''; }
  await Store.lupakan(); Sesi.clear();
  State.user = null; State.halaman = null; State.mkNilai = null; State.laporanSel = 'ALL';
  const n = $id('obe-bnav'); if (n) n.remove();
  closeModal(true); tampilLogin();
  pesanLogin(DEMO ? '' : 'Anda sudah keluar dari aplikasi. Akun Google tetap masuk di browser ini — keluar juga dari Google bila memakai komputer bersama.', 'info');
}

// ---------- Aksi tabel (delegasi; tanpa onclick berisi data) ----------
document.addEventListener('click', e => {
  const b = e.target.closest('[data-aksi]'); if (!b || !$id('content-view').contains(b)) return;
  const a = b.dataset.aksi, t = b.dataset.type, id = b.dataset.id;
  if (a === 'edit') Admin.editMasterData(t, id);
  else if (a === 'hapus') Admin.deleteMasterData(t, id);
  else if (a === 'status') Admin.ubahStatusPengguna(t, id);
  else if (a === 'akses') Admin.prosesPermintaan(b.dataset.email, b.dataset.op, b.dataset.user);
  else if (a === 'nilai-edit') formNilai(id);
  else if (a === 'nilai-hapus') hapusNilai(id);
});

// ---------- Indikator sinkron & event data ----------
Bus.on('sync', s => {
  const ind = $id('sync-indicator'), tx = $id('sync-text'), ic = $id('sync-icon'); if (!ind) return;
  const tampil = s.n > 0 || s.jalan; ind.classList.toggle('hidden', !tampil);
  if (!tampil) return;
  if (s.status === 'offline' || s.status === 'gagal') { tx.innerText = (s.status === 'offline' ? 'Offline' : 'Menunggu koneksi') + ' · ' + s.n + ' perubahan tertunda'; ic.className = 'fas fa-cloud-arrow-up text-amber-500 text-sm'; }
  else { tx.innerText = 'Menyinkronkan ke Cloud...'; ic.className = 'fas fa-sync-alt fa-spin text-brand-light text-sm'; }
});
Bus.on('sync-gagal', m => showToast('Perubahan belum tersimpan: ' + (m || 'koneksi bermasalah') + '. Mencoba lagi otomatis.'));
Bus.on('ditolak', list => {
  showCustomDialog('alert', list.length + ' perubahan ditolak server dan dibatalkan:\n' + list.slice(0, 8).map(x => '• ' + (Array.isArray(x.k) ? x.k.filter(Boolean).join(' / ') : (x.k || x.t || '')) + ': ' + x.alasan).join('\n') + (list.length > 8 ? '\n...dan ' + (list.length - 8) + ' lainnya.' : ''));
  if (!DEMO) Store.segarkan(true).catch(console.error); // kembalikan tampilan ke data server yang sah
});
Bus.on('data-baru', () => { branding(); rerender(); });
Bus.on('sesi-habis', pesan => {
  if (!State.user) return;
  clearTimeout(Sync.timer); Sync.kunci = ''; // antrean tetap tersimpan untuk login berikutnya
  Sesi.clear(); State.user = null; State.halaman = null;
  const n = $id('obe-bnav'); if (n) n.remove(); closeModal(true);
  tampilLogin();
  showCustomDialog('alert', (pesan || 'Sesi berakhir.') + ' Perubahan yang belum terkirim akan dilanjutkan setelah Anda masuk kembali dengan akun yang sama.');
});
window.addEventListener('beforeunload', e => { if (Sync.sibuk()) { e.preventDefault(); e.returnValue = ''; } });
// Segarkan data saat kembali ke tab (≥ 60 detik sejak penyegaran terakhir) — hemat kuota baca
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !State.user || DEMO) return;
  if (Date.now() - Store.terakhir > 60000) Store.segarkan().catch(console.warn);
  if (Sync.ops.length) Sync.jadwal(200);
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeModal(); } });
document.addEventListener('click', e => { const d = e.target.closest && e.target.closest('[data-demo-user]'); if (d) masukDemo(d.dataset.demoUser); });

// ---------- Boot ----------
async function boot() {
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('./sw.js').catch(e => console.warn('SW:', e));
  branding(LS.get('obe4_brand', null));
  const pub = LS.get(KP, null);
  const ambilPublik = DEMO ? Promise.resolve(null) : api('publik', {}, { method: 'GET', timeout: 25000 }).then(r => { if (r.ok) { simpanPublik(r); if (!State.user) branding(r.branding); } return r; });
  if (/^#sso=/.test(location.hash || '')) { await prosesKembaliSso(); return; }
  if (Sesi.valid()) {
    try {
      loadingText('Memuat data tersimpan...');
      const u = Sesi.user();
      await Store.muat(u, { cacheDulu: true });
      Sync.mulai(u.username);
      initApp(u);
      if (!DEMO) api('sesi').then(r => { if (r.ok && r.user && State.user) { State.user = Object.assign({}, State.user, r.user); Sesi.patch({ user: State.user }); } });
      return;
    } catch (e) { console.error(e); Sesi.clear(); }
  }
  if (!pub && !DEMO) { loadingText('Menghubungkan ke server...'); const r = await ambilPublik; if (!r || !r.ok) loadingText('Server belum dapat dihubungi. Anda tetap dapat mencoba masuk.'); }
  tampilLogin();
}

// ---------- Ekspos untuk atribut onclick di HTML ----------
Object.assign(window, {
  loadPage, toggleSidebar, toggleSubmenu, masukGoogle, kirimDaftar, logout, closeModal,
  openMasterForm: (t, it) => Admin.openMasterForm(t, it),
  switchUserTab: id => Admin.switchUserTab(id), switchMasterTab: id => Admin.switchMasterTab(id),
  downloadTemplate, handleExcelUpload,
  App: { rerender, branding: () => branding(), db, Store, E, Sync, muatAkses: () => Admin.muatAkses(true) }
});
boot();
