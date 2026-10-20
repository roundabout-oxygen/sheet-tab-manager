'use strict';

const API = 'https://sheets.googleapis.com/v4/spreadsheets';
const TEMP_KEY = 'tempShown'; // { [spreadsheetId]: sheetId[] }  一時表示中のシート
const SS_RE = /^[\w-]{1,128}$/;

class StmError extends Error {
  constructor(code, message, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- 認証 ----------
// getAuthToken は「Chrome にログイン中のプロフィールのアカウント」のトークンを返す。
// スプレッドシートを別アカウントで開いている場合は 403/404 になる(README参照)。
async function getToken(interactive) {
  const cid = chrome.runtime.getManifest().oauth2?.client_id || '';
  if (!cid || cid.startsWith('YOUR_')) {
    throw new StmError('NO_CLIENT_ID', 'manifest.json の oauth2.client_id が未設定です(README参照)');
  }
  try {
    const r = await chrome.identity.getAuthToken({ interactive });
    const token = typeof r === 'string' ? r : r?.token;
    if (!token) throw new Error('トークンを取得できませんでした');
    return token;
  } catch (e) {
    throw new StmError('AUTH', e.message || String(e));
  }
}

// GET は通信エラー/5xx/429 で再試行する。POST は二重実行(複製が2枚できる等)を避けるため 429 のみ再試行。
async function api(path, init = {}, authRetry = true, tries = 0) {
  const method = init.method || 'GET';
  const token = await getToken(false);
  let res;
  try {
    res = await fetch(API + path, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
  } catch {
    if (method === 'GET' && tries < 2) {
      await sleep(800 * (tries + 1));
      return api(path, init, authRetry, tries + 1);
    }
    throw new StmError('NET', 'Google Sheets API に接続できませんでした(ネットワークを確認してください)');
  }
  if (res.status === 401 && authRetry) {
    await chrome.identity.removeCachedAuthToken({ token });
    return api(path, init, false, tries);
  }
  if (!res.ok) {
    let msg = res.statusText, detail = '';
    try {
      const j = await res.json();
      msg = j.error?.message || msg;
      detail = JSON.stringify(j.error?.details || '');
    } catch {}
    if ((res.status === 429 || (method === 'GET' && res.status >= 500)) && tries < 3) {
      const ra = Number(res.headers.get('Retry-After'));
      await sleep(ra > 0 ? Math.min(ra, 30) * 1000 : 1000 * 2 ** tries);
      return api(path, init, authRetry, tries + 1);
    }
    if (res.status === 401) throw new StmError('AUTH', msg, 401);
    if (res.status === 403) {
      // スコープ不足は再認可で直る。それ以外(権限なし・API無効)はログインし直しても直らない
      if (/scope/i.test(msg + detail)) throw new StmError('AUTH', msg, 403);
      throw new StmError('FORBIDDEN', `アクセスできません: ${msg}`, 403);
    }
    if (res.status === 404) {
      throw new StmError('NOT_FOUND', 'スプレッドシートが見つかりません(Chromeにログイン中のアカウントに権限が無い可能性があります)', 404);
    }
    if (res.status === 429) throw new StmError('API', 'APIの利用上限に達しました。少し待ってから再試行してください', 429);
    throw new StmError('API', msg, res.status);
  }
  return res.json();
}

// ---------- 一時表示レジストリ ----------
// storage の読み→書きは全ブック共通のロックで直列化する(別ブック同士の同時更新で消えないように)
let tempLock = Promise.resolve();
function withTemp(fn) {
  const run = tempLock.then(async () => {
    const t = (await chrome.storage.local.get(TEMP_KEY))[TEMP_KEY] || {};
    const before = JSON.stringify(t);
    const r = fn(t);
    for (const k of Object.keys(t)) if (!t[k]?.length) delete t[k];
    if (JSON.stringify(t) !== before) await chrome.storage.local.set({ [TEMP_KEY]: t });
    return r;
  });
  tempLock = run.catch(() => {});
  return run;
}
async function getTemp() {
  return (await chrome.storage.local.get(TEMP_KEY))[TEMP_KEY] || {};
}
const tempAdd = (ssId, ids) =>
  withTemp((t) => {
    t[ssId] = [...new Set([...(t[ssId] || []), ...ids])];
  });
const tempRemove = (ssId, ids) =>
  withTemp((t) => {
    t[ssId] = (t[ssId] || []).filter((id) => !ids.includes(id));
  });

// ---------- 一時表示を持っているタブ(ポート) ----------
// 一時表示中のタブはポートを開き、持っているシートIDを報告する。
// ・タブが閉じる/リロード/クラッシュするとポートが切れる → その分だけ非表示に戻す(pagehide より確実)
// ・別タブで同じブックを開いて起動したとき、生きているタブの一時表示は戻さない
const ports = new Map(); // Port -> { ssId, tabId, held: number[] }
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'stm-temp' || port.sender?.id !== chrome.runtime.id) return;
  const info = { ssId: '', tabId: port.sender?.tab?.id, held: [] };
  ports.set(port, info);
  port.onMessage.addListener((m) => {
    // ping も含め、メッセージの受信で service worker の寿命が延びる
    if (typeof m?.ssId === 'string' && SS_RE.test(m.ssId)) info.ssId = m.ssId;
    if (Array.isArray(m?.held)) info.held = m.held.filter(Number.isInteger);
  });
  port.onDisconnect.addListener(() => {
    ports.delete(port);
    const { ssId, held } = info;
    if (ssId && held.length) serial(ssId, () => rehide(ssId, { ids: held })).catch(() => {});
  });
});
function heldElsewhere(ssId, tabId) {
  const s = new Set();
  for (const p of ports.values()) {
    if (p.ssId === ssId && (tabId == null || p.tabId !== tabId)) p.held.forEach((id) => s.add(id));
  }
  return s;
}

