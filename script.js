```javascript
'use strict';

/* =========================================
   ZAMZOK — CONFIGURATION
========================================= */

const ZAMZOK_CONFIG = {
  // ضع مفتاح YouTube Data API v3 الحالي هنا.
  // تنبيه: المفتاح الموجود في كود المتصفح يمكن للآخرين رؤيته.
  apiKey: 'AIzaSyDpukCjizMYEkdtvm6h7RqzcUjSKthhaPo',

  // Channel ID الخاص بقناة ZAMZOK.
  channelId: 'UCNuIyleVU-8sXQFDitaKiSg',

  maxVideos: 30,
  apiBase: 'https://www.googleapis.com/youtube/v3'
};

const ZAMZOK = {
  videos: [],
  currentIndex: 0,
  overlay: null,
  iframe: null,
  titleElement: null,
  counterElement: null,
  stage: null,
  videoContainer: null,
  historyEntryActive: false,
  ignoreNextPopstate: false,
  previousBodyOverflow: '',
  touchStartX: 0,
  touchStartY: 0,
  touchStartTime: 0,
  pointerStartX: 0,
  pointerStartY: 0,
  loading: false,
  requestId: 0
};

/* =========================================
   HELPERS
========================================= */

function $(selector, parent = document) {
  return parent.querySelector(selector);
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);

  if (className) {
    element.className = className;
  }

  if (text !== undefined) {
    element.textContent = text;
  }

  return element;
}

function setText(element, value) {
  if (element) {
    element.textContent = value || '';
  }
}

function safeExternalUrl(url) {
  try {
    const parsed = new URL(url);

    if (parsed.protocol === 'https:') {
      return parsed.href;
    }
  } catch (_) {
    // Ignore invalid URLs.
  }

  return 'https://www.youtube.com/';
}

function getYouTubeUrl(videoId) {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}

function getThumbnail(video) {
  const thumbnails = video?.snippet?.thumbnails || {};

  return (
    thumbnails.maxres?.url ||
    thumbnails.standard?.url ||
    thumbnails.high?.url ||
    thumbnails.medium?.url ||
    thumbnails.default?.url ||
    ''
  );
}

function getVideoTitle(video) {
  return video?.snippet?.title || 'فيديو من قناة ZAMZOK';
}

function isValidVideoId(videoId) {
  return typeof videoId === 'string' &&
    /^[a-zA-Z0-9_-]{11}$/.test(videoId);
}

/* =========================================
   MOBILE MENU
========================================= */

function initMobileMenu() {
  const menuToggle = $('#menuToggle');
  const mainNav = $('#mainNav');

  if (!menuToggle || !mainNav) {
    return;
  }

  function closeMenu() {
    mainNav.classList.remove('open');
    menuToggle.setAttribute('aria-expanded', 'false');
  }

  menuToggle.setAttribute('aria-expanded', 'false');

  menuToggle.addEventListener('click', () => {
    const isOpen = mainNav.classList.toggle('open');

    menuToggle.setAttribute('aria-expanded', String(isOpen));
  });

  mainNav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', closeMenu);
  });

  document.addEventListener('click', (event) => {
    if (
      mainNav.classList.contains('open') &&
      !mainNav.contains(event.target) &&
      !menuToggle.contains(event.target)
    ) {
      closeMenu();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeMenu();
    }
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 720) {
      closeMenu();
    }
  });
}

/* =========================================
   FOOTER YEAR
========================================= */

function initFooterYear() {
  const yearElement = $('#year');

  if (yearElement) {
    yearElement.textContent = String(new Date().getFullYear());
  }
}

/* =========================================
   YOUTUBE API
========================================= */

async function fetchYouTubeJson(endpoint, params = {}) {
  const url = new URL(`${ZAMZOK_CONFIG.apiBase}/${endpoint}`);

  Object.entries({
    ...params,
    key: ZAMZOK_CONFIG.apiKey
  }).forEach(([key, value]) => {
    url.searchParams.set(key, String(value));
  });

  const response = await fetch(url.toString());

  if (!response.ok) {
    let details = '';

    try {
      const errorData = await response.json();
      details = errorData?.error?.message || '';
    } catch (_) {
      // Ignore invalid error response.
    }

    throw new Error(
      details || `YouTube API error: ${response.status}`
    );
  }

  return response.json();
}

async function fetchChannelVideos() {
  if (
    !ZAMZOK_CONFIG.apiKey ||
    ZAMZOK_CONFIG.apiKey === 'PASTE_YOUR_YOUTUBE_API_KEY_HERE'
  ) {
    throw new Error('لم يتم إدخال مفتاح YouTube Data API في ملف script.js.');
  }

  const channelData = await fetchYouTubeJson('channels', {
    part: 'contentDetails',
    id: ZAMZOK_CONFIG.channelId
  });

  const channel = channelData.items?.[0];

  if (!channel) {
    throw new Error('لم يتم العثور على قناة YouTube. راجع Channel ID.');
  }

  const uploadsPlaylistId =
    channel.contentDetails?.relatedPlaylists?.uploads;

  if (!uploadsPlaylistId) {
    throw new Error('تعذر العثور على قائمة فيديوهات القناة.');
  }

  const allVideos = [];
  let pageToken = '';

  while (allVideos.length < ZAMZOK_CONFIG.maxVideos) {
    const params = {
      part: 'snippet,contentDetails',
      playlistId: uploadsPlaylistId,
      maxResults: Math.min(
        50,
        ZAMZOK_CONFIG.maxVideos - allVideos.length
      )
    };

    if (pageToken) {
      params.pageToken = pageToken;
    }

    const data = await fetchYouTubeJson('playlistItems', params);

    const items = (data.items || [])
      .map((item) => {
        const videoId = item.contentDetails?.videoId;

        if (!isValidVideoId(videoId)) {
          return null;
        }

        return {
          id: videoId,
          snippet: item.snippet || {},
          contentDetails: item.contentDetails || {}
        };
      })
      .filter(Boolean);

    allVideos.push(...items);

    pageToken = data.nextPageToken || '';

    if (!pageToken || items.length === 0) {
      break;
    }
  }

  return allVideos.slice(0, ZAMZOK_CONFIG.maxVideos);
}

/* =========================================
   VIDEO GRID
========================================= */

function setGridMessage(message, isError = false) {
  const grid = $('#videoGrid');

  if (!grid) {
    return;
  }

  grid.replaceChildren();

  const paragraph = createElement(
    'p',
    isError ? 'video-grid-error' : 'video-grid-message',
    message
  );

  paragraph.setAttribute('role', isError ? 'alert' : 'status');

  grid.appendChild(paragraph);
  grid.setAttribute('aria-busy', 'false');
}

function createVideoCard(video, index) {
  const card = createElement('article', 'zamzok-video-card');

  const button = createElement('button', 'zamzok-video-button');
  button.type = 'button';
  button.dataset.videoId = video.id;
  button.dataset.videoIndex = String(index);
  button.setAttribute('aria-label', `تشغيل الفيديو: ${getVideoTitle(video)}`);

  const image = createElement('img');

  image.src =
    getThumbnail(video) ||
    `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`;

  image.alt = getVideoTitle(video);
  image.loading = index < 4 ? 'eager' : 'lazy';
  image.decoding = 'async';
  image.referrerPolicy = 'strict-origin-when-cross-origin';

  image.onerror = () => {
    image.onerror = null;
    image.src = `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`;
  };

  const playIndicator = createElement('span', 'video-play-indicator', '▶');
  playIndicator.setAttribute('aria-hidden', 'true');

  button.append(image, playIndicator);

  const info = createElement('div', 'video-info');
  const heading = createElement('h3', '', getVideoTitle(video));

  info.appendChild(heading);
  card.append(button, info);

  return card;
}

function renderVideoGrid(videos) {
  const grid = $('#videoGrid');

  if (!grid) {
    return;
  }

  grid.replaceChildren();

  if (!videos.length) {
    setGridMessage('لا توجد فيديوهات متاحة للعرض حاليًا.', true);
    return;
  }

  const fragment = document.createDocumentFragment();

  videos.forEach((video, index) => {
    fragment.appendChild(createVideoCard(video, index));
  });

  grid.appendChild(fragment);
  grid.setAttribute('aria-busy', 'false');
}

/* =========================================
   REELS OVERLAY CREATION
========================================= */

function createReelsOverlay() {
  if (ZAMZOK.overlay) {
    return;
  }

  const overlay = createElement('div', 'zamzok-reels-overlay');
  overlay.id = 'zamzokReelsOverlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'مشغل فيديوهات ZAMZOK');
  overlay.setAttribute('aria-hidden', 'true');

  const header = createElement('header', 'zamzok-reels-header');

  const brand = createElement(
    'div',
    'zamzok-reels-brand',
    'ZAMZOK'
  );

  const headerActions = createElement(
    'div',
    'zamzok-reels-header-actions'
  );

  const fullscreenButton = createElement(
    'button',
    'zamzok-reels-fullscreen',
    '⛶'
  );

  fullscreenButton.type = 'button';
  fullscreenButton.setAttribute('aria-label', 'ملء الشاشة');
  fullscreenButton.title = 'ملء الشاشة';

  const closeButton = createElement(
    'button',
    'zamzok-reels-close',
    '×'
  );

  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', 'إغلاق الفيديو');
  closeButton.title = 'إغلاق';

  headerActions.append(fullscreenButton, closeButton);
  header.append(brand, headerActions);

  const stage = createElement('div', 'zamzok-reels-stage');
  stage.setAttribute('aria-label', 'مشغل الفيديو');

  const videoContainer = createElement('div', 'zamzok-reels-video');

  const loading = createElement(
    'div',
    'zamzok-reels-loading',
    'جاري تحميل الفيديو...'
  );

  loading.setAttribute('role', 'status');

  videoContainer.appendChild(loading);

  const hint = createElement(
    'div',
    'zamzok-reels-hint',
    'استخدم الأسهم أو أزرار التنقل للفيديو التالي والسابق'
  );

  hint.setAttribute('aria-hidden', 'true');

  stage.append(videoContainer, hint);

  const actions = createElement('div', 'zamzok-reels-actions');

  const shareButton = createElement(
    'button',
    'zamzok-reels-action',
    '↗'
  );

  shareButton.type = 'button';
  shareButton.setAttribute('aria-label', 'مشاركة الفيديو');
  shareButton.title = 'مشاركة';

  const youtubeButton = createElement(
    'button',
    'zamzok-reels-action',
    '▶'
  );

  youtubeButton.type = 'button';
  youtubeButton.setAttribute('aria-label', 'فتح الفيديو على YouTube');
  youtubeButton.title = 'فتح على YouTube';

  actions.append(shareButton, youtubeButton);

  const bottom = createElement('div', 'zamzok-reels-bottom');

  const info = createElement('div', 'zamzok-reels-info');

  const title = createElement('h2', 'zamzok-reels-title');
  const counter = createElement('span', 'zamzok-reels-counter');

  info.append(title, counter);

  const navigation = createElement('div', 'zamzok-reels-nav');

  const previousButton = createElement(
    'button',
    'zamzok-reels-prev',
    '↑ السابق'
  );

  previousButton.type = 'button';
  previousButton.setAttribute('aria-label', 'الفيديو السابق');

  const nextButton = createElement(
    'button',
    'zamzok-reels-next',
    'التالي ↓'
  );

  nextButton.type = 'button';
  nextButton.setAttribute('aria-label', 'الفيديو التالي');

  navigation.append(previousButton, nextButton);
  bottom.append(info, navigation);

  overlay.append(header, stage, actions, bottom);
  document.body.appendChild(overlay);

  ZAMZOK.overlay = overlay;
  ZAMZOK.iframe = null;
  ZAMZOK.titleElement = title;
  ZAMZOK.counterElement = counter;
  ZAMZOK.stage = stage;
  ZAMZOK.videoContainer = videoContainer;

  closeButton.addEventListener('click', closeReels);
  fullscreenButton.addEventListener('click', toggleFullscreen);

  previousButton.addEventListener('click', () => {
    showVideo(ZAMZOK.currentIndex - 1);
  });

  nextButton.addEventListener('click', () => {
    showVideo(ZAMZOK.currentIndex + 1);
  });

  shareButton.addEventListener('click', shareCurrentVideo);

  youtubeButton.addEventListener('click', () => {
    const video = ZAMZOK.videos[ZAMZOK.currentIndex];

    if (video) {
      window.open(
        safeExternalUrl(getYouTubeUrl(video.id)),
        '_blank',
        'noopener,noreferrer'
      );
    }
  });

  /*
   * Gestures on the stage work where the touch event is received
   * by the page. YouTube's iframe may capture gestures inside itself.
   */
  stage.addEventListener(
    'touchstart',
    (event) => {
      const touch = event.changedTouches?.[0];

      if (!touch) {
        return;
      }

      ZAMZOK.touchStartX = touch.clientX;
      ZAMZOK.touchStartY = touch.clientY;
      ZAMZOK.touchStartTime = Date.now();
    },
    { passive: true }
  );

  stage.addEventListener(
    'touchend',
    (event) => {
      const touch = event.changedTouches?.[0];

      if (!touch) {
        return;
      }

      const deltaX = touch.clientX - ZAMZOK.touchStartX;
      const deltaY = touch.clientY - ZAMZOK.touchStartY;
      const elapsed = Date.now() - ZAMZOK.touchStartTime;

      if (elapsed > 900) {
        return;
      }

      handleSwipe(deltaX, deltaY);
    },
    { passive: true }
  );

  stage.addEventListener('pointerdown', (event) => {
    ZAMZOK.pointerStartX = event.clientX;
    ZAMZOK.pointerStartY = event.clientY;
  });

  stage.addEventListener('pointerup', (event) => {
    if (event.pointerType === 'touch') {
      return;
    }

    const deltaX = event.clientX - ZAMZOK.pointerStartX;
    const deltaY = event.clientY - ZAMZOK.pointerStartY;

    handleSwipe(deltaX, deltaY);
  });

  /*
   * Clicking the dark area outside the video closes the player.
   */
  stage.addEventListener('click', (event) => {
    if (
      event.target === stage ||
      event.target.classList.contains('zamzok-reels-hint')
    ) {
      closeReels();
    }
  });
}

/* =========================================
   VIDEO PLAYBACK
========================================= */

function setReelsLoading(isLoading) {
  const loading = $('.zamzok-reels-loading', ZAMZOK.videoContainer);

  if (loading) {
    loading.style.display = isLoading ? 'flex' : 'none';
  }
}

function createYouTubeEmbedUrl(videoId) {
  const url = new URL(
    `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}`
  );

  url.searchParams.set('autoplay', '1');
  url.searchParams.set('playsinline', '1');
  url.searchParams.set('rel', '0');
  url.searchParams.set('controls', '1');
  url.searchParams.set('enablejsapi', '1');

  return url.toString();
}

function showVideo(index) {
  if (!ZAMZOK.videos.length) {
    return;
  }

  if (index < 0 || index >= ZAMZOK.videos.length) {
    return;
  }

  ZAMZOK.currentIndex = index;

  const video = ZAMZOK.videos[index];

  setText(ZAMZOK.titleElement, getVideoTitle(video));
  setText(
    ZAMZOK.counterElement,
    `${index + 1} / ${ZAMZOK.videos.length}`
  );

  const previousButton = $('.zamzok-reels-prev', ZAMZOK.overlay);
  const nextButton = $('.zamzok-reels-next', ZAMZOK.overlay);

  if (previousButton) {
    previousButton.disabled = index <= 0;
  }

  if (nextButton) {
    nextButton.disabled = index >= ZAMZOK.videos.length - 1;
  }

  const oldIframe = $('iframe', ZAMZOK.videoContainer);

  if (oldIframe) {
    oldIframe.remove();
  }

  ZAMZOK.iframe = null;
  setReelsLoading(true);

  const iframe = document.createElement('iframe');

  iframe.src = createYouTubeEmbedUrl(video.id);
  iframe.title = getVideoTitle(video);
  iframe.allow =
    'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
  iframe.allowFullscreen = true;
  iframe.referrerPolicy = 'strict-origin-when-cross-origin';
  iframe.loading = 'eager';

  iframe.addEventListener('load', () => {
    if (ZAMZOK.iframe === iframe) {
      setReelsLoading(false);
    }
  });

  /*
   * YouTube embeds do not always provide a useful error event.
   * This timeout only removes the loading indicator; it does not
   * claim that playback succeeded.
   */
  const thisRequestId = ++ZAMZOK.requestId;

  window.setTimeout(() => {
    if (
      thisRequestId === ZAMZOK.requestId &&
      ZAMZOK.iframe === iframe
    ) {
      setReelsLoading(false);
    }
  }, 10000);

  ZAMZOK.iframe = iframe;
  ZAMZOK.videoContainer.appendChild(iframe);
}

function openReels(index) {
  if (!ZAMZOK.videos.length) {
    return;
  }

  createReelsOverlay();

  const targetIndex = Math.max(
    0,
    Math.min(index, ZAMZOK.videos.length - 1)
  );

  ZAMZOK.previousBodyOverflow = document.body.style.overflow;

  ZAMZOK.overlay.classList.add('is-open');
  ZAMZOK.overlay.setAttribute('aria-hidden', 'false');

  document.body.classList.add('zamzok-reels-active');
  document.body.style.overflow = 'hidden';

  /*
   * Add a same-page history entry so browser back can close the player.
   * A native WebView or wrapper may override back handling separately.
   */
  if (!ZAMZOK.historyEntryActive) {
    try {
      history.pushState(
        { zamzokReels: true },
        '',
        window.location.href
      );

      ZAMZOK.historyEntryActive = true;
    } catch (_) {
      ZAMZOK.historyEntryActive = false;
    }
  }

  showVideo(targetIndex);
}

function closeReels(options = {}) {
  const { fromPopstate = false } = options;

  if (!ZAMZOK.overlay || !ZAMZOK.overlay.classList.contains('is-open')) {
    return;
  }

  ZAMZOK.overlay.classList.remove('is-open');
  ZAMZOK.overlay.setAttribute('aria-hidden', 'true');

  document.body.classList.remove('zamzok-reels-active');
  document.body.style.overflow = ZAMZOK.previousBodyOverflow || '';

  /*
   * Removing the iframe stops its playback.
   */
  if (ZAMZOK.iframe) {
    ZAMZOK.iframe.src = 'about:blank';
    ZAMZOK.iframe.remove();
    ZAMZOK.iframe = null;
  }

  ZAMZOK.requestId += 1;

  if (ZAMZOK.videoContainer) {
    ZAMZOK.videoContainer.replaceChildren();
    ZAMZOK.videoContainer.appendChild(
      createElement(
        'div',
        'zamzok-reels-loading',
        'اختر فيديو لتشغيله'
      )
    );
  }

  if (document.fullscreenElement) {
    document.exitFullscreen?.().catch?.(() => {});
  }

  if (!fromPopstate && ZAMZOK.historyEntryActive) {
    ZAMZOK.ignoreNextPopstate = true;
    history.back();
  }

  ZAMZOK.historyEntryActive = false;
}

/* =========================================
   SWIPE / KEYBOARD NAVIGATION
========================================= */

function handleSwipe(deltaX, deltaY) {
  const minDistance = 55;

  if (Math.abs(deltaY) < minDistance && Math.abs(deltaX) < minDistance) {
    return;
  }

  if (Math.abs(deltaY) > Math.abs(deltaX)) {
    if (deltaY < 0) {
      showVideo(ZAMZOK.currentIndex + 1);
    } else {
      showVideo(ZAMZOK.currentIndex - 1);
    }

    return;
  }

  if (Math.abs(deltaX) > 90) {
    if (deltaX < 0) {
      showVideo(ZAMZOK.currentIndex + 1);
    } else {
      showVideo(ZAMZOK.currentIndex - 1);
    }
  }
}

function initKeyboardNavigation() {
  document.addEventListener('keydown', (event) => {
    if (
      !ZAMZOK.overlay ||
      !ZAMZOK.overlay.classList.contains('is-open')
    ) {
      return;
    }

    const target = event.target;

    if (
      target instanceof HTMLElement &&
      (
        target.isContentEditable ||
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
      )
    ) {
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      closeReels();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      showVideo(ZAMZOK.currentIndex + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      showVideo(ZAMZOK.currentIndex - 1);
    }
  });
}

/* =========================================
   ANDROID / BROWSER BACK
========================================= */

function initBackNavigation() {
  window.addEventListener('popstate', () => {
    if (ZAMZOK.ignoreNextPopstate) {
      ZAMZOK.ignoreNextPopstate = false;
      return;
    }

    if (
      ZAMZOK.overlay &&
      ZAMZOK.overlay.classList.contains('is-open')
    ) {
      closeReels({ fromPopstate: true });
    }
  });
}

/* =========================================
   FULLSCREEN
========================================= */

async function toggleFullscreen() {
  const overlay = ZAMZOK.overlay;

  if (!overlay) {
    return;
  }

  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      overlay.classList.remove('force-fullscreen');
      return;
    }

    if (overlay.requestFullscreen) {
      await overlay.requestFullscreen();
      return;
    }
  } catch (_) {
    // Use the CSS fallback if fullscreen is unavailable.
  }

  overlay.classList.toggle('force-fullscreen');
}

/* =========================================
   SHARE
========================================= */

async function shareCurrentVideo() {
  const video = ZAMZOK.videos[ZAMZOK.currentIndex];

  if (!video) {
    return;
  }

  const url = getYouTubeUrl(video.id);
  const title = getVideoTitle(video);

  if (navigator.share) {
    try {
      await navigator.share({ title, url });
      return;
    } catch (error) {
      if (error?.name === 'AbortError') {
        return;
      }
    }
  }

  try {
    await navigator.clipboard.writeText(url);
    showTemporaryMessage('تم نسخ رابط الفيديو.');
  } catch (_) {
    window.prompt('انسخ رابط الفيديو:', url);
  }
}

function showTemporaryMessage(message) {
  const toast = createElement('div', 'zamzok-toast', message);

  Object.assign(toast.style, {
    position: 'fixed',
    zIndex: '2147483647',
    left: '50%',
    bottom: '25px',
    transform: 'translateX(-50%)',
    maxWidth: '90%',
    padding: '10px 16px',
    border: '1px solid rgba(244,199,106,.4)',
    borderRadius: '12px',
    background: '#171321',
    color: '#fff',
    fontFamily: 'Cairo, sans-serif',
    fontSize: '13px',
    textAlign: 'center'
  });

  document.body.appendChild(toast);

  window.setTimeout(() => {
    toast.remove();
  }, 2400);
}

/* =========================================
   GRID EVENTS
========================================= */

function initVideoGrid() {
  const grid = $('#videoGrid');

  if (!grid) {
    return;
  }

  grid.addEventListener('click', (event) => {
    const button = event.target.closest('.zamzok-video-button');

    if (!button || !grid.contains(button)) {
      return;
    }

    const index = Number.parseInt(button.dataset.videoIndex, 10);
    const videoId = button.dataset.videoId;

    if (!Number.isInteger(index) || !videoId) {
      return;
    }

    openReels(index);
  });
}

/* =========================================
   LOAD CHANNEL
========================================= */

async function initVideos() {
  const grid = $('#videoGrid');

  if (grid) {
    grid.setAttribute('aria-busy', 'true');
  }

  try {
    const videos = await fetchChannelVideos();

    ZAMZOK.videos = videos;
    renderVideoGrid(videos);
  } catch (error) {
    console.error('[ZAMZOK] Failed to load YouTube videos:', error);

    const message = String(error.message || '');

    if (message.includes('API key')) {
      setGridMessage(
        'أضف مفتاح YouTube Data API v3 في ملف script.js لعرض فيديوهات القناة.',
        true
      );
    } else if (
      message.toLowerCase().includes('quota') ||
      message.toLowerCase().includes('exceeded')
    ) {
      setGridMessage(
        'وصل طلب تحميل الفيديوهات إلى حد استخدام YouTube API. حاول مرة أخرى لاحقًا.',
        true
      );
    } else {
      setGridMessage(
        'تعذر تحميل الفيديوهات حاليًا. راجع مفتاح API واتصال الإنترنت وإعدادات Google Cloud.',
        true
      );
    }
  }
}

/* =========================================
   INITIALIZE
========================================= */

document.addEventListener('DOMContentLoaded', () => {
  initMobileMenu();
  initFooterYear();
  initVideoGrid();
  initKeyboardNavigation();
  initBackNavigation();

  createReelsOverlay();
  initVideos();
});
```
