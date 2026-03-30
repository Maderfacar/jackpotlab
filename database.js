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
