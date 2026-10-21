// ZAMZOK WEBSITE — SCRIPT.JS
'use strict';

const ZAMZOK_CONFIG = {
  // ضع مفتاح YouTube API الجديد والمقيّد هنا.
  apiKey: 'AIzaSyDpukCjizMYEkdtvm6h7RqzcUjSKthhaPo',

  channelId: 'UCNuIyleVU-8sXQFDitaKiSg',
  channelUrl: 'https://www.youtube.com/@zamzoktv',
  apiUrl: 'https://www.googleapis.com/youtube/v3',

  playlists: [
    {
      id: 'PLBB8ik23LpF0',
      name: 'ZAMZOK Adventures',
      arabicName: 'مغامرات زامزوك',
      emoji: '🗺️',
      type: 'adventure'
    },
    {
      id: 'PLZLykgsoIDIQ',
      name: 'ZAMZOK Comedy',
      arabicName: 'ضحك زامزوك',
      emoji: '😂',
      type: 'comedy'
    },
    {
      id: '',
      name: 'ZAMZOK Horror',
      arabicName: 'رعب زامزوك',
      emoji: '👻',
      type: 'horror'
    },
    {
      id: '',
      name: 'ZAMZOK Stories',
      arabicName: 'قصص زامزوك',
      emoji: '📖',
      type: 'stories'
    }
  ]
};

// ==================================================
// المتغيرات العامة
// ==================================================

let zamzokVideos = [];
let zamzokReels = [];
let zamzokCurrentIndex = 0;
let zamzokCurrentSource = 'all';

let zamzokReelsOverlay = null;
let zamzokHistoryActive = false;
let zamzokPreviousScroll = 0;
let zamzokLoadingPromise = null;
let zamzokSelectionRequest = 0;

const zamzokPlaylistCache = new Map();

// ==================================================
// أدوات مساعدة
// ==================================================

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[ch]);
}

function getElement(selector, parent = document) {
  return parent.querySelector(selector);
}

function getPlaylistByType(type) {
  return ZAMZOK_CONFIG.playlists.find(p => p.type === type);
}

function showVideoMessage(message) {
  const grid = document.getElementById('videoGrid');

  if (!grid) return;

  grid.setAttribute('aria-busy', 'false');
  grid.innerHTML = '';

  const p = document.createElement('p');

  p.className = 'zamzok-message';
  p.textContent = message;

  grid.appendChild(p);
}

function normalizeVideo(item, source = 'all') {
  const id =
    item?.contentDetails?.videoId ||
    item?.id?.videoId ||
    (typeof item?.id === 'string' ? item.id : '');

  if (!id) return null;

  const thumbs = item?.snippet?.thumbnails || {};
  const playlist = getPlaylistByType(source);

  return {
    id,

    title: item?.snippet?.title || 'فيديو ZAMZOK',

    thumbnail:
      thumbs.maxres?.url ||
      thumbs.high?.url ||
      thumbs.medium?.url ||
      thumbs.standard?.url ||
      thumbs.default?.url ||
      `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`,

    publishedAt:
      item?.contentDetails?.videoPublishedAt ||
      item?.snippet?.publishedAt ||
      '',

    source,
    playlistName: playlist?.name || '',
    playlistArabicName: playlist?.arabicName || ''
  };
}

function scrollToVideos() {
  document.getElementById('videos')?.scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  });
}

// ==================================================
// القائمة الرئيسية
// ==================================================

function initializeMainMenu() {
  const toggle = document.getElementById('menuToggle');
  const nav = document.getElementById('mainNav');

  if (!toggle || !nav) return;

  toggle.setAttribute('aria-expanded', 'false');

  toggle.addEventListener('click', () => {
    const open = nav.classList.toggle('open');

    toggle.setAttribute('aria-expanded', String(open));
    toggle.textContent = open ? '✕' : '☰';
  });

  nav.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      nav.classList.remove('open');

      toggle.setAttribute('aria-expanded', 'false');
      toggle.textContent = '☰';
    });
  });
}

// ==================================================
// السنة الحالية في الفوتر
// ==================================================

function initializeYear() {
  const year = document.getElementById('year');

  if (year) {
    year.textContent = new Date().getFullYear();
  }
}

