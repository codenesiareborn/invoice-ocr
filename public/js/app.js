// DOM Elements
const uploadZone = document.getElementById('uploadZone');
const fileInput = document.getElementById('fileInput');
const cameraBtn = document.getElementById('cameraBtn');
const cameraPreview = document.getElementById('cameraPreview');
const cameraVideo = document.getElementById('cameraVideo');
const captureBtn = document.getElementById('captureBtn');
const closeCameraBtn = document.getElementById('closeCameraBtn');
const canvas = document.getElementById('canvas');
const loading = document.getElementById('loading');
const resultsSection = document.getElementById('resultsSection');
const resultGrid = document.getElementById('resultGrid');
const itemsSection = document.getElementById('itemsSection');
const itemsTable = document.getElementById('itemsTable');
const newScanBtn = document.getElementById('newScanBtn');
const errorMessage = document.getElementById('errorMessage');
const recentList = document.getElementById('recentList');

let stream = null;

// API Base URL
const API_BASE_URL = 'http://localhost:3000/api';

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadRecentInvoices();
});

// File Upload Events
uploadZone.addEventListener('click', () => fileInput.click());

uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('drag-over');
});

uploadZone.addEventListener('dragleave', () => {
    uploadZone.classList.remove('drag-over');
});

uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('drag-over');

    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
        processImage(file);
    } else {
        showError('Please upload a valid image file');
    }
});

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        processImage(file);
    }
});

// Camera Events
cameraBtn.addEventListener('click', async () => {
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' }
        });
        cameraVideo.srcObject = stream;
        cameraPreview.style.display = 'block';
        cameraBtn.style.display = 'none';
    } catch (error) {
        showError('Cannot access camera. Please check permissions.');
        console.error('Camera error:', error);
    }
});

closeCameraBtn.addEventListener('click', () => {
    stopCamera();
});

captureBtn.addEventListener('click', () => {
    // Set canvas dimensions to match video
    canvas.width = cameraVideo.videoWidth;
    canvas.height = cameraVideo.videoHeight;

    // Draw video frame to canvas
    const ctx = canvas.getContext('2d');
    ctx.drawImage(cameraVideo, 0, 0);

    // Convert canvas to blob
    canvas.toBlob((blob) => {
        const file = new File([blob], 'camera-capture.jpg', { type: 'image/jpeg' });
        stopCamera();
        processImage(file);
    }, 'image/jpeg', 0.95);
});

newScanBtn.addEventListener('click', () => {
    resetUI();
});

// Process Image
async function processImage(file) {
    try {
        // Hide previous results and errors
        resultsSection.style.display = 'none';
        errorMessage.style.display = 'none';

        // Show loading
        loading.style.display = 'block';

        // Create form data
        const formData = new FormData();
        formData.append('invoice', file);

        // Send to API
        const response = await fetch(`${API_BASE_URL}/invoice/process`, {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        // Hide loading
        loading.style.display = 'none';

        if (result.success) {
            displayResults(result.data);
            loadRecentInvoices();
        } else {
            showError(result.error || 'Failed to process invoice');
        }

    } catch (error) {
        loading.style.display = 'none';
        showError('Network error. Please check if the server is running.');
        console.error('Processing error:', error);
    }
}

// Display Results
function displayResults(data) {
    // Clear previous results
    resultGrid.innerHTML = '';

    // Create result items
    const fields = [
        { label: 'Invoice Number', value: data.invoice_number || 'N/A' },
        { label: 'Date', value: data.invoice_date || 'N/A' },
        { label: 'Vendor', value: data.vendor_name || 'N/A' },
        {
            label: 'Total Amount',
            value: data.total_amount && data.currency
                ? `${data.currency} ${formatNumber(data.total_amount)}`
                : 'N/A',
            highlight: true
        }
    ];

    fields.forEach(field => {
        const item = document.createElement('div');
        item.className = 'result-item';
        item.innerHTML = `
            <div class="result-label">${field.label}</div>
            <div class="result-value ${field.highlight ? 'highlight' : ''}">${field.value}</div>
        `;
        resultGrid.appendChild(item);
    });

    // Display items table if available
    if (data.items && data.items.length > 0) {
        itemsSection.style.display = 'block';
        displayItemsTable(data.items);
    } else {
        itemsSection.style.display = 'none';
    }

    // Show results section
    resultsSection.style.display = 'block';
}

// Display Items Table
function displayItemsTable(items) {
    itemsTable.innerHTML = `
        <thead>
            <tr>
                <th>Description</th>
                <th>Quantity</th>
                <th>Unit Price</th>
                <th>Amount</th>
            </tr>
        </thead>
        <tbody>
            ${items.map(item => `
                <tr>
                    <td>${item.description || 'N/A'}</td>
                    <td>${item.quantity || 0}</td>
                    <td>${formatNumber(item.unit_price || 0)}</td>
                    <td>${formatNumber(item.amount || 0)}</td>
                </tr>
            `).join('')}
        </tbody>
    `;
}

// Load Recent Invoices
async function loadRecentInvoices() {
    try {
        const response = await fetch(`${API_BASE_URL}/invoice/list`);
        const result = await response.json();

        if (result.success && result.data.length > 0) {
            displayRecentInvoices(result.data.slice(0, 5)); // Show last 5
        }
    } catch (error) {
        console.error('Error loading recent invoices:', error);
    }
}

// Display Recent Invoices
function displayRecentInvoices(invoices) {
    recentList.innerHTML = invoices.map(invoice => `
        <div class="recent-item" onclick="viewInvoice(${invoice.id})">
            <div class="recent-item-header">
                <div class="recent-item-title">${invoice.invoice_number || 'No Invoice Number'}</div>
                <div class="recent-item-date">${formatDate(invoice.created_at)}</div>
            </div>
            <div class="recent-item-details">
                <div><strong>Vendor:</strong> ${invoice.vendor_name || 'N/A'}</div>
                <div><strong>Amount:</strong> ${invoice.currency || ''} ${formatNumber(invoice.total_amount || 0)}</div>
                <div><strong>Date:</strong> ${invoice.invoice_date || 'N/A'}</div>
            </div>
        </div>
    `).join('');
}

// View Invoice Details
async function viewInvoice(id) {
    try {
        loading.style.display = 'block';
        const response = await fetch(`${API_BASE_URL}/invoice/${id}`);
        const result = await response.json();
        loading.style.display = 'none';

        if (result.success) {
            displayResults(result.data);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    } catch (error) {
        loading.style.display = 'none';
        showError('Failed to load invoice details');
        console.error('Error:', error);
    }
}

// Utility Functions
function stopCamera() {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }
    cameraPreview.style.display = 'none';
    cameraBtn.style.display = 'flex';
}

function resetUI() {
    resultsSection.style.display = 'none';
    errorMessage.style.display = 'none';
    fileInput.value = '';
}

function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
    setTimeout(() => {
        errorMessage.style.display = 'none';
    }, 5000);
}

function formatNumber(num) {
    return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(num);
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}
