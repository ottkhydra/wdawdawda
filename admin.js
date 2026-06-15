// Admin State
let adminSecret = localStorage.getItem('adminSecret') || '';
let requestsData = [];
let keysData = [];
let activeFilter = 'all';
let adminPollInterval = null;

// On Page Load
document.addEventListener('DOMContentLoaded', () => {
  if (adminSecret) {
    checkAdminSessionAndLoad();
  } else {
    showAdminLogin(true);
  }
});

// Toast Notification
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  const toastText = document.getElementById('toast-text');
  
  toast.className = 'toast'; 
  toast.classList.add(`toast-${type}`);
  toastText.textContent = message;
  
  toast.classList.add('show');
  
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

// Show/Hide Admin Views
function showAdminLogin(show) {
  const loginCard = document.getElementById('admin-login-card');
  const dashboard = document.getElementById('admin-dashboard');
  
  if (show) {
    loginCard.classList.remove('hidden');
    dashboard.classList.add('hidden');
    stopAdminPolling();
  } else {
    loginCard.classList.add('hidden');
    dashboard.classList.remove('hidden');
    startAdminPolling();
  }
}

// ==================== HYBRID DATABASE & API CLIENT ====================

// Generate random key helper (Hacking Style)
function generateRandomKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = 'ROOT-';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  result += '-NET';
  return result;
}

// Unified Fetch API with Fallback
async function apiCall(endpoint, method = 'GET', body = null, headers = {}) {
  const isLocalFile = window.location.protocol === 'file:';
  
  if (!isLocalFile) {
    try {
      const options = {
        method,
        headers: { 'Content-Type': 'application/json', ...headers }
      };
      if (body) {
        options.body = JSON.stringify(body);
      }
      const response = await fetch(endpoint, options);
      return await response.json();
    } catch (err) {
      console.warn("Server connection failed, falling back to local simulation.", err);
      // Fall through to emulator
    }
  }
  
  // EMULATED LOCAL BACKEND
  return emulateBackend(endpoint, method, body, headers);
}

