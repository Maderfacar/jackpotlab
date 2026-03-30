// --- 基礎 UI 邏輯 ---
function toggleSidebar() {
    const sb = document.getElementById('sidebar');
    const ov = document.getElementById('overlay');
    sb.classList.toggle('-translate-x-full');
    ov.classList.toggle('hidden');
    ov.classList.toggle('opacity-100');
}

function toggleTheme() { document.documentElement.classList.toggle('dark'); }

// SPA 視圖切換 (回歸最穩定的 ID 切換邏輯)
window.switchView = (viewId) => {
    // 1. 隱藏所有視圖
    document.querySelectorAll('.spa-view').forEach(v => v.classList.add('hidden'));
    
    // 2. 顯示目標視圖
    const targetView = document.getElementById(`view-${viewId}`);
    if (targetView) {
        targetView.classList.remove('hidden');
    }
    
    // 3. 更新底部導覽鈕顏色
    document.querySelectorAll('.tab-item').forEach(btn => {
        btn.classList.remove('text-cyan-500');
        btn.classList.add('text-slate-400');
    });
    
    // 4. 高亮當前按鈕 (透過檢查 onclick 屬性對齊)
    const activeTab = Array.from(document.querySelectorAll('.tab-item')).find(btn => 
        btn.getAttribute('onclick')?.includes(`'${viewId}'`)
    );
    if (activeTab) {
        activeTab.classList.remove('text-slate-400');
        activeTab.classList.add('text-cyan-500');
    }

    // 5. 如果進入分析頁，執行渲染
    if (viewId === 'terminal') {
        renderTerminalData();
    }

    // 側邊欄自動關閉
    const sidebar = document.getElementById('sidebar');
    if (sidebar && !sidebar.classList.contains('-translate-x-full')) {
        toggleSidebar();
    }
};

// --- LIFF 與 Firebase 核心邏輯 ---
async function initLIFF() {
    const liffId = "2009636686-ec6thLNX"; 
    try {
        await liff.init({ liffId });
        if (liff.isLoggedIn()) {
            const profile = await liff.getProfile();
            renderLoginState(profile);
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

function renderLogoutState() {
    const loginBtn = document.getElementById('liffLoginBtn');
    if(loginBtn) {
        document.getElementById('userName').innerText = "點擊登入";
        loginBtn.onclick = () => liff.login();
    }
    const mPicBox = document.getElementById('mobileUser');
    if(mPicBox) mPicBox.onclick = () => liff.login();
}

// --- 工具箱顯示/隱藏邏輯 ---
window.minimizeToolbox = () => {
    const tb = document.getElementById('toolbox');
    const dot = document.getElementById('dot');
    if (!tb || !dot) return;
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
    if (!tb || !dot) return;
    tb.classList.remove('hidden');
    dot.style.display = 'none';
    dot.classList.add('hidden');
    setTimeout(() => {
        tb.classList.remove('translate-y-[120%]', 'opacity-0');
    }, 50);
};

// --- 工具箱分頁切換函數 ---
window.switchTab = (tab) => {
    const pNotes = document.getElementById('p-notes');
    const pCalc = document.getElementById('p-calc');
    const btnNotes = document.getElementById('tabNotes');
    const btnCalc = document.getElementById('tabCalc');
    if (!pNotes || !pCalc) return;

    if (tab === 'notes') {
        pNotes.style.display = 'block';
        pCalc.style.display = 'none';
        btnNotes.className = "flex-1 py-3 text-[10px] font-bold border-b-2 border-cyan-500 text-cyan-500";
        btnCalc.className = "flex-1 py-3 text-[10px] font-bold text-slate-400";
    } else {
        pNotes.style.display = 'none';
        pCalc.style.display = 'flex';
        btnCalc.className = "flex-1 py-3 text-[10px] font-bold border-b-2 border-cyan-500 text-cyan-500";
        btnNotes.className = "flex-1 py-3 text-[10px] font-bold text-slate-400";
    }
};

// --- 計算機運算邏輯 ---
let currentInput = "";
window.cin = (val) => {
    currentInput += val.toString();
    const disp = document.getElementById('disp');
    if (disp) disp.innerText = currentInput;
};

window.ccr = () => {
    currentInput = "";
    const disp = document.getElementById('disp');
    if (disp) disp.innerText = "0";
};

window.crs = () => {
    try {
        if (!currentInput) return;
        const result = new Function(`return ${currentInput}`)();
        currentInput = result.toString();
        const disp = document.getElementById('disp');
        if (disp) disp.innerText = currentInput;
    } catch (e) {
        const disp = document.getElementById('disp');
        if (disp) disp.innerText = "ERR";
        currentInput = "";
    }
};

// --- [分析列表渲染] ---
function renderTerminalData() {
    const list = document.getElementById('history-list');
    if (!list) return;

    const items = [
        { id: '240030', date: '03/30', nums: ['05','12','18','24','33'], sum: 92 },
        { id: '240029', date: '03/29', nums: ['01','10','15','22','39'], sum: 87 },
        { id: '240028', date: '03/28', nums: ['07','11','19','28','35'], sum: 100 }
    ];

    list.innerHTML = items.map(item => `
        <div class="border-b border-lab-border p-4 hover:bg-white/5 transition-all cursor-pointer" onclick="window.toggleDetail(this)">
            <div class="flex items-center justify-between">
                <div class="flex flex-col w-14">
                    <span class="text-[10px] font-mono text-cyan-500">#${item.id}</span>
                    <span class="text-[9px] opacity-40 text-lab-text">${item.date}</span>
                </div>
                <div class="flex gap-1.5 flex-1 justify-center">
                    ${item.nums.map(n => `<span class="w-7 h-7 flex items-center justify-center rounded-full bg-slate-900 border border-lab-border text-xs font-bold text-cyan-400">${n}</span>`).join('')}
                </div>
                <div class="text-right w-10 text-[10px] font-bold text-slate-300">Σ ${item.sum}</div>
            </div>
            <div class="detail-panel hidden mt-4 pt-4 border-t border-dashed border-lab-border grid grid-cols-2 gap-2">
                <div class="text-[10px] flex justify-between px-2"><span class="opacity-50 text-xs">單雙</span><span class="text-cyan-600">3:2</span></div>
                <div class="text-[10px] flex justify-between px-2"><span class="opacity-50 text-xs">狀態</span><span class="text-cyan-600">數據對齊</span></div>
            </div>
        </div>
    `).join('');
}

window.toggleDetail = (el) => {
    const detail = el.querySelector('.detail-panel');
    if (detail) detail.classList.toggle('hidden');
};

// --- 啟動初始化 ---
document.addEventListener("DOMContentLoaded", () => {
    initLIFF();
    renderTerminalData();
});
