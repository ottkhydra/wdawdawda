// Global State
let userKey = localStorage.getItem('userKey') || '';
let pollInterval = null;
let currentRequestId = '';

// On Page Load
document.addEventListener('DOMContentLoaded', () => {
  setupIbanAutoFormat();
  
  if (userKey) {
    checkActiveRequestAndRoute();
  } else {
    showView('login');
  }
});

// Navigation Controller
function showView(viewId) {
  document.querySelectorAll('.view').forEach(view => {
    view.classList.add('hidden');
  });
  
  const targetView = document.getElementById(`view-${viewId}`);
  if (targetView) {
    targetView.classList.remove('hidden');
  }
  
  // Custom Header Updates based on view
  const titleEl = document.getElementById('app-title');
  const subtitleEl = document.getElementById('app-subtitle');
  
  if (viewId === 'login') {
    titleEl.textContent = 'SİBER AKTARIM TERMİNALİ';
    subtitleEl.textContent = 'Güvenli veri tünelleme ve bakiye yükleme protokolü';
  } else if (viewId === 'selection') {
    titleEl.textContent = 'BAĞLANTI YOLU SEÇİN';
    subtitleEl.textContent = 'Veri enjeksiyonu yapılacak hattı belirleyin';
  } else if (viewId === 'form-bet') {
    titleEl.textContent = 'BET TÜNELİ ENJEKSİYONU';
    subtitleEl.textContent = 'USDT protokolü üzerinden bakiye aktarımı';
  } else if (viewId === 'form-crypto') {
    titleEl.textContent = 'KRİPTO ENJEKSİYON HATTI';
    subtitleEl.textContent = 'TRX ağı üzerinden bakiye enjeksiyonu';
  } else if (viewId === 'form-iban') {
    titleEl.textContent = 'BANKA VERİ TABANI SİNYALİ';
    subtitleEl.textContent = 'TR IBAN enjeksiyonu ile TL aktarımı';
  } else if (viewId === 'status') {
    titleEl.textContent = 'İŞLEM DURUMU';
    subtitleEl.textContent = 'Aktarım sinyalinin canlı kontrol durumu';
  }
}

// Toast Notifications
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  const toastText = document.getElementById('toast-text');
  
  toast.className = 'toast'; // reset classes
  toast.classList.add(`toast-${type}`);
  toastText.textContent = message;
  
  toast.classList.add('show');
  
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

// Auto Format IBAN Input
function setupIbanAutoFormat() {
  const ibanInput = document.getElementById('iban-number');
  if (!ibanInput) return;
  
  ibanInput.addEventListener('input', (e) => {
    let value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    
    // Ensure starts with TR
    if (value.length > 0 && !value.startsWith('T')) {
      value = 'TR' + value;
    } else if (value.length > 1 && value.startsWith('T') && !value.startsWith('TR')) {
      value = 'TR' + value.substring(1);
    }
    
    // Auto-spacing every 4 digits
    let formatted = '';
    for (let i = 0; i < value.length; i++) {
      if (i > 0 && i % 4 === 0) {
        formatted += ' ';
      }
      formatted += value[i];
    }
    
    // Limit to max IBAN length (TR + 24 digits + 6 spaces = 32 chars)
    e.target.value = formatted.substring(0, 32);
  });
}

// Quick amount buttons helper
function setQuickAmount(type, value) {
  // Update input field
  const inputEl = document.getElementById(`${type}-amount`);
  if (inputEl) {
    inputEl.value = value;
  }
  
  // Update button active state
  const container = document.getElementById(`${type}-amount-choices`);
  if (container) {
    container.querySelectorAll('.amount-btn').forEach(btn => {
      btn.classList.remove('active');
      if (parseFloat(btn.textContent) === value || (btn.textContent.includes(value.toString()))) {
        btn.classList.add('active');
      }
    });
  }
}

// ==================== HYBRID DATABASE & API CLIENT ====================

