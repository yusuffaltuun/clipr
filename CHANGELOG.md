# CHANGELOG

## [1.18.0] - 2026-08-30

### Added
- UI-1: Selection Timeline - Range bar artık yalnızca klip süresini değil,
  seçilen aralığın videodaki konumunu sol offset (left) + genişlik (width)
  olarak konumsal biçimde gösterecek şekilde güncellendi.

### popup/popup.html
- Timeline, solunda `#timelineStart` (0:00) ve sağında `#timelineEnd`
  (toplam video süresi) etiketlerini içeren `#range-timeline` kapsayıcısına
  alındı.

### popup/popup.css
- `.range-bar` `position: relative`, `.range-fill` `position: absolute`
  olacak şekilde güncellendi (left offset + width konumlandırma için).
- `.range-timeline` flex yerleşimi ve `.range-label` stilleri eklendi.

### popup/popup.js
- `updateRangeBar()`:
  - `start`/`end` değerleri `0..duration` aralığına clamp edilir.
  - `leftPercent = (start / duration) * 100` ve
    `widthPercent = ((end - start) / duration) * 100` hesaplanır.
  - `style.left` ve `style.width` uygulanır.
  - `#timelineStart` 0:00, `#timelineEnd` toplam süre olarak güncellenir.
  - "Selected range" metni ve `#clipDuration` korunur.
- `startTime`/`endTime` inputlarına `change` dinleyicileri eklendi
  (mevcut `input` dinleyicilerine ek olarak); "Set current time" ve quick
  action'lar timeline render'ını anında tetikler.

## [1.17.0] - 2026-08-30

### Added
- UX-2: Success Feedback - kayıt tamamlandığında kullanıcıyı bloke etmeden
  doğrudan 2 saniyelik "Download complete ✓" bildirimi, ardından "Ready"
  durumu; form zaman değerleri korunur.
- UX-3: Conditional Empty State & Smart Retry - desteklenmeyen sayfalarda
  anında, video henüz yüklenmemişse koşullu kısa retry sonrası temiz Empty
  State gösterimi.

### popup/popup.html
- Form içeriği `#form-container` kapsayıcısına alındı.
- Formun yanına başlangıçta gizli `#empty-state` kapsayıcısı eklendi
  ("No video detected" / "Open a supported video to start clipping.").

### popup/popup.js
- **UX-2 (Success Feedback):** `downloadComplete` mesajında `setRecordingState(false)`
  ile form anında tıklanabilir hale gelir, durum alanında "Download complete ✓"
  gösterilir, 2s sonra "Ready" durumuna döner; start/end input değerleri korunur.
  Eski `markDownloaded`/`downloadedResetTimer`/"downloaded" ikon ve class
  kaldırıldı.
- **UX-3 (Empty State & Smart Retry):** `findVideo` artık yanıt türüne göre
  davranır:
  1. Bağlantı hatası/desteklenmeyen sayfa: `#form-container` gizlenir,
     `#empty-state` gösterilir, retry yapılmaz.
  2. Content script bağlandı ama video yok/hazır değil: `#empty-state`
     gösterilir, 500ms arayla max 3 kez yeniden sorgulanır; bulunursa form
     gösterilir, bulunamazsa Empty State'te kalınır.
  3. Video hazır: Empty State gizlenir, form doldurulur.
- Kullanılmayan `renderNotFound`/`renderRestricted` fonksiyonları kaldırıldı.
- `showMessage` `ready` tipi desteği eklendi.

### popup/popup.css
- `.message.ready` ve `.empty-state` stilleri eklendi.

## [1.16.0] - 2026-08-30

### Added
- UX-1: Popup yeniden açıldığında canlı ilerleme durumunun geri yüklenmesi
  (Progress Recovery). Model: Service Worker Router + Context-Owner Snapshot.

### content/content.js
- `lastProgress = { percent: 0, text: "" }` state'i eklendi; normal kayıt
  döngüsünde `recordingProgress` gönderilirken senkronize edilir.
- `resetRecordingState()` içinde `lastProgress` sıfırlanır.
- `getRecordingStatus` artık `{ isRecording, percent, text }` döner.

### offscreen/offscreen.js
- Fallback kaydında hesaplanan ilerleme `lastProgress` içinde saklanır.
- Offscreen kendi gerçek kayıt durumu `isRecordingActive` booleanı ile izlenir
  (kayıt başla/bitir/hata/temizlik yollarında senkronize edilir).
- Yeni `getOffscreenRecordingStatus` mesajı `{ isRecording, percent, text }`
  döner. Kayıt tamamlandığında/resetlendiğinde `lastProgress` temizlenir.

### background/service-worker.js
- `activeFallback = { tabId: null, isActive: false }` state'i eklendi.
- Fallback başladığında ayarlanır, `FALLBACK_RECORDING_COMPLETE`'te sıfırlanır.
- Yeni `getRecordingStatus` yönlendiricisi (Router, async için `return true`):
  - Aktif fallback sekmesi eşleşirse istek `getOffscreenRecordingStatus` ile
    Offscreen'e iletilir.
  - Değilse `chrome.tabs.sendMessage(tabId, { action: "getRecordingStatus" })`
    ile content'e iletilir; sekme bulunamazsa boş durum döner.

