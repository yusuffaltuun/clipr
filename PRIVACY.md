# Privacy Policy for Clipr

Last updated: September 1, 2026

Clipr is a browser extension designed to capture, trim, and download web video segments directly from the user's active browser tab. This Privacy Policy outlines our data practices.

---

### 1. No Data Collection or Transmission
Clipr operates under a strict zero-data-collection policy:
* **No Personal Data:** We do not collect, store, track, or share personally identifiable information (PII), names, email addresses, or IP addresses.
* **No Browsing History or Activity:** We do not monitor, log, or transmit your browsing history, visited URLs, or search queries.
* **No Cookies or Credentials:** We do not read, store, or transmit authentication tokens, cookies, or account credentials.
* **No Analytics or Telemetry:** Clipr contains no third-party tracking scripts, analytics SDKs, or remote telemetry.

---

### 2. Local Processing
All video detection, stream capture, trimming, and file generation processes execute locally within your browser:
* Captured video/audio streams are processed on your local machine using standard browser APIs.
* No video data, audio data, or generated media files are uploaded or transmitted to external servers or cloud services.

---

### 3. Purpose of Requested Permissions
Clipr adheres to the Principle of Least Privilege. Each permission is strictly required for local functionality:
* **`activeTab`**: Used solely to access the current tab when you explicitly open Clipr, allowing the extension to inspect the video player and initiate clipping.
* **`scripting`**: Used to dynamically inject the lightweight content script into the active tab on demand upon user interaction.
* **`tabCapture`**: Used as a fallback capture mechanism when direct HTML5 video stream capture is not feasible on the active page.
* **`offscreen`**: Used to process and record the captured media stream via native browser recording APIs unavailable inside the Manifest V3 service worker environment.

---

### 4. Third-Party Services
Clipr does not integrate with, transmit data to, or rely on any third-party APIs or remote servers for its core functionality.

---

### 5. Changes to This Policy
If any modifications are made to this policy, the updated document will be reflected in this repository with an updated revision date.

---

### 6. Contact
For any questions regarding this Privacy Policy, please reach out via the official extension repository or the support email provided in the Chrome Web Store listing.
