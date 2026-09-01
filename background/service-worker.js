(() => {
  "use strict";

  const OFFSCREEN_URL = "offscreen/offscreen.html";
  let activeFallback = { tabId: null, isActive: false };

  chrome.runtime.onInstalled.addListener(() => {});

  async function hasOffscreenDocument() {
    try {
      const contexts = await chrome.runtime.getContexts({
        contextTypes: ["OFFSCREEN_DOCUMENT"],
      });
      return contexts.length > 0;
    } catch (e) {
      console.error("[PopTool] getContexts hatası:", e);
      return false;
    }
  }

  async function ensureOffscreenDocument() {
    if (await hasOffscreenDocument()) {
      return true;
    }
    try {
      await chrome.offscreen.createDocument({
        url: OFFSCREEN_URL,
        reasons: ["USER_MEDIA"],
        justification: "Sekme video yakalama kaydı (tabCapture + MediaRecorder)",
      });
      return true;
    } catch (e) {
      console.error("[PopTool] Offscreen doküman oluşturulamadı:", e);
      return false;
    }
  }

  function getStreamId(targetTabId) {
    return new Promise((resolve, reject) => {
      try {
        chrome.tabCapture.getMediaStreamId(
          { targetTabId },
          (streamId) => {
            const err = chrome.runtime.lastError;
            if (err || !streamId) {
              reject(new Error(err?.message || "streamId alınamadı"));
            } else {
              resolve(streamId);
            }
          }
        );
      } catch (e) {
        reject(e);
      }
    });
  }

  function sendToOffscreen(payload) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(payload, (response) => {
          void chrome.runtime.lastError;
          resolve(response || null);
        });
      } catch {
        resolve(null);
      }
    });
  }

  async function waitForOffscreenReady(maxAttempts = 10, delayMs = 200) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const response = await sendToOffscreen({ action: "offscreenPing" });
      if (response?.ready) {
        return true;
      }
      await new Promise((r) => setTimeout(r, delayMs));
    }
    return false;
  }

  function reportTabRecordingError(message) {
    chrome.runtime.sendMessage({
      action: "recordingError",
      error: message,
    }).catch(() => {});
  }

  async function handleStartTabRecording(msg, sourceTabId) {
    let streamId = null;
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (!tab?.id) {
        throw new Error("Aktif sekme bulunamadı.");
      }

      streamId = await getStreamId(tab.id);

      const created = await ensureOffscreenDocument();
      if (!created) {
        throw new Error("Offscreen kayıt dokümanı oluşturulamadı.");
      }

      const ready = await waitForOffscreenReady();
      if (!ready) {
        throw new Error("Kayıt modülü hazır hale gelmedi.");
      }

      const ack = await sendToOffscreen({
        action: "beginTabCapture",
        streamId,
        startTime: msg.startTime,
        endTime: msg.endTime,
        sourceTabId,
      });

      if (!ack?.received) {
        throw new Error("Kayıt modülü isteği alamadı.");
      }

      activeFallback = { tabId: sourceTabId, isActive: true };
    } catch (e) {
      console.error("[PopTool] Sekme kaydı başlatılamadı:", e);
      reportTabRecordingError(
        "Sekme kaydı başlatılamadı: " + (e?.message || "bilinmeyen hata")
      );
    }
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    const action = msg?.action;

    if (
      action === "recordingProgress" ||
      action === "recordingError"
    ) {
      if (sender.url && sender.url.includes(OFFSCREEN_URL)) {
        return false;
      }
      if (!msg.dataUrl && sender.tab?.id) {
        chrome.tabs.sendMessage(sender.tab.id, msg).catch(() => {});
      }
      return false;
    }

    if (action === "startTabRecording") {
      const sourceTabId = sender.tab?.id;
      handleStartTabRecording(msg, sourceTabId);
      sendResponse({ ok: true });
      return false;
    }

    if (action === "stopTabRecording") {
      sendToOffscreen({ action: "stopTabCapture" });
      sendResponse({ ok: true });
      return false;
    }

    if (action === "FALLBACK_RECORDING_COMPLETE") {
      chrome.offscreen.closeDocument();
      if (Number.isInteger(msg.sourceTabId)) {
        chrome.tabs.sendMessage(msg.sourceTabId, { action: "RECORDING_FINISHED" }).catch(() => {});
      }
      activeFallback = { tabId: null, isActive: false };
      sendResponse({ ok: true });
      return false;
    }

    if (action === "getRecordingStatus") {
      handleGetRecordingStatus(msg, sendResponse);
      return true;
    }

    return false;
  });

  async function handleGetRecordingStatus(msg, sendResponse) {
    try {
      const tabId = msg.tabId;

      if (activeFallback.isActive && activeFallback.tabId === tabId) {
        const resp = await sendToOffscreen({ action: "getOffscreenRecordingStatus" });
        sendResponse({
          isRecording: !!resp?.isRecording,
          percent: resp?.percent ?? 0,
          text: resp?.text ?? "",
        });
        return;
      }

      if (!Number.isInteger(tabId)) {
        sendResponse({ isRecording: false, percent: 0, text: "" });
        return;
      }

      try {
        const contentResp = await chrome.tabs.sendMessage(tabId, { action: "getRecordingStatus" });
        sendResponse({
          isRecording: !!contentResp?.isRecording,
          percent: contentResp?.percent ?? 0,
          text: contentResp?.text ?? "",
        });
      } catch (e) {
        sendResponse({ isRecording: false, percent: 0, text: "" });
      }
    } catch (e) {
      sendResponse({ isRecording: false, percent: 0, text: "" });
    }
  }
})();
