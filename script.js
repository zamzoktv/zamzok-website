```javascript
// ==================================================
// ZAMZOK WEBSITE — COMPLETE SCRIPT.JS
// YouTube Playlists + Videos + Reels + Navigation
// ==================================================

'use strict';

// --------------------------------------------------
// 1. إعدادات الموقع ويوتيوب
// --------------------------------------------------

const ZAMZOK_CONFIG = {
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
    }
  ]
};

// --------------------------------------------------
// 2. المتغيرات العامة
// --------------------------------------------------

let zamzokVideos = [];
let zamzokReels = [];
let zamzokCurrentIndex = 0;
let zamzokReelsOverlay = null;
let zamzokCurrentSource = 'all';
let zamzokHistoryActive = false;
let zamzokPreviousScroll = 0;

let zamzokTouchStartX = 0;
let zamzokTouchStartY = 0;

let zamzokLoadingPromise = null;

// --------------------------------------------------
// 3. أدوات مساعدة
// --------------------------------------------------

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

function getElement(selector, parent = document) {
  return parent.querySelector(selector);
}

function showVideoMessage(message) {
  const grid = document.getElementById('videoGrid');
  if (!grid) return;

  grid.setAttribute('aria-busy', 'false');

  grid.innerHTML = `
    <p class="zamzok-message">
      ${escapeHTML(message)}
    </p>
  `;
}

function getThumbnail(video) {
  const thumbnails = video?.snippet?.thumbnails || {};

  return (
    thumbnails.maxres?.url ||
    thumbnails.high?.url ||
    thumbnails.medium?.url ||
    thumbnails.standard?.url ||
    thumbnails.default?.url ||
    ''
  );
}

// --------------------------------------------------
// 4. القائمة الرئيسية
// --------------------------------------------------

function initializeMainMenu() {
  const toggle = document.getElementById('menuToggle');
  const nav = document.getElementById('mainNav');

  if (!toggle || !nav) return;

  toggle.addEventListener('click', () => {
    const isOpen = nav.classList.toggle('open');

    toggle.setAttribute('aria-expanded', String(isOpen));
    toggle.textContent = isOpen ? '✕' : '☰';
  });

  nav.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      nav.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.textContent = '☰';
    });
  });
}

// --------------------------------------------------
// 5. السنة الحالية
// --------------------------------------------------

function initializeYear() {
  const year = document.getElementById('year');

  if (year) {
    year.textContent = new Date().getFullYear();
  }
}

// --------------------------------------------------
// 6. الاتصال بـ YouTube Data API
// --------------------------------------------------

async function youtubeRequest(endpoint, params = {}) {
  if (
    !ZAMZOK_CONFIG.apiKey ||
    ZAMZOK_CONFIG.apiKey === 'ضع_مفتاح_YOUTUBE_API_هنا'
  ) {
    throw new Error(
      'أضف مفتاح YouTube API الصحيح داخل إعدادات الملف.'
    );
  }

  const url = new URL(
    `${ZAMZOK_CONFIG.apiUrl}/${endpoint}`
  );

  Object.entries({
    ...params,
    key: ZAMZOK_CONFIG.apiKey
  }).forEach(([key, value]) => {
    url.searchParams.set(key, String(value));
  });

  const response = await fetch(url.toString());

  let data;

  try {
    data = await response.json();
  } catch {
    throw new Error('تعذر قراءة استجابة يوتيوب.');
  }

  if (!response.ok) {
    const reason = data?.error?.errors?.[0]?.reason;

    if (reason === 'quotaExceeded') {
      throw new Error(
        'تم استهلاك حصة YouTube API اليومية.'
      );
    }

    if (reason === 'keyInvalid' || reason === 'badRequest') {
      throw new Error(
        'راجع مفتاح API وإعدادات YouTube Data API v3.'
      );
    }

    if (response.status === 403) {
      throw new Error(
        'رفض يوتيوب الطلب. راجع صلاحيات المفتاح وقيود استخدامه.'
      );
    }

    throw new Error(
      data?.error?.message ||
      `حدث خطأ في يوتيوب (${response.status}).`
    );
  }

  return data;
}

// --------------------------------------------------
// 7. جلب فيديوهات قائمة تشغيل
// --------------------------------------------------

async function fetchPlaylistVideos(playlist) {
  const results = [];
  let pageToken = '';

  // تحميل أول 50 فيديو كحد أقصى لتقليل استهلاك API.
  // يمكن تحميل صفحات إضافية عند الحاجة لاحقًا.
  const params = {
    part: 'snippet,contentDetails',
    playlistId: playlist.id,
    maxResults: 50
  };

  if (pageToken) {
    params.pageToken = pageToken;
  }

  const data = await youtubeRequest(
    'playlistItems',
    params
  );

  for (const item of data.items || []) {
    const videoId = item.contentDetails?.videoId;

    if (!videoId) continue;

    results.push({
      id: videoId,
      title: item.snippet?.title || 'فيديو ZAMZOK',
      thumbnail: getThumbnail(item),
      publishedAt: item.contentDetails?.videoPublishedAt ||
        item.snippet?.publishedAt || '',
      source: playlist.type,
      playlistName: playlist.name,
      playlistArabicName: playlist.arabicName
    });
  }

  return results;
}

// --------------------------------------------------
// 8. جلب فيديوهات القناة
// --------------------------------------------------

async function fetchChannelVideos() {
  const channelData = await youtubeRequest('channels', {
    part: 'contentDetails',
    id: ZAMZOK_CONFIG.channelId
  });

  const channel = channelData.items?.[0];

  if (!channel) {
    throw new Error(
      'لم يتم العثور على قناة ZAMZOK. راجع Channel ID.'
    );
  }

  const uploadsPlaylist =
    channel.contentDetails?.relatedPlaylists?.uploads;

  if (!uploadsPlaylist) {
    throw new Error(
      'تعذر العثور على قائمة الفيديوهات المرفوعة.'
    );
  }

  const data = await youtubeRequest('playlistItems', {
    part: 'snippet,contentDetails',
    playlistId: uploadsPlaylist,
    maxResults: 50
  });

  return (data.items || [])
    .map(item => {
      const id = item.contentDetails?.videoId;

      if (!id) return null;

      return {
        id,
        title: item.snippet?.title || 'فيديو ZAMZOK',
        thumbnail: getThumbnail(item),
        publishedAt: item.contentDetails?.videoPublishedAt ||
          item.snippet?.publishedAt || '',
        source: 'all',
        playlistName: '',
        playlistArabicName: ''
      };
    })
    .filter(Boolean);
}

// --------------------------------------------------
// 9. إنشاء أزرار قوائم التشغيل
// --------------------------------------------------

function createPlaylistControls() {
  const player = getElement('.zamzok-player');
  const grid = document.getElementById('videoGrid');

  if (!player || !grid) return;

  let controls = document.getElementById(
    'zamzokPlaylistControls'
  );

  if (!controls) {
    controls = document.createElement('div');
    controls.id = 'zamzokPlaylistControls';
    controls.className = 'zamzok-playlist-controls';

    grid.parentNode.insertBefore(controls, grid);
  }

  controls.innerHTML = `
    <button
      type="button"
      class="zamzok-playlist-btn is-active"
      data-source="all"
      aria-pressed="true"
    >
      🎬 كل الفيديوهات
    </button>

    ${ZAMZOK_CONFIG.playlists.map(playlist => `
      <button
        type="button"
        class="zamzok-playlist-btn"
        data-source="${escapeHTML(playlist.type)}"
        aria-pressed="false"
      >
        ${playlist.emoji}
        ${escapeHTML(playlist.arabicName)}
      </button>
    `).join('')}
  `;

  if (!document.getElementById('zamzokPlaylistStyles')) {
    const style = document.createElement('style');
    style.id = 'zamzokPlaylistStyles';

    style.textContent = `
      .zamzok-playlist-controls {
        display: flex;
        flex-wrap: wrap;
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
        transition: .2s ease;
      }

      .zamzok-playlist-btn:hover,
      .zamzok-playlist-btn.is-active {
        color: #160e02;
        border-color: #ffcf55;
        background: linear-gradient(
          120deg,
          #ffe78c,
          #ffad2e
        );
      }

      .zamzok-message {
        grid-column: 1 / -1;
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

// --------------------------------------------------
// 10. اختيار قائمة تشغيل
// --------------------------------------------------

function setActivePlaylist(source) {
  zamzokCurrentSource = source;

  const controls = document.getElementById(
    'zamzokPlaylistControls'
  );

  if (controls) {
    controls.querySelectorAll('[data-source]').forEach(button => {
      const active = button.dataset.source === source;

      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  renderZamzokVideos();
}

// --------------------------------------------------
// 11. عرض بطاقات الفيديوهات
// --------------------------------------------------

function renderZamzokVideos() {
  const grid = document.getElementById('videoGrid');

  if (!grid) return;

  const filtered = zamzokCurrentSource === 'all'
    ? zamzokVideos
    : zamzokVideos.filter(
        video => video.source === zamzokCurrentSource
      );

  if (!filtered.length) {
    showVideoMessage(
      'لا توجد فيديوهات في هذه القائمة حاليًا.'
    );
    return;
  }

  grid.setAttribute('aria-busy', 'false');

  grid.innerHTML = filtered.map(video => {
    const originalIndex = zamzokVideos.findIndex(
      item => item.id === video.id
    );

    return `
      <article class="video-card zamzok-video-card">
        <button
          class="zamzok-video-button"
          type="button"
          data-video-id="${escapeHTML(video.id)}"
          data-video-index="${originalIndex}"
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
    `;
  }).join('');

  // القائمة الحالية للريلز تتبع الفلتر المختار.
  zamzokReels = filtered.slice();
}

// --------------------------------------------------
// 12. تحميل فيديوهات القناة وقوائم التشغيل
// --------------------------------------------------

async function loadZamzokVideos() {
  if (zamzokLoadingPromise) {
    return zamzokLoadingPromise;
  }

  zamzokLoadingPromise = (async () => {
    const grid = document.getElementById('videoGrid');

    if (!grid) return;

    grid.setAttribute('aria-busy', 'true');

    showVideoMessage('جاري تحميل فيديوهات ZAMZOK...');

    createPlaylistControls();

    try {
      const results = await Promise.allSettled([
        fetchChannelVideos(),
        ...ZAMZOK_CONFIG.playlists.map(fetchPlaylistVideos)
      ]);

      const allVideos = [];
      const failedSources = [];

      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          allVideos.push(...result.value);
        } else {
          console.error(
            'ZAMZOK source loading error:',
            result.reason
          );

          failedSources.push(
            index === 0
              ? 'فيديوهات القناة'
              : ZAMZOK_CONFIG.playlists[index - 1].arabicName
          );
        }
      });

      // إزالة التكرار مع الاحتفاظ بأول نسخة لكل فيديو.
      const uniqueVideos = new Map();

      allVideos.forEach(video => {
        const existing = uniqueVideos.get(video.id);

        if (!existing) {
          uniqueVideos.set(video.id, video);
          return;
        }

        // أولوية معلومات قائمة التشغيل على معلومات القناة.
        if (video.source !== 'all') {
          uniqueVideos.set(video.id, {
            ...existing,
            ...video
          });
        }
      });

      zamzokVideos = Array.from(uniqueVideos.values());

      if (!zamzokVideos.length) {
        showVideoMessage(
          failedSources.length
            ? `تعذر تحميل الفيديوهات. تحقق من مفتاح API وقوائم التشغيل.`
            : 'لا توجد فيديوهات متاحة حاليًا.'
        );

        return;
      }

      // تحديث قائمة الريلز ثم عرض كل الفيديوهات.
      zamzokReels = zamzokVideos.slice();

      setActivePlaylist('all');

      if (failedSources.length) {
        console.warn(
          'تعذر تحميل بعض المصادر:',
          failedSources
        );
      }
    } catch (error) {
      console.error('ZAMZOK loading error:', error);

      showVideoMessage(
        `تعذر تحميل الفيديوهات: ${error.message}`
      );
    } finally {
      grid.setAttribute('aria-busy', 'false');
      zamzokLoadingPromise = null;
    }
  })();

  return zamzokLoadingPromise;
}

// --------------------------------------------------
// 13. ربط عوالم الموقع بقوائم التشغيل
// --------------------------------------------------

function connectWorldCategories() {
  const comedy = getElement('.world-comedy');
  const adventure = getElement('.world-adventure');

  if (comedy) {
    comedy.href = '#videos';

    comedy.addEventListener('click', event => {
      event.preventDefault();

      setActivePlaylist('comedy');

      document.getElementById('videos')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    });
  }

  if (adventure) {
    adventure.href = '#videos';

    adventure.addEventListener('click', event => {
      event.preventDefault();

      setActivePlaylist('adventure');

      document.getElementById('videos')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    });
  }
}

// --------------------------------------------------
// 14. إنشاء واجهة الريلز
// --------------------------------------------------

function createZamzokReelsPlayer() {
  if (document.getElementById('zamzokReelsOverlay')) {
    zamzokReelsOverlay =
      document.getElementById('zamzokReelsOverlay');

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
          aria-label="الإعجاب بالفيديو"
        >
          <span class="zamzok-reels-action-icon">♡</span>
          <span>إعجاب</span>
        </button>

        <button
          type="button"
          class="zamzok-reels-action zamzok-reels-comments"
          aria-label="التعليقات"
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
          استخدم الأسهم أو اسحب للتنقل بين الفيديوهات
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
  zamzokReelsOverlay = overlay;

  getElement('.zamzok-reels-close', overlay)
    .addEventListener('click', closeZamzokReels);

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

  // التنقل باللمس عندما يستقبل المتصفح أحداث اللمس.
  const stage = getElement('.zamzok-reels-stage', overlay);

  stage.addEventListener('touchstart', event => {
    if (event.touches.length !== 1) return;

    zamzokTouchStartX = event.touches[0].clientX;
    zamzokTouchStartY = event.touches[0].clientY;
  }, { passive: true });

  stage.addEventListener('touchend', event => {
    if (event.changedTouches.length !== 1) return;

    const deltaX =
      event.changedTouches[0].clientX - zamzokTouchStartX;

    const deltaY =
      event.changedTouches[0].clientY - zamzokTouchStartY;

    if (
      Math.abs(deltaY) < 60 ||
      Math.abs(deltaY) < Math.abs(deltaX)
    ) {
      return;
    }

    showZamzokReel(
      deltaY < 0
        ? zamzokCurrentIndex + 1
        : zamzokCurrentIndex - 1
    );
  }, { passive: true });

  document.addEventListener(
    'keydown',
    handleZamzokReelsKeyboard
  );
}

// --------------------------------------------------
// 15. فتح الريلز
// --------------------------------------------------

function openZamzokReels(index) {
  if (!zamzokReels.length) {
    zamzokReels = zamzokVideos.slice();
  }

  if (!zamzokReels.length) {
    alert('الفيديوهات لم تُحمّل بعد. حاول مرة أخرى.');
    return;
  }

  createZamzokReelsPlayer();

  zamzokCurrentIndex = Math.max(
    0,
    Math.min(index, zamzokReels.length - 1)
  );

  zamzokPreviousScroll = window.scrollY;

  zamzokReelsOverlay.classList.add('is-open');
  document.body.classList.add('zamzok-reels-active');

  // إضافة حالة في سجل المتصفح حتى يعمل زر الرجوع قدر الإمكان.
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

// --------------------------------------------------
// 16. عرض فيديو في الريلز
// --------------------------------------------------

function showZamzokReel(index) {
  if (!zamzokReelsOverlay || !zamzokReels.length) return;

  if (index < 0 || index >= zamzokReels.length) return;

  zamzokCurrentIndex = index;

  const reel = zamzokReels[index];

  const videoContainer = getElement(
    '.zamzok-reels-video',
    zamzokReelsOverlay
  );

  videoContainer.innerHTML = '';

  const iframe = document.createElement('iframe');

  iframe.src =
    'https://www.youtube-nocookie.com/embed/' +
    encodeURIComponent(reel.id) +
    '?autoplay=1&playsinline=1&rel=0';

  iframe.title = reel.title;

  iframe.allow =
    'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen';

  iframe.setAttribute('allowfullscreen', '');
  iframe.setAttribute('playsinline', '');
  iframe.setAttribute('loading', 'eager');

  videoContainer.appendChild(iframe);

  getElement('.zamzok-reels-title', zamzokReelsOverlay)
    .textContent = reel.title;

  getElement('.zamzok-reels-counter', zamzokReelsOverlay)
    .textContent = `${index + 1} / ${zamzokReels.length}`;

  getElement('.zamzok-reels-prev', zamzokReelsOverlay)
    .disabled = index === 0;

  getElement('.zamzok-reels-next', zamzokReelsOverlay)
    .disabled = index === zamzokReels.length - 1;
}

// --------------------------------------------------
// 17. إغلاق الريلز
// --------------------------------------------------

function closeZamzokReels(fromHistory = false) {
  if (!zamzokReelsOverlay) return;

  zamzokReelsOverlay.classList.remove('is-open');

  const videoContainer = getElement(
    '.zamzok-reels-video',
    zamzokReelsOverlay
  );

  if (videoContainer) {
    videoContainer.innerHTML = '';
  }

  document.body.classList.remove('zamzok-reels-active');

  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  }

  // منع بقاء عنوان الريلز في الرابط بعد الإغلاق.
  if (zamzokHistoryActive) {
    zamzokHistoryActive = false;

    if (!fromHistory && location.hash === '#zamzok-reels') {
      history.back();
    }
  }

  window.scrollTo(0, zamzokPreviousScroll);
}

// --------------------------------------------------
// 18. زر الرجوع في المتصفح وأندرويد
// --------------------------------------------------

window.addEventListener('popstate', () => {
  if (
    zamzokReelsOverlay?.classList.contains('is-open')
  ) {
    closeZamzokReels(true);
    return;
  }

  zamzokHistoryActive = false;
});

// --------------------------------------------------
// 19. ملء الشاشة
// --------------------------------------------------

async function toggleZamzokFullscreen() {
  if (!zamzokReelsOverlay) return;

  try {
    if (!document.fullscreenElement) {
      await zamzokReelsOverlay.requestFullscreen();
      zamzokReelsOverlay.classList.add('force-fullscreen');
    } else {
      await document.exitFullscreen();
      zamzokReelsOverlay.classList.remove('force-fullscreen');
    }
  } catch (error) {
    // بعض متصفحات أندرويد لا تدعم Fullscreen API.
    zamzokReelsOverlay.classList.toggle('force-fullscreen');
  }
}

// --------------------------------------------------
// 20. فتح الفيديو على يوتيوب
// --------------------------------------------------

function openZamzokOnYouTube() {
  const reel = zamzokReels[zamzokCurrentIndex];

  if (!reel) return;

  const url =
    `https://www.youtube.com/watch?v=${encodeURIComponent(reel.id)}`;

  window.open(url, '_blank', 'noopener,noreferrer');
}

// --------------------------------------------------
// 21. مشاركة الفيديو
// --------------------------------------------------

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
    } else if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      alert('تم نسخ رابط الفيديو!');
    } else {
      window.prompt('انسخ رابط الفيديو:', url);
    }
  } catch (error) {
    if (error.name !== 'AbortError') {
      window.prompt('رابط الفيديو:', url);
    }
  }
}

