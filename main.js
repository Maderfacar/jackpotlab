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


// ====================== 歷史網格記錄功能 (方案 B - 起始/結束期數) ======================

async function loadHistoryGrid() {
    const table = document.getElementById('historyGrid');
    if (!table) return;

    const startInput = document.getElementById('startPeriod').value.trim();
    const endInput = document.getElementById('endPeriod').value.trim();

    table.innerHTML = `<tr><td colspan="8" class="py-12 text-center text-slate-400">載入中...</td></tr>`;

    try {
        let data = await window.getDrawsByType("今彩539", 300); // 先抓較多筆，再過濾

        if (data.length === 0) {
            table.innerHTML = `<tr><td colspan="8" class="py-12 text-center text-slate-400">尚無資料，請先使用匯入工具匯入今彩539記錄</td></tr>`;
            return;
        }

        // 過濾期數範圍
        if (startInput) {
            data = data.filter(item => item.period >= startInput);
        }
        if (endInput) {
            data = data.filter(item => item.period <= endInput);
        }

        // 限制最多顯示 200 筆，避免過度卡頓
        data = data.slice(0, 200);

        let html = `
            <thead>
                <tr class="bg-lab-bg border-b border-lab-border">
                    <th class="px-2 py-3 text-center text-[10px] font-bold text-slate-400 border-r border-lab-border">期數</th>
                    <th class="px-2 py-3 text-center text-[10px] font-bold text-slate-400 border-r border-lab-border">日期</th>
                    <th class="px-2 py-3 text-center text-[10px] font-bold text-slate-400 border-r border-lab-border">星期</th>
                    <th class="px-3 py-3 text-center text-[10px] font-bold text-slate-400 border-r border-lab-border">1</th>
                    <th class="px-3 py-3 text-center text-[10px] font-bold text-slate-400 border-r border-lab-border">2</th>
                    <th class="px-3 py-3 text-center text-[10px] font-bold text-slate-400 border-r border-lab-border">3</th>
                    <th class="px-3 py-3 text-center text-[10px] font-bold text-slate-400 border-r border-lab-border">4</th>
                    <th class="px-3 py-3 text-center text-[10px] font-bold text-slate-400">5</th>
                </tr>
            </thead>
            <tbody class="text-sm">
        `;

        // 由舊到新排序（最新一期在最下方）
        const sortedData = [...data].sort((a, b) => a.period.localeCompare(b.period));

        for (const item of sortedData) {
            const periodTail = item.period.slice(-3);
            const dateObj = new Date(item.drawDate);
            const monthDay = `${dateObj.getMonth()+1}/${dateObj.getDate()}`;
            const weekday = ['日','一','二','三','四','五','六'][dateObj.getDay()];

            html += `<tr class="border-b border-lab-border hover:bg-lab-bg/50 transition">`;
            html += `<td class="px-2 py-3 text-center font-mono border-r border-lab-border">${periodTail}</td>`;
            html += `<td class="px-2 py-3 text-center border-r border-lab-border">${monthDay}</td>`;
            html += `<td class="px-2 py-3 text-center border-r border-lab-border">${weekday}</td>`;

            item.numbers.forEach((num, idx) => {
                const cellId = `${periodTail}_${idx+4}`;
                html += `<td onclick="toggleCellHighlight('${cellId}', this)" 
                             class="px-3 py-3 text-center font-mono border-r border-lab-border highlight-cell" 
                             data-cell-id="${cellId}">${num.toString().padStart(2, '0')}</td>`;
            });

            html += `</tr>`;
        }

        html += `</tbody>`;
        table.innerHTML = html;

        loadHighlightsFromLocalStorage();

    } catch (err) {
        console.error(err);
        table.innerHTML = `<tr><td colspan="8" class="py-12 text-center text-red-400">載入失敗，請稍後再試</td></tr>`;
    }
}

// 格子標記功能 - localStorage
function toggleCellHighlight(cellId, element) {
    const current = element.getAttribute('data-highlight') || '';
    
    if (current === 'border') {
        element.style.border = '';
        element.setAttribute('data-highlight', '');
        removeHighlightFromStorage(cellId);
    } else {
        element.style.border = '2px solid #22d3ee';
        element.setAttribute('data-highlight', 'border');
        saveHighlightToStorage(cellId, 'border');
    }
}

function saveHighlightToStorage(cellId, type) {
    let highlights = JSON.parse(localStorage.getItem('gridHighlights_539') || '{}');
    highlights[cellId] = type;
    localStorage.setItem('gridHighlights_539', JSON.stringify(highlights));
}

function removeHighlightFromStorage(cellId) {
    let highlights = JSON.parse(localStorage.getItem('gridHighlights_539') || '{}');
    delete highlights[cellId];
    localStorage.setItem('gridHighlights_539', JSON.stringify(highlights));
}

function loadHighlightsFromLocalStorage() {
    const highlights = JSON.parse(localStorage.getItem('gridHighlights_539') || '{}');
    document.querySelectorAll('.highlight-cell').forEach(cell => {
        const cellId = cell.getAttribute('data-cell-id');
        if (highlights[cellId] === 'border') {
            cell.style.border = '2px solid #22d3ee';
            cell.setAttribute('data-highlight', 'border');
        }
    });
}

// 切換到歷史頁面時自動載入（預設顯示最近60期）
const originalSwitchView = window.switchView;
window.switchView = (viewId) => {
    originalSwitchView(viewId);
    if (viewId === 'history') {
        // 預設填入最近60期（需依實際期數調整）
        const endP = document.getElementById('endPeriod');
        if (endP && !endP.value) endP.value = "114300";   // 可依你實際最大期數調整
        setTimeout(loadHistoryGrid, 150);
    }
};