// ==================================================
// الاتصال بـ YouTube API
// ==================================================

async function youtubeRequest(endpoint, params = {}) {
  const key = ZAMZOK_CONFIG.apiKey.trim();

  if (!key || key === 'PUT_YOUR_NEW_API_KEY_HERE') {
    throw new Error('أضف مفتاح YouTube API داخل script.js.');
  }

  const url = new URL(
    `${ZAMZOK_CONFIG.apiUrl}/${endpoint}`
  );

  Object.entries({
    ...params,
    key
  }).forEach(([name, value]) => {
    url.searchParams.set(name, String(value));
  });

  let response;

  try {
    response = await fetch(url.toString());
  } catch {
    throw new Error(
      'تعذر الاتصال بيوتيوب. تحقق من اتصال الإنترنت.'
    );
  }

  let data;

  try {
    data = await response.json();
  } catch {
    throw new Error('تعذر قراءة استجابة YouTube API.');
  }

  if (!response.ok) {
    const reason = data?.error?.errors?.[0]?.reason;

    if (reason === 'quotaExceeded') {
      throw new Error(
        'تم استهلاك الحصة اليومية لمفتاح YouTube API.'
      );
    }

    if (
      response.status === 404 ||
      reason === 'playlistNotFound'
    ) {
      throw new Error(
        'قائمة التشغيل غير موجودة أو غير متاحة.'
      );
    }

    if (response.status === 403) {
      throw new Error(
        'رفض يوتيوب الطلب. راجع المفتاح والصلاحيات والقيود.'
      );
    }

    throw new Error(
      data?.error?.message ||
      `حدث خطأ من يوتيوب: ${response.status}`
    );
  }

  return data;
}

// ==================================================
// تحميل فيديوهات قائمة تشغيل
// ==================================================

async function fetchPlaylistVideos(playlist) {
  if (!playlist?.id) {
    throw new Error(
      'لم تتم إضافة قائمة تشغيل لهذا القسم حتى الآن.'
    );
  }

  const data = await youtubeRequest('playlistItems', {
    part: 'snippet,contentDetails',
    playlistId: playlist.id,
    maxResults: 50
  });

  return (data.items || [])
    .map(item => normalizeVideo(item, playlist.type))
    .filter(Boolean);
}

// ==================================================
// تحميل فيديوهات القناة
// ==================================================

async function fetchChannelVideos() {
  const channelData = await youtubeRequest('channels', {
    part: 'contentDetails',
    id: ZAMZOK_CONFIG.channelId
  });

  const channel = channelData.items?.[0];

  if (!channel) {
    throw new Error('لم يتم العثور على قناة ZAMZOK.');
  }

  const uploads =
    channel.contentDetails?.relatedPlaylists?.uploads;

  if (!uploads) {
    throw new Error(
      'تعذر العثور على قائمة فيديوهات القناة.'
    );
  }

  const data = await youtubeRequest('playlistItems', {
    part: 'snippet,contentDetails',
    playlistId: uploads,
    maxResults: 50
  });

  const seen = new Set();

  return (data.items || [])
    .map(item => normalizeVideo(item, 'all'))
    .filter(video => {
      if (!video || seen.has(video.id)) {
        return false;
      }

      seen.add(video.id);

      return true;
    });
}

// ==================================================
// أزرار قوائم التشغيل
// ==================================================

