import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAOuoIXa7WLh3uKsX4V9hp66V2m_0THJuU",
  authDomain: "jackpot-19965.firebaseapp.com",
  projectId: "jackpot-19965",
  storageBucket: "jackpot-19965.firebasestorage.app",
  messagingSenderId: "736576405476",
  appId: "1:736576405476:web:c8422400537b197da111f1"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

window.syncUserToFirebase = async (profile) => {
    if (!profile || !profile.userId) return;
    
    const userRef = doc(db, "users", profile.userId);
    
    try {
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
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
            updateUserUI(userSnap.data());
        }
    } catch (error) {
        console.error("Firebase 同步失敗:", error);
    }
};

function updateUserUI(data) {
    const titleEl = document.getElementById('userTitle');
    if (titleEl) {
        titleEl.innerText = data.title || "數據學徒";
    }
}

// ====================== 提供給 main.js 使用的抓取函式 ======================

window.getDrawsByType = async (type = "今彩539", limit = 300) => {
    try {
        const { collection, getDocs } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");

        const drawsRef = collection(db, "draws");
        const querySnapshot = await getDocs(drawsRef);

        const result = [];

        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            if (data && data.type === type) {
                result.push({
                    id: docSnap.id,
                    ...data
                });
            }
        });

        // 按期數降序排序（最新在前）
        result.sort((a, b) => (b.period || "").localeCompare(a.period || ""));

        return result.slice(0, limit);

    } catch (error) {
        console.error("抓取資料失敗:", error);
        return [];
    }
};
