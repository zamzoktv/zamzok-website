// ==================================================
// ZAMZOK WEBSITE — SCRIPT.JS
// Separate Shorts/Reels and Normal YouTube Videos
// Categories + Playlists + Vertical Swipe Player
// ==================================================

'use strict';

// ==================================================
// 1. CONFIGURATION
// ==================================================

const ZAMZOK_CONFIG = {
  // استبدل القيمة بمفتاح API جديد ومقيّد.
  apiKey: 'AIzaSyDpukCjizMYEkdtvm6h7RqzcUjSKthhaPo',

  channelId: 'UCNuIyleVU-8sXQFDitaKiSg',
  channelUrl: 'https://www.youtube.com/@zamzoktv',
  apiUrl: 'https://www.googleapis.com/youtube/v3',

  // YouTube Shorts قد تصل مدتها إلى 3 دقائق.
  // التصنيف بالمدة تقريبي، لأن المدة وحدها لا تحدد
  // بصورة مؤكدة ما إذا كان الفيديو Short أم فيديو عاديًا.
  maxShortDurationSeconds: 180,

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
// 2. GLOBAL VARIABLES
// ==================================================

let zamzokVideos = [];
let zamzokReels = [];
let zamzokNormalVideos = [];

let zamzokCurrentIndex = 0;
let zamzokCurrentSource = 'all';
let zamzokCurrentReelsCategory = 'all';

let zamzokReelsOverlay = null;
let zamzokLoadingPromise = null;
let zamzokPlaylistLoading = new Map();

let zamzokPreviousScroll = 0;
let zamzokHistoryActive = false;

let zamzokYTPlayer = null;
let zamzokYTApiPromise = null;
let zamzokPlayerRequest = 0;
let zamzokPlayerReady = false;
let zamzokPlayerTapBusy = false;

let zamzokIndicatorTimer = null;

const zamzokPlaylistCache = new Map();

// ==================================================
// 3. GENERAL HELPERS
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
  return ZAMZOK_CONFIG.playlists.find(
    playlist => playlist.type === type
  );
}

function getReelsGrid() {
  return document.getElementById('zamzokReelsGrid');
}

function getNormalGrid() {
  return document.getElementById('videoGrid');
}

function showGridMessage(grid, message) {
  if (!grid) return;

  grid.setAttribute('aria-busy', 'false');
  grid.replaceChildren();

  const paragraph = document.createElement('p');

  paragraph.className = 'zamzok-message';
  paragraph.textContent = message;

  grid.appendChild(paragraph);
}

function showVideoMessage(message) {
  showGridMessage(getNormalGrid(), message);
}

function showReelsMessage(message) {
  showGridMessage(getReelsGrid(), message);
}

function scrollToVideos() {
  document.getElementById('videos')?.scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  });
}

function formatDuration(isoDuration) {
  if (!isoDuration) return 0;

  const match = isoDuration.match(
    /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/
  );

  if (!match) return 0;

  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);

  return hours * 3600 + minutes * 60 + seconds;
}

function getThumbnail(thumbnails, videoId) {
  return (
    thumbnails?.maxres?.url ||
    thumbnails?.standard?.url ||
    thumbnails?.high?.url ||
    thumbnails?.medium?.url ||
    thumbnails?.default?.url ||
    `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`
  );
}

function normalizeVideo(item, source = 'all') {
  const id =
    item?.contentDetails?.videoId ||
    item?.id?.videoId ||
    (typeof item?.id === 'string' ? item.id : '');

  if (!id) return null;

  const playlist = getPlaylistByType(source);

  const thumbnails = item?.snippet?.thumbnails || {};

  const durationISO =
    item?.contentDetails?.duration || '';

  const durationSeconds = formatDuration(durationISO);

  return {
    id,

    title:
      item?.snippet?.title ||
      'فيديو ZAMZOK',

    description:
      item?.snippet?.description || '',

    thumbnail: getThumbnail(thumbnails, id),

    publishedAt:
      item?.contentDetails?.videoPublishedAt ||
      item?.snippet?.publishedAt ||
      '',

    durationISO,
    durationSeconds,

    source,

    playlistName: playlist?.name || '',
    playlistArabicName: playlist?.arabicName || ''
  };
}

function uniqueVideos(videos) {
  const seen = new Set();

  return videos.filter(video => {
    if (!video || !video.id || seen.has(video.id)) {
      return false;
    }

    seen.add(video.id);

    return true;
  });
}

// ==================================================
// 4. MENU AND FOOTER
// ==================================================