### popup/popup.js
- `syncRecordingState` artık Service Worker'a `{ action: "getRecordingStatus",
  tabId }` gönderir; `isRecording: true` ise `setRecordingState(true)` ve
  `setProgress(percent, text)` ile UI anında geri yüklenir.

## [1.15.0] - 2026-08-30

### Added
- Eşzamanlı kayıt kilidi (concurrent recording lock) ve fallback state
  senkronizasyonu (Senaryo 1): `isRecording` artık content script'teki
  tek kaynak (single source of truth).

### content/content.js
- `let isRecording = false;` en üst scope'ta tanımlandı.
- Dar kapsamlı `resetRecordingState()` eklendi (yalnızca kilidi sıfırlar).
- `startRecording` girişinde kilit, ilk `await`'ten önce alınır;
  ikinci çağrı `ALREADY_RECORDING` döner.
- Normal kayıt yolunda `<a download>` tetiklendikten sonra ve yakalanan
  fatal hatalarda (video yok, DRM, readyState < 2, MediaRecorder yok/
  desteklenmiyor, constructor/start hataları, play hatası, boş dosya,
  indirme tetikleme hatası, `mediaRecorder.onerror`) kilit sıfırlanır.
- Fallback yolunda (`delegateToTabCapture` ve `target.type === "frame"`
  delegasyonu) kilit korunur; delegasyon başlatılamazsa
  `resetRecordingState()` çağrılır.
- Yeni mesaj dalları: `getRecordingStatus` (`sendResponse({ isRecording })`)
  ve `RECORDING_FINISHED` (`resetRecordingState(); sendResponse({ success: true })`).

### background/service-worker.js & offscreen/offscreen.js
- Fallback isteği geldiğinde `sender.tab.id` → `sourceTabId` olarak yakalanıp
  `beginTabCapture` parametrelerine eklenir.
- `offscreen.js` 10s temizlik sonrası `FALLBACK_RECORDING_COMPLETE` gönderirken
  `sourceTabId`'yi payload'a ekler.
- `service-worker.js` `FALLBACK_RECORDING_COMPLETE` aldığında Offscreen'i
  kapatır ve kesin hedef sekmeye `RECORDING_FINISHED` gönderir.

### popup/popup.js
- Popup açılışında (`init`) aktif sekmeye `getRecordingStatus` gönderilir;
  `isRecording: true` ise `setRecordingState(true)` ile UI kayıt moduna alınır.

## [1.14.0] - 2026-08-28

### Removed
- Cleanup of no-longer-used permissions, dead helpers, and orphaned
  message branches left over from the Base64/download-pipeline refactors.

### manifest.json
- Removed unused `"downloads"` permission (no active `chrome.downloads`
  usage remains anywhere).

### content/content.js
- Removed unused `getCurrentHref()` helper (no callers).

### popup/popup.js
- Removed unused `formatTime()` alias (no callers).
- Removed orphaned `downloadFailed` message branch (no active sender
  remains after the download logic moved out of the service worker).

### offscreen/offscreen.js
- Removed orphaned `recordingComplete` send (no active receiver; the
  service worker already dropped offscreen-sourced `recordingComplete`,
  and the popup no longer handles that action).

### background/service-worker.js
- Removed `recordingComplete` from the relay action list (no active
  non-offscreen sender produces it anymore).

### Verified
- Message action contract is now fully paired between senders and
  receivers:
  - `getVideoInfo`, `startRecording`, `stopRecording` (popup <-> content)
  - `startTabRecording`, `stopTabRecording` (popup <-> service worker)
  - `offscreenPing`, `beginTabCapture`, `stopTabCapture`
    (service worker <-> offscreen)
  - `FALLBACK_RECORDING_COMPLETE` (offscreen -> service worker)
  - `recordingProgress`, `recordingError`, `downloadComplete`
    (content/offscreen -> popup)

### Untouched (per protection list)
- `captureStream`/`mozCaptureStream` logic.
- `MediaRecorder` creation, listeners and `recordedChunks` collection.
- `tabCapture` stream capture and Stream ID generation.
- Offscreen document open, `<a download>` and 10s lifecycle sync
  (`FALLBACK_RECORDING_COMPLETE`).
- `content.js` 3 fallback/fatal error rules.

## [1.13.0] - 2026-08-28

### Changed
- Removed the large Base64 data transfer between `offscreen.js` and
  `service-worker.js`. The fallback recording now downloads locally from
  the offscreen DOM via a `blob:` URL instead of shipping the data to the
  service worker.

### offscreen/offscreen.js
- Removed `blobToDataUrl()` (FileReader -> Base64) and the
  `saveRecording` data-transfer logic.
- `downloadRecording()` now builds a `blob:` URL via
  `URL.createObjectURL(blob)`, injects an invisible `<a download>` and
  clicks it to trigger the download locally.
- Cleanup is synchronized: after 10s the URL is revoked and the `<a>`
  removed, then `FALLBACK_RECORDING_COMPLETE` is sent to the service
  worker so the offscreen document can be closed.
- Removed now-unused `domFallbackDownload()` and `sendToBackground()`.

### background/service-worker.js
- Removed Base64 video data handling and `chrome.downloads.download`
  logic (`beginDownload`, `sanitizeFilename`, `reportDownloadFailure`,
  `respondSafe`, `activeDownloads`, `chrome.downloads.onChanged`,
  `trackDownload`, and the `saveRecording` handler).
- Added `FALLBACK_RECORDING_COMPLETE` handler that calls
  `chrome.offscreen.closeDocument()`.

Note: `tabCapture` start, stream ID generation, and recording timing
logic were left untouched. `content/content.js` and `popup/` untouched.

## [1.12.0] - 2026-08-28

### Changed
- Simplified stream-capture and error handling in `content/content.js`
  into three clear rules.

### content/content.js
- Rule 1 (stream unavailable -> fallback): missing `captureStream` /
  `mozCaptureStream`, a thrown exception from `captureStream()`, or a
  stream with no video tracks now calls `delegateToTabCapture()` instead
  of reporting a fatal error.
- Rule 2 (MediaRecorder/codec fails -> fatal error): undefined
  `window.MediaRecorder`, no supported MIME type, and a throwing
  `new MediaRecorder()` all report a clear `recordingError` without
  falling back.
- Rule 3 (empty result -> fallback): kept the existing
  `delegateToTabCapture()` call when `recordedChunks.length === 0`.
- `recordingStartTime`/`recordingEndTime` are set at the top of
  `startRecording()` so fallback has correct values.
- Removed now-unused `checkCaptureSupport()` helper.

Note: `service-worker.js`, `popup/`, and `offscreen/` left untouched.

## [1.11.0] - 2026-08-28

### Changed
- Normal recording path refactor: large video data is no longer carried
  as Base64 through `content -> popup -> service-worker`.

### content/content.js
- On `MediaRecorder.onstop`, the resulting `Blob` is no longer converted
  to Base64 or forwarded to the popup/service worker.
- `downloadRecording()` now creates a local `blob:` URL via
  `URL.createObjectURL(blob)`, injects an invisible `<a>` element with
  `href = blobUrl` and `download = filename`, and triggers download via
  `a.click()`.
- Memory cleanup: `setTimeout(() => URL.revokeObjectURL(blobUrl), 10000)`
  revokes the URL after a safe delay.
- Removed now-unused `blobToDataUrl()` and `saveViaServiceWorker()`
  helpers.
- Only lightweight status messages (`recordingProgress`,
  `downloadComplete`) are sent to the popup.

### popup/popup.js
- Removed Base64 data receiving/forwarding logic.
- Removed `recordingComplete` handler and `triggerDownload()` function.
- Popup now only sends the start command to `content.js` and no longer
  participates in carrying recording data.

Note: `service-worker.js` and `offscreen/offscreen.js` were intentionally
left untouched (tabCapture fallback path unchanged).

## [1.10.0] - 2026-08-28

### Added
- Edge-case protections before recording.

### popup/popup.js
- `startTime >= endTime` now blocks recording with "Start time must be
  before end time" warning.
- Range shorter than 1 second now blocked with "Minimum clip duration is
  1 second" warning.
- `Infinity` (live) or `0` duration videos blocked with "Live streams /
  invalid videos cannot be clipped" warning.

### content/content.js
- Added `ended` event listener: if the video ends before the expected end
  time, recording stops safely and downloads the segment captured so far.
- Muted videos / videos without an audio track no longer crash
  MediaRecorder: audio tracks are stripped and recording continues with a
  video-only stream (video-only mime types preferred).

## [1.9.0] - 2026-08-26

### Changed
- Phase 27: UI polish — branding, MM:SS inputs, color refinement, status
  bar removal.

### popup/popup.html
- Brand name changed from "PopTool" to "Clipr"
- SVG triangle logo replaced with `<img>` tag using `icons/icon32.png`
- Status bar element (`#status`) removed entirely — video info card now
  shows directly when a video is found
- Time input fields changed from `type="number"` to `type="text"` for
  native MM:SS display
