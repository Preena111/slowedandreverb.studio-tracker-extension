let currentSort = "recent";
let isEditing = false;

function avg(arr) {
  if (!arr || !arr.length) return "N/A";
  return (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2);
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function timeAgo(ts) {
  if (!ts) return "never";
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${d}d ago`;
}

function renderSongs(songs) {
  const container = document.getElementById("songs");
  container.innerHTML = "";

  let entries = Object.entries(songs);

  if (currentSort === "recent") {
    entries.sort((a, b) => (b[1].lastListened || 0) - (a[1].lastListened || 0));
  } else {
    entries.sort((a, b) => b[1].seconds - a[1].seconds);
  }

  for (const [songId, song] of entries) {
    const cover = song.covers?.[song.coverIndex || 0];
    const displayName = song.displayName || songId.replace(/\.[^.]+$/, "");
    const div = document.createElement("div");
    div.className = "song";
    div.innerHTML = `
      <div class="cover-wrap">
        ${cover
          ? `<img src="${cover}" class="cover" alt="cover">`
          : `<div class="no-cover">?</div>`}
        ${song.covers?.length > 1
          ? `<button class="cycle-btn" data-id="${songId}">›</button>`
          : ""}
      </div>
      <div class="song-info">
        <div class="song-name-wrap">
          <span class="song-name" data-id="${songId}">${displayName}</span>
          <button class="edit-btn" data-id="${songId}" data-name="${displayName}">✎</button>
        </div>
        <div class="song-meta">${formatTime(song.seconds)} · ${timeAgo(song.lastListened)}</div>
      </div>
    `;
    container.appendChild(div);
  }

  document.querySelectorAll(".cycle-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      await chrome.runtime.sendMessage({ type: "CYCLE_COVER", songId: btn.dataset.id });
      loadStats();
    });
  });

  document.querySelectorAll(".edit-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const songId = btn.dataset.id;
      const currentName = btn.dataset.name;
      const nameSpan = document.querySelector(`.song-name[data-id="${songId}"]`);

      const input = document.createElement("input");
      input.className = "name-input";
      input.value = currentName;
      nameSpan.replaceWith(input);
      input.focus();
      btn.style.display = "none";

      isEditing = true;

      async function save() {
        const newName = input.value.trim() || currentName;
        isEditing = false;
        await chrome.runtime.sendMessage({ type: "RENAME_SONG", songId, newName });
        loadStats();
      }

      input.addEventListener("blur", save);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") save();
        if (e.key === "Escape") {
          isEditing = false;
          loadStats();
        }
      });
    });
  });
}

function loadStats() {
  chrome.runtime.sendMessage({ type: "GET_STATS" }, (data) => {
    const stats = data?.stats_slowedandreverb_studio;
    const songs = stats?.songs || {};
    const today = new Date().toLocaleDateString();
    const todaySeconds = stats?.dailySeconds?.[today] || 0;

    document.getElementById("total-time").textContent = formatTime(stats?.totalListenSeconds || 0);
    document.getElementById("today-time").textContent = formatTime(todaySeconds);
    document.getElementById("avg-pitch").textContent = stats?.avgPitch ? stats.avgPitch + "x" : "N/A";
    document.getElementById("avg-reverb").textContent = stats?.avgReverb ? stats.avgReverb + "%" : "N/A";

    if (!isEditing) renderSongs(songs);
  });
}

// sort buttons
document.getElementById("sort-recent").addEventListener("click", () => {
  currentSort = "recent";
  document.getElementById("sort-recent").classList.add("active");
  document.getElementById("sort-time").classList.remove("active");
  loadStats();
});

document.getElementById("sort-time").addEventListener("click", () => {
  currentSort = "time";
  document.getElementById("sort-recent").classList.remove("active");
  document.getElementById("sort-time").classList.add("active");
  loadStats();
});

// clear data
document.getElementById("clear").addEventListener("click", () => {
  if (confirm("Are you sure? This will delete all your listening data.")) {
    chrome.storage.local.clear(() => loadStats());
  }
});

// theme sidebar toggle
document.getElementById("theme-tab").addEventListener("click", () => {
  document.getElementById("theme-panel").classList.toggle("open");
});

document.addEventListener("click", (e) => {
  if (!e.target.closest(".theme-sidebar")) {
    document.getElementById("theme-panel").classList.remove("open");
  }
});

// theme switcher
function applyTheme(theme) {
  document.body.className = theme;
  document.querySelectorAll(".theme-dot").forEach(d => {
    d.classList.toggle("active", d.dataset.theme === theme);
  });
}

chrome.storage.local.get("theme", (result) => {
  applyTheme(result.theme || "dark");
});

document.querySelectorAll(".theme-dot").forEach(dot => {
  dot.addEventListener("click", () => {
    const theme = dot.dataset.theme;
    applyTheme(theme);
    chrome.storage.local.set({ theme });
  });
});

// initial load + auto refresh every second
loadStats();
setInterval(loadStats, 1000);