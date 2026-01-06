let isLoggedIn = false;

const COMPANY_ACCOUNT = {
    username: "CGS_Company",
    password: "123",
    companyName: "Staff-First Parking Services",
    companyId: "CGS-001"
};

let staffData = [
    { id: 'S101', name: 'Sylvana Marine Purnomo', plate: 'BE1653AAG', registeredDate: '2023-10-20' },
    { id: 'S102', name: 'Gavriella Tjandra', plate: 'B1030NZQ', registeredDate: '2023-10-21' },
    { id: 'S103', name: 'Christian Sadikin', plate: 'B12ABC', registeredDate: '2023-10-22' },
];


const ws = new WebSocket("ws://127.0.0.1:5000/ws");

ws.onopen = () => {
    console.log("WebSocket connected");
};

ws.onerror = (err) => {
    console.error("WebSocket error:", err);
};


document.addEventListener('DOMContentLoaded', () => {

    
    const loginScreen = document.getElementById('login-screen');
    const dashboardScreen = document.getElementById('dashboard-screen');
    const loginForm = document.getElementById('login-form');
    const logoutBtn = document.getElementById('logout-btn');

    const navItems = document.querySelectorAll('.main-nav .nav-item');
    const views = document.querySelectorAll('.content .view');

    const registerForm = document.getElementById('register-form');
    const searchInput = document.getElementById('search-plate');

    const plateReaderForm = document.getElementById('plate-reader-form');
    const readerMessage = document.getElementById('reader-message');
    const readerResults = document.getElementById('reader-results');

    const resultPlateText = document.getElementById('result-plate-text');
    const resultStatus = document.getElementById('result-status');
    const resultConfidence = document.getElementById('result-confidence');
    const accessStatusText = document.getElementById('access-status-text');

  
    renderStaffData(staffData);
    updateMetrics();

    
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        const messageDiv = document.getElementById('login-message');

        if (username === COMPANY_ACCOUNT.username && password === COMPANY_ACCOUNT.password) {
            isLoggedIn = true;
            loginScreen.classList.remove('active');
            dashboardScreen.classList.add('active');
            messageDiv.textContent = '';
            renderUserProfile();
        } else {
            messageDiv.textContent = 'Invalid username or password.';
            messageDiv.className = 'message error';
        }
    });

    logoutBtn.addEventListener('click', () => {
        isLoggedIn = false;
        loginScreen.classList.add('active');
        dashboardScreen.classList.remove('active');
    });

    
    navItems.forEach(item => {
        item.addEventListener('click', e => {
            e.preventDefault();
            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');
            switchView(item.dataset.target);
        });
    });

    function switchView(target) {
        views.forEach(v => v.classList.remove('active'));
        document.getElementById(target).classList.add('active');

        if (target === 'data-view') {
            renderStaffData(staffData);
        }
    }

    
    if (plateReaderForm) {
        plateReaderForm.addEventListener('submit', e => {
            e.preventDefault();

            readerMessage.style.display = 'block';
            readerMessage.className = 'message';
            readerMessage.textContent = 'Processing image...';
            readerResults.style.display = 'none';
            accessStatusText.textContent = '';

            if (ws.readyState !== WebSocket.OPEN) {
                readerMessage.className = 'message error';
                readerMessage.textContent = 'WebSocket not connected.';
                return;
            }

            const fileInput = document.getElementById('plate-image');
            const file = fileInput.files[0];

            if (!file) {
                readerMessage.className = 'message error';
                readerMessage.textContent = 'No image selected.';
                return;
            }

            const reader = new FileReader();
            reader.onload = () => {
                const base64Image = reader.result.split(",")[1];

                ws.send(JSON.stringify({
                    type: "image",
                    image: base64Image
                }));
            };

            reader.readAsDataURL(file);
        });
    }

    
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type !== "result") return;

        readerMessage.className =
            data.status === 'SUCCESS' ? 'message success' : 'message error';
        readerMessage.textContent = `Processing Complete: ${data.status}`;

        resultPlateText.textContent = data.plate_text || 'N/A';
        resultStatus.textContent = data.status;
        resultConfidence.textContent =
            data.yolo_confidence !== undefined
                ? `${(data.yolo_confidence * 100).toFixed(2)}%`
                : 'N/A';

        if (data.access_status === 'GRANTED') {
            accessStatusText.textContent = 'GRANTED';
            accessStatusText.style.color = '#4CAF50';
        } else {
            accessStatusText.textContent = 'DENIED';
            accessStatusText.style.color = '#F44336';
        }

        readerResults.style.display = 'block';
    };

    function renderStaffData(data) {
        const tbody = document.getElementById('plate-data-body');
        tbody.innerHTML = '';

        data.forEach(s => {
            tbody.innerHTML += `
                <tr>
                    <td>${s.id}</td>
                    <td>${s.name}</td>
                    <td><strong>${s.plate}</strong></td>
                    <td>${s.registeredDate}</td>
                </tr>`;
        });
    }

    function renderUserProfile() {
        document.getElementById('user-profile-summary').innerHTML = `
            <h4>${COMPANY_ACCOUNT.companyName}</h4>
            <p>ID: ${COMPANY_ACCOUNT.companyId}</p>
            <p>Total Plates: <strong>${staffData.length}</strong></p>`;
    }

    function updateMetrics() {
        document.getElementById('total-plates-count').textContent = staffData.length;
    }

});
