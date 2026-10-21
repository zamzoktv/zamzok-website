const toggle = document.getElementById('menuToggle');
const nav = document.getElementById('mainNav');
toggle.addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  toggle.setAttribute('aria-expanded', String(open));
  toggle.textContent = open ? '✕' : '☰';
});
nav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
  nav.classList.remove('open');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.textContent = '☰';
}));
document.getElementById('year').textContent = new Date().getFullYear();
nav.classList.remove('open');
toggle.setAttribute('aria-expanded', 'false');
const YOUTUBE_API_KEY = 'AIzaSyDpukCjizMYEkdtvm6h7RqzcUjSKthhaPo';
const YOUTUBE_CHANNEL_ID = 'UCNulyIeVU-8sXQFDitaKiSg';
const YOUTUBE_API_URL = 'https://www.googleapis.com/youtube/v3';
async function loadZamzokVideos() {
  const section = document.getElementById('videoGrid');
  if (!section) return;

  section.innerHTML = '<p>جاري تحميل فيديوهات ZAMZOK...</p>';

  try {
    let videos = [];
    let pageToken = '';

    do {
      const url = new URL(`${YOUTUBE_API_URL}/search`);
      url.searchParams.set('part', 'snippet');
      url.searchParams.set('channelId', YOUTUBE_CHANNEL_ID);
      url.searchParams.set('maxResults', '50');
      url.searchParams.set('order', 'date');
      url.searchParams.set('type', 'video');
      url.searchParams.set('key', YOUTUBE_API_KEY);

      if (pageToken) url.searchParams.set('pageToken', pageToken);

      const response = await fetch(url);
      if (!response.ok) throw new Error('تعذر تحميل الفيديوهات');

      const data = await response.json();
      videos.push(...data.items);
      pageToken = data.nextPageToken || '';
    } while (pageToken);

    section.innerHTML = videos.map(video => {
      const id = video.id.videoId;
      const title = video.snippet.title.replace(/</g, '&lt;').replace(/>/g, '&gt;');

      return `
        <div class="zamzok-video-card">
          <iframe
            src="https://www.youtube-nocookie.com/embed/${id}"
            title="${title}"
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowfullscreen
            style="width:100%; aspect-ratio:9/16; border:0; border-radius:15px;">
          </iframe>
          <h3>${title}</h3>
        </div>
      `;
    }).join('');

    if (!videos.length) {
      section.innerHTML = '<p>مفيش فيديوهات متاحة حاليًا.</p>';
    }
  } catch (error) {
    section.innerHTML = '<p>تعذر تحميل الفيديوهات. راجع إعدادات YouTube API.</p>';
    console.error(error);
  }
}

document.addEventListener('DOMContentLoaded', loadZamzokVideos);
