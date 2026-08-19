import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "./styles.css";

interface Tab {
  id: string;
  url: string;
  title: string;
  active: boolean;
  domElement: HTMLElement;
}

interface Settings {
  search_engine: string;
  opacity: number;
  data_saver: boolean;
  high_security: boolean;
  language: "ar" | "en";
}

interface Download {
  url: string;
  path: string;
  progress: number;
  status: "downloading" | "finished" | "error";
  domElement?: HTMLElement;
}

const TRANSLATIONS: Record<string, { ar: string; en: string }> = {
  new_tab: { ar: "تبويب جديد", en: "New Tab" },
  back: { ar: "للخلف", en: "Back" },
  forward: { ar: "للأمام", en: "Forward" },
  refresh: { ar: "تحديث", en: "Refresh" },
  home: { ar: "الصفحة الرئيسية", en: "Home" },
  history: { ar: "السجل", en: "History" },
  downloads: { ar: "التنزيلات", en: "Downloads" },
  url_placeholder: { ar: "أدخل رابطاً أو ابحث في Startpage...", en: "Enter URL or search Startpage..." },
  privacy_shield: { ar: "درع الخصوصية", en: "Privacy Shield" },
  settings: { ar: "الإعدادات", en: "Settings" },
  go: { ar: "انتقال", en: "Go" },
  block_ads: { ar: "حجب الإعلانات", en: "Block Ads" },
  block_trackers: { ar: "حجب التتبع", en: "Block Trackers" },
  anti_fingerprint: { ar: "حماية من البصمة", en: "Anti-Fingerprint" },
  opacity: { ar: "شفافية النافذة", en: "Window Opacity" },
  search_placeholder: { ar: "ابحث أو أدخل رابطاً...", en: "Search or enter URL..." },
  search: { ar: "بحث", en: "Search" },
  history_search: { ar: "بحث في السجل...", en: "Search history..." },
  clear_history: { ar: "مسح السجل", en: "Clear History" },
  open_folder: { ar: "فتح المجلد", en: "Open Folder" },
  language: { ar: "اللغة", en: "Language" },
  search_engine: { ar: "محرك البحث", en: "Search Engine" },
  data_saver: { ar: "وضع توفير البيانات", en: "Data Saver Mode" },
  save_changes: { ar: "حفظ التغييرات", en: "Save Changes" },
  clear_history_confirm: { ar: "هل أنت متأكد من مسح سجل التصفح؟", en: "Are you sure you want to clear browsing history?" },
  downloading: { ar: "جاري التحميل...", en: "Downloading..." },
  finished: { ar: "اكتمل", en: "Finished" },
  error: { ar: "فشل", en: "Error" },
};

class Browser {
  tabs: Tab[] = [];
  activeTabId: string | null = null;
  history: any[] = [];
  downloads: Download[] = [];
  settings: Settings = {
    search_engine: "https://www.startpage.com/sp/search?query=",
    opacity: 1.0,
    data_saver: false,
    high_security: true,
    language: "ar"
  };

  constructor() {
    this.initEventListeners();
    this.loadSettings().then(() => {
      this.updateUIStrings();
      this.createNewTab();
      this.loadHistory();
    });
  }

  async loadSettings() {
    try {
      const savedSettings = await invoke("get_settings") as Settings;
      this.settings = { ...this.settings, ...savedSettings };
      this.applySettingsUI();
    } catch(e) {
      console.error("Failed to load settings:", e);
    }
  }

  applySettingsUI() {
    const langSelect = document.getElementById("setting-language") as HTMLSelectElement;
    const engineSelect = document.getElementById("setting-search-engine") as HTMLSelectElement;
    const dataSaverCheck = document.getElementById("setting-data-saver") as HTMLInputElement;
    const highSecurityCheck = document.getElementById("setting-high-security") as HTMLInputElement;
    const opacityRange = document.getElementById("setting-opacity") as HTMLInputElement;

    if (langSelect) langSelect.value = this.settings.language;
    if (engineSelect) engineSelect.value = this.settings.search_engine;
    if (dataSaverCheck) dataSaverCheck.checked = this.settings.data_saver;
    if (highSecurityCheck) highSecurityCheck.checked = this.settings.high_security;
    if (opacityRange) opacityRange.value = (this.settings.opacity * 100).toString();
  }

