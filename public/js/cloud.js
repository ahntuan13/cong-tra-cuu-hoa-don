// =====================================================================
//  Lớp kết nối Firebase: đăng nhập, chọn công ty, phân quyền, lưu/đọc Firestore, gọi AI.
//  app.js chỉ dùng window.Cloud, không gọi Firebase trực tiếp.
//
//  Nhiều công ty dùng chung một app. Cấu trúc dữ liệu (xem thêm firestore.rules):
//    orgs/{orgId}                   công ty: { name, createdBy, status, plan, ownerEmail, stats }
//    orgs/{orgId}/members/{uid}     { uid, email, role: "admin" | "ketoan" | "xem" }
//    orgs/{orgId}/invites/{email}   lời mời theo email
//    orgs/{orgId}/meta/settings     { seq, bravoSeq, ncc, rules, checked, company, accounts, emps, ... }
//    orgs/{orgId}/invoices/{id}     một hóa đơn (kèm dòng hàng)
//    orgs/{orgId}/payroll/m{tháng}  { m, rows: [...] }
//    sysadmins/{uid}                quản trị hệ thống
// =====================================================================
import { firebaseConfig, legacyOrgId, functionsRegion, defaultPlan } from './firebase-config.js';

const SDK = 'https://www.gstatic.com/firebasejs/12.19.0/';
const enabled = !!firebaseConfig?.apiKey && !firebaseConfig.apiKey.startsWith('DIEN_');
const Cloud = { enabled, user: null, role: null, orgId: null, org: null, orgs: [], isSuper: false, plan: { ...defaultPlan } };
window.Cloud = Cloud;

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clean = o => JSON.parse(JSON.stringify(o)); // Firestore không nhận undefined
const LAST_ORG = 'cthd-last-org';

if (!enabled) {
  $('#login').hidden = true;
  window.startApp();
} else {
  boot().catch(err => { console.error(err); showMsg('Không kết nối được Firebase: ' + err.message, true); });
}