function createPlaylistControls() {
  const grid = document.getElementById('videoGrid');

  if (!grid?.parentNode) return;

  let controls = document.getElementById(
    'zamzokPlaylistControls'
  );

  if (!controls) {
    controls = document.createElement('div');

    controls.id = 'zamzokPlaylistControls';
    controls.className = 'zamzok-playlist-controls';

    grid.parentNode.insertBefore(controls, grid);
  }

  const sources = [
    {
      type: 'all',
      label: '🎬 أحدث الفيديوهات'
    },

    ...ZAMZOK_CONFIG.playlists
      .filter(p => p.id)
      .map(p => ({
        type: p.type,
        label: `${p.emoji} ${p.arabicName}`
      }))
  ];

  controls.innerHTML = sources.map(s => `
    <button
      type="button"
      class="zamzok-playlist-btn${s.type === 'all' ? ' is-active' : ''}"
      data-source="${escapeHTML(s.type)}"
      aria-pressed="${s.type === 'all' ? 'true' : 'false'}"
    >${escapeHTML(s.label)}</button>
  `).join('');

  if (!document.getElementById('zamzokPlaylistStyles')) {
    const style = document.createElement('style');

    style.id = 'zamzokPlaylistStyles';

    style.textContent = `
      .zamzok-playlist-controls {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 10px;
        margin: 22px 0;
      }

      .zamzok-playlist-btn {
        border: 1px solid #ffcf5540;
        border-radius: 12px;
        padding: 11px 15px;
        background: #171020;
        color: #fff9ed;
        font: 700 13px 'Cairo', sans-serif;
        cursor: pointer;
        transition: background .2s, color .2s, border-color .2s;
      }

      .zamzok-playlist-btn:hover,
      .zamzok-playlist-btn.is-active {
        color: #160e02;
        border-color: #ffcf55;
        background: linear-gradient(120deg, #ffe78c, #ffad2e);
      }

      .zamzok-message {
        grid-column: 1 / -1;
        width: 100%;
        text-align: center;
        color: #ffcf55;
        line-height: 2;
        padding: 24px;
      }

      @media (max-width: 650px) {
        .zamzok-playlist-controls {
          display: grid;
          grid-template-columns: 1fr;
        }

        .zamzok-playlist-btn {
          width: 100%;
        }
      }
    `;

    document.head.appendChild(style);
  }

  controls.querySelectorAll('[data-source]').forEach(button => {
    button.addEventListener('click', () => {
      setActivePlaylist(button.dataset.source);
    });
  });
}

function updatePlaylistButtons(source) {
  document
    .querySelectorAll('#zamzokPlaylistControls [data-source]')
    .forEach(button => {
      const active = button.dataset.source === source;

      button.classList.toggle('is-active', active);

      button.setAttribute(
        'aria-pressed',
        String(active)
      );
    });
}

// ==================================================
// اختيار قائمة الفيديوهات
// ==================================================

async function setActivePlaylist(source) {
  const requestId = ++zamzokSelectionRequest;

  zamzokCurrentSource = source;

  updatePlaylistButtons(source);

  if (source === 'all') {
    zamzokReels = zamzokVideos.slice();

    renderZamzokVideos();

    return;
  }

  const playlist = getPlaylistByType(source);

  if (!playlist) {
    showVideoMessage('هذا القسم غير متاح حاليًا.');
    return;
  }

  if (!playlist.id) {
    showVideoMessage(
      `قائمة تشغيل ${playlist.arabicName} لم تتم إضافتها بعد.`
    );

    return;
  }

  showVideoMessage(
    `جاري تحميل ${playlist.emoji} ${playlist.arabicName}...`
  );

  try {
    let videos = zamzokPlaylistCache.get(playlist.id);

    if (!videos) {
      videos = await fetchPlaylistVideos(playlist);

      zamzokPlaylistCache.set(
        playlist.id,
        videos
      );
    }

    if (requestId !== zamzokSelectionRequest) {
      return;
    }

    zamzokReels = videos.slice();

    renderZamzokVideos();

  } catch (error) {
    if (requestId !== zamzokSelectionRequest) {
      return;
    }

    console.error('ZAMZOK playlist error:', error);

    showVideoMessage(
      `تعذر تحميل القائمة: ${error.message}`
    );
  }
}

// ==================================================
// عرض بطاقات الفيديوهات
// ==================================================

function renderZamzokVideos() {
  const grid = document.getElementById('videoGrid');

  if (!grid) return;

  if (!zamzokReels.length) {
    showVideoMessage(
      'لا توجد فيديوهات متاحة في هذا القسم حاليًا.'
    );

    return;
  }

  grid.setAttribute('aria-busy', 'false');

  grid.innerHTML = zamzokReels.map((video, index) => `
    <article class="video-card zamzok-video-card">
      <button
        class="zamzok-video-button"
        type="button"
        data-video-id="${escapeHTML(video.id)}"
        data-video-index="${index}"
        aria-label="تشغيل ${escapeHTML(video.title)}"
      >
        <img
          src="${escapeHTML(video.thumbnail)}"
          alt="${escapeHTML(video.title)}"
          loading="lazy"
        >

        <span>▶ تشغيل الفيديو</span>
      </button>

      <div class="video-info">
        <h3>${escapeHTML(video.title)}</h3>
      </div>
    </article>
  `).join('');
}

