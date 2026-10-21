‏// ==================================================
‏// ZAMZOK WEBSITE — COMPLETE SCRIPT.JS
‏// YouTube Videos + Fullscreen Reels + Swipe Navigation
‏// ==================================================
‏
‏// ------------------------------
‏// 1. القائمة الرئيسية
‏// ------------------------------
‏
‏const toggle = document.getElementById('menuToggle');
‏const nav = document.getElementById('mainNav');
‏
‏if (toggle && nav) {
‏  toggle.addEventListener('click', () => {
‏    const isOpen = nav.classList.toggle('open');
‏
‏    toggle.setAttribute('aria-expanded', String(isOpen));
‏    toggle.textContent = isOpen ? '✕' : '☰';
‏  });
‏
‏  nav.querySelectorAll('a').forEach(link => {
‏    link.addEventListener('click', () => {
‏      nav.classList.remove('open');
‏      toggle.setAttribute('aria-expanded', 'false');
‏      toggle.textContent = '☰';
‏    });
‏  });
‏}
‏
‏// ------------------------------
‏// 2. السنة الحالية
‏// ------------------------------
‏
‏const yearElement = document.getElementById('year');
‏
‏if (yearElement) {
‏  yearElement.textContent = new Date().getFullYear();
‏}
‏
‏// ------------------------------
‏// 3. إعدادات YouTube API
‏// ------------------------------
‏
‏const YOUTUBE_API_KEY = 'AIzaSyDpukCjizMYEkdtvm6h7RqzcUjSKthhaPo';
‏const YOUTUBE_CHANNEL_ID = 'UCNuIyleVU-8sXQFDitaKiSg';
‏const YOUTUBE_API_URL = 'https://www.googleapis.com/youtube/v3';
‏
‏const YOUTUBE_CHANNEL_URL = 'https://www.youtube.com/@zamzoktv';
‏
‏// ------------------------------
‏// 4. متغيرات الريلز
‏// ------------------------------
‏
‏let zamzokReels = [];
‏let zamzokCurrentIndex = 0;
‏let zamzokReelsOverlay = null;
‏let zamzokTouchStartX = 0;
‏let zamzokTouchStartY = 0;
‏let zamzokPlayerReady = false;
‏
‏// ------------------------------
‏// 5. حماية النصوص
‏// ------------------------------
‏
‏function escapeHTML(value) {
‏  return String(value).replace(/[&<>"']/g, character => ({
‏    '&': '&amp;',
‏    '<': '&lt;',
‏    '>': '&gt;',
‏    '"': '&quot;',
‏    "'": '&#39;'
‏  })[character]);
‏}
‏
‏// ------------------------------
‏// 6. رسائل الفيديوهات
‏// ------------------------------
‏
‏function showVideoMessage(message) {
‏  const grid = document.getElementById('videoGrid');
‏
‏  if (!grid) return;
‏
‏  grid.innerHTML = `
‏    <p style="
‏      color:#ffcf55;
‏      text-align:center;
‏      padding:24px;
‏      grid-column:1/-1;
‏      line-height:2;
‏    ">${escapeHTML(message)}</p>
‏  `;
‏}
‏
‏// ------------------------------
‏// 7. الاتصال بواجهة YouTube API
‏// ------------------------------
‏
‏async function youtubeRequest(endpoint, params = {}) {
‏  const url = new URL(`${YOUTUBE_API_URL}/${endpoint}`);
‏
‏  Object.entries({
‏    ...params,
‏    key: YOUTUBE_API_KEY
‏  }).forEach(([key, value]) => {
‏    url.searchParams.set(key, value);
‏  });
‏
‏  const response = await fetch(url.toString());
‏
‏  let data;
‏
‏  try {
‏    data = await response.json();
‏  } catch {
‏    throw new Error('تعذر قراءة استجابة يوتيوب.');
‏  }
‏
‏  if (!response.ok) {
‏    const reason = data?.error?.errors?.[0]?.reason;
‏
‏    if (reason === 'quotaExceeded') {
‏      throw new Error('تم استهلاك حصة YouTube API اليومية.');
‏    }
‏
‏    if (reason === 'keyInvalid') {
‏      throw new Error('مفتاح YouTube API غير صحيح.');
‏    }
‏
‏    if (response.status === 403) {
‏      throw new Error(
‏        'رفض يوتيوب الطلب. راجع إعدادات المفتاح وصلاحيات API.'
‏      );
‏    }
‏
‏    throw new Error(
‏      data?.error?.message ||
‏      `حدث خطأ أثناء الاتصال بيوتيوب (${response.status}).`
‏    );
‏  }
‏
‏  return data;
‏}
‏
‏// ------------------------------
‏// 8. تحميل جميع فيديوهات القناة
‏// ------------------------------
‏
‏async function loadZamzokVideos() {
‏  const grid = document.getElementById('videoGrid');
‏
‏  if (!grid) return;
‏
‏  grid.innerHTML = `
‏    <p style="
‏      color:#ffcf55;
‏      text-align:center;
‏      grid-column:1/-1;
‏    ">جاري تحميل فيديوهات ZAMZOK...</p>
‏  `;
‏
‏  try {
‏    // جلب قائمة الفيديوهات المرفوعة
‏    const channelData = await youtubeRequest('channels', {
‏      part: 'contentDetails',
‏      id: YOUTUBE_CHANNEL_ID
‏    });
‏
‏    if (!channelData.items?.length) {
‏      throw new Error('لم يتم العثور على القناة.');
‏    }
‏
‏    const uploadsPlaylist =
‏      channelData.items[0].contentDetails.relatedPlaylists.uploads;
‏
‏    if (!uploadsPlaylist) {
‏      throw new Error('تعذر العثور على قائمة فيديوهات القناة.');
‏    }
‏
‏    const videos = [];
‏    let pageToken = '';
‏
‏    // تحميل كل الصفحات
‏    do {
‏      const params = {
‏        part: 'snippet,contentDetails',
‏        playlistId: uploadsPlaylist,
‏        maxResults: '50'
‏      };
‏
‏      if (pageToken) {
‏        params.pageToken = pageToken;
‏      }
‏
‏      const playlistData = await youtubeRequest(
‏        'playlistItems',
‏        params
‏      );
‏
‏      videos.push(...(playlistData.items || []));
‏      pageToken = playlistData.nextPageToken || '';
‏
‏    } while (pageToken);
‏
‏    if (!videos.length) {
‏      showVideoMessage('لا توجد فيديوهات متاحة حاليًا.');
‏      return;
‏    }
‏
‏    // تجهيز بيانات الفيديوهات
‏    zamzokReels = videos
‏      .map(video => {
‏        const id = video.contentDetails?.videoId;
‏
‏        if (!id) return null;
‏
‏        const thumbnails = video.snippet?.thumbnails || {};
‏
‏        return {
‏          id,
‏          title: video.snippet?.title || 'فيديو ZAMZOK',
‏          thumbnail:
‏            thumbnails.maxres?.url ||
‏            thumbnails.high?.url ||
‏            thumbnails.medium?.url ||
‏            thumbnails.default?.url ||
‏            `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
‏          publishedAt: video.snippet?.publishedAt || ''
‏        };
‏      })
‏      .filter(Boolean);
‏
‏    // عرض البطاقات
‏    grid.innerHTML = zamzokReels.map((video, index) => `
‏      <article class="video-card zamzok-video-card">
‏        <button
‏          class="zamzok-video-button"
‏          type="button"
‏          data-video-id="${escapeHTML(video.id)}"
‏          data-video-index="${index}"
‏          aria-label="تشغيل ${escapeHTML(video.title)}"
‏          style="
‏            display:block;
‏            width:100%;
‏            padding:0;
‏            border:0;
‏            background:#090711;
‏            color:white;
‏            cursor:pointer;
‏            overflow:hidden;
‏            text-align:right;
‏          "
‏        >
‏          <img
‏            src="${escapeHTML(video.thumbnail)}"
‏            alt="${escapeHTML(video.title)}"
‏            loading="lazy"
‏            style="
‏              display:block;
‏              width:100%;
‏              aspect-ratio:9/16;
‏              object-fit:cover;
‏            "
‏          >
‏
‏          <span style="
‏            display:block;
‏            padding:12px;
‏            text-align:center;
‏            color:#ffcf55;
‏            font-weight:bold;
‏          ">▶ تشغيل الفيديو</span>
‏        </button>
‏
‏        <div class="video-info">
‏          <h3>${escapeHTML(video.title)}</h3>
‏        </div>
‏      </article>
‏    `).join('');
‏
‏    zamzokPlayerReady = true;
‏
‏  } catch (error) {
‏    console.error('ZAMZOK YouTube API error:', error);
‏    showVideoMessage(`تعذر تحميل الفيديوهات: ${error.message}`);
‏  }
‏}
‏
‏// ------------------------------
‏// 9. إنشاء واجهة الريلز
‏// ------------------------------
‏
‏function createZamzokReelsPlayer() {
‏  if (document.getElementById('zamzokReelsOverlay')) {
‏    zamzokReelsOverlay =
‏      document.getElementById('zamzokReelsOverlay');
‏
‏    return;
‏  }
‏
‏  const overlay = document.createElement('div');
‏
‏  overlay.id = 'zamzokReelsOverlay';
‏  overlay.className = 'zamzok-reels-overlay';
‏
‏  overlay.innerHTML = `
‏    <header class="zamzok-reels-header">
‏      <button
‏        type="button"
‏        class="zamzok-reels-close"
‏        aria-label="إغلاق الريلز"
‏      >✕</button>
‏
‏      <div class="zamzok-reels-brand">
‏        <span class="zamzok-reels-brand-icon">Z</span>
‏        <span>ZAMZOK <small>REELS</small></span>
‏      </div>
‏
‏      <button
‏        type="button"
‏        class="zamzok-reels-fullscreen"
‏        aria-label="ملء الشاشة"
‏        title="ملء الشاشة"
‏      >⛶</button>
‏    </header>
‏
‏    <div class="zamzok-reels-stage">
‏      <div class="zamzok-reels-video"></div>
‏
‏      <div class="zamzok-reels-actions">
‏        <a
‏          class="zamzok-reels-action zamzok-reels-channel"
‏          href="${YOUTUBE_CHANNEL_URL}"
‏          target="_blank"
‏          rel="noopener noreferrer"
‏          aria-label="قناة ZAMZOK"
‏        >
‏          <span class="zamzok-reels-avatar">Z</span>
‏          <span class="zamzok-reels-plus">+</span>
‏        </a>
‏
‏        <button
‏          type="button"
‏          class="zamzok-reels-action zamzok-reels-like"
‏          aria-label="الإعجاب بالفيديو"
‏        >
‏          <span class="zamzok-reels-action-icon">♡</span>
‏          <span>إعجاب</span>
‏        </button>
‏
‏        <button
‏          type="button"
‏          class="zamzok-reels-action zamzok-reels-comments"
‏          aria-label="التعليقات"
‏        >
‏          <span class="zamzok-reels-action-icon">▤</span>
‏          <span>تعليقات</span>
‏        </button>
‏
‏        <button
‏          type="button"
‏          class="zamzok-reels-action zamzok-reels-share"
‏          aria-label="مشاركة الفيديو"
‏        >
‏          <span class="zamzok-reels-action-icon">↗</span>
‏          <span>مشاركة</span>
‏        </button>
‏      </div>
‏
‏      <div class="zamzok-reels-bottom">
‏        <div class="zamzok-reels-account">
‏          <span class="zamzok-reels-name">@zamzoktv</span>
‏          <span class="zamzok-reels-live-dot"></span>
‏        </div>
‏
‏        <h2 class="zamzok-reels-title"></h2>
‏
‏        <p class="zamzok-reels-hint">
‏          اسحب لأعلى للفيديو التالي
‏        </p>
‏      </div>
‏
‏      <button
‏        type="button"
‏        class="zamzok-reels-nav zamzok-reels-prev"
‏        aria-label="الفيديو السابق"
‏      >⌃</button>
‏
‏      <button
‏        type="button"
‏        class="zamzok-reels-nav zamzok-reels-next"
‏        aria-label="الفيديو التالي"
‏      >⌄</button>
‏    </div>
‏
‏    <div class="zamzok-reels-counter"></div>
‏  `;
‏
‏  document.body.appendChild(overlay);
‏  zamzokReelsOverlay = overlay;
‏
‏  overlay.querySelector('.zamzok-reels-close')
‏    .addEventListener('click', closeZamzokReels);
‏
‏  overlay.querySelector('.zamzok-reels-fullscreen')
‏    .addEventListener('click', toggleZamzokFullscreen);
‏
‏  overlay.querySelector('.zamzok-reels-prev')
‏    .addEventListener('click', () => {
‏      showZamzokReel(zamzokCurrentIndex - 1);
‏    });
‏
‏  overlay.querySelector('.zamzok-reels-next')
‏    .addEventListener('click', () => {
‏      showZamzokReel(zamzokCurrentIndex + 1);
‏    });
‏
‏  overlay.querySelector('.zamzok-reels-like')
‏    .addEventListener('click', () => {
‏      openZamzokOnYouTube();
‏    });
‏
‏  overlay.querySelector('.zamzok-reels-comments')
‏    .addEventListener('click', () => {
‏      openZamzokOnYouTube();
‏    });
‏
‏  overlay.querySelector('.zamzok-reels-share')
‏    .addEventListener('click', shareZamzokReel);
‏
‏  // السحب بين الفيديوهات
‏  const stage = overlay.querySelector('.zamzok-reels-stage');
‏
‏  stage.addEventListener('touchstart', event => {
‏    if (event.touches.length !== 1) return;
‏
‏    zamzokTouchStartX = event.touches[0].clientX;
‏    zamzokTouchStartY = event.touches[0].clientY;
‏  }, { passive: true });
‏
‏  stage.addEventListener('touchend', event => {
‏    if (event.changedTouches.length !== 1) return;
‏
‏    const deltaX =
‏      event.changedTouches[0].clientX - zamzokTouchStartX;
‏
‏    const deltaY =
‏      event.changedTouches[0].clientY - zamzokTouchStartY;
‏
‏    if (
‏      Math.abs(deltaY) < 60 ||
‏      Math.abs(deltaY) < Math.abs(deltaX)
‏    ) {
‏      return;
‏    }
‏
‏    if (deltaY < 0) {
‏      showZamzokReel(zamzokCurrentIndex + 1);
‏    } else {
‏      showZamzokReel(zamzokCurrentIndex - 1);
‏    }
‏  }, { passive: true });
‏
‏  // دعم لوحة المفاتيح
‏  document.addEventListener('keydown', handleZamzokReelsKeyboard);
‏}
‏
‏// ------------------------------
‏// 10. فتح واجهة الريلز
‏// ------------------------------
‏
‏function openZamzokReels(index) {
‏  if (!zamzokReels.length) {
‏    zamzokReels = collectZamzokReels();
‏  }
‏
‏  if (!zamzokReels.length) {
‏    alert('الفيديوهات لم تُحمّل بعد. حاول مرة أخرى.');
‏    return;
‏  }
‏
‏  createZamzokReelsPlayer();
‏
‏  zamzokCurrentIndex = Math.max(
‏    0,
‏    Math.min(index, zamzokReels.length - 1)
‏  );
‏
‏  zamzokReelsOverlay.classList.add('is-open');
‏  document.body.classList.add('zamzok-reels-active');
‏
‏  showZamzokReel(zamzokCurrentIndex);
‏}
‏
‏// ------------------------------
‏// 11. جمع الفيديوهات من الصفحة
‏// ------------------------------
‏
‏function collectZamzokReels() {
‏  if (zamzokReels.length) return zamzokReels;
‏
‏  const grid = document.getElementById('videoGrid');
‏
‏  if (!grid) return [];
‏
‏  return Array.from(
‏    grid.querySelectorAll('.zamzok-video-card')
‏  ).map(card => {
‏    const button = card.querySelector('.zamzok-video-button');
‏
‏    if (!button) return null;
‏
‏    const id = button.dataset.videoId;
‏
‏    return id ? {
‏      id,
‏      title:
‏        card.querySelector('h3')?.textContent?.trim() ||
‏        'فيديو ZAMZOK'
‏    } : null;
‏  }).filter(Boolean);
‏}
‏
‏// ------------------------------
‏// 12. عرض فيديو داخل واجهة الريلز
‏// ------------------------------
‏
‏function showZamzokReel(index) {
‏  if (!zamzokReelsOverlay || !zamzokReels.length) return;
‏
‏  if (index < 0 || index >= zamzokReels.length) return;
‏
‏  zamzokCurrentIndex = index;
‏
‏  const reel = zamzokReels[index];
‏
‏  const videoContainer =
‏    zamzokReelsOverlay.querySelector('.zamzok-reels-video');
‏
‏  videoContainer.innerHTML = '';
‏
‏  const iframe = document.createElement('iframe');
‏
‏  iframe.src =
‏    `https://www.youtube-nocookie.com/embed/${encodeURIComponent(reel.id)}?autoplay=1&playsinline=1&rel=0`;
‏
‏  iframe.title = reel.title;
‏
‏  iframe.allow =
‏    'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen';
‏
‏  iframe.setAttribute('allowfullscreen', '');
‏  iframe.setAttribute('playsinline', '');
‏
‏  iframe.style.cssText = `
‏    display:block;
‏    width:100%;
‏    height:100%;
‏    border:0;
‏    background:#000;
‏  `;
‏
‏  videoContainer.appendChild(iframe);
‏
‏  zamzokReelsOverlay.querySelector('.zamzok-reels-title')
‏    .textContent = reel.title;
‏
‏  zamzokReelsOverlay.querySelector('.zamzok-reels-counter')
‏    .textContent = `${index + 1} / ${zamzokReels.length}`;
‏
‏  zamzokReelsOverlay.querySelector('.zamzok-reels-prev')
‏    .disabled = index === 0;
‏
‏  zamzokReelsOverlay.querySelector('.zamzok-reels-next')
‏    .disabled = index === zamzokReels.length - 1;
‏}
‏
‏// ------------------------------
‏// 13. إغلاق واجهة الريلز
‏// ------------------------------
‏
‏function closeZamzokReels() {
‏  if (!zamzokReelsOverlay) return;
‏
‏  zamzokReelsOverlay.classList.remove('is-open');
‏
‏  zamzokReelsOverlay.querySelector('.zamzok-reels-video')
‏    .innerHTML = '';
‏
‏  document.body.classList.remove('zamzok-reels-active');
‏
‏  if (document.fullscreenElement) {
‏    document.exitFullscreen().catch(() => {});
‏  }
‏}
‏
‏// ------------------------------
‏// 14. ملء الشاشة
‏// ------------------------------
‏
‏async function toggleZamzokFullscreen() {
‏  if (!zamzokReelsOverlay) return;
‏
‏  try {
‏    if (!document.fullscreenElement) {
‏      await zamzokReelsOverlay.requestFullscreen();
‏    } else {
‏      await document.exitFullscreen();
‏    }
‏  } catch (error) {
‏    zamzokReelsOverlay.classList.toggle('force-fullscreen');
‏  }
‏}
‏
‏// ------------------------------
‏// 15. فتح الفيديو على YouTube
‏// ------------------------------
‏
‏function openZamzokOnYouTube() {
‏  const reel = zamzokReels[zamzokCurrentIndex];
‏
‏  if (!reel) return;
‏
‏  const url =
‏    `https://www.youtube.com/watch?v=${encodeURIComponent(reel.id)}`;
‏
‏  window.open(url, '_blank', 'noopener,noreferrer');
‏}
‏
‏// ------------------------------
‏// 16. مشاركة الفيديو
‏// ------------------------------
‏
‏async function shareZamzokReel() {
‏  const reel = zamzokReels[zamzokCurrentIndex];
‏
‏  if (!reel) return;
‏
‏  const url =
‏    `https://www.youtube.com/watch?v=${encodeURIComponent(reel.id)}`;
‏
‏  try {
‏    if (navigator.share) {
‏      await navigator.share({
‏        title: reel.title,
‏        text: 'شاهد الفيديو على ZAMZOK',
‏        url
‏      });
‏    } else if (navigator.clipboard?.writeText) {
‏      await navigator.clipboard.writeText(url);
‏      alert('تم نسخ رابط الفيديو!');
‏    } else {
‏      window.prompt('انسخ رابط الفيديو:', url);
‏    }
‏  } catch (error) {
‏    if (error.name !== 'AbortError') {
‏      window.prompt('رابط الفيديو:', url);
‏    }
‏  }
‏}
‏
‏// ------------------------------
‏// 17. أزرار لوحة المفاتيح
‏// ------------------------------
‏
‏function handleZamzokReelsKeyboard(event) {
‏  if (!zamzokReelsOverlay?.classList.contains('is-open')) return;
‏
‏  if (event.key === 'Escape') {
‏    closeZamzokReels();
‏  }
‏
‏  if (event.key === 'ArrowUp') {
‏    showZamzokReel(zamzokCurrentIndex + 1);
‏  }
‏
‏  if (event.key === 'ArrowDown') {
‏    showZamzokReel(zamzokCurrentIndex - 1);
‏  }
‏}
‏
‏// ------------------------------
‏// 18. تشغيل الريلز عند الضغط على بطاقة
‏// ------------------------------
‏
‏document.addEventListener('click', event => {
‏  const button = event.target.closest('.zamzok-video-button');
‏
‏  if (!button) return;
‏
‏  event.preventDefault();
‏
‏  const index = Number(button.dataset.videoIndex);
‏
‏  openZamzokReels(Number.isInteger(index) ? index : 0);
‏});
‏
‏// ------------------------------
‏// 19. بدء تحميل الفيديوهات
‏// ------------------------------
‏
‏if (document.readyState === 'loading') {
‏  document.addEventListener('DOMContentLoaded', loadZamzokVideos);
‏} else {
‏  loadZamzokVideos();
‏}
‏
