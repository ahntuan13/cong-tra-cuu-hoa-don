/**
 * Cloud Functions — Cổng tra cứu hóa đơn
 *
 * docAi: nhận ảnh chứng từ (hóa đơn, bảng kê) từ app, gọi Claude API để đọc,
 *        trả về JSON { loai, hoaDon, bang }.
 *   - Chỉ thành viên của công ty (orgs/{orgId}/members/{uid}) mới gọi được.
 *   - Giới hạn số lượt đọc mỗi người mỗi ngày: plan.aiDaily của công ty, mặc định AI_DAILY_LIMIT.
 *   - Công ty bị khóa (status = locked) không gọi được.
 *   - Khóa API nằm trong Secret Manager (ANTHROPIC_API_KEY), không bao giờ gửi về trình duyệt.
 */
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret, defineString, defineInt } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const Anthropic = require('@anthropic-ai/sdk');

initializeApp();

const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');
const AI_MODEL = defineString('AI_MODEL', { default: 'claude-sonnet-5-5' });
const AI_DAILY_LIMIT = defineInt('AI_DAILY_LIMIT', { default: 100 });

const MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_IMAGES = 4;
const MAX_B64 = 5 * 1024 * 1024; // ~3,7 MB mỗi ảnh sau giải mã

const PROMPT = `Bạn nhận ảnh chụp hoặc ảnh scan một chứng từ tiếng Việt (thường là hóa đơn GTGT, có thể là bảng kê/bảng tính).
Trích dữ liệu chính xác như trên ảnh, không bịa. Số tiền trả về dạng số nguyên (bỏ dấu chấm phân cách nghìn). Ngày dạng YYYY-MM-DD.
Chỉ trả về một đối tượng JSON đúng cấu trúc sau, không thêm chữ nào khác:
{"loai":"hoa_don" hoặc "bang",
 "hoaDon": null hoặc {"kyhieu":"","so":"","ngay":"","mstBan":"","tenBan":"","httt":"TM" hoặc "CK","tienTruocThue":0,"tienThue":0,"tongCong":0,
   "dong":[{"ten":"","dvt":"","sl":0,"dg":0,"tt":0,"ts":10}]},
 "bang":{"cot":["tên cột",...],"dong":[["giá trị",...],...]}}
"bang" luôn có: nếu là hóa đơn thì bảng là danh sách dòng hàng (STT, Tên hàng, ĐVT, Số lượng, Đơn giá, Thành tiền, Thuế suất).`;

exports.docAi = onCall(
  { region: 'asia-southeast1', secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 120, memory: '512MiB', maxInstances: 5 },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Cần đăng nhập.');
    const { orgId, images } = req.data || {};
    if (typeof orgId !== 'string' || !/^[a-z0-9-]{2,60}$/.test(orgId)) throw new HttpsError('invalid-argument', 'orgId không hợp lệ.');
    if (!Array.isArray(images) || images.length < 1 || images.length > MAX_IMAGES) throw new HttpsError('invalid-argument', `Gửi từ 1 đến ${MAX_IMAGES} ảnh.`);
    for (const im of images) {
      if (!MEDIA_TYPES.includes(im?.mediaType) || typeof im?.data !== 'string' || im.data.length > MAX_B64)
        throw new HttpsError('invalid-argument', 'Ảnh không hợp lệ hoặc quá lớn.');
    }

    const db = getFirestore();
    const uid = req.auth.uid;
    const [member, org] = await Promise.all([db.doc(`orgs/${orgId}/members/${uid}`).get(), db.doc(`orgs/${orgId}`).get()]);
    if (!member.exists) throw new HttpsError('permission-denied', 'Tài khoản chưa được cấp quyền.');
    if (org.exists && org.data().status === 'locked') throw new HttpsError('permission-denied', 'Công ty đang bị khóa.');
    // Giới hạn lượt đọc mỗi ngày: theo gói của công ty (plan.aiDaily), mặc định AI_DAILY_LIMIT
    const dailyLimit = Number(org.exists && org.data().plan?.aiDaily) || AI_DAILY_LIMIT.value();

    // Đếm lượt dùng trong ngày (giờ Việt Nam)
    const day = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
    const usageRef = db.doc(`orgs/${orgId}/usage/${day}_${uid}`);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(usageRef);
      const n = snap.exists ? snap.data().count || 0 : 0;
      if (n >= dailyLimit) throw new HttpsError('resource-exhausted', 'Hết lượt đọc AI hôm nay.');
      tx.set(usageRef, { count: FieldValue.increment(1), uid, day, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    });

    const apiKey = ANTHROPIC_API_KEY.value();
    if (!apiKey) throw new HttpsError('failed-precondition', 'Chưa cấu hình ANTHROPIC_API_KEY.');
    const client = new Anthropic({ apiKey });

    let msg;
    try {
      msg = await client.messages.create({
        model: AI_MODEL.value(),
        max_tokens: 8000,
        messages: [{
          role: 'user',
          content: [
            ...images.map((im) => ({ type: 'image', source: { type: 'base64', media_type: im.mediaType, data: im.data } })),
            { type: 'text', text: PROMPT },
          ],
        }],
      });
    } catch (err) {
      console.error('Claude API error', err?.status, err?.message);
      throw new HttpsError('unavailable', 'Dịch vụ AI tạm thời không phản hồi, thử lại sau.');
    }

    const text = (msg.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
    const data = parseJson(text);
    if (!data || typeof data !== 'object') throw new HttpsError('internal', 'invalid_json');
    return data;
  }
);

/** Đọc JSON khoan dung: cả câu trả lời, hoặc khối ```json```, hoặc đoạn từ { đầu tiên tới } cuối cùng. */
function parseJson(text) {
  const tries = [text];
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) tries.push(fence[1]);
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a >= 0 && b > a) tries.push(text.slice(a, b + 1));
  for (const t of tries) { try { return JSON.parse(t); } catch { /* thử cách tiếp */ } }
  return null;
}

module.exports.parseJson = parseJson;
