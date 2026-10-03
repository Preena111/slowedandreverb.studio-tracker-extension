const LASTFM_API_KEY = "fba09a44f7278fa67d041d3c90a9af68";

function weightedAvg(freq) {
  let total = 0;
  let count = 0;
  for (const [val, cnt] of Object.entries(freq)) {
    total += parseFloat(val) * cnt;
    count += cnt;
  }
  return count === 0 ? null : (total / count).toFixed(2);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "TRACK_EVENT") {
    saveEvent(msg.data);
  } else if (msg.type === "GET_STATS") {
    getStats().then(sendResponse);
    return true;
  } else if (msg.type === "FETCH_COVERS") {
    fetchCovers(msg.query).then(sendResponse);
    return true;
  } else if (msg.type === "CYCLE_COVER") {
    cycleCover(msg.songId).then(sendResponse);
    return true;
  } else if (msg.type === "RENAME_SONG") {
    renameSong(msg.songId, msg.newName).then(sendResponse);
    return true;
  }
});

async function fetchCovers(query) {
  const clean = query.replace(/\.[^.]+$/, "").replace(/\d+$/, "").trim();
  const url = `https://ws.audioscrobbler.com/2.0/?method=track.search&track=${encodeURIComponent(clean)}&api_key=${LASTFM_API_KEY}&format=json&limit=5`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    const tracks = data?.results?.trackmatches?.track || [];
    const covers = [];

    for (const track of tracks) {
      const infoUrl = `https://ws.audioscrobbler.com/2.0/?method=track.getInfo&artist=${encodeURIComponent(track.artist)}&track=${encodeURIComponent(track.name)}&api_key=${LASTFM_API_KEY}&format=json`;
      const infoRes = await fetch(infoUrl);
      const infoData = await infoRes.json();
      const img = infoData?.track?.album?.image?.find(i => i.size === "large")?.["#text"];
      if (img && img !== "") covers.push(img);
    }
    return covers;
  } catch {
    return [];
  }
}

async function cycleCover(songId) {
  const result = await chrome.storage.local.get("stats_slowedandreverb_studio");
  const stats = result["stats_slowedandreverb_studio"];
  if (!stats?.songs?.[songId]) return;

  const song = stats.songs[songId];
  const total = song.covers?.length || 0;
  if (total === 0) return;
  song.coverIndex = ((song.coverIndex || 0) + 1) % total;

  await chrome.storage.local.set({ "stats_slowedandreverb_studio": stats });
  return true;
}

async function saveEvent({ site, event, value }) {
  const key = `stats_${site}`;
  const result = await chrome.storage.local.get(key);
  const stats = result[key] || {
    totalListenSeconds: 0,
    speedReadings: [],
    pitchFreq: {},
    reverbFreq: {},
    avgPitch: null,
    avgReverb: null,
    sessions: 0,
    dailySeconds: {},
    songs: {}
  };

  if (event === "TICK") {
    const { seconds, songId, pitch, reverb } = value;
    stats.totalListenSeconds += seconds;

    const today = new Date().toLocaleDateString();
    stats.dailySeconds = stats.dailySeconds || {};
    stats.dailySeconds[today] = (stats.dailySeconds[today] || 0) + seconds;

    if (!stats.songs[songId]) {
      stats.songs[songId] = {
        seconds: 0,
        lastListened: null,
        covers: [],
        coverIndex: 0,
        displayName: songId.replace(/\.[^.]+$/, "").trim()
      };
    }
    stats.songs[songId].seconds += seconds;
    stats.songs[songId].lastListened = Date.now();

    if (stats.songs[songId].covers.length === 0) {
      const covers = await fetchCovers(songId);
      stats.songs[songId].covers = covers;
    }

    // Process real-time averages using seconds
    if (pitch !== null) {
      const pKey = pitch.toFixed(1);
      stats.pitchFreq = stats.pitchFreq || {};
      stats.pitchFreq[pKey] = (stats.pitchFreq[pKey] || 0) + seconds;
      stats.avgPitch = weightedAvg(stats.pitchFreq);
    }

    if (reverb !== null) {
      const rKey = reverb.toFixed(1);
      stats.reverbFreq = stats.reverbFreq || {};
      stats.reverbFreq[rKey] = (stats.reverbFreq[rKey] || 0) + seconds;
      stats.avgReverb = weightedAvg(stats.reverbFreq);
    }
  }

  if (event === "SPEED_CHANGE") {
    stats.speedReadings.push(value.value);
  }

  if (event === "SESSION_START") {
    stats.sessions += 1;
  }

  await chrome.storage.local.set({ [key]: stats });
}

async function renameSong(songId, newName) {
  const result = await chrome.storage.local.get("stats_slowedandreverb_studio");
  const stats = result["stats_slowedandreverb_studio"];
  if (!stats?.songs?.[songId]) return;
  stats.songs[songId].displayName = newName;
  const covers = await fetchCovers(newName);
  if (covers.length > 0) {
    stats.songs[songId].covers = covers;
    stats.songs[songId].coverIndex = 0;
  }
  await chrome.storage.local.set({ "stats_slowedandreverb_studio": stats });
}

async function getStats() {
  return chrome.storage.local.get("stats_slowedandreverb_studio");
}