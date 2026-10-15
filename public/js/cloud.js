// =====================================================================
//  Lớp kết nối Firebase: đăng nhập, phân quyền thành viên, lưu/đọc Firestore, gọi AI.
//  app.js chỉ dùng window.Cloud, không gọi Firebase trực tiếp.
//
//  Cấu trúc dữ liệu Firestore:
//    orgs/{orgId}/members/{uid}     { email, role: "admin" | "ketoan" | "xem", addedAt }
//    orgs/{orgId}/meta/settings     { seq, bravoSeq, ncc, rules, checked, company, congChuan, capBH, emps }
//    orgs/{orgId}/invoices/{id}     một hóa đơn (kèm dòng hàng)
//    orgs/{orgId}/payroll/m{tháng}  { m, rows: [...] }   lương đã chốt theo tháng
//    orgs/{orgId}/usage/{ngày_uid}  { count }             đếm lượt đọc AI (Cloud Function ghi)
// =====================================================================
import { firebaseConfig, orgId, functionsRegion } from './firebase-config.js';

const SDK = 'https://www.gstatic.com/firebasejs/12.19.0/';
const enabled = !!firebaseConfig?.apiKey && !firebaseConfig.apiKey.startsWith('DIEN_');
const Cloud = { enabled, user: null, role: null, orgId };
window.Cloud = Cloud;

const $ = s => document.querySelector(s);
const clean = o => JSON.parse(JSON.stringify(o)); // Firestore không nhận undefined

if (!enabled) {
  // Chế độ thử: không có Firebase
  $('#login').hidden = true;
  window.startApp();
} else {
  boot().catch(err => {
    console.error(err);
    showLoginMsg('Không kết nối được Firebase: ' + err.message, true);
  });
}

