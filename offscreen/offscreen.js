(() => {
  "use strict";

  let mediaRecorder = null;
  let tabStream = null;
  let recordedChunks = [];
  let stopTimer = null;
  let progressTimer = null;
  let plannedStartTime = 0;
  let plannedEndTime = 0;
  let sourceTabId = null;
  let isRecordingActive = false;
  let lastProgress = { percent: 0, text: "" };

  function sendToPopup(action, data) {
    try {
      const result = chrome.runtime.sendMessage({ action, ...data });
      if (result && typeof result.catch === "function") {
        result.catch(() => {});
      }
    } catch {}
  }

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  function getSupportedMimeType() {
    return MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
      ? "video/webm;codecs=vp8,opus"
      : "video/webm";
  }

  function verifyStreamTracks(stream) {
    const videoTracks = stream.getVideoTracks();
    const audioTracks = stream.getAudioTracks();

    if (videoTracks.length === 0) {
      throw new Error("Sekme akışında görüntü parçası (video track) yok.");
    }

    for (const track of [...videoTracks, ...audioTracks]) {
      if (track.readyState !== "live") {
        throw new Error(
          `Sekme akışı parçası hazır değil (${track.kind}: ${track.readyState}).`
        );
      }
      try {
        track.enabled = true;
      } catch {}
    }
  }

  function areAllTracksLive() {
    if (!tabStream) return false;
    return tabStream.getTracks().every((t) => t.readyState === "live");
  }

  function watchTrackEnd(onEnded) {
    if (!tabStream) return;
    for (const track of tabStream.getTracks()) {
      track.addEventListener("ended", () => {
        onEnded(track);
      });
    }
  }

  async function consumeTabStream(streamId) {
    return navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: "tab",
          chromeMediaSourceId: streamId,
        },
      },
      video: {
        mandatory: {
          chromeMediaSource: "tab",
          chromeMediaSourceId: streamId,
          maxFrameRate: 30,
        },
      },
    });
  }

  function releaseStream() {
    if (tabStream) {
      for (const track of tabStream.getTracks()) {
        try {
          track.stop();
        } catch {}
      }
      tabStream = null;
    }
  }

  function clearTimers() {
    if (stopTimer) {
      clearTimeout(stopTimer);
      stopTimer = null;
    }
    if (progressTimer) {
      clearInterval(progressTimer);
      progressTimer = null;
    }
  }

  function isRecording() {
    return mediaRecorder && mediaRecorder.state !== "inactive";
  }

  function downloadRecording(recorderMimeType) {
    if (recordedChunks.length === 0) return false;

    const blob = new Blob(recordedChunks, {
      type: recorderMimeType || "video/webm",
    });

    recordedChunks = [];

    if (!blob || blob.size === 0) return false;

    const filename = `poptool_sekme_${formatTime(plannedStartTime).replace(":", "-")}-${formatTime(plannedEndTime).replace(":", "-")}.webm`;

    try {
      const blobUrl = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();

      setTimeout(() => {
        try {
          URL.revokeObjectURL(blobUrl);
          a.remove();
        } catch (e) {}

        chrome.runtime.sendMessage({
          action: "FALLBACK_RECORDING_COMPLETE",
          sourceTabId: sourceTabId,
        });
      }, 10000);

      return true;
    } catch (e) {
      console.error("[PopTool offscreen] İndirme tetiklenemedi:", e);
      return false;
    }
  }

  async function finishRecording() {
    clearTimers();
    releaseStream();
    isRecordingActive = false;
    lastProgress = { percent: 0, text: "" };

    const fileSize = recordedChunks.reduce((acc, c) => acc + c.size, 0);
    const hasData = recordedChunks.length > 0 && fileSize > 0;
    const recorderMimeType = mediaRecorder?.mimeType;
    mediaRecorder = null;

    if (!hasData) {
      recordedChunks = [];
      sendToPopup("recordingError", { error: "Kayıt başarısız - boş dosya oluştu" });
      return;
    }

    let downloadOk = false;
    try {
      downloadOk = await downloadRecording(recorderMimeType);
    } catch (e) {
      console.error("[PopTool offscreen] İndirme akışı hatası:", e);
    }

    recordedChunks = [];

    if (!downloadOk) {
      sendToPopup("recordingError", {
        error: "Dosya oluşturuldu ancak indirme başlatılamadı. Tekrar deneyin.",
      });
      return;
    }
  }

  async function beginTabCapture(msg) {
    try {
      if (isRecording()) {
        sendToPopup("recordingError", { error: "Zaten devam eden bir sekme kaydı var." });
        return;
      }

      if (typeof MediaRecorder === "undefined") {
        throw new Error("Bu ortamda MediaRecorder desteklenmiyor.");
      }

      recordedChunks = [];
      plannedStartTime = Number(msg.startTime) || 0;
      plannedEndTime = Number(msg.endTime) || 0;
      sourceTabId = Number.isInteger(msg.sourceTabId) ? msg.sourceTabId : null;

      const durationMs = Math.max(
        500,
        Math.round((plannedEndTime - plannedStartTime) * 1000)
      );

      try {
        tabStream = await consumeTabStream(msg.streamId);
      } catch (e) {
        throw new Error("Sekme akışı alınamadı: " + (e?.message || e));
      }

      try {
        verifyStreamTracks(tabStream);
      } catch (e) {
        releaseStream();
        throw e;
      }

      watchTrackEnd((track) => {
        if (mediaRecorder && mediaRecorder.state !== "inactive") {
          sendToPopup("recordingProgress", {
            percent: 100,
            text: `${track.kind === "audio" ? "Ses" : "Görüntü"} akışı kesildi, kayıt sonlandırılıyor...`,
          });
          stopTabCapture();
        }
      });

      const mimeType = getSupportedMimeType();
      if (!mimeType) {
        throw new Error("Tarayıcı kayıt formatını desteklemiyor.");
      }

      mediaRecorder = new MediaRecorder(tabStream, { mimeType });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunks.push(event.data);
        }
      };

      mediaRecorder.onerror = (event) => {
        isRecordingActive = false;
        lastProgress = { percent: 0, text: "" };
        sendToPopup("recordingError", {
          error: "Kayıt hatası: " + (event.error?.message || "Bilinmeyen hata"),
        });
        try {
          mediaRecorder?.stop();
        } catch {}
      };

      mediaRecorder.onstop = () => {
        setTimeout(() => {
          finishRecording();
        }, 100);
      };

      mediaRecorder.start(250);
      isRecordingActive = true;

      const startedAt = Date.now();

      progressTimer = setInterval(() => {
        if (!areAllTracksLive()) {
          stopTabCapture();
          return;
        }

        const elapsedMs = Date.now() - startedAt;
        const percent = Math.min((elapsedMs / durationMs) * 100, 100);
        const currentSecond = plannedStartTime + elapsedMs / 1000;

        lastProgress = {
          percent,
          text: `${formatTime(Math.min(currentSecond, plannedEndTime))} / ${formatTime(plannedEndTime)}`,
        };

        sendToPopup("recordingProgress", {
          percent: lastProgress.percent,
          text: lastProgress.text,
        });
      }, 250);

      stopTimer = setTimeout(() => {
        stopTabCapture();
      }, durationMs);
    } catch (e) {
      console.error("[PopTool offscreen] Kayıt başlatılamadı:", e);
      clearTimers();
      releaseStream();
      recordedChunks = [];
      mediaRecorder = null;
      isRecordingActive = false;
      lastProgress = { percent: 0, text: "" };
      sendToPopup("recordingError", {
        error: "Sekme kaydı başlatılamadı: " + (e?.message || "bilinmeyen hata"),
      });
    }
  }

  function stopTabCapture() {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      try {
        mediaRecorder.requestData();
        mediaRecorder.stop();
      } catch (e) {
        console.error("[PopTool offscreen] stop hatası:", e);
      }
    }
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    try {
      const action = msg?.action;

      if (action === "offscreenPing") {
        sendResponse({ ready: true });
      } else if (action === "getOffscreenRecordingStatus") {
        sendResponse({
          isRecording: isRecordingActive,
          percent: lastProgress.percent,
          text: lastProgress.text,
        });
      } else if (action === "beginTabCapture") {
        sendResponse({ received: true });
        beginTabCapture(msg);
      } else if (action === "stopTabCapture") {
        sendResponse({ ok: true });
        stopTabCapture();
      }
    } catch (e) {
      console.error("[PopTool offscreen] mesaj hatası:", e);
    }
    return false;
  });
})();