// --------------------------------------------------
// 22. لوحة المفاتيح
// --------------------------------------------------

function handleZamzokReelsKeyboard(event) {
  if (!zamzokReelsOverlay?.classList.contains('is-open')) {
    return;
  }

  if (event.key === 'Escape') {
    closeZamzokReels();
  }

  if (event.key === 'ArrowUp') {
    showZamzokReel(zamzokCurrentIndex + 1);
  }

  if (event.key === 'ArrowDown') {
    showZamzokReel(zamzokCurrentIndex - 1);
  }
}

// --------------------------------------------------
// 23. تشغيل الريلز عند الضغط على بطاقة
// --------------------------------------------------

document.addEventListener('click', event => {
  const button = event.target.closest('.zamzok-video-button');

  if (!button) return;

  event.preventDefault();

  const videoId = button.dataset.videoId;

  // الحفاظ على ترتيب الفيديوهات في القائمة المختارة.
  const selectedVideos = zamzokCurrentSource === 'all'
    ? zamzokVideos
    : zamzokVideos.filter(
        video => video.source === zamzokCurrentSource
      );

  zamzokReels = selectedVideos.slice();

  const index = zamzokReels.findIndex(
    video => video.id === videoId
  );

  openZamzokReels(index >= 0 ? index : 0);
});

// --------------------------------------------------
// 24. بدء تشغيل الموقع
// --------------------------------------------------

function initializeZamzok() {
  initializeMainMenu();
  initializeYear();
  createPlaylistControls();
  connectWorldCategories();
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
```
