import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface Tab {
  id: string;
  url: string;
  title: string;
  active: boolean;
  domElement: HTMLElement;
}

class Browser {
  tabs: Tab[] = [];
  activeTabId: string | null = null;
  history: any[] = [];

  constructor() {
    this.initEventListeners();
    this.createNewTab(); // Initial tab
    this.loadHistory();
  }

  initEventListeners() {
    // Navigation Buttons
    document.getElementById("btn-back")?.addEventListener("click", () => this.activeTabId && invoke("go_back", { label: this.activeTabId }));
    document.getElementById("btn-forward")?.addEventListener("click", () => this.activeTabId && invoke("go_forward", { label: this.activeTabId }));
    document.getElementById("btn-refresh")?.addEventListener("click", () => this.activeTabId && invoke("refresh_page", { label: this.activeTabId }));

    document.getElementById("btn-home")?.addEventListener("click", () => this.showHomePage());
    document.getElementById("btn-new-tab")?.addEventListener("click", () => this.createNewTab());

    // Search / URL Bar
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

    // History
    document.getElementById("btn-history-toggle")?.addEventListener("click", () => this.toggleHistory());
    document.getElementById("btn-close-history")?.addEventListener("click", () => this.toggleHistory(false));

    // Tauri Events
    listen("url-changed", (event: any) => {
      const { label, url } = event.payload;
      const tab = this.tabs.find(t => t.id === label);
      if (tab) {
        tab.url = url;
        if (this.activeTabId === label) {
          urlBar.value = url;
          this.updateUrlStatus(url);
          invoke("add_history", { url, title: url }); // Simplified title
        }
      }
    });

    listen("window-resized", () => this.syncActiveTabRect());
    window.addEventListener("resize", () => this.syncActiveTabRect());
  }

  createNewTab() {
    const id = `tab_${Date.now()}`;
    const tabBar = document.getElementById("tab-bar");
    const newTabBtn = document.getElementById("btn-new-tab");

    const tabEl = document.createElement("div");
    tabEl.className = "tab";
    tabEl.id = id;
    tabEl.innerHTML = `
      <span class="tab-title">تبويب جديد</span>
      <button class="tab-close">✕</button>
    `;

    tabEl.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).className !== "tab-close") {
        this.switchTab(id);
      }
    });

    tabEl.querySelector(".tab-close")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.closeTab(id);
    });

    tabBar?.insertBefore(tabEl, newTabBtn);

    const newTab: Tab = {
      id,
      url: "",
      title: "تبويب جديد",
      active: false,
      domElement: tabEl
    };

    this.tabs.push(newTab);
    this.switchTab(id);
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

    const tab = this.tabs[index];
    tab.domElement.remove();
    this.tabs.splice(index, 1);
    await invoke("close_tab", { label: id });

    if (this.tabs.length === 0) {
      this.createNewTab();
    } else if (this.activeTabId === id) {
      const nextTab = this.tabs[Math.max(0, index - 1)];
      this.switchTab(nextTab.id);
    }
  }

  async navigate(input: string) {
    const url = this.processUrl(input);
    if (!url || !this.activeTabId) return;

    const activeTab = this.tabs.find(t => t.id === this.activeTabId);
    if (activeTab) {
      activeTab.url = url;
      document.getElementById("home-page")! .style.display = "none";
      const rect = this.getContentRect();
      await invoke("navigate_tab", { label: this.activeTabId, url, rect });
      this.updateUrlStatus(url);
    }
  }

  processUrl(input: string): string | null {
    input = input.trim();
    if (!input) return null;
    if (/^https?:\/\//i.test(input)) return input;
    if (/^localhost(:[0-9]+)?/i.test(input) || /^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+(:[0-9]+)?/.test(input)) return "http://" + input;
    const domainRegex = /^[a-z0-9-]+(\.[a-z0-9-]+)+([/?#].*)?$/i;
    if (domainRegex.test(input) && !input.includes(" ")) return "https://" + input;
    return "https://www.startpage.com/sp/search?query=" + encodeURIComponent(input);
  }

  showHomePage() {
    const homePage = document.getElementById("home-page") as HTMLElement;
    homePage.style.display = "flex";
    const urlBar = document.getElementById("url-bar") as HTMLInputElement;
    urlBar.value = "";

    if (this.activeTabId) {
      const activeTab = this.tabs.find(t => t.id === this.activeTabId);
      if (activeTab) activeTab.url = "";

      // "Hide" the active webview by moving it out or resizing to 0
      invoke("switch_tab", {
        activeLabel: "none", // Will fail to find "none", effectively hiding current
        inactiveLabels: this.tabs.map(t => t.id),
        rect: { x: 0, y: 0, width: 0, height: 0 }
      });
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
    const iconLock = document.getElementById("icon-lock");
    const iconWarning = document.getElementById("icon-warning");
    if (url.startsWith("https")) {
      iconLock?.classList.remove("hidden");
      iconWarning?.classList.add("hidden");
    } else {
      iconLock?.classList.add("hidden");
      iconWarning?.classList.remove("hidden");
    }
  }

  async loadHistory() {
    try {
      this.history = await invoke("get_history");
      this.renderHistory();
    } catch (e) {
      console.error(e);
    }
  }

  renderHistory() {
    const list = document.getElementById("history-list");
    if (!list) return;
    list.innerHTML = this.history.map(item => `
      <div class="history-item" onclick="window.browser.navigate('${item.url}')">
        <div class="history-title">${item.title || item.url}</div>
        <div class="history-url">${item.url}</div>
      </div>
    `).join("");
  }

  renderSpeedDial() {
    const dial = document.getElementById("speed-dial");
    if (!dial) return;
    // Default sites + some history
    const defaults = [
      { url: "https://www.google.com", name: "Google", icon: "G" },
      { url: "https://www.youtube.com", name: "YouTube", icon: "Y" },
      { url: "https://www.github.com", name: "GitHub", icon: "Git" }
    ];
    dial.innerHTML = defaults.map(site => `
      <div class="dial-item" onclick="window.browser.navigate('${site.url}')">
        <div class="dial-icon">${site.icon}</div>
        <div class="dial-label">${site.name}</div>
      </div>
    `).join("");
  }

  toggleHistory(show?: boolean) {
    const sidebar = document.getElementById("history-sidebar");
    const isHidden = sidebar?.classList.contains("hidden");
    const shouldShow = show !== undefined ? show : isHidden;
    sidebar?.classList.toggle("hidden", !shouldShow);
    if (shouldShow) this.loadHistory();
  }
}

// Global instance for onclick handlers in template strings
(window as any).browser = new Browser();
