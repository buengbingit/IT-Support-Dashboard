// State Management
let rawData = [];
let filteredData = [];
let charts = {};
const CORE_TECHNICIANS = ['แมน', 'บอล', 'ต้อง', 'อ้วน', 'อู๋'];

// Spreadsheet URL
const SPREADSHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/1CEDCwrcZaQMxqVnrENaSqpPyGiB8ppw56uaU8eboM1o/export?format=csv&gid=0";
const LOCAL_CSV_URL = "data.csv";

// DOM Elements
const startDateInput = document.getElementById("startDate");
const endDateInput = document.getElementById("endDate");
const refreshBtn = document.getElementById("refreshBtn");
const dataStatusText = document.getElementById("data-status");
const searchInput = document.getElementById("searchData");

// Navigation
const menuItems = document.querySelectorAll(".sidebar-menu li");
const tabContents = document.querySelectorAll(".tab-content");

// Pagination State
let currentPage = 1;
const rowsPerPage = 20;

// Initialize Web App
document.addEventListener("DOMContentLoaded", () => {
    setupNavigation();
    loadDashboardData();
    
    // Event Listeners
    refreshBtn.addEventListener("click", () => {
        refreshBtn.classList.add("fa-spin");
        loadDashboardData(true);
    });
    
    startDateInput.addEventListener("change", applyFilters);
    endDateInput.addEventListener("change", applyFilters);
    searchInput.addEventListener("input", () => {
        currentPage = 1;
        renderTable();
    });
    
    // Pagination buttons
    document.getElementById("prevPage").addEventListener("click", () => {
        if (currentPage > 1) {
            currentPage--;
            renderTable();
        }
    });
    
    document.getElementById("nextPage").addEventListener("click", () => {
        const totalPages = Math.ceil(getFilteredAndSearchedData().length / rowsPerPage);
        if (currentPage < totalPages) {
            currentPage++;
            renderTable();
        }
    });
});

// Setup Sidebar Tab Navigation
function setupNavigation() {
    menuItems.forEach(item => {
        item.addEventListener("click", (e) => {
            e.preventDefault();
            const link = item.querySelector("a").getAttribute("href");
            
            // Toggle active menu item
            menuItems.forEach(mi => mi.classList.remove("active"));
            item.classList.add("active");
            
            // Toggle active tab content
            tabContents.forEach(tc => tc.classList.remove("active"));
            
            if (link === "#dashboard") {
                document.getElementById("dashboard-tab").classList.add("active");
            } else if (link === "#analysis") {
                document.getElementById("analysis-tab").classList.add("active");
            } else if (link === "#raw-data") {
                document.getElementById("raw-data-tab").classList.add("active");
            }
        });
    });
}

// Function to convert time string HH.mm or HHmm to minutes
function parseTimeToMinutes(timeStr) {
    if (!timeStr) return null;
    timeStr = timeStr.trim().replace(",", ".");
    if (timeStr === "") return null;
    
    // HH.mm or H.mm
    if (/^\d+\.\d+$/.test(timeStr)) {
        const parts = timeStr.split(".");
        const hours = parseInt(parts[0], 10);
        let minsStr = parts[1];
        if (minsStr.length === 1) minsStr += "0"; // e.g. .5 -> .50
        const mins = parseInt(minsStr, 10);
        if (mins >= 60) return null; // Invalid minutes
        return (hours * 60) + mins;
    }
    
    // Integer format e.g. 1043 or 845
    if (/^\d+$/.test(timeStr)) {
        const val = parseInt(timeStr, 10);
        if (timeStr.length === 4) {
            const hours = Math.floor(val / 100);
            const mins = val % 100;
            if (mins >= 60) return null;
            return (hours * 60) + mins;
        } else if (timeStr.length === 3) {
            const hours = Math.floor(val / 100);
            const mins = val % 100;
            if (mins >= 60) return null;
            return (hours * 60) + mins;
        } else {
            return val * 60; // Assume it's hours
        }
    }
    
    return null;
}