// ==================================================
// تحميل أحدث فيديوهات الموقع
// ==================================================

async function loadZamzokVideos() {
  if (zamzokLoadingPromise) {
    return zamzokLoadingPromise;
  }

  const grid = document.getElementById('videoGrid');

  if (!grid) return;

  zamzokLoadingPromise = (async () => {
    grid.setAttribute('aria-busy', 'true');

    showVideoMessage(
      'جاري تحميل أحدث فيديوهات ZAMZOK...'
    );

    try {
      const videos = await fetchChannelVideos();

      zamzokVideos = videos;

      zamzokPlaylistCache.set('__all__', videos);

      if (!videos.length) {
        if (zamzokCurrentSource === 'all') {
          showVideoMessage(
            'لا توجد فيديوهات متاحة حاليًا.'
          );
        }

        return;
      }

      if (zamzokCurrentSource === 'all') {
        zamzokReels = videos.slice();

        renderZamzokVideos();
      }

    } catch (error) {
      console.error('ZAMZOK channel error:', error);

      if (zamzokCurrentSource === 'all') {
        showVideoMessage(
          `تعذر تحميل الفيديوهات: ${error.message}`
        );
      }

    } finally {
      grid.setAttribute('aria-busy', 'false');

      zamzokLoadingPromise = null;
    }
  })();

  return zamzokLoadingPromise;
}

// ==================================================
// ربط أقسام المغامرات والكوميديا وغيرها
// ==================================================

function connectWorldCategories() {
  document
    .querySelectorAll('[data-zamzok-category]')
    .forEach(card => {
      card.addEventListener('click', event => {
        event.preventDefault();

        setActivePlaylist(
          card.dataset.zamzokCategory
        );

        scrollToVideos();
      });
    });
}

// ==================================================
// إنشاء مشغل الريلز
// ==================================================

