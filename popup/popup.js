let currentTabId = null;
let isRecording = false;
let durationSec = 0;
let currentVideoTime = 0;
let durationUnknown = false;
let currentVideoIsFrame = false;

const $ = (id) => document.getElementById(id);

function isFrameResponse(response) {
  return Boolean(response?.isFrame || response?.type === "iframe");
}

const els = {
  platformBadge: $("platformBadge"),
  videoInfo: $("videoInfo"),
  videoTitle: $("videoTitle"),
  videoDuration: $("videoDuration"),
  videoCurrentTime: $("videoCurrentTime"),
  controls: $("controls"),
  startTime: $("startTime"),
  endTime: $("endTime"),
  setStartBtn: $("setStartBtn"),
  setEndBtn: $("setEndBtn"),
  clipDuration: $("clipDuration"),
  rangeFill: $("rangeFill"),
  timelineStart: $("timelineStart"),
  timelineEnd: $("timelineEnd"),
  recordBtn: $("recordBtn"),
  recordIcon: $("recordIcon"),
  recordText: $("recordText"),
  progress: $("progress"),
  progressFill: $("progressFill"),
  progressText: $("progressText"),
  message: $("message"),
  messageText: $("messageText"),
  formContainer: $("form-container"),
  emptyState: $("empty-state"),
};

const REQUIRED_IDS = Object.keys(els).map((key) => els[key]?.id ?? key);

function verifyDomIds() {
  const missing = REQUIRED_IDS.filter((id) => !document.getElementById(id));
  if (missing.length > 0) {
    console.error("Popup Error: popup.html ID mismatch, missing:", missing.join(", "));
    return false;
  }
  return true;
}

function formatTimestamp(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function parseTimeInput(str) {
  if (typeof str !== "string") str = String(str);
  str = str.trim();
  if (str === "") return NaN;
  const parts = str.split(":").map(Number);
  if (parts.some(isNaN)) return NaN;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1) return parts[0];
  return NaN;
}

function getInputSeconds(input) {
  return parseTimeInput(input.value);
}

function setInputValue(input, seconds) {
  input.value = formatTimestamp(seconds);
}

function setHidden(el, hidden) {
  el?.classList.toggle("hidden", Boolean(hidden));
}

function showMessage(text, type) {
  if (!els.message || !els.messageText) return;
  els.messageText.textContent = text;
  els.message.classList.remove("hidden");
  els.message.classList.toggle("success", type === "success");
  els.message.classList.toggle("error", type === "error");
  els.message.classList.toggle("ready", type === "ready");
}

function hideMessage() {
  setHidden(els.message, true);
}

function hideAllErrorContainers() {
  hideMessage();
  if (!isRecording) {
    setHidden(els.progress, true);
    if (els.progressFill) els.progressFill.style.width = "0%";
  }
}

function resetUi() {
  durationUnknown = false;
  currentVideoIsFrame = false;
  setHidden(els.videoInfo, true);
  setHidden(els.controls, true);
  setHidden(els.progress, true);
  setHidden(els.message, true);
  setHidden(els.emptyState, true);
  setHidden(els.formContainer, false);
  if (els.progressFill) els.progressFill.style.width = "0%";
  if (els.platformBadge) setHidden(els.platformBadge, true);
}

function detectPlatform(hostname) {
  if (!hostname) return null;
  const h = hostname.toLowerCase();
  if (h.includes("youtube.com") || h.includes("youtu.be")) return "YouTube";
  if (h.includes("instagram.com")) return "Instagram";
  if (h.includes("x.com") || h.includes("twitter.com")) return "X";
  if (h.includes("tiktok.com")) return "TikTok";
  if (h.includes("twitch.tv")) return "Twitch";
  if (h.includes("vimeo.com")) return "Vimeo";
  if (h.includes("dailymotion.com")) return "Dailymotion";
  if (h.includes("facebook.com") || h.includes("fb.watch")) return "Facebook";
  return hostname.replace("www.", "").split(".")[0].charAt(0).toUpperCase() + hostname.replace("www.", "").split(".")[0].slice(1);
}

function isRestrictedUrl(url) {
  if (!url) return true;
  const restrictedSchemes = [
    'chrome://',
    'chrome-extension://',
    'edge://',
    'about:',
    'view-source:'
  ];
  return restrictedSchemes.some(scheme => url.startsWith(scheme));
}