// LocalStorage Database Seeds with Hacker Keys
function initLocalDB() {
  if (localStorage.getItem('ls_adminUsername') !== 'admin') {
    localStorage.setItem('ls_adminUsername', 'admin');
  }
  if (localStorage.getItem('ls_adminPassword') !== 'admin') {
    localStorage.setItem('ls_adminPassword', 'admin');
  }
  if (!localStorage.getItem('ls_db_initialized')) {
    localStorage.setItem('ls_keys', JSON.stringify([
      { key: "ROOT-DEMO-123", createdAt: new Date().toISOString() },
      { key: "CYBER-777-NET", createdAt: new Date().toISOString() }
    ]));
    localStorage.setItem('ls_requests', JSON.stringify([]));
    localStorage.setItem('ls_db_initialized', 'true');
  }
}
initLocalDB();

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
  
  if (endpoint === '/api/login' && method === 'POST') {
    const normalizedKey = body.key.trim().toUpperCase();
    const keyExists = keys.find(k => k.key.toUpperCase() === normalizedKey);
    if (keyExists) {
      return { success: true, message: 'Erişim doğrulandı. Tünel açıldı.', key: normalizedKey };
    } else {
      return { success: false, message: 'Hatalı Root Key! Erişim engellendi.' };
    }
  }
  
  if (endpoint === '/api/status' && method === 'POST') {
    const normalizedKey = body.key.trim().toUpperCase();
    const userRequests = requests.filter(r => r.key.toUpperCase() === normalizedKey);
    if (userRequests.length === 0) {
      return { success: true, request: null };
    }
    const latestRequest = userRequests.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
    return { success: true, request: latestRequest };
  }
  
  if (endpoint === '/api/deposit' && method === 'POST') {
    const normalizedKey = body.key.trim().toUpperCase();
    const keyExists = keys.find(k => k.key.toUpperCase() === normalizedKey);
    if (!keyExists) {
      return { success: false, message: 'Geçersiz Root Key. İşlem reddedildi.' };
    }
    const pendingRequest = requests.find(r => r.key.toUpperCase() === normalizedKey && r.status === 'pending');
    if (pendingRequest) {
      return { success: false, message: 'Ağda bekleyen aktif bir enjeksiyon bulunuyor.' };
    }
    
    const newRequest = {
      id: 'TXID_' + Math.random().toString(36).substr(2, 9).toUpperCase(),
      key: normalizedKey,
      type: body.type,
      amount: parseFloat(body.amount),
      details: body.details,
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    requests.push(newRequest);
    localStorage.setItem('ls_requests', JSON.stringify(requests));
    return { success: true, request: newRequest, message: 'Veri paketi tünele alındı. Sistem onayı bekleniyor.' };
  }
  
  return { success: false, message: 'Endpoint bulunamadı (Local Emulation)' };
}

// ==================== USER ACTIONS ====================

