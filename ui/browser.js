const { invoke } = window.__TAURI__.core;

document.getElementById('btn-back').addEventListener('click', async () => {
    try { await invoke('go_back'); } catch(e) { console.error(e); }
});

document.getElementById('btn-forward').addEventListener('click', async () => {
    try { await invoke('go_forward'); } catch(e) { console.error(e); }
});

document.getElementById('btn-refresh').addEventListener('click', async () => {
    try { await invoke('refresh_page'); } catch(e) { console.error(e); }
});

document.getElementById('btn-bookmark').addEventListener('click', () => {
    // لاحقاً
    console.log('bookmark');
});

document.getElementById('btn-privacy').addEventListener('click', () => {
    // لاحقاً
    console.log('privacy');
});

document.getElementById('btn-settings').addEventListener('click', () => {
    // لاحقاً
    console.log('settings');
});