function updateRangeBar() {
  if (!els.rangeFill || !els.startTime || !els.endTime || !els.clipDuration) return;
  const start = getInputSeconds(els.startTime) || 0;
  const end = getInputSeconds(els.endTime) || 0;
  const duration = durationSec > 0 ? durationSec : 0;

  if (duration > 0) {
    const clampedStart = Math.max(0, Math.min(start, duration));
    const clampedEnd = Math.max(0, Math.min(end, duration));
    const leftPercent = (clampedStart / duration) * 100;
    const widthPercent = ((clampedEnd - clampedStart) / duration) * 100;
    els.rangeFill.style.left = `${leftPercent}%`;
    els.rangeFill.style.width = `${Math.max(0, Math.min(widthPercent, 100 - leftPercent))}%`;
  } else {
    els.rangeFill.style.left = "0%";
    els.rangeFill.style.width = "0%";
  }

  if (els.timelineStart) els.timelineStart.textContent = "0:00";
  if (els.timelineEnd) {
    els.timelineEnd.textContent =
      duration > 0 ? formatTimestamp(duration) : formatTimestamp(0);
  }

  const clipLen = Math.max(0, end - start);
  els.clipDuration.textContent = `Selected range: ${formatTimestamp(clipLen)}`;
}

function validateTimes() {
  if (!els.startTime || !els.endTime || durationUnknown) return;
  const s = getInputSeconds(els.startTime) || 0;
  const e = getInputSeconds(els.endTime) || 0;

  if (s < 0) setInputValue(els.startTime, 0);
  if (e < 0) setInputValue(els.endTime, 0);
  const clampedS = getInputSeconds(els.startTime) || 0;
  const clampedE = getInputSeconds(els.endTime) || 0;
  if (clampedS >= durationSec) setInputValue(els.startTime, Math.max(0, durationSec - 0.1));
  if (clampedE > durationSec) setInputValue(els.endTime, durationSec);
}

const RECORD_ICONS = {
  idle: `<circle cx="12" cy="12" r="10" fill="#e15b64" stroke="#e15b64"/>`,
  recording: `<rect x="6" y="6" width="12" height="12" rx="2"/>`,
};

function runLiveValidation() {
  if (!els.recordBtn || !els.startTime || !els.endTime) return;
  if (isRecording) return;

  const start = getInputSeconds(els.startTime) || 0;
  const end = getInputSeconds(els.endTime) || 0;

  const clearErrorState = () => {
    els.startTime.classList.remove('error');
    els.endTime.classList.remove('error');
    hideMessage();
  };

  if (start >= end) {
    els.recordBtn.disabled = true;
    els.startTime.classList.add('error');
    els.endTime.classList.add('error');
    showMessage("End time must be after start time", "error");
    return;
  }
  if (start < 0 || (durationSec > 0 && end > durationSec)) {
    els.recordBtn.disabled = true;
    els.endTime.classList.add('error');
    showMessage("Time range exceeds video duration", "error");
    return;
  }

  els.recordBtn.disabled = false;
  clearErrorState();
}

function setRecordingState(recording) {
  isRecording = recording;
  if (!els.recordBtn || !els.recordIcon || !els.recordText) return;

  if (recording) {
    els.recordBtn.classList.add("recording");
    els.recordIcon.innerHTML = RECORD_ICONS.recording;
    els.recordText.textContent = "Stop Recording";
    els.recordBtn.disabled = false;
  } else {
    els.recordBtn.classList.remove("recording");
    els.recordIcon.innerHTML = RECORD_ICONS.idle;
    els.recordText.textContent = "Clip & Download";
    runLiveValidation();
  }

  for (const el of [els.startTime, els.endTime, els.setStartBtn, els.setEndBtn]) {
    if (el) el.disabled = recording;
  }
}

let successResetTimer = null;

function handleDownloadComplete() {
  hideProgress();
  setRecordingState(false);

  showMessage("Download complete ✓", "success");

  if (successResetTimer) clearTimeout(successResetTimer);
  successResetTimer = setTimeout(() => {
    successResetTimer = null;
    showMessage("Ready", "ready");
  }, 2000);
}

function setProgress(percent, text) {
  if (!els.progress || !els.progressFill || !els.progressText) return;
  els.progress.classList.remove("hidden");
  els.progressFill.style.width = `${percent}%`;
  els.progressText.textContent = text || `${Math.round(percent)}%`;
}

function hideProgress() {
  setHidden(els.progress, true);
  if (els.progressFill) els.progressFill.style.width = "0%";
}

