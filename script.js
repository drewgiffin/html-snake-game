const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const GRID = 20;
const COLS = canvas.width / GRID;
const ROWS = canvas.height / GRID;
const TICK = 120;
const MAX_ENTRIES = 10;

// ── Skin colors ──────────────────────────────────────────────────────────
const SKINS = [
  { label: 'Green',   hex: '#4ade80', complement: '#fde047' },
  { label: 'Cyan',    hex: '#22d3ee', complement: '#818cf8' },
  { label: 'Blue',    hex: '#60a5fa', complement: '#c084fc' },
  { label: 'Purple',  hex: '#a78bfa', complement: '#f472b6' },
  { label: 'Pink',    hex: '#f472b6', complement: '#fb7185' },
  { label: 'Red',     hex: '#f87171', complement: '#fb923c' },
  { label: 'Orange',  hex: '#fb923c', complement: '#fbbf24' },
  { label: 'Yellow',  hex: '#facc15', complement: '#fb923c' },
];
const SKIN_KEY = 'snake_skin';
let activeSkin = SKINS[Math.floor(Math.random() * SKINS.length)];
let snakeColor = activeSkin.hex;

// Build swatches
let pendingColor = snakeColor;

function previewOverlay(hex) {
  const skinBox = document.getElementById('skin-box');
  skinBox.style.borderColor = hex;
  skinBox.style.boxShadow = `0 0 30px ${hex}33`;
  skinBox.querySelector('h2').style.color = hex;
  document.getElementById('btn-play').style.background = hex;
}

const swatchContainer = document.getElementById('skin-swatches');
SKINS.forEach(skin => {
  const el = document.createElement('div');
  el.className = 'swatch' + (skin.hex === snakeColor ? ' selected' : '');
  el.style.background = skin.hex;
  el.style.boxShadow = `0 0 8px ${skin.hex}88`;
  el.title = skin.label;
  el.addEventListener('click', () => {
    document.querySelectorAll('.swatch').forEach(s => s.classList.remove('selected'));
    el.classList.add('selected');
    pendingColor = skin.hex;
    previewOverlay(pendingColor);
  });
  swatchContainer.appendChild(el);
});

function applyColor(hex) {
  const skin = SKINS.find(s => s.hex === hex) || SKINS[0];
  const accent = skin.complement;
  canvas.style.borderColor = hex;
  canvas.style.boxShadow = `0 0 20px ${hex}55`;
  document.querySelector('h1').style.color = hex;
  document.documentElement.style.setProperty('--snake-color', hex);
  document.documentElement.style.setProperty('--accent-color', accent);
}

function openSkinOverlay() {
  pendingColor = snakeColor;
  document.querySelectorAll('.swatch').forEach(s => {
    s.classList.toggle('selected', s.title === (SKINS.find(sk => sk.hex === snakeColor)?.label));
  });
  previewOverlay(snakeColor);
  document.getElementById('skin-overlay').classList.remove('hidden');
}

function closeSkinOverlay() {
  if (pendingColor !== snakeColor) {
    activeSkin = SKINS.find(s => s.hex === pendingColor) || SKINS[0];
    snakeColor = pendingColor;
    localStorage.setItem(SKIN_KEY, snakeColor);
    applyColor(snakeColor);
    render();
  }
  document.getElementById('skin-overlay').classList.add('hidden');
}

document.getElementById('btn-play').addEventListener('click', closeSkinOverlay);
document.getElementById('btn-skin').addEventListener('click', openSkinOverlay);

// Apply initial color to UI
applyColor(snakeColor);
previewOverlay(snakeColor);

let snake, dir, nextDir, food, score, gameOver, started, loop;
let waitingForInput = false; // block keypresses while modal is open

// ── Leaderboard persistence ───────────────────────────────────────────────
let board = [];
const LS_KEY = 'snake_leaderboard';
const supportsFileAPI = 'showOpenFilePicker' in window;
let fileHandle = null;

// ── IndexedDB helpers to persist the file handle across page loads ────────
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('snake_db', 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore('handles');
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });
}

async function storeHandle(handle) {
  try {
    const db = await openDB();
    const tx = db.transaction('handles', 'readwrite');
    tx.objectStore('handles').put(handle, 'scores_file');
    return new Promise(resolve => { tx.oncomplete = resolve; tx.onerror = resolve; });
  } catch { /* ignore */ }
}

async function getStoredHandle() {
  try {
    const db = await openDB();
    return new Promise(resolve => {
      const tx = db.transaction('handles', 'readonly');
      const req = tx.objectStore('handles').get('scores_file');
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    });
  } catch { return null; }
}

async function clearStoredHandle() {
  try {
    const db = await openDB();
    const tx = db.transaction('handles', 'readwrite');
    tx.objectStore('handles').delete('scores_file');
  } catch { /* ignore */ }
}

// ── File handle helpers ───────────────────────────────────────────────────
async function ensureWritePermission(handle) {
  const opts = { mode: 'readwrite' };
  if ((await handle.queryPermission(opts)) === 'granted') return true;
  if ((await handle.requestPermission(opts)) === 'granted') return true;
  return false;
}

