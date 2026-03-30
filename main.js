// --- 基礎 UI 邏輯 ---
function toggleSidebar() {
    const sb = document.getElementById('sidebar');
    const ov = document.getElementById('overlay');
    sb.classList.toggle('-translate-x-full');
    ov.classList.toggle('hidden');
    ov.classList.toggle('opacity-100');
}

function toggleTheme() { document.documentElement.classList.toggle('dark'); }

// SPA 視圖切換
window.switchView = (viewId) => {
    document.querySelectorAll('.spa-view').forEach(v => v.classList.add('hidden'));
    document.getElementById(`view-${viewId}`)?.classList.remove('hidden');
    
    // 更新導覽鈕顏色
    document.querySelectorAll('.tab-item').forEach(btn => btn.classList.replace('text-cyan-500', 'text-slate-400'));
    if (event?.currentTarget) {
        event.currentTarget.classList.replace('text-slate-400', 'text-cyan-500');
    }
    if (!document.getElementById('sidebar').classList.contains('-translate-x-full')) toggleSidebar();
};

// --- LIFF 與 Firebase 核心邏輯 ---
async function initLIFF() {
    const liffId = "2009636686-ec6thLNX"; 
    try {
        await liff.init({ liffId });
        
        if (liff.isLoggedIn()) {
            const profile = await liff.getProfile();
            renderLoginState(profile);
            
            // 確保 Firebase 函數載入後執行同步
            const checkSync = () => {
                if (typeof window.syncUserToFirebase === "function") {
                    window.syncUserToFirebase(profile);
                } else {
                    setTimeout(checkSync, 500);
                }
            };
            checkSync();
        } else {
            renderLogoutState();
        }
    } catch (err) {
        console.error("LIFF 初始化失敗", err);
    }
}

// 渲染「已登入」狀態
function renderLoginState(profile) {
    const els = {
        name: document.getElementById('userName'),
        id: document.getElementById('userId'),
        pic: document.getElementById('userPicture'),
        mPic: document.getElementById('userPictureMobile'),
        btn: document.getElementById('liffLoginBtn')
    };

    if(els.name) els.name.innerText = profile.displayName;
    if(els.id) els.id.innerText = `ID: ${profile.userId.substring(0, 8)}`;
    if(els.pic) { els.pic.src = profile.pictureUrl; els.pic.style.opacity = "1"; }
    if(els.mPic) { els.mPic.src = profile.pictureUrl; els.mPic.classList.remove('hidden'); }

    // 綁定點擊頭像 = 詢問是否登出 (解決你沒登出鈕的問題)
    const handleLogout = () => {
        if (confirm("確定要登出並切換帳號嗎？")) {
            liff.logout();
            window.location.reload();
        }
    };
    if(els.btn) els.btn.onclick = handleLogout;
    if(els.mPic) els.mPic.parentElement.onclick = handleLogout;
}

// 渲染「未登入」狀態
function renderLogoutState() {
    const loginBtn = document.getElementById('liffLoginBtn');
    if(loginBtn) {
        document.getElementById('userName').innerText = "點擊登入";
        loginBtn.onclick = () => liff.login();
    }
    // 手機版頭像框點擊也觸發登入
    const mPicBox = document.getElementById('mobileUser');
    if(mPicBox) mPicBox.onclick = () => liff.login();
}

// [修正] 工具箱顯示邏輯
window.minimizeToolbox = () => {
    const tb = document.getElementById('toolbox');
    const dot = document.getElementById('dot');
    tb.classList.add('translate-y-[120%]', 'opacity-0');
    setTimeout(() => {
        tb.classList.add('hidden');
        dot.style.display = 'flex';
    }, 500);
};

window.restoreToolbox = () => {
    const tb = document.getElementById('toolbox');
    const dot = document.getElementById('dot');
    tb.classList.remove('hidden');
    dot.style.display = 'none';
    setTimeout(() => {
        tb.classList.remove('translate-y-[120%]', 'opacity-0');
    }, 10);
};

// [修正] 計算機運算邏輯
let currentInput = "";
window.cin = (val) => {
    currentInput += val;
    document.getElementById('disp').innerText = currentInput;
};
window.ccr = () => {
    currentInput = "";
    document.getElementById('disp').innerText = "0";
};
window.crs = () => {
    try {
        // 防止空輸入
        if(!currentInput) return;
        const result = eval(currentInput); 
        currentInput = result.toString();
        document.getElementById('disp').innerText = currentInput;
    } catch (e) {
        document.getElementById('disp').innerText = "ERR";
        currentInput = "";
    }
};

// 啟動
document.addEventListener("DOMContentLoaded", initLIFF);
