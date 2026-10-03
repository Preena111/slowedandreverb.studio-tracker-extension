console.log("TRACKER: content script loaded");

const SITE = "slowedandreverb_studio";
const TICK_INTERVAL = 1;

let tickTimer = null;
let lastSpeed = null;
let currentSongName = "unknown";

function send(event, value) {
  console.log("TRACKER: sending", event, value);
  chrome.runtime.sendMessage({ type: "TRACK_EVENT", data: { site: SITE, event, value } });
}

function getStatsDiv() {
  return [...document.querySelectorAll('div')].find(el =>
    /[\d.]+x speed/.test(el.textContent) && el.children.length === 0
  );
}

function getSongName() {
  const el = document.querySelector('.text-xl.font-medium.text-white.wrap-break-word');
  return el ? el.textContent.trim() : "unknown";
}

function getSpeed() {
  const el = getStatsDiv();
  const match = el?.textContent.match(/([\d.]+)x speed/);
  return match ? parseFloat(match[1]) : null;
}

function getPitch() {
  const el = getStatsDiv();
  const match = el?.textContent.match(/([\d.]+)x\s*pitch/);
  return match ? parseFloat(match[1]) : null;
}

function getReverb() {
  const el = getStatsDiv();
  const match = el?.textContent.match(/([\d.]+)%\s*reverb/);
  return match ? parseFloat(match[1]) : null;
}

function startTracking(audio) {
  console.log("TRACKER: started tracking audio", audio.src);
  currentSongName = getSongName();
  send("SESSION_START", { songId: currentSongName });

  clearInterval(tickTimer);
  tickTimer = setInterval(() => {
    if (!audio.paused) {
      console.log("TRACKER: tick for", currentSongName);
      currentSongName = getSongName();
      
      const speed = getSpeed();
      const pitch = getPitch();
      const reverb = getReverb();

      send("TICK", { 
        seconds: TICK_INTERVAL, 
        songId: currentSongName,
        pitch: pitch,
        reverb: reverb
      });

      if (speed !== null && speed !== lastSpeed) {
        send("SPEED_CHANGE", { value: speed, songId: currentSongName });
        lastSpeed = speed;
      }
    }
  }, TICK_INTERVAL * 1000);

  audio.addEventListener("loadedmetadata", () => {
    currentSongName = getSongName();
    send("SESSION_START", { songId: currentSongName });
  });
}

const observer = new MutationObserver(() => {
  const audio = document.querySelector("audio");
  if (audio) {
    console.log("TRACKER: audio element found");
    observer.disconnect();
    startTracking(audio);
  }
});

observer.observe(document.body, { childList: true, subtree: true });
const existing = document.querySelector("audio");
if (existing) {
  console.log("TRACKER: audio already exists");
  startTracking(existing);
}