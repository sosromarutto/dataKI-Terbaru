// Let's use the dynamic data from data.js
let currentChart = null;


// Inisialisasi setelah DOM dimuat
document.addEventListener('DOMContentLoaded', () => {
    updateDashboardView(); // Render tabel & chart pertama kali
    renderMap();           // Render peta (statis berdasarkan provinsi)
});

// Fungsi untuk mengganti data berdasarkan dropdown
function updateDashboardView() {
    const selector = document.getElementById('viewSelector');
    const selectedView = selector.value;
    
    // Ambil data dari data.js
    const dataToRender = dashboardData[selectedView] || [];
    
    // Update Judul pada Header Tabel dan Chart jika perlu
    let columnHeader = "Kategori Data";
    if (selectedView === "Kota") columnHeader = "Kota";
    else if (selectedView === "Rezim") columnHeader = "Rezim (Unit)";
    else if (selectedView === "Bulan") columnHeader = "Bulan (01-12)";
    else if (selectedView === "Kategori") columnHeader = "Kategori Pengaduan";
    else if (selectedView === "AsalPemohon") columnHeader = "Asal Pemohon";
    else if (selectedView === "Kanal") columnHeader = "Kanal Masuk";
    else if (selectedView === "Status") columnHeader = "Status Laporan";

    document.querySelector('#complaintTable th:nth-child(2)').textContent = columnHeader;

    populateTable(dataToRender);
    renderChart(dataToRender);
}

// Fungsi untuk mengisi tabel
function populateTable(dataArray) {
    const tbody = document.querySelector('#complaintTable tbody');
    tbody.innerHTML = '';

    dataArray.forEach((item, index) => {
        const tr = document.createElement('tr');
        
        // Animasi keterlambatan untuk setiap baris
        tr.style.animation = `fadeInUp 0.5s ease-out ${Math.min(0.05 * index, 1.5)}s both`;

        tr.innerHTML = `
            <td>${index + 1}</td>
            <td style="font-weight: 600;">${item.label}</td>
            <td><span class="count-badge">${item.jumlah.toLocaleString('id-ID')}</span></td>
        `;
        tbody.appendChild(tr);
    });
}