// Function to convert B.E. date string to JS Date
function parseBEDate(dateStr) {
    if (!dateStr) return null;
    dateStr = dateStr.trim();
    
    // Handle specific typos like "7/10/6/" -> "7/10/68"
    if (dateStr === "7/10/6/") {
        dateStr = "7/10/68";
    }
    
    const parts = dateStr.split("/");
    if (parts.length < 3) return null;
    
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    let year = parseInt(parts[2], 10);
    
    // Check if year is 2-digit e.g., 68, 69
    if (year < 100) {
        year = 2500 + year; // Convert to B.E. e.g. 2568
    }
    
    // Convert Buddhist Era to Christian Era (C.E.)
    const ceYear = year - 543;
    
    const dateObj = new Date(ceYear, month - 1, day);
    return isNaN(dateObj.getTime()) ? null : dateObj;
}

// Fetch and Load Data
async function loadDashboardData(isRefresh = false) {
    dataStatusText.textContent = "กำลังโหลดข้อมูล...";
    
    try {
        let url = SPREADSHEET_CSV_URL;
        // Try fetching Google Sheet CSV
        let response = await fetch(url);
        if (!response.ok) {
            throw new Error("Google Sheets fetch failed, falling back to local file.");
        }
        const csvText = await response.text();
        processCSV(csvText);
        dataStatusText.textContent = "เชื่อมต่อชีทสำเร็จ (Real-time)";
    } catch (e) {
        console.warn(e.message);
        // Fallback to local data.csv
        try {
            dataStatusText.textContent = "เชื่อมต่อระบบคลาวด์ไม่ได้ กำลังโหลดข้อมูลสำรอง...";
            let response = await fetch(LOCAL_CSV_URL);
            if (!response.ok) {
                throw new Error("Local CSV fetch failed.");
            }
            const csvText = await response.text();
            processCSV(csvText);
            dataStatusText.textContent = "โหลดข้อมูลสำรองเรียบร้อยแล้ว";
        } catch (localError) {
            console.error(localError);
            dataStatusText.textContent = "เกิดข้อผิดพลาดในการโหลดข้อมูล";
            alert("ไม่สามารถดึงข้อมูลได้ทั้งช่องทาง Google Sheets และไฟล์สำรอง");
        }
    } finally {
        setTimeout(() => {
            const icon = refreshBtn.querySelector("i");
            if (icon) refreshBtn.classList.remove("fa-spin");
        }, 500);
    }
}

// Process and clean CSV data
function processCSV(csvText) {
    Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        complete: function(results) {
            const dataRows = results.data;
            if (dataRows.length === 0) return;
            
            // Discover header names dynamically (avoid encoding issues)
            const headers = Object.keys(dataRows[0]);
            const dateH = headers[0];
            const techH = headers[1];
            const deptH = headers[2];
            const bldgH = headers[3];
            const floorH = headers[4];
            const equipH = headers[5];
            const taskH = headers[7];
            const timeInH = headers[8];
            const timeOutH = headers[9];
            const descH = headers[10];
            const solH = headers[11];
            
            rawData = [];
            
            dataRows.forEach(row => {
                const rawDate = row[dateH];
                const rawTech = row[techH];
                
                if (!rawDate || !rawTech || rawTech.trim() === "") return;
                
                // Skip sidebar headers and instructions
                if (rawDate.includes("ตาราง") || rawDate.includes("รายชื่อ") || rawDate.includes("รับงาน")) return;
                
                const dateObj = parseBEDate(rawDate);
                if (!dateObj) return;
                
                const timeInMin = parseTimeToMinutes(row[timeInH]);
                const timeOutMin = parseTimeToMinutes(row[timeOutH]);
                
                let duration = null;
                let isValidTime = false;
                
                if (timeInMin !== null && timeOutMin !== null) {
                    const diff = timeOutMin - timeInMin;
                    if (diff >= 0) {
                        duration = diff;
                        isValidTime = true;
                    }
                }
                
                rawData.push({
                    dateObj: dateObj,
                    dateStr: rawDate.trim(),
                    technician: rawTech.trim(),
                    department: row[deptH] ? row[deptH].trim() : "Unknown",
                    building: row[bldgH] ? row[bldgH].trim() : "Unknown",
                    floor: row[floorH] ? row[floorH].trim() : "Unknown",
                    equipment: row[equipH] ? row[equipH].trim() : "Unknown",
                    taskType: row[taskH] ? row[taskH].trim() : "Unknown",
                    timeIn: row[timeInH] ? row[timeInH].trim() : "",
                    timeOut: row[timeOutH] ? row[timeOutH].trim() : "",
                    duration: duration,
                    isValidTime: isValidTime,
                    problem: row[descH] ? row[descH].trim() : "",
                    solution: row[solH] ? row[solH].trim() : ""
                });
            });
            
            // Sort data by date ascending
            rawData.sort((a, b) => a.dateObj - b.dateObj);
            
            // Initialize Date filter inputs
            if (rawData.length > 0) {
                const minCE = rawData[0].dateObj;
                const maxCE = rawData[rawData.length - 1].dateObj;
                
                const minStr = formatDateToISO(minCE);
                const maxStr = formatDateToISO(maxCE);
                
                startDateInput.min = minStr;
                startDateInput.max = maxStr;
                endDateInput.min = minStr;
                endDateInput.max = maxStr;
                
                // Set default values (entire range)
                startDateInput.value = minStr;
                endDateInput.value = maxStr;
            }
            
            applyFilters();
        }
    });
}