// ---------- 直列化(同一ブックへの操作は順番に実行) ----------
const queues = new Map();
function serial(key, fn) {
  const next = (queues.get(key) || Promise.resolve()).catch(() => {}).then(fn);
  queues.set(key, next);
  next.catch(() => {}).finally(() => {
    if (queues.get(key) === next) queues.delete(key);
  });
  return next;
}

// ---------- 操作 ----------
const hex2 = (v) => Math.round((v || 0) * 255).toString(16).padStart(2, '0');
const toHex = (c) => '#' + hex2(c?.red) + hex2(c?.green) + hex2(c?.blue);

async function fetchSheets(ssId) {
  const data = await api(
    `/${ssId}?fields=properties.spreadsheetTheme.themeColors,sheets.properties(sheetId,title,index,hidden,tabColor,tabColorStyle)`
  );
  // tabColorStyle がテーマ色(themeColor)のときは rgb が無いのでテーマから解決する
  const theme = new Map(
    (data.properties?.spreadsheetTheme?.themeColors || []).map((t) => [t.colorType, t.color?.rgbColor])
  );
  const sheets = (data.sheets || []).map(({ properties: p }) => {
    const st = p.tabColorStyle;
    const rgb = st?.rgbColor || (st?.themeColor && theme.get(st.themeColor)) || p.tabColor;
    return { id: p.sheetId, title: p.title, index: p.index ?? 0, hidden: !!p.hidden, color: rgb ? toHex(rgb) : null };
  });
  return { sheets: sheets.sort((a, b) => a.index - b.index) };
}

async function listSheets(ssId) {
  const { sheets } = await fetchSheets(ssId);
  // 既に非表示/削除済みのものはレジストリから外す
  const alive = new Set(sheets.filter((s) => !s.hidden).map((s) => s.id));
  const temp = await withTemp((t) => {
    if (t[ssId]) t[ssId] = t[ssId].filter((id) => alive.has(id));
    return [...(t[ssId] || [])];
  });
  return { sheets, temp };
}

function batchUpdate(ssId, requests) {
  return api(`/${ssId}:batchUpdate`, { method: 'POST', body: JSON.stringify({ requests }) });
}

const hideReq = (id, hidden) => ({
  updateSheetProperties: { properties: { sheetId: id, hidden }, fields: 'hidden' },
});
const indexReq = (id, index) => ({
  updateSheetProperties: { properties: { sheetId: id, index }, fields: 'index' },
});

// 一時表示を非表示に戻す。ids 指定時はそのうちレジストリにあるものだけ。
// 他のタブ(生きているポート)が持っているものは戻さない。
async function rehide(ssId, { ids = null, except = null, tabId = null } = {}) {
  const reg = (await getTemp())[ssId] || [];
  const others = heldElsewhere(ssId, tabId);
  let target = reg.filter((id) => (!ids || ids.includes(id)) && id !== except && !others.has(id));
  if (!target.length) return [];
  // 最新の状態を見てから戻す(削除済みや、全シート非表示になる要求は API エラーになるため)
  const { sheets } = await fetchSheets(ssId);
  const cur = new Map(sheets.map((s) => [s.id, s]));
  const drop = target.filter((id) => !cur.get(id) || cur.get(id).hidden);
  target = target.filter((id) => cur.get(id) && !cur.get(id).hidden);
  if (target.length && !sheets.some((s) => !s.hidden && !target.includes(s.id))) {
    drop.push(target.pop()); // 表示シートが無くなる場合は1枚だけ表示のまま残す(=常に表示に昇格)
  }
  if (target.length) await batchUpdate(ssId, target.map((id) => hideReq(id, true)));
  await tempRemove(ssId, [...target, ...drop]);
  return target;
}

