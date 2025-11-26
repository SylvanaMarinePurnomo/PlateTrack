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
// --- END DATA SIMULATION ---

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const loginScreen = document.getElementById('login-screen');
    const dashboardScreen = document.getElementById('dashboard-screen');
    const loginForm = document.getElementById('login-form');
    const logoutBtn = document.getElementById('logout-btn');
    const navItems = document.querySelectorAll('.main-nav .nav-item');
    const views = document.querySelectorAll('.content .view');
    const registerForm = document.getElementById('register-form');
    const searchInput = document.getElementById('search-plate');
    
    // Initial Setup
    renderStaffData(staffData);
    updateMetrics();
    
    // Login/Logout Functionality
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
        // Reset to home view
        switchView('home-view');
    });

    // Navigation / View Switching
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

        // Refresh data when switching to data view
        if (target === 'data-view') {
            renderStaffData(staffData);
        }
    }

    // Register Staff Car Plate
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
             // Plate already registered to a *different* staff
            messageDiv.innerHTML = `Plate ${plate} is already registered to Staff ID ${staffData[existingPlateIndex].id}. A plate can only be registered once.`;
            messageDiv.classList.add('error');
            return;
        }

        if (existingStaffIndex !== -1) {
            // Staff ID found: Update plate (feature 5: automatically delete old plate)
            
            const oldPlate = staffData[existingStaffIndex].plate;

            if (oldPlate !== plate) {
                // Update and warn
                staffData[existingStaffIndex].plate = plate;
                staffData[existingStaffIndex].name = staffName;
                staffData[existingStaffIndex].registeredDate = new Date().toISOString().slice(0, 10);
                
                messageDiv.innerHTML = `Warning: **Updated!** Staff ID **${staffId}** (${staffName})'s plate has been changed from **${oldPlate}** to **${plate}**. (Old plate removed automatically)`;
                messageDiv.classList.add('warning');
            } else {
                 // Staff ID found, same plate
                staffData[existingStaffIndex].name = staffName; // Update name just in case
                messageDiv.innerHTML = `Staff ID **${staffId}** already has plate **${plate}**. Data updated.`;
                messageDiv.classList.add('success');
            }
        } else {
            // New Staff ID: Register new entry
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

        // Reset form and update metrics/data table
        registerForm.reset();
        updateMetrics(); 
        // Note: Data table will refresh when user navigates to Data View
    });

    // See all & Search Staff’s License Plate Data
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

    // Function to handle plate deletion (called from inline onclick)
    window.deleteStaffPlate = function(plateToDelete) {
        if (confirm(`Are you sure you want to delete the registration for plate ${plateToDelete}?`)) {
            staffData = staffData.filter(staff => staff.plate !== plateToDelete);
            renderStaffData(staffData);
            updateMetrics();
        }
    }


    // User Profile / Home Metrics Update
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
});