  async saveSettings() {
    const langSelect = document.getElementById("setting-language") as HTMLSelectElement;
    const engineSelect = document.getElementById("setting-search-engine") as HTMLSelectElement;
    const dataSaverCheck = document.getElementById("setting-data-saver") as HTMLInputElement;
    const highSecurityCheck = document.getElementById("setting-high-security") as HTMLInputElement;
    const opacityRange = document.getElementById("setting-opacity") as HTMLInputElement;

    const oldLang = this.settings.language;
    this.settings = {
      language: langSelect.value as "ar" | "en",
      search_engine: engineSelect.value,
      data_saver: dataSaverCheck.checked,
      high_security: highSecurityCheck.checked,
      opacity: parseInt(opacityRange.value) / 100
    };

    try {
      await invoke("save_settings", { settings: this.settings });
      if (oldLang !== this.settings.language) {
        this.updateUIStrings();
      }
      this.toggleModal("settings-modal", false);
    } catch(e) {
      alert(this.t("error") + ": " + e);
    }
  }

  updateUIStrings() {
    const lang = this.settings.language;
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";

    // Update elements with data-i18n
    document.querySelectorAll("[data-i18n]").forEach(el => {
      const key = el.getAttribute("data-i18n")!;
      if (TRANSLATIONS[key]) {
        el.textContent = TRANSLATIONS[key][lang];
      }
    });

    // Update placeholders
    document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
      const key = el.getAttribute("data-i18n-placeholder")!;
      if (TRANSLATIONS[key]) {
        (el as HTMLInputElement).placeholder = TRANSLATIONS[key][lang];
      }
    });

    // Update titles
    document.querySelectorAll("[data-i18n-title]").forEach(el => {
      const key = el.getAttribute("data-i18n-title")!;
      if (TRANSLATIONS[key]) {
        (el as HTMLElement).title = TRANSLATIONS[key][lang];
      }
    });

    // Special cases for active tabs
    this.tabs.forEach(tab => {
        if (tab.url === "") {
            tab.domElement.querySelector(".tab-title")!.textContent = this.t("new_tab");
        }
    });
  }

  t(key: string): string {
    return TRANSLATIONS[key] ? TRANSLATIONS[key][this.settings.language] : key;
  }

  initEventListeners() {
    // Navigation
    document.getElementById("btn-back")?.addEventListener("click", () => this.activeTabId && invoke("go_back", { label: this.activeTabId }));
    document.getElementById("btn-forward")?.addEventListener("click", () => this.activeTabId && invoke("go_forward", { label: this.activeTabId }));
    document.getElementById("btn-refresh")?.addEventListener("click", () => this.activeTabId && invoke("refresh_page", { label: this.activeTabId }));
    document.getElementById("btn-home")?.addEventListener("click", () => this.showHomePage());
    document.getElementById("btn-new-tab")?.addEventListener("click", () => this.createNewTab());

    // UI Toggles
    document.getElementById("btn-history-toggle")?.addEventListener("click", () => this.toggleSidebar("history-sidebar"));
    document.getElementById("btn-downloads-toggle")?.addEventListener("click", () => this.toggleSidebar("downloads-sidebar"));
    document.getElementById("btn-settings-toggle")?.addEventListener("click", () => this.toggleModal("settings-modal", true));
    document.getElementById("btn-shield")?.addEventListener("click", () => document.getElementById("shield-panel")?.classList.toggle("hidden"));

    // Close Buttons
    document.getElementById("btn-close-history")?.addEventListener("click", () => this.toggleSidebar("history-sidebar", false));
    document.getElementById("btn-close-downloads")?.addEventListener("click", () => this.toggleSidebar("downloads-sidebar", false));
    document.getElementById("btn-close-settings")?.addEventListener("click", () => this.toggleModal("settings-modal", false));
    document.getElementById("shield-close")?.addEventListener("click", () => document.getElementById("shield-panel")?.classList.add("hidden"));

    // Forms
    document.getElementById("btn-save-settings")?.addEventListener("click", () => this.saveSettings());
    document.getElementById("btn-clear-history")?.addEventListener("click", () => this.clearHistory());
    document.getElementById("btn-open-downloads-folder")?.addEventListener("click", () => invoke("open_downloads"));

    const historySearch = document.getElementById("history-search-input") as HTMLInputElement;
    historySearch?.addEventListener("input", () => this.renderHistory(historySearch.value));

    // URL Bar
    const urlBar = document.getElementById("url-bar") as HTMLInputElement;
    document.getElementById("btn-go")?.addEventListener("click", () => this.navigate(urlBar.value));
    urlBar.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        this.navigate(urlBar.value);
        urlBar.blur();
      }
    });

    // Home Page
    document.getElementById("home-search-btn")?.addEventListener("click", () => {
      const search = document.getElementById("home-search") as HTMLInputElement;
      this.navigate(search.value);
    });
    document.getElementById("home-search")?.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        const search = e.target as HTMLInputElement;
        this.navigate(search.value);
      }
    });

    // Tauri Events
    listen("url-changed", (event: any) => {
      const { label, url } = event.payload;
      const tab = this.tabs.find(t => t.id === label);
      if (tab) {
        tab.url = url;
        try {
          const urlObj = new URL(url);
          tab.title = urlObj.hostname;
          const titleEl = tab.domElement.querySelector(".tab-title");
          if (titleEl) titleEl.textContent = tab.title;
        } catch(e) {}

        if (this.activeTabId === label) {
          urlBar.value = url;
          this.updateUrlStatus(url);
          invoke("add_history", { url, title: tab.title });
        }
      }
    });

    listen("request-new-tab", (event: any) => this.createNewTab(event.payload));

    listen("download-started", (event: any) => {
      const { url, path } = event.payload;
      this.addDownload(url, path);
    });

    listen("download-finished", (event: any) => {
      const { url, success } = event.payload;
      this.updateDownloadStatus(url, success ? "finished" : "error");
    });

    listen("window-resized", () => this.syncActiveTabRect());
    window.addEventListener("resize", () => this.syncActiveTabRect());

    document.addEventListener("click", (e) => {
      const anchor = (e.target as HTMLElement).closest("a");
      if (anchor && anchor.target === "_blank") {
        e.preventDefault();
        this.createNewTab(anchor.href);
      }
    });
  }

  createNewTab(url: string = "") {
    const id = `tab_${Date.now()}`;
    const tabBar = document.getElementById("tab-bar");
    const newTabBtn = document.getElementById("btn-new-tab");

    const tabEl = document.createElement("div");
    tabEl.className = "tab";
    tabEl.id = id;
    tabEl.innerHTML = `
      <span class="tab-title">${this.t("new_tab")}</span>
      <button class="tab-close">✕</button>
    `;

    tabEl.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).className !== "tab-close") this.switchTab(id);
    });

    tabEl.querySelector(".tab-close")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.closeTab(id);
    });

    tabBar?.insertBefore(tabEl, newTabBtn);

    const newTab: Tab = { id, url: "", title: this.t("new_tab"), active: false, domElement: tabEl };
    this.tabs.push(newTab);
    this.switchTab(id);
    if (url) this.navigate(url);
  }

  async switchTab(id: string) {
    this.activeTabId = id;
    this.tabs.forEach(t => {
      t.active = t.id === id;
      t.domElement.classList.toggle("active", t.active);
    });

    const activeTab = this.tabs.find(t => t.id === id);
    const urlBar = document.getElementById("url-bar") as HTMLInputElement;
    const homePage = document.getElementById("home-page") as HTMLElement;

    if (activeTab) {
      if (activeTab.url === "") {
        this.showHomePage();
      } else {
        homePage.style.display = "none";
        urlBar.value = activeTab.url;
        this.updateUrlStatus(activeTab.url);
        const rect = this.getContentRect();
        await invoke("switch_tab", {
          activeLabel: id,
          inactiveLabels: this.tabs.filter(t => t.id !== id).map(t => t.id),
          rect
        });
      }
    }
  }

  async closeTab(id: string) {
    const index = this.tabs.findIndex(t => t.id === id);
    if (index === -1) return;
    this.tabs[index].domElement.remove();
    this.tabs.splice(index, 1);
    await invoke("close_tab", { label: id });
    if (this.tabs.length === 0) this.createNewTab();
    else if (this.activeTabId === id) this.switchTab(this.tabs[Math.max(0, index - 1)].id);
  }

  async navigate(input: string) {
    const url = this.processUrl(input);
    if (!url || !this.activeTabId) return;
    const activeTab = this.tabs.find(t => t.id === this.activeTabId);
    if (activeTab) {
      activeTab.url = url;
      document.getElementById("home-page")!.style.display = "none";
      await invoke("navigate_tab", { label: this.activeTabId, url, rect: this.getContentRect() });
      this.updateUrlStatus(url);
    }
  }

  processUrl(input: string): string | null {
    input = input.trim();
    if (!input) return null;
    if (/^https?:\/\//i.test(input)) return input;
    if (/^localhost(:[0-9]+)?/i.test(input) || /^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+(:[0-9]+)?/.test(input)) return "http://" + input;
    const domainRegex = /^[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,}(:[0-9]+)?([/?#].*)?$/i;
    if (domainRegex.test(input) && !input.includes(" ")) return "https://" + input;
    return this.settings.search_engine + encodeURIComponent(input);
  }

  showHomePage() {
    const homePage = document.getElementById("home-page") as HTMLElement;
    homePage.style.display = "flex";
    (document.getElementById("url-bar") as HTMLInputElement).value = "";
    if (this.activeTabId) {
      const activeTab = this.tabs.find(t => t.id === this.activeTabId);
      if (activeTab) activeTab.url = "";
      invoke("switch_tab", { activeLabel: "none", inactiveLabels: this.tabs.map(t => t.id), rect: { x:0, y:0, width:0, height:0 } });
    }
    this.renderSpeedDial();
  }

  getContentRect() {
    const area = document.getElementById("content-area");
    const rect = area?.getBoundingClientRect() || { x: 0, y: 0, width: 0, height: 0 };
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  }

  syncActiveTabRect() {
    if (this.activeTabId && document.getElementById("home-page")?.style.display === "none") {
      invoke("update_webview_rect", { label: this.activeTabId, rect: this.getContentRect() });
    }
  }

  updateUrlStatus(url: string) {
    const isHttps = url.startsWith("https");
    document.getElementById("icon-lock")?.classList.toggle("hidden", !isHttps);
    document.getElementById("icon-warning")?.classList.toggle("hidden", isHttps);
  }

  async loadHistory() {
    try {
      this.history = await invoke("get_history");
      this.renderHistory();
    } catch (e) { console.error(e); }
  }

  renderHistory(filter: string = "") {
    const list = document.getElementById("history-list");
    if (!list) return;
    const items = filter
      ? this.history.filter(h => h.url.includes(filter) || h.title.includes(filter))
      : this.history;

    list.innerHTML = items.map(item => `
      <div class="history-item" onclick="window.browser.navigate('${item.url}')">
        <div class="history-title">${item.title || item.url}</div>
        <div class="history-url">${item.url}</div>
      </div>
    `).join("");
  }

  async clearHistory() {
    if (confirm(this.t("clear_history_confirm"))) {
      await invoke("clear_history");
      this.history = [];
      this.renderHistory();
    }
  }

  addDownload(url: string, path: string) {
    const name = path.split(/[\\/]/).pop() || "download";
    const dl: Download = { url, path, progress: 0, status: "downloading" };

    const list = document.getElementById("downloads-list");
    const dlEl = document.createElement("div");
    dlEl.className = "download-item";
    dlEl.innerHTML = `
      <div class="download-info">
        <span class="download-name">${name}</span>
        <span class="download-status">${this.t("downloading")}</span>
      </div>
      <div class="progress-bar"><div class="progress-fill" style="width: 50%"></div></div>
    `;
    list?.prepend(dlEl);
    dl.domElement = dlEl;
    this.downloads.push(dl);
    this.toggleSidebar("downloads-sidebar", true);
  }

  updateDownloadStatus(url: string, status: "finished" | "error") {
    const dl = this.downloads.find(d => d.url === url);
    if (dl && dl.domElement) {
      dl.status = status;
      const statusEl = dl.domElement.querySelector(".download-status");
      const progressFill = dl.domElement.querySelector(".progress-fill") as HTMLElement;
      if (statusEl) statusEl.textContent = this.t(status);
      if (progressFill) progressFill.style.width = status === "finished" ? "100%" : "0%";
    }
  }

  renderSpeedDial() {
    const dial = document.getElementById("speed-dial");
    if (!dial) return;
    const defaults = [
      { url: "https://www.google.com", name: "Google", icon: "G" },
      { url: "https://www.youtube.com", name: "YouTube", icon: "Y" },
      { url: "https://www.facebook.com", name: "Facebook", icon: "F" },
      { url: "https://www.github.com", name: "GitHub", icon: "Git" }
    ];
    dial.innerHTML = defaults.map(site => `
      <div class="dial-item" onclick="window.browser.navigate('${site.url}')">
        <div class="dial-icon">${site.icon}</div>
        <div class="dial-label">${site.name}</div>
      </div>
    `).join("");
  }

  toggleSidebar(id: string, show?: boolean) {
    const el = document.getElementById(id);
    const isHidden = el?.classList.contains("hidden");
    const targetShow = show !== undefined ? show : isHidden;
    el?.classList.toggle("hidden", !targetShow);
    if (id === "history-sidebar" && targetShow) this.loadHistory();
  }

  toggleModal(id: string, show: boolean) {
    document.getElementById(id)?.classList.toggle("hidden", !show);
  }
}

(window as any).browser = new Browser();
