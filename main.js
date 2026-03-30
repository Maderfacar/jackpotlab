function toggleSidebar() {
    const sb = document.getElementById('sidebar');
    const ov = document.getElementById('overlay');
    sb.classList.toggle('-translate-x-full');
    ov.classList.toggle('hidden');
    ov.classList.toggle('opacity-100');
}

function toggleTheme() { 
    document.documentElement.classList.toggle('dark'); 
}

window.switchView = (viewId) => {
    document.querySelectorAll('.spa-view').forEach(v => v.classList.add('hidden'));
    const targetView = document.getElementById(`view-${viewId}`);
    if (targetView) targetView.classList.remove('hidden');
    
    document.querySelectorAll('.tab-item').forEach(btn => {
        btn.classList.remove('text-cyan-500');
        btn.classList.add('text-slate-400');
    });
    
    const activeBtn = Array.from(document.querySelectorAll('.tab-item')).find(btn => btn.getAttribute('onclick') && btn.getAttribute('onclick').includes(viewId));
    if (activeBtn) {
        activeBtn.classList.remove('text-slate-400');
        activeBtn.classList.add('text-cyan-500');
    }
    
    if (window.innerWidth < 1024) {
        const sidebar = document.getElementById('sidebar');
        if (sidebar && !sidebar.classList.contains('-translate-x-full')) toggleSidebar();
    }
};

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
        pic: document.getElementById('userPicture'),
        mPic: document.getElementById('userPictureMobile'),
        btn: document.getElementById('liffLoginBtn')
    };
    if(els.name) els.name.innerText = profile.displayName;
    if(els.pic) { 
        els.pic.src = profile.pictureUrl; 
        els.pic.style.opacity = "1"; 
    }
    if(els.mPic) { 
        els.mPic.src = profile.pictureUrl; 
        els.mPic.classList.remove('hidden'); 
    }

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
    }, 50);
};

window.switchTab = (tab) => {
    const pNotes = document.getElementById('p-notes');
    const pCalc = document.getElementById('p-calc');
    const btnNotes = document.getElementById('tabNotes');
    const btnCalc = document.getElementById('tabCalc');

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

let currentInput = "";
window.cin = (val) => {
    currentInput += val.toString();
    const disp = document.getElementById('disp');
    if (disp) disp.innerText = currentInput || "0";
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
        if (disp) {
            disp.innerText = "ERR";
            setTimeout(() => { if (disp.innerText === "ERR") disp.innerText = "0"; }, 800);
        }
        currentInput = "";
    }
};

document.addEventListener("DOMContentLoaded", initLIFF);


// ====================== 歷史網格記錄功能 ======================

window.loadHistoryGrid = async function() {
    const table = document.getElementById('historyGrid');
    if (!table) return;

    const startInput = document.getElementById('startPeriod').value.trim();
    const endInput = document.getElementById('endPeriod').value.trim();

    table.innerHTML = `<tr><td colspan="8" class="py-12 text-center text-slate-400">載入中...</td></tr>`;

    try {
        let data = await window.getDrawsByType("今彩539", 300);
        if (data.length === 0) {
            table.innerHTML = `<tr><td colspan="8" class="py-12 text-center text-slate-400">尚無資料，請先使用匯入工具</td></tr>`;
            return;
        }

        if (startInput) data = data.filter(item => item.period >= startInput);
        if (endInput) data = data.filter(item => item.period <= endInput);
        data = data.slice(0, 200);

        let html = `<thead><tr class="bg-lab-bg border-b border-lab-border">`;
        html += `<th class="px-2 py-3 text-center text-[10px] font-bold text-slate-400 border-r border-lab-border">期數</th>`;
        html += `<th class="px-2 py-3 text-center text-[10px] font-bold text-slate-400 border-r border-lab-border">日期</th>`;
        html += `<th class="px-2 py-3 text-center text-[10px] font-bold text-slate-400 border-r border-lab-border">星期</th>`;
        for (let i = 1; i <= 5; i++) {
            html += `<th class="px-3 py-3 text-center text-[10px] font-bold text-slate-400 border-r border-lab-border">${i}</th>`;
        }
        html += `</tr></thead><tbody class="text-sm">`;

        const sortedData = [...data].sort((a, b) => a.period.localeCompare(b.period));

        for (const item of sortedData) {
            const periodTail = item.period ? item.period.slice(-3) : '---';
            const dateObj = new Date(item.drawDate);
            const monthDay = isNaN(dateObj.getTime()) ? '---' : `${dateObj.getMonth()+1}/${dateObj.getDate()}`;
            const weekday = ['日','一','二','三','四','五','六'][dateObj.getDay()] || '—';

            html += `<tr class="border-b border-lab-border">`;
            html += `<td class="px-2 py-3 text-center font-mono border-r border-lab-border">${periodTail}</td>`;
            html += `<td class="px-2 py-3 text-center border-r border-lab-border">${monthDay}</td>`;
            html += `<td class="px-2 py-3 text-center border-r border-lab-border">${weekday}</td>`;

            (item.numbers || []).forEach((num, idx) => {
                const cellId = `${periodTail}_${idx+4}`;
                html += `<td onclick="window.showHighlightPanel('${cellId}', this)" 
                             class="highlight-cell px-3 py-3 text-center font-mono border-r border-lab-border" 
                             data-cell-id="${cellId}">${num.toString().padStart(2, '0')}</td>`;
            });
            html += `</tr>`;
        }
        html += `</tbody>`;
        table.innerHTML = html;

        window.loadHighlightsFromLocalStorage();

    } catch (err) {
        console.error(err);
        table.innerHTML = `<tr><td colspan="8" class="py-12 text-center text-red-400">載入失敗</td></tr>`;
    }
};

