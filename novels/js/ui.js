// 確かめる・書きとめる小さな枠。ブラウザの confirm() や prompt() は使えない場所があるので、ページの中に出す

function frame(inner, onKey) {
  const box = document.createElement('div');
  box.className = 'ask';
  box.innerHTML = `<div role="dialog" aria-modal="true">${inner}</div>`;
  const key = (e) => onKey(e);
  addEventListener('keydown', key, true);
  document.body.append(box);
  return { box, close: () => { box.remove(); removeEventListener('keydown', key, true); } };
}

export function ask(text, yes) {
  return new Promise((resolve) => {
    const { box, close } = frame(
      '<p></p><div class="row"><button data-v="0">やめる</button><button data-v="1" class="yes"></button></div>',
      (e) => { if (e.key === 'Escape') { e.stopPropagation(); done(false); } },
    );
    const done = (v) => { close(); resolve(v); };
    box.querySelector('p').textContent = text;
    box.querySelector('.yes').textContent = yes;
    box.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) done(b.dataset.v === '1');
      else if (e.target === box) done(false);
    });
    box.querySelector('[data-v="0"]').focus();
  });
}

// 文章を書いてもらう。しまったら文字列、やめたら null
export function compose({ value = '', placeholder = '', yes = 'しまう' } = {}) {
  return new Promise((resolve) => {
    const { box, close } = frame(
      '<textarea rows="7"></textarea><div class="row"><button data-v="0">やめる</button><button data-v="1" class="yes"></button></div>',
      (e) => {
        if (e.key === 'Escape') { e.stopPropagation(); done(null); }
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); done(area.value); }
      },
    );
    const area = box.querySelector('textarea');
    const done = (v) => { close(); resolve(v == null ? null : v.trim()); };
    area.value = value;
    area.placeholder = placeholder;
    box.querySelector('.yes').textContent = yes;
    box.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) done(b.dataset.v === '1' ? area.value : null);
    });
    box.firstElementChild.classList.add('wide');
    area.focus();
  });
}
