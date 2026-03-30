// SPA 路由切換
function switchView(viewId) {
    document.querySelectorAll('.spa-view').forEach(view => view.classList.add('hidden'));
    document.getElementById(`view-${viewId}`).classList.remove('hidden');
    
    // 更新 Tab 顏色 (簡易實作)
    document.querySelectorAll('.tab-item').forEach(btn => {
        btn.classList.replace('text-cyan-500', 'text-slate-400');
    });
    event.currentTarget.classList.replace('text-slate-400', 'text-cyan-500');
}

// LIFF 初始化
async function initApp() {
    try {
        await liff.init({ liffId: "2009636686-ec6thLNX" });
        if (liff.isLoggedIn()) {
            const profile = await liff.getProfile();
            renderUserProfile(profile);
            // 這裡對接 Firebase
            syncUserToFirebase(profile);
        } else {
            liff.login();
        }
    } catch (err) {
        console.error("LIFF Init Failed", err);
    }
}

function renderUserProfile(profile) {
    document.getElementById('userName').innerText = profile.displayName;
    const pic = document.getElementById('userPicture');
    pic.src = profile.pictureUrl;
    pic.style.opacity = "1";
    if(document.getElementById('userId')) {
        document.getElementById('userId').innerText = profile.userId.substring(0, 15);
    }
}

window.onload = initApp;
