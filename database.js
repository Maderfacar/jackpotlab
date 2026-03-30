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

// ====================== 抓取今彩539 開獎資料 (Quota 優化版) ======================

window.getDrawsByType = async (type = "今彩539", limit = 20) => {
    try {
        const { collection, getDocs, query, where, orderBy, limit: firestoreLimit } = 
              await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");

        const drawsRef = collection(db, "draws");
        
        // 使用 query 只抓今彩539 的資料，並按 period 降序排序
        const q = query(
            drawsRef, 
            where("type", "==", type),
            orderBy("period", "desc"),   // 最新在前
            firestoreLimit(limit)
        );

        const querySnapshot = await getDocs(q);

        const result = [];

        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            if (data) {
                result.push({
                    id: docSnap.id,
                    ...data
                });
            }
        });

        // 因為已經是降序了，再轉成升序讓最新一期在最下面
        result.sort((a, b) => (a.period || "").localeCompare(b.period || ""));

        console.log(`成功抓取 ${result.length} 筆 ${type} 資料`);
        return result;

    } catch (error) {
        console.error("抓取資料失敗:", error);
        if (error.code === 'resource-exhausted') {
            console.error("Firestore 額度已用盡，請明天再試或升級方案");
        }
        return [];
    }
};
