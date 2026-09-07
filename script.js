// ============================================
// Web Patch — 창 생성 / 이동 / 크기조절 / 닫기 / 최소화 / 로컬 저장
// ============================================

// ---- HTML 요소 가져오기 ----
const canvas   = document.getElementById('canvas');
const urlInput = document.getElementById('url-input');
const btnAdd   = document.getElementById('btn-add');
const dock     = document.getElementById('minimized-dock');

// ---- 전역 상태 ----
let windows  = [];   // 모든 창의 데이터. 화면이 아니라 이 배열이 "진짜 데이터"
let zCounter = 1;    // z-index로 쓸 숫자

const KEY = 'webpatch-windows';


// ============================================
// 1. 창 그리기
// ============================================

function createWindow(data) {
  const { id, url, x, y, w, h, z, state } = data;

  // --- 창 본체 ---
  const win = document.createElement('div');
  win.className    = 'window';
  win.dataset.id   = id;
  win.style.left   = x + 'px';
  win.style.top    = y + 'px';
  win.style.width  = w + 'px';
  win.style.height = h + 'px';
  win.style.zIndex = z;

  // --- 타이틀바 ---
  const bar = document.createElement('div');
  bar.className = 'window-titlebar';
  bar.innerHTML = `
    <span class="dot dot-red"></span>
    <span class="dot dot-yellow"></span>
    <span class="hostname">${safeHost(url)}</span>
  `;

  // --- 본문 (iframe) ---
  const body = document.createElement('div');
  body.className = 'window-body';

  const iframe = document.createElement('iframe');
  iframe.src = url;
  body.appendChild(iframe);

  win.append(bar, body);
  canvas.appendChild(win);

  // --- 점 클릭 동작 ---
  // 빨강 = 닫기, 노랑 = 최소화. 둘 다 삭제가 아니라 숨기기다.
  bar.querySelector('.dot-red')
     .addEventListener('click', () => closeWindow(id));

  bar.querySelector('.dot-yellow')
     .addEventListener('click', () => minimizeWindow(id));

  makeDraggable(win, bar);
  watchResize(win);

  // 저장된 상태가 open이 아니면 화면에서 감춘 채로 시작
  if (state === 'minimized') {
    win.style.display = 'none';
    addStrip(data);
  } else if (state === 'closed') {
    win.style.display = 'none';
  }

  return win;
}


function safeHost(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}


// ============================================
// 2. 창 추가하기
// ============================================

function addWindow(rawUrl) {
  const url = rawUrl.startsWith('http') ? rawUrl : 'https://' + rawUrl;

  const data = {
    id: Date.now() + '',
    url: url,
    x: window.innerWidth  / 2 + (Math.random() - 0.5) * 200,
    y: window.innerHeight / 2 + (Math.random() - 0.5) * 200,
    w: 316,
    h: 257,
    z: ++zCounter,
    state: 'open'          // 'open' | 'minimized' | 'closed'
  };

  windows.push(data);
  createWindow(data);
  save();
}


function addFromInput() {
  const raw = urlInput.value.trim();
  if (!raw) return;

  addWindow(raw);
  urlInput.value = '';
}

btnAdd.addEventListener('click', addFromInput);

urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addFromInput();
});


// ============================================
// 3. 닫기 / 최소화 / 복원
// ============================================

// 두 동작이 공유하는 부분: 위치를 기억하고 화면에서 감춘다
function hideWindow(id, nextState) {
  const win  = document.querySelector(`.window[data-id="${id}"]`);
  const data = windows.find(w => w.id === id);

  if (!win || !data || data.state !== 'open') return null;

  data.x = win.offsetLeft;
  data.y = win.offsetTop;
  data.state = nextState;

  win.style.display = 'none';   // 지우지 않고 감추기만 한다
  save();

  return data;
}


// 노랑 — 최소화: 좌하단에 띠를 남긴다
function minimizeWindow(id) {
  const data = hideWindow(id, 'minimized');
  if (!data) return;

  addStrip(data);
}


