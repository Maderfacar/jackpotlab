// UI 切換
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

// 小工具控制
window.minimizeToolbox = () => { 
    const box = document.getElementById('toolbox');
    box.classList.add('translate-y-[150%]', 'opacity-0', 'scale-90');
    setTimeout(() => {
        box.classList.add('hidden');
        document.getElementById('dot').classList.replace('hidden', 'flex');
    }, 500);
};

window.restoreToolbox = () => { 
    const box = document.getElementById('toolbox');
    box.classList.remove('hidden');
    setTimeout(() => {
        box.classList.remove('translate-y-[150%]', 'opacity-0', 'scale-90');
        document.getElementById('dot').classList.replace('flex', 'hidden');
    }, 10);
};

// 工具箱頁籤切換
const tNotes = document.getElementById('tabNotes');
const tCalc = document.getElementById('tabCalc');
const pNotes = document.getElementById('p-notes');
const pCalc = document.getElementById('p-calc');

tNotes.onclick = () => {
    pNotes.style.display = 'block'; pCalc.style.display = 'none';
    tNotes.className = "flex-1 py-2 text-[10px] font-bold rounded-xl bg-cyan-500 text-black";
    tCalc.className = "flex-1 py-2 text-[10px] font-bold rounded-xl text-slate-400 hover:bg-white/5";
};
tCalc.onclick = () => {
    pNotes.style.display = 'none'; pCalc.style.display = 'flex';
    tCalc.className = "flex-1 py-2 text-[10px] font-bold rounded-xl bg-cyan-500 text-black";
    tNotes.className = "flex-1 py-2 text-[10px] font-bold rounded-xl text-slate-400 hover:bg-white/5";
};

// 計算機邏輯
let cStr = "";
window.cin = (v) => { 
    if (cStr === "0" && !isNaN(v)) cStr = "";
    cStr += v; 
    document.getElementById('disp').innerText = cStr; 
};
window.ccr = () => { cStr = ""; document.getElementById('disp').innerText = "0"; };
window.crs = () => { 
    try { 
        if (!cStr) return;
        let res = Function('"use strict";return (' + cStr + ')')();
        cStr = Number.isInteger(res) ? res.toString() : res.toFixed(2).toString();
        document.getElementById('disp').innerText = cStr; 
    } catch { 
        document.getElementById('disp').innerText = "ERR"; 
        cStr = ""; 
    } 
};

// LIFF 登入優化
async function initLIFF() {
    try {
        await liff.init({ liffId: "2009636686-ec6thLNX" });
        if (liff.isLoggedIn()) {
            const profile = await liff.getProfile();
            
            // 更新 UI
            const nameEl = document.getElementById('userName');
            const idEl = document.getElementById('userId');
            const picEl = document.getElementById('userPicture');
            const picMobEl = document.getElementById('userPictureMobile');

            nameEl.innerText = profile.displayName;
            idEl.innerText = `ID: ${profile.userId.substring(0,12)}...`;
            
            if (profile.pictureUrl) {
                picEl.src = profile.pictureUrl;
                picEl.classList.remove('opacity-0');
                picMobEl.src = profile.pictureUrl;
                picMobEl.classList.remove('hidden');
            }
            
            document.getElementById('liffLoginBtn').onclick = null;
        } else {
            document.getElementById('liffLoginBtn').onclick = () => liff.login();
        }
    } catch (e) { 
        console.error("LIFF Init Error:", e); 
        document.getElementById('userName').innerText = "Connection Error";
    }
}
initLIFF();
