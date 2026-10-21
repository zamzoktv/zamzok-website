// ==========================================
// ZAMZOK WEBSITE - SCRIPT.JS
// ==========================================

// إعدادات القائمة
const toggle = document.getElementById('menuToggle');
const nav = document.getElementById('mainNav');

if (toggle && nav) {
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

// السنة الحالية
const year = document.getElementById('year');
if (year) year.textContent = new Date().getFullYear();

// ==========================================
// إعدادات قناة ZAMZOK
// ==========================================

const YOUTUBE_API_KEY = 'AIzaSyDpukCjizMYEkdtvm6h7RqzcUjSKthhaPo';
const YOUTUBE_CHANNEL_ID = 'UCNuIyleVU-8sXQFDitaKiSg';
const YOUTUBE_API_URL = 'https://www.googleapis.com/youtube/v3';

// ==========================================
// أدوات مساعدة
// ==========================================

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}

function showVideoMessage(message) {
  const grid = document.getElementById('videoGrid');
  if (!grid) return;

  grid.innerHTML = `
    <p style="
      color:#ffcf55;
      text-align:center;
      padding:20px;
      grid-column:1/-1;
      line-height:2;
    ">${escapeHTML(message)}</p>
  `;
}

// ==========================================
// الاتصال بواجهة YouTube API
// ==========================================

async function youtubeRequest(endpoint, params = {}) {
  const url = new URL(`${YOUTUBE_API_URL}/${endpoint}`);

  Object.entries({
    ...params,
    key: YOUTUBE_API_KEY
  }).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  const response = await fetch(url.toString());
  const data = await response.json();

  if (!response.ok) {
    const reason = data?.error?.errors?.[0]?.reason;

    if (reason === 'quotaExceeded') {
      throw new Error('انتهت الحصة اليومية المسموحة لواجهة YouTube API.');
    }

    if (reason === 'keyInvalid') {
      throw new Error('مفتاح YouTube API غير صحيح.');
    }

    if (response.status === 403) {
      throw new Error(
        'رفض يوتيوب الطلب. تأكد من تفعيل YouTube Data API v3 وإعدادات المفتاح.'
      );
    }

    throw new Error(
      data?.error?.message || `حدث خطأ أثناء الاتصال بيوتيوب (${response.status}).`
    );
  }

  return data;
}

// ==========================================
// تحميل جميع فيديوهات القناة
// ==========================================

async function loadZamzokVideos() {
  const grid = document.getElementById('videoGrid');
  if (!grid) return;

  grid.innerHTML = `
    <p style="color:#ffcf55;text-align:center;grid-column:1/-1;">
      جاري تحميل فيديوهات ZAMZOK...
    </p>
  `;

  try {
    // جلب قائمة الفيديوهات المرفوعة للقناة
    const channelData = await youtubeRequest('channels', {
      part: 'contentDetails',
      id: YOUTUBE_CHANNEL_ID
    });

    if (!channelData.items?.length) {
      throw new Error('لم يتم العثور على القناة. تحقق من معرّف القناة.');
    }

    const uploadsPlaylist =
      channelData.items[0].contentDetails.relatedPlaylists.uploads;

    const videos = [];
    let pageToken = '';

    // تحميل صفحات قائمة الفيديوهات
    do {
      const params = {
        part: 'snippet,contentDetails',
        playlistId: uploadsPlaylist,
        maxResults: '50'
      };

      if (pageToken) params.pageToken = pageToken;

      const playlistData = await youtubeRequest('playlistItems', params);

      videos.push(...(playlistData.items || []));
      pageToken = playlistData.nextPageToken || '';
    } while (pageToken);

    if (!videos.length) {
      showVideoMessage('لا توجد فيديوهات متاحة حاليًا.');
      return;
    }

    // إنشاء بطاقات الفيديوهات
    grid.innerHTML = videos.map(video => {
      const id = video.contentDetails?.videoId;
      if (!id) return '';

      const title = video.snippet?.title || 'فيديو ZAMZOK';
      const thumbnails = video.snippet?.thumbnails || {};

      const thumbnail =
        thumbnails.maxres?.url ||
        thumbnails.high?.url ||
        thumbnails.medium?.url ||
        thumbnails.default?.url ||
        `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

      return `
        <article class="video-card zamzok-video-card">
          <button
            class="zamzok-video-button"
            type="button"
            data-video-id="${escapeHTML(id)}"
            aria-label="تشغيل ${escapeHTML(title)}"
            style="
              display:block;
              width:100%;
              padding:0;
              border:0;
              background:#090711;
              color:white;
              cursor:pointer;
              overflow:hidden;
              text-align:right;
            "
          >
            <img
              src="${escapeHTML(thumbnail)}"
              alt="${escapeHTML(title)}"
              loading="lazy"
              style="
                display:block;
                width:100%;
                aspect-ratio:9/16;
                object-fit:cover;
              "
            >

            <span style="
              display:block;
              padding:12px;
              text-align:center;
              color:#ffcf55;
              font-weight:bold;
            ">▶ تشغيل الفيديو</span>
          </button>

          <div class="video-info">
            <h3>${escapeHTML(title)}</h3>
          </div>
        </article>
      `;
    }).join('');

    if (!grid.querySelector('.zamzok-video-card')) {
      showVideoMessage('لم يتم العثور على فيديوهات قابلة للعرض.');
    }

  } catch (error) {
    console.error('ZAMZOK YouTube API error:', error);
    showVideoMessage(`تعذر تحميل الفيديوهات: ${error.message}`);
  }
}

// ==========================================
// تشغيل الفيديو داخل الموقع
// ==========================================

document.addEventListener('click', event => {
  const button = event.target.closest('.zamzok-video-button');
  if (!button) return;

  const videoId = button.dataset.videoId;
  const card = button.closest('.zamzok-video-card');

  if (!videoId || !card) return;

  const iframe = document.createElement('iframe');

  iframe.src =
    `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=1`;

  iframe.title = 'ZAMZOK Video Player';
  iframe.allow =
    'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
  iframe.allowFullscreen = true;
  iframe.loading = 'lazy';

  iframe.style.cssText = `
    display:block;
    width:100%;
    aspect-ratio:9/16;
    border:0;
    border-radius:15px;
    background:#090711;
  `;

  button.replaceWith(iframe);
});

// ==========================================
// بدء التشغيل
// ==========================================

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadZamzokVideos);
} else {
  loadZamzokVideos();
}
