// UI 響應式邏輯
function toggleSidebar() {
    const sb = document.getElementById('sidebar');
    const ov = document.getElementById('overlay');
    const isHidden = sb.classList.contains('-translate-x-full');
    
    if (isHidden) {
        ov.classList.remove('hidden');
        setTimeout(() => {
            sb.classList.remove('-translate-x-full');
            ov.classList.add('opacity-100');
        }, 10);
    } else {
        sb.classList.add('-translate-x-full');
        ov.classList.remove('opacity-100');
        setTimeout(() => ov.classList.add('hidden'), 300);
    }
}

function toggleTheme() { document.documentElement.classList.toggle('dark'); }

// 工具箱縮放
window.minimizeToolbox = () => { 
    document.getElementById('toolbox').classList.add('translate-y-[120%]', 'opacity-0');
    setTimeout(() => {
        document.getElementById('toolbox').classList.add('hidden');
        document.getElementById('dot').classList.replace('hidden', 'flex');
    }, 500);
};

window.restoreToolbox = () => { 
    document.getElementById('toolbox').classList.remove('hidden');
    setTimeout(() => {
        document.getElementById('toolbox').classList.remove('translate-y-[120%]', 'opacity-0');
        document.getElementById('dot').classList.replace('flex', 'hidden');
    }, 10);
};

// 頁籤邏輯
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

// 計算機核心
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
        // 使用 Function 代替 eval 較為安全
        const result = new Function(`return ${currentInput}`)();
        currentInput = result.toString();
        document.getElementById('disp').innerText = currentInput;
    } catch (e) {
        document.getElementById('disp').innerText = "ERROR";
        currentInput = "";
    }
};

// --- [新增] SPA 視圖切換邏輯 ---
function switchView(viewId) {
    // 1. 隱藏所有視圖
    document.querySelectorAll('.spa-view').forEach(view => {
        view.classList.add('hidden');
    });
    // 2. 顯示點選的視圖
    const target = document.getElementById(`view-${viewId}`);
    if (target) target.classList.remove('hidden');

    // 3. 更新底部導覽按鈕樣式 (僅手機版)
    document.querySelectorAll('.tab-item').forEach(btn => {
        btn.classList.remove('text-cyan-500');
        btn.classList.add('text-slate-400');
    });
    // 高亮當前點擊的按鈕
    if (event && event.currentTarget) {
        event.currentTarget.classList.remove('text-slate-400');
        event.currentTarget.classList.add('text-cyan-500');
    }
}

// --- [修改] LIFF 初始化與 Firebase 銜接 ---
async function initLIFF() {
    const liffId = "2009636686-ec6thLNX"; 
    try {
        await liff.init({ liffId });
        console.log("LIFF Initialized");

        if (liff.isLoggedIn()) {
            const profile = await liff.getProfile();
            console.log("Profile Loaded:", profile.displayName);

            // 更新桌機版 UI
            const userNameEl = document.getElementById('userName');
            const userIdEl = document.getElementById('userId');
            const userPicEl = document.getElementById('userPicture');
            
            if(userNameEl) userNameEl.innerText = profile.displayName;
            if(userIdEl) userIdEl.innerText = `ID: ${profile.userId.substring(0, 10)}...`;
            if(userPicEl && profile.pictureUrl) {
                userPicEl.src = profile.pictureUrl;
                userPicEl.style.opacity = "1";
            }

            // 更新手機版 UI
            const mobilePicEl = document.getElementById('userPictureMobile');
            if (mobilePicEl && profile.pictureUrl) {
                mobilePicEl.src = profile.pictureUrl;
                mobilePicEl.classList.remove('hidden');
            }

            // 【核心銜接】呼叫 database.js 中的同步函數
            if (window.syncUserToFirebase) {
                window.syncUserToFirebase(profile);
            }

            // 移除登入點擊事件
            const loginBtn = document.getElementById('liffLoginBtn');
            if(loginBtn) loginBtn.onclick = null;

        } else {
            console.log("User not logged in");
            const loginBtn = document.getElementById('liffLoginBtn');
            if(loginBtn) loginBtn.onclick = () => liff.login();
        }
    } catch (err) {
        console.error("LIFF Init Failed", err);
    }
}

// 監聽載入
document.addEventListener("DOMContentLoaded", initLIFF);
