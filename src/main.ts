import { invoke } from "@tauri-apps/api/core";

// Get UI elements
const urlBar = document.getElementById("url-bar") as HTMLInputElement;
const btnGo = document.getElementById("btn-go") as HTMLButtonElement;
const btnBack = document.getElementById("btn-back") as HTMLButtonElement;
const btnForward = document.getElementById("btn-forward") as HTMLButtonElement;
const btnRefresh = document.getElementById("btn-refresh") as HTMLButtonElement;
const homeSearch = document.getElementById("home-search") as HTMLInputElement;
const homeSearchBtn = document.getElementById("home-search-btn") as HTMLButtonElement;
const homePage = document.getElementById("home-page") as HTMLElement;
const urlIcon = document.getElementById("url-icon") as HTMLElement;

// Process URL input (add https:// or search)
function processUrl(input: string): string | null {
  input = input.trim();
  if (!input) return null;
  if (/^https?:\/\//i.test(input)) return input;
  if (/^[\w-]+\.[\w.]{2,}/.test(input)) return "https://" + input;
  return "https://www.google.com/search?q=" + encodeURIComponent(input);
}

// Navigate to URL
async function navigate(input: string) {
  const url = processUrl(input);
  if (!url) return;

  urlBar.value = url;
  homePage.style.display = "none";
  urlIcon.textContent = url.startsWith("https") ? "🔒" : "⚠️";

  // Enable navigation buttons
  btnBack.disabled = false;
  btnForward.disabled = false;
  btnRefresh.disabled = false;

  try {
    await invoke("navigate_to", { url });
  } catch (e) {
    console.error("Navigation error:", e);
  }
}

// Navigation button event listeners
btnBack.addEventListener("click", async () => {
  try {
    await invoke("go_back");
  } catch (e) {
    console.error(e);
  }
});

btnForward.addEventListener("click", async () => {
  try {
    await invoke("go_forward");
  } catch (e) {
    console.error(e);
  }
});

btnRefresh.addEventListener("click", async () => {
  try {
    await invoke("refresh_page");
  } catch (e) {
    console.error(e);
  }
});

// URL bar event listeners
btnGo.addEventListener("click", () => navigate(urlBar.value));
urlBar.addEventListener("keydown", (e) => {
  if (e.key === "Enter") navigate(urlBar.value);
});

// Home page search event listeners
homeSearchBtn.addEventListener("click", () => navigate(homeSearch.value));
homeSearch.addEventListener("keydown", (e) => {
  if (e.key === "Enter") navigate(homeSearch.value);
});
