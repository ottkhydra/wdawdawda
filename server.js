const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'db.json');

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helper functions for DB access
function readDB() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      const initialDB = { adminUsername: 'admin', adminPassword: 'admin', keys: [], requests: [] };
      fs.writeFileSync(DB_PATH, JSON.stringify(initialDB, null, 2));
      return initialDB;
    }
    const data = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading database file:', err);
    return { adminUsername: 'admin', adminPassword: 'admin', keys: [], requests: [] };
  }
}

function writeDB(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Error writing to database file:', err);
    return false;
  }
}

// Generate random uppercase key
function generateRandomKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = 'GAME-';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Middleware to verify Admin
function verifyAdmin(req, res, next) {
  const adminSecretHeader = req.headers['x-admin-secret'];
  const db = readDB();
  if (!adminSecretHeader) {
    return res.status(401).json({ success: false, message: 'Yetkisiz erişim!' });
  }
  const [username, password] = adminSecretHeader.split(':');
  if (username !== db.adminUsername || password !== db.adminPassword) {
    return res.status(401).json({ success: false, message: 'Yetkisiz erişim! Geçersiz admin yetkisi.' });
  }
  next();
}

// ==================== USER ENDPOINTS ====================

// Login with Key
app.post('/api/login', (req, res) => {
  const { key } = req.body;
  if (!key) {
    return res.status(400).json({ success: false, message: 'Key alanı boş bırakılamaz.' });
  }
  
  const db = readDB();
  const normalizedKey = key.trim().toUpperCase();
  
  const keyExists = db.keys.find(k => k.key.toUpperCase() === normalizedKey);
  if (!keyExists) {
    return res.status(404).json({ success: false, message: 'Girdiğiniz key geçersiz veya aktif değil.' });
  }
  
  res.json({ success: true, message: 'Giriş başarılı.', key: normalizedKey });
});

// Check Deposit Status (For User Dashboard / Polling)
app.post('/api/status', (req, res) => {
  const { key } = req.body;
  if (!key) {
    return res.status(400).json({ success: false, message: 'Key gereklidir.' });
  }
  
  const db = readDB();
  const normalizedKey = key.trim().toUpperCase();
  
  // Find all requests for this key and get the latest one
  const userRequests = db.requests.filter(r => r.key.toUpperCase() === normalizedKey);
  
  if (userRequests.length === 0) {
    return res.json({ success: true, request: null });
  }
  
  // Return the latest request sorted by date
  const latestRequest = userRequests.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
  res.json({ success: true, request: latestRequest });
});

// Submit Deposit Request
app.post('/api/deposit', (req, res) => {
  const { key, type, amount, details } = req.body;
  
  if (!key || !type || !amount || !details) {
    return res.status(400).json({ success: false, message: 'Eksik parametre girdiniz.' });
  }
  
  const db = readDB();
  const normalizedKey = key.trim().toUpperCase();
  
  // Validate Key first
  const keyExists = db.keys.find(k => k.key.toUpperCase() === normalizedKey);
  if (!keyExists) {
    return res.status(403).json({ success: false, message: 'Geçersiz key. İşlem yapılamaz.' });
  }
  
  // Check if there's already a pending request for this user key
  const pendingRequest = db.requests.find(r => r.key.toUpperCase() === normalizedKey && r.status === 'pending');
  if (pendingRequest) {
    return res.status(400).json({ success: false, message: 'Zaten bekleyen bir onay talebiniz bulunmaktadır.' });
  }
  
  // Format details according to type
  let formattedDetails = {};
  if (type === 'bet') {
    if (!details.usdtAddress) {
      return res.status(400).json({ success: false, message: 'USDT TRC20 adresi girmelisiniz.' });
    }
    formattedDetails = { usdtAddress: details.usdtAddress };
  } else if (type === 'crypto') {
    if (!details.trxAddress) {
      return res.status(400).json({ success: false, message: 'TRX adresi girmelisiniz.' });
    }
    formattedDetails = { trxAddress: details.trxAddress };
  } else if (type === 'iban') {
    if (!details.iban || !details.fullName) {
      return res.status(400).json({ success: false, message: 'IBAN ve Ad Soyad bilgilerini eksiksiz doldurmalısınız.' });
    }
    formattedDetails = { 
      iban: details.iban.trim(),
      fullName: details.fullName.trim()
    };
  } else {
    return res.status(400).json({ success: false, message: 'Geçersiz ödeme türü.' });
  }
  
  const newRequest = {
    id: 'REQ_' + Math.random().toString(36).substr(2, 9).toUpperCase(),
    key: normalizedKey,
    type,
    amount: parseFloat(amount),
    details: formattedDetails,
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  db.requests.push(newRequest);
  writeDB(db);
  
  res.json({ success: true, request: newRequest, message: 'Talebiniz başarıyla gönderildi, onay bekliyor.' });
});


// ==================== ADMIN ENDPOINTS ====================

// Admin Login
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  const db = readDB();
  if (username === db.adminUsername && password === db.adminPassword) {
    res.json({ success: true, message: 'Giriş başarılı.' });
  } else {
    res.status(401).json({ success: false, message: 'Hatalı kullanıcı adı veya şifre.' });
  }
});