function setLinkedUI(name) {
  const btn = document.getElementById('lb-file-btn');
  btn.textContent = 'LINKED: ' + name;
  btn.classList.add('linked');
}

function setUnlinkedUI() {
  const btn = document.getElementById('lb-file-btn');
  btn.textContent = 'LINK scores.json';
  btn.classList.remove('linked');
}

async function readBoardFromHandle(handle) {
  const file = await handle.getFile();
  const text = await file.text();
  try { return JSON.parse(text); } catch { return []; }
}

async function initBoard() {
  // Try to restore a previously linked file handle
  const stored = await getStoredHandle();
  if (stored) {
    const granted = await ensureWritePermission(stored);
    if (granted) {
      fileHandle = stored;
      board = await readBoardFromHandle(fileHandle);
      setLinkedUI((await fileHandle.getFile()).name);
      renderBoard();
      return;
    } else {
      // Permission denied this session — forget the handle
      await clearStoredHandle();
    }
  }

  // Fall back to localStorage
  const lsData = localStorage.getItem(LS_KEY);
  if (lsData) {
    try { board = JSON.parse(lsData); } catch { board = []; }
  } else {
    try {
      const res = await fetch('./scores.json');
      if (res.ok) board = await res.json();
    } catch { board = []; }
  }
  renderBoard();
}

async function linkFile() {
  if (!supportsFileAPI) {
    alert('Your browser does not support the File System Access API.\nUse Chrome or Edge to enable direct file saving.');
    return;
  }
  try {
    [fileHandle] = await window.showOpenFilePicker({
      types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
      multiple: false,
    });
    // Explicitly request write permission
    const granted = await ensureWritePermission(fileHandle);
    if (!granted) {
      alert('Write permission denied. Choose the file again and allow write access.');
      fileHandle = null;
      return;
    }
    // Persist handle so it survives page reloads
    await storeHandle(fileHandle);
    // Read scores from file (file is the source of truth when linked)
    board = await readBoardFromHandle(fileHandle);
    localStorage.setItem(LS_KEY, JSON.stringify(board));
    renderBoard();
    setLinkedUI((await fileHandle.getFile()).name);
  } catch {
    // User cancelled picker — leave state unchanged
  }
}

async function saveBoard() {
  if (fileHandle) {
    try {
      const writable = await fileHandle.createWritable();
      await writable.write(JSON.stringify(board, null, 2));
      await writable.close();
      return; // file saved — skip localStorage
    } catch (e) {
      console.warn('Could not write scores file:', e);
      // Handle may have gone stale — unlink it
      fileHandle = null;
      await clearStoredHandle();
      setUnlinkedUI();
    }
  }
  localStorage.setItem(LS_KEY, JSON.stringify(board));
}