function createZamzokReelsPlayer() {
  if (document.getElementById('zamzokReelsOverlay')) {
    zamzokReelsOverlay = document.getElementById(
      'zamzokReelsOverlay'
    );

    return;
  }

  const overlay = document.createElement('div');

  overlay.id = 'zamzokReelsOverlay';
  overlay.className = 'zamzok-reels-overlay';

  overlay.innerHTML = `
    <header class="zamzok-reels-header">

      <button
        type="button"
        class="zamzok-reels-close"
        aria-label="إغلاق الريلز"
      >✕</button>

      <div class="zamzok-reels-brand">
        <span class="zamzok-reels-brand-icon">Z</span>
        <span>ZAMZOK <small>REELS</small></span>
      </div>

      <button
        type="button"
        class="zamzok-reels-fullscreen"
        aria-label="ملء الشاشة"
        title="ملء الشاشة"
      >⛶</button>

    </header>

    <div class="zamzok-reels-stage">

      <div class="zamzok-reels-video"></div>

      <!-- طبقة التقاط السحب فوق فيديو يوتيوب -->
      <div
        class="zamzok-reels-swipe-layer"
        aria-label="اسحب لأعلى أو لأسفل للتنقل بين الفيديوهات"
      ></div>

      <div class="zamzok-reels-actions">

        <a
          class="zamzok-reels-action zamzok-reels-channel"
          href="${ZAMZOK_CONFIG.channelUrl}"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="قناة ZAMZOK"
        >
          <span class="zamzok-reels-avatar">Z</span>
          <span class="zamzok-reels-plus">+</span>
        </a>

        <button
          type="button"
          class="zamzok-reels-action zamzok-reels-like"
          aria-label="فتح الفيديو على يوتيوب"
        >
          <span class="zamzok-reels-action-icon">♡</span>
          <span>إعجاب</span>
        </button>

        <button
          type="button"
          class="zamzok-reels-action zamzok-reels-comments"
          aria-label="فتح التعليقات على يوتيوب"
        >
          <span class="zamzok-reels-action-icon">▤</span>
          <span>تعليقات</span>
        </button>

        <button
          type="button"
          class="zamzok-reels-action zamzok-reels-share"
          aria-label="مشاركة الفيديو"
        >
          <span class="zamzok-reels-action-icon">↗</span>
          <span>مشاركة</span>
        </button>

      </div>

      <div class="zamzok-reels-bottom">

        <div class="zamzok-reels-account">
          <span class="zamzok-reels-name">@zamzoktv</span>
          <span class="zamzok-reels-live-dot"></span>
        </div>

        <h2 class="zamzok-reels-title"></h2>

        <p class="zamzok-reels-hint">
          اسحب لأعلى للفيديو التالي ولأسفل للسابق
        </p>

      </div>

      <button
        type="button"
        class="zamzok-reels-nav zamzok-reels-prev"
        aria-label="الفيديو السابق"
      >⌃</button>

      <button
        type="button"
        class="zamzok-reels-nav zamzok-reels-next"
        aria-label="الفيديو التالي"
      >⌄</button>

    </div>

    <div class="zamzok-reels-counter"></div>
  `;

  document.body.appendChild(overlay);

  // ==================================================
  // CSS الخاص بطبقة السحب
  // ==================================================

  if (!document.getElementById('zamzokSwipeStyles')) {
    const style = document.createElement('style');

    style.id = 'zamzokSwipeStyles';

    style.textContent = `
      #zamzokReelsOverlay .zamzok-reels-stage {
        position: relative;
      }

      #zamzokReelsOverlay .zamzok-reels-video {
        position: absolute;
        inset: 0;
        z-index: 1;
      }

      #zamzokReelsOverlay .zamzok-reels-swipe-layer {
        position: absolute;
        inset: 0;
        z-index: 5;
        background: transparent;
        touch-action: none;
        cursor: grab;
      }

      #zamzokReelsOverlay .zamzok-reels-header {
        position: absolute;
        z-index: 20;
      }

      #zamzokReelsOverlay .zamzok-reels-actions,
      #zamzokReelsOverlay .zamzok-reels-bottom,
      #zamzokReelsOverlay .zamzok-reels-nav {
        z-index: 10;
      }
    `;

    document.head.appendChild(style);
  }

  zamzokReelsOverlay = overlay;

  // أزرار المشغل

  getElement('.zamzok-reels-close', overlay)
    .addEventListener('click', () => {
      closeZamzokReels();
    });

  getElement('.zamzok-reels-fullscreen', overlay)
    .addEventListener('click', toggleZamzokFullscreen);

  getElement('.zamzok-reels-prev', overlay)
    .addEventListener('click', () => {
      showZamzokReel(zamzokCurrentIndex - 1);
    });

  getElement('.zamzok-reels-next', overlay)
    .addEventListener('click', () => {
      showZamzokReel(zamzokCurrentIndex + 1);
    });

  getElement('.zamzok-reels-like', overlay)
    .addEventListener('click', openZamzokOnYouTube);

  getElement('.zamzok-reels-comments', overlay)
    .addEventListener('click', openZamzokOnYouTube);

  getElement('.zamzok-reels-share', overlay)
    .addEventListener('click', shareZamzokReel);

  // تشغيل خاصية السحب
  initializeReelsTouch(overlay);

  overlay.addEventListener('click', event => {
    if (event.target === overlay) {
      closeZamzokReels();
    }
  });

  document.addEventListener(
    'keydown',
    handleZamzokReelsKeyboard
  );
}

// ==================================================
// السحب لأعلى ولأسفل
// يدعم اللمس والماوس
// ==================================================