// 彈出選擇面板
let currentCellElement = null;
let currentCellId = null;

window.showHighlightPanel = function(cellId, element) {
    currentCellElement = element;
    currentCellId = cellId;

    const panelHTML = `
        <div class="fixed inset-0 bg-black/70 z-[80] flex items-end">
            <div class="bg-lab-card w-full rounded-t-3xl p-6">
                <div class="text-center text-sm font-bold mb-6">格子標記</div>
                
                <div class="grid grid-cols-2 gap-4">
                    <button onclick="applyHighlight('border')" 
                            class="py-4 border border-cyan-500 text-cyan-400 rounded-2xl font-medium">細內框</button>
                    <button onclick="applyHighlight('bg')" 
                            class="py-4 bg-cyan-500/10 text-cyan-400 rounded-2xl font-medium">淺色背景</button>
                </div>

                <div class="mt-6 text-xs text-slate-400 text-center">點擊空白處關閉</div>
            </div>
        </div>
    `;

    const panel = document.createElement('div');
    panel.id = 'highlightPanel';
    panel.innerHTML = panelHTML;
    document.body.appendChild(panel);

    panel.addEventListener('click', (e) => {
        if (e.target.id === 'highlightPanel') panel.remove();
    });
};

window.applyHighlight = function(type) {
    if (!currentCellElement) return;

    // 先清除舊樣式
    currentCellElement.classList.remove('active-border', 'active-bg');

    if (type === 'border') {
        currentCellElement.classList.add('active-border');
    } else if (type === 'bg') {
        currentCellElement.classList.add('active-bg');
    }

    window.saveHighlightToStorage(currentCellId, type);
    document.getElementById('highlightPanel').remove();
};

// 儲存與載入標記
window.saveHighlightToStorage = function(cellId, type) {
    let highlights = JSON.parse(localStorage.getItem('gridHighlights_539') || '{}');
    highlights[cellId] = type;
    localStorage.setItem('gridHighlights_539', JSON.stringify(highlights));
};

window.loadHighlightsFromLocalStorage = function() {
    const highlights = JSON.parse(localStorage.getItem('gridHighlights_539') || '{}');
    document.querySelectorAll('.highlight-cell').forEach(cell => {
        const cellId = cell.getAttribute('data-cell-id');
        const type = highlights[cellId];
        if (type) {
            cell.classList.add(type === 'border' ? 'active-border' : 'active-bg');
        }
    });
};

// 進入歷史頁面自動載入
const originalSwitchView = window.switchView;
window.switchView = (viewId) => {
    originalSwitchView(viewId);
    if (viewId === 'history') {
        const endP = document.getElementById('endPeriod');
        if (endP && !endP.value) endP.value = "114300"; 
        setTimeout(window.loadHistoryGrid, 100);
    }
};