// Admin Get Requests
app.get('/api/admin/requests', verifyAdmin, (req, res) => {
  const db = readDB();
  // Sort requests: pending ones first, then by date descending
  const sortedRequests = db.requests.sort((a, b) => {
    if (a.status === 'pending' && b.status !== 'pending') return -1;
    if (a.status !== 'pending' && b.status === 'pending') return 1;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
  res.json({ success: true, requests: sortedRequests });
});

// Admin Approve / Reject Request
app.post('/api/admin/action', verifyAdmin, (req, res) => {
  const { requestId, action } = req.body;
  if (!requestId || !['approved', 'rejected'].includes(action)) {
    return res.status(400).json({ success: false, message: 'Geçersiz parametreler.' });
  }
  
  const db = readDB();
  const requestIndex = db.requests.findIndex(r => r.id === requestId);
  if (requestIndex === -1) {
    return res.status(404).json({ success: false, message: 'Talep bulunamadı.' });
  }
  
  db.requests[requestIndex].status = action;
  db.requests[requestIndex].updatedAt = new Date().toISOString();
  writeDB(db);
  
  res.json({ success: true, message: `Talep durumu başarıyla '${action === 'approved' ? 'Onaylandı' : 'Reddedildi'}' olarak güncellendi.` });
});

// Admin Get Keys
app.get('/api/admin/keys', verifyAdmin, (req, res) => {
  const db = readDB();
  res.json({ success: true, keys: db.keys });
});

// Admin Generate Key
app.post('/api/admin/keys/generate', verifyAdmin, (req, res) => {
  const db = readDB();
  let newKey = generateRandomKey();
  
  // Avoid collisions
  while (db.keys.some(k => k.key === newKey)) {
    newKey = generateRandomKey();
  }
  
  const keyObj = {
    key: newKey,
    createdAt: new Date().toISOString()
  };
  
  db.keys.push(keyObj);
  writeDB(db);
  
  res.json({ success: true, key: keyObj, message: 'Yeni key başarıyla oluşturuldu.' });
});

// Admin Delete Key
app.post('/api/admin/keys/delete', verifyAdmin, (req, res) => {
  const { key } = req.body;
  if (!key) {
    return res.status(400).json({ success: false, message: 'Key gereklidir.' });
  }
  
  const db = readDB();
  const keyIndex = db.keys.findIndex(k => k.key.toUpperCase() === key.toUpperCase());
  if (keyIndex === -1) {
    return res.status(404).json({ success: false, message: 'Key bulunamadı.' });
  }
  
  db.keys.splice(keyIndex, 1);
  writeDB(db);
  
  res.json({ success: true, message: 'Key başarıyla silindi.' });
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