// Convert Date object to YYYY-MM-DD
function formatDateToISO(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

// Apply Filters
function applyFilters() {
    if (rawData.length === 0) return;
    
    const startVal = startDateInput.value;
    const endVal = endDateInput.value;
    
    const startDate = startVal ? new Date(startVal) : null;
    const endDate = endVal ? new Date(endVal) : null;
    if (endDate) {
        endDate.setHours(23, 59, 59, 999); // Include entire end day
    }
    
    filteredData = rawData.filter(row => {
        if (startDate && row.dateObj < startDate) return false;
        if (endDate && row.dateObj > endDate) return false;
        return true;
    });
    
    currentPage = 1;
    updateKPIs();
    renderCharts();
    renderTable();
}

// Update KPIs
function updateKPIs() {
    const total = filteredData.length;
    
    let fastCount = 0;   // <= 15 mins
    let mediumCount = 0; // 15 mins - 2 hours (120 mins)
    let slowCount = 0;   // > 2 hours (120 mins)
    
    let validDurationCount = 0;
    let sumDuration = 0;
    
    filteredData.forEach(row => {
        if (row.isValidTime) {
            validDurationCount++;
            sumDuration += row.duration;
            
            if (row.duration <= 15) {
                fastCount++;
            } else if (row.duration <= 120) {
                mediumCount++;
            } else {
                slowCount++;
            }
        }
    });
    
    const avgTime = validDurationCount > 0 ? (sumDuration / validDurationCount) : 0;
    
    // Render values
    document.getElementById("kpi-total-val").textContent = total.toLocaleString();
    
    document.getElementById("kpi-fast-val").textContent = fastCount.toLocaleString();
    const fastPct = total > 0 ? ((fastCount / total) * 100).toFixed(1) : "0.0";
    document.getElementById("kpi-fast-pct").textContent = `${fastPct}% ของเคสบันทึกเวลา`;
    
    document.getElementById("kpi-medium-val").textContent = mediumCount.toLocaleString();
    const medPct = total > 0 ? ((mediumCount / total) * 100).toFixed(1) : "0.0";
    document.getElementById("kpi-medium-pct").textContent = `${medPct}% ของเคสบันทึกเวลา`;
    
    document.getElementById("kpi-slow-val").textContent = slowCount.toLocaleString();
    const slowPct = total > 0 ? ((slowCount / total) * 100).toFixed(1) : "0.0";
    document.getElementById("kpi-slow-pct").textContent = `${slowPct}% ของเคสบันทึกเวลา`;
    
    document.getElementById("kpi-avg-val").textContent = avgTime.toFixed(1);
    
    // Update SLA gauge in Analysis Tab
    // SLA target is fast cases (<= 15m) over total cases that have duration
    const slaPercent = validDurationCount > 0 ? ((fastCount / validDurationCount) * 100).toFixed(1) : "0.0";
    document.getElementById("analysis-sla-pct").textContent = `${slaPercent}%`;
    document.getElementById("analysis-sla-fill").style.width = `${slaPercent}%`;
}

// Render/Update Charts
function renderCharts() {
    renderDepartmentsChart();
    renderEquipmentChart();
    renderProblemsChart();
    renderTechniciansChart();
}

// Helper to group and get top categories
function getGroupedData(key, topN = 10) {
    const counts = {};
    filteredData.forEach(row => {
        let val = row[key];
        if (!val || val === "") val = "ไม่ระบุ";
        counts[val] = (counts[val] || 0) + 1;
    });
    
    const sorted = Object.keys(counts).map(name => ({
        name: name,
        value: counts[name]
    })).sort((a, b) => b.value - a.value);
    
    if (sorted.length <= topN) {
        return sorted;
    }
    
    const top = sorted.slice(0, topN);
    const othersValue = sorted.slice(topN).reduce((sum, item) => sum + item.value, 0);
    top.push({ name: "อื่นๆ", value: othersValue });
    
    return top;
}

// Chart 1: Departments Pie Chart
function renderDepartmentsChart() {
    const data = getGroupedData("department", 10);
    const labels = data.map(d => d.name);
    const series = data.map(d => d.value);
    
    const options = {
        series: series,
        labels: labels,
        chart: {
            type: 'donut',
            height: 380,
            fontFamily: 'Prompt, sans-serif'
        },
        legend: {
            position: 'bottom'
        },
        dataLabels: {
            enabled: true,
            formatter: function (val) {
                return val.toFixed(1) + "%";
            }
        },
        colors: ['#0284c7', '#0ea5e9', '#38bdf8', '#7dd3fc', '#bae6fd', '#0d9488', '#0f766e', '#14b8a6', '#5eead4', '#99f6e4', '#94a3b8'],
        responsive: [{
            breakpoint: 480,
            options: {
                chart: {
                    height: 300
                },
                legend: {
                    position: 'bottom'
                }
            }
        }]
    };
    
    if (charts.departments) {
        charts.departments.destroy();
    }
    charts.departments = new ApexCharts(document.querySelector("#chart-departments"), options);
    charts.departments.render();
}

// Chart 2: Equipment Pie Chart
function renderEquipmentChart() {
    const data = getGroupedData("equipment", 10);
    const labels = data.map(d => d.name);
    const series = data.map(d => d.value);
    
    const options = {
        series: series,
        labels: labels,
        chart: {
            type: 'donut',
            height: 380,
            fontFamily: 'Prompt, sans-serif'
        },
        legend: {
            position: 'bottom'
        },
        dataLabels: {
            enabled: true,
            formatter: function (val) {
                return val.toFixed(1) + "%";
            }
        },
        colors: ['#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe', '#2563eb', '#1d4ed8', '#1e40af', '#1e3a8a', '#64748b', '#94a3b8', '#cbd5e1'],
        responsive: [{
            breakpoint: 480,
            options: {
                chart: {
                    height: 300
                },
                legend: {
                    position: 'bottom'
                }
            }
        }]
    };
    
    if (charts.equipment) {
        charts.equipment.destroy();
    }
    charts.equipment = new ApexCharts(document.querySelector("#chart-equipment"), options);
    charts.equipment.render();
}

// Chart 3: Problems Pie Chart
function renderProblemsChart() {
    const data = getGroupedData("problem", 10);
    const labels = data.map(d => d.name);
    const series = data.map(d => d.value);
    
    const options = {
        series: series,
        labels: labels,
        chart: {
            type: 'donut',
            height: 380,
            fontFamily: 'Prompt, sans-serif'
        },
        legend: {
            position: 'bottom'
        },
        dataLabels: {
            enabled: true,
            formatter: function (val) {
                return val.toFixed(1) + "%";
            }
        },
        colors: ['#0f172a', '#1e293b', '#334155', '#475569', '#64748b', '#94a3b8', '#cbd5e1', '#e2e8f0', '#f1f5f9', '#f8fafc', '#d1d5db'],
        responsive: [{
            breakpoint: 480,
            options: {
                chart: {
                    height: 300
                },
                legend: {
                    position: 'bottom'
                }
            }
        }]
    };
    
    if (charts.problems) {
        charts.problems.destroy();
    }
    charts.problems = new ApexCharts(document.querySelector("#chart-problems"), options);
    charts.problems.render();
}

// Chart 4: Technicians Column + Line mixed chart
function renderTechniciansChart() {
    // Process tech stats
    const techData = {};
    
    // Init core techs + Others
    CORE_TECHNICIANS.forEach(t => {
        techData[t] = { count: 0, sumDuration: 0, validCount: 0 };
    });
    techData["อื่นๆ"] = { count: 0, sumDuration: 0, validCount: 0 };
    
    filteredData.forEach(row => {
        const tech = row.technician;
        const key = CORE_TECHNICIANS.includes(tech) ? tech : "อื่นๆ";
        
        techData[key].count++;
        if (row.isValidTime) {
            techData[key].sumDuration += row.duration;
            techData[key].validCount++;
        }
    });
    
    const categories = [...CORE_TECHNICIANS, "อื่นๆ"];
    const counts = categories.map(cat => techData[cat].count);
    const averages = categories.map(cat => {
        const data = techData[cat];
        return data.validCount > 0 ? parseFloat((data.sumDuration / data.validCount).toFixed(1)) : 0;
    });
    
    const options = {
        series: [{
            name: 'ปริมาณงานซ่อม (เคส)',
            type: 'column',
            data: counts
        }, {
            name: 'เวลาซ่อมเฉลี่ย (นาที)',
            type: 'line',
            data: averages
        }],
        chart: {
            height: 380,
            type: 'line',
            fontFamily: 'Prompt, sans-serif',
            toolbar: {
                show: false
            }
        },
        stroke: {
            width: [0, 4]
        },
        title: {
            text: ''
        },
        colors: ['#0284c7', '#dc2626'],
        dataLabels: {
            enabled: true,
            enabledOnSeries: [0, 1]
        },
        labels: categories,
        xaxis: {
            type: 'category'
        },
        yaxis: [{
            title: {
                text: 'เคสแจ้งซ่อม (เคส)',
            },
        }, {
            opposite: true,
            title: {
                text: 'เวลาซ่อมเฉลี่ย (นาที)'
            }
        }]
    };
    
    if (charts.technicians) {
        charts.technicians.destroy();
    }
    charts.technicians = new ApexCharts(document.querySelector("#chart-technicians"), options);
    charts.technicians.render();
}

// Get filter and search applied data for data table
function getFilteredAndSearchedData() {
    const q = searchInput.value.toLowerCase().trim();
    if (q === "") return filteredData;
    
    return filteredData.filter(row => {
        return row.technician.toLowerCase().includes(q) ||
               row.department.toLowerCase().includes(q) ||
               row.equipment.toLowerCase().includes(q) ||
               row.taskType.toLowerCase().includes(q) ||
               row.problem.toLowerCase().includes(q);
    });
}

// Render Data Table
function renderTable() {
    const tableBody = document.getElementById("dataTableBody");
    tableBody.innerHTML = "";
    
    const dataToDisplay = getFilteredAndSearchedData();
    const totalRows = dataToDisplay.length;
    
    const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage));
    if (currentPage > totalPages) currentPage = totalPages;
    
    const startIndex = (currentPage - 1) * rowsPerPage;
    const endIndex = Math.min(startIndex + rowsPerPage, totalRows);
    
    const pageRows = dataToDisplay.slice(startIndex, endIndex);
    
    if (pageRows.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: var(--text-secondary);">ไม่พบข้อมูลรายการซ่อมที่ระบุ</td></tr>`;
        document.getElementById("table-info").textContent = "แสดง 0 ถึง 0 จาก 0 รายการ";
        document.getElementById("prevPage").disabled = true;
        document.getElementById("nextPage").disabled = true;
        return;
    }
    
    pageRows.forEach(row => {
        const tr = document.createElement("tr");
        
        const durationDisplay = row.isValidTime ? `${row.duration} นาที` : `<span style="color: var(--text-light); font-style: italic;">ไม่สมบูรณ์</span>`;
        
        tr.innerHTML = `
            <td>${row.dateStr}</td>
            <td><strong>${row.technician}</strong></td>
            <td>${row.department}</td>
            <td>${row.building} ชั้น ${row.floor}</td>
            <td><span class="badge" style="background-color: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color);">${row.equipment}</span></td>
            <td>${row.taskType}</td>
            <td>${row.timeIn}</td>
            <td>${row.timeOut}</td>
            <td>${durationDisplay}</td>
            <td title="${row.problem}">${truncateString(row.problem, 30)}</td>
        `;
        tableBody.appendChild(tr);
    });
    
    // Update pagination controls
    document.getElementById("table-info").textContent = `แสดง ${startIndex + 1} ถึง ${endIndex} จาก ${totalRows} รายการ`;
    document.getElementById("prevPage").disabled = currentPage === 1;
    document.getElementById("nextPage").disabled = currentPage === totalPages;
}

// Helper to truncate string
function truncateString(str, num) {
    if (!str) return "";
    if (str.length <= num) {
        return str;
    }
    return str.slice(0, num) + "...";
}