// Handle Login Submission
async function handleLogin(e) {
  e.preventDefault();
  const keyInput = document.getElementById('login-key').value.trim();
  
  if (!keyInput) {
    showToast('Lütfen geçerli bir kod girin.', 'error');
    return;
  }
  
  try {
    const result = await apiCall('/api/login', 'POST', { key: keyInput });
    
    if (result.success) {
      userKey = result.key;
      localStorage.setItem('userKey', userKey);
      showToast(result.message, 'success');
      checkActiveRequestAndRoute();
    } else {
      showToast(result.message || 'Erişim reddedildi.', 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Bağlantı hatası oluştu.', 'error');
  }
}

// Logout
function logout() {
  userKey = '';
  localStorage.removeItem('userKey');
  stopPolling();
  
  // Clear forms
  document.querySelectorAll('form').forEach(f => f.reset());
  document.querySelectorAll('.amount-btn').forEach(b => b.classList.remove('active'));
  
  showToast('Tünel kapatıldı.', 'info');
  showView('login');
}

// Select Method Form
function selectMethod(method) {
  // Clear other forms before displaying
  document.getElementById('form-bet').reset();
  document.getElementById('form-crypto').reset();
  document.getElementById('form-iban').reset();
  document.querySelectorAll('.amount-btn').forEach(b => b.classList.remove('active'));
  
  showView(`form-${method}`);
}

// Submit Deposit Request
async function submitDeposit(e, type) {
  e.preventDefault();
  
  let details = {};
  let amount = 0;
  
  if (type === 'bet') {
    const usdtAddress = document.getElementById('bet-usdt-address').value.trim();
    amount = document.getElementById('bet-amount').value;
    details = { usdtAddress };
  } else if (type === 'crypto') {
    const trxAddress = document.getElementById('crypto-trx-address').value.trim();
    amount = document.getElementById('crypto-amount').value;
    details = { trxAddress };
  } else if (type === 'iban') {
    const fullName = document.getElementById('iban-fullname').value.trim();
    const iban = document.getElementById('iban-number').value.trim();
    amount = document.getElementById('iban-amount').value;
    details = { fullName, iban };
  }
  
  try {
    const result = await apiCall('/api/deposit', 'POST', {
      key: userKey,
      type,
      amount,
      details
    });
    
    if (result.success) {
      showToast(result.message, 'success');
      renderStatusView(result.request);
      startPolling();
    } else {
      showToast(result.message || 'Paket iletilemedi.', 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Talebiniz gönderilemedi.', 'error');
  }
}

// Check if user has active/recent requests, route accordingly
async function checkActiveRequestAndRoute() {
  if (!userKey) return;
  
  try {
    const result = await apiCall('/api/status', 'POST', { key: userKey });
    
    if (result.success) {
      if (result.request) {
        renderStatusView(result.request);
        if (result.request.status === 'pending') {
          startPolling();
        }
      } else {
        showView('selection');
      }
    } else {
      logout();
    }
  } catch (err) {
    console.error(err);
    showView('selection');
  }
}

// Render status details
function renderStatusView(req) {
  currentRequestId = req.id;
  
  // Hide all status contents first
  document.getElementById('status-pending-ui').classList.add('hidden');
  document.getElementById('status-approved-ui').classList.add('hidden');
  document.getElementById('status-rejected-ui').classList.add('hidden');
  
  // Show the corresponding status container
  if (req.status === 'pending') {
    document.getElementById('status-pending-ui').classList.remove('hidden');
  } else if (req.status === 'approved') {
    document.getElementById('status-approved-ui').classList.remove('hidden');
  } else if (req.status === 'rejected') {
    document.getElementById('status-rejected-ui').classList.remove('hidden');
  }
  
  // Update Table Details
  document.getElementById('status-req-id').textContent = req.id;
  
  let typeLabel = '';
  let detailLabel = '';
  let detailValue = '';
  let amountSuffix = '';
  
  if (req.type === 'bet') {
    typeLabel = 'Bet (USDT)';
    detailLabel = 'USDT Cüzdanı:';
    detailValue = req.details.usdtAddress;
    amountSuffix = ' USDT';
  } else if (req.type === 'crypto') {
    typeLabel = 'Kripto (TRX)';
    detailLabel = 'TRX Cüzdanı:';
    detailValue = req.details.trxAddress;
    amountSuffix = ' TRX';
  } else if (req.type === 'iban') {
    typeLabel = 'Havale Enjeksiyonu';
    detailLabel = 'Gönderen Adı:';
    detailValue = req.details.fullName;
    amountSuffix = ' ₺';
  }
  
  document.getElementById('status-req-method').textContent = typeLabel;
  document.getElementById('status-req-amount').textContent = req.amount + amountSuffix;
  document.getElementById('status-detail-label').textContent = detailLabel;
  document.getElementById('status-req-address').textContent = detailValue;
  document.getElementById('status-req-date').textContent = new Date(req.createdAt).toLocaleString('tr-TR');
  
  showView('status');
}

// Real-time status Poller
function startPolling() {
  stopPolling(); // Clear existing if any
  
  pollInterval = setInterval(async () => {
    if (!userKey) {
      stopPolling();
      return;
    }
    
    try {
      const result = await apiCall('/api/status', 'POST', { key: userKey });
      
      if (result.success && result.request) {
        const req = result.request;
        
        // If status changed, render updates and toast user
        if (req.id === currentRequestId && req.status !== 'pending') {
          renderStatusView(req);
          stopPolling(); // Stop polling as it's completed/rejected
          
          if (req.status === 'approved') {
            showToast('Tünel enjeksiyonu başarıyla onaylandı.', 'success');
          } else {
            showToast('Sinyal engellendi, aktarım reddedildi.', 'error');
          }
        }
      }
    } catch (err) {
      console.error('Polling error:', err);
    }
  }, 2000); // Poll every 2 seconds for snappier experience locally
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

// Reset view back to selection
function resetToSelection() {
  stopPolling();
  currentRequestId = '';
  showView('selection');
}