function initializeMainMenu() {
  const toggle = document.getElementById('menuToggle');
  const nav = document.getElementById('mainNav');

  if (!toggle || !nav) return;

  // منع تسجيل الأحداث مرتين.
  if (toggle.dataset.zamzokInitialized === 'true') {
    return;
  }

  toggle.dataset.zamzokInitialized = 'true';

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

function initializeYear() {
  const year = document.getElementById('currentYear')
    || document.getElementById('year');

  if (year) {
    year.textContent = new Date().getFullYear();
  }
}

// ==================================================
// 5. YOUTUBE DATA API
// ==================================================

async function youtubeRequest(endpoint, params = {}) {
  const key = ZAMZOK_CONFIG.apiKey.trim();

  if (
    !key ||
    key === 'PUT_YOUR_RESTRICTED_API_KEY_HERE'
  ) {
    throw new Error(
      'أضف مفتاح YouTube API الجديد داخل script.js.'
    );
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
    throw new Error(
      'تعذر قراءة استجابة YouTube API.'
    );
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
// 6. GET VIDEO DURATIONS
// ==================================================

async function enrichVideoDetails(videos) {
  if (!videos.length) return videos;

  const result = [];

  // YouTube videos.list يقبل حتى 50 معرف فيديو في الطلب.
  for (let i = 0; i < videos.length; i += 50) {
    const batch = videos.slice(i, i + 50);

    try {
      const data = await youtubeRequest('videos', {
        part: 'contentDetails,snippet',
        id: batch.map(video => video.id).join(',')
      });

      const detailsById = new Map(
        (data.items || []).map(item => [item.id, item])
      );

      batch.forEach(video => {
        const details = detailsById.get(video.id);

        if (!details) {
          result.push(video);
          return;
        }

        const durationISO =
          details.contentDetails?.duration || '';

        const durationSeconds =
          formatDuration(durationISO);

        result.push({
          ...video,

          durationISO,

          durationSeconds,

          title:
            details.snippet?.title ||
            video.title,

          thumbnail: getThumbnail(
            details.snippet?.thumbnails,
            video.id
          )
        });
      });
    } catch (error) {
      console.warn(
        'تعذر تحميل مدد الفيديوهات؛ سيتم استخدام البيانات المتاحة.',
        error
      );

      result.push(...batch);
    }
  }

  return result;
}

// ==================================================
// 7. FETCH PLAYLIST VIDEOS
// ==================================================

async function fetchPlaylistVideos(playlist) {
  if (!playlist?.id) {
    throw new Error(
      'لم تتم إضافة قائمة تشغيل لهذا القسم حتى الآن.'
    );
  }

  const data = await youtubeRequest(
    'playlistItems',
    {
      part: 'snippet,contentDetails',
      playlistId: playlist.id,
      maxResults: 50
    }
  );

  const videos = uniqueVideos(
    (data.items || [])
      .map(item => normalizeVideo(item, playlist.type))
      .filter(Boolean)
  );

  return enrichVideoDetails(videos);
}

// ==================================================
// 8. FETCH CHANNEL VIDEOS
// ==================================================

async function fetchChannelVideos() {
  const channelData = await youtubeRequest(
    'channels',
    {
      part: 'contentDetails',
      id: ZAMZOK_CONFIG.channelId
    }
  );

  const channel = channelData.items?.[0];

  if (!channel) {
    throw new Error(
      'لم يتم العثور على قناة ZAMZOK.'
    );
  }

  const uploads =
    channel.contentDetails?.relatedPlaylists?.uploads;

  if (!uploads) {
    throw new Error(
      'تعذر العثور على قائمة فيديوهات القناة.'
    );
  }

  const data = await youtubeRequest(
    'playlistItems',
    {
      part: 'snippet,contentDetails',
      playlistId: uploads,
      maxResults: 50
    }
  );

  const videos = uniqueVideos(
    (data.items || [])
      .map(item => normalizeVideo(item, 'all'))
      .filter(Boolean)
  );

  return enrichVideoDetails(videos);
}

// ==================================================
// 9. SPLIT SHORTS AND NORMAL VIDEOS
// ==================================================

function splitChannelVideos(videos) {
  const shorts = [];
  const normal = [];

  videos.forEach(video => {
    // التصنيف حسب المدة تقريبي وليس تأكيدًا من YouTube
    // بأن الفيديو منشور فعلًا بصيغة Shorts.
    if (
      video.durationSeconds > 0 &&
      video.durationSeconds <=
        ZAMZOK_CONFIG.maxShortDurationSeconds
    ) {
      shorts.push(video);
    } else {
      normal.push(video);
    }
  });

  return {
    shorts,
    normal
  };
}

// ==================================================
// 10. NORMAL VIDEO PLAYLIST CONTROLS
// ==================================================

function createPlaylistControls() {
  const grid = getNormalGrid();

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
      .filter(playlist => playlist.id)
      .map(playlist => ({
        type: playlist.type,
        label: `${playlist.emoji} ${playlist.arabicName}`
      }))
  ];

  controls.innerHTML = sources.map(source => `
    <button
      type="button"
      class="zamzok-playlist-btn${source.type === 'all' ? ' is-active' : ''}"
      data-source="${escapeHTML(source.type)}"
      aria-pressed="${source.type === 'all' ? 'true' : 'false'}"
    >${escapeHTML(source.label)}</button>
  `).join('');

  controls.querySelectorAll('[data-source]').forEach(button => {
    button.addEventListener('click', () => {
      setActivePlaylist(button.dataset.source);
    });
  });
}

function updatePlaylistButtons(source) {
  document.querySelectorAll(
    '#zamzokPlaylistControls [data-source]'
  ).forEach(button => {
    const active = button.dataset.source === source;

    button.classList.toggle('is-active', active);

    button.setAttribute(
      'aria-pressed',
      String(active)
    );
  });
}

// ==================================================
// 11. LOAD A PLAYLIST
// ==================================================

async function setActivePlaylist(source) {
  zamzokCurrentSource = source;

  updatePlaylistButtons(source);

  const grid = getNormalGrid();

  if (!grid) return;

  if (source === 'all') {
    zamzokNormalVideos = splitChannelVideos(
      zamzokVideos
    ).normal;

    renderNormalVideos();

    return;
  }

  const playlist = getPlaylistByType(source);

  if (!playlist) {
    showVideoMessage(
      'هذا القسم غير متاح حاليًا.'
    );

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
      if (!zamzokPlaylistLoading.has(playlist.id)) {
        zamzokPlaylistLoading.set(
          playlist.id,
          fetchPlaylistVideos(playlist)
        );
      }

      videos = await zamzokPlaylistLoading.get(
        playlist.id
      );

      zamzokPlaylistCache.set(
        playlist.id,
        videos
      );

      zamzokPlaylistLoading.delete(
        playlist.id
      );
    }

    // عند اختيار قائمة تشغيل، اعرض فيديوهاتها
    // في القسم العادي دون تغيير بيانات الريلز.
    zamzokNormalVideos = videos.slice();

    renderNormalVideos();

  } catch (error) {
    zamzokPlaylistLoading.delete(playlist.id);

    console.error(
      'ZAMZOK playlist error:',
      error
    );

    showVideoMessage(
      `تعذر تحميل القائمة: ${error.message}`
    );
  }
}

// ==================================================
// 12. RENDER NORMAL VIDEOS
// ==================================================

function renderNormalVideos() {
  const grid = getNormalGrid();

  if (!grid) return;

  if (!zamzokNormalVideos.length) {
    showVideoMessage(
      'لا توجد فيديوهات عادية متاحة في هذا القسم حاليًا.'
    );

    return;
  }

  grid.setAttribute('aria-busy', 'false');

  grid.innerHTML = zamzokNormalVideos.map((video, index) => `
    <article class="video-card zamzok-video-card">

      <button
        class="zamzok-video-button"
        type="button"
        data-video-id="${escapeHTML(video.id)}"
        data-video-index="${index}"
        data-video-type="normal"
        aria-label="تشغيل ${escapeHTML(video.title)}"
      >

        <img
          src="${escapeHTML(video.thumbnail)}"
          alt="${escapeHTML(video.title)}"
          loading="lazy"
        >

        <span class="zamzok-video-play">▶</span>

      </button>

      <div class="video-info">
        <h3>${escapeHTML(video.title)}</h3>
      </div>

    </article>
  `).join('');
}

// ==================================================
// 13. REELS CATEGORY CONTROLS
// ==================================================

function initializeReelsCategories() {
  const controls = document.getElementById(
    'zamzokReelsCategories'
  );

  if (!controls) return;

  controls.querySelectorAll(
    '[data-reels-category]'
  ).forEach(button => {
    button.addEventListener('click', () => {
      const category = button.dataset.reelsCategory;

      zamzokCurrentReelsCategory = category;

      controls.querySelectorAll(
        '[data-reels-category]'
      ).forEach(otherButton => {
        const active =
          otherButton.dataset.reelsCategory === category;

        otherButton.classList.toggle(
          'is-active',
          active
        );

        otherButton.setAttribute(
          'aria-pressed',
          String(active)
        );
      });

      renderReels();
    });
  });
}

function getReelsForCategory() {
  if (zamzokCurrentReelsCategory === 'all') {
    return zamzokReels;
  }

  const playlist = getPlaylistByType(
    zamzokCurrentReelsCategory
  );

  if (!playlist) return [];

  // نستخدم بيانات قائمة التشغيل إن كانت قد حُمّلت.
  const playlistVideos = playlist.id
    ? zamzokPlaylistCache.get(playlist.id)
    : null;

  if (playlistVideos) {
    const reelIds = new Set(
      zamzokReels.map(video => video.id)
    );

    return playlistVideos.filter(
      video => reelIds.has(video.id)
    );
  }

  // إذا لم تكن قائمة التشغيل متاحة أو لم تُحمّل،
  // لا نخمن نوع الفيديو من عنوانه.
  return [];
}

// ==================================================
// 14. RENDER REELS
// ==================================================

function renderReels() {
  const grid = getReelsGrid();

  if (!grid) return;

  const videos = getReelsForCategory();

  if (!videos.length) {
    if (zamzokCurrentReelsCategory === 'all') {
      showReelsMessage(
        'لا توجد فيديوهات قصيرة متاحة حاليًا.'
      );
    } else {
      const playlist = getPlaylistByType(
        zamzokCurrentReelsCategory
      );

      showReelsMessage(
        playlist?.id
          ? 'لا توجد فيديوهات قصيرة لهذا التصنيف ضمن الفيديوهات المحمّلة.'
          : 'لم تتم إضافة قائمة تشغيل لهذا التصنيف بعد.'
      );
    }

    return;
  }

  grid.setAttribute('aria-busy', 'false');

  grid.innerHTML = videos.map((video, index) => `
    <article class="video-card zamzok-reel-card">

      <button
        class="zamzok-video-button zamzok-reel-button"
        type="button"
        data-video-id="${escapeHTML(video.id)}"
        data-video-index="${index}"
        data-video-type="reel"
        aria-label="تشغيل ${escapeHTML(video.title)}"
      >

        <img
          src="${escapeHTML(video.thumbnail)}"
          alt="${escapeHTML(video.title)}"
          loading="lazy"
        >

        <span class="zamzok-video-play">▶</span>

        <span class="zamzok-reel-badge">SHORTS</span>

      </button>

      <div class="video-info">
        <h3>${escapeHTML(video.title)}</h3>
      </div>

    </article>
  `).join('');
}

// ==================================================
// 15. LOAD CHANNEL VIDEOS
// ==================================================

async function loadZamzokVideos() {
  if (zamzokLoadingPromise) {
    return zamzokLoadingPromise;
  }

  const reelsGrid = getReelsGrid();
  const normalGrid = getNormalGrid();

  showReelsMessage(
    'جاري تحميل الريلز والشورتس...'
  );

  showVideoMessage(
    'جاري تحميل فيديوهات ZAMZOK...'
  );

  if (reelsGrid) {
    reelsGrid.setAttribute('aria-busy', 'true');
  }

  if (normalGrid) {
    normalGrid.setAttribute('aria-busy', 'true');
  }

  zamzokLoadingPromise = (async () => {
    try {
      const videos = await fetchChannelVideos();

      zamzokVideos = videos;

      const split = splitChannelVideos(videos);

      zamzokReels = split.shorts;
      zamzokNormalVideos = split.normal;

      zamzokPlaylistCache.set('__all__', videos);

      renderReels();
      renderNormalVideos();

    } catch (error) {
      console.error(
        'ZAMZOK channel error:',
        error
      );

      showReelsMessage(
        `تعذر تحميل الريلز: ${error.message}`
      );

      showVideoMessage(
        `تعذر تحميل الفيديوهات: ${error.message}`
      );

    } finally {
      if (reelsGrid) {
        reelsGrid.setAttribute('aria-busy', 'false');
      }

      if (normalGrid) {
        normalGrid.setAttribute('aria-busy', 'false');
      }

      zamzokLoadingPromise = null;
    }
  })();

  return zamzokLoadingPromise;
}

// ==================================================
// 16. CATEGORY CARDS
// ==================================================

function connectWorldCategories() {
  document.querySelectorAll(
    '[data-zamzok-category]'
  ).forEach(card => {
    if (card.dataset.zamzokBound === 'true') {
      return;
    }

    card.dataset.zamzokBound = 'true';

    card.addEventListener('click', event => {
      event.preventDefault();

      const category = card.dataset.zamzokCategory;

      // اختر التصنيف في الريلز أيضًا.
      const reelsButton = document.querySelector(
        `#zamzokReelsCategories [data-reels-category="${category}"]`
      );

      if (reelsButton) {
        reelsButton.click();
      }

      // اختر قائمة التشغيل في قسم الفيديوهات العادية.
      setActivePlaylist(category);

      scrollToVideos();
    });
  });
}

// ==================================================
// 17. YOUTUBE IFRAME API
// ==================================================

function loadZamzokYouTubeAPI() {
  if (window.YT?.Player) {
    return Promise.resolve(window.YT);
  }

  if (zamzokYTApiPromise) {
    return zamzokYTApiPromise;
  }

  zamzokYTApiPromise = new Promise((resolve, reject) => {
    let settled = false;

    const timeout = window.setTimeout(() => {
      if (settled) return;

      settled = true;
      zamzokYTApiPromise = null;

      reject(
        new Error('انتهت مهلة تحميل مشغل YouTube.')
      );
    }, 20000);

    const previousCallback =
      window.onYouTubeIframeAPIReady;

    window.onYouTubeIframeAPIReady = function () {
      if (typeof previousCallback === 'function') {
        try {
          previousCallback();
        } catch (error) {
          console.error(error);
        }
      }

      if (settled) return;

      settled = true;
      clearTimeout(timeout);

      resolve(window.YT);
    };

    let script = document.querySelector(
      'script[src="https://www.youtube.com/iframe_api"]'
    );

    if (!script) {
      script = document.createElement('script');

      script.src =
        'https://www.youtube.com/iframe_api';

      script.async = true;

      script.onerror = () => {
        if (settled) return;

        settled = true;
        clearTimeout(timeout);

        zamzokYTApiPromise = null;

        reject(
          new Error('تعذر تحميل مشغل YouTube.')
        );
      };

      document.head.appendChild(script);
    }
  });

  return zamzokYTApiPromise;
}

// ==================================================
// 18. REELS PLAYER
// ==================================================

function createZamzokReelsPlayer() {
  const existing = document.getElementById(
    'zamzokReelsOverlay'
  );

  if (existing) {
    zamzokReelsOverlay = existing;
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

      <div
        class="zamzok-reels-swipe-layer"
        aria-label="اضغط للتشغيل أو الإيقاف، واسحب للتنقل بين الفيديوهات"
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
          اضغط للتشغيل أو الإيقاف · اسحب لأعلى أو لأسفل للتنقل
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

      <div
        class="zamzok-reels-play-indicator"
        aria-hidden="true"
      >Ⅱ</div>

    </div>

    <div class="zamzok-reels-counter"></div>
  `;

  document.body.appendChild(overlay);

  zamzokReelsOverlay = overlay;

  installReelsStyles();

  getElement(
    '.zamzok-reels-close',
    overlay
  ).addEventListener('click', closeZamzokReels);

  getElement(
    '.zamzok-reels-fullscreen',
    overlay
  ).addEventListener('click', toggleZamzokFullscreen);

  getElement(
    '.zamzok-reels-prev',
    overlay
  ).addEventListener('click', () => {
    showZamzokReel(zamzokCurrentIndex - 1);
  });

  getElement(
    '.zamzok-reels-next',
    overlay
  ).addEventListener('click', () => {
    showZamzokReel(zamzokCurrentIndex + 1);
  });

  getElement(
    '.zamzok-reels-like',
    overlay
  ).addEventListener('click', openZamzokOnYouTube);

  getElement(
    '.zamzok-reels-comments',
    overlay
  ).addEventListener('click', openZamzokOnYouTube);

  getElement(
    '.zamzok-reels-share',
    overlay
  ).addEventListener('click', shareZamzokReel);

  initializeReelsTouch(overlay);

  document.addEventListener(
    'keydown',
    handleZamzokReelsKeyboard
  );
}

// ==================================================
// 19. REELS PLAYER STYLES
// ==================================================

function installReelsStyles() {
  if (document.getElementById('zamzokSwipeStyles')) {
    return;
  }

  const style = document.createElement('style');

  style.id = 'zamzokSwipeStyles';

  style.textContent = `
    #zamzokReelsOverlay .zamzok-reels-stage {
      position: relative;
      overflow: hidden;
      isolation: isolate;
    }

    #zamzokReelsOverlay .zamzok-reels-video {
      position: absolute;
      inset: 0;
      z-index: 1;
      width: 100%;
      height: 100%;
    }

    #zamzokReelsOverlay .zamzok-reels-video iframe {
      display: block;
      width: 100%;
      height: 100%;
      border: 0;
    }

    #zamzokReelsOverlay .zamzok-reels-swipe-layer {
      position: absolute;
      inset: 0;
      z-index: 5;
      background: transparent;
      pointer-events: auto;
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
      -webkit-tap-highlight-color: transparent;
      cursor: grab;
    }

    #zamzokReelsOverlay .zamzok-reels-header {
      z-index: 30;
    }

    #zamzokReelsOverlay .zamzok-reels-actions {
      z-index: 20;
      pointer-events: auto;
      touch-action: manipulation;
    }

    #zamzokReelsOverlay .zamzok-reels-nav {
      z-index: 25;
      pointer-events: auto;
      touch-action: manipulation;
    }

    #zamzokReelsOverlay .zamzok-reels-bottom {
      z-index: 15;
      pointer-events: none;
    }

    #zamzokReelsOverlay .zamzok-reels-counter {
      z-index: 30;
      pointer-events: none;
    }

    #zamzokReelsOverlay .zamzok-reels-play-indicator {
      position: absolute;
      z-index: 18;
      top: 50%;
      left: 50%;
      width: 68px;
      height: 68px;
      display: flex;
      align-items: center;
      justify-content: center;
      transform: translate(-50%, -50%) scale(.8);
      border-radius: 50%;
      background: rgba(0, 0, 0, .68);
      color: white;
      font-size: 30px;
      opacity: 0;
      pointer-events: none;
      transition: opacity .18s, transform .18s;
    }

    #zamzokReelsOverlay .zamzok-reels-play-indicator.is-visible {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
    }

    .zamzok-video-button {
      display: block;
      position: relative;
      width: 100%;
      padding: 0;
      overflow: hidden;
      border: 0;
      background: #100c18;
      cursor: pointer;
      text-align: inherit;
    }

    .zamzok-video-button img {
      display: block;
      width: 100%;
      height: auto;
      object-fit: cover;
    }

    .zamzok-video-play {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      font-size: 32px;
      opacity: 0;
      background: rgba(0, 0, 0, .35);
      transition: opacity .2s;
    }

    .zamzok-video-button:hover .zamzok-video-play,
    .zamzok-video-button:focus-visible .zamzok-video-play {
      opacity: 1;
    }

    .zamzok-reel-badge {
      position: absolute;
      top: 10px;
      right: 10px;
      padding: 5px 8px;
      border-radius: 7px;
      color: #170e00;
      background: #ffcf55;
      font-size: 10px;
      font-weight: 900;
      letter-spacing: .5px;
    }

    .zamzok-reels-categories {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 10px;
      margin: 20px 0;
    }

    .zamzok-category-btn {
      border: 1px solid rgba(255, 207, 85, .25);
      border-radius: 12px;
      padding: 10px 15px;
      background: #171020;
      color: #fff9ed;
      font-weight: 700;
      cursor: pointer;
      transition: background .2s, color .2s;
    }

    .zamzok-category-btn.is-active,
    .zamzok-category-btn:hover {
      color: #160e02;
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
      .zamzok-reels-categories {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .zamzok-category-btn {
        width: 100%;
      }
    }
  `;

  document.head.appendChild(style);
}

// ==================================================
// 20. TAP AND VERTICAL SWIPE
// ==================================================

function initializeReelsTouch(overlay) {
  const layer = getElement(
    '.zamzok-reels-swipe-layer',
    overlay
  );

  if (!layer || layer.dataset.initialized === 'true') {
    return;
  }

  layer.dataset.initialized = 'true';

  let startX = 0;
  let startY = 0;
  let startTime = 0;
  let activePointerId = null;

  const MIN_DISTANCE = 55;
  const MAX_SWIPE_TIME = 1200;
  const DIRECTION_RATIO = 1.15;
  const TAP_DISTANCE = 12;
  const MAX_TAP_TIME = 500;

  function resetSwipe() {
    activePointerId = null;
  }

  layer.addEventListener('pointerdown', event => {
    if (
      event.pointerType === 'mouse' &&
      event.button !== 0
    ) {
      return;
    }

    if (!overlay.classList.contains('is-open')) {
      return;
    }

    activePointerId = event.pointerId;

    startX = event.clientX;
    startY = event.clientY;
    startTime = performance.now();

    try {
      layer.setPointerCapture(event.pointerId);
    } catch (_) {}
  });

  layer.addEventListener('pointerup', event => {
    if (
      activePointerId === null ||
      event.pointerId !== activePointerId
    ) {
      return;
    }

    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;
    const elapsed = performance.now() - startTime;

    resetSwipe();

    if (!overlay.classList.contains('is-open')) {
      return;
    }

    if (
      Math.abs(deltaX) <= TAP_DISTANCE &&
      Math.abs(deltaY) <= TAP_DISTANCE &&
      elapsed <= MAX_TAP_TIME
    ) {
      toggleZamzokVideoPlayback();
      return;
    }

    if (
      elapsed > MAX_SWIPE_TIME ||
      Math.abs(deltaY) < MIN_DISTANCE
    ) {
      return;
    }

    if (
      Math.abs(deltaY) <
      Math.abs(deltaX) * DIRECTION_RATIO
    ) {
      return;
    }

    // السحب لأعلى = التالي
    // السحب لأسفل = السابق
    showZamzokReel(
      zamzokCurrentIndex + (deltaY < 0 ? 1 : -1)
    );
  });

  layer.addEventListener('pointercancel', resetSwipe);
  layer.addEventListener('lostpointercapture', resetSwipe);
}

// ==================================================
// 21. PLAY / PAUSE
// ==================================================

function toggleZamzokVideoPlayback() {
  if (
    !zamzokYTPlayer ||
    !zamzokPlayerReady ||
    zamzokPlayerTapBusy
  ) {
    return;
  }

  zamzokPlayerTapBusy = true;

  try {
    const state = zamzokYTPlayer.getPlayerState();

    if (state === YT.PlayerState.PLAYING) {
      zamzokYTPlayer.pauseVideo();

      showZamzokPlaybackIndicator('Ⅱ');

    } else if (
      state === YT.PlayerState.PAUSED ||
      state === YT.PlayerState.CUED ||
      state === YT.PlayerState.UNSTARTED
    ) {
      zamzokYTPlayer.playVideo();

      showZamzokPlaybackIndicator('▶');

    } else if (state === YT.PlayerState.ENDED) {
      zamzokYTPlayer.seekTo(0, true);
      zamzokYTPlayer.playVideo();

      showZamzokPlaybackIndicator('▶');
    }

  } catch (error) {
    console.error(
      'ZAMZOK playback error:',
      error
    );

  } finally {
    window.setTimeout(() => {
      zamzokPlayerTapBusy = false;
    }, 250);
  }
}

function showZamzokPlaybackIndicator(symbol) {
  if (!zamzokReelsOverlay) return;

  const indicator = getElement(
    '.zamzok-reels-play-indicator',
    zamzokReelsOverlay
  );

  if (!indicator) return;

  indicator.textContent = symbol;

  indicator.classList.add('is-visible');

  clearTimeout(zamzokIndicatorTimer);

  zamzokIndicatorTimer = window.setTimeout(() => {
    indicator.classList.remove('is-visible');
  }, 550);
}

// ==================================================
// 22. OPEN REELS
// ==================================================

function openZamzokReels(index, videoList = null) {
  const videos = videoList || getReelsForCategory();

  if (!videos.length) {
    alert(
      'لا توجد فيديوهات جاهزة للتشغيل حاليًا.'
    );

    return;
  }

  createZamzokReelsPlayer();

  // نستخدم القائمة المعروضة حاليًا حتى يطابق
  // التنقل الفيديوهات الموجودة في التصنيف المختار.
  zamzokActivePlayerVideos = videos;

  zamzokCurrentIndex = Math.max(
    0,
    Math.min(index, videos.length - 1)
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

let zamzokActivePlayerVideos = [];

// ==================================================
// 23. SHOW REEL
// ==================================================

async function showZamzokReel(index) {
  const videos = zamzokActivePlayerVideos.length
    ? zamzokActivePlayerVideos
    : getReelsForCategory();

  if (
    !zamzokReelsOverlay ||
    !videos.length ||
    index < 0 ||
    index >= videos.length
  ) {
    return;
  }

  const requestId = ++zamzokPlayerRequest;

  zamzokCurrentIndex = index;

  const reel = videos[index];

  const container = getElement(
    '.zamzok-reels-video',
    zamzokReelsOverlay
  );

  if (zamzokYTPlayer) {
    try {
      zamzokYTPlayer.destroy();
    } catch (_) {}

    zamzokYTPlayer = null;
  }

  zamzokPlayerReady = false;
  zamzokPlayerTapBusy = false;

  container.replaceChildren();

  const playerElement = document.createElement('div');

  playerElement.id = 'zamzokYouTubePlayer';

  container.appendChild(playerElement);

  getElement(
    '.zamzok-reels-title',
    zamzokReelsOverlay
  ).textContent = reel.title;

  getElement(
    '.zamzok-reels-counter',
    zamzokReelsOverlay
  ).textContent = `${index + 1} / ${videos.length}`;

  getElement(
    '.zamzok-reels-prev',
    zamzokReelsOverlay
  ).disabled = index === 0;

  getElement(
    '.zamzok-reels-next',
    zamzokReelsOverlay
  ).disabled = index === videos.length - 1;

  try {
    await loadZamzokYouTubeAPI();

    if (
      requestId !== zamzokPlayerRequest ||
      !zamzokReelsOverlay.classList.contains('is-open')
    ) {
      return;
    }

    zamzokYTPlayer = new YT.Player(
      playerElement.id,
      {
        width: '100%',
        height: '100%',

        videoId: reel.id,

        playerVars: {
          autoplay: 1,
          playsinline: 1,
          controls: 0,
          rel: 0,
          enablejsapi: 1,
          origin: window.location.origin
        },

        events: {
          onReady: event => {
            if (
              requestId !== zamzokPlayerRequest ||
              !zamzokReelsOverlay?.classList.contains('is-open')
            ) {
              try {
                event.target.destroy();
              } catch (_) {}

              return;
            }

            zamzokPlayerReady = true;

            try {
              event.target.playVideo();
            } catch (error) {
              console.warn(
                'YouTube autoplay may be blocked:',
                error
              );
            }
          },

          onStateChange: event => {
            if (requestId !== zamzokPlayerRequest) {
              return;
            }

            if (
              event.data === YT.PlayerState.PLAYING ||
              event.data === YT.PlayerState.PAUSED ||
              event.data === YT.PlayerState.ENDED
            ) {
              zamzokPlayerTapBusy = false;
            }
          },

          onError: event => {
            console.error(
              'ZAMZOK YouTube player error:',
              event.data
            );
          }
        }
      }
    );

  } catch (error) {
    console.error(
      'Unable to initialize YouTube player:',
      error
    );
  }
}

// ==================================================
// 24. CLOSE REELS
// ==================================================

function closeZamzokReels(fromHistory = false) {
  if (!zamzokReelsOverlay) return;

  zamzokReelsOverlay.classList.remove('is-open');

  zamzokPlayerRequest++;

  if (zamzokYTPlayer) {
    try {
      zamzokYTPlayer.destroy();
    } catch (_) {}

    zamzokYTPlayer = null;
  }

  zamzokPlayerReady = false;
  zamzokPlayerTapBusy = false;
  zamzokActivePlayerVideos = [];

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

  window.scrollTo(0, zamzokPreviousScroll);
}

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
// 25. FULLSCREEN
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

  } catch (error) {
    console.warn(
      'Fullscreen is not available:',
      error
    );
  }
}

// ==================================================
// 26. YOUTUBE ACTION BUTTONS
// ==================================================

function openZamzokOnYouTube() {
  const videos = zamzokActivePlayerVideos.length
    ? zamzokActivePlayerVideos
    : getReelsForCategory();

  const video = videos[zamzokCurrentIndex];

  if (!video) return;

  window.open(
    `https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}`,
    '_blank',
    'noopener,noreferrer'
  );
}

async function shareZamzokReel() {
  const videos = zamzokActivePlayerVideos.length
    ? zamzokActivePlayerVideos
    : getReelsForCategory();

  const video = videos[zamzokCurrentIndex];

  if (!video) return;

  const url =
    `https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}`;

  try {
    if (navigator.share) {
      await navigator.share({
        title: video.title,
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
      window.prompt(
        'رابط الفيديو:',
        url
      );
    }
  }
}

// ==================================================
// 27. KEYBOARD NAVIGATION
// ==================================================

function handleZamzokReelsKeyboard(event) {
  if (
    !zamzokReelsOverlay?.classList.contains('is-open')
  ) {
    return;
  }

  if (event.key === 'Escape') {
    closeZamzokReels();

  } else if (event.key === 'ArrowUp') {
    event.preventDefault();

    showZamzokReel(
      zamzokCurrentIndex + 1
    );

  } else if (event.key === 'ArrowDown') {
    event.preventDefault();

    showZamzokReel(
      zamzokCurrentIndex - 1
    );
  }
}

// ==================================================
// 28. VIDEO CARD CLICK HANDLER
// ==================================================

document.addEventListener('click', event => {
  const button = event.target.closest(
    '.zamzok-video-button'
  );

  if (!button) return;

  event.preventDefault();

  const videoId = button.dataset.videoId;
  const videoType = button.dataset.videoType;

  if (videoType === 'normal') {
    const index = zamzokNormalVideos.findIndex(
      video => video.id === videoId
    );

    const video = zamzokNormalVideos[index];

    if (video) {
      window.open(
        `https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}`,
        '_blank',
        'noopener,noreferrer'
      );
    }

    return;
  }

  const videos = getReelsForCategory();

  const index = videos.findIndex(
    video => video.id === videoId
  );

  if (index >= 0) {
    openZamzokReels(index, videos);
  }
});

// ==================================================
// 29. INITIALIZE WEBSITE
// ==================================================

function initializeZamzok() {
  initializeMainMenu();

  initializeYear();

  createPlaylistControls();

  initializeReelsCategories();

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