async function sendToTab(tabId, payload) {
  try {
    return await chrome.tabs.sendMessage(tabId, payload);
  } catch (err) {
    const errMsg = err?.message || chrome.runtime?.lastError?.message || '';
    // Sekmede dinleyici olmaması beklenen bir durumdur, error paneline düşürme
    if (errMsg.includes('Receiving end does not exist') || errMsg.includes('Could not establish connection')) {
      return null;
    }
    console.error('Popup Error (unexpected tab message failure):', err || chrome.runtime.lastError);
    return null;
  }
}

async function sendToBackground(payload) {
  try {
    return await chrome.runtime.sendMessage(payload);
  } catch (err) {
    console.error("Popup Error:", err || chrome.runtime.lastError);
    return null;
  }
}

async function injectContentScript(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tabId, allFrames: false },
      files: ["content/content.js"],
    });
    return true;
  } catch (err) {
    console.error("Popup Error (injection):", err || chrome.runtime.lastError);
    return false;
  }
}

async function requestVideoInfo() {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!tab) {
      console.error("Popup Error: No active tab found");
      return null;
    }

    if (isRestrictedUrl(tab.url)) {
      renderNotFound();
      return null;
    }

    currentTabId = tab.id;

    if (tab.url && els.platformBadge) {
      try {
        const url = new URL(tab.url);
        const platform = detectPlatform(url.hostname);
        if (platform) {
          els.platformBadge.textContent = platform;
          setHidden(els.platformBadge, false);
        }
      } catch (_) { /* ignore */ }
    }

    let response = await sendToTab(currentTabId, { action: "getVideoInfo" });

    if (!response) {
      const injected = await injectContentScript(currentTabId);
      if (injected) {
        response = await sendToTab(currentTabId, { action: "getVideoInfo" });
      }
    }

    return response;
  } catch (err) {
    console.error("Popup Error:", err || chrome.runtime.lastError);
    return null;
  }
}

function renderFound(response) {
  if (response.isDRM) {
    currentVideoIsFrame = false;
    showMessage("DRM-protected video - cannot record", "error");
    setHidden(els.videoInfo, true);
    setHidden(els.controls, true);
    stopTimeInterval();
    return;
  }
  const isFrame = isFrameResponse(response);
  currentVideoIsFrame = isFrame;

  hideAllErrorContainers();
  setHidden(els.videoInfo, false);

  if (els.videoTitle) {
    els.videoTitle.textContent = response.title || "Unknown";
    els.videoTitle.title = response.title || '';
  }

  durationSec = Number(response.duration) || 0;
  currentVideoTime = Number(response.currentTime) || 0;
  durationUnknown = isFrame && durationSec <= 0;

  if (els.videoDuration) {
    els.videoDuration.textContent = durationUnknown ? "Unknown / Live" : formatTimestamp(durationSec);
  }
  if (els.videoCurrentTime) {
    els.videoCurrentTime.textContent = durationUnknown ? "--" : formatTimestamp(Number(response.currentTime) || 0);
  }

  setHidden(els.controls, false);

  if (durationUnknown) {
    if (els.startTime) {
      els.startTime.disabled = false;
    }
    if (els.endTime) {
      els.endTime.disabled = false;
    }
    if (els.recordBtn) els.recordBtn.disabled = false;
    stopTimeInterval();
  } else {
    if (els.startTime) setInputValue(els.startTime, 0);
    if (els.endTime) setInputValue(els.endTime, durationSec);
    startTimeInterval();
  }

  updateRangeBar();
  runLiveValidation();
}

async function findVideo() {
  resetUi();

  const response = await requestVideoInfo();

  if (!response || !response.success) {
    renderEmptyState();
    return;
  }

  hideAllErrorContainers();

  if (response.found) {
    hideEmptyState();
    renderFound(response);
  } else {
    renderEmptyState();
    await retryFindVideo();
  }
}

function renderEmptyState() {
  currentVideoIsFrame = false;
  stopTimeInterval();
  setHidden(els.formContainer, true);
  setHidden(els.emptyState, false);
}

function renderNotFound() {
  renderEmptyState();
}

function hideEmptyState() {
  setHidden(els.emptyState, true);
  setHidden(els.formContainer, false);
}

async function retryFindVideo() {
  for (let attempt = 1; attempt <= 3; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const response = await requestVideoInfo();

    if (!response || !response.success) {
      return;
    }

    if (response.found) {
      hideEmptyState();
      renderFound(response);
      return;
    }
  }
}

let currentTimeIntervalId = null;

