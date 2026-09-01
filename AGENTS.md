# PopTool - Browser Video Clipper Extension

## Proje Amaci
Chrome Manifest V3 uzantisi. Kullanicilar web sitelerindeki videolardan (YouTube vb.)
belirli araliklari secip MediaRecorder API ile kaydedip bilgisayarlarina indirebilir.

## Mimari

### Dizin Yapisi
```
poptool/
├── manifest.json          # MV3 manifest
├── popup/
│   ├── popup.html         # Ana popup UI
│   ├── popup.css          # Stil
│   └── popup.js           # Popup mantigi
├── content/
│   └── content.js         # Sayfa icine enjekte edilen script
├── background/
│   └── service-worker.js  # MV3 service worker
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── AGENTS.md              # Bu dosya
└── CHANGELOG.md           # Degisiklik kayitlari
```

### Akis Diyagrami
1. Kullanici popup'i acar
2. Content script mevcut <video> elementini bulur ve bilgiyi popup'a iletir
3. Kullanici start/end saniyelerini secider (input veya "Mevcut zamana ayarla" butonu)
4. "Kaydet" butonu -> content script'te:
   a. video.captureStream() ile MediaStream alinir
   b. MediaRecorder baslatilir (webm/codecs=vp9)
   c. Bitis saniyesine gelince MediaRecorder.stop()
   d. Blob olusturulur -> URL.createObjectURL -> <a download> ile indirilir

### Manifest V3 Yapilandirmasi
- permissions: ["activeTab", "tabs"]
- host_permissions: ["https://www.youtube.com/*", "http://www.youtube.com/*"]
- content_scripts: youtube.com'da calisacak content.js
- background: service-worker.js (event-driven)

### Ozellikler
- Video otomatik tespiti (MutationObserver ile SPA uyumluluk)
- Canli zaman gosterimi (popup'da su anki zaman)
- "Mevcut zamana ayarla" butonlari (start/end icin)
- Secili aralik suresi gosterimi
- DRM korumali video tespiti ve uyarisi
- Hata yonetimi (Turkce mesajlar)
- Dosya boyutu gosterimi (indirme sonrasi)
- Koyu tema, minimal tasarim (320px)

### Teknik Detaylar
- Video yakalama: HTMLVideoElement.captureStream()
- Kayit formati: video/webm;codecs=vp9 (otomatik codec secimi)
- MediaRecorder content script'te calisir (MV3 service worker'da
  MediaRecorder desteklenmez, lifecycle cok kisa)
- Blob memory yonetimi: URL.revokeObjectURL ile temizlik
- Videoyu baslangic saniyesine sarip oynatma

### Sinirlamalar
- DRM korumali icerik (Netflix, Disney+) calismaz
- CORS restriction: Same-origin videolar sorunsuz calisir
- YouTube normal video icerikleri calisir
- Minimum 0.5 saniyelik aralik gerekli

### Kurulum
1. chrome://extensions/ adresine gidin
2. "Gelistirici modu" acin
3. "Pakelenmemis uzanti yukle" secin
4. poptool klasorunu secin
5. Uzanti yuklenecektir

### Kullanim
1. YouTube'da bir video acin
2. Uzanti ikonuna tiklayin
3. Baslangic ve bitis saniyelerini girin
4. "Kaydet" butonuna tiklayin
5. Video otomatik indirilecektir
