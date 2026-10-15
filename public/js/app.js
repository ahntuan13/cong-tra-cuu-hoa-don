/* ============================================================
   CỔNG TRA CỨU HÓA ĐƠN — app chính
   - Chạy được 2 chế độ: có Firebase (đăng nhập, dữ liệu trên Firestore, AI qua Cloud Function)
     hoặc chưa cấu hình Firebase (lưu trong trình duyệt, để thử nhanh).
   - Lớp kết nối Firebase nằm ở js/cloud.js, đặt vào window.Cloud.
   - Mô phỏng (cần làm phía server khi build): đồng bộ cơ quan thuế, PDF gốc từ nhà cung cấp,
     tra rủi ro NCC, ghi vào Bravo.
   ============================================================ */
const $=s=>document.querySelector(s);
const fmt=n=>Math.round(n||0).toLocaleString('vi-VN');
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const dmy=d=>d?d.split('-').reverse().join('/'):'—';
const vnNum=s=>+String(s).replace(/\s/g,'').replace(/\./g,'').replace(',','.')||0;
function toast(m){document.querySelectorAll('.toast').forEach(t=>t.remove());const t=document.createElement('div');t.className='toast';t.textContent=m;document.body.appendChild(t);setTimeout(()=>t.remove(),3000);}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

/* ---------- Lưu file về máy ---------- */
function saveFile(filename,data){
  try{const blob=data instanceof Blob?data:new Blob([data]);const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),4000);toast('Đã tải '+filename);}
  catch(e){toast('Không tải được file: '+e.message);}
}
function xlsxBytes(sheets){const wb=XLSX.utils.book_new();sheets.forEach(s=>{const ws=XLSX.utils.aoa_to_sheet(s.aoa);if(s.cols)ws['!cols']=s.cols.map(w=>({wch:w}));XLSX.utils.book_append_sheet(wb,ws,s.name.slice(0,31));});return new Uint8Array(XLSX.write(wb,{bookType:'xlsx',type:'array'}));}

/* ---------- Danh mục (giả lập từ Bravo) ---------- */
const TK=[['1521','1521 · Nguyên vật liệu'],['1531','1531 · Công cụ dụng cụ'],['6277','6277 · Dịch vụ mua ngoài (SX)'],['6417','6417 · Vận chuyển bán hàng'],['6423','6423 · Đồ dùng văn phòng'],['6427','6427 · Dịch vụ mua ngoài (QL)'],['6428','6428 · Chi phí bằng tiền khác']];
const KM=['NL01 · Nhiên liệu','VT01 · Viễn thông','VT02 · Vật tư HVAC','VT03 · Vật tư điện – kết cấu','VP01 · Văn phòng phẩm','TK01 · Tiếp khách','VC01 · Vận chuyển','GC01 · Gia công ngoài','DV01 · Dịch vụ thuê ngoài'];
const RULES0=[
  {kw:'dầu|xăng|diesel|ron 95',tk:'6277',km:'NL01 · Nhiên liệu'},
  {kw:'cước|internet|viễn thông|di động',tk:'6427',km:'VT01 · Viễn thông'},
  {kw:'ống đồng|ống gió|van|bảo ôn|quạt|dàn lạnh',tk:'1521',km:'VT02 · Vật tư HVAC'},
  {kw:'thép|cáp điện|dây cáp|aptomat',tk:'1521',km:'VT03 · Vật tư điện – kết cấu'},
  {kw:'giấy|bút|mực|văn phòng phẩm',tk:'6423',km:'VP01 · Văn phòng phẩm'},
  {kw:'suất ăn|cơm|nhà hàng',tk:'6428',km:'TK01 · Tiếp khách'},
  {kw:'vận chuyển|giao hàng',tk:'6417',km:'VC01 · Vận chuyển'},
  {kw:'bảo trì|bảo dưỡng',tk:'6277',km:'DV01 · Dịch vụ thuê ngoài'}];
const NCC0={'0312345678':'NCC-MP01','0309876543':'NCC-SGN02','0315551234':'NCC-HT07','0301112223':'NCC-AK03','0318889990':'NCC-BTX1','0317773334':'NCC-TL05'};
/* Rủi ro NCC — dữ liệu mô phỏng */
const RISK_DB={'0316667778':['Không hoạt động tại địa chỉ đăng ký','bad'],'0319994445':['Tạm ngừng kinh doanh từ 01/09/2026','bad'],'0312223334':['Mới thành lập 4 tháng','warn']};
const PROVIDERS=['VNPT Invoice','Viettel S-Invoice','MISA meInvoice','BKAV eHoaDon','EasyInvoice'];

/* ---------- Dữ liệu mẫu (hư cấu) ---------- */
const L=(ten,dvt,sl,dg,ts=10)=>({ten,dvt,sl,dg,tt:Math.round(sl*dg),ts,tk:'',km:''});
function recalc(inv){inv.truoc=inv.lines.reduce((s,l)=>s+l.tt,0);inv.thue=inv.lines.reduce((s,l)=>s+Math.round(l.tt*l.ts/100),0);inv.tong=inv.truoc+inv.thue;}
let S;
function mk(o){const inv={id:++S.seq,khms:'1',status:'moi',source:'XML',note:'',bravoNo:'',httt:'CK',prov:PROVIDERS[S.seq%5],pdf:'',...o};inv.lines=inv.lines.map(l=>({tk:'',km:'',...l}));recalc(inv);return inv;}
function seed(){
  S={seq:0,bravoSeq:7,ncc:{...NCC0},rules:RULES0.map(r=>({...r})),checked:{},invoices:[],emps:[],hist:[],congChuan:26,capBH:46800000,company:'Công ty TNHH ABC (demo)'};
  S.invoices=[
    mk({kyhieu:'C26TMP',so:'10234',ngay:'2026-10-07',mst:'0312345678',ten:'Công ty TNHH Xăng dầu Minh Phát',lines:[L('Dầu diesel 0,05S-II','Lít',120,19800)],httt:'TM'}),
    mk({kyhieu:'C26TMP',so:'10251',ngay:'2026-10-08',mst:'0312345678',ten:'Công ty TNHH Xăng dầu Minh Phát',lines:[L('Xăng RON 95-III','Lít',45,21900)],status:'duyet',httt:'TM'}),
    mk({kyhieu:'C26TSG',so:'88012',ngay:'2026-10-01',mst:'0309876543',ten:'Công ty CP Viễn thông Sài Gòn Net',lines:[L('Cước internet cáp quang tháng 09/2026','Tháng',1,1250000),L('Cước di động trả sau – 6 thuê bao','Tháng',1,1830000)],status:'day',bravoNo:'MH-2610-0004',pdf:'ok'}),
    mk({kyhieu:'C26THT',so:'2207',ngay:'2026-10-05',mst:'0315551234',ten:'Công ty TNHH Điện lạnh Hưng Thịnh',lines:[L('Ống đồng phi 9,52 dày 0,71mm','Mét',50,118000),L('Bảo ôn cách nhiệt phi 10','Mét',50,14500),L('Van chặn gas 3/8"','Cái',4,265000)],status:'duyet'}),
    mk({kyhieu:'C26TAK',so:'5531',ngay:'2026-10-06',mst:'0301112223',ten:'Công ty TNHH Văn phòng phẩm An Khang',lines:[L('Giấy A4 70gsm','Ram',20,78000,8),L('Bút bi hộp 20 cây','Hộp',5,62000,8),L('Mực in laser 107A','Hộp',2,890000)]}),
    mk({kyhieu:'C26MBT',so:'771',ngay:'2026-10-09',mst:'0318889990',ten:'Nhà hàng Bến Thành Xưa',lines:[L('Suất ăn tiếp khách – đoàn chủ đầu tư','Suất',8,385000,8)],source:'PDF',status:'kiemtra',note:'Đọc từ PDF có chữ – kiểm tra lại số tiền',httt:'TM'}),
    mk({kyhieu:'C26TPM',so:'3390',ngay:'2026-10-09',mst:'0316667778',ten:'Công ty TNHH Vận tải Phú Mỹ',lines:[L('Cước vận chuyển thiết bị lên công trình Bình Dương','Chuyến',2,2400000,8)],status:'duyet'}),
    mk({kyhieu:'C26TTL',so:'1186',ngay:'2026-10-10',mst:'0317773334',ten:'Công ty TNHH Cơ khí Tân Long',lines:[L('Gia công giá treo ống thép V50','Bộ',30,95000)]}),
    mk({kyhieu:'C26THT',so:'2215',ngay:'2026-09-24',mst:'0315551234',ten:'Công ty TNHH Điện lạnh Hưng Thịnh',lines:[L('Ống gió tôn mạ kẽm 0,6mm','m²',36,215000)],status:'day',bravoNo:'MH-2610-0006',pdf:'ok'}),
    mk({kyhieu:'C26TAK',so:'5390',ngay:'2026-09-18',mst:'0301112223',ten:'Công ty TNHH Văn phòng phẩm An Khang',lines:[L('Bìa hồ sơ, kẹp giấy','Bộ',40,18500,8)],status:'day',bravoNo:'MH-2609-0031',pdf:'ok'}),
    mk({kyhieu:'',so:'',ngay:'2026-10-12',mst:'',ten:'(Hóa đơn giấy – scan)',lines:[L('(chưa nhập)','',0,0)],source:'Scan',status:'kiemtra',note:'File scan không có lớp chữ – dùng "Đọc bằng AI" hoặc nhập tay'}),
  ];
  S.invoices.forEach(autoMap);
  S.emps=[
    {ma:'NV001',ten:'Nguyễn Văn An',bp:'Kỹ thuật',lcb:18000000,pc:1500000,lbh:18000000,npt:1,cong:26,ot:12},
    {ma:'NV002',ten:'Trần Thị Bích',bp:'Kế toán',lcb:15000000,pc:1000000,lbh:15000000,npt:0,cong:26,ot:4},
    {ma:'NV003',ten:'Lê Minh Châu',bp:'Thi công',lcb:12000000,pc:2000000,lbh:12000000,npt:2,cong:25,ot:20},
    {ma:'NV004',ten:'Phạm Quốc Dũng',bp:'Kỹ thuật',lcb:32000000,pc:3000000,lbh:32000000,npt:1,cong:26,ot:8},
    {ma:'NV005',ten:'Võ Thanh Hà',bp:'Hành chính',lcb:11000000,pc:800000,lbh:11000000,npt:0,cong:24,ot:0},
    {ma:'NV006',ten:'Đặng Hoàng Khoa',bp:'Thi công',lcb:13500000,pc:2000000,lbh:13500000,npt:1,cong:26,ot:28},
    {ma:'NV007',ten:'Bùi Ngọc Lan',bp:'Mua hàng',lcb:16500000,pc:1000000,lbh:16500000,npt:0,cong:26,ot:6},
    {ma:'NV008',ten:'Hồ Đức Minh',bp:'Quản lý dự án',lcb:55000000,pc:5000000,lbh:55000000,npt:2,cong:26,ot:0}];
  // Lịch sử lương 9 tháng (mô phỏng biến động công/OT) để demo quyết toán
  for(let m=1;m<=9;m++)S.emps.forEach((e,i)=>{const c=calcPay({...e,cong:26-((m+i)%3===0?1:0),ot:Math.max(0,e.ot+((m*7+i*3)%9)-4)});S.hist.push({m,ma:e.ma,...c});});
}
const STORE='cong-tra-cuu-hoa-don-v1';
function persist(){if(window.Cloud?.enabled){if(Cloud.user)Cloud.save(S);return;}try{localStorage.setItem(STORE,JSON.stringify(S));}catch(e){}}
function load(){try{const s=JSON.parse(localStorage.getItem(STORE)||'null');if(s&&s.invoices){S=s;return true;}}catch(e){}return false;}

/* ---------- Nghiệp vụ hóa đơn ---------- */
const keyOf=i=>`${i.mst}|${i.kyhieu}|${i.so}`;
function autoMap(inv){inv.lines.forEach(l=>{if(l.tk)return;const n=l.ten.toLowerCase();const r=S.rules.find(r=>r.kw.split('|').map(s=>s.trim()).filter(Boolean).some(k=>n.includes(k.toLowerCase())));if(r){l.tk=r.tk;l.km=r.km;}});}
function issues(inv){const o=[];if(!inv.mst||!inv.kyhieu||!inv.so)o.push('Thiếu MST/ký hiệu/số');if(inv.mst&&!S.ncc[inv.mst])o.push('NCC chưa có mã Bravo');const m=inv.lines.filter(l=>!l.tk).length;if(m)o.push(`${m} dòng chưa có TK`);return o;}
function riskOf(mst){if(!S.checked[mst])return null;return RISK_DB[mst]||['Đang hoạt động','ok'];}
function dedErr(inv){const o=[];const r=riskOf(inv.mst);if(r&&r[1]==='bad')o.push('NCC '+r[0].toLowerCase());if(inv.tong>=5000000&&inv.httt==='TM')o.push('Thanh toán tiền mặt từ 5 triệu');return o;}
const STATUS={moi:['moi','Mới'],kiemtra:['kiemtra','Cần kiểm tra'],duyet:['duyet','Đã duyệt'],day:['day','Đã vào Bravo'],loi:['loi','Lỗi Bravo']};
const pill=s=>`<span class="pill ${STATUS[s][0]}">${STATUS[s][1]}</span>`;

/* XML hóa đơn điện tử (chuẩn của Tổng cục Thuế, TT78) — đọc */
function parseXml(text){
  const doc=new DOMParser().parseFromString(text,'application/xml');
  if(doc.querySelector('parsererror'))throw new Error('File không phải XML hợp lệ');
  const g=(root,tag)=>{const e=root.getElementsByTagName(tag)[0];return e?e.textContent.trim():'';};
  const ttc=doc.getElementsByTagName('TTChung')[0],nb=doc.getElementsByTagName('NBan')[0];
  if(!ttc||!nb)throw new Error('Không thấy cấu trúc hóa đơn (TTChung/NBan)');
  const lines=[...doc.getElementsByTagName('HHDVu')].map(h=>{const ts=parseFloat((g(h,'TSuat')||'0').replace('%',''))||0;const sl=+g(h,'SLuong')||0,dg=+g(h,'DGia')||0;let tt=+g(h,'ThTien');if(!tt)tt=Math.round(sl*dg);return {ten:g(h,'THHDVu'),dvt:g(h,'DVTinh'),sl,dg,tt,ts};});
  const ht=g(ttc,'HTTToan').toLowerCase();
  const inv=mk({khms:g(ttc,'KHMSHDon')||'1',kyhieu:g(ttc,'KHHDon'),so:g(ttc,'SHDon'),ngay:g(ttc,'NLap').slice(0,10),mst:g(nb,'MST'),ten:g(nb,'Ten'),lines,source:'XML',httt:(ht.includes('tiền mặt')||ht==='tm')?'TM':'CK',mccqt:g(doc,'MCCQT')});
  const tong=+g(doc,'TgTTTBSo');if(tong&&Math.abs(tong-inv.tong)>2){inv.status='kiemtra';inv.note=`Tổng trên XML (${fmt(tong)}) khác tổng cộng dòng (${fmt(inv.tong)})`;}
  return inv;}
