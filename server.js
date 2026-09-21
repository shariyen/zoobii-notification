const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const admin = require('firebase-admin');

const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json());

// ==========================================
// 1. FIREBASE ADMIN SDK INITIALIZATION
// ==========================================
let serviceAccount;
try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } else {
        serviceAccount = require('./serviceAccountKey.json');
    }

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://zoobii-96664-default-rtdb.asia-southeast1.firebasedatabase.app"
    });
    console.log("✅ Firebase Admin SDK Initialized!");
} catch (error) {
    console.warn("⚠️ Firebase Admin Init Warning:", error.message);
}

// ==========================================
// 2. CLOUDFLARE R2 CLIENT SETUP
// ==========================================
const r2 = new S3Client({
    region: 'auto',
    endpoint: 'https://0c4251bc1f3edce7cf4e4a85103b159a.r2.cloudflarestorage.com',
    credentials: {
        accessKeyId: 'bff475765152cd8bed70ff61a2e7c944',
        secretAccessKey: '9398ae9c68efcc19594b1baf91d3805dc28687a93a3a00f6a0f74eff7dc9ad19',
    },
});

// Multer Memory Storage Configuration (Max 100MB)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 100 * 1024 * 1024 }
});

// ==========================================
// 3. API ROUTES
// ==========================================

// Health Check Endpoint
app.get('/', (req, res) => {
    res.send('🚀 Zoobii Universal Backend Engine Running!');
});

// Photo & Video Upload API Route (Cloudflare R2)
app.post('/api/upload-media', upload.single('media'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No media file provided' });
        }

        const file = req.file;
        const fileName = `posts/${Date.now()}_${file.originalname.replace(/\s+/g, '_')}`;

        await r2.send(new PutObjectCommand({
            Bucket: 'zoobii-reels',
            Key: fileName,
            Body: file.buffer,
            ContentType: file.mimetype
        }));

        const publicUrl = `https://pub-478c6ad9916b4974a7befc9b22d8e271.r2.dev/${fileName}`;
        
        return res.json({ success: true, url: publicUrl });

    } catch (err) {
        console.error("Cloudflare R2 Upload Error:", err);
        return res.status(500).json({ error: err.message });
    }
});

// FCM High Priority Call & Chat Notification Route
app.post('/send-notification', async (req, res) => {
    const { targetToken, title, body, data } = req.body;

    if (!targetToken) {
        return res.status(400).send({ success: false, message: 'Target FCM Token is required' });
    }

    const isCall = data && data.type === "INCOMING_CALL";

    const message = {
        token: targetToken,
        notification: {
            title: title || (isCall ? "Incoming Call" : "New Message"),
            body: body || "You have a new update on Zoobii"
        },
        data: data || {},

        android: {
            priority: 'high',
            ttl: 0,
            notification: {
                sound: 'default',
                priority: 'max',
                channelId: isCall ? 'call_channel' : 'default_channel',
                visibility: 'public'
            }
        },

        webpush: {
            headers: {
                Urgency: 'high',
                TTL: '30'
            },
            notification: {
                title: title || (isCall ? "Incoming Call..." : "New Message"),
                body: body || "Tap to respond on Zoobii",
                icon: '/favicon.ico',
                badge: '/favicon.ico',
                requireInteraction: isCall ? true : false,
                vibrate: isCall ? [500, 200, 500, 200, 500, 200, 500] : [200, 100, 200],
                actions: isCall ? [
                    { action: 'open_call', title: '📞 Answer Call' },
                    { action: 'decline', title: '❌ Decline' }
                ] : []
            },
            fcmOptions: {
                link: data && data.roomId ? `/inbox.html?roomId=${data.roomId}` : '/chat.html'
            }
        }
    };

    try {
        const response = await admin.messaging().send(message);
        console.log("Successfully sent FCM message:", response);
        res.status(200).send({ success: true, messageId: response });
    } catch (error) {
        console.error("Error sending FCM message:", error);
        res.status(500).send({ success: false, error: error.message });
    }
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Zoobii Backend running securely on port ${PORT}`);
});
