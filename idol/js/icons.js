// アイコン(SVG 直書き)。どこかのOSのそっくりにならないよう、形は自前で単純にしている
const Icons = (() => {
  const s = (inner, vb = '0 0 24 24') => `<svg viewBox="${vb}" aria-hidden="true">${inner}</svg>`;
  const file = (color, label) => s(
    `<path d="M5 2.5h9.5L19.5 7.5V21.5H5z" fill="#fff" stroke="#8a8f98" stroke-width="1"/>
     <path d="M14.5 2.5V7.5H19.5" fill="#e9ebee" stroke="#8a8f98" stroke-width="1"/>
     <rect x="3" y="12" width="13" height="7" rx="1" fill="${color}"/>
     <text x="9.5" y="17.6" font-size="5.2" font-family="Arial, sans-serif" font-weight="700" fill="#fff" text-anchor="middle">${label}</text>`);
  const lib = {
    folder: s(`<path d="M2 6.5a1.5 1.5 0 0 1 1.5-1.5H9l2 2h9.5A1.5 1.5 0 0 1 22 8.5V18.5A1.5 1.5 0 0 1 20.5 20h-17A1.5 1.5 0 0 1 2 18.5z" fill="#e8b53f"/><path d="M2 9h20v9.5A1.5 1.5 0 0 1 20.5 20h-17A1.5 1.5 0 0 1 2 18.5z" fill="#f5c84f"/>`),
    mail: s(`<rect x="2.5" y="5" width="19" height="14" rx="1.5" fill="#2f7ed8"/><path d="M3 6l9 7 9-7" fill="none" stroke="#fff" stroke-width="1.6"/>`),
    browser: s(`<circle cx="12" cy="12" r="9.5" fill="#1b9e8f"/><path d="M2.5 12h19M12 2.5c3 3 3 16 0 19M12 2.5c-3 3-3 16 0 19" fill="none" stroke="#dff5f1" stroke-width="1.2"/>`),
    chat: s(`<path d="M3 5.5A2.5 2.5 0 0 1 5.5 3h13A2.5 2.5 0 0 1 21 5.5v9a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4h0A2.5 2.5 0 0 1 3 14.5z" fill="#3fb34f"/><circle cx="8" cy="10" r="1.3" fill="#fff"/><circle cx="12" cy="10" r="1.3" fill="#fff"/><circle cx="16" cy="10" r="1.3" fill="#fff"/>`),
    calendar: s(`<rect x="3" y="4.5" width="18" height="16" rx="1.5" fill="#fff" stroke="#c0392b" stroke-width="1.2"/><rect x="3" y="4.5" width="18" height="4.5" fill="#d64b3c"/><text x="12" y="18" font-size="8" font-family="Arial" font-weight="700" fill="#333" text-anchor="middle">30</text>`),
    sheet: file('#1f8a4c', 'XLS'),
    txt: file('#6b7280', 'TXT'),
    pdf: file('#c4372f', 'PDF'),
    img: file('#7b57c9', 'IMG'),
    eml: file('#2f7ed8', 'EML'),
    doc: file('#2b5fb4', 'DOC'),
    trash: s(`<path d="M6 7h12l-1 13.5H7z" fill="#dfe3e8" stroke="#7d848e"/><rect x="4.5" y="5" width="15" height="2" fill="#a6adb6"/><rect x="9.5" y="3.5" width="5" height="1.6" fill="#a6adb6"/><path d="M10 10v8M14 10v8" stroke="#7d848e"/>`),
    start: s(`<rect x="3" y="3" width="8" height="8" rx="1" fill="#3a8fd6"/><rect x="13" y="3" width="8" height="8" rx="1" fill="#3a8fd6"/><rect x="3" y="13" width="8" height="8" rx="1" fill="#3a8fd6"/><rect x="13" y="13" width="8" height="8" rx="1" fill="#3a8fd6"/>`),
    note: s(`<path d="M4 3h16v13l-5 5H4z" fill="#ffe680"/><path d="M15 21v-5h5" fill="#f0cf4a"/>`),
    wmin: s(`<path d="M6 12h12" stroke="currentColor" stroke-width="1.2"/>`),
    wmax: s(`<rect x="6.5" y="6.5" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.2"/>`),
    wclose: s(`<path d="M6.5 6.5l11 11M17.5 6.5l-11 11" stroke="currentColor" stroke-width="1.2"/>`),
    info: s(`<circle cx="12" cy="12" r="10" fill="#2f7ed8"/><rect x="11" y="10" width="2" height="7" fill="#fff"/><circle cx="12" cy="7.5" r="1.2" fill="#fff"/>`),
    warn: s(`<path d="M12 2.5l10 18H2z" fill="#f2b632"/><rect x="11" y="9" width="2" height="6" fill="#3b2d00"/><circle cx="12" cy="17.5" r="1.1" fill="#3b2d00"/>`),
    wifi: s(`<path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.2a9.5 9.5 0 0 1 13 0M8.5 15.3a5 5 0 0 1 7 0" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="18.5" r="1.4" fill="currentColor"/>`),
    vol: s(`<path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z" fill="currentColor"/><path d="M15 9a4 4 0 0 1 0 6M17.5 6.5a7.5 7.5 0 0 1 0 11" fill="none" stroke="currentColor" stroke-width="1.5"/>`),
    battery: s(`<rect x="2.5" y="7.5" width="17" height="9" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.4"/><rect x="20" y="10" width="1.8" height="4" fill="currentColor"/><rect x="4.2" y="9.2" width="3.4" height="5.6" fill="#e2574c"/>`),
    search: s(`<circle cx="10.5" cy="10.5" r="6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M15 15l5.5 5.5" stroke="currentColor" stroke-width="2"/>`),
    back: s(`<path d="M14.5 5.5L8 12l6.5 6.5" fill="none" stroke="currentColor" stroke-width="1.6"/>`),
    fwd: s(`<path d="M9.5 5.5L16 12l-6.5 6.5" fill="none" stroke="currentColor" stroke-width="1.6"/>`),
    reload: s(`<path d="M18.5 12a6.5 6.5 0 1 1-2-4.7" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M17 3.5v4.5h-4.5" fill="none" stroke="currentColor" stroke-width="1.6"/>`),
    lock: s(`<rect x="6" y="11" width="12" height="9" rx="1.5" fill="currentColor"/><path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" fill="none" stroke="currentColor" stroke-width="1.6"/>`),
    user: s(`<circle cx="12" cy="9" r="4" fill="#9aa3ad"/><path d="M4 21a8 8 0 0 1 16 0z" fill="#9aa3ad"/>`),
    pen: s(`<path d="M4 20l1-4.5L15.5 5l3.5 3.5L8.5 19z" fill="none" stroke="currentColor" stroke-width="1.5"/>`),
    xrep: s(`<path d="M4 11a7 6.5 0 0 1 7-6.5h2a7 6.5 0 0 1 0 13h-1l-5 3v-3.6A6.5 6.5 0 0 1 4 11z" fill="none" stroke="currentColor" stroke-width="1.5"/>`),
    xrt: s(`<path d="M7 18V7h9M13 4l3 3-3 3M17 6v11H8M11 20l-3-3 3-3" fill="none" stroke="currentColor" stroke-width="1.5"/>`),
    xlike: s(`<path d="M12 20s-7.5-4.6-7.5-10A4.2 4.2 0 0 1 12 7.5 4.2 4.2 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z" fill="none" stroke="currentColor" stroke-width="1.5"/>`),
    xview: s(`<path d="M5 20V12M10 20V5M15 20v-9M20 20V9" stroke="currentColor" stroke-width="1.6"/>`),
    power: s(`<path d="M12 3v8" stroke="currentColor" stroke-width="1.8"/><path d="M7 6.5a7 7 0 1 0 10 0" fill="none" stroke="currentColor" stroke-width="1.8"/>`),
  };
  return { get: k => lib[k] || lib.txt };
})();

// 宣材写真のかわり。photo にパスが入ったら画像を出す
function photoSlot(c, cls) {
  if (c.photo) return `<div class="photo ${cls || ''}"><img src="${c.photo}" alt=""></div>`;
  return `<div class="photo ${cls || ''}"><svg viewBox="0 0 60 80" aria-hidden="true"><rect width="60" height="80" fill="#cfd3d8"/><circle cx="30" cy="30" r="12" fill="#a9afb7"/><path d="M8 80c2-18 12-26 22-26s20 8 22 26z" fill="#a9afb7"/></svg></div>`;
}