- Removed redundant preview `<span>` elements below time inputs
- Default input values changed from `0` to `0:00`
- Record circle SVG fill updated to terracotta (#e15b64)
- Page title updated to "Clipr"

### popup/popup.css
- Accent color palette shifted from sharp rose (#f43f5e) to warm
  terracotta/rose (#e15b64, #d9465a)
  - `--accent`, `--accent-hover`, `--accent-gradient`, `--border-focus`
    all updated
- Status bar styles (`.status-bar`, `.status-icon`, `.status-text`)
  removed
- `.time-preview` styles removed
- `.header-logo` updated for `<img>` element (border-radius: 4px)

### popup/popup.js
- Removed all `setStatus()` calls and `STATUS_SVGS` map — no status bar
  to update
- Removed `els.status`, `els.statusIcon`, `els.statusText` from element
  registry
- Removed `els.startTimePreview`, `els.endTimePreview` and
  `updatePreviews()` function
- `parseTimeInput(str)`: new parser accepting "MM:SS", "HH:MM:SS", or
  raw seconds (e.g. "90" or "1:30")
- `getInputSeconds(input)`: reads input value and parses to seconds
- `setInputValue(input, seconds)`: formats seconds as MM:SS and sets
  input value
- All time read/write operations use `getInputSeconds`/`setInputValue`
  instead of `parseFloat`/`.toFixed`
- `RECORD_ICONS.idle` fill color updated to #e15b64
- Error messages shown via `showMessage()` instead of status bar
- DRM and restricted page errors displayed as message banners

## [1.8.0] - 2026-08-26

### Changed
- Phase 26: Professional UI redesign with Linear/Raycast-style dark theme
  and full English localization.

### popup/popup.html
- Complete restructure with semantic layout (header, cards, controls)
- All UI text converted from Turkish to English
- Emojis replaced with inline SVG icons (crosshair, play, check, lock, etc.)
- New components: platform badge (header), time preview labels under inputs,
  quick clip chips ("Last 5s", "Last 15s", "Last 30s", "Last 1m")
- Video info card redesigned: horizontal stat layout (Duration / Current)
- Google Fonts Inter import added for consistent typography

### popup/popup.css
- Background: deep charcoal (#09090b) with card surfaces (#18181b)
- Borders: subtle zinc (#27272a), rounded-lg (8px)
- Accent: rose gradient (linear-gradient(135deg, #f43f5e, #e11d48))
- Font stack: Inter, -apple-system, sans-serif
- All Turkish class names/labels replaced with English equivalents
- Number input spinner arrows removed for cleaner time inputs
- Quick clip chip buttons with hover/active states
- Platform badge: pill-shaped container in header
- Tabular-numeric font variant for all time displays
- CSS custom properties (variables) for consistent theming

### popup/popup.js
- `formatTimestamp(seconds)`: robust MM:SS / HH:MM:SS formatter replacing
  basic `formatTime` (kept as alias for backward compatibility)
- `detectPlatform(hostname)`: returns platform name ("YouTube", "Instagram",
  "X", "TikTok", etc.) from tab URL for header badge
- `setStatus(icon, text)` + `STATUS_SVGS` map: replaces emoji-based status
  icons with inline SVG content via innerHTML
- Quick clip buttons: auto-fill start/end from current time minus chip value
- `updatePreviews()`: live MM:SS preview labels below time inputs
- All Turkish status/error/message strings converted to English:
  - "Video aranıyor..." -> "Searching for video..."
  - "Kaydet" -> "Clip & Download"
  - "Durdur" -> "Recording..."
  - "İndirildi!" -> "Downloaded!"
  - "Video bulunamadı" -> "No playable video found"
  - DRM, validation, and download messages all in English
- Record icon SVGs update dynamically (circle = idle, square = recording,
  checkmark = downloaded)

## [1.7.0] - 2026-08-26

### Changed
- Asama 25: Uretim temizligi (Production Cleanup) - Chrome Web Store
  yayinina hazirlik.

### manifest.json
- `host_permissions`: `<all_urls>` kaldirildi; yalnizca desteklenen
  platformlar eklendi: `youtube.com`, `x.com`, `twitter.com`,
  `instagram.com`
- `content_scripts.matches`: ayni sekilde sinirlandirildi
- Surum 1.7.0'a yukseltildi

### Log Temizligi (tum dosyalar)
- Tum gelistirme amacli `console.log`, `console.warn`, `console.info`
  cagrilari kaldirildi
- Yalnizca kritik `try/catch` bloklarindaki `console.error`
  cagrilari birakildi

### popup/popup.js
- injectContentScript basari logu kaldirildi

### content/content.js
- Basari/load logu kaldirildi
- findVideo iframe taramasi ve `PLAYER_KEYWORDS` kaldirildi (yt,
  x/twitter, instagram'da iframe oynatici yok; dogrudan `<video>`
  elementi kullanilir)
- `normalizeBlobMimeType` fonksiyonu kaldirildi (kullanilmiyordu)
- delegateToTabCapture, saveViaServiceWorker, downloadRecording
  icindeki warn/log cagrilari kaldirildi

### background/service-worker.js
- onInstall logu, beginDownload logu, download olusturma logu
  kaldirildi

### offscreen/offscreen.js
- `normalizeBlobMimeType` fonksiyonu kaldirildi
- verifyStreamTracks track ayarlama logu ve ses uyari logu
  kaldirildi
- watchTrackEnd, domFallbackDownload, downloadRecording,
  progressTimer icindeki warn/log cagrilari kaldirildi

## [1.6.8] - 2026-08-26

### Fixed
- Asama 24: Data URL icindeki codec virgulu (`vp8,opus`) sorunu
  giderildi. Blob MIME tipi `video/webm;codecs=vp8,opus` olarak
  verildiginde Data URL parser' bozuluyor, dosya `opus;base64,...`
  metni olarak kaydediliyordu. Blob her zaman `{ type: "video/webm" }`
  olarak olusturuluyor; codec parametreleri MediaRecorder'a ozel
  parametreler olarak kalir, Blob/Data URL Zincirine tasimaz.

### offscreen/offscreen.js
- `downloadRecording`: `normalizeBlobMimeType` cagrisi kaldirildi;
  `new Blob(recordedChunks, { type: "video/webm" })` olarak
  sabitlendi
- `saveRecording` mesajindaki `mimeType` degeri `"video/webm"` olarak
  dogrudan atandi

### content/content.js
- `downloadRecording`: `normalizeBlobMimeType` cagrisi kaldirildi;
  `new Blob(recordedChunks, { type: "video/webm" })` olarak
  sabitlendi
- `recordingComplete` ve `saveViaServiceWorker` cagriindaki
  `mimeType` degerleri `"video/webm"` olarak guncellendi

### manifest.json
- Surum 1.6.8'e yukseltildi

## [1.6.7] - 2026-08-26

### Fixed
- Asama 23: EBML header parsing hatasi her iki kayit yolu (content
  script + offscreen) icin kok cozum olarak kalici olarak giderildi.

### content/content.js
- `stopRecording`: `mediaRecorder.state !== "inactive"` kontrolu
  `state === "recording"` olarak degistirildi; once
  `mediaRecorder.requestData()` ile son chunk'in zorla gonderilmesi
  saglandi, ardindan `mediaRecorder.stop()` ile onstop tetiklendi
- `mediaRecorder.onstop`: `downloadRecording` cagrisi
  `setTimeout(() => { ... }, 100)` ile 100ms ertelendi; son
  `ondataavailable` olayinin chunk'i `recordedChunks` dizisine
  eklemesine firsat verildi
- `downloadRecording`: Blob olusturulduktan hemen sonra
  `recordedChunks = []` ile erken temizlik eklendi

### offscreen/offscreen.js
- `stopTabCapture`: `state !== "inactive"` kontrolu
  `state === "recording"` olarak degistirildi; zaten 60ms
  `setTimeout` icerindeydi, artik 100ms'e yukseltildi
- `mediaRecorder.onstop`: `finishRecording` bekleme suresi
  60ms'den 100ms'e yukseltildi (son chunk gecikmesi icin daha
  guvenli)
- `downloadRecording`: blob sonrasi `recordedChunks = []`
  temizligi zaten mevcut; dogrulandi

## [1.6.6] - 2026-08-26

### Fixed
- Asama 22: Kayit sonu EBML header parsing hatasi giderildi. Kayit
  durduruldugunda son chunk (EBML footer/container kapatma verisi)
  `recordedChunks` dizisine eklenmeden once Blob olusturuluyordu;
  bozuk webm dosyalari uretiyordu.

### offscreen/offscreen.js
- `getSupportedMimeType`: Desteklenen format listesi kaldirildi;
  tercih edilen codec (`vp8,opus`) + fallback (`video/webm`) olarak
  sadelestirildi
- `stopTabCapture`: `finishRecording` dogrudan cagirmak yerine once
  `mediaRecorder.requestData()` ile son chunk'in zorla gonderilmesi
  saglandi, ardindan `mediaRecorder.stop()` ile onstop tetiklendi;
  `finishRecording`'e dogrudan erisim tamamen kaldirildi (else dalinda
  dahil)
- `mediaRecorder.onstop`: `finishRecording` 60ms `setTimeout` ile
  ertelendi; `ondataavailable`'in son chunk'i `recordedChunks` dizisine
  eklemesine firsat verildi

## [1.6.5] - 2026-08-26

### Fixed
- Asama 21: Offscreen kayitlarinda indirme basarisiz hatasi giderildi.
  `finishRecording` icindeki `recordedChunks = []` sifirlamasi,
  `downloadRecording` cagrisindan once yapildigi icin indirme fonksiyonu
  bos chunk listesiyle karsilasiyor ve `return false` ile cikiyordu.

### offscreen/offscreen.js
- `finishRecording`: `recordedChunks = []` sifirlamasi
  `await downloadRecording(...)` cagrisindan SONRA tasindi; bos-veri
  durumunda (`!hasData`) temizlik hala erken yapiliyor (download'a gerek yok)
- `downloadRecording`: Blob basariyla olusturulduktan sonra
  `recordedChunks = []` ile erken temizlik eklendi
- `downloadRecording`: Service worker'dan donen ack dogrulamasi
  kesinlestirildi (`ack && typeof ack === "object" && ack.ok === true`)

## [0.1.0] - 2025-07-17

### Added
- Asama 1: Proje iskeleti olusturuldu
- manifest.json: MV3 yapilandirmasi (activeTab, tabs, content_scripts, background)
- Dizin yapisi: popup/, content/, background/, icons/
- AGENTS.md: Proje dokumani ve mimari aciklamasi
- Baslangic ikon dosyalari (icons/)

## [0.2.0] - 2025-07-17

### Added
- Asama 2: Popup UI olusturuldu
- popup.html: Video aralik secici arayuz (baslangic/bitis inputlari, kaydet butonu)
- popup.css: Koyu tema, minimal tasarim (320px genislik, modern gorunum)
- popup.js: Content script ile mesajlasma, zaman araligi kontrolu, durum yonetimi
- Video bilgisi goruntusu (baslik, sure)
- Progress cubugu ve durum mesajlari sistemi
- Kayit durumu animasyonu (pulse efekti)

## [0.3.0] - 2025-07-17

### Added
- Asama 3: Content script olusturuldu
- content.js: Sayfadaki <video> elementini bulma
- Video elementi tespiti (MutationObserver ile SPA uyumluluk)
- getVideoInfo mesaji ile popup'a video bilgisi iletme
- Video baslik, sure, kaynak bilgisi dondurme
- 10sn timeout ile video bekleme mekanizmasi

## [0.4.0] - 2025-07-17

### Added
- Asama 4: MediaRecorder ve indirme entegrasyonu
- video.captureStream() ile MediaStream yakalama
- MediaRecorder ile canli video kaydi (vp9/webm codec)
- Otomatik codec secimi (desteklenen formatlari test eder)
- Kayit sirasinda progress guncelleme (250ms aralikla)
- Bitis saniyesinde otomatik durdurma
- Blob olusturma ve <a download> ile indirme
- Dosya adlandirma: poptool_Baslik_Baslangic-Bitis.webm
- URL.revokeObjectURL ile memory temizligi
- startRecording, stopRecording mesaj handling
- Videoyu baslangic saniyesine sarip oynatma

## [0.5.0] - 2025-07-17

### Added
- Asama 5: Hata yonetimi ve UX iyilestirmeleri
- DRM korumali video tespiti ve uyarisi
- "Mevcut zamana ayarla" butonlari (start/end icin)
- Canli "su anki zaman" gosterimi (popup'da)
- Secili aralik suresi gosterimi
- Minimum 0.5sn aralik kontrolu
- Video readyState kontrolu (yuklenme durumu)
- play() Promise hatasi yakalama
- Dosya boyutu gosterimi (indirme sonrasi)
- Kullanici dostu hata mesajlari (Turkce)
- Input validasyonu (sinir deger kontrolu)
- Content script: captureStream destek kontrolu
- Content script: DRM tespiti (mediaKeys, drm, license)

## [1.0.0] - 2025-07-17

### Added
- Asama 6: Service worker ve final dokumantasyon
- background/service-worker.js: MV3 service worker (install listener, mesaj iletme)
- AGENTS.md: Final guncelleme (ozellikler, kurulum, kullanim talimatlari)
- CHANGELOG.md: Tum asama kayitlari

## [1.1.0] - 2026-08-21

### Changed
- Asama 7: Tum web siteleri destegi (YouTube sinirlamasi kaldirildi)

### manifest.json
- host_permissions: "<all_urls>" olarak genisletildi (YouTube'a ozel izin kaldirildi)
- content_scripts.matches: "<all_urls>" - tum sitelerde calisma
- all_frames: true - iframe icindeki gomulu videolar da tespit edilir
- match_about_blank: true - about:blank frame'lerde de calisma
- Surum 1.1.0'a yukseltildi

### content.js
- Video bulunamazsa getVideoInfo mesaji MutationObserver ile bekleyip async yanit verir (5sn timeout) - SPA/dinamik yuklenen sayfalar icin
- waitForVideo guclendirildi: settled guard (cift resolve onlemi), 500ms polling yedegi, body null koruması
- YouTube'a ozel baslik temizligi kaldirildi; genel sayfa basligi kullaniliyor
- Baslik bosysa video dosya adindan, o da yoksa hostname'den yedek baslik uretimi (getPageTitle)
- Sayfa acilisinda gereksiz observer calismasi kaldirildi (video artık popup sordugunda bekleniyor)

## [1.2.0] - 2026-08-21

### Fixed
- Asama 8: Diger sitelerde "Content script yuklenmedi" hatasi duzeltildi
  (Uzanti yenilendikten sonra acik kalan sekmelerde content script enjekte olmuyordu)

### manifest.json
- permissions: "scripting" eklendi (programatik script enjeksiyonu icin)
- Surum 1.2.0'a yukseltildi

### popup.js
- injectAndSend yardimcisi eklendi: chrome.tabs.sendMessage hata verirse
  (chrome.runtime.lastError / response gelmemesi) chrome.scripting.executeScript
  ile content/content.js aktif sekmeye programatik olarak enjekte edilir
- Enjeksiyon sonrasi getVideoInfo mesaji tekrar gonderilir, video bilgisi cekilir
- allFrames: true ile iframe icindeki videolar da kapsanir
- Video bulunamadi / enjeksiyon basarisiz (chrome:// vb. kisitli sayfalar)
  durumlari ayri Turkce mesajlarla bildirilir
- "Mevcut zamana ayarla" butonlari da ayni fallback mekanizmasini kullanir

### content.js
- Cift enjeksiyon koruması (__POPTOOL_INJECTED__ guard) - programatik enjeksiyon
  sonrasi duplicate listener ile cift kayit olusmasi engellendi

## [1.2.1] - 2026-08-21

### Fixed
- Asama 9: Dailymotion sandboxed iframe sorunu (about:blank frame'lerde
  all_frames enjeksiyonu Chrome guvenlik politikasina takiliyor ve tum
  executeScript cagrisini sessizce engelliyor)

### manifest.json
- content_scripts: all_frames ve match_about_blank kaldirildi (varsayilan false)
  - sadece ana frame hedefleniyor
- Surum 1.2.1'e yukseltildi

### popup.js
- chrome.scripting.executeScript target: { tabId, allFrames: false } olarak ayarlandi
- Enjeksiyon ve sendMessage adimlarindaki tum hatalar yakalayip popup konsoluna
  console.error("Popup Error:", err || chrome.runtime.lastError) ile yazdiriliyor
  (sessiz hata durumu ortadan kaldirildi)

### content.js
- Dosyanin en basina enjeksiyon dogrulama logu eklendi:
  console.log("PopTool content.js başarıyla yüklendi:", window.location.href)

## [1.3.0] - 2026-08-21

### Fixed
- Asama 10: Dailymotion gibi videonun farkli origin'li iframe'de
  (geo.dailymotion.com) oldugu sitelerde video tespiti
  (all_frames: false ana frame'e enjekte edildigi icin video gorunmuyordu)

### manifest.json
- content_scripts: "all_frames": true eklendi - tum frame'lerde calisma
- match_about_blank eklenmedi (false/varsayilan) - sandboxed about:blank
  frame'ler Chrome guvenlik politikasini tetiklemesin diye hedeflenmiyor
- Surum 1.3.0'a yukseltildi

### content.js
- IIFE'nin ilk satirina guard eklendi: about:/chrome* sayfalarinda script
  hicbir islem yapmadan cikar (top-level return SyntaxError olusturacagi
  icin guard fonksiyon ici ilk satirda)
- Enjeksiyon dogrulama logu guard sonrasina tasinadi (kisitli sayfalar sessiz)
- getVideoInfo dinleyicisi: frame icinde video YOKSA yanit donmez (return false);
  sadece video BULAN frame sendResponse({ success: true, ... }) ile döner
- startRecording / stopRecording da ayni sekilde video olmayan frame'lerde
  yok sayilir (bos frame'lerden recordingError spam'i ve cift kayit onlendi)
- Kullanimsizlasan waitForVideo fonksiyonu kaldirildi (olu kod temizligi)

### popup.js
- Frame mesajlasma yeniden yapilandirildi: sendMessage tum frame'lere gider,
  videoyu bulan ilk frame'in cevabi kabul edilir (isValidFrameResponse:
  response.success || response.found)
- Akis: direkt mesaj -> cevap yoksa executeScript ile ana frame enjeksiyonu ->
  tekrar mesaj -> yine cevap yoksa 1.2sn bekleyip son deneme (SPA/dinamik
  yuklemeler icin, content tarafindaki 5sn bekleme kaldirildigi icin)
- Tum hatalar popup konsoluna console.error("Popup Error:", ...) ile yazilir

## [1.4.0] - 2026-08-22

### Changed
- Asama 11: Basitlestirilmis ve kararlI video tespiti + iletisim mimarisi
  (iframe enjeksiyonu tamamen terk edildi, tek-mesaj iletisimine gecildi)

### manifest.json
- content_scripts: "all_frames": true kaldirildi (varsayilan false)
  - content script artik SADECE ana sayfaya (top frame) enjekte edilir
  - iframe icine enjeksiyon olmadigi icin sandboxed/ucuncu taraf frame'lerin
    executeScript cagrilarini sessizce engelleme sorunu tamamen ortadan kalkti
- Surum 1.4.0'a yukseltildi

### content.js
- Dosya basindaki gereksiz kontroller kaldirildi:
  - about:/chrome URL guard'i (content script zaten sadece eslesen sayfalarda calisir)
  - __POPTOOL_INJECTED__ cift-enjeksiyon korumasi (programatik enjeksiyon akisi
    kalktigi icin gereksizlesti)
- Video arama fonksiyonu yeniden yazildi (findVideo):
  1. Once dogrudan ana sayfadaki <video> etiketi aranir (document.querySelector('video'))
  2. Dogrudan video yoksa <iframe>'ler taranir; src adresinde "dailymotion",
     "youtube", "vimeo", "player" veya "embed" gecen iframe'ler video oynatici
     olarak kabul edilip { type: "frame", iframe } seklinde dondurulur
- getVideoInfo dinleyicisi: ana sayfadan HER KOŞULDA basarili yanit doner -
  { success: true, ... } (video bulunamazsa bile success: true + found: false;
  popup artik yanitsizlik ile "video yok" durumunu ayirt edebilir)
- startRecording / stopRecording ayni findVideo uzerinden calisir; video yalnizca
  iframe'de bulunursa aciklayici Turkce hata mesaji doner ("Video bir iframe
  icinde oynatiliyor ve dogrudan kaydedilemiyor.")

### popup.js
- Karmasik frame iletisim zinciri kaldirildi: isValidFrameResponse,
  sendToFrames ve injectAndSend (executeScript fallback + 1.2sn retry) silindi;
  chrome.scripting kullanimi tamamen sona erdi
- Basit ve kararli iletisim (requestVideoInfo yardimcisi): aktif sekmeye tek
  chrome.tabs.sendMessage({ action: "getVideoInfo" }) atilir
- Yanit degerlendirme netlesti:
  - success + found -> video bilgisi gosterilir (type: "frame" ise
    "Video bulundu (iframe)" durum metni)
  - success + !found -> "Video bulunamadi"
  - yanit yok (hata) -> "Content script yüklenmedi"
- "Mevcut zamana ayarla" butonlari ayni tek-mesaj yardimcisini kullanir

## [1.4.1] - 2026-08-22

### Added
- Asama 12: Dinamik enjeksiyon (fallback) mekanizmasi - uzanti yuklendikten/güncellendikten
  sonra acik kalan sekmelerde content script eksikse otomatik kurtarma

### popup.js
- Akis yeniden kurgulandi:
  1. DOM yuklendiginde (DOMContentLoaded) aktif sekmeye chrome.tabs.sendMessage ile
     { action: "getVideoInfo" } gonderilir
  2. Yanit donmezse / hata olusursa (chrome.runtime.lastError, "Receiving end does not
     exist" - content script yuklu degil) chrome.scripting.executeScript ile
     content/content.js aktif sekmeye dinamik olarak enjekte edilir
     (target: { tabId, allFrames: false } - sadece ana sayfa)
  3. Enjeksiyon tamamlanir tamamlanmaz getVideoInfo mesaji tekrar gonderilir
  4. Yanit found: true ise video durumu arayuzde gosterilir; bulunamazsa
     "Video bulunamadi", enjeksiyon da basarisizsa "Bu sayfada video aranamıyor
     (kısıtlı sayfa)" mesaji basilir (chrome:// vb.)
- Yardimcilar: sendGetVideoInfo (mesaj + hata yakalama), injectContentScript
  (executeScript + hata yakalama), requestVideoInfo (aktif sekme sorgusu +
  fallback zinciri); tum enjeksiyon/mesajlasma hatalari konsola
  console.error("Popup Error:", ...) ile yazilir
- "Mevcut zamana ayarla" butonlari ayni fallback'li requestVideoInfo uzerinden calisir;
  canli zaman interval'i hafif kalir (duz sendMessage)
- init() cagrisi document.readyState kontroluyle DOMContentLoaded'a baglandi
- Surum 1.4.1'e yukseltildi

### content.js
- __POPTOOL_INJECTED__ cift-enjeksiyon korumasi geri eklendi: manifest + programatik
  enjeksiyon ayni sayfada ustuste calisirsa duplicate listener ile cift kayit
  (cift MediaRecorder/cift indirme) olusmasini engeller

## [1.4.2] - 2026-08-22

### Fixed
- Asama 13: Content script'te firlatilan `Cannot read properties of undefined
  (reading 'hostname')` hatasi giderildi - script yukledigi anda cokuyor,
  video tarama ve popup mesajlasmasi tamamen calismaz hale geliyordu.
  Tum URL/hostname/src okumalari guvenli (defensive) hale getirildi.

### content.js
- Guvenli yardimci fonksiyonlar eklendi:
  - safeString: undefined/null/non-string degerleri "" 'ye indirger
  - getCurrentHref / getCurrentHostname: window.location erisimi try/catch ile
    sarili (sandboxed/kisitli frame'lerde location okuma hatalarina karsi)
  - parseUrlSafe: new URL() cagrisi try/catch icinde; bos ("") , undefined veya
    gecersiz URL durumlarinda exception yerine null doner
  - decodeFileName: decodeURIComponent URIError'lari yakalanir
- findVideo tamamen hataya dayanikli hale getirildi:
  - document.querySelector / querySelectorAll cagrilari ayri try/catch icinde
  - iframe dongusu her iframe ayri try/catch ile taranir; hatali iframe
    islemleri tum taramayi cokturmez, sadece atlanir
  - iframe?.src kontrolu yapilmadan new URL() / .hostname cagrilmaz;
    src bos/undefined ise getAttribute("src") yedegi denenir, o da yoksa
    iframe sessizce gecilir
  - keyword aramasi hem ham src hem de parse edilmis hostname uzerinden yapilir
- getPageTitle guvenlilestirildi: document.title, video src, pathname ve
  location.hostname okumalarinin hepsi optional chaining + fallback ile
  sarildi; hicbir kosulda exception firlatmaz ("Bilinmeyen Video" fallback)
- getVideoInfo tum govdesi try/catch icine alindi; hata durumunda popup'i
  asiya birakmak yerine { found: false } doner; video property erisimlerinde
  (duration, currentTime, paused, readyState, mediaKeys, src) optional
  chaining kullanildi; DRM kontrolunde src once string'e cevrilir
- Mesaj dinleyicisi (chrome.runtime.onMessage) tamamen corap sarma try/catch
  icine alindi: msg?.action optional chaining ile okunur, beklenmeyen hata
  durumunda dinleyici cokmek yerine konsola log atip popup'a
  { success: false, found: false, error } yaniti doner
- sendToPopup guvenlilestirildi: chrome.runtime kalkmis (extension context
  invalidated) olsa bile senkron throw yerine sessizce yutulur
- checkCaptureSupport: null video korumasi + typeof function kontrolu
- getSupportedMimeType: MediaRecorder tanimsizsa / isTypeSupported hata
  verirse "" doner (cokme yok)
- Acilis logu window.location.href yerine guvenli getCurrentHref() kullanir

### manifest.json
- Surum 1.4.2'ye yukseltildi

## [1.4.3] - 2026-08-22

### Fixed
- Asama 14: Popup UI senkronizasyonu - iletisim calismasina ragmen popup
  arayuzundeki DOM elemanlarinin guncellenmemesi ve arayuzun varsayilan
  hata durumunda asili kalmasi giderildi; popup.js <-> popup.html ID
  eslesmesi birebir saglandi

### popup.html
- videoInfo kutusuna "Hazir durumu" satiri eklendi: id="videoReadyState"
  (content script'in dondurdugu readyState degerini gostermek icin)
- Tum konteyner ID'leri popup.js ile dogrulandi: status, statusIcon,
  statusText, videoInfo, videoTitle, videoDuration, videoCurrentTime,
  videoReadyState, controls, startTime, endTime, setStartBtn, setEndBtn,
  clipDuration, rangeFill, recordBtn, recordIcon, recordText, progress,
  progressFill, progressText, message, messageText (23/23 eslesme)

### popup.js
- Tek kaynakli eleman kayit defteri (els nesnesi): tum DOM referanslari
  tek yerde toplanir, anahtarlar HTML ID'leriyle birebir aynidir
- verifyDomIds(): acilista tum ID'lerin popup.html'de var oldugu kontrol
  edilir; eslesme bozuksa konsola "Popup Error: popup.html ile ID
  eslesmesi bozuk" yazilir (sessiz cokme yerine teshis edilebilir hata)
- Durum yoneticisi fonksiyonlara ayirildi:
  - resetUi(): popup acilisinda deterministik ilk durum ("Video araniyor...",
    videoInfo/controls/progress/message gizli)
  - renderFound(response): baslik, sure, su anki zaman VE hazir durumu
    (readyStateLabel ile "Yukleniyor / Meta veri alindi / Hazirlaniyor /
    Tam hazir") ilgili alanlara yazilir; controls (slider + butonlar)
    görünür yapilir; startTime/endTime max degerleri ayarlanir
  - renderNotFound(): SADECE "Sayfada oynatilabilir video bulunamadi"
    bilgisi gosterilir; diger tum kaplar gizlenir
  - renderRestricted(response): yanit yok / success:false durumunda hata
    metni (response.error varsa o kullanilir)
- findVideo akisi istenen siraya sokuldu: resetUi -> requestVideoInfo ->
  response.success ise ONCE tum uyari/hata kaplari gizlenir
  (hideAllErrorContainers: message + progress hidden/display:none),
  ardindan found'a gore renderFound/renderNotFound; success degilse
  renderRestricted
- showMessage classList tabanli duzeltildi (className tamamen ezilmesi
  yerine hidden kaldirilip success/error siniflari toggle edilir)
- setHidden yardimcisi: tum konteyner gorunurluk degisimleri null-safe
  ve .hidden sinifi (display:none !important) uzerinden yapilir
- Guvenlik sertlestirmeleri:
  - setStartBtn/setEndBtn'de response.currentTime.toFixed(1) cagrisi
    undefined iken TypeError firlatiyordu -> Number() + || 0 korumasi
  - chrome.tabs.sendMessage cagrilari (canli zaman interval'i, Kaydet/
    Durdur butonlari) sendToTab yardimcisiyla try/catch'e alindi;
    yakalanmamis promise reddi kalmadi
  - runtime.onMessage dinleyicisinde msg?.action + try/catch
  - stopTimeInterval eklendi: video bulunamayan/kisitli sayfalarda canli
    zaman interval'i birakilmiyor
- DRM durumu renderFound icinde ayri dal olarak korundu

### manifest.json
- Surum 1.4.3'e yukseltildi

## [1.5.0] - 2026-08-22

### Fixed
- Asama 15: iframe videolarinda popup'un "Yukleniyor..." durumunda takilmasi
  ve surelerin 0:00 gorunmesi giderildi - iframe oynaticilar icin DOM'dan
  duration/currentTime okunamadigi bilinerek arayuz bu duruma ozel
  davranacak sekilde guncellendi

### content.js
- getVideoInfo'nun frame dalida isFrame: true alanı eklendi (popup'a
  acik iframe sinyali; type: "frame" degeri geriye uyumlu korundu)
- Frame durumunda readyState artik 0 yerine 4 (hazir) donduruluyor -
  popup'in yukleme bekleme dongusune girme sebebi ortadan kalkti

### popup.js
- isFrameResponse(response): yanitin iframe olup olmadigini hem
  response.isFrame hem de response.type === "iframe" uzerinden tespit eder
- durationUnknown durum bayragi eklendi:
  - Sure bilinmiyorsa "Sure:" alani "Bilinmiyor / Canli" yazar
    ("0:00" yerine), "Su anki:" alani "-" gosterir
  - "Hazir durumu" alani iframe durumunda dogrudan
    "Hazir (iframe Oynatici)" olarak yazilir
  - Canli zaman interval'i (loading loop) iframe modunda baslatilmaz,
    mevcut interval stopTimeInterval() ile temizlenir - popup surekli
    video yuklemesi beklemez
  - Baslangic/Bitis inputlarindan max kisiti kaldirilir
    (removeAttribute("max")), validateTimes() clamp'i atlanir ->
    kullanicinin manuel girisine tamamen acik ve duzenlenebilir kalir
  - Kaydet butonu acikca enabled yapilir (recordBtn.disabled = false)
  - Kayit validasyonunda "Bitis suresi videodan uzun olamaz" kontrolu
    sadece sure BILINDIGINDE uygulanir (durationUnknown iken atlanir)
- updateRangeBar: artik sure bilinmeyen durumda da secili aralik
  metnini ("Secili aralik: X sn") gunceller; renk cubugu konumu yalnizca
  sure biliniyorsa hesaplanir
- resetUi: durationUnknown bayragi her yeni taramada sifirlanir
- Normal (element) video akisi degismedi: max clamp, endTime otomatik
  doldurma ve canli zaman interval'i onceki gibi calisir

### manifest.json
- Surum 1.5.0'a yukseltildi

## [1.6.0] - 2026-08-22

### Added
- Asama 16: iframe videolarinda kayit destegi - chrome.tabCapture (sekme
  yakalama) fallback akisi. "Video bir iframe icinde oynatiliyor ve
  dogrudan kaydedilemiyor" yapay engeli kaldirildi; dogrudan <video>
  bulunmayan sayfalarda kayit artik sekmeyi yakalayarak gerceklesir.

### Yapı (Mimari Not)
- MV3'te tabCapture akisi yalnizca uzanti sayfalarinda tuketilebilir:
  popup kapaninca kayit olecegi ve service worker'da MediaRecorder
  calismadigi icin kayit chrome.offscreen dokumaninda yapilir.
  Akis: popup -> service worker (getMediaStreamId) -> offscreen dokuman
  (getUserMedia + MediaRecorder) -> otomatik indirme.
- Kes-sinir notu: capraz-origin iframe icindeki oynatici aranamaz;
  sekme kaydi kullanici tarafindan secilen baslangic/bitis araliginin
  SURESI kadar canli kayit alir (oynatmayi kullanici konumlandirir).

### manifest.json
- permissions: "tabCapture" ve "offscreen" eklendi
- Surum 1.6.0'a yukseltildi

### background/service-worker.js (yeniden yazildi)
- startTabRecording mesaji isleniyor:
  1. Aktif sekme bulunur, chrome.tabCapture.getMediaStreamId ile
     streamId alinir (callback tabanli Promise sarmalayici,
     chrome.runtime.lastError kontrolu ile)
  2. Offscreen dokuman yoksa chrome.offscreen.createDocument ile
     olusturulur (reasons: USER_MEDIA)
  3. offscreenPing/ready el sikisma dongusu ile modulun hazirlanmasi
     beklenir (en fazla 10 x 200ms), ardindan beginTabCapture
     (streamId + startTime + endTime) iletilir; ack alinamazsa
     recordingError ile popup bilgilendirilir
- stopTabRecording mesaji offscreen'e stopTabCapture olarak aktarilir
- Eski davranis korundu: content script kaynakli recordingProgress/
  Complete/Error mesajlari ilgili sekmeye relay edilir; offscreen
  kaynakli mesajlar relay edilmez (popup zaten dogrudan alir)

### offscreen/offscreen.html + offscreen/offscreen.js (yeni)
- Sekme akisi getUserMedia ile tuketilir (chromeMediaSource: "tab",
  ses + goruntu, maxFrameRate 30)
- MediaRecorder kaydi (webm vp9/vp8+opus otomatik codec secimi),
  250ms'lik chunk'larla
- Sure tabanli kayit: (endTime - startTime) saniye; sure dolunca
  otomatik durdurma, erken durdurma stopTabCapture mesajiyla
- Progress her 250ms popup'a recordingProgress olarak gider
  ("baslangic / bitis" metni + yuzde)
- Kayit sonunda Blob -> <a download> ile poptool_sekme_<baslangic>-
  <bitis>.webm dosyasi indirilir; URL.revokeObjectURL temizligi
- finishRecording: bos kayit durumunda recordingError; track'lerin
  release'i ve timer temizligi garanti edilir
- Zaten devam eden kayit varken ikinci beginTabCapture reddedilir

### content.js
- startRecording icindeki "Video bir iframe icinde oynatiliyor ve
  dogrudan kaydedilemiyor" hata blogu KALDIRILDI
- Frame tespitinde artik hata firlatilmaz; istek sessizce
  startTabRecording olarak service worker'a iletilir (defensive
  fallback - normalde popup dogrudan yonlendirir)
- startRecording mesajina verilen yanit frame durumunda
  { ok: false, useTabCapture: true } olur; popup bu yaniti alip
  sekme kaydini tetikler (cift baslatma engellendi)

### popup.js
- currentVideoIsFrame durum bayragi: resetUi/renderNotFound/
  renderRestricted/DRM dalinda false, renderFound'da
  isFrameResponse() sonucuna gore set edilir
- Kaydet butonu yonlendirmesi:
  - iframe video -> chrome.runtime.sendMessage ile SW'ye
    startTabRecording gonderilir (content script devre disi);
    progress metni "Sekme kaydi basliyor..."
  - normal video -> mevcut tabs.sendMessage(startRecording) akisi
  - content script'ten { ok:false, useTabCapture:true } donerse
    popup otomatik olarak sekme kaydina gecer
- Durdur butonu iframe modunda stopTabRecording (SW), normal modda
  stopRecording (content script) gönderir
- sendToBackground yardimcisi eklendi (try/catch + lastError logu)

### manifest.json
- Surum 1.6.0'a yukseltildi

## [1.6.1] - 2026-08-22

### Fixed
- Asama 17: iframe/sekme kayitlarinda indirme akisi optimize edildi.
  Kayit basariyla tamamlanmasina ragmen indirilen dosyanin cok kucuk
  (~0.2 MB) kalmasi ve <a download> tetikleyicisinin asili kalabilmesi
  sorunu giderildi; indirme artik chrome.downloads API uzerinden
  yonetiliyor.

### Indirme Akisi (Yeni Mimari)
- Eski akis: kayit sonrasi offscreen/content icinde gizli <a download>
  click() ile indirme -> offscreen belgelerinde guvenilir degil,
  ilerleme takipsiz, hata sessizce yutuluyordu.
- Yeni akis: kayit yapan baglam (offscreen / content script) Blob'u
  URL.createObjectURL ile olusturur, blobUrl'yi service worker'a
  "saveRecording" mesaji ile gonderir; service worker
  chrome.downloads.download({ url: blobUrl, filename, saveAs: true,
  conflictAction: "uniquify" }) ile Farkli Kaydet diyalogunu acar.
- chrome.downloads.onChanged ile indirme durumu izlenir:
  "complete" -> popup'a downloadComplete bildirimi;
  "interrupted" -> downloadFailed bildirimi (kullanicinin diyalogu
  iptal etmesi USER_CANCELED sessizce karsilanir).
- Blob URL yonetimi: indirme sonlanana kadar revoke EDILMEZ.
  Service worker, olusturan baglama (offscreen -> runtime.sendMessage,
  content script -> tabs.sendMessage) "releaseBlobUrl" gonderir;
  ayrica 180 saniyelik fallback revoke zamanlayicisi vardir.
- Dosya adi sanitizasyonu service worker tarafinda merkezilesti
  (gecersiz karakterler, uzunluk siniri, .webm uzanti garantisi).

### manifest.json
- permissions: "downloads" eklendi (chrome.downloads API icin)
- Surum 1.6.1'e yukseltildi

### offscreen/offscreen.js
- Codec tercih sirasi yeniden duzenlendi: video/webm;codecs=vp8,opus
  ilk siraya alindi (genis oynatici uyumlulugu + ses garantisinde
  opus), vp9 varyantlari ve sade video/webm yedek olarak kaldirildi
- normalizeBlobMimeType: Blob her zaman dogru webm MIME tipiyle
  olusturulur (mediaRecorder.mimeType "video/webm*" degilse
  "video/webm"e dusulur); blob.size === 0 ise kayit basarisiz sayilir
- MediaStream track saglik kontrolleri eklendi:
  - verifyStreamTracks: getUserMedia sonrasi goruntu track'inin
    varligi, tum track'lerin readyState="live" ve enabled oldugu
    dogrulanir; track ayarlari (cozunurluk/fps) konsola loglanir;
    ses track'i yoksa uyari verilir
  - watchTrackEnd: her track'e "ended" dinleyici baglanir; kayit
    sirasinda bir track olerse kullanici bilgilendirilip kayit
    elegans biçimde durdurulur (elde verilen chunk'lar kurtarilir)
  - progress dongusu her tikte areAllTracksLive kontrolu yapar,
  olu track bulunca kayit erken sonlandirilir
- finishRecording artik async: indirme ack'alani (downloadOk)
  olmadan recordingComplete GONDERILMEZ; indirme tetiklenemezse
  "Dosya olusturuldu ancak indirme baslatilamadi" hatasi doner
- sendToBackground yardimcisi eklendi (callback + lastError yonelimli)

### content/content.js (dogrudan video yolu - ayni standart)
- getSupportedMimeType codec sirasi offscreen ile esitlestirildi
  (vp8,opus oncelemesi + normalizeBlobMimeType)
- downloadRecording yeniden yazildi: <a download> click yerine
  Blob (normalize MIME) -> createObjectURL -> saveRecording mesaji
  ile service worker uzerinden chrome.downloads.download(saveAs:true)
- Indirme ack gelmeden recordingComplete gonderilmez; hata durumunda
  Turkce mesaj + aninda blob revoke; basari durumunda 180sn
  fallback revoke + releaseBlobUrl mesaji ile erken temizlik
- onstop handler'i bos/kucuk kaydi (chunk yok VEYA toplam boyut 0)
  daha sikali sekillerde yakalar

### background/service-worker.js
- handleSaveRecording: blobUrl dogrulama (blob: prefix), dosya adi
  sanitizasyonu, chrome.downloads.download(saveAs:true), aktif
  indirmelerin Map ile takibi, { ok, downloadId } yaniti
- downloads.onChanged dinleyicisi: complete/interrupted durumlarini
  popup'a bildirir, ilgili blob URL'sini olusturan baglamda serbest
  birakir (releaseBlobUrl)
- notifyPopup yardimcisi eklendi

### popup/popup.js + popup.css
- markDownloaded(): indirme tetiklendikten sonra Kaydet butonu
  "✅ Indirildi!" durumuna gecer (yesil .btn-record.downloaded stili,
  status: "💾 Dosya kaydediliyor..."), 4 saniye sonra otomatik
  normale doner; yeni kayit baslatilirse durum hemen sifirlanir
- Yeni mesaj turlari: downloadComplete ("Dosya basariyla
  bilgisayariniza kaydedildi." + status ✅), downloadFailed (hata
  metniyle mesaj)
- recordingComplete metni "Farkli Kaydet penceresi acildi" olarak
  netlestirildi

## [1.6.2] - 2026-08-22

### Fixed
- Asama 18: "Dosya olusturuldu ancak indirme baslatilamadi" hatasi
  giderildi. MV3'te chrome.downloads.download API'si service
  worker/popup baglamindaki blob: URL'lerini guvenlik nedeniyle
  reddedebiliyor; kayit verisi artik blob URL yerine base64
  data URL olarak tasinıyor.

### Indirme Mekanizmasi (v1.6.2)
- Yeni akis: kayit yapan baglam (offscreen / content script) Blob'u
  FileReader.readAsDataURL(blob) ile base64 string'e cevirir
  (blobToDataUrl), "saveRecording" mesajiyla dataUrl'yi service
  worker'a gonderir; service worker
  chrome.downloads.download({ url: dataUrl, filename, saveAs: true,
  conflictAction: "uniquify" }) cagrisini yapar.
- Data URL dogrulama: "data:" prefix + ";base64," kontrolu
  yapilmadan SW'ye gonderim yapilmaz.
- Fallback zinciri:
  1. FileReader base64 -> chrome.downloads.download (saveAs:true)
  2. Base64 donusumu veya downloads API basarisizsa -> standart DOM
     yontemi (gizli <a> + createObjectURL + click), objectURL 60sn
     sonra revoke edilir
  - Her iki yol da basarisizsa dopru Turkce hata mesaji popup'a
    gonderilir ("Dosya olusturuldu ancak indirme baslatilamadi")
- Eski blob: URL aktarimi ve releaseBlobUrl/180sn revoke
  mekanizmalari kaldirildi (data URL'lerin revoke ihtiyaci yok);
  service worker'daki aktif indirme takibi Set'e sadelestirildi.

### offscreen/offscreen.js
- blobToDataUrl: FileReader tabanli Promise yardimcisi (onerror/
  onabort dahil hata yonetimi)
- domFallbackDownload: <a download> click yontemiyle yedek indirme
- downloadRecording(recorderMimeType): normalize MIME -> Blob ->
  base64 -> saveRecording; ack basarisizsa otomatik fallback;
  basari durumunda recordingComplete { fileSize, downloadTriggered }
- Mesaj dinleyicisinden releaseBlobUrl dali kaldirildi

### content/content.js
- offscreen ile ayni blobToDataUrl + domFallbackDownload
  yardimcilari eklendi
- downloadRecording yeniden yapilandirildi: base64 -> SW
  (chrome.downloads) -> basarisizsa DOM fallback -> hicbiri
  calismazsa hata; her durumda cleanup() garanti edilir
- releaseBlobUrl mesaj dalı ve pendingBlobUrls takibi kaldirildi

### background/service-worker.js
- handleSaveRecording artik msg.dataUrl bekler (blob: URL degil);
  data URL formati dogrulanir, sanitizeFilename aynen korunur
- releaseBlobForDownload ve origin-tablolamasi kaldirildi;
  activeDownloads Map -> Set
- downloads.onChanged izleme aynen suruyor: complete ->
  downloadComplete, interrupted -> downloadFailed (USER_CANCELED
  sessiz karsilanir)

### popup/popup.js
- recordingComplete: onceki hata durumu hideMessage() ile temizlenir,
  buton "✅ Indirildi!" durumuna gecer ve mesaj olarak
  "✅ Indirildi! (X MB)" gosterilir
- downloadComplete / downloadFailed isleyicileri korundu

## [1.6.3] - 2026-08-22

### Fixed
- Asama 19: Dailymotion benzeri katı sayfa içi CSP (Content Security
  Policy) uygulayan sitelerde content script'in sayfa DOM'unda
  indirme denemesi (<a download> / blob URL click) CSP'ye takılıyor,
  downloadOk=false kalıyor ve yanlışlıkla "Dosya olusturuldu ancak
  indirme baslatilamadi" hatasi firlatiliyordu. Dogrudan video yolu
  artik SAYFA ICINDEN hicbir indirme denemesi yapmaz; kayit verisi
  popup'a payload olarak tasinir ve indirme uzanti baglamindan
  tetiklenir (popup, Chrome uzanti yetkilerine sahip oldugu icin
  sayfa CSP'sinden bagimsizdir).

### content/content.js
- domFallbackDownload KALDIRILDI; sayfa DOM'unda indirme denemesi yok
- Yeni akis (dogrudan video yolu):
  1. Kayit bitince Blob (normalize MIME) -> FileReader.readAsDataURL
     ile base64 data URL uretilir
  2. "recordingComplete" mesaji ile { fileSize, filename, dataUrl,
     mimeType } payload'i dogrudan popup'a gonderilir
  3. Popup ACK doner ({ ok: true }); ACK alinamazsa (popup kapali vb.)
     yedek olarak ayni dataUrl service worker'a "saveRecording" ile
     gonderilir (uzanti baglami - CSP'den etkilenmez)
  4. Iki yol da basarisizsa dopru Turkce hata mesaji gider
- sendToPopup yerine ACK bekleyen dogrudan sendMessage kullanimi;
  her durumda cleanup() garanti edilir

### popup/popup.js
- triggerDownload(): recordingComplete payload'ini yakalar ve
  chrome.downloads.download({ url: dataUrl, filename, saveAs: true,
  conflictAction: "uniquify" }) cagrisini POPUP baglaminda yapar;
  data URL formati ("data:" + ";base64,") dogrulanir, dosya adi
  sanitize edilir (sanitizePopupFilename)
- Indirme tetiklenince buton/durum "✅ Indirildi!" olur, mesaj
  "✅ Indirildi! (X MB)"; hata durumunda buton normale doner ve
  aciklama mesaji gosterilir
- onMessage dinleyicisi artik sendResponse parametreli; popup
  recordingComplete mesajina { ok: true } ACK döner (content'in
  yedek mekanizmaya gecip gecmeyecegine karar vermesi icin)
- Basarili indirmeden sonra service worker'a trackDownload ile
  downloadId bildirilir

### background/service-worker.js
- Yeni "trackDownload" aksiyonu: popup tarafindan tetiklenen
  indirmeler de activeDownloads setine eklenir; boylece
  downloads.onChanged -> downloadComplete/downloadFailed bildirimleri
  popup kaynakli indirmeler icin de calisir
- Relay bloku: dataUrl tasayan recordingComplete mesajlari tekrar
  sekmeye gonderilmez (cok MB'lik payload'in sayfaya gereksiz
  kopyalanmasi engellendi)

### manifest.json
- Surum 1.6.3'e yukseltildi

## [1.6.4] - 2026-08-22

### Fixed
- Asama 20: Indirme onay (ack) zincirinin Save As diyalogu nedeniyle zaman
  asimaina ugramasi giderildi. chrome.downloads.download(saveAs: true)
  cagrisi kullanici diyalogu acikken uzun sure askida kalabildiginden
  mesaj kanali uzerinden donen ack'ler kayboluyor, alici taraflar
  (content script / popup) indirme BASARIYLA tetiklenmis olmasina ragmen
  "Dosya olusturuldu ancak indirme baslatilamadi" hatasi basiyordu.

### background/service-worker.js
- handleSaveRecording kaldirildi; yerine beginDownload + respondSafe +
  reportDownloadFailure yardimcilari geldi
- saveRecording isleyicisi yeniden yapilandirildi:
  - dataUrl dogrulama SENKRON yapilir; gecersiz veri aninda
    { ok: false } ile yanitlanir
  - downloadId doner DONMEZ hicbir ek async adim olmadan
    sendResponse({ ok: true, downloadId }) atesi edilir
    (Save As diyalogunun promise'i geciktirmesi mesaj kanalini
    bloklamaz); kanal kapanmissa respondSafe sessizce yutar
  - indirme hatasinda dogrudan notifyPopup({ action: "downloadFailed",
    error: e.message }) firlatilir + { ok: false, error } doner
- downloadId aktif indirme takibine (activeDownloads) yine eklenir;
  downloads.onChanged -> downloadComplete/downloadFailed akisi aynen surer

### content/content.js
- saveViaServiceWorker ack kontrolu guvenli hale getirildi:
  - non-object / null ack ayri dalda ele alinir ("yanit yok" = kanal
    kapandi; indirme buyuk olasilikla tetiklendi diye kabul edilir,
    hata URETILMEZ)
  - Boolean(ack && typeof ack === "object" && ack.ok === true) ile
    kesin onay araniyor
- downloadRecording artik popup ack alinamadiginda service worker'a
  devredip SONUC NE OLURSA OLSUN cleanup() ile temizlenir; content
  script tarafindan ek "indirme baslatilamadi" hatasi basilmaz
  (hata bildiriminden service worker - downloadFailed - sorumludur)
- iframe tabanli sayfalar (Dailymotion vb.) icin bos-veri korumasi:
  MediaRecorder stop oldugunda chunk yoksa / toplam boyut 0 ise
  "Kayıt başarısız - boş dosya oluştu" hatasiyla olecegi yerine
  kayit akisi otomatik olarak service-worker.js uzerindeki
  startTabRecording (offscreen tab capture) mekanizmasina devredilir
  (delegateToTabCapture yardimcisi; popup'a "Doğrudan kayıt boş veri
  üretti, sekme kaydına geçiliyor..." progress metni gider)

### popup/popup.js
- triggerDownload artik POPUP baglaminda chrome.downloads.download
  cagirmiyor; saveRecording mesaji ile indirmeyi service worker'a
  devrediyor (tek merkezli indirme yolu):
  - ack.ok === true -> buton aninda "✅ İndirildi!" durumuna gecer,
    "✅ İndirildi! (X MB)" mesaji basilir
  - ack.ok === false -> buton resetlenir, SW'nin hata aciklamasi
    gosterilir
  - ack yok (kanal Save As diyalogu nedeniyle kapandi) -> notr
    "Dosya kaydediliyor..." durumu; nihai durumu downloadComplete /
    downloadFailed bildirimleri netlestirir
- sanitizePopupFilename ve trackDownload gonderimi kaldirildi
  (dosya adi sanitizasyonu zaten service worker'da; indirme takibi
  SW'de beginDownload icinde yapiliyor)
- downloadComplete bildirimi: hideProgress + markDownloaded +
  "Dosya başarıyla bilgisayarınıza kaydedildi." (buton ✅)
- downloadFailed bildirimi: setRecordingState(false) + hideProgress +
  hata mesaji (buton normale doner)
- recordingComplete isleyicisi netlestirildi:
  - dataUrl tasıyorsa -> triggerDownload (dogrudan video yolu)
  - downloadTriggered bayragi tasiyorsa (offscreen sekme kaydi zaten
    indirmisti) -> dogrudan markDownloaded + "✅ İndirildi!"
    (sekme kayitlarinda yanlis "İndirme verisi alınamadı" hatasi
    giderildi)
- markDownloaded durum satiri "💾 Dosya kaydediliyor..." yerine
  "✅ İndirme tamamlandı" oldu

### manifest.json
- Surum 1.6.4'e yukseltildi