function downloadBoard() {
  const blob = new Blob([JSON.stringify(board, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'scores.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

document.getElementById('lb-file-btn').addEventListener('click', linkFile);

function qualifiesForBoard(s) {
  if (s <= 0) return false;
  return board.length < MAX_ENTRIES || s > board[board.length - 1].score;
}

function addToBoard(name, s) {
  board.push({ name: name.trim() || 'Anonymous', score: s, color: snakeColor });
  board.sort((a, b) => b.score - a.score);
  if (board.length > MAX_ENTRIES) board.length = MAX_ENTRIES;
  saveBoard();
  renderBoard();
}

function renderBoard() {
  const list = document.getElementById('lb-list');
  const empty = document.getElementById('lb-empty');
  list.innerHTML = '';
  if (board.length === 0) { empty.style.display = 'block'; return; }
  empty.style.display = 'none';
  const medals = ['🥇', '🥈', '🥉'];
  board.forEach((entry, i) => {
    const li = document.createElement('li');
    const nameColor = entry.color ? `style="color:${entry.color}"` : '';
    li.innerHTML = `
      <span class="lb-rank">${medals[i] ?? (i + 1)}</span>
      <span class="lb-name" title="${entry.name}" ${nameColor}>${entry.name}</span>
      <span class="lb-score">${entry.score}</span>`;
    list.appendChild(li);
  });
}

function bestScore() {
  return board.length ? board[0].score : 0;
}

// ── Modal ────────────────────────────────────────────────────────────────
function showModal(s) {
  waitingForInput = true;
  document.getElementById('modal-score').textContent = s;
  document.getElementById('name-input').value = '';
  // Theme modal with accent + snake color
  const accent = activeSkin.complement;
  const modal = document.getElementById('modal');
  modal.style.borderColor = accent;
  modal.style.boxShadow = `0 0 30px ${accent}44`;
  modal.querySelector('h2').style.color = accent;
  document.getElementById('name-input').style.borderColor = snakeColor;
  document.getElementById('modal-overlay').classList.add('show');
  setTimeout(() => document.getElementById('name-input').focus(), 50);
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('show');
  waitingForInput = false;
  document.getElementById('message').textContent = 'Press WASD or arrow keys to restart';
}

document.getElementById('btn-save').addEventListener('click', () => {
  const name = document.getElementById('name-input').value;
  addToBoard(name, score);
  closeModal();
});

document.getElementById('btn-skip').addEventListener('click', () => {
  closeModal();
});

document.getElementById('name-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-save').click();
  if (e.key === 'Escape') document.getElementById('btn-skip').click();
  e.stopPropagation(); // don't let game hear these keys
});

// ── Game logic ───────────────────────────────────────────────────────────
function init() {
  snake = [
    { x: 10, y: 10 },
    { x: 9,  y: 10 },
    { x: 8,  y: 10 },
  ];
  dir = { x: 1, y: 0 };
  nextDir = { x: 1, y: 0 };
  score = 0;
  gameOver = false;
  started = false;
  placeFood();
  updateScore();
  render();
  document.getElementById('message').textContent = 'Press WASD or arrow keys to start';
}

const FRUITS = ['🍎','🍊','🍋','🍇','🍓','🍒','🍑','🥝','🍉','🍌','🫐','🍍'];

function placeFood() {
  do {
    food = {
      x: Math.floor(Math.random() * COLS),
      y: Math.floor(Math.random() * ROWS),
    };
  } while (snake.some(s => s.x === food.x && s.y === food.y));
  food.emoji = FRUITS[Math.floor(Math.random() * FRUITS.length)];
}

function updateScore() {
  document.getElementById('score').textContent = score;
  document.getElementById('best').textContent = Math.max(bestScore(), score);
}

function step() {
  dir = nextDir;
  const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

  if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS) { end(); return; }
  if (snake.some(s => s.x === head.x && s.y === head.y))             { end(); return; }

  snake.unshift(head);
  if (head.x === food.x && head.y === food.y) {
    score++;
    updateScore();
    placeFood();
  } else {
    snake.pop();
  }
  render();
}

function end() {
  gameOver = true;
  clearInterval(loop);
  render();
  document.getElementById('btn-skin').style.visibility = 'visible';

  if (qualifiesForBoard(score)) {
    setTimeout(() => showModal(score), 300);
  } else {
    document.getElementById('message').textContent = 'Game over! Press WASD or arrows to restart';
  }
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Grid dots
  ctx.fillStyle = '#1e293b';
  for (let x = 0; x < COLS; x++)
    for (let y = 0; y < ROWS; y++)
      ctx.fillRect(x * GRID + GRID / 2 - 1, y * GRID + GRID / 2 - 1, 2, 2);

  // Food — random fruit emoji
  ctx.font = `${GRID - 4}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(food.emoji, food.x * GRID + GRID / 2, food.y * GRID + GRID / 2);

  // Snake
  const r = parseInt(snakeColor.slice(1, 3), 16);
  const g = parseInt(snakeColor.slice(3, 5), 16);
  const b = parseInt(snakeColor.slice(5, 7), 16);
  snake.forEach((seg, i) => {
    const isHead = i === 0;
    const t = 1 - i / snake.length;
    ctx.fillStyle = isHead ? snakeColor : `rgba(${r},${g},${b},${0.3 + t * 0.7})`;
    ctx.shadowColor = isHead ? snakeColor : 'transparent';
    ctx.shadowBlur = isHead ? 8 : 0;
    const pad = isHead ? 1 : 2;
    ctx.fillRect(seg.x * GRID + pad, seg.y * GRID + pad, GRID - pad * 2, GRID - pad * 2);
  });
  ctx.shadowBlur = 0;

  // Game over overlay
  if (gameOver) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#f87171';
    ctx.font = 'bold 2rem Courier New';
    ctx.textAlign = 'center';
    ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2 - 10);
    ctx.fillStyle = '#eee';
    ctx.font = '1rem Courier New';
    ctx.fillText(`Score: ${score}`, canvas.width / 2, canvas.height / 2 + 22);
    ctx.textAlign = 'left';
  }
}

function startGame() {
  if (waitingForInput) return;
  if (gameOver) { init(); return; }
  if (!started) {
    started = true;
    document.getElementById('message').textContent = 'WASD or arrow keys to move';
    document.getElementById('btn-skin').style.visibility = 'hidden';
    loop = setInterval(step, TICK);
  }
}

document.addEventListener('keydown', e => {
  if (!document.getElementById('skin-overlay').classList.contains('hidden')) return;
  if (waitingForInput) return;
  const map = {
    w: { x: 0, y: -1 }, ArrowUp:    { x: 0, y: -1 },
    s: { x: 0, y:  1 }, ArrowDown:  { x: 0, y:  1 },
    a: { x: -1, y: 0 }, ArrowLeft:  { x: -1, y: 0 },
    d: { x:  1, y: 0 }, ArrowRight: { x:  1, y: 0 },
  };
  const newDir = map[e.key];
  if (!newDir) return;
  e.preventDefault();
  if (newDir.x === -dir.x && newDir.y === -dir.y) return;
  nextDir = newDir;
  startGame();
});

window.addEventListener('keydown', e => {
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) e.preventDefault();
}, { passive: false });

// ── Boot ─────────────────────────────────────────────────────────────────
initBoard();
init();
