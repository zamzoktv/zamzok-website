"use strict";

/* ==========================================
ZAMZOK WEBSITE
YouTube API + Video Player + Reels
========================================== */

const ZAMZOK_CONFIG = {
channelId: "UCNuIyleVU-8sXQFDitaKiSg",
apiKey: "AIzaSyDpukCjizMYEkdtvm6h7RqzcUjSKthhaPo",
maxVideos: 50
};

const videoGrid = document.getElementById("videoGrid");
const menuToggle = document.getElementById("menuToggle");
const mainNav = document.getElementById("mainNav");

let videos = [];
let currentIndex = 0;
let reelsOpen = false;
let reelsHistoryPushed = false;
let previousBodyOverflow = "";
let touchStartX = 0;
let touchStartY = 0;
let isLoadingVideos = false;

/* ==========================================
HELPERS
========================================== */

function escapeHTML(value) {
return String(value ?? "").replace(/[&<>"']/g, char => ({
"&": "&",
"<": "<",
">": ">",
'"': """,
"'": "'"
})[char]);
}

function youtubeVideoURL(id) {
return "https://www.youtube.com/watch?v=${encodeURIComponent(id)}";
}

function setLoadingMessage(message) {
if (!videoGrid) return;

videoGrid.setAttribute("aria-busy", "true");
videoGrid.innerHTML =
"<p class="zamzok-status">${escapeHTML(message)}</p>";
}

function setErrorMessage(message) {
if (!videoGrid) return;

videoGrid.setAttribute("aria-busy", "false");

videoGrid.innerHTML = "<div class="zamzok-error"> <p>${escapeHTML(message)}</p> <button type="button" id="zamzokRetryButton"> إعادة المحاولة </button> </div>";

document
.getElementById("zamzokRetryButton")
?.addEventListener("click", loadVideos);
}

/* ==========================================
MOBILE MENU
========================================== */

function initMobileMenu() {
if (!menuToggle || !mainNav) return;

function closeMenu() {
menuToggle.setAttribute("aria-expanded", "false");
menuToggle.setAttribute("aria-label", "فتح القائمة");
mainNav.classList.remove("active");
document.body.classList.remove("menu-open");
}

menuToggle.addEventListener("click", () => {
const expanded =
menuToggle.getAttribute("aria-expanded") === "true";

menuToggle.setAttribute("aria-expanded", String(!expanded));
menuToggle.setAttribute(
  "aria-label",
  expanded ? "فتح القائمة" : "إغلاق القائمة"
);

mainNav.classList.toggle("active", !expanded);
document.body.classList.toggle("menu-open", !expanded);

});

mainNav.querySelectorAll("a").forEach(link => {
link.addEventListener("click", closeMenu);
});

document.addEventListener("click", event => {
if (
!mainNav.contains(event.target) &&
!menuToggle.contains(event.target)
) {
closeMenu();
}
});

document.addEventListener("keydown", event => {
if (event.key === "Escape") closeMenu();
});
}

/* ==========================================
COPYRIGHT YEAR
========================================== */

function initCopyrightYear() {
const year = document.getElementById("year");

if (year) {
year.textContent = new Date().getFullYear();
}
}

/* ==========================================
YOUTUBE DATA API
========================================== */

async function youtubeRequest(endpoint, params = {}) {
const url = new URL(
"https://www.googleapis.com/youtube/v3/${endpoint}"
);

url.searchParams.set("key", ZAMZOK_CONFIG.apiKey);

Object.entries(params).forEach(([key, value]) => {
if (value !== undefined && value !== null && value !== "") {
url.searchParams.set(key, String(value));
}
});

const response = await fetch(url.toString());
const data = await response.json().catch(() => ({}));

if (!response.ok) {
throw new Error(
data?.error?.message ||
"YouTube API error: ${response.status}"
);
}

return data;
}

async function getUploadsPlaylist() {
const data = await youtubeRequest("channels", {
part: "contentDetails",
id: ZAMZOK_CONFIG.channelId
});

const channel = data.items?.[0];

if (!channel) {
throw new Error("لم يتم العثور على قناة ZAMZOK.");
}

return channel.contentDetails.relatedPlaylists.uploads;
}

async function getChannelVideos(playlistId) {
const result = [];
let pageToken = "";

while (result.length < ZAMZOK_CONFIG.maxVideos) {
const remaining = ZAMZOK_CONFIG.maxVideos - result.length;

const data = await youtubeRequest("playlistItems", {
  part: "snippet,contentDetails",
  playlistId,
  maxResults: Math.min(50, remaining),
  pageToken
});

for (const item of data.items || []) {
  const snippet = item.snippet || {};

  const id =
    item.contentDetails?.videoId ||
    snippet.resourceId?.videoId;

  if (!id) continue;

  result.push({
    id,
    title: snippet.title || "فيديو من ZAMZOK",
    description: snippet.description || "",
    publishedAt:
      item.contentDetails?.videoPublishedAt ||
      snippet.publishedAt ||
      "",
    thumbnail:
      snippet.thumbnails?.maxres?.url ||
      snippet.thumbnails?.high?.url ||
      snippet.thumbnails?.medium?.url ||
      `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`
  });
}

pageToken = data.nextPageToken || "";

if (!pageToken || !(data.items || []).length) break;

}

return result;
}

/* ==========================================
VIDEO CARDS
========================================== */

function renderVideos() {
if (!videoGrid) return;

videoGrid.setAttribute("aria-busy", "false");

if (!videos.length) {
setErrorMessage("لا توجد فيديوهات متاحة للعرض حاليًا.");
return;
}

videoGrid.innerHTML = videos.map((video, index) => `
<article class="zamzok-video-card">
<button
type="button"
class="zamzok-video-button"
data-video-index="${index}"
aria-label="تشغيل ${escapeHTML(video.title)}"
>
<span class="zamzok-thumbnail-wrap">
<img
class="zamzok-thumbnail"
src="${escapeHTML(video.thumbnail)}"
alt="${escapeHTML(video.title)}"
loading="${index < 4 ? "eager" : "lazy"}"
decoding="async"
>

      <span class="zamzok-play-icon" aria-hidden="true">▶</span>
    </span>

    <span class="zamzok-video-info">
      <strong>${escapeHTML(video.title)}</strong>
    </span>
  </button>
</article>

`).join("");
}

async function loadVideos() {
if (!videoGrid || isLoadingVideos) return;

isLoadingVideos = true;
setLoadingMessage("جاري تحميل فيديوهات ZAMZOK...");

try {
const playlistId = await getUploadsPlaylist();
videos = await getChannelVideos(playlistId);
renderVideos();
} catch (error) {
console.error("ZAMZOK loading error:", error);

setErrorMessage(
  "تعذر تحميل الفيديوهات. راجع إعدادات YouTube API ثم حاول مرة أخرى."
);

} finally {
isLoadingVideos = false;
}
}

/* ==========================================
CREATE REELS PLAYER
========================================== */

function createReelsPlayer() {
if (document.getElementById("zamzokReelsOverlay")) return;

const overlay = document.createElement("section");

overlay.id = "zamzokReelsOverlay";
overlay.className = "zamzok-reels-overlay";
overlay.setAttribute("role", "dialog");
overlay.setAttribute("aria-modal", "true");
overlay.setAttribute("aria-label", "مشغل فيديوهات ZAMZOK");
overlay.setAttribute("aria-hidden", "true");

overlay.innerHTML = `
<div class="zamzok-reels-backdrop"></div>

<div class="zamzok-reels-shell">
  <button
    type="button"
    class="zamzok-reels-close"
    id="zamzokReelsClose"
    aria-label="العودة إلى الموقع"
  >✕</button>

  <button
    type="button"
    class="zamzok-reels-prev"
    id="zamzokReelsPrev"
    aria-label="الفيديو السابق"
  >▲</button>

  <button
    type="button"
    class="zamzok-reels-next"
    id="zamzokReelsNext"
    aria-label="الفيديو التالي"
  >▼</button>

  <div class="zamzok-reels-video" id="zamzokReelsVideo">
    <div class="zamzok-reels-frame" id="zamzokReelsFrame"></div>
  </div>

  <div class="zamzok-reels-details">
    <strong id="zamzokReelsTitle">ZAMZOK</strong>
    <span id="zamzokReelsCounter"></span>
  </div>

  <div class="zamzok-reels-actions">
    <button type="button" id="zamzokReelsShare">↗ مشاركة</button>
    <button type="button" id="zamzokReelsYouTube">▶ يوتيوب</button>
    <button type="button" id="zamzokReelsFullscreen">⛶ ملء الشاشة</button>
  </div>

  <p class="zamzok-reels-hint">
    اسحب لأعلى أو لأسفل للتنقل بين الفيديوهات
  </p>
</div>

`;

document.body.appendChild(overlay);

document
.getElementById("zamzokReelsClose")
.addEventListener("click", closeReels);

document
.getElementById("zamzokReelsPrev")
.addEventListener("click", playPreviousVideo);

document
.getElementById("zamzokReelsNext")
.addEventListener("click", playNextVideo);

document
.getElementById("zamzokReelsShare")
.addEventListener("click", shareCurrentVideo);

document
.getElementById("zamzokReelsYouTube")
.addEventListener("click", openCurrentVideoOnYouTube);

document
.getElementById("zamzokReelsFullscreen")
.addEventListener("click", toggleFullscreen);

overlay
.querySelector(".zamzok-reels-backdrop")
.addEventListener("click", closeReels);

initSwipeGestures(overlay);

document.addEventListener("keydown", handleReelsKeyboard);
}

/* ==========================================
OPEN AND PLAY
========================================== */

function openReels(index) {
if (!videos.length) return;

createReelsPlayer();

const overlay = document.getElementById("zamzokReelsOverlay");
if (!overlay) return;

currentIndex = Math.max(0, Math.min(index, videos.length - 1));

previousBodyOverflow = document.body.style.overflow;

overlay.classList.add("is-open");
overlay.setAttribute("aria-hidden", "false");

document.body.style.overflow = "hidden";
reelsOpen = true;

try {
if (!(history.state && history.state.zamzokReels)) {
history.pushState(
{
...(history.state || {}),
zamzokReels: true
},
"",
location.href
);

  reelsHistoryPushed = true;
}

} catch (error) {
console.warn("History API unavailable:", error);
}

playVideo(currentIndex);
}

function playVideo(index) {
if (!videos.length || index < 0 || index >= videos.length) return;

currentIndex = index;

const video = videos[index];
const frame = document.getElementById("zamzokReelsFrame");
const title = document.getElementById("zamzokReelsTitle");
const counter = document.getElementById("zamzokReelsCounter");

if (!frame || !video) return;

const iframe = document.createElement("iframe");

iframe.className = "zamzok-reels-iframe";
iframe.title = video.title;

iframe.src =
"https://www.youtube-nocookie.com/embed/${encodeURIComponent(video.id)}" +
"?autoplay=1&playsinline=1&controls=1&rel=0&fs=1";

iframe.setAttribute("allowfullscreen", "");
iframe.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");

iframe.setAttribute(
"allow",
"accelerometer; autoplay; clipboard-write; encrypted-media; " +
"gyroscope; picture-in-picture; web-share; fullscreen"
);

frame.replaceChildren(iframe);

if (title) title.textContent = video.title;

if (counter) {
counter.textContent = "${index + 1} / ${videos.length}";
}

const previous = document.getElementById("zamzokReelsPrev");
const next = document.getElementById("zamzokReelsNext");

if (previous) previous.disabled = index === 0;
if (next) next.disabled = index === videos.length - 1;
}

/* ==========================================
NEXT / PREVIOUS
========================================== */

function playNextVideo() {
if (reelsOpen && currentIndex < videos.length - 1) {
playVideo(currentIndex + 1);
}
}

function playPreviousVideo() {
if (reelsOpen && currentIndex > 0) {
playVideo(currentIndex - 1);
}
}

/* ==========================================
SWIPE GESTURES
========================================== */

function initSwipeGestures(overlay) {
const swipeArea = overlay.querySelector(".zamzok-reels-video");
if (!swipeArea) return;

swipeArea.addEventListener("touchstart", event => {
if (!event.touches || event.touches.length !== 1) return;

touchStartX = event.touches[0].clientX;
touchStartY = event.touches[0].clientY;

}, { passive: true });

swipeArea.addEventListener("touchend", event => {
if (!reelsOpen || !event.changedTouches?.length) return;

const endX = event.changedTouches[0].clientX;
const endY = event.changedTouches[0].clientY;

const deltaX = endX - touchStartX;
const deltaY = endY - touchStartY;

if (Math.abs(deltaY) < 60) return;
if (Math.abs(deltaY) <= Math.abs(deltaX)) return;

if (deltaY < 0) {
  playNextVideo();
} else {
  playPreviousVideo();
}

}, { passive: true });
}

/* ==========================================
CLOSE AND BACK BUTTON
========================================== */

function closeReels(options = {}) {
const overlay = document.getElementById("zamzokReelsOverlay");

if (!overlay || !reelsOpen) return;

reelsOpen = false;

overlay.classList.remove("is-open");
overlay.setAttribute("aria-hidden", "true");

const frame = document.getElementById("zamzokReelsFrame");

if (frame) frame.replaceChildren();

document.body.style.overflow = previousBodyOverflow;

if (!options.fromPopstate && reelsHistoryPushed) {
reelsHistoryPushed = false;

if (history.state && history.state.zamzokReels) {
  history.back();
}

} else {
reelsHistoryPushed = false;
}
}

window.addEventListener("popstate", () => {
if (reelsOpen) {
closeReels({ fromPopstate: true });
}
});

/* ==========================================
KEYBOARD
========================================== */

function handleReelsKeyboard(event) {
if (!reelsOpen) return;

if (event.key === "Escape") {
event.preventDefault();
closeReels();
} else if (event.key === "ArrowDown") {
event.preventDefault();
playNextVideo();
} else if (event.key === "ArrowUp") {
event.preventDefault();
playPreviousVideo();
}
}

/* ==========================================
SHARE
========================================== */

async function shareCurrentVideo() {
const video = videos[currentIndex];
if (!video) return;

const url = youtubeVideoURL(video.id);

try {
if (navigator.share) {
await navigator.share({
title: video.title,
text: "شاهد هذا الفيديو من ZAMZOK",
url
});
} else if (navigator.clipboard && window.isSecureContext) {
await navigator.clipboard.writeText(url);
alert("تم نسخ رابط الفيديو.");
} else {
window.open(url, "_blank", "noopener,noreferrer");
}
} catch (error) {
if (error.name !== "AbortError") {
console.error("Share error:", error);
}
}
}

/* ==========================================
OPEN ON YOUTUBE
========================================== */

function openCurrentVideoOnYouTube() {
const video = videos[currentIndex];
if (!video) return;

window.open(
youtubeVideoURL(video.id),
"_blank",
"noopener,noreferrer"
);
}

/* ==========================================
FULLSCREEN
========================================== */

async function toggleFullscreen() {
const shell = document.querySelector(".zamzok-reels-shell");
if (!shell) return;

try {
if (document.fullscreenElement) {
await document.exitFullscreen();
} else if (shell.requestFullscreen) {
await shell.requestFullscreen();
} else {
alert("ملء الشاشة غير مدعوم في هذا المتصفح.");
}
} catch (error) {
console.error("Fullscreen error:", error);
}
}

/* ==========================================
VIDEO GRID EVENTS
========================================== */

function initVideoGrid() {
if (!videoGrid) return;

videoGrid.addEventListener("click", event => {
const button = event.target.closest(".zamzok-video-button");
if (!button) return;

const index = Number(button.dataset.videoIndex);

if (Number.isInteger(index)) {
  openReels(index);
}

});
}

/* ==========================================
INITIALIZATION
========================================== */

function initZamzok() {
initMobileMenu();
initCopyrightYear();
initVideoGrid();
loadVideos();
}

if (document.readyState === "loading") {
document.addEventListener("DOMContentLoaded", initZamzok);
} else {
initZamzok();
}