/* XML — sinh lại từ dữ liệu (dùng cho tải hàng loạt) */
function invToXml(i){const x=s=>String(s??'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  return `<?xml version="1.0" encoding="UTF-8"?>
<HDon>
  <DLHDon>
    <TTChung><PBan>2.0.1</PBan><THDon>Hóa đơn giá trị gia tăng</THDon><KHMSHDon>${x(i.khms)}</KHMSHDon><KHHDon>${x(i.kyhieu)}</KHHDon><SHDon>${x(i.so)}</SHDon><NLap>${x(i.ngay)}</NLap><DVTien>VND</DVTien><HTTToan>${i.httt==='TM'?'Tiền mặt':'Chuyển khoản'}</HTTToan></TTChung>
    <NDHDon>
      <NBan><Ten>${x(i.ten)}</Ten><MST>${x(i.mst)}</MST></NBan>
      <NMua><Ten>${x(S.company)}</Ten></NMua>
      <DSHHDVu>
${i.lines.map((l,k)=>`        <HHDVu><STT>${k+1}</STT><THHDVu>${x(l.ten)}</THHDVu><DVTinh>${x(l.dvt)}</DVTinh><SLuong>${l.sl}</SLuong><DGia>${l.dg}</DGia><ThTien>${l.tt}</ThTien><TSuat>${l.ts}%</TSuat></HHDVu>`).join('\n')}
      </DSHHDVu>
      <TToan><TgTCThue>${i.truoc}</TgTCThue><TgTThue>${i.thue}</TgTThue><TgTTTBSo>${i.tong}</TgTTTBSo></TToan>
    </NDHDon>
  </DLHDon>
  <MCCQT>${x(i.mccqt||'')}</MCCQT>
</HDon>`;}
/* Bản thể hiện (HTML in được ra PDF) */
function invToHtml(i){return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${esc(i.kyhieu)}-${esc(i.so)}</title><style>body{font-family:"Times New Roman",serif;max-width:800px;margin:30px auto;padding:30px;border:3px double #7a4b1e;color:#222}h1{text-align:center;color:#7a4b1e;margin:0;font-size:22px}.c{text-align:center}table{width:100%;border-collapse:collapse;margin-top:14px}td,th{border:1px solid #999;padding:5px 7px;font-size:13px}.r{text-align:right}.meta{display:flex;justify-content:space-between;font-size:13px;margin:10px 0}</style></head><body>
<h1>HÓA ĐƠN GIÁ TRỊ GIA TĂNG</h1><p class="c">Ngày ${dmy(i.ngay)}</p>
<div class="meta"><span>Ký hiệu: <b>${esc(i.kyhieu)}</b></span><span>Số: <b>${esc(i.so)}</b></span></div>
<p>Đơn vị bán: <b>${esc(i.ten)}</b><br>Mã số thuế: ${esc(i.mst)}</p><p>Đơn vị mua: ${esc(S.company)}<br>Hình thức thanh toán: ${i.httt==='TM'?'Tiền mặt':'Chuyển khoản'}</p>
<table><tr><th>STT</th><th>Tên hàng hóa, dịch vụ</th><th>ĐVT</th><th>SL</th><th>Đơn giá</th><th>Thành tiền</th><th>TS</th></tr>
${i.lines.map((l,k)=>`<tr><td class="c">${k+1}</td><td>${esc(l.ten)}</td><td>${esc(l.dvt)}</td><td class="r">${fmt(l.sl)}</td><td class="r">${fmt(l.dg)}</td><td class="r">${fmt(l.tt)}</td><td class="c">${l.ts}%</td></tr>`).join('')}
<tr><td colspan="5" class="r">Cộng tiền hàng</td><td class="r" colspan="2">${fmt(i.truoc)}</td></tr><tr><td colspan="5" class="r">Tiền thuế GTGT</td><td class="r" colspan="2">${fmt(i.thue)}</td></tr><tr><td colspan="5" class="r"><b>Tổng cộng thanh toán</b></td><td class="r" colspan="2"><b>${fmt(i.tong)}</b></td></tr></table>
<p style="font-size:12px;color:#666;margin-top:20px">Bản thể hiện sinh từ dữ liệu XML — không thay thế hóa đơn gốc có chữ ký số.</p></body></html>`;}

/* PDF có lớp chữ — đọc tự động */
if(window.pdfjsLib)pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
async function parsePdf(file){
  if(!window.pdfjsLib)throw new Error('Không tải được thư viện đọc PDF');
  const pdf=await pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise;let text='';
  for(let p=1;p<=Math.min(pdf.numPages,3);p++){const c=await (await pdf.getPage(p)).getTextContent();text+=c.items.map(i=>i.str).join(' ')+'\n';}
  const t=text.replace(/\s+/g,' ');
  if(t.trim().length<40)return mk({kyhieu:'',so:'',ngay:'',mst:'',ten:file.name,lines:[L('(chưa nhập)','',0,0)],source:'Scan',status:'kiemtra',note:'PDF không có lớp chữ (bản scan) – dùng "Đọc bằng AI" hoặc nhập tay'});
  const m=re=>{const r=t.match(re);return r?r[1]:'';};
  const kyhieu=m(/K[ýý] hi[ệe]u[^:]{0,20}:\s*([0-9A-Z]{6,8})/i);
  const so=m(/S[ốo](?: h[óo]a đ[ơo]n)?\s*(?:\(No\.?\))?\s*:\s*0*(\d{1,8})/i);
  const mst=m(/M[ãa] s[ốo] thu[ếe][^:]{0,20}:\s*([\d\s-]{10,16})/i).replace(/\s/g,'');
  const ten=m(/(?:Đ[ơo]n v[ịi] b[áa]n h[àa]ng|Ng[ưu][ờo]i b[áa]n)[^:]{0,20}:\s*([^:]{5,90}?)\s+(?:M[ãa] s[ốo] thu[ếe]|Đ[ịi]a ch[ỉi])/i);
  const d=t.match(/Ng[àa]y\s*(\d{1,2})\s*th[áa]ng\s*(\d{1,2})\s*n[ăa]m\s*(\d{4})/i);
  const tong=vnNum(m(/T[ổo]ng (?:c[ộo]ng )?ti[ềe]n thanh to[áa]n[^\d]{0,30}([\d.,]{4,})/i));
  const thue=vnNum(m(/Ti[ềe]n thu[ếe] GTGT[^\d]{0,30}([\d.,]{3,})/i));
  const truoc=tong&&thue?tong-thue:tong;
  return mk({kyhieu,so,mst,ten:ten||file.name,ngay:d?`${d[3]}-${d[2].padStart(2,'0')}-${d[1].padStart(2,'0')}`:'',lines:[{ten:'Tổng hợp theo PDF – '+(ten||file.name),dvt:'',sl:1,dg:truoc,tt:truoc,ts:truoc&&thue?Math.round(thue/truoc*100):0}],source:'PDF',status:'kiemtra',note:'Đọc tự động từ PDF – đối chiếu lại các trường trước khi duyệt'});}
async function pdfToImages(file,max=4){
  const pdf=await pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise;const out=[];
  for(let p=1;p<=Math.min(pdf.numPages,max);p++){const page=await pdf.getPage(p);const vp=page.getViewport({scale:1.7});const c=document.createElement('canvas');c.width=vp.width;c.height=vp.height;await page.render({canvasContext:c.getContext('2d'),viewport:vp}).promise;out.push(await new Promise(r=>c.toBlob(r,'image/png')));}
  return {images:out,pages:pdf.numPages};}

/* ---------- AI đọc chứng từ ---------- */
const AI_PROMPT=`Bạn nhận ảnh chụp hoặc ảnh scan một chứng từ tiếng Việt (thường là hóa đơn GTGT, có thể là bảng kê/bảng tính).
Trích dữ liệu chính xác như trên ảnh, không bịa. Số tiền trả về dạng số nguyên (bỏ dấu chấm phân cách nghìn). Ngày dạng YYYY-MM-DD.
Chỉ trả về một đối tượng JSON đúng cấu trúc sau, không thêm chữ nào khác:
{"loai":"hoa_don" hoặc "bang",
 "hoaDon": null hoặc {"kyhieu":"","so":"","ngay":"","mstBan":"","tenBan":"","httt":"TM" hoặc "CK","tienTruocThue":0,"tienThue":0,"tongCong":0,
   "dong":[{"ten":"","dvt":"","sl":0,"dg":0,"tt":0,"ts":10}]},
 "bang":{"cot":["tên cột",...],"dong":[["giá trị",...],...]}}
"bang" luôn có: nếu là hóa đơn thì bảng là danh sách dòng hàng (STT, Tên hàng, ĐVT, Số lượng, Đơn giá, Thành tiền, Thuế suất).`;
/* Gửi ảnh lên Cloud Function "docAi" (functions/index.js). Khóa API AI chỉ nằm ở server. */
async function aiRead(images){
  if(!window.Cloud?.enabled||!Cloud.user)throw {code:'unavailable'};
  return Cloud.aiRead(images.slice(0,4),AI_PROMPT);}
const aiErrMsg=c=>({unavailable:'Tính năng AI cần cấu hình Firebase và đăng nhập (xem README).',images_unavailable:'Không gửi được ảnh lên server.','functions/resource-exhausted':'Đã hết lượt đọc AI trong ngày, thử lại ngày mai.','functions/unauthenticated':'Bạn cần đăng nhập lại.','functions/failed-precondition':'Server chưa có khóa API AI (xem README, mục Cloud Functions).',rate_limited:'Đang gửi quá nhiều yêu cầu, thử lại sau ít phút.',invalid_json:'AI trả về sai định dạng, bấm đọc lại.',image_rejected:'File ảnh không đọc được, thử ảnh khác.',refused:'AI từ chối xử lý file này.'}[c]||'Đọc không thành công, thử lại.');
function invFromAi(h,src){const lines=(h.dong||[]).map(d=>({ten:String(d.ten||''),dvt:String(d.dvt||''),sl:+d.sl||0,dg:+d.dg||0,tt:+d.tt||Math.round((+d.sl||0)*(+d.dg||0)),ts:+d.ts||0}));
  return {kyhieu:String(h.kyhieu||''),so:String(h.so||'').replace(/^0+/,''),ngay:String(h.ngay||'').slice(0,10),mst:String(h.mstBan||'').replace(/\s/g,''),ten:String(h.tenBan||''),httt:h.httt==='TM'?'TM':'CK',lines:lines.length?lines:[L('(chưa nhập)','',0,0)],source:src};}
const fileStore={};

/* ---------- Bảng lương (Luật thuế TNCN 109/2025/QH15 — tham số kiểm tra lại khi build) ---------- */
const GT_BT=15500000,GT_NPT=6200000;
const BRACKETS=[[10e6,.05],[30e6,.10],[60e6,.20],[100e6,.30],[Infinity,.35]];
function pit(tn,months=1){if(tn<=0)return 0;let tax=0,prev=0;for(const [cap,r] of BRACKETS){const c=cap*months;if(tn>prev){tax+=(Math.min(tn,c)-prev)*r;}prev=c;}return Math.round(tax);}
function calcPay(e){const cc=S?.congChuan||26,cap=S?.capBH||46800000;
  const theoCong=(e.lcb+e.pc)*e.cong/cc;const gio=e.lcb/cc/8;const ot=gio*e.ot*1.5;const otMien=gio*e.ot*0.5;
  const gross=theoCong+ot;const bh=Math.min(e.lbh,cap)*0.105;const tntt=Math.max(0,gross-otMien-bh-GT_BT-e.npt*GT_NPT);const tax=pit(tntt);
  return {theoCong:Math.round(theoCong),otTien:Math.round(ot),otMien:Math.round(otMien),gross:Math.round(gross),bh:Math.round(bh),tntt:Math.round(tntt),tax,net:Math.round(gross-bh-tax)};}

/* ---------- Văn bản mẫu ---------- */
const TPLS={
 bbdc:{name:'Biên bản đối chiếu công nợ',fields:['ten_ncc','mst','so_hd','so_tien','den_ngay'],from:'ncc',body:
`# CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM
~ Độc lập – Tự do – Hạnh phúc
# BIÊN BẢN ĐỐI CHIẾU CÔNG NỢ
~ Tính đến ngày {{den_ngay}}
**Bên A (bên mua): {{ten_cong_ty}}
**Bên B (bên bán): {{ten_ncc}}
Mã số thuế bên B: {{mst}}
Hai bên cùng đối chiếu số liệu công nợ như sau:
- Số hóa đơn phát sinh trong kỳ: {{so_hd}} hóa đơn
- Tổng giá trị phải trả bên B: {{so_tien}} đồng
- Số đã thanh toán: ........................ đồng
- Số còn phải trả: ........................ đồng
Biên bản lập thành 02 bản, mỗi bên giữ 01 bản có giá trị như nhau.
**ĐẠI DIỆN BÊN A                                        ĐẠI DIỆN BÊN B`},
 bbgn:{name:'Biên bản giao nhận vật tư',fields:['so_bb','ngay','ben_giao','cong_trinh','noi_dung','so_luong'],from:'',body:
`# BIÊN BẢN GIAO NHẬN VẬT TƯ
~ Số: {{so_bb}}
Hôm nay, ngày {{ngay}}, tại công trình {{cong_trinh}}, chúng tôi gồm:
**Bên giao: {{ben_giao}}
**Bên nhận: {{ten_cong_ty}}
Cùng tiến hành giao nhận vật tư như sau:
- Nội dung: {{noi_dung}}
- Số lượng: {{so_luong}}
Vật tư đúng chủng loại, đủ số lượng, không hư hỏng. Hai bên thống nhất ký biên bản.
**BÊN GIAO                                                   BÊN NHẬN`},
 hdtv:{name:'Hợp đồng thử việc',fields:['ho_ten','ma_nv','bo_phan','chuc_danh','ngay_bat_dau','luong_thu_viec'],from:'emps',body:
`# CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM
~ Độc lập – Tự do – Hạnh phúc
# HỢP ĐỒNG THỬ VIỆC
**Bên sử dụng lao động: {{ten_cong_ty}}
**Người lao động: {{ho_ten}} (Mã NV: {{ma_nv}})
Điều 1. Người lao động làm việc tại bộ phận {{bo_phan}}, chức danh {{chuc_danh}}.
Điều 2. Thời gian thử việc bắt đầu từ ngày {{ngay_bat_dau}}, tối đa 60 ngày.
Điều 3. Mức lương thử việc: {{luong_thu_viec}} đồng/tháng (không thấp hơn 85% mức lương của công việc đó).
Điều 4. Hết thời gian thử việc, bên sử dụng lao động thông báo kết quả cho người lao động.
**NGƯỜI LAO ĐỘNG                                    ĐẠI DIỆN CÔNG TY`}};
let docState={tpl:'bbdc',tsv:''};
function tplData(k){const t=TPLS[k];
  if(t.from==='ncc'){const m=new Map();S.invoices.filter(i=>i.mst).forEach(i=>{const o=m.get(i.mst)||{ten:i.ten,n:0,s:0};o.n++;o.s+=i.tong;m.set(i.mst,o);});
    return [t.fields,...[...m.entries()].map(([mst,o])=>[o.ten,mst,o.n,fmt(o.s),'31/10/2026'])];}
  if(t.from==='emps')return [t.fields,...S.emps.map(e=>[e.ten,e.ma,e.bp,'Nhân viên',`01/11/2026`,fmt(e.lcb*0.85)])];
  return [t.fields,['GN-001','15/10/2026','Công ty TNHH Điện lạnh Hưng Thịnh','Nhà xưởng Bình Dương','Ống đồng phi 9,52','50 mét'],['GN-002','16/10/2026','Công ty TNHH Cơ khí Tân Long','Nhà xưởng Bình Dương','Giá treo ống V50','30 bộ']];}
function parseTsv(t){return t.split(/\r?\n/).filter(l=>l.trim()).map(l=>l.split('\t'));}
function fillDocs(){const rows=parseTsv(docState.tsv);if(rows.length<2)return [];const h=rows[0].map(s=>s.trim());
  return rows.slice(1).map(r=>{const d={ten_cong_ty:S.company};h.forEach((k,i)=>d[k]=(r[i]??'').trim());return TPLS[docState.tpl].body.replace(/\{\{(\w+)\}\}/g,(_,k)=>d[k]??`[${k}]`);});}
function docLines(txt){return txt.split('\n').map(l=>l.startsWith('# ')?{s:'t',x:l.slice(2)}:l.startsWith('~ ')?{s:'c',x:l.slice(2)}:l.startsWith('**')?{s:'b',x:l.slice(2)}:{s:'n',x:l});}
async function docxBytes(docs){
  const xe=s=>s.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  const font='<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>';
  const p=({s,x})=>`<w:p><w:pPr>${s==='t'||s==='c'?'<w:jc w:val="center"/>':''}<w:spacing w:after="${s==='t'?160:100}"/></w:pPr><w:r><w:rPr>${font}${s==='t'||s==='b'?'<w:b/>':''}<w:sz w:val="${s==='t'?28:26}"/></w:rPr><w:t xml:space="preserve">${xe(x)}</w:t></w:r></w:p>`;
  const body=docs.map(d=>docLines(d).map(p).join('')).join('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
  const z=new JSZip();
  z.file('[Content_Types].xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  z.file('_rels/.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  z.file('word/document.xml',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1418" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr></w:body></w:document>`);
  return z.generateAsync({type:'uint8array'});}

/* ============================================================ VIEWS ============================================================ */
const NAV=[
 ['Hóa đơn',[['hd','Danh sách hóa đơn'],['batch','Tải hàng loạt','sim'],['bk','Bảng kê'],['risk','Rủi ro NCC','sim']]],
 ['Kế toán',[['map','Ghép mã & hạch toán'],['bravo','Đẩy sang Bravo','sim'],['tk','Tờ khai & phụ lục']]],
 ['Công cụ',[['merge','Gộp file'],['ocr','Ảnh/PDF → Excel','ai'],['docs','Văn bản hàng loạt']]],
 ['Nhân sự',[['pay','Bảng lương']]],
 ['Hệ thống',[['members','Thành viên'],['notes','Ghi chú build']]]];
let route='hd';
function renderNav(){
  $('#nav').innerHTML=`<div class="brand"><div class="mark">HĐ</div><div><h1>Cổng tra cứu hóa đơn</h1><small>${window.Cloud?.user?esc(Cloud.user.email||Cloud.user.displayName||"Đã đăng nhập")+' · <a href="#" data-act="signOut">Đăng xuất</a> <span id="sync-st"></span>':'Chế độ thử · lưu trong trình duyệt'}</small></div></div>`+
  NAV.map(([g,items])=>`<div class="grp">${g}</div>`+items.map(([k,l,t])=>`<button data-go="${k}" ${route===k?'aria-current="page"':''}>${l}${t?`<span class="tag ${t}">${t==='sim'?'mô phỏng':'AI'}</span>`:k==='hd'?`<span class="tag">${S.invoices.length}</span>`:''}</button>`).join('')).join('');}
function go(k){route=k;renderNav();render();try{localStorage.setItem(STORE+'-route',k);}catch(e){}window.scrollTo(0,0);}
function render(){$('#main').innerHTML=VIEWS[route]();AFTER[route]?.();persist();}
const head=(t,p,act='')=>`<div class="vhead"><div><h2>${t}</h2><p>${p}</p></div>${act?`<div class="act">${act}</div>`:''}</div>`;
const AFTER={};

/* ----- Danh sách hóa đơn ----- */
let filt={status:'',q:'',src:''};
function rowsHtml(){const q=filt.q.toLowerCase();
  const list=S.invoices.filter(i=>(!filt.status||i.status===filt.status)&&(!filt.src||i.source===filt.src)&&(!q||`${i.ten} ${i.mst} ${i.so} ${i.kyhieu}`.toLowerCase().includes(q)));
  return list.length?list.map(i=>{const iss=i.status==='day'?[]:issues(i);const r=riskOf(i.mst);const de=dedErr(i);return `<tr class="click" data-open="${i.id}">
   <td><div class="mono">${esc(i.kyhieu)||'—'}</div><div class="sub mono">Số ${esc(i.so)||'—'}</div></td><td class="mono">${dmy(i.ngay)}</td>
   <td style="min-width:220px">${esc(i.ten)}<div class="sub mono">${esc(i.mst)||'Chưa có MST'}${r&&r[1]!=='ok'?` · <span style="color:var(--${r[1]==='bad'?'bad':'warn'})">${esc(r[0])}</span>`:''}${iss.length?` · <span style="color:var(--bad)">${esc(iss[0])}</span>`:''}${de.length?` · <span style="color:var(--warn)">${esc(de[0])}</span>`:''}</div></td>
   <td class="num">${fmt(i.truoc)}</td><td class="num">${fmt(i.thue)}</td><td class="num"><b>${fmt(i.tong)}</b></td>
   <td><span class="src">${i.source}</span> ${i.pdf==='ok'?'<span class="src" title="Đã có PDF gốc">PDF</span>':''}</td><td>${pill(i.status)}${i.bravoNo?`<div class="sub mono">${i.bravoNo}</div>`:''}</td></tr>`;}).join('')
  :`<tr><td colspan="8" class="empty">Không có hóa đơn nào khớp bộ lọc.</td></tr>`;}
const VIEWS={};
VIEWS.hd=()=>{const c=s=>S.invoices.filter(i=>i.status===s).length;
  const st=[['','Tất cả',S.invoices.length,'var(--muted)'],['moi','Mới',c('moi'),'var(--info)'],['kiemtra','Cần kiểm tra',c('kiemtra'),'var(--warn)'],['duyet','Đã duyệt',c('duyet'),'var(--ink)'],['day','Đã vào Bravo',c('day'),'var(--ok)']];
  return head('Danh sách hóa đơn đầu vào','Gom hóa đơn từ cơ quan thuế, file XML, PDF hoặc ảnh scan. Không giới hạn số lượng; hóa đơn trùng (cùng MST, ký hiệu, số) tự bỏ qua.',
   `<button class="btn" data-act="sync">Đồng bộ từ cơ quan thuế</button><button class="btn" data-act="approveAll">Duyệt hóa đơn đủ mã</button>`)+
  `<div id="syncbox"></div><div class="stats">${st.map(([k,l,n,col])=>`<button class="stat" data-st="${k}" aria-pressed="${filt.status===k}"><div class="l"><span class="dot" style="background:${col}"></span>${l}</div><div class="n">${n}</div></button>`).join('')}</div>
  <label class="drop" id="drop" for="file"><div class="txt"><b>Kéo thả file hóa đơn vào đây</b><span>XML (chính xác nhất) · PDF có chữ (đọc tự động) · PDF scan/ảnh (đọc bằng AI trong ngăn chi tiết)</span></div>
   <input type="file" id="file" multiple accept=".xml,.pdf,.png,.jpg,.jpeg,.webp" hidden><span class="btn primary">Chọn file</span><button type="button" class="btn" data-act="xmlModal">Dán XML mẫu</button></label>
  <div class="toolbar"><input type="search" id="q" placeholder="Tìm người bán, MST, số hóa đơn…" value="${esc(filt.q)}">
   <select id="f-src"><option value="">Mọi nguồn</option>${['XML','PDF','Scan','AI'].map(s=>`<option ${filt.src===s?'selected':''}>${s}</option>`).join('')}</select></div>
  <div class="panel"><div class="scroll"><table><thead><tr><th>Ký hiệu / Số</th><th>Ngày</th><th>Người bán</th><th class="num">Trước thuế</th><th class="num">Thuế</th><th class="num">Tổng cộng</th><th>Nguồn</th><th>Trạng thái</th></tr></thead><tbody id="rows">${rowsHtml()}</tbody></table></div></div>`;};
AFTER.hd=()=>{const d=$('#drop');['dragenter','dragover'].forEach(ev=>d.addEventListener(ev,e=>{e.preventDefault();d.classList.add('over');}));['dragleave','drop'].forEach(ev=>d.addEventListener(ev,e=>{e.preventDefault();d.classList.remove('over');}));d.addEventListener('drop',e=>handleFiles([...e.dataTransfer.files]));};
async function handleFiles(files){let add=0,dup=0,err=[];
  for(const f of files){try{let inv;const n=f.name.toLowerCase();
    if(n.endsWith('.xml'))inv=parseXml(await f.text());
    else if(n.endsWith('.pdf'))inv=await parsePdf(f);
    else inv=mk({kyhieu:'',so:'',ngay:'',mst:'',ten:f.name,lines:[L('(chưa nhập)','',0,0)],source:'Scan',status:'kiemtra',note:'Ảnh chụp/scan – bấm "Đọc bằng AI" hoặc nhập tay'});
    if(inv.mst&&inv.so&&S.invoices.some(x=>keyOf(x)===keyOf(inv))){dup++;continue;}
    if(inv.source==='Scan')fileStore[inv.id]=f;
    autoMap(inv);S.invoices.unshift(inv);add++;}catch(e){err.push(`${f.name}: ${e.message}`);}}
  renderNav();render();toast(`Đã thêm ${add} hóa đơn`+(dup?` · bỏ qua ${dup} hóa đơn trùng`:'')+(err.length?` · ${err.length} file lỗi`:''));}
const SYNC_POOL=[
  {kyhieu:'C26TVN',so:'45120',ngay:'2026-10-13',mst:'0105556667',ten:'Tổng công ty Viễn thông Đông Á – CN TP.HCM',lines:[L('Cước thuê kênh truyền dữ liệu tháng 10/2026','Tháng',1,3200000)]},
  {kyhieu:'C26TKL',so:'8841',ngay:'2026-10-12',mst:'0314445556',ten:'Công ty CP Kim khí Long Hậu',lines:[L('Thép hộp mạ kẽm 40x80x1,4','Cây',40,385000,8)]},
  {kyhieu:'C26MTQ',so:'230977',ngay:'2026-10-11',mst:'0318882221',ten:'Cửa hàng Xăng dầu Thuận Quang',lines:[L('Dầu diesel 0,001S-V','Lít',60,20100)],httt:'TM'},
  {kyhieu:'C26TAN',so:'612',ngay:'2026-10-10',mst:'0312223334',ten:'Công ty TNHH Thiết bị điện An Nhiên',lines:[L('Dây cáp điện CV 2,5mm²','Cuộn',6,1450000,8),L('Aptomat MCB 2P 32A','Cái',10,210000,8)],httt:'TM'},
  {kyhieu:'C26TBM',so:'1043',ngay:'2026-10-08',mst:'0319994445',ten:'Công ty TNHH Bảo trì Minh Khang',lines:[L('Bảo trì hệ thống điều hòa trung tâm quý 4','Gói',1,12500000,8)]},
  {kyhieu:'C26THT',so:'2230',ngay:'2026-10-14',mst:'0315551234',ten:'Công ty TNHH Điện lạnh Hưng Thịnh',lines:[L('Dàn lạnh âm trần cassette 2HP','Bộ',2,14800000)]}];
async function doSync(){const box=$('#syncbox');const todo=SYNC_POOL.filter(p=>!S.invoices.some(x=>keyOf(x)===keyOf(p)));
  box.innerHTML=`<div class="card" style="margin-bottom:14px"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><b>Đồng bộ hóa đơn mua vào từ cơ quan thuế (mô phỏng)</b><span class="sub mono" id="sy-t">0/${todo.length||0}</span></div><div class="progress" style="margin:8px 0"><i id="sy-p"></i></div><div class="sub">Bản thật: dùng tài khoản tra cứu hóa đơn của doanh nghiệp, chạy nền định kỳ, lấy cả XML gốc có mã cơ quan thuế.</div></div>`;
  if(!todo.length){await sleep(500);box.innerHTML='';toast('Không có hóa đơn mới trên cơ quan thuế');return;}
  for(let k=0;k<todo.length;k++){await sleep(350);const inv=mk({...JSON.parse(JSON.stringify(todo[k])),source:'XML',mccqt:'00'+Math.random().toString(16).slice(2,14).toUpperCase()});autoMap(inv);S.invoices.unshift(inv);$('#sy-p').style.width=((k+1)/todo.length*100)+'%';$('#sy-t').textContent=`${k+1}/${todo.length}`;}
  await sleep(300);renderNav();render();toast(`Đã đồng bộ ${todo.length} hóa đơn mới`);}

/* Ngăn chi tiết */
function openDrawer(id){const inv=S.invoices.find(i=>i.id===id);if(!inv)return;
  const iss=issues(inv),lock=inv.status==='day',r=riskOf(inv.mst),de=dedErr(inv),edit=!lock&&inv.source!=='XML';
  const tkO=v=>`<option value="">— chọn TK —</option>`+TK.map(([k,l])=>`<option value="${k}" ${k===v?'selected':''}>${l}</option>`).join('');
  const kmO=v=>`<option value="">— khoản mục —</option>`+KM.map(k=>`<option ${k===v?'selected':''}>${k}</option>`).join('');
  const dis=lock?'disabled':'';
  $('#overlay').innerHTML=`<div class="scrim" data-close></div><aside class="drawer" role="dialog" aria-label="Chi tiết hóa đơn">
   <header><div style="flex:1;min-width:0"><h2>${esc(inv.ten)}</h2><div class="sub mono">${esc(inv.kyhieu)} · Số ${esc(inv.so)} · ${dmy(inv.ngay)} · ${esc(inv.prov)}</div></div>${pill(inv.status)}<button class="x" data-close aria-label="Đóng">×</button></header>
   <div class="body">
    ${inv.source==='Scan'&&!lock?`<div class="callout info" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span style="flex:1;min-width:200px">${fileStore[inv.id]?'Có file scan đính kèm. AI sẽ đọc và điền các trường bên dưới.':'Chọn ảnh hoặc PDF scan để AI đọc và điền thông tin.'}</span><input type="file" id="ai-file" accept="image/*,.pdf" hidden><button class="btn primary sm" data-act="aiInv" data-id="${inv.id}">Đọc bằng AI</button></div><div id="ai-st" class="sub"></div>`:''}
    ${inv.note?`<div class="callout warn">${esc(inv.note)}</div>`:''}
    ${lock?`<div class="callout ok">Đã ghi vào Bravo, số chứng từ <b class="mono">${inv.bravoNo}</b>.</div>`:iss.length?`<div class="callout bad">Chưa đẩy được sang Bravo: ${iss.map(esc).join(' · ')}</div>`:`<div class="callout ok">Đủ thông tin để đẩy sang Bravo.</div>`}
    ${r&&r[1]!=='ok'?`<div class="callout ${r[1]}">Rủi ro nhà cung cấp: ${esc(r[0])}</div>`:''}
    ${de.length?`<div class="callout warn">Thuế GTGT có thể không được khấu trừ: ${de.map(esc).join(' · ')}</div>`:''}
    <div><h3 class="sec">Thông tin hóa đơn</h3><div class="grid2">
     <div class="field"><label for="e-mst">MST người bán</label><input id="e-mst" value="${esc(inv.mst)}" ${dis}></div>
     <div class="field"><label for="e-ten">Tên người bán</label><input id="e-ten" value="${esc(inv.ten)}" ${dis}></div>
     <div class="field"><label for="e-kh">Ký hiệu</label><input id="e-kh" value="${esc(inv.kyhieu)}" ${dis}></div>
     <div class="field"><label for="e-so">Số hóa đơn</label><input id="e-so" value="${esc(inv.so)}" ${dis}></div>
     <div class="field"><label for="e-ngay">Ngày lập</label><input id="e-ngay" type="date" value="${esc(inv.ngay)}" ${dis}></div>
     <div class="field"><label for="e-ht">Thanh toán</label><select id="e-ht" ${dis}><option value="CK" ${inv.httt==='CK'?'selected':''}>Chuyển khoản</option><option value="TM" ${inv.httt==='TM'?'selected':''}>Tiền mặt</option></select></div>
    </div><div class="sub" style="margin-top:6px">Mã NCC Bravo: <b class="mono">${esc(S.ncc[inv.mst]||'chưa có – gán ở mục Ghép mã')}</b></div></div>
    <div><h3 class="sec">Dòng hàng và hạch toán</h3><div class="scroll"><table><thead><tr><th>Tên hàng</th><th class="num">SL</th><th class="num">Thành tiền</th><th class="num">TS</th><th>TK nợ / Khoản mục</th></tr></thead><tbody>
    ${inv.lines.map((l,ix)=>`<tr><td style="min-width:150px">${edit?`<input class="cell" style="width:100%" data-line="${ix}" data-f="ten" value="${esc(l.ten)}">`:esc(l.ten)}<div class="sub">${esc(l.dvt)}</div></td>
      <td class="num">${edit?`<input class="cell n" data-line="${ix}" data-f="sl" value="${l.sl}">`:fmt(l.sl)}</td>
      <td class="num">${edit?`<input class="cell n" style="width:110px" data-line="${ix}" data-f="tt" value="${l.tt}">`:fmt(l.tt)}</td>
      <td class="num">${edit?`<input class="cell n" style="width:46px" data-line="${ix}" data-f="ts" value="${l.ts}">`:l.ts+'%'}</td>
      <td><select class="cell ${l.tk?'':'missing'}" data-line="${ix}" data-f="tk" ${dis}>${tkO(l.tk)}</select><br><select class="cell" style="margin-top:4px" data-line="${ix}" data-f="km" ${dis}>${kmO(l.km)}</select></td></tr>`).join('')}
    </tbody></table></div>
    <div style="display:flex;justify-content:flex-end;gap:18px;margin-top:8px;flex-wrap:wrap" class="mono"><span>Trước thuế ${fmt(inv.truoc)}</span><span>Thuế ${fmt(inv.thue)}</span><b>Tổng ${fmt(inv.tong)}</b></div>
    <div class="sub" style="margin-top:6px">Thuế GTGT đầu vào tự hạch toán Nợ 1331 / Có 331 theo mã NCC.</div></div>
   </div>
   <footer>${lock?'':`<button class="btn" data-act="del" data-id="${inv.id}">Xóa</button><button class="btn" data-act="save" data-id="${inv.id}">Lưu</button><button class="btn primary" data-act="approve" data-id="${inv.id}">Lưu và duyệt</button>`}</footer></aside>`;}
function saveDrawer(id,approve){const inv=S.invoices.find(i=>i.id===id);const v=s=>$(s)?.value.trim()??'';const before=keyOf(inv);
  const nw={mst:v('#e-mst'),ten:v('#e-ten'),kyhieu:v('#e-kh'),so:v('#e-so'),ngay:v('#e-ngay'),httt:v('#e-ht')||'CK'};
  if(`${nw.mst}|${nw.kyhieu}|${nw.so}`!==before&&nw.mst&&nw.so&&S.invoices.some(x=>x!==inv&&keyOf(x)===`${nw.mst}|${nw.kyhieu}|${nw.so}`)){toast('Trùng với một hóa đơn đã có (MST + ký hiệu + số)');return;}
  Object.assign(inv,nw);
  document.querySelectorAll('.drawer [data-line]').forEach(el=>{const l=inv.lines[+el.dataset.line],f=el.dataset.f;if(['sl','tt','ts'].includes(f)){l[f]=vnNum(el.value);if(f!=='ts')l.dg=l.sl?Math.round(l.tt/l.sl):l.tt;}else l[f]=el.value;});
  recalc(inv);
  if(approve){const iss=issues(inv);if(iss.length){toast('Chưa duyệt được: '+iss.join(', '));render();openDrawer(id);return;}inv.status='duyet';inv.note='';}
  $('#overlay').innerHTML='';renderNav();render();toast(approve?'Đã duyệt, hóa đơn vào hàng chờ Bravo':'Đã lưu');}
async function aiInvoice(id){const inv=S.invoices.find(i=>i.id===id);let f=fileStore[id];
  if(!f){const inp=$('#ai-file');inp.onchange=()=>{if(inp.files[0]){fileStore[id]=inp.files[0];aiInvoice(id);}};inp.click();return;}
  const st=$('#ai-st');st.textContent='Đang đọc… thường mất 10–40 giây';
  try{const imgs=f.type==='application/pdf'||f.name.toLowerCase().endsWith('.pdf')?(await pdfToImages(f,2)).images:[f];
    const r=await aiRead(imgs);if(!r?.hoaDon)throw {code:'not_invoice'};
    const d=invFromAi(r.hoaDon,'Scan');Object.assign(inv,d,{source:'AI',status:'kiemtra',note:'Đọc bằng AI từ ảnh scan – đối chiếu với ảnh trước khi duyệt'});recalc(inv);autoMap(inv);
    if(r.hoaDon.tongCong&&Math.abs(r.hoaDon.tongCong-inv.tong)>2)inv.note+=` · Tổng trên ảnh ${fmt(r.hoaDon.tongCong)} khác tổng các dòng ${fmt(inv.tong)}`;
    if(S.invoices.some(x=>x!==inv&&inv.mst&&keyOf(x)===keyOf(inv)))inv.note='Cảnh báo: trùng với hóa đơn đã có. '+inv.note;
    render();openDrawer(id);toast('AI đã điền thông tin hóa đơn');}
  catch(e){st.textContent=e?.code==='not_invoice'?'AI không nhận ra đây là hóa đơn GTGT.':aiErrMsg(e?.code);}}
function xmlModal(){$('#overlay').innerHTML=`<div class="modal" data-closebg><div class="box" role="dialog" aria-label="Dán XML"><header><h2>Dán nội dung XML hóa đơn</h2><button class="x" data-close aria-label="Đóng">×</button></header>
  <div class="callout info" style="margin:12px 16px 0">XML mẫu theo chuẩn của Tổng cục Thuế. Sửa hoặc dán XML thật vào, app đọc như khi upload file.</div>
  <textarea id="xml-in" spellcheck="false" style="margin-top:8px">${esc(invToXml({khms:'1',kyhieu:'C26TQV',so:String(4400+Math.floor(Math.random()*500)),ngay:'2026-10-14',httt:'CK',ten:'Công ty TNHH Thiết bị Quạt Việt',mst:'0319990011',mccqt:'00A1B2C3D4E5F60718293A4B5C',lines:[{ten:'Quạt hút ly tâm 1,5kW',dvt:'Cái',sl:2,dg:8650000,tt:17300000,ts:10},{ten:'Lắp đặt, căn chỉnh tại công trình',dvt:'Gói',sl:1,dg:1200000,tt:1200000,ts:8}],truoc:18500000,thue:1826000,tong:20326000}))}</textarea>
  <footer><button class="btn" data-close>Hủy</button><button class="btn primary" data-act="xmlGo">Đọc XML</button></footer></div></div>`;}

/* ----- Tải hàng loạt ----- */
let bsel=new Set(),bopt={xml:true,html:true,xlsx:true};
VIEWS.batch=()=>{const list=S.invoices.filter(i=>i.mst&&i.so);
  return head('Tải hàng loạt','Chọn hóa đơn rồi tải một file ZIP gồm XML, bản thể hiện (HTML, in ra PDF được) và bảng kê Excel. Phần "Lấy PDF gốc" đang mô phỏng.',
   `<button class="btn" data-act="fetchPdf">Lấy PDF gốc từ nhà cung cấp</button><button class="btn primary" data-act="zip">Tải ZIP</button>`)+
  `<div class="toolbar">${[['xml','File XML'],['html','Bản thể hiện (HTML)'],['xlsx','Bảng kê Excel']].map(([k,l])=>`<label style="display:flex;gap:6px;align-items:center"><input type="checkbox" class="chk" data-bopt="${k}" ${bopt[k]?'checked':''}>${l}</label>`).join('')}<span class="sub" style="margin-left:auto">${bsel.size} hóa đơn được chọn</span></div>
  <div id="pdfbox"></div>
  <div class="panel"><div class="scroll"><table><thead><tr><th><input type="checkbox" class="chk" data-act="bAll" ${list.length&&list.every(i=>bsel.has(i.id))?'checked':''} aria-label="Chọn tất cả"></th><th>Hóa đơn</th><th>Người bán</th><th>Nhà cung cấp HĐĐT</th><th class="num">Tổng cộng</th><th>PDF gốc</th></tr></thead><tbody>
  ${list.map(i=>`<tr><td><input type="checkbox" class="chk" data-bsel="${i.id}" ${bsel.has(i.id)?'checked':''} aria-label="Chọn"></td><td class="mono">${esc(i.kyhieu)}<div class="sub">Số ${esc(i.so)} · ${dmy(i.ngay)}</div></td><td>${esc(i.ten)}</td><td class="sub">${esc(i.prov)}</td><td class="num">${fmt(i.tong)}</td><td>${i.pdf==='ok'?'<span class="pill ok">Đã có</span>':i.pdf==='loi'?'<span class="pill bad">Không lấy được</span>':'<span class="pill mut">Chưa lấy</span>'}</td></tr>`).join('')}
  </tbody></table></div></div>`;};
async function fetchPdf(){const list=S.invoices.filter(i=>bsel.has(i.id));if(!list.length){toast('Chọn ít nhất một hóa đơn');return;}
  const box=$('#pdfbox');box.innerHTML=`<div class="card" style="margin-bottom:12px"><b>Lấy PDF gốc từ trang tra cứu của nhà cung cấp (mô phỏng)</b><div class="progress" style="margin:8px 0"><i id="pp"></i></div><div class="log" id="plog"></div></div>`;
  for(let k=0;k<list.length;k++){const i=list[k];await sleep(300);const ok=!(i.prov==='BKAV eHoaDon'&&+i.so%2===1);i.pdf=ok?'ok':'loi';
    $('#plog').insertAdjacentHTML('beforeend',`<span class="${ok?'ok':'bad'}">${ok?'✓':'✕'} ${esc(i.kyhieu)}-${esc(i.so)} · ${esc(i.prov)}${ok?'':' · trang tra cứu yêu cầu mã bí mật'}</span>`);$('#pp').style.width=((k+1)/list.length*100)+'%';}
  await sleep(500);persist();render();toast('Đã cập nhật trạng thái PDF gốc');}
async function makeZip(){const list=S.invoices.filter(i=>bsel.has(i.id));if(!list.length){toast('Chọn ít nhất một hóa đơn');return;}
  const z=new JSZip();const nm=i=>`${i.mst}_${i.kyhieu}_${i.so}`;
  if(bopt.xml)list.forEach(i=>z.file(`XML/${nm(i)}.xml`,invToXml(i)));
  if(bopt.html)list.forEach(i=>z.file(`Ban_the_hien/${nm(i)}.html`,invToHtml(i)));
  if(bopt.xlsx)z.file('Bang_ke.xlsx',xlsxBytes(bkSheets(list)));
  await saveFile(`hoa_don_${list.length}_file.zip`,await z.generateAsync({type:'uint8array'}));}

/* ----- Bảng kê ----- */
let bk={mode:'th',from:'2026-09-01',to:'2026-10-31'};
const inRange=i=>i.ngay&&i.ngay>=bk.from&&i.ngay<=bk.to;
function bkSheets(list){
  const th=[['STT','Ngày','Ký hiệu','Số HĐ','MST người bán','Tên người bán','Tiền trước thuế','Tiền thuế','Tổng cộng','Thanh toán','Trạng thái','Số CT Bravo'],...list.map((i,k)=>[k+1,dmy(i.ngay),i.kyhieu,i.so,i.mst,i.ten,i.truoc,i.thue,i.tong,i.httt==='TM'?'Tiền mặt':'Chuyển khoản',STATUS[i.status][1],i.bravoNo])];
  const ct=[['Ngày','Ký hiệu','Số HĐ','MST','Người bán','Tên hàng','ĐVT','Số lượng','Đơn giá','Thành tiền','Thuế suất','Tiền thuế','TK nợ','Khoản mục'],...list.flatMap(i=>i.lines.map(l=>[dmy(i.ngay),i.kyhieu,i.so,i.mst,i.ten,l.ten,l.dvt,l.sl,l.dg,l.tt,l.ts+'%',Math.round(l.tt*l.ts/100),l.tk,l.km]))];
  return [{name:'Tong hop',aoa:th,cols:[5,11,9,9,13,38,14,12,14,12,13,14]},{name:'Chi tiet mat hang',aoa:ct,cols:[11,9,9,13,30,38,8,10,12,14,9,12,8,26]}];}
VIEWS.bk=()=>{const list=S.invoices.filter(inRange);
  const sum=(a,f)=>a.reduce((s,x)=>s+f(x),0);
  const body=bk.mode==='th'?`<thead><tr><th>Ngày</th><th>Ký hiệu / Số</th><th>Người bán</th><th class="num">Trước thuế</th><th class="num">Thuế</th><th class="num">Tổng cộng</th><th>TT</th></tr></thead><tbody>${list.map(i=>`<tr><td class="mono">${dmy(i.ngay)}</td><td class="mono">${esc(i.kyhieu)} · ${esc(i.so)}</td><td>${esc(i.ten)}<div class="sub mono">${esc(i.mst)}</div></td><td class="num">${fmt(i.truoc)}</td><td class="num">${fmt(i.thue)}</td><td class="num">${fmt(i.tong)}</td><td class="sub">${i.httt}</td></tr>`).join('')}</tbody>
   <tfoot><tr><td colspan="3">Cộng ${list.length} hóa đơn</td><td class="num">${fmt(sum(list,i=>i.truoc))}</td><td class="num">${fmt(sum(list,i=>i.thue))}</td><td class="num">${fmt(sum(list,i=>i.tong))}</td><td></td></tr></tfoot>`
  :(()=>{const ls=list.flatMap(i=>i.lines.map(l=>({i,l})));return `<thead><tr><th>Hóa đơn</th><th>Tên hàng</th><th>ĐVT</th><th class="num">SL</th><th class="num">Đơn giá</th><th class="num">Thành tiền</th><th class="num">TS</th><th>TK</th></tr></thead><tbody>${ls.map(({i,l})=>`<tr><td class="mono">${esc(i.kyhieu)}-${esc(i.so)}<div class="sub">${dmy(i.ngay)}</div></td><td style="min-width:200px">${esc(l.ten)}<div class="sub">${esc(i.ten)}</div></td><td>${esc(l.dvt)}</td><td class="num">${fmt(l.sl)}</td><td class="num">${fmt(l.dg)}</td><td class="num">${fmt(l.tt)}</td><td class="num">${l.ts}%</td><td class="mono">${esc(l.tk)||'—'}</td></tr>`).join('')}</tbody><tfoot><tr><td colspan="5">Cộng ${ls.length} dòng</td><td class="num">${fmt(sum(ls,x=>x.l.tt))}</td><td colspan="2"></td></tr></tfoot>`;})();
  return head('Bảng kê hóa đơn mua vào','Bảng kê tổng hợp theo hóa đơn và chi tiết theo mặt hàng. File Excel gồm cả hai sheet.',`<button class="btn primary" data-act="bkXlsx">Tải Excel</button>`)+
  `<div class="toolbar"><div class="seg"><button data-bkm="th" aria-pressed="${bk.mode==='th'}">Tổng hợp</button><button data-bkm="ct" aria-pressed="${bk.mode==='ct'}">Chi tiết mặt hàng</button></div>
   <label class="sub" for="bk-from">Từ</label><input type="date" id="bk-from" value="${bk.from}"><label class="sub" for="bk-to">đến</label><input type="date" id="bk-to" value="${bk.to}"></div>
  <div class="panel"><div class="scroll"><table>${body}</table></div></div>`;};

/* ----- Rủi ro NCC ----- */
VIEWS.risk=()=>{const m=new Map();S.invoices.filter(i=>i.mst).forEach(i=>{const o=m.get(i.mst)||{ten:i.ten,n:0,s:0};o.n++;o.s+=i.tong;m.set(i.mst,o);});
  const rows=[...m.entries()];const bad=rows.filter(([k])=>riskOf(k)?.[1]==='bad').length,unc=rows.filter(([k])=>!S.checked[k]).length;
  return head('Kiểm tra rủi ro nhà cung cấp','Tra trạng thái hoạt động theo MST của toàn bộ NCC. Hóa đơn của NCC rủi ro cao bị gắn cảnh báo và loại khỏi số thuế được khấu trừ trên tờ khai.',`<button class="btn primary" data-act="riskAll">Kiểm tra hàng loạt</button>`)+
  `<div class="callout warn" style="margin-bottom:12px">Kết quả tra cứu ở bản demo là dữ liệu mô phỏng.</div>
  <div class="stats" style="grid-template-columns:repeat(3,minmax(0,1fr))"><div class="stat"><div class="l">Nhà cung cấp</div><div class="n">${rows.length}</div></div><div class="stat"><div class="l"><span class="dot" style="background:var(--bad)"></span>Rủi ro cao</div><div class="n">${bad}</div></div><div class="stat"><div class="l"><span class="dot" style="background:var(--muted)"></span>Chưa kiểm tra</div><div class="n">${unc}</div></div></div>
  <div id="riskbox"></div>
  <div class="panel"><div class="scroll"><table><thead><tr><th>MST</th><th>Tên NCC</th><th class="num">Số HĐ</th><th class="num">Tổng giá trị</th><th>Tình trạng</th><th>Kiểm tra lúc</th></tr></thead><tbody>
  ${rows.map(([k,o])=>{const r=riskOf(k);return `<tr><td class="mono">${k}</td><td>${esc(o.ten)}</td><td class="num">${o.n}</td><td class="num">${fmt(o.s)}</td><td>${r?`<span class="pill ${r[1]}">${esc(r[0])}</span>`:'<span class="pill mut">Chưa kiểm tra</span>'}</td><td class="sub mono">${S.checked[k]||'—'}</td></tr>`;}).join('')}
  </tbody></table></div></div>`;};
async function riskAll(){const msts=[...new Set(S.invoices.filter(i=>i.mst).map(i=>i.mst))];const box=$('#riskbox');
  box.innerHTML=`<div class="card" style="margin-bottom:12px"><b>Đang tra cứu ${msts.length} MST…</b><div class="progress" style="margin-top:8px"><i id="rp"></i></div></div>`;
  for(let k=0;k<msts.length;k++){await sleep(160);S.checked[msts[k]]=new Date().toLocaleString('vi-VN',{hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit'});$('#rp').style.width=((k+1)/msts.length*100)+'%';}
  render();const bad=msts.filter(m=>riskOf(m)[1]==='bad').length;toast(bad?`Phát hiện ${bad} NCC rủi ro cao`:'Không có NCC rủi ro cao');}

/* ----- Ghép mã ----- */
VIEWS.map=()=>{const rows=[];S.invoices.forEach(i=>{if(i.status==='day')return;i.lines.forEach((l,ix)=>{if(!l.tk)rows.push({i,l,ix});});});
  const msts=[...new Map(S.invoices.filter(i=>i.mst).map(i=>[i.mst,i.ten])).entries()];
  return head('Ghép mã & hạch toán tự động','App tự gán tài khoản và khoản mục theo quy tắc từ khóa. Dòng nào chưa khớp quy tắc, bạn gán một lần và chọn "Nhớ" để lần sau app tự gán.')+
  `<div class="cols"><div class="card"><h3>Dòng hàng chưa có tài khoản</h3><p class="lead">${rows.length?`${rows.length} dòng cần gán.`:'Mọi dòng hàng đều đã có tài khoản.'}</p>
   <div class="scroll"><table><thead><tr><th>Hóa đơn</th><th>Tên hàng / dịch vụ</th><th>Gán</th><th>Nhớ</th></tr></thead><tbody>
   ${rows.map(({i,l,ix})=>`<tr><td class="mono">${esc(i.kyhieu)||'—'}<div class="sub">Số ${esc(i.so)||'—'}</div></td><td style="min-width:160px">${esc(l.ten)}<div class="sub">${esc(i.ten)}</div></td>
    <td><select class="cell" data-mapkm="${i.id}:${ix}"><option value="">— khoản mục —</option>${KM.map(k=>`<option>${k}</option>`).join('')}</select><br><select class="cell missing" style="margin-top:4px" data-map="${i.id}:${ix}"><option value="">— chọn TK để gán —</option>${TK.map(([k,lb])=>`<option value="${k}">${lb}</option>`).join('')}</select></td>
    <td><input type="checkbox" class="chk" data-remember="${i.id}:${ix}" checked aria-label="Nhớ quy tắc"></td></tr>`).join('')}</tbody></table></div></div>
  <div class="stack"><div class="card"><h3>Nhà cung cấp ↔ mã Bravo</h3><p class="lead">Mã NCC lấy từ danh mục Bravo. NCC chưa có mã sẽ không đẩy được.</p>
   <div class="scroll"><table><thead><tr><th>MST</th><th>Tên</th><th>Mã NCC</th></tr></thead><tbody>${msts.map(([m,t])=>`<tr><td class="mono">${m}</td><td>${esc(t)}</td><td><input class="cell mono ${S.ncc[m]?'':'missing'}" data-ncc="${m}" value="${esc(S.ncc[m]||'')}" placeholder="VD: NCC-PM09" style="width:115px"></td></tr>`).join('')}</tbody></table></div></div>
   <div class="card"><h3>Quy tắc tự gán</h3><p class="lead">Tên hàng chứa từ khóa thì gán TK và khoản mục tương ứng.</p>
   <div class="scroll"><table><thead><tr><th>Từ khóa (cách nhau bởi |)</th><th>TK</th><th>Khoản mục</th></tr></thead><tbody>${S.rules.map((r,ix)=>`<tr><td><input class="cell" style="width:100%;max-width:none" data-rule="${ix}:kw" value="${esc(r.kw)}"></td><td><input class="cell mono" style="width:58px" data-rule="${ix}:tk" value="${esc(r.tk)}"></td><td><input class="cell" data-rule="${ix}:km" value="${esc(r.km)}"></td></tr>`).join('')}</tbody></table></div></div></div></div>`;};

/* ----- Đẩy Bravo ----- */
let picked=new Set(),fmtB='sql',pushLog='';
const queue=()=>S.invoices.filter(i=>i.status==='duyet'||i.status==='loi');
function previewText(){const q=queue();const list=q.filter(i=>picked.has(i.id)).length?q.filter(i=>picked.has(i.id)):q;if(!list.length)return '-- Hàng chờ đang trống';
  if(fmtB==='tsv'){const h=['Ngày CT','Mã NCC','MST','Ký hiệu HĐ','Số HĐ','Diễn giải','TK nợ','TK có','Khoản mục','Số lượng','Thành tiền','Thuế suất','Tiền thuế'];return [h,...list.flatMap(i=>i.lines.map(l=>[dmy(i.ngay),S.ncc[i.mst]||'',i.mst,i.kyhieu,i.so,l.ten,l.tk,'331',(l.km||'').split(' · ')[0],l.sl,l.tt,l.ts+'%',Math.round(l.tt*l.ts/100)]))].map(r=>r.join('\t')).join('\n');}
  const sq=s=>`N'${String(s??'').replace(/'/g,"''")}'`;
  return `-- Bảng trung gian (tên giả định, chờ Bravo xác nhận)\n-- App ghi dữ liệu, Bravo chạy thủ tục tạo chứng từ\n\n`+list.map(i=>`INSERT INTO HDDV_Staging_Header (ExtId, VendorCode, TaxCode, InvSerial, InvNo, InvDate, PayMethod, Amount, VatAmount, Total, Status)\nVALUES (${i.id}, ${sq(S.ncc[i.mst]||'')}, '${i.mst}', '${i.kyhieu}', '${i.so}', '${i.ngay}', '${i.httt}', ${i.truoc}, ${i.thue}, ${i.tong}, 'NEW');\n`+i.lines.map((l,ix)=>`INSERT INTO HDDV_Staging_Detail (ExtId, LineNo, Description, DebitAcc, CreditAcc, CostItem, Qty, Amount, VatRate)\nVALUES (${i.id}, ${ix+1}, ${sq(l.ten)}, '${l.tk}', '331', '${(l.km||'').split(' · ')[0]}', ${l.sl}, ${l.tt}, ${l.ts});`).join('\n')).join('\n\n');}
VIEWS.bravo=()=>{const q=queue();[...picked].forEach(id=>{if(!q.some(i=>i.id===id))picked.delete(id);});const sel=q.filter(i=>picked.has(i.id));
  return head('Đẩy sang Bravo','Chỉ hóa đơn đã duyệt mới vào hàng chờ. App kiểm tra mã NCC và tài khoản trước khi ghi vào bảng trung gian của Bravo.')+
  `<div class="callout warn" style="margin-bottom:12px">Bước ghi vào Bravo đang mô phỏng. Tên bảng và tên cột là giả định, cần Bravo xác nhận.</div>
  <div class="cols"><div class="card"><h3>Hàng chờ</h3><div class="toolbar" style="margin-top:8px"><button class="btn accent" data-act="push" ${sel.length?'':'disabled'}>Đẩy sang Bravo</button><span class="sub">${sel.length?`${sel.length} hóa đơn · ${fmt(sel.reduce((s,i)=>s+i.tong,0))} đ`:'Chọn hóa đơn để đẩy'}</span></div>
   <div class="scroll"><table><thead><tr><th><input type="checkbox" class="chk" data-act="pAll" ${q.length&&q.every(i=>picked.has(i.id))?'checked':''} aria-label="Chọn tất cả"></th><th>Hóa đơn</th><th>Người bán</th><th class="num">Tổng cộng</th><th>Kiểm tra</th></tr></thead><tbody>
   ${q.length?q.map(i=>{const iss=issues(i);return `<tr><td><input type="checkbox" class="chk" data-pick="${i.id}" ${picked.has(i.id)?'checked':''} aria-label="Chọn"></td><td class="mono">${esc(i.kyhieu)}<div class="sub">Số ${esc(i.so)}</div></td><td style="min-width:150px">${esc(i.ten)}<div class="sub mono">${esc(S.ncc[i.mst]||'chưa có mã NCC')}</div></td><td class="num">${fmt(i.tong)}</td><td>${iss.length?`<span class="pill loi">${esc(iss[0])}</span>`:'<span class="pill day">Hợp lệ</span>'}</td></tr>`;}).join(''):`<tr><td colspan="5" class="empty">Chưa có hóa đơn đã duyệt.</td></tr>`}
   </tbody></table></div>
   <h3 class="sec" style="margin-top:14px">Nhật ký đồng bộ</h3><div class="progress" style="margin-bottom:8px"><i id="prog"></i></div><div class="log" id="log">${pushLog||'<span class="mut">Chưa có lần đẩy nào trong phiên này.</span>'}</div></div>
  <div class="card"><h3>Dữ liệu ghi vào Bravo</h3><p class="lead">Xem trước dữ liệu app sẽ ghi.</p><div class="toolbar"><select id="fmtB"><option value="sql" ${fmtB==='sql'?'selected':''}>SQL · bảng trung gian</option><option value="tsv" ${fmtB==='tsv'?'selected':''}>Excel · mẫu import</option></select><button class="btn sm" data-act="copyPrev">Sao chép</button></div><pre class="code" id="preview">${esc(previewText())}</pre></div></div>`;};
async function push(){const list=queue().filter(i=>picked.has(i.id));if(!list.length)return;
  const log=$('#log');log.innerHTML=`<span class="mut">${new Date().toLocaleTimeString('vi-VN')} · Bắt đầu đẩy ${list.length} hóa đơn…</span>`;document.querySelector('[data-act=push]').disabled=true;
  for(let k=0;k<list.length;k++){await sleep(400);const i=list[k],iss=issues(i);
    if(iss.length){i.status='loi';i.note='Bravo từ chối: '+iss.join(', ');log.insertAdjacentHTML('beforeend',`<span class="bad">✕ ${esc(i.kyhieu)}-${esc(i.so)} · ${esc(iss.join(', '))}</span>`);}
    else{i.status='day';i.note='';i.bravoNo=`MH-2610-${String(++S.bravoSeq).padStart(4,'0')}`;log.insertAdjacentHTML('beforeend',`<span class="ok">✓ ${esc(i.kyhieu)}-${esc(i.so)} → chứng từ ${i.bravoNo}</span>`);}
    $('#prog').style.width=((k+1)/list.length*100)+'%';}
  const ok=list.filter(i=>i.status==='day').length;log.insertAdjacentHTML('beforeend',`<span class="mut">Xong: ${ok} thành công, ${list.length-ok} lỗi.</span>`);pushLog=log.innerHTML;picked.clear();await sleep(400);renderNav();render();toast(`Bravo đã nhận ${ok}/${list.length} hóa đơn`);}

/* ----- Tờ khai & phụ lục ----- */
let tkp={type:'q',val:'2026-Q4'};
function periodRange(){if(tkp.type==='m'){const [y,m]=tkp.val.split('-').map(Number);const last=new Date(y,m,0).getDate();return [`${tkp.val}-01`,`${tkp.val}-${String(last).padStart(2,'0')}`];}
  const [y,q]=tkp.val.split('-Q').map(Number);const m1=(q-1)*3+1,m3=m1+2,last=new Date(y,m3,0).getDate();return [`${y}-${String(m1).padStart(2,'0')}-01`,`${y}-${String(m3).padStart(2,'0')}-${last}`];}
function tkData(){const [a,b]=periodRange();const list=S.invoices.filter(i=>i.ngay>=a&&i.ngay<=b&&i.mst&&i.so);
  const v23=list.reduce((s,i)=>s+i.truoc,0),v24=list.reduce((s,i)=>s+i.thue,0);const ex=list.filter(i=>dedErr(i).length);const v25=v24-ex.reduce((s,i)=>s+i.thue,0);
  const g=new Map();list.forEach(i=>i.lines.filter(l=>l.ts===8).forEach(l=>{const o=g.get(l.ten)||{v:0,t:0};o.v+=l.tt;o.t+=Math.round(l.tt*.08);g.set(l.ten,o);}));
  return {a,b,list,v23,v24,v25,ex,pl:[...g.entries()]};}
VIEWS.tk=()=>{const d=tkData();const opts=tkp.type==='m'?['2026-07','2026-08','2026-09','2026-10','2026-11','2026-12']:['2026-Q3','2026-Q4'];
  return head('Tờ khai thuế GTGT & phụ lục giảm thuế','Lập phần mua vào của tờ khai 01/GTGT và Mục I của phụ lục giảm thuế (hàng hóa, dịch vụ mua vào thuế suất 8%) từ hóa đơn trong kỳ.',`<button class="btn primary" data-act="tkXlsx">Tải Excel</button>`)+
  `<div class="toolbar"><div class="seg"><button data-tkt="m" aria-pressed="${tkp.type==='m'}">Tháng</button><button data-tkt="q" aria-pressed="${tkp.type==='q'}">Quý</button></div><select id="tk-val">${opts.map(o=>`<option ${o===tkp.val?'selected':''}>${o}</option>`).join('')}</select><span class="sub">Kỳ ${dmy(d.a)} – ${dmy(d.b)} · ${d.list.length} hóa đơn</span></div>
  <div class="cols"><div class="stack"><div class="card"><h3>Tờ khai 01/GTGT — phần mua vào</h3><p class="lead">Chỉ tiêu tính từ hóa đơn trong kỳ.</p>
   <div class="kv"><div class="code">[23]</div><div>Giá trị hàng hóa, dịch vụ mua vào</div><div class="v">${fmt(d.v23)}</div><div class="code">[24]</div><div>Thuế GTGT của hàng hóa, dịch vụ mua vào</div><div class="v">${fmt(d.v24)}</div><div class="code">[25]</div><div>Tổng thuế GTGT được khấu trừ kỳ này</div><div class="v"><b>${fmt(d.v25)}</b></div></div>
   ${d.ex.length?`<div class="callout warn" style="margin-top:12px"><b>${d.ex.length} hóa đơn bị loại khỏi [25]</b> (thuế ${fmt(d.v24-d.v25)} đ):<br>${d.ex.map(i=>`${esc(i.kyhieu)}-${esc(i.so)} ${esc(i.ten)}: ${esc(dedErr(i).join(', '))}`).join('<br>')}</div>`:''}
   <div class="sub" style="margin-top:10px">Điều kiện loại: thanh toán tiền mặt từ 5 triệu đồng; NCC rủi ro cao (sau khi chạy kiểm tra rủi ro NCC). Phần bán ra lấy từ dữ liệu hóa đơn đầu ra khi app có module đó.</div></div></div>
  <div class="card"><h3>Phụ lục giảm thuế GTGT — Mục I</h3><p class="lead">Hàng hóa, dịch vụ mua vào áp dụng thuế suất 8%.</p>
   <div class="scroll"><table><thead><tr><th>STT</th><th>Tên hàng hóa, dịch vụ</th><th class="num">Giá trị chưa thuế</th><th class="num">Thuế GTGT</th></tr></thead><tbody>${d.pl.length?d.pl.map(([n,o],k)=>`<tr><td>${k+1}</td><td>${esc(n)}</td><td class="num">${fmt(o.v)}</td><td class="num">${fmt(o.t)}</td></tr>`).join(''):'<tr><td colspan="4" class="empty">Không có hàng hóa thuế suất 8% trong kỳ.</td></tr>'}</tbody>
   ${d.pl.length?`<tfoot><tr><td colspan="2">Cộng</td><td class="num">${fmt(d.pl.reduce((s,[,o])=>s+o.v,0))}</td><td class="num">${fmt(d.pl.reduce((s,[,o])=>s+o.t,0))}</td></tr></tfoot>`:''}</table></div>
   <div class="sub" style="margin-top:10px">Mẫu phụ lục theo Nghị quyết 142/2024/QH15 và các nghị quyết gia hạn sau đó. Khi build cần đối chiếu mẫu áp dụng cho kỳ kê khai và phiên bản HTKK hiện hành.</div></div></div>`;};

/* ----- Gộp file ----- */
let mergeFiles=[],mergeOpt={hdr:true};
VIEWS.merge=()=>{const types=new Set(mergeFiles.map(f=>ftype(f)));
  return head('Gộp file hàng loạt','Gộp nhiều file PDF thành một PDF, hoặc nhiều file Excel/CSV thành một bảng (có cột ghi tên file nguồn). File xử lý ngay trên máy bạn, không gửi đi đâu.')+
  `<label class="drop" for="mfile"><div class="txt"><b>Chọn các file cần gộp</b><span>Cùng một loại: PDF, hoặc Excel/CSV. Thứ tự gộp theo danh sách bên dưới.</span></div><input type="file" id="mfile" multiple accept=".pdf,.xlsx,.xls,.csv,.docx" hidden><span class="btn primary">Chọn file</span></label>
  ${mergeFiles.length?`<div class="card"><div class="filelist">${mergeFiles.map((f,k)=>`<div><span class="src">${ftype(f).toUpperCase()}</span><span>${esc(f.name)}</span><span class="sub">${(f.size/1024).toFixed(0)} KB <button class="btn sm" data-mup="${k}" ${k?'':'disabled'} aria-label="Lên">↑</button> <button class="btn sm" data-mrm="${k}" aria-label="Bỏ">✕</button></span></div>`).join('')}</div>
   ${types.has('docx')?'<div class="callout warn">Gộp Word chưa có trong bản demo (sẽ làm ở phía server khi build).</div>':''}${types.size>1?'<div class="callout bad">Danh sách đang lẫn nhiều loại file. Chỉ gộp các file cùng loại.</div>':''}
   <div class="toolbar" style="margin-top:10px">${types.has('xlsx')?`<label style="display:flex;gap:6px;align-items:center"><input type="checkbox" class="chk" id="m-hdr" ${mergeOpt.hdr?'checked':''}>Dòng đầu mỗi file là tiêu đề</label>`:''}<button class="btn primary" data-act="doMerge" ${types.size===1&&!types.has('docx')?'':'disabled'}>Gộp và tải về</button><button class="btn" data-act="mClear">Xóa danh sách</button><span class="sub" id="m-st"></span></div></div>`:''}`;};
const ftype=f=>{const n=f.name.toLowerCase();return n.endsWith('.pdf')?'pdf':n.endsWith('.docx')?'docx':'xlsx';};
async function doMerge(){const st=$('#m-st');const t=ftype(mergeFiles[0]);st.textContent='Đang gộp…';
  try{if(t==='pdf'){const out=await PDFLib.PDFDocument.create();for(const f of mergeFiles){const src=await PDFLib.PDFDocument.load(await f.arrayBuffer(),{ignoreEncryption:true});(await out.copyPages(src,src.getPageIndices())).forEach(p=>out.addPage(p));}
      st.textContent=`Đã gộp ${out.getPageCount()} trang`;await saveFile(`gop_${mergeFiles.length}_file.pdf`,await out.save());}
    else{let all=[];for(const f of mergeFiles){const wb=XLSX.read(await f.arrayBuffer());wb.SheetNames.forEach(sn=>{const rows=XLSX.utils.sheet_to_json(wb.Sheets[sn],{header:1,defval:''}).filter(r=>r.some(c=>c!==''));if(!rows.length)return;
        if(mergeOpt.hdr){if(!all.length)all.push(['Nguồn file',...rows[0]]);rows.slice(1).forEach(r=>all.push([`${f.name} / ${sn}`,...r]));}else rows.forEach(r=>all.push([`${f.name} / ${sn}`,...r]));});}
      st.textContent=`Đã gộp ${all.length-(mergeOpt.hdr?1:0)} dòng`;await saveFile(`gop_${mergeFiles.length}_file.xlsx`,xlsxBytes([{name:'Gop',aoa:all}]));}}
  catch(e){st.textContent='Không gộp được: '+(e.message||e);}}

/* ----- Ảnh/PDF → Excel (AI) ----- */
let ocr={files:[],imgs:[],res:null,st:'',pages:0};
VIEWS.ocr=()=>{const r=ocr.res;
  return head('Chuyển ảnh/PDF sang Excel','AI đọc ảnh chụp hoặc PDF scan (hóa đơn, bảng kê, bảng tính) và trả về bảng dữ liệu. Nếu là hóa đơn, có thể thêm thẳng vào danh sách hóa đơn.')+
  `<div class="callout info" style="margin-bottom:12px">Ảnh được gửi lên Cloud Function của bạn, server gọi Claude API để đọc. Cần cấu hình Firebase và khóa API (xem README). Mỗi lần đọc tối đa 4 trang.</div>
  <label class="drop" for="ofile"><div class="txt"><b>Chọn ảnh hoặc PDF</b><span>JPG, PNG, WebP hoặc PDF (scan hay có chữ đều được)</span></div><input type="file" id="ofile" multiple accept="image/*,.pdf" hidden><span class="btn primary">Chọn file</span></label>
  ${ocr.imgs.length?`<div class="card"><div class="thumbs">${ocr.imgs.map(u=>`<img src="${u}" alt="Trang cần đọc">`).join('')}</div>${ocr.pages>4?`<div class="sub">PDF có ${ocr.pages} trang, bản demo đọc 4 trang đầu.</div>`:''}
   <div class="toolbar" style="margin-top:10px"><button class="btn primary" data-act="ocrGo">Đọc bằng AI</button><span class="sub">${esc(ocr.st)}</span></div></div>`:''}
  ${r?.bang?`<div class="card" style="margin-top:14px"><div class="toolbar"><h3 style="margin:0;flex:1">${r.loai==='hoa_don'?'Hóa đơn: '+esc(r.hoaDon?.tenBan||'')+' · '+esc(r.hoaDon?.kyhieu||'')+'-'+esc(r.hoaDon?.so||''):'Bảng dữ liệu'}</h3>
    ${r.hoaDon?`<button class="btn" data-act="ocrAdd">Thêm vào danh sách hóa đơn</button>`:''}<button class="btn primary" data-act="ocrXlsx">Tải Excel</button></div>
    <div class="scroll"><table><thead><tr>${(r.bang.cot||[]).map(c=>`<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${(r.bang.dong||[]).map(row=>`<tr>${row.map(c=>`<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    ${r.hoaDon?`<div class="mono" style="text-align:right;margin-top:8px">Trước thuế ${fmt(r.hoaDon.tienTruocThue)} · Thuế ${fmt(r.hoaDon.tienThue)} · <b>Tổng ${fmt(r.hoaDon.tongCong)}</b></div>`:''}</div>`:''}`;};
async function ocrLoad(files){ocr={files,imgs:[],res:null,st:'',pages:0};const blobs=[];
  for(const f of files){if(f.type==='application/pdf'||f.name.toLowerCase().endsWith('.pdf')){const {images,pages}=await pdfToImages(f,4-blobs.length);ocr.pages=Math.max(ocr.pages,pages);blobs.push(...images);}else blobs.push(f);if(blobs.length>=4)break;}
  ocr.blobs=blobs.slice(0,4);ocr.imgs=ocr.blobs.map(b=>URL.createObjectURL(b));render();}
async function ocrGo(){ocr.st='Đang đọc… thường mất 10–60 giây';render();
  try{ocr.res=await aiRead(ocr.blobs);if(!ocr.res?.bang)throw {code:'invalid_json'};ocr.st='Đã đọc xong';}catch(e){ocr.st=aiErrMsg(e?.code);}render();}

/* ----- Văn bản hàng loạt ----- */
VIEWS.docs=()=>{const t=TPLS[docState.tpl];if(!docState.tsv)docState.tsv=tplData(docState.tpl).map(r=>r.join('\t')).join('\n');const docs=fillDocs();
  return head('Soạn văn bản hàng loạt','Chọn mẫu, dán dữ liệu (copy thẳng từ Excel) hoặc lấy từ dữ liệu có sẵn trong app, rồi xuất một file Word chứa tất cả văn bản.',`<button class="btn primary" data-act="docx" ${docs.length?'':'disabled'}>Tải Word (${docs.length} văn bản)</button>`)+
  `<div class="cols"><div class="stack"><div class="card"><div class="grid2"><div class="field"><label for="d-tpl">Mẫu văn bản</label><select id="d-tpl">${Object.entries(TPLS).map(([k,v])=>`<option value="${k}" ${k===docState.tpl?'selected':''}>${v.name}</option>`).join('')}</select></div>
    <div class="field"><label for="d-co">Tên công ty (bên A)</label><input id="d-co" value="${esc(S.company)}"></div></div>
   <div class="toolbar" style="margin-top:12px"><span class="lbl" style="flex:1">Dữ liệu · mỗi dòng một văn bản · cột cách nhau bằng Tab</span><button class="btn sm" data-act="docFill">${t.from==='ncc'?'Lấy từ danh sách NCC':t.from==='emps'?'Lấy từ danh sách nhân viên':'Dữ liệu mẫu'}</button></div>
   <textarea class="grid" id="d-tsv" spellcheck="false">${esc(docState.tsv)}</textarea>
   <div class="sub" style="margin-top:6px">Dòng đầu là tên trường: ${t.fields.map(f=>`<span class="mono">${f}</span>`).join(', ')}</div></div></div>
  <div class="card"><h3>Xem trước văn bản 1/${docs.length||0}</h3><div class="docprev" style="margin-top:10px">${docs.length?docLines(docs[0]).map(({s,x})=>s==='t'?`<span class="t">${esc(x)}</span>`:s==='c'?`<span class="c">${esc(x)}</span>`:s==='b'?`<span class="b">${esc(x)}</span>`:esc(x)).join('\n'):'Chưa có dữ liệu.'}</div></div></div>`;};

/* ----- Bảng lương ----- */
let payTab='cc';
VIEWS.pay=()=>{const rows=S.emps.map(e=>({e,c:calcPay(e)}));const sum=f=>rows.reduce((s,x)=>s+f(x),0);
  const tabs=`<div class="seg">${[['cc','Chấm công'],['bl','Bảng lương tháng 10'],['qt','Quyết toán TNCN 2026']].map(([k,l])=>`<button data-pt="${k}" aria-pressed="${payTab===k}">${l}</button>`).join('')}</div>`;
  let body='';
  if(payTab==='cc')body=`<div class="toolbar"><label class="sub" for="p-cc">Công chuẩn tháng</label><input id="p-cc" class="cell n" value="${S.congChuan}"><span class="sub">Sửa trực tiếp ngày công, giờ OT, số người phụ thuộc. Giờ OT có thể lấy tự động từ phần mềm quản lý OT khi build.</span></div>
   <div class="panel"><div class="scroll"><table><thead><tr><th>Mã</th><th>Họ tên</th><th>Bộ phận</th><th class="num">Lương CB</th><th class="num">Phụ cấp</th><th class="num">Ngày công</th><th class="num">Giờ OT</th><th class="num">NPT</th></tr></thead><tbody>
   ${S.emps.map((e,k)=>`<tr><td class="mono">${e.ma}</td><td>${esc(e.ten)}</td><td class="sub">${esc(e.bp)}</td><td class="num"><input class="cell n" style="width:100px" data-emp="${k}:lcb" value="${e.lcb}"></td><td class="num"><input class="cell n" style="width:90px" data-emp="${k}:pc" value="${e.pc}"></td><td class="num"><input class="cell n" style="width:56px" data-emp="${k}:cong" value="${e.cong}"></td><td class="num"><input class="cell n" style="width:56px" data-emp="${k}:ot" value="${e.ot}"></td><td class="num"><input class="cell n" style="width:46px" data-emp="${k}:npt" value="${e.npt}"></td></tr>`).join('')}</tbody></table></div></div>`;
  if(payTab==='bl')body=`<div class="panel"><div class="scroll"><table><thead><tr><th>Họ tên</th><th class="num">Lương theo công</th><th class="num">Tiền OT</th><th class="num">Tổng thu nhập</th><th class="num">BH (10,5%)</th><th class="num">TN tính thuế</th><th class="num">Thuế TNCN</th><th class="num">Thực lĩnh</th></tr></thead><tbody>
   ${rows.map(({e,c})=>`<tr><td>${esc(e.ten)}<div class="sub mono">${e.ma} · ${e.cong} công · ${e.ot}h OT · ${e.npt} NPT</div></td><td class="num">${fmt(c.theoCong)}</td><td class="num">${fmt(c.otTien)}<div class="sub">miễn thuế ${fmt(c.otMien)}</div></td><td class="num">${fmt(c.gross)}</td><td class="num">${fmt(c.bh)}</td><td class="num">${fmt(c.tntt)}</td><td class="num">${fmt(c.tax)}</td><td class="num"><b>${fmt(c.net)}</b></td></tr>`).join('')}</tbody>
   <tfoot><tr><td>Cộng ${rows.length} người</td><td class="num">${fmt(sum(x=>x.c.theoCong))}</td><td class="num">${fmt(sum(x=>x.c.otTien))}</td><td class="num">${fmt(sum(x=>x.c.gross))}</td><td class="num">${fmt(sum(x=>x.c.bh))}</td><td class="num">${fmt(sum(x=>x.c.tntt))}</td><td class="num">${fmt(sum(x=>x.c.tax))}</td><td class="num">${fmt(sum(x=>x.c.net))}</td></tr></tfoot></table></div></div>
   <div class="sub" style="margin-top:8px">Cách tính: lương theo công = (lương CB + phụ cấp) × công / công chuẩn · OT ngày thường 150%, phần trả thêm 50% được miễn thuế · BH người lao động 10,5% trên lương đóng BH (trần ${fmt(S.capBH)}) · Giảm trừ bản thân 15,5 triệu, người phụ thuộc 6,2 triệu · Biểu thuế 5 bậc 5–35%.</div>`;
  if(payTab==='qt'){const months=[...new Set(S.hist.map(h=>h.m))].sort((a,b)=>a-b);
    const q=S.emps.map(e=>{const hs=S.hist.filter(h=>h.ma===e.ma);const tn=hs.reduce((s,h)=>s+h.gross-h.otMien,0),bh=hs.reduce((s,h)=>s+h.bh,0),n=hs.length;const gt=(GT_BT+e.npt*GT_NPT)*n;const tntt=Math.max(0,tn-bh-gt);const due=pit(tntt,n);const paid=hs.reduce((s,h)=>s+h.tax,0);return {e,n,tn,bh,gt,tntt,due,paid,diff:due-paid};});
    body=`<div class="toolbar"><span class="sub">Đã chốt lương các tháng: ${months.map(m=>'T'+m).join(', ')||'chưa có'}.</span><button class="btn" data-act="closeMonth">Chốt lương tháng 10</button></div>
    <div class="panel"><div class="scroll"><table><thead><tr><th>Họ tên</th><th class="num">Số tháng</th><th class="num">TN chịu thuế</th><th class="num">BH</th><th class="num">Giảm trừ GC</th><th class="num">TN tính thuế</th><th class="num">Thuế phải nộp</th><th class="num">Đã khấu trừ</th><th class="num">Nộp thêm / (hoàn)</th></tr></thead><tbody>
    ${q.map(x=>`<tr><td>${esc(x.e.ten)}<div class="sub mono">${x.e.ma}</div></td><td class="num">${x.n}</td><td class="num">${fmt(x.tn)}</td><td class="num">${fmt(x.bh)}</td><td class="num">${fmt(x.gt)}</td><td class="num">${fmt(x.tntt)}</td><td class="num">${fmt(x.due)}</td><td class="num">${fmt(x.paid)}</td><td class="num" style="color:var(--${x.diff>0?'bad':x.diff<0?'ok':'muted'})">${x.diff<0?'('+fmt(-x.diff)+')':fmt(x.diff)}</td></tr>`).join('')}</tbody></table></div></div>
    <div class="sub" style="margin-top:8px">Quyết toán tạm tính theo số tháng đã chốt, biểu thuế lũy tiến quy theo tháng × số tháng. Số liệu tháng 1–9 là dữ liệu mẫu.</div>`;}
  return head('Bảng lương','Chấm công, tính lương, thuế TNCN và quyết toán năm. Tham số thuế theo quy định 2026; kiểm tra lại văn bản hướng dẫn khi đưa vào dùng thật.',`<button class="btn primary" data-act="payXlsx">Tải Excel</button>`)+`<div class="toolbar">${tabs}</div>`+body;};

/* ----- Thành viên (phân quyền) ----- */
const ROLES={admin:'Quản trị (kế toán trưởng)',ketoan:'Kế toán',xem:'Chỉ xem'};
VIEWS.members=()=>{
  if(!window.Cloud?.enabled)return head('Thành viên','Quản lý ai được vào app.')+`<div class="callout info">App đang chạy ở chế độ thử (chưa cấu hình Firebase) nên chưa có đăng nhập và phân quyền. Xem README, mục "Tạo Firebase".</div>`;
  const admin=Cloud.role==='admin';
  return head('Thành viên','Người đăng nhập lần đầu sẽ thấy mã UID của họ. Quản trị nhập UID đó vào đây để cấp quyền.')+
  `<div class="cols"><div class="card"><h3>Danh sách thành viên</h3><div class="scroll" style="margin-top:10px"><table><thead><tr><th>Email</th><th>Vai trò</th><th>UID</th><th></th></tr></thead><tbody id="mem-rows"><tr><td colspan="4" class="empty">Đang tải…</td></tr></tbody></table></div></div>
  <div class="card"><h3>Thêm thành viên</h3>${admin?`<p class="lead">Chỉ quản trị mới thêm hoặc xóa được thành viên.</p>
   <div class="stack" style="gap:10px"><div class="field"><label for="m-uid">UID</label><input id="m-uid" placeholder="Dán UID người dùng gửi cho bạn"></div>
   <div class="field"><label for="m-email">Email</label><input id="m-email" type="email"></div>
   <div class="field"><label for="m-role">Vai trò</label><select id="m-role">${Object.entries(ROLES).map(([k,v])=>`<option value="${k}" ${k==='ketoan'?'selected':''}>${v}</option>`).join('')}</select></div>
   <button class="btn primary" data-act="addMember">Cấp quyền</button></div>`:`<p class="lead">Vai trò của bạn: <b>${ROLES[Cloud.role]||Cloud.role}</b>. Liên hệ quản trị để thêm người.</p>`}</div></div>`;};
AFTER.members=async()=>{if(!window.Cloud?.enabled)return;const el=$('#mem-rows');
  try{const ms=await Cloud.listMembers();el.innerHTML=ms.map(m=>`<tr><td>${esc(m.email)||'—'}</td><td>${esc(ROLES[m.role]||m.role)}</td><td class="mono sub">${esc(m.uid)}</td><td>${Cloud.role==='admin'&&m.uid!==Cloud.user.uid?`<button class="btn sm" data-act="rmMember" data-uid="${esc(m.uid)}">Xóa</button>`:''}</td></tr>`).join('');}
  catch(e){el.innerHTML=`<tr><td colspan="4" class="empty">Không đọc được danh sách (${esc(e.code||e.message)}).</td></tr>`;}};

/* ----- Ghi chú build ----- */
VIEWS.notes=()=>{const R=[
 ['Vô hạn hóa đơn','Chạy thật trên Firestore (mỗi hóa đơn một bản ghi)','Phân trang và tìm kiếm phía server khi vượt vài chục nghìn hóa đơn; lưu file XML/PDF gốc lên Firebase Storage'],
 ['Đồng bộ từ cơ quan thuế','Mô phỏng','Job chạy nền dùng tài khoản tra cứu hóa đơn của doanh nghiệp (có captcha, cổng có thể đổi giao diện). Phương án thay thế: API MISA hoặc API nhà cung cấp hóa đơn. Cần rà điều khoản sử dụng'],
 ['Tải PDF gốc tự động','Mô phỏng','Mỗi nhà cung cấp hóa đơn (VNPT, Viettel, MISA, BKAV…) một connector, dùng mã tra cứu/link trong XML. Phần tốn công nhất, làm dần theo NCC hay gặp'],
 ['Tải XML, bản thể hiện hàng loạt','Chạy thật (sinh từ dữ liệu, ZIP)','Lưu XML gốc có chữ ký số và mã cơ quan thuế thay vì sinh lại; bản thể hiện xuất thẳng PDF phía server'],
 ['Bảng kê tổng hợp, chi tiết mặt hàng','Chạy thật, xuất Excel','Thêm mẫu bảng kê theo yêu cầu kế toán, lọc theo dự án/công trình'],
 ['Kiểm tra rủi ro NCC','Mô phỏng','Tra trạng thái MST từ cơ quan thuế hoặc dịch vụ dữ liệu doanh nghiệp; đối chiếu danh sách doanh nghiệp rủi ro cao; chạy định kỳ'],
 ['Gộp file PDF, Excel, Word','PDF và Excel chạy thật; Word chưa','Gộp Word phía server (docx merge); giới hạn dung lượng theo gói'],
 ['Hạch toán tự động','Chạy thật (quy tắc từ khóa)','Thêm AI gợi ý TK theo lịch sử hạch toán; danh mục TK/khoản mục/NCC đồng bộ từ Bravo'],
 ['Đẩy sang Bravo','Mô phỏng (xem trước SQL/Excel)','Theo phương án Bravo chốt: bảng trung gian, API hoặc import; nhận số chứng từ và lỗi trả về'],
 ['Lập tờ khai, phụ lục giảm thuế','Chạy thật phần mua vào','Thêm hóa đơn đầu ra; xuất file XML nhập HTKK; cập nhật mẫu phụ lục theo nghị quyết hiện hành'],
 ['Chuyển ảnh/PDF sang Excel','Chạy thật qua Cloud Function docAi (Claude API)','Giới hạn số trang theo gói (50/100 trang như bảng giá tham khảo), lưu kết quả và ảnh gốc'],
 ['Bảng lương: chấm công, tính lương, quyết toán','Chạy thật','Nhập chấm công từ máy chấm công/Excel, lấy giờ OT từ phần mềm quản lý OT; mẫu 05/QTT-TNCN; phiếu lương gửi email'],
 ['Soạn hợp đồng, biên bản hàng loạt','Chạy thật, xuất .docx','Cho người dùng tự tải mẫu Word có {{trường}}; xuất từng file riêng trong ZIP; ký số']];
  return head('Ghi chú build','Đối chiếu từng tính năng trong bảng giá tham khảo với trạng thái trong demo và việc cần làm khi lên bản thật.',`<button class="btn" data-act="reset">Khôi phục dữ liệu mẫu</button>`)+
  `<div class="panel"><div class="scroll"><table><thead><tr><th>Tính năng</th><th>Trong demo</th><th>Khi build thật</th></tr></thead><tbody>${R.map(([a,b,c])=>`<tr><td style="min-width:170px"><b>${a}</b></td><td style="min-width:150px"><span class="pill ${b.startsWith('Mô phỏng')?'warn':b.includes('chưa')?'duyet':'ok'}">${b}</span></td><td style="min-width:260px">${c}</td></tr>`).join('')}</tbody></table></div></div>
  <div class="card" style="margin-top:14px"><h3>Kiến trúc gợi ý</h3><p class="lead" style="margin:0">Web app (frontend như demo) + API server + job chạy nền (đồng bộ cơ quan thuế, tải PDF gốc, tra rủi ro) + database. Bravo nối qua bảng trung gian trên SQL Server. AI đọc chứng từ gọi từ server. Khi chưa cấu hình Firebase, dữ liệu lưu trong trình duyệt. Nút "Khôi phục dữ liệu mẫu" ghi đè toàn bộ dữ liệu hiện tại bằng dữ liệu mẫu.</p></div>`;};

/* ============================================================ SỰ KIỆN ============================================================ */
const ACT={
 sync:doSync,
 approveAll(){let n=0;S.invoices.forEach(i=>{if(i.status==='moi'&&!issues(i).length){i.status='duyet';n++;}});renderNav();render();toast(n?`Đã duyệt ${n} hóa đơn`:'Không có hóa đơn mới nào đủ mã để duyệt');},
 xmlModal,
 xmlGo(){try{const inv=parseXml($('#xml-in').value);if(S.invoices.some(x=>keyOf(x)===keyOf(inv))){toast('Hóa đơn này đã có (trùng MST + ký hiệu + số)');return;}autoMap(inv);S.invoices.unshift(inv);$('#overlay').innerHTML='';renderNav();render();toast(`Đã đọc XML: ${inv.ten} · ${fmt(inv.tong)} đ`);openDrawer(inv.id);}catch(e){toast(e.message);}},
 save:el=>saveDrawer(+el.dataset.id,false), approve:el=>saveDrawer(+el.dataset.id,true),
 del(el){S.invoices=S.invoices.filter(i=>i.id!==+el.dataset.id);$('#overlay').innerHTML='';renderNav();render();toast('Đã xóa hóa đơn');},
 aiInv:el=>aiInvoice(+el.dataset.id),
 bAll(el){S.invoices.filter(i=>i.mst&&i.so).forEach(i=>el.checked?bsel.add(i.id):bsel.delete(i.id));render();},
 fetchPdf, zip:makeZip,
 signOut(){Cloud.signOut();},
 async addMember(){const uid=$('#m-uid').value.trim(),email=$('#m-email').value.trim(),role=$('#m-role').value;if(uid.length<10){toast('UID không hợp lệ');return;}
   try{await Cloud.addMember(uid,email,role);toast('Đã cấp quyền '+(email||uid));render();}catch(e){toast('Không thêm được: '+(e.code||e.message));}},
 async rmMember(el){if(el.dataset.confirm!=='1'){el.dataset.confirm='1';el.textContent='Bấm lần nữa để xóa';return;}
   try{await Cloud.removeMember(el.dataset.uid);toast('Đã xóa thành viên');render();}catch(e){toast('Không xóa được: '+(e.code||e.message));}},
 bkXlsx(){const list=S.invoices.filter(inRange);saveFile(`bang_ke_${bk.from}_${bk.to}.xlsx`,xlsxBytes(bkSheets(list)));},
 riskAll,
 push, pAll(el){queue().forEach(i=>el.checked?picked.add(i.id):picked.delete(i.id));render();},
 copyPrev(){const t=$('#preview').textContent;navigator.clipboard?.writeText(t).then(()=>toast('Đã sao chép')).catch(()=>{const r=document.createRange();r.selectNodeContents($('#preview'));const s=getSelection();s.removeAllRanges();s.addRange(r);toast('Đã chọn sẵn nội dung, nhấn Ctrl+C');});},
 tkXlsx(){const d=tkData();saveFile(`to_khai_mua_vao_${tkp.val}.xlsx`,xlsxBytes([{name:'To khai 01GTGT',aoa:[['Chỉ tiêu','Nội dung','Giá trị'],['[23]','Giá trị HHDV mua vào',d.v23],['[24]','Thuế GTGT của HHDV mua vào',d.v24],['[25]','Tổng thuế GTGT được khấu trừ kỳ này',d.v25],[],['Hóa đơn bị loại khỏi [25]'],...d.ex.map(i=>[i.kyhieu+'-'+i.so,i.ten,i.thue,dedErr(i).join(', ')])],cols:[10,40,16,30]},{name:'Phu luc giam thue',aoa:[['Mục I. Hàng hóa, dịch vụ mua vào thuế suất 8%'],['STT','Tên hàng hóa, dịch vụ','Giá trị chưa thuế','Thuế GTGT'],...d.pl.map(([n,o],k)=>[k+1,n,o.v,o.t])],cols:[6,45,18,14]},{name:'Bang ke',aoa:bkSheets(d.list)[0].aoa}]));},
 doMerge, mClear(){mergeFiles=[];render();},
 ocrGo, ocrXlsx(){const r=ocr.res;saveFile('ket_qua_doc_anh.xlsx',xlsxBytes([{name:'Du lieu',aoa:[r.bang.cot||[],...(r.bang.dong||[])]}]));},
 ocrAdd(){const d=invFromAi(ocr.res.hoaDon,'AI');const inv=mk({...d,source:'AI',status:'kiemtra',note:'Đọc bằng AI từ ảnh – đối chiếu trước khi duyệt'});if(inv.mst&&inv.so&&S.invoices.some(x=>keyOf(x)===keyOf(inv))){toast('Hóa đơn này đã có trong danh sách');return;}autoMap(inv);S.invoices.unshift(inv);renderNav();persist();toast('Đã thêm vào danh sách hóa đơn');},
 docFill(){docState.tsv=tplData(docState.tpl).map(r=>r.join('\t')).join('\n');render();},
 async docx(){const docs=fillDocs();if(docs.length)saveFile(`${TPLS[docState.tpl].name.replace(/\s+/g,'_')}_${docs.length}_ban.docx`,await docxBytes(docs));},
 payXlsx(){const rows=S.emps.map(e=>({e,c:calcPay(e)}));saveFile('bang_luong_thang_10_2026.xlsx',xlsxBytes([{name:'Bang luong T10',aoa:[['Mã','Họ tên','Bộ phận','Lương CB','Phụ cấp','Ngày công','Giờ OT','NPT','Lương theo công','Tiền OT','OT miễn thuế','Tổng thu nhập','BH NLĐ','TN tính thuế','Thuế TNCN','Thực lĩnh'],...rows.map(({e,c})=>[e.ma,e.ten,e.bp,e.lcb,e.pc,e.cong,e.ot,e.npt,c.theoCong,c.otTien,c.otMien,c.gross,c.bh,c.tntt,c.tax,c.net])],cols:[8,20,14,12,10,9,8,6,14,12,12,14,12,14,12,14]}]));},
 closeMonth(){S.hist=S.hist.filter(h=>h.m!==10);S.emps.forEach(e=>S.hist.push({m:10,ma:e.ma,...calcPay(e)}));render();toast('Đã chốt lương tháng 10');},
 reset(el){if(el.dataset.confirm!=='1'){el.dataset.confirm='1';el.textContent='Bấm lần nữa: ghi đè toàn bộ dữ liệu';return;}seed();bsel.clear();picked.clear();pushLog='';ocr={files:[],imgs:[],res:null,st:'',pages:0};mergeFiles=[];docState={tpl:'bbdc',tsv:''};renderNav();render();toast('Đã khôi phục dữ liệu mẫu');}
};
document.addEventListener('click',e=>{const t=e.target;
  const g=t.closest('[data-go]');if(g){go(g.dataset.go);return;}
  const st=t.closest('[data-st]');if(st){filt.status=st.dataset.st;render();return;}
  const o=t.closest('[data-open]');if(o){openDrawer(+o.dataset.open);return;}
  if(t.closest('[data-close]')||t.matches('[data-closebg]')){$('#overlay').innerHTML='';return;}
  const bm=t.closest('[data-bkm]');if(bm){bk.mode=bm.dataset.bkm;render();return;}
  const tt=t.closest('[data-tkt]');if(tt){tkp.type=tt.dataset.tkt;tkp.val=tkp.type==='m'?'2026-10':'2026-Q4';render();return;}
  const pt=t.closest('[data-pt]');if(pt){payTab=pt.dataset.pt;render();return;}
  const mu=t.closest('[data-mup]');if(mu){const k=+mu.dataset.mup;[mergeFiles[k-1],mergeFiles[k]]=[mergeFiles[k],mergeFiles[k-1]];render();return;}
  const mr=t.closest('[data-mrm]');if(mr){mergeFiles.splice(+mr.dataset.mrm,1);render();return;}
  const a=t.closest('[data-act]');if(a&&ACT[a.dataset.act]){if(a.tagName!=='INPUT')e.preventDefault();ACT[a.dataset.act](a,e);}
});
document.addEventListener('change',e=>{const t=e.target,d=t.dataset;
  if(t.id==='file'){handleFiles([...t.files]);t.value='';return;}
  if(t.id==='f-src'){filt.src=t.value;$('#rows').innerHTML=rowsHtml();return;}
  if(d.bsel){t.checked?bsel.add(+d.bsel):bsel.delete(+d.bsel);render();return;}
  if(d.bopt){bopt[d.bopt]=t.checked;return;}
  if(t.id==='bk-from'||t.id==='bk-to'){bk[t.id==='bk-from'?'from':'to']=t.value;render();return;}
  if(d.pick){t.checked?picked.add(+d.pick):picked.delete(+d.pick);render();return;}
  if(t.id==='fmtB'){fmtB=t.value;$('#preview').textContent=previewText();return;}
  if(d.ncc){const v=t.value.trim();if(v)S.ncc[d.ncc]=v;else delete S.ncc[d.ncc];render();toast(v?`Đã gán ${v}`:'Đã bỏ mã NCC');return;}
  if(d.rule){const [ix,f]=d.rule.split(':');S.rules[+ix][f]=t.value;let n=0;S.invoices.forEach(i=>{if(i.status==='day')return;const b=i.lines.filter(l=>!l.tk).length;autoMap(i);n+=b-i.lines.filter(l=>!l.tk).length;});render();if(n)toast(`Quy tắc mới đã gán thêm ${n} dòng`);return;}
  if(d.map){const [id,ix]=d.map.split(':');const inv=S.invoices.find(i=>i.id===+id);const l=inv.lines[+ix];if(!t.value)return;l.tk=t.value;l.km=document.querySelector(`[data-mapkm="${id}:${ix}"]`)?.value||'';
    if(document.querySelector(`[data-remember="${id}:${ix}"]`)?.checked){const kw=l.ten.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu,' ').split(/\s+/).filter(w=>w.length>1).slice(0,3).join(' ');S.rules.push({kw,tk:l.tk,km:l.km});S.invoices.forEach(i=>i.status!=='day'&&autoMap(i));toast(`Đã gán ${l.tk} và lưu quy tắc "${kw}"`);}else toast(`Đã gán ${l.tk}`);
    renderNav();render();return;}
  if(t.closest('.drawer')&&d.f==='tk'){t.classList.toggle('missing',!t.value);return;}
  if(t.id==='tk-val'){tkp.val=t.value;render();return;}
  if(t.id==='mfile'){mergeFiles.push(...t.files);t.value='';render();return;}
  if(t.id==='m-hdr'){mergeOpt.hdr=t.checked;return;}
  if(t.id==='ofile'){if(t.files.length)ocrLoad([...t.files]).catch(err=>toast('Không mở được file: '+err.message));t.value='';return;}
  if(t.id==='d-tpl'){docState.tpl=t.value;docState.tsv='';render();return;}
  if(t.id==='d-co'){S.company=t.value.trim()||S.company;render();return;}
  if(t.id==='d-tsv'){docState.tsv=t.value;render();return;}
  if(t.id==='p-cc'){S.congChuan=Math.max(1,vnNum(t.value)||26);render();return;}
  if(d.emp){const [k,f]=d.emp.split(':');S.emps[+k][f]=vnNum(t.value);if(f==='lcb')S.emps[+k].lbh=S.emps[+k].lcb;persist();toast(`Đã cập nhật ${S.emps[+k].ten}`);return;}
});
document.addEventListener('input',e=>{if(e.target.id==='q'){filt.q=e.target.value;$('#rows').innerHTML=rowsHtml();}});
document.addEventListener('keydown',e=>{if(e.key==='Escape')$('#overlay').innerHTML='';});

/* Khởi động — gọi từ index.html sau khi cloud.js sẵn sàng */
async function startApp(){
  let loaded=false;
  if(window.Cloud?.enabled){const st=await Cloud.loadState();if(st){S=st;loaded=true;}}
  else loaded=load();
  if(!loaded){seed();if(window.Cloud?.enabled)Cloud.save(S,true);}
  try{const r=localStorage.getItem(STORE+'-route');if(r&&VIEWS[r])route=r;}catch(e){}
  renderNav();render();
}
window.startApp=startApp;
