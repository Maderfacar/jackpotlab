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

// ====================== 抓取今彩539 開獎資料 (最新版) ======================

window.getDrawsByType = async (type = "今彩539", limit = 20) => {
    try {
        const { collection, getDocs } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");

        const drawsRef = collection(db, "draws");
        const querySnapshot = await getDocs(drawsRef);

        let result = [];

        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            if (data && data.type === type) {
                result.push({
                    id: docSnap.id,
                    ...data
                });
            }
        });

        if (result.length === 0) {
            return [];
        }

        // 先按期數降序排序（最新的排在最前面）
        result.sort((a, b) => (b.period || "").localeCompare(a.period || ""));

        // 只取出最新的 limit 筆
        result = result.slice(0, limit);

        // 再改成升序排序，讓最新一期排在最下面（符合表格需求）
        result.sort((a, b) => (a.period || "").localeCompare(b.period || ""));

        return result;

    } catch (error) {
        console.error("抓取資料失敗:", error);
        return [];
    }
};