async function rescueAll() {
  const t = await getTemp();
  for (const ssId of Object.keys(t)) {
    try { await serial(ssId, () => rehide(ssId)); } catch {}
  }
}

// updateSheetProperties の index は「移動元を取り除く前の並び」での挿入位置として扱われ、
// 右(後ろ)へ動かすときは目的位置 +1 を指定する必要がある、という挙動が知られている。
// 公式ドキュメントに明記が無いため、結果を読み直して食い違っていれば目的位置で補正する。
async function moveSheet(ssId, sheetId, to) {
  const { sheets } = await fetchSheets(ssId);
  const s = sheets.find((x) => x.id === sheetId);
  if (!s) throw new StmError('API', 'シートが見つかりません(削除された可能性があります)');
  to = Math.max(0, Math.min(sheets.length - 1, to));
  if (s.index === to) return;
  const first = to > s.index ? to + 1 : to;
  try {
    await batchUpdate(ssId, [indexReq(sheetId, first)]);
  } catch (e) {
    if (e.code !== 'API' || first === to) throw e;
    await batchUpdate(ssId, [indexReq(sheetId, to)]); // 範囲外扱いされた場合
    return;
  }
  const now = (await fetchSheets(ssId)).sheets.find((x) => x.id === sheetId);
  if (now && now.index !== to) await batchUpdate(ssId, [indexReq(sheetId, to)]);
}

const handlers = {
  async auth({ interactive }) {
    await getToken(!!interactive);
    return true;
  },
  list: ({ ssId }) => serial(ssId, () => listSheets(ssId)),
  batch: ({ ssId, requests, untrack }) =>
    serial(ssId, async () => {
      await batchUpdate(ssId, requests);
      if (untrack?.length) await tempRemove(ssId, untrack);
      return true;
    }),
  // duplicateSheet は元シートの hidden を引き継ぐ場合があるため、コピーは常に表示状態にそろえる
  copy: ({ ssId, requests }) =>
    serial(ssId, async () => {
      const r = await batchUpdate(ssId, requests);
      const props = (r.replies || []).map((x) => x?.duplicateSheet?.properties).filter(Boolean);
      const fix = props.filter((p) => p.hidden).map((p) => hideReq(p.sheetId, false));
      if (fix.length) await batchUpdate(ssId, fix);
      return props.map((p) => p.sheetId);
    }),
  move: ({ ssId, sheetId, to }) => serial(ssId, () => moveSheet(ssId, sheetId, to)),
  showTemp: ({ ssId, sheetId }) =>
    serial(ssId, async () => {
      await tempAdd(ssId, [sheetId]); // 先に記録(途中で落ちても救済できる)
      try {
        await batchUpdate(ssId, [hideReq(sheetId, false)]);
      } catch (e) {
        await tempRemove(ssId, [sheetId]);
        throw e;
      }
      return true;
    }),
  rehideTemp: ({ ssId, ids, except }, sender) =>
    serial(ssId, () => rehide(ssId, { ids, except, tabId: sender.tab?.id })),
  rescue: ({ ssId, ids }, sender) => serial(ssId, () => rehide(ssId, { ids, tabId: sender.tab?.id })),
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const h = handlers[msg?.type];
  if (!h || sender.id !== chrome.runtime.id) return false;
  if (msg.type !== 'auth' && !SS_RE.test(msg.ssId || '')) {
    sendResponse({ error: '不正なスプレッドシートIDです', code: 'ERR' });
    return false;
  }
  h(msg, sender).then(
    (data) => sendResponse({ data: data ?? true }),
    (e) => sendResponse({ error: e.message || String(e), code: e.code || 'ERR' })
  );
  return true;
});

// ブラウザ起動時 / 拡張機能の更新時: 前回残った一時表示を元に戻す
// (更新時は既存タブのコンテンツスクリプトが切り離され、自力で戻せなくなるため)
chrome.runtime.onStartup.addListener(() => { rescueAll(); });
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason !== 'install') rescueAll();
});

// ---------- ショートカット / アイコンクリック ----------
async function sendToActive(name) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id != null) chrome.tabs.sendMessage(tab.id, { type: 'cmd', name }).catch(() => {});
}
chrome.commands.onCommand.addListener((name) => sendToActive(name));
chrome.action.onClicked.addListener(() => sendToActive('toggle-panel'));
