(() => {
  "use strict";

  if (window.__POPTOOL_INJECTED__) return;
  window.__POPTOOL_INJECTED__ = true;

  let mediaRecorder = null;
  let recordedChunks = [];
  let recordingStartTime = 0;
  let recordingEndTime = 0;
  let progressInterval = null;
  let isRecording = false;
  let lastProgress = { percent: 0, text: "" };

  function resetRecordingState() {
    isRecording = false;
    lastProgress = { percent: 0, text: "" };
  }

  function safeString(value) {
    return typeof value === "string" ? value : "";
  }

  function getCurrentHostname() {
    try {
      return safeString(window?.location?.hostname);
    } catch {
      return "";
    }
  }

  function parseUrlSafe(rawUrl) {
    const url = safeString(rawUrl);
    if (!url) return null;
    try {
      return new URL(url);
    } catch {
      return null;
    }
  }

  function decodeFileName(pathname) {
    try {
      const name = safeString(pathname?.split("/")?.pop());
      return name ? decodeURIComponent(name) : "";
    } catch {
      return "";
    }
  }

  function findVideo() {
    let directVideo = null;
    try {
      directVideo = document.querySelector("video");
    } catch {}
    if (directVideo) {
      return { type: "element", video: directVideo };
    }
    return null;
  }

  function getVideoElement() {
    const target = findVideo();
    return target && target.type === "element" ? target.video : null;
  }

  function getPageTitle() {
    try {
      const title = safeString(document.title).trim();
      if (title) return title;

      const video = getVideoElement();
      const src = video
        ? safeString(video.currentSrc) || safeString(video.src)
        : "";
      if (src) {
        const parsed = parseUrlSafe(src);
        const name = parsed ? decodeFileName(parsed.pathname) : "";
        if (name) return name;
      }
      return getCurrentHostname() || "Bilinmeyen Video";
    } catch {
      return "Bilinmeyen Video";
    }
  }

  function getVideoInfo() {
    try {
      const target = findVideo();
      if (!target) {
        return { found: false };
      }

      if (target.type === "frame") {
        return {
          found: true,
          type: "frame",
          isFrame: true,
          title: getPageTitle(),
          duration: 0,
          currentTime: 0,
          paused: true,
          src: safeString(target?.iframe?.src),
          isDRM: false,
          readyState: 4,
        };
      }

      const video = target.video;
      const src = safeString(video?.currentSrc) || safeString(video?.src);
      const srcLower = src.toLowerCase();
      const isDRM =
        video?.mediaKeys != null ||
        srcLower.includes("drm") ||
        srcLower.includes("license");

      return {
        found: true,
        type: "element",
        title: getPageTitle(),
        duration: video?.duration || 0,
        currentTime: video?.currentTime || 0,
        paused: Boolean(video?.paused),
        src: src,
        isDRM: isDRM,
        readyState: video?.readyState ?? 0,
      };
    } catch (e) {
      console.error("[PopTool] Video bilgisi alınırken hata:", e);
      return { found: false };
    }
  }

  function getSupportedMimeType(hasAudio) {
    try {
      if (typeof MediaRecorder === "undefined") return "";
      const types = hasAudio
        ? [
            "video/webm;codecs=vp8,opus",
            "video/webm;codecs=vp9,opus",
            "video/webm;codecs=vp9",
            "video/webm;codecs=vp8",
            "video/webm",
            "video/mp4",
          ]
        : [
            "video/webm;codecs=vp9",
            "video/webm;codecs=vp8",
            "video/webm",
            "video/mp4",
          ];
      for (const type of types) {
        try {
          if (MediaRecorder.isTypeSupported(type)) {
            return type;
          }
        } catch {}
      }
    } catch {}
    return "";
  }

  function delegateToTabCapture(infoText) {
    cleanup();
    if (infoText) {
      sendToPopup("recordingProgress", { percent: 0, text: infoText });
    }
    try {
      sendToBackground({
        action: "startTabRecording",
        startTime: recordingStartTime,
        endTime: recordingEndTime,
      });
    } catch (e) {
      resetRecordingState();
      sendToPopup("recordingError", {
        error: "Sekme kaydı başlatılamadı: " + (e?.message || "bilinmeyen hata"),
      });
    }
  }

  function startRecording(startTime, endTime) {
    if (isRecording) {
      console.warn("Kayıt zaten devam ediyor.");
      return { success: false, error: "ALREADY_RECORDING" };
    }
    isRecording = true;

    const target = findVideo();

    if (!target) {
      resetRecordingState();
      sendToPopup("recordingError", { error: "Video elementi bulunamadı. Sayfayı yenileyip tekrar deneyin." });
      return;
    }

    if (target.type === "frame") {
      sendToBackground({
        action: "startTabRecording",
        startTime,
        endTime,
      });
      return;
    }

    const video = target.video;

    recordingStartTime = startTime;
    recordingEndTime = endTime;

    const info = getVideoInfo();
    if (info.isDRM) {
      resetRecordingState();
      sendToPopup("recordingError", {
        error: "DRM korumalı video kaydedilemez (Netflix, Disney+ vb.)",
      });
      return;
    }

    if (video.readyState < 2) {
      resetRecordingState();
      sendToPopup("recordingError", {
        error: "Video henüz yüklenmedi. Biraz bekleyip tekrar deneyin.",
      });
      return;
    }

    let captureStream;
    try {
      if (typeof video.captureStream === "function") {
        captureStream = video.captureStream.call(video);
      } else if (typeof video.mozCaptureStream === "function") {
        captureStream = video.mozCaptureStream.call(video);
      } else {
        delegateToTabCapture(
          "Video captureStream desteklemiyor, sekme kaydına geçiliyor..."
        );
        return;
      }
    } catch (e) {
      console.error("[PopTool] captureStream hatası:", e);
      delegateToTabCapture(
        "Video akışı yakalanamadı (" +
          (e?.message || "bilinmeyen hata") +
          "), sekme kaydına geçiliyor..."
      );
      return;
    }

    if (!captureStream || captureStream.getVideoTracks().length === 0) {
      delegateToTabCapture(
        "Video akışında görüntü bulunamadı, sekme kaydına geçiliyor..."
      );
      return;
    }

    if (typeof window.MediaRecorder === "undefined") {
      resetRecordingState();
      sendToPopup("recordingError", {
        error: "Kayıt motoru (MediaRecorder) bu tarayıcıda desteklenmiyor.",
      });
      return;
    }

    const hasAudio = captureStream.getAudioTracks().length > 0;
    const mimeType = getSupportedMimeType(hasAudio);
    if (!mimeType) {
      resetRecordingState();
      sendToPopup("recordingError", {
        error: "Tarayıcınız video kayıt formatını desteklemiyor.",
      });
      return;
    }

    if (!hasAudio) {
      for (const t of captureStream.getAudioTracks()) {
        captureStream.removeTrack(t);
      }
    }

    recordedChunks = [];

    try {
      mediaRecorder = new MediaRecorder(captureStream, { mimeType });
    } catch (e) {
      resetRecordingState();
      sendToPopup("recordingError", {
        error: "MediaRecorder başlatılamadı: " + e.message,
      });
      return;
    }

    mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = () => {
      setTimeout(() => {
        const fileSize = recordedChunks.reduce((acc, c) => acc + c.size, 0);
        if (recordedChunks.length === 0 || fileSize === 0) {
          delegateToTabCapture(
            "Doğrudan kayıt boş veri üretti, sekme kaydına geçiliyor..."
          );
          return;
        }
        downloadRecording(fileSize);
      }, 100);
    };

    mediaRecorder.onerror = (event) => {
      resetRecordingState();
      sendToPopup("recordingError", {
        error: "Kayıt hatası: " + (event.error?.message || "Bilinmeyen hata"),
      });
      cleanup();
    };

    try {
      mediaRecorder.start(100);
    } catch (e) {
      resetRecordingState();
      sendToPopup("recordingError", {
        error: "Kayıt başlatılamadı: " + e.message,
      });
      cleanup();
      return;
    }

    video.currentTime = startTime;

    const onEnded = () => {
      stopRecording();
    };
    video.addEventListener("ended", onEnded, { once: true });
    video._poptoolOnEnded = onEnded;

    const playPromise = video.play();
    if (playPromise) {
      playPromise.catch(() => {
        resetRecordingState();
        sendToPopup("recordingError", {
          error: "Video oynatılamadı. Sayfadaki oynatma iznini kontrol edin.",
        });
        cleanup();
      });
    }

    progressInterval = setInterval(() => {
      if (!video || video.paused) return;

      const currentVideoTime = video.currentTime;
      const totalDuration = endTime - startTime;
      const elapsed = currentVideoTime - startTime;
      const percent = Math.min((elapsed / totalDuration) * 100, 100);
      lastProgress = {
        percent: percent,
        text: `${formatTime(currentVideoTime)} / ${formatTime(endTime)}`,
      };

      sendToPopup("recordingProgress", {
        percent: lastProgress.percent,
        text: lastProgress.text,
      });

      if (currentVideoTime >= endTime) {
        stopRecording();
      }
    }, 250);
  }

  function stopRecording() {
    if (progressInterval) {
      clearInterval(progressInterval);
      progressInterval = null;
    }

    if (mediaRecorder && mediaRecorder.state === "recording") {
      try {
        mediaRecorder.requestData();
        mediaRecorder.stop();
      } catch (e) {
        console.error("[PopTool] MediaRecorder stop error:", e);
      }
    }

    const video = getVideoElement();
    if (video) {
      video.pause();
    }
  }

  async function downloadRecording(fileSize) {
    if (recordedChunks.length === 0) {
      resetRecordingState();
      sendToPopup("recordingError", {
        error: "Kayıt başarısız - boş dosya oluştu",
      });
      cleanup();
      return;
    }

    if (!fileSize) {
      fileSize = recordedChunks.reduce((acc, c) => acc + c.size, 0);
    }

    if (!fileSize) {
      resetRecordingState();
      sendToPopup("recordingError", {
        error: "Kayıt başarısız - boş dosya oluştu",
      });
      cleanup();
      return;
    }

    const blob = new Blob(recordedChunks, { type: "video/webm" });

    recordedChunks = [];

    const title = getPageTitle() || "video";
    const safeTitle = title.replace(/[^a-zA-Z0-9-_ ]/g, "").substring(0, 50);
    const filename = `poptool_${safeTitle}_${formatTime(recordingStartTime).replace(":", "-")}-${formatTime(recordingEndTime).replace(":", "-")}.webm`;

    sendToPopup("recordingProgress", {
      percent: 100,
      text: "Preparing download...",
    });

    try {
      const blobUrl = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
    } catch (e) {
      console.error("[PopTool] İndirme tetiklenemedi:", e);
      resetRecordingState();
      sendToPopup("recordingError", {
        error: "İndirme başlatılamadı: " + (e?.message || "bilinmeyen hata"),
      });
      cleanup();
      return;
    }

    resetRecordingState();
    sendToPopup("downloadComplete", {
      message: "Clip downloaded to your computer.",
    });

    cleanup();
  }

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  function sendToPopup(action, data) {
    try {
      const result = chrome?.runtime?.sendMessage({ action, ...data });
      if (result && typeof result.catch === "function") {
        result.catch(() => {});
      }
    } catch {}
  }

  function sendToBackground(payload) {
    try {
      const result = chrome?.runtime?.sendMessage(payload);
      if (result && typeof result.catch === "function") {
        result.catch(() => {});
      }
    } catch {}
  }

  function cleanup() {
    if (progressInterval) {
      clearInterval(progressInterval);
      progressInterval = null;
    }
    const video = getVideoElement();
    if (video && video._poptoolOnEnded) {
      video.removeEventListener("ended", video._poptoolOnEnded);
      video._poptoolOnEnded = null;
    }
    mediaRecorder = null;
    recordedChunks = [];
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    try {
      const action = msg?.action;
      if (action === "getVideoInfo") {
        sendResponse({ success: true, ...getVideoInfo() });
      } else if (action === "startRecording") {
        const target = findVideo();
        if (target && target.type === "frame") {
          sendResponse({ ok: false, useTabCapture: true });
        } else {
          sendResponse({ ok: true });
          startRecording(msg.startTime, msg.endTime);
        }
      } else if (action === "stopRecording") {
        sendResponse({ ok: true });
        stopRecording();
      } else if (action === "getRecordingStatus") {
        sendResponse({
          isRecording,
          percent: lastProgress.percent,
          text: lastProgress.text,
        });
      } else if (action === "RECORDING_FINISHED") {
        resetRecordingState();
        sendResponse({ success: true });
      }
    } catch (e) {
      console.error("[PopTool] Mesaj işlenirken beklenmeyen hata:", e);
      try {
        sendResponse({
          success: false,
          found: false,
          error:
            "Content script beklenmeyen bir hatayla karşılaştı: " +
            (e?.message || "bilinmeyen hata"),
        });
      } catch {}
    }
    return false;
  });
})();
