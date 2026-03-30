// 假設你已初始化 Firebase db
async function syncUserToFirebase(profile) {
    const userRef = doc(db, "users", profile.userId);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
        // 初始化新用戶
        const newUser = {
            uid: profile.userId,
            name: profile.displayName,
            photo: profile.pictureUrl,
            points: 0,
            level: 1,
            title: "數據學徒",
            accuracy: 0,
            createdAt: serverTimestamp()
        };
        await setDoc(userRef, newUser);
        updateUserUI(newUser);
    } else {
        // 現有用戶
        updateUserUI(userSnap.data());
    }
}

function updateUserUI(data) {
    document.getElementById('userTitle').innerText = data.title;
    // 計算進度條 (假設每 100 積分升一級)
    const progress = (data.points % 100); 
    document.getElementById('levelBar').style.width = `${progress}%`;
}

// [新增] Firebase 用戶數據同步邏輯
async function syncUserToFirebase(profile) {
    console.log("正在同步用戶數據至 Firebase...", profile.displayName);
    
    // 這裡放置你的 Firebase 實作代碼
    // 1. 檢查 Firestore 執行使用者是否存在
    // 2. 若不存在，寫入初始積分 0, 等級: 數據學徒
    // 3. 呼叫 updateUserUI(data) 渲染等級條
    
    // 模擬渲染效果：
    document.getElementById('userTitle').innerText = "數據學徒";
    document.getElementById('levelBar').style.width = "15%"; // 範例進度
}
