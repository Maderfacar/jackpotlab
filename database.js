// database.js 完整代碼
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// 你的 Firebase 配置
const firebaseConfig = {
  apiKey: "AIzaSyAOuoIXa7WLh3uKsX4V9hp66V2m_0THJuU",
  authDomain: "jackpot-19965.firebaseapp.com",
  projectId: "jackpot-19965",
  storageBucket: "jackpot-19965.firebasestorage.app",
  messagingSenderId: "736576405476",
  appId: "1:736576405476:web:c8422400537b197da111f1"
};

// 初始化 Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/**
 * 同步用戶數據至 Firebase
 * 將函數掛載到 window，確保 main.js 可以直接呼叫
 */
window.syncUserToFirebase = async (profile) => {
    if (!profile || !profile.userId) return;
    
    console.log("正在同步用戶數據至 Firebase...", profile.displayName);
    const userRef = doc(db, "users", profile.userId);
    
    try {
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
            // 1. 若不存在，初始化新用戶
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
            // 2. 若存在，獲取現有用戶數據
            updateUserUI(userSnap.data());
        }
    } catch (error) {
        console.error("Firebase 同步失敗:", error);
    }
};

/**
 * 渲染 UI 上的用戶狀態（稱號與等級進度條）
 */
function updateUserUI(data) {
    const titleEl = document.getElementById('userTitle');
    const levelBar = document.getElementById('levelBar');

    // 渲染稱號
    if (titleEl) {
        titleEl.innerText = data.title || "數據學徒";
    }

    // 渲染等級進度條 (假設每 100 積分升一級)
    if (levelBar) {
        const progress = (data.points % 100); 
        levelBar.style.width = `${progress}%`;
    }
}
