(() => {
  'use strict';

  // /spreadsheets/d/<id>/edit と、複数アカウント時の /spreadsheets/u/<n>/d/<id>/edit の両方
  const m = location.pathname.match(/^\/spreadsheets\/(?:u\/\d+\/)?d\/([\w-]+)\/edit/);
  if (!m || window.top !== window || window.__stmLoaded || document.getElementById('stm-root')) return;
  window.__stmLoaded = true;
  const SS = m[1];

  // ======================================================================
  // ユーティリティ
  // ======================================================================
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const isJa = () => /^ja/i.test(document.documentElement.lang || navigator.language || '');

  function h(tag, props, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'style') e.style.cssText = v;
      else if (k === 'html') e.innerHTML = v; // 固定のアイコン文字列専用
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null) e.append(kid.nodeType ? kid : document.createTextNode(kid));
    return e;
  }

  function parseCssColor(s) {
    const mm = s && s.match(/rgba?\(([^)]+)\)/);
    if (!mm) return null;
    const p = mm[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    if (p.length >= 4 && p[3] === 0) return null;
    return '#' + p.slice(0, 3).map((n) => Math.round(n).toString(16).padStart(2, '0')).join('');
  }
  const fgFor = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    const lum = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
    return lum > 150 ? '#202124' : '#ffffff';
  };
  const hexToRgb = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return { red: (n >> 16) / 255, green: ((n >> 8) & 255) / 255, blue: (n & 255) / 255 };
  };

  const ICON = {
    eye: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5C7 5 2.7 8.1 1 12.5 2.7 16.9 7 20 12 20s9.3-3.1 11-7.5C21.3 8.1 17 5 12 5zm0 12.5a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/></svg>',
    eyeOff:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7a5 5 0 0 1 5 5c0 .6-.1 1.1-.3 1.6l2.9 2.9A11.7 11.7 0 0 0 23 12.5C21.3 8.1 17 5 12 5c-1.4 0-2.7.3-3.9.7l2.2 2.2c.5-.1 1.1-.2 1.7-.2zM2 4.3l2.3 2.3A11.8 11.8 0 0 0 1 12.5C2.7 16.9 7 20 12 20c1.5 0 3-.3 4.3-.8l3 3 1.4-1.4L3.4 2.9 2 4.3zM7.5 9.8l1.5 1.5a3 3 0 0 0 3.7 3.7l1.5 1.5A5 5 0 0 1 7.5 9.8z"/></svg>',
    grip: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="5.5" r="1.7"/><circle cx="15" cy="5.5" r="1.7"/><circle cx="9" cy="12" r="1.7"/><circle cx="15" cy="12" r="1.7"/><circle cx="9" cy="18.5" r="1.7"/><circle cx="15" cy="18.5" r="1.7"/></svg>',
    refresh:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.65 6.35A7.96 7.96 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>',
    min: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 18h12v2H6z"/></svg>',
    close:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 6.4 17.6 5 12 10.6 6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12z"/></svg>',
  };

  // 右クリックメニュー用に Google 標準パレットと同じ配色
  const PALETTE = (
    '000000 434343 666666 999999 b7b7b7 cccccc d9d9d9 efefef f3f3f3 ffffff ' +
    '980000 ff0000 ff9900 ffff00 00ff00 00ffff 4a86e8 0000ff 9900ff ff00ff ' +
    'e6b8af f4cccc fce5cd fff2cc d9ead3 d0e0e3 c9daf8 cfe2f3 d9d2e9 ead1dc ' +
    'dd7e6b ea9999 f9cb9c ffe599 b6d7a8 a2c4c9 a4c2f4 9fc5e8 b4a7d6 d5a6bd ' +
    'cc4125 e06666 f6b26b ffd966 93c47d 76a5af 6d9eeb 6fa8dc 8e7cc3 c27ba0 ' +
    'a61c00 cc0000 e69138 f1c232 6aa84f 45818e 3c78d8 3d85c6 674ea7 a64d79 ' +
    '85200c 990000 b45f06 bf9000 38761d 134f5c 1155cc 0b5394 351c75 741b47 ' +
    '5b0f00 660000 783f04 7f6000 274e13 0c343d 1c4587 073763 20124d 4c1130'
  )
    .split(' ')
    .map((c) => '#' + c);

  // ======================================================================
  // バックグラウンドとの通信
  // ======================================================================
  const GONE_MSG = '拡張機能が更新/再読み込みされました。ページを再読み込みしてください';
  const extAlive = () => {
    try { return !!chrome.runtime?.id; } catch { return false; }
  };
  const err = (message, code) => Object.assign(new Error(message), { code });

  async function send(msg) {
    if (!extAlive()) throw err(GONE_MSG, 'GONE');
    let r;
    try {
      r = await chrome.runtime.sendMessage(msg);
    } catch {
      if (!extAlive()) throw err(GONE_MSG, 'GONE');
      // service worker の再起動直後などの一時的な失敗
      throw err('バックグラウンドとの通信に失敗しました。もう一度お試しください', 'NET');
    }
    if (!r) throw err('バックグラウンドから応答がありません', 'NET');
    if (r.error) throw err(r.error, r.code);
    return r.data;
  }

  // ======================================================================
  // 状態
  // ======================================================================
  const S = {
    sheets: [], // {id,title,index,hidden,color}
    map: new Map(), // id -> sheet
    titles: new Map(), // title -> sheet(純正タブとの名前一致用)
    temp: new Set(), // 一時表示中のシートID(全タブ分。レジストリの内容)
    mine: new Set(), // そのうち、このタブが一時表示したもの
    showing: new Set(), // 一時表示の要求中(レジストリ未反映のため refresh で消さない)
    selected: new Set(),
    query: '',
    colorFilter: new Set(),
    active: undefined,
    pending: null, // 一時表示→移動の処理中のシートID
    focus: null, // キーボード操作中の行
    authed: null, // null=確認中 true/false
    authMsg: '',
    code: '',
    loadErr: '',
    gone: false,
    busy: 0,
    loading: false,
    dragging: false,
    dragAbort: null,
    renaming: null,
    dirty: false,
    sig: '',
    ui: { open: true, min: false },
  };
  const byId = (id) => S.map.get(id);
  function setSheets(list) {
    S.sheets = list;
    S.map = new Map(list.map((s) => [s.id, s]));
    S.titles = new Map(list.map((s) => [s.title, s]));
  }

  // ======================================================================
  // DOM(画面下の通常タブ)
  // 純正のDOM構造は非公開のため、複数の手がかりでフォールバックする:
  //   タブ要素 … .docs-sheet-tab(→ id="sheet-button-<gid>" の要素)
  //   gid    … 要素ID "sheet-button-<gid>" → タブ名とシート名の一致
  //   選択中 … .docs-sheet-active-tab → aria-selected → URL の gid
  // ======================================================================
  const TAB_SELS = [
    '.docs-sheet-tab',
    '[id^="sheet-button-"]',
    '[class*="docs-sheet-tab"]:not([class*="docs-sheet-tab-"])',
  ];
  const shown = (el) => el.getClientRects().length > 0;
  let tabSel = ''; // 実際にタブが見つかったセレクタ(診断用)
  function getTabs() {
    for (const sel of TAB_SELS) {
      const list = [...document.querySelectorAll(sel)].filter((el) => !el.closest('#stm-root'));
      if (list.length) {
        tabSel = sel;
        return list;
      }
    }
    tabSel = '';
    return [];
  }
  const norm = (t) => (t || '').replace(/\s+/g, ' ').trim();
  const tabName = (el) => norm((el.querySelector('.docs-sheet-tab-name') || el).textContent);
  // gid の解決。via は診断用(id / name / order)
  function resolveTab(el, tabs) {
    const mm = (el.id || '').match(/^sheet-button-(\d+)$/);
    if (mm) return { gid: Number(mm[1]), via: 'id' };
    const name = tabName(el);
    const s = S.titles.get(name) || S.sheets.find((x) => norm(x.title) === name);
    if (s) return { gid: s.id, via: 'name' };
    // 名前でも引けない(名前要素の構造が違う等)場合: 描画されているタブの並び順と、
    // API の「表示中シート」の index 順が同じ枚数なら順番で対応付ける
    const list = (tabs || getTabs()).filter(shown);
    const vis = S.sheets.filter((x) => !x.hidden);
    const i = list.indexOf(el);
    if (i >= 0 && list.length === vis.length) return { gid: vis[i].id, via: 'order' };
    return { gid: null, via: '' };
  }
  const tabGid = (el, tabs) => resolveTab(el, tabs).gid;
  function tabEl(id) {
    const el = document.getElementById('sheet-button-' + id);
    if (el && shown(el)) return el;
    const s = byId(id);
    if (!s) return null;
    // 非表示シートのタブが DOM に残っている可能性もあるため、描画されているものに限る
    const tabs = getTabs().filter(shown);
    const name = norm(s.title);
    const byName = tabs.find((t) => tabName(t) === name);
    if (byName) return byName;
    return tabs.find((t) => resolveTab(t, tabs).gid === id) || null;
  }
  function tabColor(el) {
    const c = el.querySelector('.docs-sheet-tab-color');
    if (!c) return { found: false };
    const cs = getComputedStyle(c);
    const col =
      parseCssColor(cs.backgroundColor) ||
      (parseFloat(cs.borderBottomWidth) > 0 ? parseCssColor(cs.borderBottomColor) : null);
    return { found: true, color: col };
  }
  const activeTabEl = () =>
    document.querySelector('.docs-sheet-tab.docs-sheet-active-tab') ||
    getTabs().find((t) => t.classList.contains('docs-sheet-active-tab') || t.getAttribute('aria-selected') === 'true') ||
    null;
  const urlGid = () => {
    const mm = location.hash.match(/gid=(\d+)/) || location.search.match(/[?&]gid=(\d+)/);
    return mm ? Number(mm[1]) : null;
  };
  function activeGid() {
    const el = activeTabEl();
    const g = el ? tabGid(el) : null;
    return g != null ? g : urlGid();
  }

  // ---------- 診断(パネル内で Ctrl+Alt+D → クリップボードへコピー / 切替失敗時は console へ) ----------
  const navLog = [];
  const logNav = (msg) => {
    navLog.push(new Date().toISOString().slice(11, 23) + ' ' + msg);
    if (navLog.length > 40) navLog.shift();
    console.debug('[SheetTabManager]', msg);
  };
  function diagnose(extra = {}) {
    const tabs = getTabs();
    const act = activeTabEl();
    return {
      when: new Date().toISOString(),
      url: location.href.replace(/[?#].*$/, '') + location.search + location.hash,
      tabSelector: tabSel || '(タブ要素が見つからない)',
      activeTab: act ? tabName(act) : null,
      activeGid: activeGid(),
      urlGid: urlGid(),
      lastNavMethod: navWin,
      textEventIframe: !!document.querySelector('iframe.docs-texteventtarget-iframe'),
      navHistory: navLog.slice(-15),
      tabs: tabs.slice(0, 60).map((t) => {
        const r = resolveTab(t, tabs);
        const b = t.getBoundingClientRect();
        return {
          id: t.id,
          class: typeof t.className === 'string' ? t.className : '',
          role: t.getAttribute('role'),
          ariaSelected: t.getAttribute('aria-selected'),
          name: tabName(t),
          shown: shown(t),
          rect: [b.left, b.top, b.width, b.height].map(Math.round),
          gid: r.gid,
          via: r.via,
          children: [...t.querySelectorAll('*')]
            .slice(0, 12)
            .map((c) => c.tagName.toLowerCase() + (typeof c.className === 'string' && c.className.trim() ? '.' + c.className.trim().split(/\s+/).join('.') : '')),
        };
      }),
      sheets: S.sheets.map((x) => ({ id: x.id, title: x.title, index: x.index, hidden: x.hidden })),
      ...extra,
    };
  }
  async function copyDiagnosis() {
    const d = JSON.stringify(diagnose(), null, 2);
    console.info('[SheetTabManager] 診断情報\n' + d);
    try {
      await navigator.clipboard.writeText(d);
      toast('診断情報をクリップボードにコピーしました(コンソールにも出力)');
    } catch {
      toast('診断情報をコンソールに出力しました(F12 → Console)');
    }
  }

  // タブを塗り、同時に変化検知用のシグネチャを返す
  function paintTabs() {
    const parts = [];
    const tabs = getTabs();
    for (const el of tabs) {
      const gid = tabGid(el, tabs);
      const t = tabColor(el);
      // DOM の色を優先(純正メニューで色を変えた直後も即反映)。読めなければ API の色
      const c = (t.found && t.color) || (gid != null && byId(gid)?.color) || null;
      parts.push(gid + '|' + tabName(el) + '|' + (t.found ? t.color || '' : '?'));
      if (c) {
        if (el.dataset.stmC !== c || !el.classList.contains('stm-tab')) {
          const fg = fgFor(c);
          el.style.setProperty('--stm-bg', c);
          el.style.setProperty('--stm-fg', fg);
          el.classList.add('stm-tab');
          el.classList.toggle('stm-light-fg', fg === '#ffffff');
          el.dataset.stmC = c;
        }
      } else if (el.classList.contains('stm-tab')) {
        el.classList.remove('stm-tab', 'stm-light-fg');
        el.style.removeProperty('--stm-bg');
        el.style.removeProperty('--stm-fg');
        delete el.dataset.stmC;
      }
    }
    return parts.join(';');
  }

  // タブバーの再描画を即座に検知して塗り直す(定期チェックだけだと塗りが一瞬外れて見える)
  let tabObs = null, tabBox = null;
  function watchTabs() {
    const tabs = getTabs();
    let box = tabs[0]?.parentElement || null;
    while (box && tabs.length > 1 && !box.contains(tabs[tabs.length - 1])) box = box.parentElement;
    if (box && tabs.length === 1) box = box.parentElement || box;
    if (box === tabBox) return;
    tabObs?.disconnect();
    tabBox = box;
    if (!box) return;
    tabObs = new MutationObserver(() => paintTabs());
    tabObs.observe(box, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
  }

  // ---------- シートの切替(純正タブのクリックを再現) ----------
  // 純正タブ(Closure 系 UI)が実クリックで受け取るのと同じイベント列・座標・buttons 値を、
  // 実際にポインターが当たる要素(ヒットテスト結果。通常はタブ内の .docs-sheet-tab-name 等)へ送る。
  // isTrusted=false のイベントを Google 側が無視する実装に変わった場合は効かない(その場合は URL の #gid= にフォールバック)。
  function hitTarget(tab, mode) {
    if (mode === 1) return tab.querySelector('.docs-sheet-tab-name') || tab;
    if (mode === 2) return tab;
    const r = tab.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    let t = document.elementFromPoint(x, y);
    if (!t || !tab.contains(t)) {
      // タブバーの横スクロールで見えていない等。見える位置へ寄せてから再判定
      try { tab.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch {}
      const r2 = tab.getBoundingClientRect();
      t = document.elementFromPoint(r2.left + r2.width / 2, r2.top + r2.height / 2);
    }
    return t && tab.contains(t) ? t : tab.querySelector('.docs-sheet-tab-name') || tab;
  }
  function fire(el, type, base, extra) {
    const init = { bubbles: true, cancelable: true, composed: true, view: window, ...base, ...extra };
    const ev = type.startsWith('pointer')
      ? new PointerEvent(type, { pointerId: 1, pointerType: 'mouse', isPrimary: true, width: 1, height: 1, pressure: init.buttons ? 0.5 : 0, ...init })
      : new MouseEvent(type, init);
    el.dispatchEvent(ev);
  }
  function clickTab(tab, mode = 0) {
    const el = hitTarget(tab, mode);
    const r = el.getBoundingClientRect();
    const cx = Math.round(r.left + Math.min(r.width / 2, 40)), cy = Math.round(r.top + r.height / 2);
    const base = {
      clientX: cx,
      clientY: cy,
      screenX: cx + (window.screenX || 0),
      screenY: cy + (window.screenY || 0) + (outerHeight - innerHeight),
      button: 0,
    };
    const no = { bubbles: false };
    fire(el, 'pointerover', base, { buttons: 0 });
    fire(el, 'pointerenter', base, { buttons: 0, ...no });
    fire(el, 'mouseover', base, { buttons: 0 });
    fire(el, 'mouseenter', base, { buttons: 0, ...no });
    fire(el, 'pointermove', base, { buttons: 0 });
    fire(el, 'mousemove', base, { buttons: 0 });
    fire(el, 'pointerdown', base, { buttons: 1 });
    fire(el, 'mousedown', base, { buttons: 1, detail: 1 });
    fire(el, 'pointerup', base, { buttons: 0 });
    fire(el, 'mouseup', base, { buttons: 0, detail: 1 });
    fire(el, 'click', base, { buttons: 0, detail: 1 });
    fire(el, 'pointerout', base, { buttons: 0 });
    fire(el, 'mouseout', base, { buttons: 0 });
  }
  // URL による移動。Sheets がどの経路で URL の変化を拾うか不明なため、手段を分けて試す
  function navHashReplace(id) {
    const want = '#gid=' + id;
    if (location.hash !== want) location.replace(location.href.replace(/#.*$/, '') + want);
    else window.dispatchEvent(new HashChangeEvent('hashchange', { oldURL: location.href, newURL: location.href }));
  }
  function navHashAssign(id) {
    const old = location.href;
    if (location.hash === '#gid=' + id) location.hash = 'gid=';
    location.hash = 'gid=' + id; // 履歴に1件追加される
    window.dispatchEvent(new HashChangeEvent('hashchange', { oldURL: old, newURL: location.href }));
  }
  function navPushState(id) {
    const old = location.href;
    const u = new URL(location.href);
    if (u.searchParams.has('gid')) u.searchParams.set('gid', String(id));
    u.hash = 'gid=' + id;
    history.pushState(history.state, '', u.href);
    window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
    window.dispatchEvent(new HashChangeEvent('hashchange', { oldURL: old, newURL: u.href }));
  }
  // 切替手段(上から順に試す)。tab=true はタブ要素が必要
  const NAV = [
    { name: 'click-hit', tab: true, run: (id, el) => clickTab(el, 0) },
    { name: 'click-name', tab: true, run: (id, el) => clickTab(el, 1) },
    { name: 'click-tab', tab: true, run: (id, el) => clickTab(el, 2) },
    { name: 'hash-replace', run: (id) => navHashReplace(id) },
    { name: 'hash-assign', run: (id) => navHashAssign(id) },
    { name: 'pushstate', run: (id) => navPushState(id) },
  ];
  let navWin = ''; // 前回成功した手段(次回はそれから試す)
  // 純正側で本当に切り替わったか。アクティブ表示のタブが読めるならそれで判定し、
  // 読めない(DOM 変更で選択中クラスが見つからない)ときだけ URL の gid で判定する
  const isActive = (id) => activeGid() === id;

  // 一時表示直後は純正タブの出現まで数秒かかることがあるため、最大8秒試す。
  // 1手段ごとに 700ms 待って検証し、切り替わらなければ次の手段へ。
  // 失敗時は { ok:false, reason } を返す(原因の切り分け用)。
  async function gotoSheet(id, cancelled) {
    if (isActive(id)) return { ok: true };
    const end = Date.now() + 8000;
    const order = [...NAV].sort((a, b) => (b.name === navWin) - (a.name === navWin));
    const tried = [];
    let k = 0, sawTab = false;
    logNav(`goto ${id} (${byId(id)?.title ?? '?'}) 開始。active=${activeGid()}`);
    while (Date.now() < end) {
      if (cancelled()) return { ok: false, reason: 'cancelled' };
      const el = tabEl(id);
      if (el) sawTab = true;
      let m = order[k % order.length];
      if (m.tab && !el) {
        // タブがまだ出ていない(一時表示の反映待ち)間は、最初の 1.5 秒はクリック手段のために待つ
        if (Date.now() < end - 6500) {
          await sleep(150);
          continue;
        }
        while (m.tab) m = order[++k % order.length];
      }
      try {
        m.run(id, el);
      } catch (e) {
        logNav(`${m.name} で例外: ${e.message}`);
      }
      tried.push(m.name);
      k++;
      for (let t = 0; t < 700; t += 100) {
        await sleep(100);
        if (isActive(id)) {
          navWin = m.name;
          // 選択中のタブ要素が読めないときは URL の gid でしか判定できず、本当に切り替わったかは分からない
          const unverified = !activeTabEl();
          logNav(`goto ${id} ${unverified ? 'URL上は成功(タブで未確認)' : '成功'}(${m.name})`);
          if (unverified) console.warn('[SheetTabManager] 選択中タブが見つからず切替を確認できません\n' + JSON.stringify(diagnose({ target: id }), null, 2));
          return { ok: true, via: m.name, unverified };
        }
      }
    }
    const reason = !getTabs().length
      ? 'タブ要素が画面に見つかりません(画面構造が変わった可能性)'
      : !sawTab
        ? 'このシートに対応するタブが見つかりません(名前/順番で対応付けできない)'
        : 'クリックを再現しても切り替わりませんでした';
    logNav(`goto ${id} 失敗: ${reason} / 試行: ${tried.join(',')}`);
    console.warn('[SheetTabManager] シートの切替に失敗: ' + reason + '\n' + JSON.stringify(diagnose({ target: id, tried }), null, 2));
    return { ok: false, reason };
  }
  // 純正クリック後と同じく、キー入力を表(グリッド)側へ戻す。
  // グリッドの入力受け口(.docs-texteventtarget-iframe)は非公開の実装で、見つからなければ何もしない
  function focusGrid() {
    const a = document.activeElement;
    if (a && root.contains(a)) a.blur();
    const f = document.querySelector('iframe.docs-texteventtarget-iframe');
    try {
      f?.focus();
      f?.contentDocument?.querySelector('[contenteditable]')?.focus();
    } catch {}
  }

  // ======================================================================
  // 永続化(ウィンドウ位置など)
  // ======================================================================
  const UI_KEY = 'stmUi';
  let saveTimer = 0;
  const saveUi = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { chrome.storage.local.set({ [UI_KEY]: S.ui }).catch(() => {}); } catch {}
    }, 300);
  };
  async function loadUi() {
    try {
      const r = await chrome.storage.local.get(UI_KEY);
      Object.assign(S.ui, r[UI_KEY] || {});
    } catch {}
  }

  // ======================================================================
  // UI 構築
  // ======================================================================
  const root = h('div', { id: 'stm-root' });
  const panel = h('div', { class: 'stm-panel', tabindex: '-1', role: 'region', 'aria-label': 'シート一覧' });
  const launcher = h('button', { class: 'stm-launcher', title: 'シート一覧を開く (Alt+Shift+W)' }, 'シート一覧');
  const titleEl = h('span', { class: 'stm-title' }, 'シート一覧');
  const countEl = h('span', { class: 'stm-count' });
  const searchEl = h('input', {
    class: 'stm-search',
    type: 'search',
    placeholder: 'シート名で検索  ( / )',
    'aria-label': 'シート名で検索',
    autocomplete: 'off',
    spellcheck: 'false',
  });
  const chipsEl = h('div', { class: 'stm-chips', role: 'group', 'aria-label': '色で絞り込み' });
  const allCb = h('input', { type: 'checkbox', id: 'stm-all' });
  const clearSelBtn = h('button', { class: 'stm-btn', 'data-act': 'clearsel', title: '選択を解除 (Esc)' }, '選択解除');
  const menuBtn = h('button', { class: 'stm-btn', 'data-act': 'bulkmenu', 'aria-haspopup': 'menu', title: '選択したシートへの操作' }, '操作 ▾');
  const showHidCb = h('input', { type: 'checkbox', 'aria-label': '非表示シートも表示する' });
  const bulkEl = h(
    'div',
    { class: 'stm-bulk' },
    h('label', {}, allCb, '全選択'),
    clearSelBtn,
    menuBtn,
    h('label', { class: 'stm-showhid', title: '非表示シートも一覧に表示' }, showHidCb, h('span', { html: ICON.eyeOff }))
  );
  const authEl = h('div', { class: 'stm-auth', hidden: true });
  const listEl = h('div', { class: 'stm-list', role: 'list', 'aria-label': 'シート' });
  const statusEl = h('div', { class: 'stm-status', role: 'status', 'aria-live': 'polite' });
  const menuEl = h('div', { class: 'stm-menu', role: 'menu', hidden: true });
  const popEl = h('div', { class: 'stm-pop', hidden: true });
  const modalEl = h('div', { class: 'stm-modal', hidden: true });

  const iconBtn = (act, label, icon) => h('button', { class: 'stm-ib', 'data-act': act, title: label, 'aria-label': label, html: icon });
  const head = h(
    'div',
    { class: 'stm-head' },
    titleEl,
    countEl,
    iconBtn('refresh', '更新', ICON.refresh),
    iconBtn('min', '最小化', ICON.min),
    iconBtn('close', '閉じる', ICON.close)
  );
  panel.append(
    head,
    h('div', { class: 'stm-body' }, authEl, h('div', { class: 'stm-tools' }, searchEl, chipsEl), bulkEl, listEl, statusEl)
  );
  root.append(panel, launcher, menuEl, popEl, modalEl);

  // ---------- ウィンドウ位置・サイズ ----------
  // 右側に置かれているときは右端からの距離(r)で覚え、ウィンドウ幅が変わっても右に寄せたままにする
  let geomSet = { w: 0, h: 0 };
  function applyGeom() {
    const u = S.ui;
    const w = Math.max(250, Math.min(u.w || 300, innerWidth - 20));
    const hh = Math.max(160, Math.min(u.h || Math.max(260, Math.min(560, innerHeight - 180)), innerHeight - 20));
    if (u.x == null && u.r == null) u.r = 20;
    if (u.r === undefined) u.r = u.x + w / 2 > innerWidth / 2 ? innerWidth - u.x - w : null; // 旧形式の設定
    if (u.r != null) u.x = innerWidth - w - u.r;
    if (u.y == null) u.y = 120;
    u.x = Math.min(Math.max(0, u.x), Math.max(0, innerWidth - 80));
    u.y = Math.min(Math.max(0, u.y), Math.max(0, innerHeight - 40));
    panel.style.width = w + 'px';
    panel.style.height = hh + 'px';
    panel.style.left = u.x + 'px';
    panel.style.top = u.y + 'px';
    geomSet = { w, h: hh };
    panel.classList.toggle('stm-min', !!u.min);
    panel.hidden = !u.open;
    launcher.hidden = !!u.open;
    head.querySelector('[data-act="min"]').setAttribute('aria-label', u.min ? '元に戻す' : '最小化');
  }
  function anchor() {
    const w = panel.offsetWidth || geomSet.w;
    S.ui.r = S.ui.x + w / 2 > innerWidth / 2 ? Math.max(0, innerWidth - S.ui.x - w) : null;
  }
  function setOpen(open) {
    S.ui.open = open;
    applyGeom();
    saveUi();
    if (open) refresh();
  }
  addEventListener('resize', applyGeom);
  // ユーザーがリサイズしたときだけ保存(画面幅に合わせた縮小は保存しない)
  new ResizeObserver(() => {
    if (S.ui.min || panel.hidden) return;
    const w = panel.offsetWidth, hh = panel.offsetHeight;
    if (!w || (Math.abs(w - geomSet.w) < 2 && Math.abs(hh - geomSet.h) < 2)) return;
    S.ui.w = geomSet.w = w;
    S.ui.h = geomSet.h = hh;
    anchor();
    saveUi();
  }).observe(panel);

  // ヘッダーのドラッグでウィンドウ移動
  head.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('button')) return;
    const sx = e.clientX, sy = e.clientY, ox = S.ui.x, oy = S.ui.y;
    head.setPointerCapture(e.pointerId);
    const mv = (ev) => {
      S.ui.r = null;
      S.ui.x = ox + ev.clientX - sx;
      S.ui.y = oy + ev.clientY - sy;
      applyGeom();
    };
    const up = () => {
      head.removeEventListener('pointermove', mv);
      head.removeEventListener('pointerup', up);
      head.removeEventListener('pointercancel', up);
      anchor();
      saveUi();
    };
    head.addEventListener('pointermove', mv);
    head.addEventListener('pointerup', up);
    head.addEventListener('pointercancel', up);
  });
  head.addEventListener('dblclick', (e) => {
    if (!e.target.closest('button')) toggleMin();
  });
  function toggleMin() {
    S.ui.min = !S.ui.min;
    applyGeom();
    saveUi();
  }
  launcher.addEventListener('click', () => setOpen(true));

  // ======================================================================
  // 描画
  // ======================================================================
  function visibleSheets() {
    const q = S.query.trim().toLowerCase();
    return S.sheets.filter(
      (s) =>
        (S.ui.showHidden || !s.hidden || S.temp.has(s.id)) &&
        (!q || s.title.toLowerCase().includes(q)) &&
        (S.colorFilter.size === 0 || S.colorFilter.has(s.color || 'none'))
    );
  }
  const isLogicallyHidden = (s) => s.hidden || S.temp.has(s.id);

  function setBusy() {
    panel.classList.toggle('stm-busy', S.busy > 0 || S.loading);
  }

  function render() {
    setBusy();
    if (S.dragging || S.renaming) {
      S.dirty = true;
      return;
    }
    S.dirty = false;
    renderAuth();
    renderChips();
    renderBulk();
    renderList();
    const hiddenN = S.sheets.filter(isLogicallyHidden).length;
    countEl.textContent = S.sheets.length ? `${S.sheets.length}枚 / 非表示${hiddenN}` : '';
  }

  function renderAuth() {
    const need = S.authed === false || S.gone;
    authEl.hidden = !need;
    bulkEl.style.display = listEl.style.display = need ? 'none' : '';
    if (!need) return;
    authEl.replaceChildren(
      h('p', {}, S.gone ? GONE_MSG : S.authMsg || 'Googleアカウントでの認可が必要です。'),
      S.gone
        ? null
        : S.code === 'NO_CLIENT_ID'
          ? h('p', {}, 'README の手順で OAuth クライアントIDを作成し、manifest.json に設定してください。')
          : h('button', { class: 'stm-btn stm-primary', 'data-act': 'login' }, 'Googleでログイン')
    );
  }

  let chipsKey = '';
  function renderChips() {
    const stats = new Map();
    for (const s of S.sheets) {
      const k = s.color || 'none';
      stats.set(k, (stats.get(k) || 0) + 1);
    }
    const hasColor = [...stats.keys()].some((k) => k !== 'none');
    const key = JSON.stringify([...stats, ...S.colorFilter]);
    if (key === chipsKey) return;
    chipsKey = key;
    chipsEl.replaceChildren();
    chipsEl.style.display = hasColor ? '' : 'none';
    if (!hasColor) return;
    const keys = [...stats.keys()].sort((a, b) => (a === 'none') - (b === 'none') || a.localeCompare(b));
    for (const k of keys) {
      const label = `${k === 'none' ? '色なし' : k}  ${stats.get(k)}枚`;
      chipsEl.append(
        h(
          'button',
          {
            class: 'stm-chip' + (k === 'none' ? ' stm-none' : '') + (S.colorFilter.has(k) ? ' stm-on' : ''),
            style: k === 'none' ? '' : `--c:${k}`,
            title: label,
            'aria-label': label,
            'aria-pressed': String(S.colorFilter.has(k)),
            'data-chip': k,
          },
          h('small', { 'aria-hidden': 'true' }, String(stats.get(k)))
        )
      );
    }
    if (S.colorFilter.size) chipsEl.append(h('button', { class: 'stm-clear', 'data-act': 'clearfilter' }, '解除'));
  }

  function renderBulk() {
    const vis = visibleSheets();
    const selVis = vis.filter((s) => S.selected.has(s.id)).length;
    allCb.checked = vis.length > 0 && selVis === vis.length;
    allCb.indeterminate = selVis > 0 && selVis < vis.length;
    clearSelBtn.textContent = S.selected.size ? `選択解除 (${S.selected.size})` : '選択解除';
    clearSelBtn.disabled = S.selected.size === 0;
    menuBtn.disabled = S.selected.size === 0 || S.busy > 0;
    showHidCb.checked = !!S.ui.showHidden;
  }

  let listKey = '';
  function renderList() {
    const vis = visibleSheets();
    // 内容が変わらないときは作り直さない(ダブルクリック中に要素が消える・フォーカスが外れるのを防ぐ)
    // 選択・アクティブ・処理中などの状態は updateRows() でその場で反映する
    const key = JSON.stringify([S.loadErr, vis.map((s) => [s.id, s.title, s.color, s.hidden, S.temp.has(s.id)])]);
    if (key === listKey && (vis.length ? listEl.querySelector('.stm-row') : listEl.firstChild)) return updateRows();
    listKey = key;
    const fr = document.activeElement?.closest?.('.stm-row');
    const refocus = fr && listEl.contains(fr) ? Number(fr.dataset.id) : null;
    listEl.replaceChildren();
    if (!vis.length) {
      if (S.loadErr && !S.sheets.length) {
        listEl.append(
          h('div', { class: 'stm-empty stm-err' }, h('p', {}, S.loadErr), h('button', { class: 'stm-btn', 'data-act': 'refresh' }, '再試行'))
        );
      } else {
        listEl.append(
          h('div', { class: 'stm-empty' + (S.sheets.length ? '' : ' stm-loading') }, S.sheets.length ? '該当するシートがありません' : '読み込み中…')
        );
      }
      return;
    }
    const frag = document.createDocumentFragment();
    for (const s of vis) {
      const lh = isLogicallyHidden(s);
      const temp = S.temp.has(s.id);
      frag.append(
        h(
          'div',
          {
            class: 'stm-row' + (lh ? ' stm-hid' : '') + (temp ? ' stm-temp' : ''),
            role: 'listitem',
            tabindex: '-1',
            'aria-label': s.title + (temp ? '(一時表示中)' : lh ? '(非表示)' : ''),
            'data-id': s.id,
            style: s.color ? `--bgc:${s.color};--fgc:${fgFor(s.color)}` : '',
            title: s.title,
          },
          h('input', { type: 'checkbox', class: 'stm-cb', tabindex: '-1', 'aria-label': `${s.title} を選択` }),
          h('button', {
            class: 'stm-eye',
            tabindex: '-1',
            title: temp ? '一時表示中(クリックで常に表示)' : lh ? '常に表示にする' : '非表示にする',
            'aria-label': temp ? '常に表示にする' : lh ? '表示する' : '非表示にする',
            html: lh ? ICON.eyeOff : ICON.eye,
          }),
          h('span', { class: 'stm-name' }, s.title),
          temp ? h('span', { class: 'stm-badge' }, '一時') : null,
          h('button', { class: 'stm-grip', tabindex: '-1', title: 'ドラッグで移動(Alt+↑↓でも移動)', 'aria-label': '並び替え', html: ICON.grip })
        )
      );
    }
    listEl.append(frag);
    updateRows();
    if (refocus != null) listEl.querySelector(`.stm-row[data-id="${refocus}"]`)?.focus({ preventScroll: true });
  }

  // 作り直さずに行の状態だけ更新する(多数シートでも軽く、フォーカスも保たれる)
  function updateRows() {
    const rows = [...listEl.querySelectorAll('.stm-row')];
    const has = (id) => rows.some((r) => Number(r.dataset.id) === id);
    const fid = has(S.focus) ? S.focus : has(S.active) ? S.active : Number(rows[0]?.dataset.id);
    for (const row of rows) {
      const id = Number(row.dataset.id);
      const sel = S.selected.has(id);
      row.classList.toggle('stm-active', id === S.active);
      row.classList.toggle('stm-selected', sel);
      row.classList.toggle('stm-pending', id === S.pending);
      if (id === S.active) row.setAttribute('aria-current', 'true');
      else row.removeAttribute('aria-current');
      const cb = row.querySelector('.stm-cb');
      if (cb.checked !== sel) cb.checked = sel;
      row.tabIndex = id === fid ? 0 : -1;
    }
  }
  function scrollToActive() {
    const row = listEl.querySelector('.stm-active');
    if (!row) return;
    const lr = listEl.getBoundingClientRect(), rr = row.getBoundingClientRect();
    if (rr.top < lr.top || rr.bottom > lr.bottom) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  let toastTimer = 0;
  function toast(msg, kind = '') {
    statusEl.textContent = msg;
    statusEl.className = 'stm-status' + (kind === 'err' ? ' stm-err' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (statusEl.textContent = ''), kind === 'err' ? 8000 : 2500);
  }

  // ======================================================================
  // データ取得 / 更新
  // ======================================================================
  function handleErr(e) {
    if (e.code === 'GONE') return onGone();
    if (e.code === 'AUTH' || e.code === 'NO_CLIENT_ID') {
      S.authed = false;
      S.code = e.code;
      S.authMsg = e.code === 'NO_CLIENT_ID' ? e.message : 'Googleアカウントでの認可が必要です。';
      render();
    } else {
      toast(e.message || String(e), 'err');
    }
  }
  // 拡張機能が更新/再読み込みされると、このスクリプトは以後なにもできない
  function onGone() {
    if (S.gone) return;
    S.gone = true;
    clearInterval(tickTimer);
    clearInterval(pollTimer);
    tabObs?.disconnect();
    render();
  }

  let refreshing = null, again = false;
  function refresh() {
    if (S.gone || S.authed === false) return Promise.resolve(false);
    if (refreshing) {
      again = true;
      return refreshing;
    }
    refreshing = (async () => {
      let ok = false;
      S.loading = true;
      setBusy();
      do {
        again = false;
        try {
          const r = await send({ type: 'list', ssId: SS });
          const list = r.sheets.sort((a, b) => a.index - b.index);
          S.temp = new Set(r.temp);
          for (const id of [...S.mine]) if (!S.temp.has(id) && !S.showing.has(id)) S.mine.delete(id);
          setSheets(list);
          for (const s of S.sheets) {
            if (!s.color) {
              const el = tabEl(s.id);
              const t = el && tabColor(el);
              if (t?.found && t.color) s.color = t.color;
            }
          }
          for (const id of [...S.selected]) if (!S.map.has(id)) S.selected.delete(id);
          const colors = new Set(S.sheets.map((s) => s.color || 'none'));
          for (const k of [...S.colorFilter]) if (!colors.has(k)) S.colorFilter.delete(k);
          S.authed = true;
          S.loadErr = '';
          ok = true;
        } catch (e) {
          ok = false;
          if (e.code !== 'AUTH' && e.code !== 'NO_CLIENT_ID') S.loadErr = e.message || String(e);
          handleErr(e);
        }
      } while (again);
      refreshing = null;
      S.loading = false;
      syncPort();
      render();
      return ok;
    })();
    return refreshing;
  }

  async function call(type, extra) {
    S.busy++;
    render();
    try {
      return { ok: true, data: await send({ type, ssId: SS, ...extra }) };
    } catch (e) {
      handleErr(e);
      return { ok: false };
    } finally {
      S.busy--;
    }
  }
  async function mutate(requests, extra = {}) {
    const r = await call('batch', { requests, ...extra });
    await refresh();
    return r.ok;
  }

  const propReq = (id, props, fields) => ({
    updateSheetProperties: { properties: { sheetId: id, ...props }, fields },
  });
  // 一時表示の管理から外す(常に表示・非表示に確定したとき、削除したとき)
  function release(ids) {
    ids.forEach((id) => S.mine.delete(id));
    syncPort();
  }

  async function setHidden(ids, hide) {
    if (!ids.length) return;
    if (hide) {
      // 一時表示中のシートは「実質非表示」として数える(後で戻すと表示シートが無くなるため)
      const remain = S.sheets.filter((s) => !ids.includes(s.id) && !isLogicallyHidden(s)).length;
      if (remain < 1) return toast('少なくとも1枚のシートは表示にしておく必要があります', 'err');
    }
    if (await mutate(ids.map((id) => propReq(id, { hidden: hide }, 'hidden')), { untrack: ids })) release(ids);
  }

  async function setColor(ids, hex) {
    if (!ids.length) return;
    await mutate(
      ids.map((id) =>
        hex
          ? propReq(id, { tabColorStyle: { rgbColor: hexToRgb(hex) } }, 'tabColorStyle')
          : // 値を入れずにフィールドマスクだけ指定するとクリアになる。旧 tabColor も念のため一緒に消す
            propReq(id, {}, 'tabColor,tabColorStyle')
      )
    );
  }

  async function copySheets(ids) {
    // 後ろから複製すると、先に挿入したシートで後続の index がずれない
    const src = ids.map(byId).filter(Boolean).sort((a, b) => b.index - a.index);
    if (!src.length) return;
    const names = new Set(S.sheets.map((s) => s.title.toLowerCase()));
    const ja = isJa();
    const reqs = src.map((s) => {
      const base = (ja ? `${s.title} のコピー` : `Copy of ${s.title}`).slice(0, 90);
      let n = base, i = 2;
      while (names.has(n.toLowerCase())) n = `${base} (${i++})`;
      names.add(n.toLowerCase());
      return { duplicateSheet: { sourceSheetId: s.id, insertSheetIndex: s.index + 1, newSheetName: n } };
    });
    const r = await call('copy', { requests: reqs });
    await refresh();
    if (r.ok) toast(`${reqs.length}枚コピーしました`);
  }

  async function deleteSheets(ids) {
    if (!ids.length) return;
    const remain = S.sheets.filter((s) => !ids.includes(s.id) && !isLogicallyHidden(s)).length;
    if (remain < 1) return toast('少なくとも1枚の表示シートを残す必要があります', 'err');
    const names = ids.map((id) => byId(id)?.title).filter(Boolean);
    const ok = await confirmDialog(
      `${ids.length}枚のシートを削除します。\n\n${names.slice(0, 6).map((n) => '・' + n).join('\n')}${
        names.length > 6 ? `\n…他${names.length - 6}枚` : ''
      }\n\nこの操作は元に戻せません(版の履歴から復元は可能です)。`,
      '削除する'
    );
    if (!ok) return;
    ids.forEach((id) => S.selected.delete(id));
    if (await mutate(ids.map((sheetId) => ({ deleteSheet: { sheetId } })), { untrack: ids })) {
      release(ids);
      toast(`${ids.length}枚削除しました`);
    }
  }

  async function moveTo(id, newIndex) {
    const s = byId(id);
    if (!s) return;
    newIndex = Math.max(0, Math.min(S.sheets.length - 1, newIndex));
    if (s.index !== newIndex) await sendMove(id, newIndex);
  }
  // 移動先 index は「移動後の並びでの位置」。API の index の解釈の違いはバックグラウンドで吸収する
  async function sendMove(id, to) {
    await call('move', { sheetId: id, to });
    await refresh();
  }

  let navSeq = 0;
  async function activate(id, { keyboard = false } = {}) {
    const s = byId(id);
    if (!s) return;
    const seq = ++navSeq;
    const wasHidden = s.hidden && !S.temp.has(id);
    if (wasHidden) {
      S.pending = id;
      updateRows();
      S.mine.add(id);
      S.showing.add(id);
      syncPort(); // 先にポートへ報告(処理中にタブが閉じられても戻せるように)
      try {
        await send({ type: 'showTemp', ssId: SS, sheetId: id });
      } catch (e) {
        S.showing.delete(id);
        S.mine.delete(id);
        syncPort();
        if (S.pending === id) S.pending = null;
        updateRows();
        return handleErr(e);
      }
      S.showing.delete(id);
      S.mine.add(id);
      s.hidden = false;
      S.temp.add(id);
      render();
    }
    const res = seq === navSeq ? await gotoSheet(id, () => seq !== navSeq) : { ok: false };
    const ok = res.ok;
    if (S.pending === id) S.pending = null;
    updateRows();
    if (seq !== navSeq) return; // 後から別のシートがクリックされた
    if (!ok) toast(`シートを開けませんでした: ${res.reason || '不明'}(パネル内で Ctrl+Alt+D → 診断情報をコピー)`, 'err');
    else {
      if (res.unverified) toast('画面下のタブが見つからないため、切替を確認できませんでした(Ctrl+Alt+D で診断情報をコピー)', 'err');
      tick(); // 一覧のアクティブ表示・下部タブの塗りを定期チェックを待たずに同期
      if (!keyboard) focusGrid();
      rehide(id); // 移動を検知できなかった場合も含め、他の一時表示を戻す
    }
    if (wasHidden) refresh();
  }

  async function toggleEye(id) {
    const s = byId(id);
    if (!s) return;
    await setHidden([id], !isLogicallyHidden(s));
  }

  // 別のシートへ移動したとき、このタブが一時表示したものを元に戻す
  async function rehide(except) {
    if (except == null || S.gone) return;
    const ids = [...S.mine].filter((id) => id !== except);
    if (!ids.length) return;
    ids.forEach((id) => S.mine.delete(id)); // 二重送信防止(ポートには成功後に反映)
    try {
      await send({ type: 'rehideTemp', ssId: SS, ids, except });
      syncPort();
    } catch (e) {
      ids.forEach((id) => S.mine.add(id));
      handleErr(e);
    }
    refresh();
  }

  // ---------- 一時表示の見張り役(バックグラウンドへのポート) ----------
  // 一時表示中だけ開く。タブが閉じる/リロードされるとポートが切れ、バックグラウンドが非表示に戻す。
  // service worker が止まらないよう 20 秒ごとに ping を送る。
  let port = null, pingTimer = 0;
  function syncPort() {
    if (!extAlive()) return;
    const held = [...S.mine];
    if (!held.length) {
      if (port) {
        try { port.postMessage({ held }); port.disconnect(); } catch {}
        port = null;
        clearInterval(pingTimer);
      }
      return;
    }
    if (!port) {
      try {
        port = chrome.runtime.connect({ name: 'stm-temp' });
      } catch {
        port = null;
        return;
      }
      port.onDisconnect.addListener(() => {
        // service worker の再起動など。まだ一時表示があればつなぎ直す
        void chrome.runtime.lastError;
        port = null;
        clearInterval(pingTimer);
        if (S.mine.size && extAlive()) setTimeout(syncPort, 1000);
      });
      pingTimer = setInterval(() => {
        try { port?.postMessage({ ping: 1 }); } catch {}
      }, 20000);
    }
    try { port.postMessage({ ssId: SS, held }); } catch {}
  }

  // ======================================================================
  // ダイアログ / メニュー / パレット
  // ======================================================================
  function confirmDialog(message, okLabel) {
    return new Promise((resolve) => {
      const prev = document.activeElement;
      const done = (v) => {
        modalEl.hidden = true;
        modalEl.replaceChildren();
        modalEl._cancel = null;
        if (prev && root.contains(prev)) prev.focus?.({ preventScroll: true });
        resolve(v);
      };
      const ok = h('button', { class: 'stm-btn stm-primary stm-danger-fill', onclick: () => done(true) }, okLabel);
      const cancel = h('button', { class: 'stm-btn', onclick: () => done(false) }, 'キャンセル');
      modalEl.replaceChildren(
        h(
          'div',
          { class: 'stm-dialog', role: 'alertdialog', 'aria-modal': 'true', 'aria-label': okLabel },
          h('p', {}, message),
          h('div', { class: 'stm-actions' }, cancel, ok)
        )
      );
      modalEl.hidden = false;
      modalEl._cancel = () => done(false);
      modalEl._trap = [cancel, ok];
      cancel.focus(); // 破壊的操作なので既定はキャンセル側
    });
  }

  function closePopups() {
    menuEl.hidden = true;
    popEl.hidden = true;
  }
  function placeAt(el, x, y) {
    el.hidden = false;
    const r = el.getBoundingClientRect();
    el.style.left = Math.max(4, Math.min(x, innerWidth - r.width - 4)) + 'px';
    el.style.top = Math.max(4, Math.min(y, innerHeight - r.height - 4)) + 'px';
  }

  function openColorPop(x, y, ids) {
    closePopups();
    if (!ids.length) return;
    const pick = (hex) => {
      closePopups();
      setColor(ids, hex);
    };
    const pal = h('div', { class: 'stm-pal' });
    for (const c of PALETTE) pal.append(h('button', { style: `--c:${c}`, title: c, 'aria-label': c, onclick: () => pick(c) }));
    const used = [...new Set(S.sheets.map((s) => s.color).filter(Boolean))];
    const custom = h('input', { type: 'color', value: used[0] || '#4285f4', title: '好きな色', 'aria-label': '好きな色' });
    popEl.replaceChildren(
      h('div', {}, `${ids.length}枚のタブ色を変更`),
      h('div', { style: 'height:6px' }),
      pal,
      h(
        'div',
        { class: 'stm-pop-foot' },
        custom,
        h('button', { class: 'stm-btn', onclick: () => pick(custom.value) }, 'この色にする'),
        h('button', { class: 'stm-btn', onclick: () => pick(null) }, '色なし')
      )
    );
    placeAt(popEl, x, y);
    pal.firstChild?.focus({ preventScroll: true });
  }

  // 表示中のシート: 本物のタブへ右クリックを転送 → 純正と同じメニュー
  // 非表示のシート: 純正タブが無いので同等の項目を自前で表示
  // ※純正メニューはタブ付近に出る可能性がある(表示位置は Google 側の実装次第)
  function onContext(e, id) {
    e.preventDefault();
    closePopups();
    const el = tabEl(id);
    if (el) {
      const o = { button: 2, buttons: 2, clientX: e.clientX, clientY: e.clientY, screenX: e.screenX, screenY: e.screenY };
      const mk = (t) => new MouseEvent(t, { bubbles: true, cancelable: true, view: window, ...o });
      el.dispatchEvent(mk('mousedown'));
      el.dispatchEvent(mk('mouseup'));
      el.dispatchEvent(mk('contextmenu'));
      return;
    }
    const s = byId(id);
    if (!s) return;
    const item = (label, fn, cls = '') =>
      h('button', { class: cls, role: 'menuitem', onclick: () => { closePopups(); fn(); } }, label);
    menuEl.replaceChildren(
      item('表示する(常に)', () => setHidden([id], false)),
      item('開く(一時表示)', () => activate(id)),
      h('hr'),
      item('複製', () => copySheets([id])),
      item('名前を変更', () => startRename(id)),
      item('色を変更…', () => openColorPop(e.clientX, e.clientY, [id])),
      h('hr'),
      item('先頭へ移動', () => moveTo(id, 0)),
      item('左へ移動', () => moveTo(id, s.index - 1)),
      item('右へ移動', () => moveTo(id, s.index + 1)),
      item('末尾へ移動', () => moveTo(id, S.sheets.length - 1)),
      h('hr'),
      item('削除', () => deleteSheets([id]), 'stm-danger')
    );
    placeAt(menuEl, e.clientX, e.clientY);
    menuEl.querySelector('button')?.focus({ preventScroll: true });
  }

  // ======================================================================
  // 名前の変更(ダブルクリック / F2)
  // ======================================================================
  function startRename(id) {
    const row = listEl.querySelector(`.stm-row[data-id="${id}"]`);
    const s = byId(id);
    if (!row || !s || S.renaming) return;
    const nameEl = row.querySelector('.stm-name');
    const input = h('input', { class: 'stm-rename', type: 'text', value: s.title, maxlength: '100', 'aria-label': 'シート名' });
    S.renaming = { id, input };
    nameEl.replaceWith(input);
    input.addEventListener('blur', () => S.renaming && commitRename());
    input.focus();
    input.select();
  }
  async function commitRename() {
    const r = S.renaming;
    if (!r) return;
    S.renaming = null;
    const title = r.input.value.trim();
    const s = byId(r.id);
    listKey = '';
    if (title && s && title !== s.title) {
      if (S.sheets.some((x) => x.id !== s.id && x.title === title)) {
        toast(`「${title}」という名前のシートは既にあります`, 'err');
        return render();
      }
      s.title = title; // 楽観的に反映(失敗時は refresh で元に戻る)
      render();
      await mutate([propReq(r.id, { title }, 'title')]);
    } else render();
    listEl.querySelector(`.stm-row[data-id="${r.id}"]`)?.focus({ preventScroll: true });
  }
  function cancelRename() {
    const r = S.renaming;
    if (!r) return;
    S.renaming = null;
    listKey = '';
    render();
    listEl.querySelector(`.stm-row[data-id="${r.id}"]`)?.focus({ preventScroll: true });
  }

  // ======================================================================
  // ドラッグ並び替え(アニメーション付き)
  // ======================================================================
  function startDrag(e, row) {
    const rows = [...listEl.querySelectorAll('.stm-row')];
    const from = rows.indexOf(row);
    if (from < 0 || rows.length < 2 || S.renaming) return;
    e.preventDefault();
    const grip = e.target.closest('.stm-grip');
    grip.setPointerCapture(e.pointerId);

    // 途中で一覧が更新されても崩れないよう、開始時点の並び(ID)で計算する
    const ids = rows.map((r) => Number(r.dataset.id));
    const tops = rows.map((r) => r.offsetTop);
    const hs = rows.map((r) => r.offsetHeight);
    const startY = e.clientY, startScroll = listEl.scrollTop;
    let lastY = e.clientY, ti = from, raf = 0, done = false;

    S.dragging = true;
    closePopups();
    listEl.classList.add('stm-sorting');
    row.classList.add('stm-dragging');
    const slot = h('div', { class: 'stm-slot', style: `top:${tops[from]}px;height:${hs[from]}px` });
    listEl.append(slot);

    const update = () => {
      const dy = lastY - startY + (listEl.scrollTop - startScroll);
      row.style.transform = `translateY(${dy}px) scale(1.03)`;
      const center = tops[from] + hs[from] / 2 + dy;
      ti = 0;
      rows.forEach((_, k) => {
        if (k !== from && tops[k] + hs[k] / 2 < center) ti++;
      });
      rows.forEach((r, k) => {
        if (k === from) return;
        const o = k < from ? k : k - 1;
        const fin = o < ti ? o : o + 1;
        const shift = tops[fin] - tops[k];
        r.style.transform = shift ? `translateY(${shift}px)` : '';
      });
      slot.style.top = tops[ti] + 'px';
    };
    const loop = () => {
      const r = listEl.getBoundingClientRect();
      let v = 0;
      if (lastY < r.top + 36) v = -Math.min(18, Math.ceil((r.top + 36 - lastY) / 3));
      else if (lastY > r.bottom - 36) v = Math.min(18, Math.ceil((lastY - (r.bottom - 36)) / 3));
      if (v) {
        listEl.scrollTop += v;
        update();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const onMove = (ev) => {
      lastY = ev.clientY;
      update();
    };
    const onKey = (ev) => {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        finish(false);
      }
    };
    const finish = (commit) => {
      if (done) return;
      done = true;
      S.dragAbort = null;
      cancelAnimationFrame(raf);
      grip.removeEventListener('pointermove', onMove);
      grip.removeEventListener('pointerup', onUp);
      grip.removeEventListener('pointercancel', onCancel);
      grip.removeEventListener('lostpointercapture', onCancel);
      window.removeEventListener('keydown', onKey, true);
      row.classList.remove('stm-dragging');
      row.classList.add('stm-drop');
      row.style.transform = `translateY(${commit ? tops[ti] - tops[from] : 0}px)`;
      if (!commit) {
        rows.forEach((r) => {
          if (r !== row) r.style.transform = '';
        });
        slot.style.top = tops[from] + 'px';
      }
      setTimeout(() => {
        slot.remove();
        listEl.classList.remove('stm-sorting');
        S.dragging = false;
        listKey = '';
        if (commit && ti !== from) {
          const order = ids.filter((id) => id !== ids[from]);
          order.splice(ti, 0, ids[from]);
          commitOrder(ids[from], order);
        } else render();
      }, 200);
    };
    const onUp = () => finish(true);
    const onCancel = () => finish(false);
    S.dragAbort = () => finish(false);
    grip.addEventListener('pointermove', onMove);
    grip.addEventListener('pointerup', onUp);
    grip.addEventListener('pointercancel', onCancel);
    grip.addEventListener('lostpointercapture', onCancel);
    window.addEventListener('keydown', onKey, true); // フォーカスがパネル外にある場合用
  }

  // 絞り込み中でも正しい位置に入るよう、全体の並びの中での移動先を求める
  // order: 移動後の(一覧に表示されている範囲の)ID順
  function commitOrder(movedId, order) {
    const moved = byId(movedId);
    if (!moved) return render();
    const i = order.indexOf(movedId);
    const all = S.sheets.filter((s) => s !== moved);
    const next = byId(order[i + 1]), prev = byId(order[i - 1]);
    const at = next && all.includes(next) ? all.indexOf(next) : prev && all.includes(prev) ? all.indexOf(prev) + 1 : -1;
    if (at < 0) return render();
    all.splice(at, 0, moved);
    if (all.every((s, k) => s === S.sheets[k])) return render();
    all.forEach((s, k) => (s.index = k));
    setSheets(all);
    listKey = '';
    render();
    sendMove(movedId, at); // 画面は楽観的に更新済み。失敗時は refresh で元の並びに戻る
  }
  // キーボード(Alt+↑↓)での並び替え
  function moveBy(id, dir) {
    const order = visibleSheets().map((s) => s.id);
    const i = order.indexOf(id), j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    commitOrder(id, order);
    listEl.querySelector(`.stm-row[data-id="${id}"]`)?.focus({ preventScroll: false });
  }

  // ======================================================================
  // イベント結線
  // ======================================================================
  const selectedIds = () => [...S.selected];
  let lastCbIdx = -1;

  listEl.addEventListener('click', (e) => {
    const row = e.target.closest('.stm-row');
    if (!row) return;
    const id = Number(row.dataset.id);
    if (e.target.closest('.stm-cb')) return;
    if (e.target.closest('.stm-grip') || e.target.closest('.stm-rename')) return;
    if (e.target.closest('.stm-eye')) return toggleEye(id);
    activate(id);
  });
  listEl.addEventListener('dblclick', (e) => {
    const row = e.target.closest('.stm-row');
    if (row && e.target.closest('.stm-name')) startRename(Number(row.dataset.id));
  });
  listEl.addEventListener('contextmenu', (e) => {
    const row = e.target.closest('.stm-row');
    if (row && !e.target.closest('.stm-rename')) onContext(e, Number(row.dataset.id));
  });
  listEl.addEventListener('pointerdown', (e) => {
    const row = e.target.closest('.stm-row');
    if (row && e.button === 0 && e.target.closest('.stm-grip')) startDrag(e, row);
  });
  listEl.addEventListener('focusin', (e) => {
    const row = e.target.closest('.stm-row');
    if (row) S.focus = Number(row.dataset.id);
  });
  listEl.addEventListener('change', (e) => {
    const cb = e.target.closest('.stm-cb');
    if (!cb) return;
    const rows = [...listEl.querySelectorAll('.stm-row')];
    const row = cb.closest('.stm-row');
    const idx = rows.indexOf(row);
    const set = (r, on) => (on ? S.selected.add(Number(r.dataset.id)) : S.selected.delete(Number(r.dataset.id)));
    if (cb._shift && lastCbIdx >= 0 && lastCbIdx < rows.length) {
      const [a, b] = [Math.min(lastCbIdx, idx), Math.max(lastCbIdx, idx)];
      for (let i = a; i <= b; i++) set(rows[i], cb.checked);
    } else set(row, cb.checked);
    cb._shift = false;
    lastCbIdx = idx;
    render();
  });
  listEl.addEventListener('mousedown', (e) => {
    const cb = e.target.closest('.stm-cb');
    if (cb) cb._shift = e.shiftKey;
  });

  allCb.addEventListener('change', () => {
    const vis = visibleSheets();
    if (allCb.checked) vis.forEach((s) => S.selected.add(s.id));
    else vis.forEach((s) => S.selected.delete(s.id));
    render();
  });

  searchEl.addEventListener('input', () => {
    S.query = searchEl.value;
    pruneSelectionToVisible();
    render();
  });
  function pruneSelectionToVisible() {
    const vis = new Set(visibleSheets().map((s) => s.id));
    for (const id of [...S.selected]) if (!vis.has(id)) S.selected.delete(id);
  }

  chipsEl.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-chip]');
    if (chip) {
      const k = chip.dataset.chip;
      S.colorFilter.has(k) ? S.colorFilter.delete(k) : S.colorFilter.add(k);
      pruneSelectionToVisible();
      render();
    } else if (e.target.closest('[data-act="clearfilter"]')) {
      S.colorFilter.clear();
      render();
    }
  });

  root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || b.dataset.act === 'clearfilter') return;
    const act = b.dataset.act;
    const ids = selectedIds();
    if (act === 'refresh') {
      toast('更新しています…');
      if (await refresh()) toast('更新しました');
    } else if (act === 'min') toggleMin();
    else if (act === 'close') setOpen(false);
    else if (act === 'login') {
      try {
        await send({ type: 'auth', interactive: true });
        S.authed = null;
        S.authMsg = '';
        render();
        await start();
      } catch (err) {
        if (err.code === 'GONE') return onGone();
        S.authMsg = 'ログインに失敗しました: ' + err.message;
        S.code = err.code;
        render();
      }
    } else if (act === 'clearsel') {
      S.selected.clear();
      render();
    } else if (act === 'bulkmenu') {
      if (!menuEl.hidden) return closePopups();
      if (!ids.length) return;
      const r = b.getBoundingClientRect();
      const item = (label, fn, cls = '') =>
        h('button', { class: cls, role: 'menuitem', onclick: () => { closePopups(); fn(); } }, label);
      menuEl.replaceChildren(
        item('コピー', () => { S.selected.clear(); copySheets(ids); }),
        item('表示にする', () => setHidden(ids, false)),
        item('非表示にする', () => setHidden(ids, true)),
        item('色を変更…', () => openColorPop(r.left, r.bottom + 4, ids)),
        h('hr'),
        item('削除', () => deleteSheets(ids), 'stm-danger')
      );
      placeAt(menuEl, r.left, r.bottom + 4);
      menuEl.querySelector('button')?.focus({ preventScroll: true });
    }
  });

  showHidCb.addEventListener('change', () => {
    S.ui.showHidden = showHidCb.checked;
    saveUi();
    pruneSelectionToVisible();
    render();
  });

  // ポップアップの外側クリックで閉じる
  window.addEventListener(
    'mousedown',
    (e) => {
      if (!root.contains(e.target) || (!e.target.closest('.stm-menu') && !e.target.closest('.stm-pop') && !e.target.closest('[data-act="bulkmenu"]')))
        closePopups();
    },
    true
  );
  // パネル内クリックで(入力欄以外は)パネルにフォーカスを移す
  panel.addEventListener('mousedown', (e) => {
    if (!e.target.closest('input,button,select,.stm-row')) panel.focus({ preventScroll: true });
  });

  // ---------- キーボード ----------
  function focusRow(row) {
    if (!row) return;
    S.focus = Number(row.dataset.id);
    updateRows();
    row.focus({ preventScroll: true });
    row.scrollIntoView({ block: 'nearest' });
  }
  function onKey(e) {
    const t = e.target;
    if (e.isComposing || e.keyCode === 229) return; // IME 変換中の Enter/Esc は確定・取消に使う
    if (S.dragAbort && e.key === 'Escape') {
      e.preventDefault();
      return S.dragAbort();
    }
    if (!modalEl.hidden) {
      if (e.key === 'Escape') modalEl._cancel?.();
      else if (e.key === 'Tab') {
        // ダイアログ内でフォーカスを循環させる
        const [a, b] = modalEl._trap || [];
        if (a && b) {
          e.preventDefault();
          (document.activeElement === a ? b : a).focus();
        }
      }
      return;
    }
    if (t.classList?.contains('stm-rename')) {
      if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
      else if (e.key === 'Escape') { e.preventDefault(); cancelRename(); }
      return;
    }
    if (t === searchEl) {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (searchEl.value) {
          searchEl.value = '';
          S.query = '';
          render();
        } else searchEl.blur();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        focusRow(listEl.querySelector('.stm-row'));
      }
      return;
    }
    if (!menuEl.hidden && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      const items = [...menuEl.querySelectorAll('button')];
      const i = items.indexOf(document.activeElement);
      items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
      return;
    }
    if (t.tagName === 'INPUT' && t.type !== 'checkbox') return;
    const row = t.classList?.contains('stm-row') ? t : null;
    if (row) {
      const id = Number(row.dataset.id);
      if (e.key === 'Enter') {
        e.preventDefault();
        return activate(id, { keyboard: true });
      }
      if (e.key === ' ') {
        e.preventDefault();
        S.selected.has(id) ? S.selected.delete(id) : S.selected.add(id);
        return render();
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const dir = e.key === 'ArrowDown' ? 1 : -1;
        if (e.altKey) return moveBy(id, dir);
        return focusRow(dir > 0 ? row.nextElementSibling : row.previousElementSibling);
      }
      if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
        e.preventDefault();
        const r = row.getBoundingClientRect();
        return onContext(new MouseEvent('contextmenu', { clientX: r.left + 40, clientY: r.bottom }), id);
      }
    }
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.altKey && e.code === 'KeyD') {
      e.preventDefault();
      copyDiagnosis();
    } else if (mod && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      visibleSheets().forEach((s) => S.selected.add(s.id));
      render();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      if (S.selected.size) { e.preventDefault(); deleteSheets(selectedIds()); }
    } else if (e.key === 'F2') {
      e.preventDefault();
      startRename(row ? Number(row.dataset.id) : [...S.selected][0] ?? S.active);
    } else if (e.key === '/') {
      e.preventDefault();
      searchEl.focus();
    } else if (e.key === 'Escape') {
      if (!menuEl.hidden || !popEl.hidden) closePopups();
      else if (S.selected.size) { S.selected.clear(); render(); }
    }
  }

  // Google スプレッドシート側にキー入力・IME・クリップボード操作を奪われないよう、
  // document_start で(=ページのスクリプトより先に)window のキャプチャ段階へ登録し、
  // パネル内が対象のものはここで処理してページ側のリスナーへは一切渡さない(既定動作=文字入力は維持)
  const inRoot = (e) => root.isConnected && e.target instanceof Node && root.contains(e.target);
  for (const type of ['keydown', 'keyup', 'keypress', 'beforeinput', 'compositionstart', 'compositionupdate', 'compositionend', 'paste', 'copy', 'cut']) {
    window.addEventListener(
      type,
      (e) => {
        if (!inRoot(e)) return;
        if (type === 'keydown') onKey(e);
        e.stopImmediatePropagation();
      },
      true
    );
  }
  // マウス・フォーカス系はパネル内での処理が終わった後(root のバブル段階)で止める。
  // ページ側の document/body のリスナーがフォーカスを表のグリッドへ戻したりしないように。
  // (mouseup/pointerup はページ側のドラッグ終了処理を壊さないよう止めない)
  for (const type of ['mousedown', 'pointerdown', 'click', 'dblclick', 'contextmenu', 'wheel', 'focusin', 'focusout']) {
    root.addEventListener(type, (e) => e.stopPropagation(), { passive: type === 'wheel' });
  }

  // 拡張機能のショートカット / アイコンクリック
  chrome.runtime.onMessage.addListener((msg, sender) => {
    if (msg?.type !== 'cmd' || sender.id !== chrome.runtime.id || S.gone) return;
    if (msg.name === 'toggle-panel') setOpen(!S.ui.open);
    else if (msg.name === 'focus-search') {
      S.ui.min = false;
      setOpen(true);
      searchEl.focus();
      searchEl.select();
    }
  });

  // ======================================================================
  // 監視ループ・起動
  // ======================================================================
  let refreshTimer = 0, tickTimer = 0, pollTimer = 0;
  const scheduleRefresh = () => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refresh, 350);
  };

  function tick() {
    if (!root.isConnected) document.documentElement.append(root);
    if (document.hidden) return;
    watchTabs();
    const sig = paintTabs();
    const a = activeGid();
    if (a !== S.active) {
      const first = S.active === undefined;
      S.active = a;
      updateRows();
      scrollToActive();
      if (!first && S.authed) rehide(a);
    }
    if (sig !== S.sig) {
      const first = S.sig === '';
      S.sig = sig;
      if (!first && S.authed) scheduleRefresh();
    }
  }

  // ブラウザ/タブを閉じる・リロードするとき、残っている一時表示を元に戻す
  // (本命はポートの切断検知。こちらは念のための保険で、閉じる瞬間の送信は届かないこともある)
  addEventListener('pagehide', () => {
    if (!S.mine.size || !extAlive()) return;
    try { chrome.runtime.sendMessage({ type: 'rescue', ssId: SS, ids: [...S.mine] }).catch(() => {}); } catch {}
  });
  // バックフォワードキャッシュから戻ったとき(その間にポートは切れ、一時表示は戻されている)
  addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    S.mine.clear();
    port = null;
    clearInterval(pingTimer);
    refresh();
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && S.authed && !S.busy) refresh();
  });

  async function start() {
    try {
      await send({ type: 'auth', interactive: false });
    } catch (e) {
      handleErr(e);
      return;
    }
    try {
      await send({ type: 'rescue', ssId: SS }); // 前回の取り残しを元に戻す
    } catch (e) {
      if (e.code === 'GONE' || e.code === 'AUTH') return handleErr(e);
    }
    await refresh();
  }

  async function boot() {
    document.documentElement.append(root);
    await loadUi();
    applyGeom();
    render();
    tickTimer = setInterval(tick, 500);
    pollTimer = setInterval(() => {
      if (S.authed && !document.hidden && !S.busy && S.ui.open) refresh();
    }, 30000);
    tick();
    start();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
