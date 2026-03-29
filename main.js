// UI 切換
function toggleSidebar() {
    const sb = document.getElementById('sidebar');
    const ov = document.getElementById('overlay');
    sb.classList.toggle('-translate-x-full');
    ov.classList.toggle('hidden');
    setTimeout(() => ov.classList.toggle('opacity-100'), 10);
}

function toggleTheme() { document.documentElement.classList.toggle('dark'); }

// 小工具控制
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

document.getElementById('tabNotes').onclick = () => {
    document.getElementById('p-notes').style.display = 'block';
    document.getElementById('p-calc').style.display = 'none';
};
document.getElementById('tabCalc').onclick = () => {
    document.getElementById('p-notes').style.display = 'none';
    document.getElementById('p-calc').style.display = 'flex';
};

// 計算機
let cStr = "";
window.cin = (v) => { cStr += v; document.getElementById('disp').innerText = cStr; };
window.ccr = () => { cStr = ""; document.getElementById('disp').innerText = "0"; };
window.crs = () => { try { cStr = eval(cStr).toString(); document.getElementById('disp').innerText = cStr; } catch { document.getElementById('disp').innerText = "ERR"; cStr = ""; } };

// LIFF 登入
async function initLIFF() {
    try {
        await liff.init({ liffId: "2009636686-ec6thLNX" });
        if (liff.isLoggedIn()) {
            const profile = await liff.getProfile();
            document.getElementById('userName').innerText = profile.displayName;
            document.getElementById('userId').innerText = `ID: ${profile.userId.substring(0,12)}...`;
            document.getElementById('userPicture').src = profile.pictureUrl;
            document.getElementById('liffLoginBtn').onclick = null;
        } else {
            document.getElementById('liffLoginBtn').onclick = () => liff.login();
        }
    } catch (e) { console.error(e); }
}
initLIFF();