function startTimeInterval() {
  stopTimeInterval();
  currentTimeIntervalId = setInterval(async () => {
    if (isRecording || !currentTabId) return;
    const response = await sendToTab(currentTabId, { action: "getVideoInfo" });
    if (response?.found) {
      currentVideoTime = Number(response.currentTime) || 0;
      if (els.videoCurrentTime) {
        els.videoCurrentTime.textContent = formatTimestamp(currentVideoTime);
      }
    }
  }, 1000);
}

function stopTimeInterval() {
  if (currentTimeIntervalId) {
    clearInterval(currentTimeIntervalId);
    currentTimeIntervalId = null;
  }
}

els.startTime?.addEventListener("input", () => {
  validateTimes();
  updateRangeBar();
  runLiveValidation();
});

els.startTime?.addEventListener("change", () => {
  validateTimes();
  updateRangeBar();
  runLiveValidation();
});

els.endTime?.addEventListener("input", () => {
  validateTimes();
  updateRangeBar();
  runLiveValidation();
});

els.endTime?.addEventListener("change", () => {
  validateTimes();
  updateRangeBar();
  runLiveValidation();
});

async function setCurrentTimeTo(targetInput) {
  const response = await requestVideoInfo();
  if (response?.success && response.found && targetInput) {
    setInputValue(targetInput, Number(response.currentTime) || 0);
    validateTimes();
    updateRangeBar();
    runLiveValidation();
  }
}

els.setStartBtn?.addEventListener("click", () => setCurrentTimeTo(els.startTime));

els.setEndBtn?.addEventListener("click", () => setCurrentTimeTo(els.endTime));

// Quick Clips
document.querySelectorAll(".chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    if (isRecording || durationUnknown || durationSec <= 0) return;
    const seconds = parseInt(chip.dataset.seconds, 10);
    const end = Math.max(0, Math.min(currentVideoTime, durationSec));
    const start = Math.max(0, end - seconds);
    if (els.startTime) setInputValue(els.startTime, start);
    if (els.endTime) setInputValue(els.endTime, end);
    validateTimes();
    updateRangeBar();
    runLiveValidation();
  });
});

els.recordBtn?.addEventListener("click", async () => {
  hideMessage();

  if (isRecording) {
    if (currentVideoIsFrame) {
      sendToBackground({ action: "stopTabRecording" });
    } else {
      sendToTab(currentTabId, { action: "stopRecording" });
    }
    setRecordingState(false);
    return;
  }

  if (!els.startTime || !els.endTime) return;

  const start = getInputSeconds(els.startTime) || 0;
  const end = getInputSeconds(els.endTime) || 0;

  if (start >= end) {
    showMessage("Start time must be before end time", "error");
    return;
  }

  if (end - start < 1) {
    showMessage("Minimum clip duration is 1 second", "error");
    return;
  }

  if (!durationUnknown && durationSec <= 0) {
    showMessage("Live streams / invalid videos cannot be clipped", "error");
    return;
  }
  if (!durationUnknown && !Number.isFinite(durationSec)) {
    showMessage("Live streams / invalid videos cannot be clipped", "error");
    return;
  }

  if (!durationUnknown && end > durationSec) {
    showMessage("End time cannot exceed video duration", "error");
    return;
  }

  setRecordingState(true);
  setProgress(0, currentVideoIsFrame ? "Starting tab capture..." : "Starting recording...");

  if (currentVideoIsFrame) {
    await sendToBackground({
      action: "startTabRecording",
      startTime: start,
      endTime: end,
    });
    return;
  }

  const response = await sendToTab(currentTabId, {
    action: "startRecording",
    startTime: start,
    endTime: end,
  });

  if (response && response.useTabCapture) {
    setProgress(0, "Starting tab capture...");
    await sendToBackground({
      action: "startTabRecording",
      startTime: start,
      endTime: end,
    });
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  try {
    const action = msg?.action;
    if (action === "recordingProgress") {
      setProgress(msg.percent, msg.text);
    } else if (action === "downloadComplete") {
      handleDownloadComplete();
    } else if (action === "recordingError") {
      setRecordingState(false);
      hideProgress();
      showMessage(msg.error || "Recording error", "error");
    }
  } catch (e) {
    console.error("[PopTool] Popup message handling error:", e);
  }
  return false;
});

async function init() {
  verifyDomIds();
  await findVideo();
  await syncRecordingState();
}

async function syncRecordingState() {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!tab?.id) return;
    currentTabId = tab.id;
    const response = await sendToBackground({ action: "getRecordingStatus", tabId: currentTabId });
    if (response && response.isRecording) {
      setRecordingState(true);
      setProgress(response.percent || 0, response.text || "");
    }
  } catch (err) {
    console.error("Popup Error:", err || chrome.runtime.lastError);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
