(() => {
  'use strict';
  const tools = Array.isArray(window.TOOLS_DATA) ? window.TOOLS_DATA : [];
  const safety = Array.isArray(window.SAFETY_GUIDE) ? window.SAFETY_GUIDE : [];
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
  const storage = {
    get(key, fallback) { try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; } },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }
  };
  const savedChecklists = storage.get('hamrah-safety-checklists', {});
  const savedNotes = storage.get('hamrah-personal-notes', {});
  const categories = {
    starter: 'شروع و جعبه‌ابزار', access: 'دسترسی و شبکه', messaging: 'پیام‌رسانی و ارتباط',
    news: 'خبر و دریافت محتوا', maps: 'نقشه و مسیریابی', crisis: 'بحران و ایمنی',
    entertainment: 'بازی و سرگرمی', utility: 'ابزارهای عمومی'
  };
  const accessLabels = {
    'offline-prep': 'آفلاین پس از آماده‌سازی', 'local-network': 'ارتباط محلی / نیازمند زیرساخت',
    'internet-limited': 'وابسته به شرایط شبکه', internet: 'نیازمند اینترنت',
    reference: 'راهنما / مرجع', unknown: 'وضعیت نامشخص'
  };
  const state = {
    screen: 'home', toolQuery: '', safetyQuery: '', category: 'all', favoritesOnly: false,
    favorites: new Set(storage.get('hamrah-favorites', [])), theme: storage.get('hamrah-theme', 'light'),
    installPrompt: null
  };
  let toastTimer;

  function safeExternalUrl(value) {
    try { const url = new URL(String(value || '')); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; }
    catch { return ''; }
  }
  function faNum(value) { return Number(value).toLocaleString('fa-IR'); }
  function categoryLabel(tool) { return categories[tool.category] || categories.utility; }
  function formatReviewDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return 'ثبت نشده';
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isNaN(date.getTime()) ? 'ثبت نشده' : date.toLocaleDateString('fa-IR', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
  }
  function localNoteMarkup(key, label) {
    return `<section class="dialog-section personal-note"><h3>${escapeHTML(label)}</h3><p>این یادداشت فقط در فضای محلی همین مرورگر ذخیره می‌شود و همراه با برنامه برای کسی ارسال نمی‌شود.</p><label class="note-label" for="note-${escapeHTML(key.replace(/[^a-z0-9-]/gi, '-'))}">یادداشت شخصی</label><textarea id="note-${escapeHTML(key.replace(/[^a-z0-9-]/gi, '-'))}" data-note-key="${escapeHTML(key)}" rows="3" maxlength="2000" placeholder="یادداشت کوتاه…">${escapeHTML(savedNotes[key] || '')}</textarea></section>`;
  }
  function toolIcon(tool, extraClass = '') {
    const raw = String(tool && tool.icon || '');
    const local = /^\.\/assets\/tool-icons\/[a-z0-9-]+\.svg$/i.test(raw);
    const url = local ? raw : safeExternalUrl(raw);
    const alt = escapeHTML(`${tool.title} — آیکون محلی/جایگزین`);
    if (url) return `<img class="tool-logo ${extraClass}" src="${escapeHTML(url)}" alt="${alt}" loading="lazy">`;
    const initial = escapeHTML(Array.from(String(tool && tool.title || '?').trim())[0] || '?');
    return `<span class="tool-logo-fallback ${extraClass}" role="img" aria-label="${escapeHTML(tool.title)}">${initial}</span>`;
  }
  function statusClass(tool) {
    const text = `${tool.status || ''} ${tool.access || ''}`;
    if (/غیرفعال|تأیید نشده|نیازمند|بررسی|نامشخص|نامطمئن/i.test(text) || tool.access === 'unknown') return 'status-review';
    if (/تأیید|فعال|رسمی|درست|verified/i.test(text)) return 'status-ok';
    return 'status-neutral';
  }
  function showToast(message) {
    const el = $('#toast'); if (!el) return;
    el.textContent = message; el.classList.add('show'); clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2300);
  }
  function setTheme(theme) {
    state.theme = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.theme = state.theme;
    $('#themeToggle').textContent = state.theme === 'dark' ? '☼' : '◐';
    $('#themeToggle').setAttribute('aria-label', state.theme === 'dark' ? 'فعال‌کردن پوستهٔ روشن' : 'فعال‌کردن پوستهٔ تیره');
    storage.set('hamrah-theme', state.theme);
    $('meta[name="theme-color"]').content = state.theme === 'dark' ? '#121b18' : '#193d32';
  }
  function updateNetworkStatus() {
    const status = $('#connectionStatus');
    const offline = !navigator.onLine;
    status.classList.toggle('is-offline', offline);
    status.querySelector('span').textContent = offline ? 'آفلاین' : 'آنلاین';
    status.title = offline ? 'اطلاعات ذخیره‌شده در دسترس است؛ سایت‌های بیرونی ممکن است باز نشوند.' : 'وضعیت اتصال دستگاه؛ نه دسترس‌پذیری تمام سایت‌ها.';
  }
  function updateNavigation() {
    $$('.nav-button').forEach(button => {
      const active = button.dataset.screen === state.screen;
      button.classList.toggle('is-active', active);
      if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
    });
  }
  function renderHome() {
    $('#main').innerHTML = `
      <section class="home-hero" aria-labelledby="homeTitle">
        <div class="hero-topline">
          <span class="hero-kicker"><i aria-hidden="true"></i> راهنمای همراه در روزهای دشوار</span>
          <span class="hero-edition">راهنمای جیبی <b>۰۱</b></span>
        </div>
        <div class="hero-layout">
          <div class="hero-copy">
            <h1 id="homeTitle">وقتی راه‌ها<br><em>سخت می‌شوند،</em><br>همراهت هست.</h1>
            <p>راهنمای ایمنی و ابزارهای ارتباطی را از قبل آماده داشته باش؛ برای وقت‌هایی که دسترسی به اینترنت یا اطلاعات دشوار می‌شود.</p>
            <div class="hero-actions">
              <button class="hero-primary" type="button" data-screen="safety"><span>راهنمای ایمنی</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>
              <button class="hero-secondary" type="button" data-screen="tools">دیدن ابزارها <span aria-hidden="true">↙</span></button>
            </div>
          </div>
          <div class="hero-visual" aria-label="خلاصه محتوای همراه">
            <div class="visual-label"><span>همراه / نسخهٔ آفلاین</span><span class="visual-dot"></span></div>
            <svg class="route-art" viewBox="0 0 340 270" role="img" aria-label="نقشهٔ انتزاعی مسیر و نقاط راهنما">
              <defs><pattern id="dotPattern" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.1" fill="currentColor" opacity=".18"/></pattern></defs>
              <rect width="340" height="270" fill="url(#dotPattern)"/>
              <path class="route-line route-line-muted" d="M28 222 C60 200 65 164 103 160 S151 187 174 151 S211 102 244 112 S282 92 312 40"/>
              <path class="route-line route-line-bright" d="M28 222 C60 200 65 164 103 160 S151 187 174 151 S211 102 244 112"/>
              <circle class="route-point point-one" cx="28" cy="222" r="7"/><circle class="route-point point-two" cx="103" cy="160" r="6"/><circle class="route-point point-three" cx="174" cy="151" r="6"/><circle class="route-point point-four" cx="244" cy="112" r="9"/>
              <circle class="route-halo" cx="244" cy="112" r="19"/>
              <g class="route-label" transform="translate(198 57)"><rect width="100" height="30" rx="7"/><text x="50" y="19" text-anchor="middle">مسیر آماده</text></g>
              <g class="route-cross" transform="translate(31 49)"><path d="M0 0h34M17 -17v34"/><circle r="27"/></g>
            </svg>
            <div class="visual-stats">
              <div><strong>${faNum(safety.length)}</strong><span>راهنمای ایمنی</span></div>
              <div><strong>${faNum(tools.length)}</strong><span>ابزار کاربردی</span></div>
              <div class="offline-stat"><span class="offline-icon" aria-hidden="true">↯</span><span>قابل‌خواندن<br>بدون اینترنت</span></div>
            </div>
          </div>
        </div>
        <div class="hero-foot"><span>آماده‌اش کن، قبل از اینکه به آن نیاز داشته باشی.</span><span class="hero-foot-index">H / 2026</span></div>
      </section>

      <section class="entry-section" aria-label="بخش‌های اصلی همراه">
        <button class="entry-card entry-safety" type="button" data-screen="safety">
          <span class="entry-number">۰۱ <i></i> راهنمای عملی</span>
          <span class="entry-content"><strong>اول ایمنی</strong><small>${faNum(safety.length)} راهنمای کوتاه برای آمادگی، پناه‌گیری و شرایط اضطراری.</small></span>
          <span class="entry-art safety-art" aria-hidden="true"><svg viewBox="0 0 110 110"><path d="M55 8 94 23v27c0 26-16 42-39 52C32 92 16 76 16 50V23L55 8Z"/><path d="m37 55 12 12 25-28"/></svg></span>
          <span class="entry-arrow" aria-hidden="true">↙</span>
        </button>
        <button class="entry-card entry-tools" type="button" data-screen="tools">
          <span class="entry-number">۰۲ <i></i> فهرست منابع</span>
          <span class="entry-content"><strong>ابزارهای به‌دردبخور</strong><small>${faNum(tools.length)} منبع برای نقشه، ارتباط، خبر و دسترسی به اطلاعات.</small></span>
          <span class="entry-art tools-art" aria-hidden="true"><svg viewBox="0 0 110 110"><rect x="14" y="14" width="34" height="34" rx="9"/><rect x="62" y="14" width="34" height="34" rx="9"/><rect x="14" y="62" width="34" height="34" rx="9"/><path d="M79 62v34M62 79h34"/></svg></span>
          <span class="entry-arrow" aria-hidden="true">↙</span>
        </button>
      </section>

      <section class="quick-section" aria-labelledby="quickTitle">
        <div class="quick-heading"><span class="section-index">۰۳ / در لحظه</span><div><h2 id="quickTitle">الان به چه چیزی نیاز داری؟</h2><p>از این میان انتخاب کن تا مستقیم به راهنمای مرتبط بروی.</p></div></div>
        <div class="quick-grid">
          <button type="button" class="quick-button quick-danger" data-safety-id="safety-5"><span class="quick-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3 22 20H2L12 3Z"/><path d="M12 9v5M12 17h.01"/></svg></span><span class="quick-copy"><strong>انفجار یا ریزش</strong><small>پناه‌گیری و دورشدن از شیشه</small></span><span class="quick-arrow" aria-hidden="true">↙</span></button>
          <button type="button" class="quick-button quick-air" data-safety-id="safety-4"><span class="quick-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 9c2-2 4 2 6 0s4-2 6 0 3 1 4 0M3 14c2-2 4 2 6 0s4-2 6 0 4 1 6 0M7 5c1-1 2-1 3 0"/></svg></span><span class="quick-copy"><strong>دود یا آلودگی</strong><small>کاهش تماس و توجه به هشدار معتبر</small></span><span class="quick-arrow" aria-hidden="true">↙</span></button>
          <button type="button" class="quick-button quick-exit" data-safety-id="safety-3"><span class="quick-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 20V4h10v16M14 12h7M17 8l4 4-4 4"/></svg></span><span class="quick-copy"><strong>برنامهٔ خروج</strong><small>مقصد، مسیر جایگزین و نقطهٔ ملاقات</small></span><span class="quick-arrow" aria-hidden="true">↙</span></button>
        </div>
      </section>
      <aside class="offline-note" role="note"><span class="note-symbol" aria-hidden="true">i</span><p><strong>یک نکتهٔ مهم</strong> همراه هشدار زنده نیست. راهنماها بعد از بارگذاری اولیه در دسترس می‌مانند؛ اما بازشدن سایت‌های بیرونی به اتصال و فعال‌بودن آن‌ها وابسته است.</p></aside>`;
  }
  function renderSafety() {
    const query = state.safetyQuery.trim().toLocaleLowerCase();
    const found = safety.filter(item => !query || `${item.title} ${item.summary} ${item.intro} ${(item.steps || []).join(' ')} ${item.caution}`.toLocaleLowerCase().includes(query));
    $('#main').innerHTML = `
      <header class="page-heading"><h1>راهنمای ایمنی</h1><p>راهنمای عمومی و آفلاین برای آمادگی و واکنش ایمن‌تر.</p></header>
      <label class="search-field" for="safetySearch"><span aria-hidden="true">⌕</span><input id="safetySearch" type="search" value="${escapeHTML(state.safetyQuery)}" placeholder="جست‌وجو در راهنمای ایمنی…" autocomplete="off"></label>
      <div class="result-line"><span id="safetyResultCount">${faNum(found.length)} موضوع</span><span>محتوا در خود برنامه ذخیره شده</span></div>
      <div class="cards-grid" id="safetyGrid">${safetyCards(found)}</div>
      ${found.length ? '' : '<div class="empty-state"><strong>موردی پیدا نشد</strong><p>عبارت جست‌وجو را کوتاه‌تر کن.</p></div>'}
      <aside class="notice" role="note"><b>یادآوری</b><p>این راهنما جایگزین دستورهای خدمات امدادی محلی یا نظر متخصص نیست. در خطر فوری، جان خود را در اولویت قرار بده و دستورهای محلی تأییدشده را دنبال کن.</p></aside>`;
    const input = $('#safetySearch');
    input.addEventListener('input', event => {
      state.safetyQuery = event.target.value;
      const results = safety.filter(item => !state.safetyQuery.trim() || `${item.title} ${item.summary} ${item.intro} ${(item.steps || []).join(' ')} ${item.caution}`.toLocaleLowerCase().includes(state.safetyQuery.trim().toLocaleLowerCase()));
      $('#safetyGrid').innerHTML = safetyCards(results);
      $('#safetyResultCount').textContent = `${faNum(results.length)} موضوع`;
      setImageFailureHandlers($('#safetyGrid'));
    });
  }
  function safetyCards(items) {
    return items.map(item => `<button class="safety-card" type="button" data-safety-id="${escapeHTML(item.id)}">
      <span class="safety-symbol" aria-hidden="true">${escapeHTML(item.icon || '')}</span>
      <span class="safety-copy"><h3>${escapeHTML(item.title)}</h3><p>${escapeHTML(item.summary)}</p><small class="safety-review">بازبینی داده: ${escapeHTML(formatReviewDate(item.lastReviewed))}</small></span><span class="arrow" aria-hidden="true">←</span>
    </button>`).join('');
  }
  function filteredTools() {
    const query = state.toolQuery.trim().toLocaleLowerCase();
    return tools.filter(tool => {
      const text = `${tool.title} ${tool.summary} ${tool.description} ${tool.status} ${(tool.tags || []).join(' ')} ${categoryLabel(tool)}`.toLocaleLowerCase();
      return (!query || text.includes(query)) && (state.category === 'all' || tool.category === state.category) && (!state.favoritesOnly || state.favorites.has(tool.id));
    });
  }
  function renderTools() {
    const counts = {};
    tools.forEach(tool => counts[tool.category] = (counts[tool.category] || 0) + 1);
    const options = Object.keys(counts).sort((a,b) => (categories[a] || a).localeCompare(categories[b] || b, 'fa')).map(key => `<option value="${escapeHTML(key)}" ${state.category===key?'selected':''}>${escapeHTML(categories[key] || key)} (${faNum(counts[key])})</option>`).join('');
    $('#main').innerHTML = `
      <header class="page-heading"><h1>ابزارهای کاربردی</h1><p>منابع را جست‌وجو کن و قبل از استفاده، شرایط دسترسی و وضعیتشان را بخوان.</p></header>
      <label class="search-field" for="toolSearch"><span aria-hidden="true">⌕</span><input id="toolSearch" type="search" value="${escapeHTML(state.toolQuery)}" placeholder="نام ابزار، کاربرد یا برچسب…" autocomplete="off"></label>
      <div class="directory-controls">
        <select id="categoryFilter" aria-label="فیلتر دسته‌بندی"><option value="all">همهٔ دسته‌ها</option>${options}</select>
        <button id="favoritesFilter" class="filter-button ${state.favoritesOnly?'is-active':''}" type="button" aria-pressed="${state.favoritesOnly?'true':'false'}">${state.favoritesOnly?'♥ علاقه‌مندی‌ها':'♡ علاقه‌مندی‌ها'} (${faNum(state.favorites.size)})</button>
        <button id="resetToolFilters" class="filter-button" type="button">پاک‌کردن فیلتر</button>
      </div>
      <div class="result-line"><span id="toolResultCount"></span><span>منابع ثبت‌شده تضمین امنیت نیستند</span></div>
      <div class="cards-grid" id="toolsGrid"></div>
      <div class="empty-state" id="toolsEmpty" hidden><strong>موردی پیدا نشد</strong><p>عبارت جست‌وجو یا دسته‌بندی را تغییر بده.</p></div>
      <div class="dialog-actions"><button type="button" class="secondary-action" id="exportTools">دریافت فهرست به‌صورت JSON</button></div>
      <aside class="notice" role="note"><b>آفلاین</b><p>جست‌وجو و توضیحات داخل همراه آفلاین هستند؛ اما دسترسی به سایت‌های بیرونی به اتصال شبکه و فعال‌بودن آن سرویس وابسته است.</p></aside>`;
    $('#toolSearch').addEventListener('input', event => { state.toolQuery = event.target.value; updateToolsList(); });
    $('#categoryFilter').addEventListener('change', event => { state.category = event.target.value; updateToolsList(); });
    $('#favoritesFilter').addEventListener('click', () => { state.favoritesOnly = !state.favoritesOnly; renderTools(); });
    $('#resetToolFilters').addEventListener('click', () => { state.toolQuery=''; state.category='all'; state.favoritesOnly=false; renderTools(); });
    $('#exportTools').addEventListener('click', exportTools);
    updateToolsList();
  }
  function toolCards(items) {
    return items.map(tool => {
      const iconMarkup = toolIcon(tool);
      const access = accessLabels[tool.access] || accessLabels.unknown;
      return `<article class="tool-card" data-tool-card="${escapeHTML(tool.id)}">
        <div class="tool-card-top">${iconMarkup}<div class="tool-card-copy"><h3>${escapeHTML(tool.title)}</h3><p class="${iconMarkup?'':'summary-no-icon'}">${escapeHTML(tool.summary)}</p></div></div>
        <div class="tool-meta"><span class="meta-chip">${escapeHTML(categoryLabel(tool))}</span><span class="meta-chip">${escapeHTML(access)}</span>${tool.status ? `<span class="meta-chip ${statusClass(tool)==='status-review'?'status-review':''}">${escapeHTML(tool.status)}</span>` : ''}</div>
        <div class="card-actions"><button class="main-action" type="button" data-tool-details="${escapeHTML(tool.id)}">جزئیات</button><a href="${escapeHTML(safeExternalUrl(tool.url))}" target="_blank" rel="noopener noreferrer" ${safeExternalUrl(tool.url)?'':'aria-disabled="true" tabindex="-1"'}>بازکردن ↗</a><button class="favorite-button ${state.favorites.has(tool.id)?'is-favorite':''}" type="button" data-favorite="${escapeHTML(tool.id)}" aria-label="${state.favorites.has(tool.id)?'حذف از علاقه‌مندی‌ها':'افزودن به علاقه‌مندی‌ها'}" aria-pressed="${state.favorites.has(tool.id)?'true':'false'}">${state.favorites.has(tool.id)?'♥':'♡'}</button></div>
      </article>`;
    }).join('');
  }
  function updateToolsList() {
    const list = filteredTools();
    $('#toolsGrid').innerHTML = toolCards(list);
    $('#toolResultCount').textContent = `${faNum(list.length)} از ${faNum(tools.length)} منبع`;
    $('#toolsEmpty').hidden = list.length !== 0;
    setImageFailureHandlers($('#toolsGrid'));
    const favoritesButton = $('#favoritesFilter');
    if (favoritesButton) {
      favoritesButton.classList.toggle('is-active', state.favoritesOnly);
      favoritesButton.setAttribute('aria-pressed', String(state.favoritesOnly));
      favoritesButton.textContent = `${state.favoritesOnly?'♥ علاقه‌مندی‌ها':'♡ علاقه‌مندی‌ها'} (${faNum(state.favorites.size)})`;
    }
  }
  function setImageFailureHandlers(root = document) {
    $$('img.tool-logo', root).forEach(image => {
      if (image.dataset.errorBound) return;
      image.dataset.errorBound = 'true';
      image.addEventListener('error', () => {
        const fallback = document.createElement('span');
        fallback.className = `tool-logo-fallback ${Array.from(image.classList).filter(name => name !== 'tool-logo').join(' ')}`.trim();
        fallback.setAttribute('role', 'img');
        const parent = image.closest('.tool-card, .dialog-heading');
        const title = parent?.querySelector('h2, h3')?.textContent || image.alt.replace(/\s*[—-]\s*آیکون.*$/, '');
        fallback.setAttribute('aria-label', title || 'آیکون جایگزین');
        fallback.textContent = Array.from(String(title || '?').trim())[0] || '?';
        image.replaceWith(fallback);
      }, { once: true });
    });
  }
  function showToolDetails(id) {
    const tool = tools.find(item => item.id === id); if (!tool) return;
    const dialog = $('#detailDialog');
    const safeUrl = safeExternalUrl(tool.url);
    const iconMarkup = toolIcon(tool, 'dialog-logo');
    $('#dialogBody').innerHTML = `
      <div class="dialog-eyebrow">${escapeHTML(categoryLabel(tool))}</div>
      <div class="dialog-heading">${iconMarkup}<h2 id="dialogTitle">${escapeHTML(tool.title)}</h2></div>
      <p class="dialog-lead">${escapeHTML(tool.summary)}</p>
      <div class="tool-meta"><span class="meta-chip ${statusClass(tool)==='status-review'?'status-review':''}">${escapeHTML(tool.status || 'وضعیت ثبت نشده')}</span><span class="meta-chip">${escapeHTML(accessLabels[tool.access] || accessLabels.unknown)}</span><span class="meta-chip">بازبینی داده: ${escapeHTML(formatReviewDate(tool.lastReviewed))}</span></div>
      <section class="dialog-section"><h3>کاربرد</h3><p>${escapeHTML(tool.description || tool.summary)}</p></section>
      <section class="dialog-section"><h3>پیش از استفاده</h3><p>${escapeHTML(tool.prep || 'جزئیات لازم پیش از استفاده بررسی نشده است.')}</p></section>
      ${(tool.tags && tool.tags.length) ? `<section class="dialog-section"><h3>برچسب‌ها</h3><p>${tool.tags.map(tag => `#${escapeHTML(tag)}`).join('　')}</p></section>` : ''}
      <section class="dialog-section"><h3>لینک منبع</h3><p class="dialog-url">${escapeHTML(safeUrl || 'لینک معتبر ثبت نشده')}</p><p>بازشدن لینک به اینترنت و دسترس‌پذیری مقصد وابسته است. ثبت این منبع در همراه به معنی تأیید امنیت آن نیست.</p></section>
      ${tool.icon && tool.iconSource && safeExternalUrl(tool.iconSource) ? `<section class="dialog-section"><h3>منبع آیکون</h3><p><a href="${escapeHTML(safeExternalUrl(tool.iconSource))}" target="_blank" rel="noopener noreferrer">مشاهدهٔ منبع تصویر ↗</a></p></section>` : ''}
      ${localNoteMarkup(`tool:${tool.id}`, 'یادداشت برای این ابزار')}
      <div class="dialog-actions">${safeUrl?`<a class="primary-action" href="${escapeHTML(safeUrl)}" target="_blank" rel="noopener noreferrer">بازکردن منبع ↗</a>`:''}<button class="secondary-action" type="button" data-copy-url="${escapeHTML(tool.id)}">کپی لینک</button><button class="secondary-action" type="button" data-favorite="${escapeHTML(tool.id)}">${state.favorites.has(tool.id)?'♥ حذف از علاقه‌مندی‌ها':'♡ افزودن به علاقه‌مندی‌ها'}</button></div>`;
    setImageFailureHandlers($('#dialogBody'));
    if (!dialog.open) dialog.showModal();
  }
  function showSafetyDetails(id) {
    const item = safety.find(topic => topic.id === id); if (!item) return;
    const checks = savedChecklists[item.id] || [];
    const checklistMarkup = (item.steps || []).map((step, index) => {
      const checked = checks.includes(index);
      return `<label class="checklist-item ${checked ? 'is-checked' : ''}"><input type="checkbox" data-checklist-id="${escapeHTML(item.id)}" data-checklist-step="${index}" ${checked ? 'checked' : ''}><span>${escapeHTML(step)}</span></label>`;
    }).join('');
    $('#dialogBody').innerHTML = `
      <div class="dialog-eyebrow">راهنمای ایمنی · بخش ${faNum((item.sourceId || 1) - 1)}</div>
      <div class="dialog-heading"><span class="safety-symbol" aria-hidden="true" style="width:48px;height:48px;border-radius:13px;">${escapeHTML(item.icon || '')}</span><h2 id="dialogTitle">${escapeHTML(item.title)}</h2></div>
      <p class="dialog-lead">${escapeHTML(item.intro)}</p>
      <section class="dialog-section"><div class="checklist-heading"><h3>اقدامات پیشنهادی / چک‌لیست شخصی</h3><span>${faNum(checks.length)} از ${faNum((item.steps || []).length)}</span></div><div class="safety-checklist">${checklistMarkup}</div><p class="field-help">علامت‌زدن موارد، فقط برای پیگیری شخصی است و به‌معنای تضمین ایمنی نیست.</p><button type="button" class="secondary-action checklist-reset" data-checklist-reset="${escapeHTML(item.id)}">پاک‌کردن علامت‌ها</button></section>
      ${item.caution ? `<section class="dialog-section"><h3>نکتهٔ مهم</h3><p class="dialog-caution">${escapeHTML(item.caution)}</p></section>` : ''}
      <section class="dialog-section safety-source-meta"><h3>منبع و تاریخ بازبینی داده</h3><p><strong>منبع ثبت‌شده:</strong> ${escapeHTML(item.source || 'ثبت نشده')}</p><p><strong>تاریخ بازبینی داده:</strong> ${escapeHTML(formatReviewDate(item.lastReviewed))}</p><p class="field-help">این تاریخ، بازبینی فراداده و نسخهٔ محلی را نشان می‌دهد؛ به‌تنهایی تأیید علمی یا به‌روز بودن همهٔ توصیه‌ها نیست.</p></section>
      <section class="dialog-section"><p>این متن یک راهنمای عمومی و ذخیره‌شده است؛ وضعیت لحظه‌ای، مسیر امن یا دستور محلی را تعیین نمی‌کند. راهنمای معتبر جاری را در اولویت قرار بده.</p></section>
      ${localNoteMarkup(`safety:${item.id}`, 'یادداشت برای این راهنما')}
      <div class="dialog-actions"><button class="primary-action" type="button" data-print-guide>چاپ این راهنما</button><button class="secondary-action" type="button" data-close>بازگشت به راهنما</button></div>`;
    const dialog = $('#detailDialog'); if (!dialog.open) dialog.showModal();
  }
  async function copyText(value) {
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(value);
      else {
        const area = document.createElement('textarea'); area.value = value; area.style.position='fixed'; area.style.opacity='0';
        document.body.appendChild(area); area.select(); const ok = document.execCommand('copy'); area.remove(); if (!ok) throw new Error('copy failed');
      }
      showToast('لینک کپی شد.');
    } catch { showToast('کپی خودکار ممکن نشد؛ لینک را از جزئیات انتخاب کن.'); }
  }
  function exportTools() {
    const blob = new Blob([JSON.stringify({ app:'همراه', version:'0.6.2', exportedAt:new Date().toISOString(), note:'منابع فهرست‌شده به معنی تأیید امنیت یا دسترسی نیستند.', tools, safety }, null, 2)], {type:'application/json;charset=utf-8'});
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href=url; anchor.download='hamrah-guide-data.json'; document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url); showToast('فهرست آمادهٔ دریافت شد.');
  }
  function openInfo(kind) {
    if (kind === 'about') {
      $('#infoBody').innerHTML = `<div class="dialog-eyebrow">دربارهٔ پروژه</div><h2 id="infoTitle">همراه چیست؟</h2><p>همراه یک راهنمای رایگان فارسی است که فهرست ابزارهای کاربردی را با خلاصه‌ای از راهنمای آمادگی و ایمنی در یک برنامه جمع می‌کند.</p><ul><li>توضیحات، جست‌وجو و راهنمای ایمنی داخل برنامه ذخیره شده‌اند.</li><li>همراه سامانهٔ هشدار زنده نیست و محتوای آن شرایط لحظه‌ای را منعکس نمی‌کند.</li><li>ابزارهای فهرست‌شده توسط همراه اداره نمی‌شوند و امنیت یا در دسترس‌بودن آن‌ها تضمین نمی‌شود.</li></ul>`;
    } else {
      $('#infoBody').innerHTML = `<div class="dialog-eyebrow">حریم خصوصی</div><h2 id="infoTitle">اطلاعات کجا ذخیره می‌شوند؟</h2><p>این نسخه حساب کاربری، تبلیغات یا تحلیل‌گر آماری ندارد. علاقه‌مندی‌ها و پوسته در فضای محلی مرورگر ذخیره می‌شوند.</p><ul><li>آیکون‌های فهرست ابزارها فایل‌های SVG محلی هستند و برای نمایش آن‌ها به میزبان تصویر بیرونی وصل نمی‌شوی.</li><li>یادداشت‌ها، علاقه‌مندی‌ها، علامت‌های چک‌لیست و پوسته فقط در فضای محلی مرورگر ذخیره می‌شوند.</li><li>با بازکردن پیوند بیرونی، مرورگر مستقیماً به وب‌سایت مقصد وصل می‌شود و آن سایت ممکن است IP و اطلاعات فنی درخواست را پردازش کند.</li><li>از لینک ناشناس برای واردکردن رمز، توکن یا اطلاعات محرمانه استفاده نکن.</li></ul>`;
    }
    const dialog = $('#infoDialog'); if (!dialog.open) dialog.showModal();
  }
  function render() {
    if (state.screen === 'safety') renderSafety();
    else if (state.screen === 'tools') renderTools();
    else renderHome();
    updateNavigation();
    $('#navToolCount').textContent = faNum(tools.length);
    const safetyCount = $('#navSafetyCount'); if (safetyCount) safetyCount.textContent = faNum(safety.length);
    setImageFailureHandlers($('#main'));
  }
  function go(screen) {
    if (!['home','safety','tools'].includes(screen)) return;
    state.screen = screen; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); $('#main').focus({preventScroll:true});
  }

  document.addEventListener('click', event => {
    const screenButton = event.target.closest('[data-screen]');
    if (screenButton) { event.preventDefault(); go(screenButton.dataset.screen); return; }
    const safetyButton = event.target.closest('[data-safety-id]');
    if (safetyButton) { showSafetyDetails(safetyButton.dataset.safetyId); return; }
    const toolButton = event.target.closest('[data-tool-details]');
    if (toolButton) { showToolDetails(toolButton.dataset.toolDetails); return; }
    const favoriteButton = event.target.closest('[data-favorite]');
    if (favoriteButton) {
      const id = favoriteButton.dataset.favorite;
      if (state.favorites.has(id)) { state.favorites.delete(id); showToast('از علاقه‌مندی‌ها حذف شد.'); }
      else { state.favorites.add(id); showToast('به علاقه‌مندی‌ها اضافه شد.'); }
      storage.set('hamrah-favorites', Array.from(state.favorites));
      if (state.screen === 'tools') updateToolsList();
      if ($('#detailDialog').open) {
        const current = $('#dialogBody [data-copy-url]')?.dataset.copyUrl;
        if (current) showToolDetails(current);
        else if (favoriteButton.dataset.favorite) showToast(state.favorites.has(id) ? 'به علاقه‌مندی‌ها اضافه شد.' : 'از علاقه‌مندی‌ها حذف شد.');
      }
      return;
    }
    const resetChecklist = event.target.closest('[data-checklist-reset]');
    if (resetChecklist) {
      savedChecklists[resetChecklist.dataset.checklistReset] = [];
      storage.set('hamrah-safety-checklists', savedChecklists);
      showSafetyDetails(resetChecklist.dataset.checklistReset);
      return;
    }
    const printButton = event.target.closest('[data-print-guide]');
    if (printButton) { window.print(); return; }
    const copyButton = event.target.closest('[data-copy-url]');
    if (copyButton) { const tool = tools.find(item => item.id === copyButton.dataset.copyUrl); if (tool) copyText(tool.url); return; }
    const closeButton = event.target.closest('[data-close]');
    if (closeButton) { closeButton.closest('dialog')?.close(); return; }
    const infoButton = event.target.closest('[data-info]');
    if (infoButton) { openInfo(infoButton.dataset.info); return; }
  });

  document.addEventListener('input', event => {
    const note = event.target.closest('[data-note-key]');
    if (!note) return;
    savedNotes[note.dataset.noteKey] = note.value.slice(0, 2000);
    storage.set('hamrah-personal-notes', savedNotes);
  });
  document.addEventListener('change', event => {
    const checkbox = event.target.closest('[data-checklist-id][data-checklist-step]');
    if (!checkbox) return;
    const id = checkbox.dataset.checklistId;
    const step = Number(checkbox.dataset.checklistStep);
    const current = new Set(savedChecklists[id] || []);
    if (checkbox.checked) current.add(step); else current.delete(step);
    savedChecklists[id] = Array.from(current).sort((a, b) => a - b);
    storage.set('hamrah-safety-checklists', savedChecklists);
    const label = checkbox.closest('.checklist-item');
    if (label) label.classList.toggle('is-checked', checkbox.checked);
    const count = checkbox.closest('.dialog-section')?.querySelector('.checklist-heading span');
    const topic = safety.find(item => item.id === id);
    if (count && topic) count.textContent = `${faNum(savedChecklists[id].length)} از ${faNum(topic.steps.length)}`;
  });
  $('#themeToggle').addEventListener('click', () => setTheme(state.theme === 'dark' ? 'light' : 'dark'));
  window.addEventListener('online', updateNetworkStatus); window.addEventListener('offline', updateNetworkStatus);
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); state.installPrompt = event; $('#installButton').hidden = false; });
  $('#installButton').addEventListener('click', async () => {
    if (!state.installPrompt) { showToast('از منوی مرورگر «افزودن به صفحهٔ اصلی» را انتخاب کن.'); return; }
    state.installPrompt.prompt(); await state.installPrompt.userChoice; state.installPrompt = null; $('#installButton').hidden = true;
  });
  $$('.detail-dialog').forEach(dialog => dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); }));
  document.addEventListener('keydown', event => { if (event.key === 'Escape') $$('.detail-dialog[open]').forEach(dialog => dialog.close()); });
  setTheme(state.theme); updateNetworkStatus(); render();
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(reg => reg.update()).catch(() => {}));
})();
