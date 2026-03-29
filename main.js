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

// LIFF 初始化與用戶資料顯示
async function initLIFF() {
    const liffId = "2009636686-ec6thLNX"; 
    try {
        await liff.init({ liffId });
        if (liff.isLoggedIn()) {
            const profile = await liff.getProfile();
            
            // 更新桌機版 UI
            document.getElementById('userName').innerText = profile.displayName;
            document.getElementById('userId').innerText = `ID: ${profile.userId.substring(0, 10)}...`;
            
            const desktopImg = document.getElementById('userPicture');
            if (profile.pictureUrl) {
                desktopImg.src = profile.pictureUrl;
                desktopImg.style.opacity = "1";
            }

            // 更新手機版 UI
            const mobileImg = document.getElementById('userPictureMobile');
            if (profile.pictureUrl) {
                mobileImg.src = profile.pictureUrl;
                mobileImg.classList.remove('hidden');
            }

            document.getElementById('liffLoginBtn').onclick = null;
        } else {
            document.getElementById('liffLoginBtn').onclick = () => liff.login();
        }
    } catch (err) {
        console.error("LIFF Init Failed", err);
    }
}

window.onload = initLIFF;
