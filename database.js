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

// ====================== 抓取今彩539 開獎資料 (Quota 安全版) ======================

window.getDrawsByType = async (type = "今彩539", limit = 20) => {
    try {
        const { collection, getDocs, query, where, orderBy, limit: firestoreLimit } = 
              await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");

        const drawsRef = collection(db, "draws");
        
        const q = query(
            drawsRef, 
            where("type", "==", type),
            orderBy("period", "desc"), 
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

        // 轉成由舊到新排序（最新一期在最下面）
        result.sort((a, b) => (a.period || "").localeCompare(b.period || ""));

        console.log(`[getDrawsByType] 成功抓取 ${result.length} 筆 ${type} 資料 (limit=${limit})`);
        return result;

    } catch (error) {
        console.error("抓取資料失敗:", error);
        if (error.code === 'resource-exhausted' || error.message.includes('Quota exceeded')) {
            console.error("Firestore 額度已用盡，請等待每日重置（台灣時間約早上 8~9 點）");
        }
        return [];
    }
};

// ====================== 從 CSV 抓取今彩539 資料 (不使用 Firebase) ======================

// ====================== 從 CSV 抓取今彩539 資料 (從最新期開始抓取) ======================

window.getDrawsFromCSV = async (limit = 30) => {
    try {
        const baseUrl = window.location.origin + window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/'));
        const csvUrl = baseUrl + '/539.csv';

        console.log("正在從以下路徑抓取 CSV:", csvUrl);

        const response = await fetch(csvUrl);
        if (!response.ok) {
            throw new Error(`CSV 載入失敗: ${response.status}`);
        }

        const csvText = await response.text();
        const lines = csvText.trim().split('\n');
        const result = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const parts = line.split(',').map(p => p.trim());
            if (parts.length < 7) continue;

            const period = parts[0];
            const rawDate = parts[1];
            const numbers = parts.slice(2, 7).map(n => parseInt(n, 10)).filter(n => !isNaN(n));

            if (numbers.length !== 5) continue;

            let drawDate = '';
            if (rawDate && rawDate.includes('月')) {
                const yearPrefix = 1911 + parseInt(period.substring(0, 3) || 0);
                const dateParts = rawDate.replace(/[月日]/g, ' ').trim().split(/\s+/);
                const month = parseInt(dateParts[0]) || 1;
                const day = parseInt(dateParts[1]) || 1;
                drawDate = `${yearPrefix}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            }

            result.push({
                id: `539_${period}`,
                type: "今彩539",
                period: period,
                drawDate: drawDate,
                numbers: numbers.sort((a, b) => a - b),
                special: null,
                secondZone: null
            });
        }

        if (result.length === 0) {
            console.log("CSV 中沒有有效資料");
            return [];
        }

        // === 關鍵修正：先降序排序（最新的排在前面）===
        result.sort((a, b) => (b.period || "").localeCompare(a.period || ""));

        // 取出最新的 limit 筆
        const latestData = result.slice(0, limit);

        // 再轉成升序，讓最新一期排在表格最下面
        latestData.sort((a, b) => (a.period || "").localeCompare(b.period || ""));

        console.log(`[getDrawsFromCSV] 成功從 CSV 抓取最新的 ${latestData.length} 筆資料`);
        return latestData;

    } catch (error) {
        console.error("從 CSV 抓取資料失敗:", error);
        return [];
    }
};
