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

const year = document.getElementById('year');
if (year) {
  year.textContent = new Date().getFullYear();
}

// إعدادات قناة ZAMZOK
const YOUTUBE_API_KEY = 'YOUR_API_KEY';
const YOUTUBE_CHANNEL_ID = 'UCNuIyleVU-8sXQFDitaKiSg';
const YOUTUBE_API_URL = 'https://www.googleapis.com/youtube/v3';

// قائمة فيديوهات القناة
async function loadZamzokVideos() {
  const grid = document.getElementById('videoGrid');

  if (!grid) return;

  grid.innerHTML = '<p>جاري تحميل فيديوهات ZAMZOK...</p>';

  try {
    // الحصول على قائمة الفيديوهات المرفوعة للقناة
    const channelResponse = await fetch(
      `${YOUTUBE_API_URL}/channels?part=contentDetails&id=${YOUTUBE_CHANNEL_ID}&key=${YOUTUBE_API_KEY}`
    );

    if (!channelResponse.ok) {
      throw new Error('تعذر الوصول إلى بيانات القناة');
    }

    const channelData = await channelResponse.json();

    if (!channelData.items || !channelData.items.length) {
      throw new Error('لم يتم العثور على القناة. راجع معرّف القناة.');
    }

    const uploadsPlaylist =
      channelData.items[0].contentDetails.relatedPlaylists.uploads;

    let videos = [];
    let pageToken = '';

    // تحميل جميع صفحات الفيديوهات
    do {
      const params = new URLSearchParams({
        part: 'snippet,contentDetails',
        playlistId: uploadsPlaylist,
        maxResults: '50',
        key: YOUTUBE_API_KEY
      });

      if (pageToken) {
        params.set('pageToken', pageToken);
      }

      const response = await fetch(
        `${YOUTUBE_API_URL}/playlistItems?${params.toString()}`
      );

      if (!response.ok) {
        throw new Error('فشل تحميل قائمة الفيديوهات');
      }

      const data = await response.json();

      videos.push(...(data.items || []));
      pageToken = data.nextPageToken || '';

    } while (pageToken);

    if (!videos.length) {
      grid.innerHTML = '<p>لا توجد فيديوهات متاحة حاليًا.</p>';
      return;
    }

    // عرض الفيديوهات كبطاقات قابلة للتشغيل
    grid.innerHTML = videos.map(video => {
      const id = video.contentDetails.videoId;
      const title = video.snippet.title;
      const safeTitle = escapeHTML(title);
      const thumbnail =
        video.snippet.thumbnails.high?.url ||
        video.snippet.thumbnails.medium?.url ||
        `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

      return `
        <article class="zamzok-video-card">
          <button
            class="zamzok-video-button"
            type="button"
            data-video-id="${id}"
            aria-label="تشغيل ${safeTitle}"
            style="display:block;width:100%;padding:0;border:0;background:#090711;color:white;cursor:pointer;border-radius:15px;overflow:hidden;"
          >
            <img
              src="${thumbnail}"
              alt="${safeTitle}"
              loading="lazy"
              style="display:block;width:100%;aspect-ratio:9/16;object-fit:cover;"
            >
            <span style="display:block;padding:12px;text-align:center;">
              ▶ شاهد الفيديو
            </span>
          </button>
          <h3>${safeTitle}</h3>
        </article>
      `;
    }).join('');

  } catch (error) {
    console.error('ZAMZOK videos error:', error);

    grid.innerHTML = `
      <p style="color:#ffd700;text-align:center;">
        تعذر تحميل الفيديوهات: ${escapeHTML(error.message)}
      </p>
    `;
  }
}

// حماية النصوص المعروضة داخل HTML
function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

// تشغيل الفيديو داخل البطاقة نفسها
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
  iframe.style.cssText =
    'display:block;width:100%;aspect-ratio:9/16;border:0;border-radius:15px;';

  card.querySelector('.zamzok-video-button').replaceWith(iframe);
});

document.addEventListener('DOMContentLoaded', loadZamzokVideos);