// 빨강 — 닫기: 아무 흔적도 남기지 않는다
function closeWindow(id) {
  hideWindow(id, 'closed');
  // 도크에 띠를 만들지 않는다.
  // 나중에 Recent 로그를 만들면 그 로그가 유일한 복구 경로가 된다.
}


// 도크에 최소화 띠 만들기
function addStrip(data) {
  const strip = document.createElement('div');
  strip.className   = 'minimized-strip';
  strip.dataset.for = data.id;
  strip.innerHTML = `
    <span class="dot dot-red"></span>
    <span class="dot dot-yellow"></span>
    <span class="hostname">${safeHost(data.url)}</span>
  `;

  strip.addEventListener('click', () => restoreWindow(data.id));
  dock.appendChild(strip);
}


// 복원: 최소화된 창을 다시 캔버스로
function restoreWindow(id) {
  const win  = document.querySelector(`.window[data-id="${id}"]`);
  const data = windows.find(w => w.id === id);

  if (!win || !data || data.state === 'open') return;

  win.style.display = 'flex';
  win.style.left    = data.x + 'px';
  win.style.top     = data.y + 'px';
  win.style.zIndex  = ++zCounter;
  data.state = 'open';

  // 도크에 띠가 있으면 치운다
  const strip = dock.querySelector(`[data-for="${id}"]`);
  if (strip) strip.remove();

  save();
}


// ============================================
// 4. 드래그로 이동
// ============================================

function makeDraggable(win, handle) {
  let offsetX  = 0;
  let offsetY  = 0;
  let dragging = false;

  handle.addEventListener('mousedown', (e) => {
    // 점을 눌렀을 때는 드래그를 시작하지 않는다
    if (e.target.classList.contains('dot')) return;

    dragging = true;
    win.classList.add('dragging');
    win.style.zIndex = ++zCounter;

    offsetX = e.clientX - win.offsetLeft;
    offsetY = e.clientY - win.offsetTop;
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;

    win.style.left = (e.clientX - offsetX) + 'px';
    win.style.top  = (e.clientY - offsetY) + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;

    dragging = false;
    win.classList.remove('dragging');

    const data = windows.find(w => w.id === win.dataset.id);
    if (data) {
      data.x = win.offsetLeft;
      data.y = win.offsetTop;
      data.z = Number(win.style.zIndex);
      save();
    }
  });
}


// ============================================
// 5. 크기조절 감지
// ============================================

function watchResize(win) {
  let timer;

  const ro = new ResizeObserver(() => {
    clearTimeout(timer);

    timer = setTimeout(() => {
      const data = windows.find(w => w.id === win.dataset.id);
      if (!data) return;

      data.w = win.offsetWidth;
      data.h = win.offsetHeight;
      save();
    }, 300);
  });

  ro.observe(win);
}


// ============================================
// 6. 저장 / 불러오기
// ============================================

function save() {
  localStorage.setItem(KEY, JSON.stringify(windows));
}

function load() {
  const raw = localStorage.getItem(KEY);
  if (!raw) return;

  try {
    windows = JSON.parse(raw);
  } catch {
    windows = [];
    return;
  }

  windows.forEach((data) => {
    // 예전에 저장된 데이터엔 state가 없을 수 있으므로 기본값을 넣어준다
    if (!data.state) data.state = 'open';

    createWindow(data);

    if (data.z > zCounter) zCounter = data.z;
  });
}


load();

// 인트로 창들 — 드래그 + 최소화 (저장은 안 됨, 새로고침하면 다시 나타남)
document.querySelectorAll('.window.intro').forEach((win) => {
  const bar = win.querySelector('.window-titlebar');
  makeDraggable(win, bar);

  const yellow = bar.querySelector('.dot-yellow');
  if (!yellow) return;

  yellow.addEventListener('click', () => {
    win.style.display = 'none';

    const strip = document.createElement('div');
    strip.className = 'minimized-strip';
    strip.innerHTML = `
      <span class="dot dot-yellow"></span>
      <span class="hostname-kr">${bar.querySelector('.hostname-kr').textContent.trim()}</span>
    `;
    strip.addEventListener('click', () => {
      win.style.display = 'flex';
      win.style.zIndex = ++zCounter;
      strip.remove();
    });
    dock.appendChild(strip);
  });
});