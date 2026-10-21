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

  try {
    const response = await fetch(
      `${YOUTUBE_API_URL}/search?part=snippet&channelId=${YOUTUBE_CHANNEL_ID}&maxResults=50&order=date&type=video&key=${YOUTUBE_API_KEY}`
    );

    if (!response.ok) throw new Error('تعذر تحميل الفيديوهات');

    const data = await response.json();

    section.innerHTML = data.items.map(video => `
      <a class="zamzok-video-card"
         href="https://www.youtube.com/watch?v=${video.id.videoId}"
         target="_blank" rel="noopener">
        <img src="${video.snippet.thumbnails.high.url}"
             alt="${video.snippet.title}">
        <h3>${video.snippet.title}</h3>
      </a>
    `).join('');
  } catch (error) {
    section.textContent = 'تعذر تحميل الفيديوهات حاليًا.';
    console.error(error);
  }
}

document.addEventListener('DOMContentLoaded', loadZamzokVideos);
