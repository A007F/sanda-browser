const { invoke } = window.__TAURI__.core;

const urlBar        = document.getElementById('url-bar');
const btnGo         = document.getElementById('btn-go');
const btnBack       = document.getElementById('btn-back');
const btnForward    = document.getElementById('btn-forward');
const btnRefresh    = document.getElementById('btn-refresh');
const homeSearch    = document.getElementById('home-search');
const homeSearchBtn = document.getElementById('home-search-btn');
const homePage      = document.getElementById('home-page');
const urlIcon       = document.getElementById('url-icon');

function processUrl(input) {
    input = input.trim();
    if (!input) return null;
    if (/^https?:\/\//i.test(input)) return input;
    if (/^[\w-]+\.[\w.]{2,}/.test(input)) return 'https://' + input;
    return 'https://www.startpage.com/sp/search?query=' + encodeURIComponent(input);
}

async function navigate(input) {
    const url = processUrl(input);
    if (!url) return;

    urlBar.value = url;
    homePage.style.display = 'none';
    urlIcon.textContent = url.startsWith('https') ? '🔒' : '⚠️';

    // Enable navigation buttons
    btnBack.disabled = false;
    btnForward.disabled = false;
    btnRefresh.disabled = false;

    try {
        await invoke('navigate_to', { url });
    } catch (e) {
        console.error('Navigation error:', e);
    }
}

// Navigation button event listeners
btnBack.addEventListener('click', async () => {
    try { await invoke('go_back'); } catch (e) { console.error(e); }
});

btnForward.addEventListener('click', async () => {
    try { await invoke('go_forward'); } catch (e) { console.error(e); }
});

btnRefresh.addEventListener('click', async () => {
    try { await invoke('refresh_page'); } catch (e) { console.error(e); }
});

btnGo.addEventListener('click', () => navigate(urlBar.value));
urlBar.addEventListener('keydown', e => {
    if (e.key === 'Enter') navigate(urlBar.value);
});
homeSearchBtn.addEventListener('click', () => navigate(homeSearch.value));
homeSearch.addEventListener('keydown', e => {
    if (e.key === 'Enter') navigate(homeSearch.value);
});
// ===== Privacy Shield =====
const btnShield   = document.getElementById('btn-shield');
const shieldPanel = document.getElementById('shield-panel');
const shieldClose = document.getElementById('shield-close');
const opacitySlider = document.getElementById('opacity-slider');
const opacityValue  = document.getElementById('opacity-value');

btnShield.addEventListener('click', () => {
    shieldPanel.classList.toggle('hidden');
    btnShield.classList.toggle('active');
});

shieldClose.addEventListener('click', () => {
    shieldPanel.classList.add('hidden');
    btnShield.classList.remove('active');
});

opacitySlider.addEventListener('input', async () => {
    const val = parseInt(opacitySlider.value);
    opacityValue.textContent = val + '%';
    try {
        await invoke('set_opacity', { opacity: val / 100 });
    } catch(e) {
        console.error(e);
    }
});
