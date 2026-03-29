// --- UI 控制邏輯 ---
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('overlay');

function toggleSidebar() {
    const isHidden = sidebar.classList.contains('-translate-x-full');
    if (isHidden) {
        sidebar.classList.remove('-translate-x-full');
        overlay.classList.remove('hidden');
        setTimeout(() => overlay.classList.add('opacity-100'), 10);
    } else {
        sidebar.classList.add('-translate-x-full');
        overlay.classList.remove('opacity-100');
        setTimeout(() => overlay.classList.add('hidden'), 300);
    }
}

document.getElementById('menuBtn').addEventListener('click', toggleSidebar);
document.getElementById('closeSidebar').addEventListener('click', toggleSidebar);
overlay.addEventListener('click', toggleSidebar);

function toggleTheme() {
    document.documentElement.classList.toggle('dark');
    const isDark = document.documentElement.classList.contains('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
}

document.getElementById('themeBtn').addEventListener('click', toggleTheme);
document.getElementById('themeBtnMobile').addEventListener('click', toggleTheme);

// --- LIFF 初始化與登入功能 ---
async function initLIFF() {
    try {
        await liff.init({ liffId: "你的_LIFF_ID_填在這裡" }); // 請替換成你在 LINE Developers 申請的 ID
        
        if (liff.isLoggedIn()) {
            getUserProfile();
        } else {
            console.log("尚未登入 LINE");
        }
    } catch (err) {
        console.error("LIFF 初始化失敗", err);
    }
}

async function getUserProfile() {
    try {
        const profile = await liff.getProfile();
        // 更新側邊欄資訊
        document.getElementById('userName').innerText = profile.displayName;
        document.getElementById('userId').innerText = `ID: ${profile.userId}`;
        document.getElementById('userPicture').src = profile.pictureUrl;
        
        // 更新電腦版頭像
        document.getElementById('userPicturePC').src = profile.pictureUrl;
        
        // 隱藏登入按鈕
        document.getElementById('liffLoginBtn').style.display = 'none';
        
        console.log("登入成功:", profile.displayName);
    } catch (err) {
        console.error("抓取個人資料失敗", err);
    }
}

// 登入按鈕事件
document.getElementById('liffLoginBtn').addEventListener('click', () => {
    if (!liff.isLoggedIn()) {
        liff.login();
    }
});

// 啟動
initLIFF();
