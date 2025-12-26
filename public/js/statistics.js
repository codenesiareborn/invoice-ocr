// API Base URL
const API_BASE_URL = 'http://localhost:3000/api';

// DOM Elements
const loading = document.getElementById('loading');
const errorMessage = document.getElementById('errorMessage');
const statsContent = document.getElementById('statsContent');
const emptyState = document.getElementById('emptyState');
const overviewCards = document.getElementById('overviewCards');

// Chart instances
let monthlyChart = null;
let vendorChart = null;
let amountRangeChart = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadStatistics();
});

// Load Statistics
async function loadStatistics() {
    try {
        loading.style.display = 'block';
        errorMessage.style.display = 'none';
        statsContent.style.display = 'none';
        emptyState.style.display = 'none';

        const response = await fetch(`${API_BASE_URL}/invoice/statistics`);
        const result = await response.json();

        loading.style.display = 'none';

        if (result.success) {
            const { overview, byVendor, byMonth, byAmountRange } = result.data;

            // Check if there's any data
            if (!overview || overview.total_invoices === 0) {
                emptyState.style.display = 'block';
                return;
            }

            // Display statistics
            displayOverviewCards(overview);
            renderMonthlyChart(byMonth);
            renderVendorChart(byVendor);
            renderAmountRangeChart(byAmountRange);

            statsContent.style.display = 'block';
        } else {
            showError(result.error || 'Failed to load statistics');
        }
    } catch (error) {
        loading.style.display = 'none';
        showError('Network error. Please check if the server is running.');
        console.error('Error loading statistics:', error);
    }
}

// Display Overview Cards
function displayOverviewCards(overview) {
    const cards = [
        {
            title: 'Total Invoices',
            value: overview.total_invoices || 0,
            subtext: 'All time'
        },
        {
            title: 'Total Amount',
            value: formatCurrency(overview.total_amount || 0),
            subtext: 'All time'
        },
        {
            title: 'Average Amount',
            value: formatCurrency(overview.average_amount || 0),
            subtext: 'Per invoice'
        },
        {
            title: 'Unique Vendors',
            value: overview.unique_vendors || 0,
            subtext: 'Different companies'
        },
        {
            title: 'Min Amount',
            value: formatCurrency(overview.min_amount || 0),
            subtext: 'Smallest invoice'
        },
        {
            title: 'Max Amount',
            value: formatCurrency(overview.max_amount || 0),
            subtext: 'Largest invoice'
        }
    ];

    overviewCards.innerHTML = cards.map(card => `
        <div class="stat-card">
            <h3>${card.title}</h3>
            <div class="value">${card.value}</div>
            <div class="subtext">${card.subtext}</div>
        </div>
    `).join('');
}

// Render Monthly Chart
function renderMonthlyChart(data) {
    const ctx = document.getElementById('monthlyChart').getContext('2d');

    if (monthlyChart) {
        monthlyChart.destroy();
    }

    monthlyChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.map(d => formatMonth(d.month)),
            datasets: [
                {
                    label: 'Invoice Count',
                    data: data.map(d => d.count),
                    borderColor: '#667eea',
                    backgroundColor: 'rgba(102, 126, 234, 0.1)',
                    fill: true,
                    tension: 0.4,
                    yAxisID: 'y'
                },
                {
                    label: 'Total Amount',
                    data: data.map(d => d.total_amount || 0),
                    borderColor: '#f093fb',
                    backgroundColor: 'rgba(240, 147, 251, 0.1)',
                    fill: true,
                    tension: 0.4,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    position: 'top'
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            if (context.datasetIndex === 1) {
                                return `${context.dataset.label}: ${formatCurrency(context.raw)}`;
                            }
                            return `${context.dataset.label}: ${context.raw}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: {
                        display: true,
                        text: 'Count'
                    }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    title: {
                        display: true,
                        text: 'Amount'
                    },
                    grid: {
                        drawOnChartArea: false
                    }
                }
            }
        }
    });
}

// Render Vendor Chart
function renderVendorChart(data) {
    const ctx = document.getElementById('vendorChart').getContext('2d');

    if (vendorChart) {
        vendorChart.destroy();
    }

    // Take top 10 vendors
    const topVendors = data.slice(0, 10);

    vendorChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: topVendors.map(d => d.vendor_name || 'Unknown'),
            datasets: [{
                data: topVendors.map(d => d.total_amount || 0),
                backgroundColor: [
                    '#667eea',
                    '#f093fb',
                    '#4facfe',
                    '#43e97b',
                    '#fa709a',
                    '#fee140',
                    '#30cfd0',
                    '#c471f5',
                    '#f64f59',
                    '#12c2e9'
                ],
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        boxWidth: 12,
                        padding: 10
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const value = context.raw;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((value / total) * 100).toFixed(1);
                            return `${formatCurrency(value)} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

// Render Amount Range Chart
function renderAmountRangeChart(data) {
    const ctx = document.getElementById('amountRangeChart').getContext('2d');

    if (amountRangeChart) {
        amountRangeChart.destroy();
    }

    // Ensure all ranges are present
    const allRanges = ['0-100', '100-500', '500-1000', '1000-5000', '5000+'];
    const chartData = allRanges.map(range => {
        const found = data.find(d => d.amount_range === range);
        return found ? found.count : 0;
    });

    amountRangeChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: allRanges,
            datasets: [{
                label: 'Number of Invoices',
                data: chartData,
                backgroundColor: [
                    '#667eea',
                    '#764ba2',
                    '#f093fb',
                    '#4facfe',
                    '#43e97b'
                ],
                borderRadius: 8,
                borderSkipped: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        title: function(context) {
                            return `Amount Range: ${context[0].label}`;
                        },
                        label: function(context) {
                            return `Count: ${context.raw} invoices`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    },
                    title: {
                        display: true,
                        text: 'Number of Invoices'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Amount Range'
                    }
                }
            }
        }
    });
}

// Utility Functions
function formatCurrency(value) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(value);
}

function formatMonth(monthString) {
    if (!monthString) return 'Unknown';
    const [year, month] = monthString.split('-');
    const date = new Date(year, month - 1);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short'
    });
}

function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
}

function goBack() {
    window.location.href = '/';
}