// Fungsi untuk merender grafik menggunakan Chart.js
function renderChart(dataArray) {
    const ctx = document.getElementById('complaintChart').getContext('2d');
    
    // Gradient untuk batang grafik
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, '#8b5cf6');   // Purple
    gradient.addColorStop(1, '#3b82f6');   // Blue
    
    const hoverGradient = ctx.createLinearGradient(0, 0, 0, 400);
    hoverGradient.addColorStop(0, '#a78bfa'); 
    hoverGradient.addColorStop(1, '#60a5fa');

    // Extract label dan data (batasi maksimal 30 agar chart tidak terlalu sesak)
    const renderData = dataArray.slice(0, 30);
    const labels = renderData.map(item => item.label);
    const dataValues = renderData.map(item => item.jumlah);

    // Konfigurasi Chart
    Chart.defaults.color = '#94a3b8';
    Chart.defaults.font.family = "'Outfit', sans-serif";

    if (currentChart) {
        currentChart.destroy(); // Hancurkan chart lama sebelum membuat yang baru
    }

    currentChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Jumlah Pengaduan',
                data: dataValues,
                backgroundColor: gradient,
                hoverBackgroundColor: hoverGradient,
                borderRadius: 8,
                borderSkipped: false,
                barThickness: 'flex',
                maxBarThickness: 40
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false // Sembunyikan legend karena hanya 1 dataset
                },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    titleFont: { size: 14, weight: '600' },
                    bodyFont: { size: 14 },
                    padding: 12,
                    cornerRadius: 8,
                    displayColors: false,
                    callbacks: {
                        label: function(context) {
                            return `Jumlah: ${context.parsed.y.toLocaleString('id-ID')}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        display: false,
                        drawBorder: false
                    },
                    ticks: {
                        font: { size: 12 }
                    }
                },
                y: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)',
                        drawBorder: false
                    },
                    ticks: {
                        font: { size: 12 },
                        callback: function(value) {
                            return value.toLocaleString('id-ID');
                        }
                    },
                    beginAtZero: true
                }
            },
            animation: {
                duration: 2000,
                easing: 'easeOutQuart'
            }
        }
    });
}

let mainMap, provinceLayer, regencyLayer;
let nationalGeoJSON, regencyGeoJSON;

// Mapping nama provinsi dari GeoJSON ke Data Excel
function normalizedProvName(name) {
    if (!name) return "";
    let n = name.toUpperCase().trim();
    // Kasus khusus ejaan tidak standar di file peta (indonesia-province-simple.json)
    if (n === "PROBANTEN") return "BANTEN";
    if (n.includes("JAKARTA RAYA")) return "DKI JAKARTA";
    if (n.includes("YOGYAKARTA")) return "DI YOGYAKARTA";
    if (n.includes("NUSATENGGARA BARAT")) return "NUSA TENGGARA BARAT";
    if (n.includes("DI. ACEH")) return "ACEH";
    return n;
}

// Helper untuk mengambil data Kabupaten/Kota dengan logika cerdas (KAB vs KOTA)
function getKabupatenData(provName, geoName, allFeatures) {
    if (!kabupatenData[provName]) return null;
    const dataP = kabupatenData[provName];
    const gn = geoName.toUpperCase().trim();
    
    // Cek apakah ada polygon 'KOTA' terpisah untuk wilayah ini di GeoJSON
    const hasKotaShape = allFeatures.some(f => {
        const name = f.properties.NAME_2.toUpperCase();
        return name === "KOTA " + gn || name === "CITY OF " + gn;
    });

    if (gn.startsWith("KOTA ")) {
        const nameOnly = gn.replace("KOTA ", "").trim();
        return dataP[gn] || dataP["KOTA " + nameOnly] || dataP[nameOnly] || null;
    }

    // Ini adalah shape regency (misal "MALANG")
    const kabKey = "KAB. " + gn;
    const kotaKey = "KOTA " + gn;

    if (!hasKotaShape) {
        // Jika tidak ada shape KOTA terpisah (seperti Blitar), gabungkan data KAB dan KOTA agar tidak hilang
        const kabData = dataP[kabKey] || dataP[gn];
        const kotaData = dataP[kotaKey];
        
        if (kabData && kotaData) {
            const merged = {
                total: kabData.total + kotaData.total,
                units: { ...kabData.units }
            };
            for (const [unit, count] of Object.entries(kotaData.units)) {
                merged.units[unit] = (merged.units[unit] || 0) + count;
            }
            return merged;
        }
        return kabData || kotaData || null;
    } else {
        // Jika ada shape KOTA terpisah, ambil data KAB saja untuk shape ini
        return dataP[kabKey] || dataP[gn] || null;
    }
    
    // Fallback terakhir: jika tidak ada yang cocok sama sekali, coba search substring
    const fuzzyKey = Object.keys(dataP).find(k => k.includes(gn) || gn.includes(k));
    return dataP[fuzzyKey] || null;
}

// Fungsi untuk menentukan warna berdasarkan jumlah pengaduan (Disesuaikan dengan data besar)
function getColorScale(jumlah) {
    if (!jumlah || jumlah === 0) return '#1e293b'; 
    if (jumlah > 5000) return '#1e3a8a'; // Deepest blue
    if (jumlah > 1000) return '#1d4ed8'; 
    if (jumlah > 500)  return '#2563eb'; 
    if (jumlah > 100)  return '#3b82f6'; 
    if (jumlah > 0)    return '#60a5fa'; // Lightest blue
    return '#1e293b';
}

function renderMap() {
    mainMap = L.map('indonesiaMap', {
        zoomControl: true,
        attributionControl: false,
        scrollWheelZoom: false
    }).setView([-2.5489, 118.0148], 5);

    // Langsung tampilkan peta nasional (Data sudah dimuat via <script>)
    showNationalMap();
}

function showNationalMap() {
    if (provinceLayer) mainMap.removeLayer(provinceLayer);
    if (regencyLayer) mainMap.removeLayer(regencyLayer);
    document.getElementById('mapBackBtn').style.display = 'none';

    mainMap.setView([-2.5489, 118.0148], 5);

    provinceLayer = L.geoJson(nationalGeoData, {
        style: function(feature) {
            const name = normalizedProvName(feature.properties.Propinsi);
            const found = dashboardData.Provinsi.find(p => p.label === name);
            return {
                fillColor: getColorScale(found ? found.jumlah : 0),
                weight: 1, color: 'rgba(255, 255, 255, 0.2)', fillOpacity: 0.9
            };
        },
        onEachFeature: function(feature, layer) {
            const name = normalizedProvName(feature.properties.Propinsi);
            const found = dashboardData.Provinsi.find(p => p.label === name);
            const jumlah = found ? found.jumlah : 0;

            layer.bindTooltip(`<strong>${name}</strong><br/>${jumlah} Pengaduan`, {
                sticky: true, className: 'custom-tooltip', direction: 'top'
            });

            layer.on({
                mouseover: (e) => { e.target.setStyle({ weight: 2, color: '#fff' }); },
                mouseout: (e) => { e.target.setStyle({ weight: 1, color: 'rgba(255, 255, 255, 0.2)' }); },
                click: (e) => { drillDown(feature, e.target); }
            });
        }
    }).addTo(mainMap);
}

function drillDown(feature, layer) {
    const provName = normalizedProvName(feature.properties.Propinsi);
    
    // regencyGeoData sudah tersedia secara global
    if (!regencyGeoData) {
        console.error("Data regencyGeoData tidak ditemukan.");
        return;
    }

    if (provinceLayer) mainMap.removeLayer(provinceLayer);
    document.getElementById('mapBackBtn').style.display = 'block';

    // Filter features untuk provinsi ini
    const filteredFeatures = regencyGeoData.features.filter(f => normalizedProvName(f.properties.NAME_1) === provName);

    if (filteredFeatures.length === 0) {
        alert("Batas wilayah detail untuk " + provName + " tidak ditemukan di data GeoJSON.");
        showNationalMap();
        return;
    }

    const filtered = {
        type: "FeatureCollection",
        features: filteredFeatures
    };

    mainMap.fitBounds(layer.getBounds(), { padding: [20, 20] });

    regencyLayer = L.geoJson(filtered, {
        style: function(f) {
            const foundData = getKabupatenData(provName, f.properties.NAME_2, filteredFeatures);
            return {
                fillColor: getColorScale(foundData ? foundData.total : 0),
                weight: 1, color: 'rgba(255, 255, 255, 0.3)', fillOpacity: 0.8
            };
        },
        onEachFeature: function(f, l) {
            const foundData = getKabupatenData(provName, f.properties.NAME_2, filteredFeatures);

            let tooltipHtml = `<strong>${f.properties.NAME_2}</strong><br/>`;
            if (foundData) {
                tooltipHtml += `<span style="color:var(--accent-color); font-size:1.2em; font-weight:bold;">${foundData.total}</span> Pengaduan`;
                tooltipHtml += `<div class="unit-detail">`;
                // Urutkan unit berdasarkan jumlah terbanyak
                const sortedUnits = Object.entries(foundData.units).sort((a, b) => b[1] - a[1]);
                for (const [unit, count] of sortedUnits) {
                    tooltipHtml += `<div class="unit-item"><span>${unit}</span> <span>${count}</span></div>`;
                }
                tooltipHtml += `</div>`;
            } else {
                tooltipHtml += `0 Pengaduan`;
            }

            l.bindTooltip(tooltipHtml, { sticky: true, className: 'custom-tooltip', direction: 'top' });
            l.on({
                mouseover: (e) => { e.target.setStyle({ weight: 2, color: '#fff', fillOpacity: 1 }); },
                mouseout: (e) => { e.target.setStyle({ weight: 1, color: 'rgba(255, 255, 255, 0.3)', fillOpacity: 0.8 }); }
            });
        }
    }).addTo(mainMap);
}

function goBackToNational() {
    showNationalMap();
}

// Initialize
populateTable();
updateChart();
renderMap();
