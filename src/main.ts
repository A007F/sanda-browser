import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

// Get UI elements
const urlBar = document.getElementById("url-bar") as HTMLInputElement;
const btnGo = document.getElementById("btn-go") as HTMLButtonElement;
const btnBack = document.getElementById("btn-back") as HTMLButtonElement;
const btnForward = document.getElementById("btn-forward") as HTMLButtonElement;
const btnRefresh = document.getElementById("btn-refresh") as HTMLButtonElement;
const btnHome = document.getElementById("btn-home") as HTMLButtonElement;
const homeSearch = document.getElementById("home-search") as HTMLInputElement;
const homeSearchBtn = document.getElementById("home-search-btn") as HTMLButtonElement;
const homePage = document.getElementById("home-page") as HTMLElement;
const contentArea = document.getElementById("content-area") as HTMLElement;
const iconLock = document.getElementById("icon-lock") as HTMLElement;
const iconWarning = document.getElementById("icon-warning") as HTMLElement;

// Privacy Shield elements
const btnShield = document.getElementById("btn-shield") as HTMLButtonElement;
const shieldPanel = document.getElementById("shield-panel") as HTMLElement;
const shieldClose = document.getElementById("shield-close") as HTMLButtonElement;
const opacitySlider = document.getElementById("opacity-slider") as HTMLInputElement;
const opacityValue = document.getElementById("opacity-value") as HTMLElement;

// Listen for URL changes from Rust (if implemented in Rust to emit this)
listen("url-changed", (event: any) => {
  const url = event.payload as string;
  urlBar.value = url;

  if (url.startsWith("https")) {
    iconLock.classList.remove("hidden");
    iconWarning.classList.add("hidden");
  } else {
    iconLock.classList.add("hidden");
    iconWarning.classList.remove("hidden");
  }
});

// Listen for window resize from Rust to sync webview rect
listen("window-resized", () => {
  updateWebviewRect();
});

function getWebviewRect() {
  const rect = contentArea.getBoundingClientRect();
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  };
}

async function updateWebviewRect() {
  if (homePage.style.display === "none") {
    try {
      await invoke("update_webview_rect", { rect: getWebviewRect() });
    } catch (e) {
      console.error("Failed to update webview rect:", e);
    }
  }
}

// Process URL input
function processUrl(input: string): string | null {
  input = input.trim();
  if (!input) return null;

  // If it already has a protocol, return as is
  if (/^https?:\/\//i.test(input)) return input;

  // If it starts with localhost or an IP address
  if (/^localhost(:[0-9]+)?/i.test(input) || /^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+(:[0-9]+)?/.test(input)) {
    return "http://" + input;
  }

  // Check if it's a domain (contains a dot, no spaces, and not starting with a dot)
  // We allow paths, query params, etc.
  const domainRegex = /^[a-z0-9-]+(\.[a-z0-9-]+)+([/?#].*)?$/i;
  if (domainRegex.test(input) && !input.includes(" ")) {
    return "https://" + input;
  }

  // Default to Startpage search
  return "https://www.startpage.com/sp/search?query=" + encodeURIComponent(input);
}

// Navigate to URL
async function navigate(input: string) {
  const url = processUrl(input);
  if (!url) return;

  homePage.style.display = "none";
  urlBar.value = url;

  try {
    const rect = getWebviewRect();
    await invoke("navigate_to", { url, rect });

    btnBack.disabled = false;
    btnForward.disabled = false;
    btnRefresh.disabled = false;
  } catch (e) {
    console.error("Navigation error:", e);
  }
}

// Navigation button event listeners
btnBack.addEventListener("click", () => invoke("go_back"));
btnForward.addEventListener("click", () => invoke("go_forward"));
btnRefresh.addEventListener("click", () => invoke("refresh_page"));
btnHome.addEventListener("click", async () => {
  homePage.style.display = "flex";
  urlBar.value = "";
  btnBack.disabled = true;
  btnForward.disabled = true;
  btnRefresh.disabled = true;
  try {
    await invoke("close_browser_view");
  } catch (e) {
    console.error(e);
  }
});

// URL bar event listeners
btnGo.addEventListener("click", () => navigate(urlBar.value));
urlBar.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    navigate(urlBar.value);
    urlBar.blur();
  }
});
urlBar.addEventListener("focus", () => urlBar.select());

// Home page search event listeners
homeSearchBtn.addEventListener("click", () => navigate(homeSearch.value));
homeSearch.addEventListener("keydown", (e) => {
  if (e.key === "Enter") navigate(homeSearch.value);
});

// Privacy Shield
if (btnShield) {
  btnShield.addEventListener("click", () => {
    shieldPanel.classList.toggle("hidden");
    btnShield.classList.toggle("active");
  });
}

if (shieldClose) {
  shieldClose.addEventListener("click", () => {
    shieldPanel.classList.add("hidden");
    btnShield.classList.remove("active");
  });
}

if (opacitySlider) {
  opacitySlider.addEventListener("input", async () => {
    const val = parseInt(opacitySlider.value);
    opacityValue.textContent = val + "%";
    try {
      await invoke("set_opacity", { opacity: val / 100 });
    } catch (e) {
      console.error(e);
    }
  });
}

// Sync rect on window resize (from JS side too)
window.addEventListener("resize", updateWebviewRect);
