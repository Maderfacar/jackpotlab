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
    const targetView = document.getElementById(`view-${viewId}`);
    if (targetView) targetView.classList.remove('hidden');
    
    // 更新導覽鈕顏色
    document.querySelectorAll('.tab-item').forEach(btn => {
        btn.classList.remove('text-cyan-500');
        btn.classList.add('text-slate-400');
    });
    
    if (event?.currentTarget) {
        event.currentTarget.classList.remove('text-slate-400');
        event.currentTarget.classList.add('text-cyan-500');
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
    const mPicBox = document.getElementById('mobileUser');
    if(mPicBox) mPicBox.onclick = () => liff.login();
}

// --- [修正] 工具箱顯示邏輯 - 中文與平滑動畫 ---
window.minimizeToolbox = () => {
    const tb = document.getElementById('toolbox');
    const dot = document.getElementById('dot');
    
    tb.classList.add('translate-y-[120%]', 'opacity-0');
    
    setTimeout(() => {
        tb.classList.add('hidden');
        dot.style.display = 'flex';
        dot.classList.remove('hidden');
    }, 500);
};

window.restoreToolbox = () => {
    const tb = document.getElementById('toolbox');
    const dot = document.getElementById('dot');
    
    // 1. 先從 DOM 顯示出來 (hidden 移除)
    tb.classList.remove('hidden');
    // 2. 隱藏小工具圓點
    dot.style.display = 'none';
    dot.classList.add('hidden');
    
    // 3. 延遲觸發動畫，讓元素滑入
    setTimeout(() => {
        tb.classList.remove('translate-y-[120%]', 'opacity-0');
    }, 50);
};

// [修正] 便條紙與計算機切換
document.getElementById('tabNotes').onclick = function() {
    document.getElementById('p-notes').style.display = 'block';
    document.getElementById('p-calc').style.display = 'none';
    this.className = "flex-1 py-3 text-[10px] font-bold border-b-2 border-cyan-500 text-cyan-500";
    document.getElementById('tabCalc').className = "flex-1 py-3 text-[10px] font-bold text-slate-400";
};

document.getElementById('tabCalc').onclick = function() {
    document.getElementById('p-notes').style.display = 'none';
    document.getElementById('p-calc').style.display = 'flex';
    this.className = "flex-1 py-3 text-[10px] font-bold border-b-2 border-cyan-500 text-cyan-500";
    document.getElementById('tabNotes').className = "flex-1 py-3 text-[10px] font-bold text-slate-400";
};

// [修正] 計算機運算
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
        if(!currentInput) return;
        const result = new Function(`return ${currentInput}`)();
        currentInput = result.toString();
        document.getElementById('disp').innerText = currentInput;
    } catch (e) {
        document.getElementById('disp').innerText = "ERR";
        currentInput = "";
    }
};

// 啟動
document.addEventListener("DOMContentLoaded", initLIFF);