/* Hiện đúng một khung trong màn hình đăng nhập */
function show(id) { ['login-box', 'verify', 'orgpick', 'locked'].forEach(k => { const el = document.getElementById(k); if (el) el.hidden = k !== id; }); $('#login').hidden = false; }

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
  const { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, collectionGroup, query, where, writeBatch, serverTimestamp } = fsM;
  const org = (...p) => [db, 'orgs', Cloud.orgId, ...p];

  /* ---------- Đăng nhập ---------- */
  $('#login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const email = $('#lg-email').value.trim(), pass = $('#lg-pass').value;
    const mode = e.submitter?.dataset.mode || 'in';
    try {
      showMsg('Đang xử lý…');
      if (mode === 'up') {
        const cred = await authM.createUserWithEmailAndPassword(auth, email, pass);
        await authM.sendEmailVerification(cred.user).catch(() => {});
      } else await authM.signInWithEmailAndPassword(auth, email, pass);
    } catch (err) { showMsg(authError(err.code), true); }
  });
  $('#lg-google').addEventListener('click', async () => {
    try { await authM.signInWithPopup(auth, new authM.GoogleAuthProvider()); }
    catch (err) { showMsg(authError(err.code), true); }
  });
  $('#lg-reset').addEventListener('click', async e => {
    e.preventDefault();
    const email = $('#lg-email').value.trim();
    if (!email) { showMsg('Nhập email trước, rồi bấm "Quên mật khẩu".', true); return; }
    try { await authM.sendPasswordResetEmail(auth, email); showMsg('Đã gửi email đặt lại mật khẩu.'); }
    catch (err) { showMsg(authError(err.code), true); }
  });

  Cloud.signOut = async () => { try { localStorage.removeItem(LAST_ORG); } catch (e) {} await authM.signOut(auth); location.reload(); };
  Cloud.switchOrg = () => { try { localStorage.removeItem(LAST_ORG); } catch (e) {} location.reload(); };
  document.querySelectorAll('[data-cloud="out"]').forEach(b => b.addEventListener('click', () => Cloud.signOut()));

  /* ---------- Xác minh email (bắt buộc với tài khoản email/mật khẩu để nhận lời mời) ---------- */
  $('#vf-resend').addEventListener('click', async () => {
    try { await authM.sendEmailVerification(auth.currentUser); toast2('Đã gửi lại email xác minh.'); } catch (err) { toast2(authError(err.code)); }
  });
  $('#vf-done').addEventListener('click', async () => {
    await auth.currentUser.reload(); await auth.currentUser.getIdToken(true);
    if (auth.currentUser.emailVerified) afterLogin(auth.currentUser); else toast2('Email chưa được xác minh. Mở hộp thư và bấm vào liên kết trước.');
  });
  $('#vf-skip').addEventListener('click', () => afterLogin(auth.currentUser, true));

  authM.onAuthStateChanged(auth, user => {
    if (!user) { show('login-box'); showMsg(''); return; }
    afterLogin(user);
  });

  let started = false;
  async function afterLogin(user, skipVerify = false) {
    Cloud.user = user;
    if (!user.emailVerified && !skipVerify) { $('#vf-email').textContent = user.email || ''; show('verify'); return; }
    Cloud.isSuper = (await getDoc(doc(db, 'sysadmins', user.uid)).catch(() => null))?.exists() || false;
    await loadOrgs();
    let last = null; try { last = localStorage.getItem(LAST_ORG); } catch (e) {}
    const pick = Cloud.orgs.find(o => o.id === last) || (Cloud.orgs.length === 1 && !Cloud.invites.length ? Cloud.orgs[0] : null);
    if (pick) return openOrg(pick.id);
    renderPicker();
  }

  /* ---------- Tìm công ty của tôi + lời mời ---------- */
  async function loadOrgs() {
    const uid = Cloud.user.uid;
    // Dữ liệu cũ (trước khi có nhiều công ty): bổ sung trường uid cho bản ghi thành viên
    if (legacyOrgId) {
      const m = await getDoc(doc(db, 'orgs', legacyOrgId, 'members', uid)).catch(() => null);
      if (m?.exists() && !m.data().uid) await updateDoc(m.ref, { uid, email: m.data().email || Cloud.user.email || '' }).catch(e => console.warn('migrate', e));
    }
    const ms = await getDocs(query(collectionGroup(db, 'members'), where('uid', '==', uid))).catch(e => { console.warn(e); return { docs: [] }; });
    Cloud.orgs = (await Promise.all(ms.docs.map(async d => {
      const id = d.ref.parent.parent.id;
      const o = await getDoc(doc(db, 'orgs', id)).catch(() => null);
      return { id, role: d.data().role, name: o?.data()?.name || id, status: o?.data()?.status || 'active' };
    }))).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    Cloud.invites = [];
    if (Cloud.user.emailVerified && Cloud.user.email) {
      const iv = await getDocs(query(collectionGroup(db, 'invites'), where('email', '==', Cloud.user.email.toLowerCase()))).catch(e => { console.warn(e); return { docs: [] }; });
      Cloud.invites = iv.docs.map(d => ({ orgId: d.ref.parent.parent.id, ...d.data() })).filter(i => !Cloud.orgs.some(o => o.id === i.orgId));
    }
  }

  function renderPicker() {
    show('orgpick');
    $('#op-email').textContent = Cloud.user.email || Cloud.user.uid;
    const R = { admin: 'Quản trị', ketoan: 'Kế toán', xem: 'Chỉ xem' };
    $('#op-list').innerHTML = Cloud.orgs.length
      ? Cloud.orgs.map(o => `<button class="org-item" data-org="${esc(o.id)}"><b>${esc(o.name)}</b><span class="sub">${R[o.role] || o.role}${o.status === 'locked' ? ' · <span style="color:var(--bad)">đang bị khóa</span>' : ''}</span></button>`).join('')
      : '<p class="sub" style="margin:0">Bạn chưa thuộc công ty nào.</p>';
    $('#op-invites').innerHTML = Cloud.invites.map(i => `<div class="org-item"><span><b>${esc(i.orgName || i.orgId)}</b><span class="sub">Mời bạn làm ${R[i.role] || i.role}</span></span><button class="btn sm primary" data-accept="${esc(i.orgId)}">Nhận lời mời</button></div>`).join('');
    $('#op-invites-wrap').hidden = !Cloud.invites.length;
    $('#op-unverified').hidden = !!Cloud.user.emailVerified;
    $('#op-uid').textContent = Cloud.user.uid;
  }
  $('#orgpick').addEventListener('click', async e => {
    const o = e.target.closest('[data-org]'); if (o) return openOrg(o.dataset.org);
    const a = e.target.closest('[data-accept]');
    if (a) {
      a.disabled = true;
      try { await acceptInvite(a.dataset.accept); await openOrg(a.dataset.accept); }
      catch (err) { console.error(err); toast2('Không nhận được lời mời: ' + (err.code || err.message)); a.disabled = false; }
    }
  });
  async function acceptInvite(orgId) {
    const inv = Cloud.invites.find(i => i.orgId === orgId);
    const email = Cloud.user.email.toLowerCase();
    await setDoc(doc(db, 'orgs', orgId, 'members', Cloud.user.uid), { uid: Cloud.user.uid, email, role: inv.role, addedAt: serverTimestamp() });
    await deleteDoc(doc(db, 'orgs', orgId, 'invites', email)).catch(() => {});
  }

  /* ---------- Tạo công ty mới ---------- */
  $('#op-create').addEventListener('submit', async e => {
    e.preventDefault();
    const name = $('#op-name').value.trim(); if (!name) return;
    const btn = e.submitter; btn.disabled = true;
    const id = slug(name) + '-' + Math.random().toString(36).slice(2, 6);
    try {
      const b = writeBatch(db);
      b.set(doc(db, 'orgs', id), { name, createdBy: Cloud.user.uid, createdAt: serverTimestamp(), status: 'active', ownerEmail: Cloud.user.email || '', stats: { invoices: 0 } });
      b.set(doc(db, 'orgs', id, 'members', Cloud.user.uid), { uid: Cloud.user.uid, email: (Cloud.user.email || '').toLowerCase(), role: 'admin', addedAt: serverTimestamp() });
      await b.commit();
      Cloud.newOrgName = name;
      await openOrg(id);
    } catch (err) { console.error(err); toast2('Không tạo được công ty: ' + (err.code || err.message)); btn.disabled = false; }
  });

  /* ---------- Mở một công ty ---------- */
  async function openOrg(id) {
    const m = await getDoc(doc(db, 'orgs', id, 'members', Cloud.user.uid)).catch(() => null);
    if (!m?.exists()) { try { localStorage.removeItem(LAST_ORG); } catch (e) {} await loadOrgs(); return renderPicker(); }
    const o = await getDoc(doc(db, 'orgs', id));
    Cloud.orgId = id; Cloud.role = m.data().role || 'ketoan';
    Cloud.org = { id, ...(o.data() || {}) };
    Cloud.plan = { ...defaultPlan, ...(Cloud.org.plan || {}) };
    if (Cloud.org.status === 'locked') { $('#lk-name').textContent = Cloud.org.name || id; $('#lk-note').textContent = Cloud.org.note || ''; show('locked'); return; }
    try { localStorage.setItem(LAST_ORG, id); } catch (e) {}
    $('#login').hidden = true;
    if (!started) { started = true; await window.startApp(); }
  }
  $('#lk-switch').addEventListener('click', () => { try { localStorage.removeItem(LAST_ORG); } catch (e) {} renderPicker(); });

  /* ---------- Đọc toàn bộ dữ liệu của công ty ---------- */
  let last = { settings: '', inv: new Map(), pay: new Map(), count: -1 };
  Cloud.loadState = async () => {
    const [st, invs, pays] = await Promise.all([
      getDoc(doc(...org('meta', 'settings'))),
      getDocs(collection(...org('invoices'))),
      getDocs(collection(...org('payroll'))),
    ]);
    if (!st.exists()) return null;
    const S = st.data();
    S.invoices = invs.docs.map(d => d.data()).sort((a, b) => (b.ngay || '').localeCompare(a.ngay || '') || b.id - a.id);
    S.hist = pays.docs.flatMap(d => d.data().rows || []);
    snapshot(S);
    return S;
  };

  /* ---------- Lưu: chỉ ghi phần thay đổi, gom theo lô ---------- */
  const settingsOf = S => clean({ seq: S.seq, bravoSeq: S.bravoSeq, ncc: S.ncc, rules: S.rules, checked: S.checked,
    company: S.company, congChuan: S.congChuan, capBH: S.capBH, emps: S.emps, accounts: S.accounts, curAcct: S.curAcct });
  const payByMonth = S => { const g = new Map(); (S.hist || []).forEach(h => { if (!g.has(h.m)) g.set(h.m, []); g.get(h.m).push(h); }); return g; };
  function snapshot(S) {
    last.settings = JSON.stringify(settingsOf(S));
    last.inv = new Map(S.invoices.map(i => [String(i.id), JSON.stringify(i)]));
    last.pay = new Map([...payByMonth(S)].map(([m, rows]) => ['m' + m, JSON.stringify(rows)]));
  }
  let timer = null, pending = null, saving = false;
  Cloud.save = (S, now = false) => {
    if (Cloud.role === 'xem' || !Cloud.orgId) return;
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
      // Cập nhật số hóa đơn của công ty (để quản trị hệ thống theo dõi mức dùng)
      if (Cloud.role === 'admin' && S.invoices.length !== last.count) {
        last.count = S.invoices.length;
        updateDoc(doc(db, 'orgs', Cloud.orgId), { stats: { invoices: S.invoices.length, updatedAt: new Date().toISOString() } }).catch(() => {});
      }
      setSync(ops.length ? 'Đã lưu' : '');
    } catch (err) {
      console.error(err);
      window.toast?.(err.code === 'permission-denied' ? 'Không có quyền ghi dữ liệu (vai trò chỉ xem, hoặc công ty đang bị khóa).' : 'Chưa lưu được lên máy chủ, sẽ thử lại.');
      if (err.code !== 'permission-denied') { pending = pending || S; timer = setTimeout(flush, 5000); }
    } finally { saving = false; }
  }
  window.addEventListener('beforeunload', e => { if (pending || saving) { e.preventDefault(); e.returnValue = ''; } });

  /* ---------- Thành viên & lời mời (quản trị công ty) ---------- */
  Cloud.listMembers = async () => (await getDocs(collection(...org('members')))).docs.map(d => ({ uid: d.id, ...d.data() }));
  Cloud.addMember = (uid, email, role) => setDoc(doc(...org('members', uid)), { uid, email: (email || '').toLowerCase(), role, addedAt: serverTimestamp() });
  Cloud.setRole = (uid, role) => updateDoc(doc(...org('members', uid)), { role });
  Cloud.removeMember = uid => deleteDoc(doc(...org('members', uid)));
  Cloud.listInvites = async () => (await getDocs(collection(...org('invites')))).docs.map(d => d.data());
  Cloud.invite = (email, role) => {
    const e = email.trim().toLowerCase();
    return setDoc(doc(...org('invites', e)), { email: e, role, orgName: Cloud.org?.name || '', invitedBy: Cloud.user.email || Cloud.user.uid, createdAt: serverTimestamp() });
  };
  Cloud.cancelInvite = email => deleteDoc(doc(...org('invites', email)));
  Cloud.renameOrg = async name => { await updateDoc(doc(db, 'orgs', Cloud.orgId), { name }); Cloud.org.name = name; };

  /* ---------- Quản trị hệ thống ---------- */
  Cloud.listAllOrgs = async () => (await getDocs(collection(db, 'orgs'))).docs.map(d => ({ id: d.id, ...d.data() }));
  Cloud.setOrgStatus = (id, status, note = '') => updateDoc(doc(db, 'orgs', id), { status, note });
  Cloud.setOrgPlan = (id, plan) => updateDoc(doc(db, 'orgs', id), { plan });

  /* ---------- AI đọc chứng từ (Cloud Function docAi) ---------- */
  const docAi = fnM.httpsCallable(fns, 'docAi', { timeout: 150000 });
  Cloud.aiRead = async images => {
    const payload = await Promise.all(images.map(toJpegBase64));
    try { return (await docAi({ orgId: Cloud.orgId, images: payload })).data; }
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

const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'cong-ty';
function toast2(m) { (window.toast || alert)(m); }
function showMsg(m, bad = false) { const el = $('#lg-msg'); if (!el) return; el.textContent = m; el.className = 'lg-msg' + (bad ? ' bad' : ''); }
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
  })[code] || ('Lỗi: ' + code);
}
