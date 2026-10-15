// Kiểm thử quy tắc bảo mật Firestore (nhiều công ty).
// Chạy: cd tests && npm install && npx firebase-tools emulators:exec --only firestore --project demo-cthd "node firestore.rules.test.mjs"
// (GitHub Actions chạy tự động trước mỗi lần deploy.)
import { readFileSync } from 'node:fs';
import { test, after, before } from 'node:test';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, collectionGroup, query, where, writeBatch, serverTimestamp } from 'firebase/firestore';

const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-cthd',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'), host, port: Number(port) },
  });
  // Dữ liệu nền: quản trị hệ thống + công ty kiểu cũ (tạo tay trong Console, thiếu uid)
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'sysadmins', 'root'), { note: 'super' });
    await setDoc(doc(db, 'orgs', 'cong-ty-cu'), { name: 'Công ty cũ' });
    await setDoc(doc(db, 'orgs', 'cong-ty-cu', 'members', 'legacy'), { role: 'admin', email: 'legacy@x.vn' });
  });
});
after(async () => { await env?.cleanup(); });

const user = (uid, email, verified = true) => env.authenticatedContext(uid, { email, email_verified: verified }).firestore();
const alice = () => user('alice', 'alice@a.vn');
const bob = () => user('bob', 'bob@b.vn');
const fakeBob = () => user('mallory', 'bob@b.vn', false);   // dùng email của Bob nhưng chưa xác minh
const carol = () => user('carol', 'carol@c.vn');
const root = () => user('root', 'root@sys.vn');

async function createOrg(db, id, uid, extra = {}) {
  const b = writeBatch(db);
  b.set(doc(db, 'orgs', id), { name: 'Công ty ' + id, createdBy: uid, createdAt: serverTimestamp(), status: 'active', ownerEmail: uid + '@x', stats: { invoices: 0 }, ...extra });
  b.set(doc(db, 'orgs', id, 'members', uid), { uid, email: uid + '@x', role: 'admin' });
  return b.commit();
}

test('1. Tạo công ty và tự làm quản trị', async () => {
  await assertSucceeds(createOrg(alice(), 'cty-a', 'alice'));
  await assertSucceeds(createOrg(carol(), 'cty-c', 'carol'));
});

test('2. Không được tự đặt gói khi tạo công ty, không tạo hộ người khác', async () => {
  await assertFails(createOrg(alice(), 'cty-plan', 'alice', { plan: { maxInvoices: 999999 } }));
  const db = alice();
  const b = writeBatch(db);
  b.set(doc(db, 'orgs', 'cty-x'), { name: 'X', createdBy: 'bob', status: 'active' });
  b.set(doc(db, 'orgs', 'cty-x', 'members', 'alice'), { uid: 'alice', role: 'admin' });
  await assertFails(b.commit());
});

test('3. Người ngoài không đọc/ghi được công ty khác', async () => {
  await assertSucceeds(setDoc(doc(alice(), 'orgs/cty-a/invoices/1'), { id: 1, tong: 100 }));
  await assertFails(getDoc(doc(bob(), 'orgs/cty-a')));
  await assertFails(getDoc(doc(bob(), 'orgs/cty-a/invoices/1')));
  await assertFails(getDocs(collection(bob(), 'orgs/cty-a/members')));
  await assertFails(setDoc(doc(bob(), 'orgs/cty-a/invoices/2'), { id: 2 }));
  await assertFails(getDoc(doc(carol(), 'orgs/cty-a/invoices/1')));   // quản trị công ty khác cũng không
});

test('4. Không tự chèn mình làm quản trị vào công ty đã có', async () => {
  await assertFails(setDoc(doc(bob(), 'orgs/cty-a/members/bob'), { uid: 'bob', role: 'admin' }));
  await assertFails(setDoc(doc(bob(), 'orgs/cty-a/members/bob'), { uid: 'bob', role: 'ketoan' }));
});

test('5. Mời bằng email: chỉ người có email đã xác minh nhận được, đúng vai trò', async () => {
  await assertSucceeds(setDoc(doc(alice(), 'orgs/cty-a/invites/bob@b.vn'), { email: 'bob@b.vn', role: 'ketoan', orgName: 'A' }));
  await assertFails(setDoc(doc(bob(), 'orgs/cty-a/invites/bob@b.vn'), { email: 'bob@b.vn', role: 'admin' })); // tự sửa lời mời
  // Kẻ mạo danh (email chưa xác minh) không thấy và không nhận được
  await assertFails(getDocs(query(collectionGroup(fakeBob(), 'invites'), where('email', '==', 'bob@b.vn'))));
  await assertFails(setDoc(doc(fakeBob(), 'orgs/cty-a/members/mallory'), { uid: 'mallory', role: 'ketoan' }));
  // Bob thật thấy lời mời
  const snap = await assertSucceeds(getDocs(query(collectionGroup(bob(), 'invites'), where('email', '==', 'bob@b.vn'))));
  if (snap.size !== 1) throw new Error('Bob phải thấy 1 lời mời, thấy ' + snap.size);
  // Nhận sai vai trò → bị chặn; đúng vai trò → được
  await assertFails(setDoc(doc(bob(), 'orgs/cty-a/members/bob'), { uid: 'bob', role: 'admin' }));
  await assertSucceeds(setDoc(doc(bob(), 'orgs/cty-a/members/bob'), { uid: 'bob', role: 'ketoan' }));
  await assertSucceeds(deleteDoc(doc(bob(), 'orgs/cty-a/invites/bob@b.vn')));
});