function initializeReelsTouch(overlay) {
  const layer = getElement(
    '.zamzok-reels-swipe-layer',
    overlay
  );

  if (!layer) return;

  let startX = 0;
  let startY = 0;
  let startTime = 0;
  let active = false;

  const MIN_DISTANCE = 55;
  const MAX_SWIPE_TIME = 1200;

  // بداية حركة الإصبع أو الماوس
  layer.addEventListener('pointerdown', event => {
    if (
      event.pointerType === 'mouse' &&
      event.button !== 0
    ) {
      return;
    }

    startX = event.clientX;
    startY = event.clientY;
    startTime = Date.now();

    active = true;

    // دعم السحب بالماوس على الكمبيوتر
    if (event.pointerType === 'mouse') {
      try {
        layer.setPointerCapture(event.pointerId);
      } catch (_) {}
    }
  });

  // نهاية حركة الإصبع أو الماوس
  layer.addEventListener('pointerup', event => {
    if (!active) return;

    active = false;

    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;
    const elapsed = Date.now() - startTime;

    // تجاهل الحركات البطيئة جدًا
    if (elapsed > MAX_SWIPE_TIME) return;

    // يجب أن تكون المسافة كافية
    if (Math.abs(deltaY) < MIN_DISTANCE) return;

    // تجاهل السحب الأفقي أو القطري
    if (
      Math.abs(deltaY) <= Math.abs(deltaX) * 1.2
    ) {
      return;
    }

    // السحب لأعلى = الفيديو التالي
    if (deltaY < 0) {
      showZamzokReel(zamzokCurrentIndex + 1);
    }

    // السحب لأسفل = الفيديو السابق
    else {
      showZamzokReel(zamzokCurrentIndex - 1);
    }
  });

  layer.addEventListener('pointercancel', () => {
    active = false;
  });

  layer.addEventListener('lostpointercapture', () => {
    active = false;
  });
}

// ==================================================
// فتح مشغل الريلز
// ==================================================

function openZamzokReels(index) {
  if (!zamzokReels.length) {
    alert(
      'لا توجد فيديوهات جاهزة للتشغيل حاليًا.'
    );

    return;
  }

  createZamzokReelsPlayer();

  zamzokCurrentIndex = Math.max(
    0,
    Math.min(index, zamzokReels.length - 1)
  );

  zamzokPreviousScroll = window.scrollY;

  zamzokReelsOverlay.classList.add('is-open');

  document.body.classList.add(
    'zamzok-reels-active'
  );

  if (!zamzokHistoryActive) {
    history.pushState(
      { zamzokReels: true },
      '',
      '#zamzok-reels'
    );

    zamzokHistoryActive = true;
  }

  showZamzokReel(zamzokCurrentIndex);
}

// ==================================================
// عرض فيديو داخل مشغل الريلز
// ==================================================

function showZamzokReel(index) {
  if (
    !zamzokReelsOverlay ||
    !zamzokReels.length ||
    index < 0 ||
    index >= zamzokReels.length
  ) {
    return;
  }

  zamzokCurrentIndex = index;

  const reel = zamzokReels[index];

  const container = getElement(
    '.zamzok-reels-video',
    zamzokReelsOverlay
  );

  // إيقاف الفيديو السابق
  container.replaceChildren();

  // إنشاء مشغل يوتيوب
  const iframe = document.createElement('iframe');

  iframe.src =
    `https://www.youtube-nocookie.com/embed/${encodeURIComponent(reel.id)}` +
    '?autoplay=1&playsinline=1&rel=0';

  iframe.title = reel.title;

  iframe.allow =
    'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen';

  iframe.setAttribute('allowfullscreen', '');
  iframe.setAttribute('playsinline', '');
  iframe.setAttribute('loading', 'eager');

  container.appendChild(iframe);

  // عنوان الفيديو
  getElement(
    '.zamzok-reels-title',
    zamzokReelsOverlay
  ).textContent = reel.title;

  // عداد الفيديوهات
  getElement(
    '.zamzok-reels-counter',
    zamzokReelsOverlay
  ).textContent =
    `${index + 1} / ${zamzokReels.length}`;

  // تعطيل التنقل عند أول وآخر فيديو
  getElement(
    '.zamzok-reels-prev',
    zamzokReelsOverlay
  ).disabled = index === 0;

  getElement(
    '.zamzok-reels-next',
    zamzokReelsOverlay
  ).disabled =
    index === zamzokReels.length - 1;
}

// ==================================================
// إغلاق الريلز
// ==================================================