// Emulate backend endpoints in localStorage
function emulateBackend(endpoint, method, body, headers) {
  const keys = JSON.parse(localStorage.getItem('ls_keys') || '[]');
  const requests = JSON.parse(localStorage.getItem('ls_requests') || '[]');
  
  // Self-heal localStorage credentials if corrupt or uninitialized
  if (localStorage.getItem('ls_adminUsername') !== 'admin') {
    localStorage.setItem('ls_adminUsername', 'admin');
  }
  if (localStorage.getItem('ls_adminPassword') !== 'admin') {
    localStorage.setItem('ls_adminPassword', 'admin');
  }
  
  const adminUsernameHash = localStorage.getItem('ls_adminUsername');
  const adminPasswordHash = localStorage.getItem('ls_adminPassword');
  
  // Verify Admin authorization for protected endpoints (X-Admin-Secret format: username:password)
  if (endpoint.startsWith('/api/admin/') && endpoint !== '/api/admin/login') {
    const authHeader = headers['X-Admin-Secret'];
    if (!authHeader) {
      return { success: false, message: 'Root yetkilendirme hatası! Erişim engellendi.' };
    }
    const [user, pass] = authHeader.split(':');
    if (user !== adminUsernameHash || pass !== adminPasswordHash) {
      return { success: false, message: 'Root yetkilendirme hatası! Erişim engellendi.' };
    }
  }
  
  if (endpoint === '/api/admin/login' && method === 'POST') {
    if (body.username === adminUsernameHash && body.password === adminPasswordHash) {
      return { success: true, message: 'Root tüneli doğrulandı.' };
    } else {
      return { success: false, message: 'Hatalı kullanıcı adı veya şifre.' };
    }
  }
  
  if (endpoint === '/api/admin/requests' && method === 'GET') {
    const sortedRequests = requests.sort((a, b) => {
      if (a.status === 'pending' && b.status !== 'pending') return -1;
      if (a.status !== 'pending' && b.status === 'pending') return 1;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
    return { success: true, requests: sortedRequests };
  }
  
  if (endpoint === '/api/admin/action' && method === 'POST') {
    const requestIndex = requests.findIndex(r => r.id === body.requestId);
    if (requestIndex === -1) {
      return { success: false, message: 'Sinyal bulunamadı.' };
    }
    requests[requestIndex].status = body.action;
    requests[requestIndex].updatedAt = new Date().toISOString();
    localStorage.setItem('ls_requests', JSON.stringify(requests));
    return { success: true, message: `Sinyal durumu '${body.action === 'approved' ? 'ENJEKTE EDİLDİ' : 'ENGELLENDİ'}' olarak güncellendi.` };
  }
  
  if (endpoint === '/api/admin/keys' && method === 'GET') {
    return { success: true, keys: keys };
  }
  
  if (endpoint === '/api/admin/keys/generate' && method === 'POST') {
    let newKey = generateRandomKey();
    while (keys.some(k => k.key === newKey)) {
      newKey = generateRandomKey();
    }
    const keyObj = { key: newKey, createdAt: new Date().toISOString() };
    keys.push(keyObj);
    localStorage.setItem('ls_keys', JSON.stringify(keys));
    return { success: true, key: keyObj, message: 'Yeni Root Key oluşturuldu.' };
  }
  
  if (endpoint === '/api/admin/keys/delete' && method === 'POST') {
    const keyIndex = keys.findIndex(k => k.key.toUpperCase() === body.key.toUpperCase());
    if (keyIndex === -1) {
      return { success: false, message: 'Root Key bulunamadı.' };
    }
    keys.splice(keyIndex, 1);
    localStorage.setItem('ls_keys', JSON.stringify(keys));
    return { success: true, message: 'Root Key sistem veri tabanından silindi.' };
  }
  
  return { success: false, message: 'Endpoint bulunamadı (Local Emulation)' };
}

// ==================== ADMIN ACTIONS ====================

// Handle Admin Login
async function handleAdminLogin(e) {
  e.preventDefault();
  const usernameInput = document.getElementById('admin-username').value.trim();
  const secretInput = document.getElementById('admin-secret').value.trim();
  
  try {
    const result = await apiCall('/api/admin/login', 'POST', { username: usernameInput, password: secretInput });
    
    if (result.success) {
      adminSecret = `${usernameInput}:${secretInput}`;
      localStorage.setItem('adminSecret', adminSecret);
      showToast('Master yetkisi doğrulandı.', 'success');
      showAdminLogin(false);
      loadDashboardData();
    } else {
      showToast(result.message || 'Yetki doğrulaması başarısız.', 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Bağlantı hatası.', 'error');
  }
}

// Check Session
async function checkAdminSessionAndLoad() {
  try {
    const result = await apiCall('/api/admin/requests', 'GET', null, { 'X-Admin-Secret': adminSecret });
    
    if (result.success) {
      showAdminLogin(false);
      loadDashboardData();
    } else {
      adminLogout();
    }
  } catch (err) {
    console.error(err);
    showAdminLogin(false);
    loadDashboardData();
  }
}

// Admin Logout
function adminLogout() {
  adminSecret = '';
  localStorage.removeItem('adminSecret');
  stopAdminPolling();
  document.getElementById('form-admin-login').reset();
  showAdminLogin(true);
  showToast('Terminal oturumu sonlandırıldı.', 'info');
}

// Load All Data
function loadDashboardData() {
  fetchRequests();
  fetchKeys();
}

// Fetch Requests
async function fetchRequests() {
  if (!adminSecret) return;
  
  try {
    const result = await apiCall('/api/admin/requests', 'GET', null, { 'X-Admin-Secret': adminSecret });
    
    if (result.success) {
      requestsData = result.requests;
      renderRequests();
    } else {
      adminLogout();
    }
  } catch (err) {
    console.error('Error fetching requests:', err);
  }
}

// Fetch Keys
async function fetchKeys() {
  if (!adminSecret) return;
  
  try {
    const result = await apiCall('/api/admin/keys', 'GET', null, { 'X-Admin-Secret': adminSecret });
    
    if (result.success) {
      keysData = result.keys;
      renderKeys();
    }
  } catch (err) {
    console.error('Error fetching keys:', err);
  }
}

// Render Requests List
function renderRequests() {
  const container = document.getElementById('requests-list');
  
  // Filter data
  let filtered = requestsData;
  if (activeFilter === 'pending') {
    filtered = requestsData.filter(r => r.status === 'pending');
  } else if (activeFilter === 'approved') {
    filtered = requestsData.filter(r => r.status === 'approved');
  }
  
  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-folder-open"></i>
        <p>Aktif enjeksiyon talebi yok.</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = '';
  
  filtered.forEach(req => {
    const item = document.createElement('div');
    item.className = 'request-item';
    
    // Status formatting
    let badgeClass = 'badge-pending';
    let statusText = 'Bekliyor';
    if (req.status === 'approved') {
      badgeClass = 'badge-approved';
      statusText = 'Enjekte Edildi';
    } else if (req.status === 'rejected') {
      badgeClass = 'badge-rejected';
      statusText = 'Engellendi';
    }
    
    // Detail formatting
    let detailsHTML = '';
    let typeLabel = '';
    let amountSuffix = '';
    
    if (req.type === 'bet') {
      typeLabel = 'Bet (USDT)';
      amountSuffix = ' USDT';
      detailsHTML = `
        <div><strong>Cüzdan (TRC20):</strong> ${req.details.usdtAddress}</div>
      `;
    } else if (req.type === 'crypto') {
      typeLabel = 'Kripto (TRX)';
      amountSuffix = ' TRX';
      detailsHTML = `
        <div><strong>Cüzdan (TRX):</strong> ${req.details.trxAddress}</div>
      `;
    } else if (req.type === 'iban') {
      typeLabel = 'Havale Enjeksiyonu';
      amountSuffix = ' ₺';
      detailsHTML = `
        <div><strong>Gönderen:</strong> ${req.details.fullName}</div>
        <div><strong>IBAN:</strong> ${req.details.iban}</div>
      `;
    }
    
    const formattedDate = new Date(req.createdAt).toLocaleString('tr-TR');
    
    // Buttons for action if pending
    let actionButtonsHTML = '';
    if (req.status === 'pending') {
      actionButtonsHTML = `
        <div class="request-action-row">
          <button onclick="handleRequestAction('${req.id}', 'approved')" class="btn-action-approve">
            <i class="fa-solid fa-bolt"></i> Enjekte Et
          </button>
          <button onclick="handleRequestAction('${req.id}', 'rejected')" class="btn-action-reject">
            <i class="fa-solid fa-ban"></i> Engelle
          </button>
        </div>
      `;
    }
    
    item.innerHTML = `
      <div class="request-item-header">
        <span class="request-id">${req.id}</span>
        <span class="request-badge ${badgeClass}">${statusText}</span>
      </div>
      <div class="request-details-grid">
        <div><strong>Root Key:</strong> <span style="font-family: monospace; font-weight:600; color: var(--accent-emerald);">${req.key}</span></div>
        <div><strong>Hat:</strong> ${typeLabel}</div>
        <div><strong>Paket Tutar:</strong> ${req.amount}${amountSuffix}</div>
        ${detailsHTML}
        <div><strong>Zaman Damgası:</strong> ${formattedDate}</div>
      </div>
      ${actionButtonsHTML}
    `;
    
    container.appendChild(item);
  });
}

// Render Keys List
function renderKeys(searchTerm = '') {
  const container = document.getElementById('keys-list');
  
  let filtered = keysData;
  if (searchTerm) {
    const term = searchTerm.toUpperCase();
    filtered = keysData.filter(k => k.key.toUpperCase().includes(term));
  }
  
  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-key" style="opacity: 0.5;"></i>
        <p>Erişim anahtarı bulunamadı.</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = '';
  
  filtered.forEach(k => {
    const item = document.createElement('div');
    item.className = 'key-item';
    
    const dateFormatted = new Date(k.createdAt).toLocaleDateString('tr-TR');
    
    item.innerHTML = `
      <div>
        <div class="key-code">${k.key}</div>
        <div class="key-date">Kayıt: ${dateFormatted}</div>
      </div>
      <button onclick="deleteKey('${k.key}')" class="btn-delete-key" title="Root Key Sil">
        <i class="fa-solid fa-trash-can"></i>
      </button>
    `;
    
    container.appendChild(item);
  });
}

// Request Action (Approve / Reject)
async function handleRequestAction(requestId, action) {
  if (!adminSecret) return;
  
  try {
    const result = await apiCall('/api/admin/action', 'POST', { requestId, action }, { 'X-Admin-Secret': adminSecret });
    
    if (result.success) {
      showToast(result.message, 'success');
      loadDashboardData();
    } else {
      showToast(result.message || 'İşlem başarısız.', 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('İşlem tamamlanamadı.', 'error');
  }
}

// Generate New User Key
async function generateNewKey() {
  if (!adminSecret) return;
  
  try {
    const result = await apiCall('/api/admin/keys/generate', 'POST', null, { 'X-Admin-Secret': adminSecret });
    
    if (result.success) {
      showToast(`Yeni Root Key üretildi: ${result.key.key}`, 'success');
      loadDashboardData();
    } else {
      showToast(result.message || 'Key üretilemedi.', 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Key üretilemedi.', 'error');
  }
}

// Delete User Key
async function deleteKey(key) {
  if (!adminSecret) return;
  
  if (!confirm(`${key} anahtarını silmek istediğinize emin misiniz?`)) {
    return;
  }
  
  try {
    const result = await apiCall('/api/admin/keys/delete', 'POST', { key }, { 'X-Admin-Secret': adminSecret });
    
    if (result.success) {
      showToast(result.message, 'success');
      loadDashboardData();
    } else {
      showToast(result.message || 'Key silinemedi.', 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Key silinemedi.', 'error');
  }
}

// Filter tabs trigger
function filterRequests(status) {
  activeFilter = status;
  
  // Tab UI toggle
  const tabsContainer = document.getElementById('status-filters');
  tabsContainer.querySelectorAll('.nav-tab').forEach(tab => {
    tab.classList.remove('active');
  });
  
  // Set active class to clicked button
  event.target.classList.add('active');
  
  renderRequests();
}

// Search Keys Input trigger
function searchKeys() {
  const searchVal = document.getElementById('key-search').value;
  renderKeys(searchVal);
}

// Polling setup for Admin
function startAdminPolling() {
  stopAdminPolling();
  
  adminPollInterval = setInterval(() => {
    loadDashboardData();
  }, 2000); // refresh admin dashboard every 2 seconds for snappier experience locally
}

function stopAdminPolling() {
  if (adminPollInterval) {
    clearInterval(adminPollInterval);
    adminPollInterval = null;
  }
}