test('6. Tìm công ty của tôi bằng collection group', async () => {
  const s = await assertSucceeds(getDocs(query(collectionGroup(bob(), 'members'), where('uid', '==', 'bob'))));
  if (s.size !== 1 || s.docs[0].ref.parent.parent.id !== 'cty-a') throw new Error('Bob phải thuộc đúng cty-a');
  await assertFails(getDocs(query(collectionGroup(bob(), 'members'), where('uid', '==', 'alice'))));
});

test('7. Kế toán ghi dữ liệu được, nhưng không quản lý thành viên hay đổi tên công ty', async () => {
  await assertSucceeds(setDoc(doc(bob(), 'orgs/cty-a/invoices/3'), { id: 3 }));
  await assertSucceeds(getDoc(doc(bob(), 'orgs/cty-a/invoices/1')));
  await assertFails(setDoc(doc(bob(), 'orgs/cty-a/members/zed'), { uid: 'zed', role: 'xem' }));
  await assertFails(updateDoc(doc(bob(), 'orgs/cty-a'), { name: 'Đổi tên' }));
  await assertFails(updateDoc(doc(bob(), 'orgs/cty-a/members/bob'), { role: 'admin' }));
  await assertFails(setDoc(doc(bob(), 'orgs/cty-a/invites/eve@e.vn'), { email: 'eve@e.vn', role: 'admin' }));
});

test('8. Quản trị công ty: đổi vai trò, đổi tên; không tự nâng gói hay mở khóa', async () => {
  await assertSucceeds(updateDoc(doc(alice(), 'orgs/cty-a/members/bob'), { role: 'xem' }));
  await assertFails(setDoc(doc(bob(), 'orgs/cty-a/invoices/4'), { id: 4 }));   // giờ chỉ xem
  await assertSucceeds(updateDoc(doc(alice(), 'orgs/cty-a'), { name: 'Công ty A mới' }));
  await assertFails(updateDoc(doc(alice(), 'orgs/cty-a'), { plan: { maxInvoices: 999999 } }));
  await assertFails(updateDoc(doc(alice(), 'orgs/cty-a'), { status: 'locked' }));   // tự đổi trạng thái
  await assertFails(deleteDoc(doc(alice(), 'orgs/cty-a/members/alice')));      // không tự xóa mình
});

test('9. Quản trị hệ thống: xem danh sách, khóa/mở, đặt gói; không xem dữ liệu nghiệp vụ', async () => {
  const s = await assertSucceeds(getDocs(collection(root(), 'orgs')));
  if (s.size < 3) throw new Error('Phải thấy tất cả công ty');
  await assertSucceeds(updateDoc(doc(root(), 'orgs/cty-c'), { plan: { maxInvoices: 20000, aiDaily: 100 } }));
  await assertSucceeds(updateDoc(doc(root(), 'orgs/cty-c'), { status: 'locked', note: 'test' }));
  await assertFails(getDoc(doc(root(), 'orgs/cty-a/invoices/1')));
  await assertFails(updateDoc(doc(root(), 'orgs/cty-c'), { name: 'Đổi tên hộ' }));
  await assertFails(getDocs(collection(alice(), 'orgs')));   // người thường không liệt kê được
});

test('10. Công ty bị khóa: thành viên chỉ còn đọc', async () => {
  await assertSucceeds(getDoc(doc(carol(), 'orgs/cty-c')));
  await assertFails(setDoc(doc(carol(), 'orgs/cty-c/invoices/1'), { id: 1 }));
});

test('11. Công ty kiểu cũ: quản trị bổ sung uid cho chính mình', async () => {
  const legacy = user('legacy', 'legacy@x.vn');
  await assertSucceeds(getDoc(doc(legacy, 'orgs/cong-ty-cu/members/legacy')));
  await assertSucceeds(updateDoc(doc(legacy, 'orgs/cong-ty-cu/members/legacy'), { uid: 'legacy', email: 'legacy@x.vn' }));
  await assertSucceeds(setDoc(doc(legacy, 'orgs/cong-ty-cu/invoices/1'), { id: 1 }));
});

test('12. Lượt dùng AI: không ai ghi tay được', async () => {
  await assertFails(setDoc(doc(alice(), 'orgs/cty-a/usage/x'), { count: 0 }));
});