function closeZamzokReels(fromHistory = false) {
  if (!zamzokReelsOverlay) return;

  zamzokReelsOverlay.classList.remove('is-open');

  const container = getElement(
    '.zamzok-reels-video',
    zamzokReelsOverlay
  );

  if (container) {
    container.replaceChildren();
  }

  document.body.classList.remove(
    'zamzok-reels-active'
  );

  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  }

  if (zamzokHistoryActive) {
    zamzokHistoryActive = false;

    if (
      !fromHistory &&
      location.hash === '#zamzok-reels'
    ) {
      history.back();
    }
  }

  window.scrollTo(
    0,
    zamzokPreviousScroll
  );
}

// ==================================================
// التعامل مع زر الرجوع
// ==================================================

window.addEventListener('popstate', () => {
  if (
    zamzokReelsOverlay?.classList.contains('is-open')
  ) {
    closeZamzokReels(true);
  } else {
    zamzokHistoryActive = false;
  }
});

// ==================================================
// ملء الشاشة
// ==================================================

async function toggleZamzokFullscreen() {
  if (!zamzokReelsOverlay) return;

  try {
    if (!document.fullscreenElement) {
      await zamzokReelsOverlay.requestFullscreen();

      zamzokReelsOverlay.classList.add(
        'force-fullscreen'
      );
    } else {
      await document.exitFullscreen();

      zamzokReelsOverlay.classList.remove(
        'force-fullscreen'
      );
    }
  } catch {
    zamzokReelsOverlay.classList.toggle(
      'force-fullscreen'
    );
  }
}

// ==================================================
// فتح الفيديو على يوتيوب
// ==================================================

function openZamzokOnYouTube() {
  const reel = zamzokReels[zamzokCurrentIndex];

  if (!reel) return;

  window.open(
    `https://www.youtube.com/watch?v=${encodeURIComponent(reel.id)}`,
    '_blank',
    'noopener,noreferrer'
  );
}

// ==================================================
// مشاركة الفيديو
// ==================================================

async function shareZamzokReel() {
  const reel = zamzokReels[zamzokCurrentIndex];

  if (!reel) return;

  const url =
    `https://www.youtube.com/watch?v=${encodeURIComponent(reel.id)}`;

  try {
    if (navigator.share) {
      await navigator.share({
        title: reel.title,
        text: 'شاهد الفيديو على ZAMZOK',
        url
      });

      return;
    }

    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);

      alert('تم نسخ رابط الفيديو!');

      return;
    }

    window.prompt(
      'انسخ رابط الفيديو:',
      url
    );

  } catch (error) {
    if (error.name !== 'AbortError') {
      window.prompt('رابط الفيديو:', url);
    }
  }
}

// ==================================================
// اختصارات لوحة المفاتيح
// ==================================================

function handleZamzokReelsKeyboard(event) {
  if (
    !zamzokReelsOverlay?.classList.contains('is-open')
  ) {
    return;
  }

  if (event.key === 'Escape') {
    closeZamzokReels();
  }

  else if (event.key === 'ArrowUp') {
    event.preventDefault();

    showZamzokReel(
      zamzokCurrentIndex + 1
    );
  }

  else if (event.key === 'ArrowDown') {
    event.preventDefault();

    showZamzokReel(
      zamzokCurrentIndex - 1
    );
  }
}

// ==================================================
// تشغيل الريلز عند الضغط على بطاقة فيديو
// ==================================================

document.addEventListener('click', event => {
  const button = event.target.closest(
    '.zamzok-video-button'
  );

  if (!button) return;

  event.preventDefault();

  const id = button.dataset.videoId;

  const index = zamzokReels.findIndex(
    video => video.id === id
  );

  openZamzokReels(
    index >= 0 ? index : 0
  );
});

// ==================================================
// بدء تشغيل الموقع
// ==================================================

function initializeZamzok() {
  initializeMainMenu();
  initializeYear();
  createPlaylistControls();
  connectWorldCategories();
  createZamzokReelsPlayer();
  loadZamzokVideos();
}

if (document.readyState === 'loading') {
  document.addEventListener(
    'DOMContentLoaded',
    initializeZamzok
  );
} else {
  initializeZamzok();
}
