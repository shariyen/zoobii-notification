const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// Private Key Format Auto-Fix
let privateKey = process.env.FIREBASE_PRIVATE_KEY || "";
if (privateKey) {
  privateKey = privateKey.replace(/^"(.*)"$/, '$1').replace(/\\n/g, '\n');
}

const serviceAccount = {
  "type": "service_account",
  "project_id": "zoobii-96664",
  "private_key": privateKey,
  "client_email": "firebase-adminsdk-fbsvc@zoobii-96664.iam.gserviceaccount.com"
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

app.post('/send-notification', async (req, res) => {
  const { targetToken, title, body } = req.body;
  try {
    await admin.messaging().send({
      notification: { title, body },
      token: targetToken
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