async function boot() {
  const [appM, authM, fsM, fnM] = await Promise.all([
    import(SDK + 'firebase-app.js'),
    import(SDK + 'firebase-auth.js'),
    import(SDK + 'firebase-firestore.js'),
    import(SDK + 'firebase-functions.js'),
  ]);
  const app = appM.initializeApp(firebaseConfig);
  const auth = authM.getAuth(app);
  const db = fsM.getFirestore(app);
  const fns = fnM.getFunctions(app, functionsRegion);
  const { doc, getDoc, getDocs, setDoc, deleteDoc, collection, writeBatch, serverTimestamp } = fsM;
  const org = (...p) => [db, 'orgs', orgId, ...p];

  /* ---------- Đăng nhập ---------- */
  const form = $('#login-form');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const email = $('#lg-email').value.trim(), pass = $('#lg-pass').value;
    const mode = e.submitter?.dataset.mode || 'in';
    try {
      showLoginMsg('Đang xử lý…');
      if (mode === 'up') await authM.createUserWithEmailAndPassword(auth, email, pass);
      else await authM.signInWithEmailAndPassword(auth, email, pass);
    } catch (err) { showLoginMsg(authError(err.code), true); }
  });
  $('#lg-google').addEventListener('click', async () => {
    try { await authM.signInWithPopup(auth, new authM.GoogleAuthProvider()); }
    catch (err) { showLoginMsg(authError(err.code), true); }
  });
  $('#lg-reset').addEventListener('click', async e => {
    e.preventDefault();
    const email = $('#lg-email').value.trim();
    if (!email) { showLoginMsg('Nhập email trước, rồi bấm "Quên mật khẩu".', true); return; }
    try { await authM.sendPasswordResetEmail(auth, email); showLoginMsg('Đã gửi email đặt lại mật khẩu.'); }
    catch (err) { showLoginMsg(authError(err.code), true); }
  });

  Cloud.signOut = async () => { await authM.signOut(auth); location.reload(); };

  let started = false;
  authM.onAuthStateChanged(auth, async user => {
    if (!user) { $('#login').hidden = false; $('#login-box').hidden = false; $('#pending').hidden = true; showLoginMsg(''); return; }
    Cloud.user = user;
    // Kiểm tra quyền thành viên
    const m = await getDoc(doc(...org('members', user.uid))).catch(() => null);
    if (!m?.exists()) {
      $('#login-box').hidden = true; $('#pending').hidden = false;
      $('#pd-uid').textContent = user.uid; $('#pd-email').textContent = user.email || '';
      return;
    }
    Cloud.role = m.data().role || 'ketoan';
    $('#login').hidden = true;
    if (!started) { started = true; await window.startApp(); }
  });
  $('#pd-out').addEventListener('click', () => Cloud.signOut());
  $('#pd-copy').addEventListener('click', () => {
    navigator.clipboard?.writeText(Cloud.user.uid).then(() => window.toast?.('Đã sao chép UID'));
  });

  /* ---------- Đọc toàn bộ dữ liệu ---------- */
  let last = { settings: '', inv: new Map(), pay: new Map() };
  Cloud.loadState = async () => {
    const [st, invs, pays] = await Promise.all([
      getDoc(doc(...org('meta', 'settings'))),
      getDocs(collection(...org('invoices'))),
      getDocs(collection(...org('payroll'))),
    ]);
    if (!st.exists()) return null;
    const S = st.data();
    S.invoices = invs.docs.map(d => d.data())
      .sort((a, b) => (b.ngay || '').localeCompare(a.ngay || '') || b.id - a.id);
    S.hist = pays.docs.flatMap(d => d.data().rows || []);
    snapshot(S);
    return S;
  };

  /* ---------- Lưu: chỉ ghi phần thay đổi, gom theo lô ---------- */
  const settingsOf = S => clean({ seq: S.seq, bravoSeq: S.bravoSeq, ncc: S.ncc, rules: S.rules, checked: S.checked,
    company: S.company, congChuan: S.congChuan, capBH: S.capBH, emps: S.emps });
  const payByMonth = S => { const g = new Map(); (S.hist || []).forEach(h => { if (!g.has(h.m)) g.set(h.m, []); g.get(h.m).push(h); }); return g; };
  function snapshot(S) {
    last.settings = JSON.stringify(settingsOf(S));
    last.inv = new Map(S.invoices.map(i => [String(i.id), JSON.stringify(i)]));
    last.pay = new Map([...payByMonth(S)].map(([m, rows]) => ['m' + m, JSON.stringify(rows)]));
  }
  let timer = null, pending = null, saving = false;
  Cloud.save = (S, now = false) => {
    if (Cloud.role === 'xem') return;
    pending = S; clearTimeout(timer);
    timer = setTimeout(flush, now ? 0 : 800);
  };
  async function flush() {
    if (saving) { timer = setTimeout(flush, 500); return; }
    const S = pending; if (!S) return; pending = null; saving = true;
    const ops = [];
    const st = settingsOf(S), stJ = JSON.stringify(st);
    if (stJ !== last.settings) ops.push(['set', org('meta', 'settings'), st, () => last.settings = stJ]);
    const cur = new Map();
    S.invoices.forEach(i => {
      const id = String(i.id), j = JSON.stringify(i); cur.set(id, j);
      if (last.inv.get(id) !== j) ops.push(['set', org('invoices', id), clean(i), () => last.inv.set(id, j)]);
    });
    [...last.inv.keys()].filter(id => !cur.has(id)).forEach(id => ops.push(['del', org('invoices', id), null, () => last.inv.delete(id)]));
    const pm = new Map([...payByMonth(S)].map(([m, rows]) => ['m' + m, rows]));
    pm.forEach((rows, k) => { const j = JSON.stringify(rows); if (last.pay.get(k) !== j) ops.push(['set', org('payroll', k), clean({ m: rows[0].m, rows }), () => last.pay.set(k, j)]); });
    [...last.pay.keys()].filter(k => !pm.has(k)).forEach(k => ops.push(['del', org('payroll', k), null, () => last.pay.delete(k)]));
    try {
      for (let i = 0; i < ops.length; i += 400) {
        const b = writeBatch(db);
        ops.slice(i, i + 400).forEach(([t, p, data]) => t === 'set' ? b.set(doc(...p), data) : b.delete(doc(...p)));
        await b.commit();
        ops.slice(i, i + 400).forEach(o => o[3]());
      }
      setSync(ops.length ? 'Đã lưu' : '');
    } catch (err) {
      console.error(err);
      window.toast?.(err.code === 'permission-denied' ? 'Tài khoản không có quyền ghi dữ liệu.' : 'Chưa lưu được lên máy chủ, sẽ thử lại.');
      pending = pending || S; timer = setTimeout(flush, 5000);
    } finally { saving = false; }
  }
  window.addEventListener('beforeunload', e => { if (pending || saving) { e.preventDefault(); e.returnValue = ''; } });

  /* ---------- Thành viên ---------- */
  Cloud.listMembers = async () => (await getDocs(collection(...org('members')))).docs.map(d => ({ uid: d.id, ...d.data() }));
  Cloud.addMember = (uid, email, role) => setDoc(doc(...org('members', uid)), { email, role, addedAt: serverTimestamp() });
  Cloud.removeMember = uid => deleteDoc(doc(...org('members', uid)));

  /* ---------- AI đọc chứng từ (Cloud Function docAi) ---------- */
  const docAi = fnM.httpsCallable(fns, 'docAi', { timeout: 150000 });
  Cloud.aiRead = async images => {
    const payload = await Promise.all(images.map(toJpegBase64));
    try { return (await docAi({ orgId, images: payload })).data; }
    catch (err) { throw { code: err.message === 'invalid_json' ? 'invalid_json' : err.code, message: err.message }; }
  };
}

/* Thu nhỏ ảnh (cạnh dài tối đa 2000px) và chuyển sang JPEG base64 để gửi lên server */
async function toJpegBase64(blob) {
  const bmp = await createImageBitmap(blob);
  const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  return { mediaType: 'image/jpeg', data: c.toDataURL('image/jpeg', 0.88).split(',')[1] };
}

function showLoginMsg(m, bad = false) { const el = $('#lg-msg'); if (!el) return; el.textContent = m; el.className = 'lg-msg' + (bad ? ' bad' : ''); }
function setSync(t) { const el = document.getElementById('sync-st'); if (el) { el.textContent = t; if (t) setTimeout(() => { if (el.textContent === t) el.textContent = ''; }, 2000); } }
function authError(code) {
  return ({
    'auth/invalid-credential': 'Email hoặc mật khẩu không đúng.',
    'auth/invalid-email': 'Email không hợp lệ.',
    'auth/email-already-in-use': 'Email này đã có tài khoản, hãy đăng nhập.',
    'auth/weak-password': 'Mật khẩu cần ít nhất 6 ký tự.',
    'auth/popup-closed-by-user': 'Bạn đã đóng cửa sổ đăng nhập Google.',
    'auth/unauthorized-domain': 'Tên miền này chưa được thêm vào Authentication → Settings → Authorized domains.',
    'auth/operation-not-allowed': 'Phương thức đăng nhập này chưa được bật trong Firebase Authentication.',
    'auth/too-many-requests': 'Thử quá nhiều lần, vui lòng đợi ít phút.',
  })[code] || ('Lỗi đăng nhập: ' + code);
}
