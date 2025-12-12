let isLoggedIn = false;
const COMPANY_ACCOUNT = {
    username: "CGS_Company",
    password: "123",
    companyName: "Staff-First Parking Services",
    companyId: "CGS-001"
};

let staffData = [
    { id: 'S101', name: 'Sylvana Marine Purnomo', plate: 'B-1234-ABC', registeredDate: '2023-10-20' },
    { id: 'S102', name: 'Gavriella Tjandra', plate: 'B-123-AB', registeredDate: '2023-10-21' },
    { id: 'S103', name: 'Christian Sadikin', plate: 'B-12-ABC', registeredDate: '2023-10-22' },
];


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

    

    renderStaffData(staffData);
    updateMetrics();
    

    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const usernameInput = document.getElementById('username').value;
        const passwordInput = document.getElementById('password').value;
        const messageDiv = document.getElementById('login-message');

        if (usernameInput === COMPANY_ACCOUNT.username && passwordInput === COMPANY_ACCOUNT.password) {
            isLoggedIn = true;
            loginScreen.classList.remove('active');
            dashboardScreen.classList.add('active');
            messageDiv.innerHTML = '';
            renderUserProfile();
        } else {
            messageDiv.innerHTML = 'Invalid username or password.';
            messageDiv.classList.add('error');
        }
    });

    logoutBtn.addEventListener('click', () => {
        isLoggedIn = false;
        loginScreen.classList.add('active');
        dashboardScreen.classList.remove('active');
        document.getElementById('username').value = '';
        document.getElementById('password').value = '';

        switchView('home-view');
    });


    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const targetView = item.dataset.target;
            
            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');
            
            switchView(targetView);
        });
    });

    function switchView(target) {
        views.forEach(view => {
            view.classList.remove('active');
        });
        document.getElementById(target).classList.add('active');


        if (target === 'data-view') {
            renderStaffData(staffData);
        }
    }


    registerForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const staffId = document.getElementById('reg-staff-id').value.toUpperCase().trim();
        const staffName = document.getElementById('reg-staff-name').value.trim();
        const plate = document.getElementById('reg-license-plate').value.toUpperCase().trim();
        const messageDiv = document.getElementById('register-message');
        
        messageDiv.className = 'message';
        messageDiv.innerHTML = '';

        if (!staffId || !staffName || !plate) {
            messageDiv.innerHTML = 'Warning! All fields are required.';
            messageDiv.classList.add('warning');
            return;
        }

        const existingPlateIndex = staffData.findIndex(s => s.plate === plate);
        const existingStaffIndex = staffData.findIndex(s => s.id === staffId);
        
        if (existingPlateIndex !== -1 && staffData[existingPlateIndex].id !== staffId) {

            messageDiv.innerHTML = `Plate ${plate} is already registered to Staff ID ${staffData[existingPlateIndex].id}. A plate can only be registered once.`;
            messageDiv.classList.add('error');
            return;
        }

        if (existingStaffIndex !== -1) {
            
            const oldPlate = staffData[existingStaffIndex].plate;

            if (oldPlate !== plate) {
                staffData[existingStaffIndex].plate = plate;
                staffData[existingStaffIndex].name = staffName;
                staffData[existingStaffIndex].registeredDate = new Date().toISOString().slice(0, 10);
                
                messageDiv.innerHTML = `Warning: **Updated!** Staff ID **${staffId}** (${staffName})'s plate has been changed from **${oldPlate}** to **${plate}**. (Old plate removed automatically)`;
                messageDiv.classList.add('warning');
            } else {
                staffData[existingStaffIndex].name = staffName; 
                messageDiv.innerHTML = `Staff ID **${staffId}** already has plate **${plate}**. Data updated.`;
                messageDiv.classList.add('success');
            }
        } else {
            const newStaff = {
                id: staffId,
                name: staffName,
                plate: plate,
                registeredDate: new Date().toISOString().slice(0, 10)
            };
            staffData.push(newStaff);
            messageDiv.innerHTML = `New staff **${staffName}** registered with plate **${plate}**!`;
            messageDiv.classList.add('success');
        }

        registerForm.reset();
        updateMetrics(); 

    });

    searchInput.addEventListener('input', () => {
        const searchTerm = searchInput.value.toUpperCase().trim();
        const filteredData = staffData.filter(staff => staff.plate.includes(searchTerm));
        renderStaffData(filteredData);
    });

    function renderStaffData(data) {
        const tableBody = document.getElementById('plate-data-body');
        tableBody.innerHTML = '';

        if (data.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--color-text-light);">No data found. Try a different search term.</td></tr>`;
            return;
        }

        data.forEach(staff => {
            const row = tableBody.insertRow();
            row.innerHTML = `
                <td>${staff.id}</td>
                <td>${staff.name}</td>
                <td><strong>${staff.plate}</strong></td>
                <td>${staff.registeredDate}</td>
                <td><button class="btn danger btn-small" data-plate="${staff.plate}" onclick="deleteStaffPlate('${staff.plate}')">Delete</button></td>
            `;
        });
    }

    window.deleteStaffPlate = function(plateToDelete) {
        if (confirm(`Are you sure you want to delete the registration for plate ${plateToDelete}?`)) {
            staffData = staffData.filter(staff => staff.plate !== plateToDelete);
            renderStaffData(staffData);
            updateMetrics();
        }
    }


    function renderUserProfile() {
        const profileDiv = document.getElementById('user-profile-summary');
        profileDiv.innerHTML = `
            <h4>${COMPANY_ACCOUNT.companyName}</h4>
            <p>ID: ${COMPANY_ACCOUNT.companyId}</p>
            <p>Total Plates: <strong id="profile-plates-count">${staffData.length}</strong></p>
        `;
    }

    function updateMetrics() {
        const count = staffData.length;
        document.getElementById('total-plates-count').textContent = count;
        const profileCountElement = document.getElementById('profile-plates-count');
        if (profileCountElement) {
            profileCountElement.textContent = count;
        }
    }


    if (plateReaderForm) {
        plateReaderForm.addEventListener('submit', function(e) {
            e.preventDefault();
            

            readerMessage.style.display = 'block';
            readerMessage.className = 'message';
            readerMessage.textContent = 'Processing image... Please wait.';
            readerResults.style.display = 'none';

            const formData = new FormData(this);


            fetch('http://127.0.0.1:5000/recognize-plate', { 
                method: 'POST',
                body: formData
            })
            .then(response => {
                if (!response.ok) {
                    return response.json().then(err => { throw new Error(err.error || `HTTP error! status: ${response.status}`); });
                }
                return response.json();
            })
            .then(data => {
                readerMessage.className = data.status === 'SUCCESS' ? 'message success' : 'message error';
                readerMessage.textContent = `Processing Complete. Status: ${data.status}`;
                
                resultPlateText.textContent = data.plate_text || 'N/A';
                resultStatus.textContent = data.status;
                resultConfidence.textContent = data.yolo_confidence !== undefined ? `${(data.yolo_confidence * 100).toFixed(2)}%` : 'N/A';
                readerResults.style.display = 'block';

            })
            .catch(error => {
                console.error('Fetch error:', error);
                readerMessage.className = 'message error';
                readerMessage.textContent = `An error occurred: ${error.message}. Ensure the backend server (app.py) is running on http://127.0.0.1:5000.`;
                readerResults.style.display = 'none';
            });
        });
    }
});