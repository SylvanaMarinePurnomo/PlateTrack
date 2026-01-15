let isLoggedIn = false;
let ws = null; 
let cameraStream = null;
let isDetecting = false;
let lastSendTime = 0;
let video = null;
let canvas = null;
let ctx = null;

const SEND_INTERVAL = 400; 
let currentDetections = [];


const deniedPlates = [];


let isCameraRunning = false;
let lastAuthorizedPlate = null;

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

function initWebSocket() {
    ws = new WebSocket("ws://127.0.0.1:5000/ws");

    ws.onopen = () => {
        console.log("WebSocket connected");
    };

    ws.onmessage = handleWebSocketMessage; 

    ws.onclose = () => {
        console.log("WebSocket closed");
        isDetecting = false;
        isCameraRunning = false;
    };
}
function clearCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function drawDetections(detections = currentDetections) {
        clearCanvas();

        if (!detections || detections.length === 0) return;

        ctx.lineWidth = 3;
        ctx.font = "16px Arial";

        detections.forEach(det => {
            const [x1, y1, x2, y2] = det.bbox;

            ctx.strokeStyle = det.authorized ? "green" : "red";
            ctx.fillStyle = det.authorized ? "green" : "red";

            ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
            ctx.fillText(det.plate || "UNKNOWN", x1, y1 - 5);
        });
    }

function handleWebSocketMessage(event) {
    if (!isCameraRunning) return;

    let data;
    try {
        data = JSON.parse(event.data);
    } catch (e) {
        console.warn("Non-JSON message from server:", event.data);
        return;
    }

   
    if (data.type === "reset") {
        currentDetections = [];
        lastAuthorizedPlate = null;
        clearCanvas();
        resetUI();
        return;
    }

    if (data.type !== "detections") return;

    const detections = data.results;
    currentDetections = detections;

   
    drawDetections(detections);

    if (detections.length === 0) return;

    detections.forEach(det => {

       
        const confEl = document.getElementById("result-confidence");
        if (confEl) {
            confEl.textContent = `${(det.confidence * 100).toFixed(2)}%`;
        }


        if (det.authorized) {
           // authorized
            if (lastAuthorizedPlate === det.plate) return;
            lastAuthorizedPlate = det.plate;

            const staff = staffData.find(s => s.plate === det.plate);
            if (!staff) return;

        
            const plateEl = document.getElementById("result-plate-text");
            const statusEl = document.getElementById("access-status-text");
            const resultEl = document.getElementById("result-status");

            if (plateEl) plateEl.textContent = staff.plate;
            if (statusEl) {
                statusEl.textContent = "GRANTED";
                statusEl.style.color = "green";
            }
            if (resultEl) resultEl.textContent = `${staff.name} (${staff.id})`;


        } else {
            //denied 
            if (det.plate && !deniedPlates.includes(det.plate)) {
                deniedPlates.push(det.plate);
            }

           
            const statusEl = document.getElementById("access-status-text");
            if (statusEl) {
                statusEl.textContent = "DENIED";
                statusEl.style.color = "red";
            }

        }
    });
}

document.addEventListener('DOMContentLoaded', () => {

    const loginScreen = document.getElementById('login-screen');
    const dashboardScreen = document.getElementById('dashboard-screen');
    const loginForm = document.getElementById('login-form');
    const logoutBtn = document.getElementById('logout-btn');

    const navItems = document.querySelectorAll('.main-nav .nav-item');
    const views = document.querySelectorAll('.content .view');

    const registerForm = document.getElementById('register-form');
    const searchInput = document.getElementById('search-plate');

    video = document.getElementById("camera");
    canvas = document.getElementById("overlay");
    ctx = canvas.getContext("2d");

    function resetUI() {
        const plate = document.getElementById("result-plate-text");
        const conf = document.getElementById("result-confidence");
        const status = document.getElementById("access-status-text");
        const result = document.getElementById("result-status");

        if (!plate || !conf || !status || !result) return;

        plate.textContent = "N/A";
        conf.textContent = "N/A";
        status.textContent = "";
        result.textContent = "";
    }

  
    

    window.clearCanvas = clearCanvas;
    window.drawDetections = drawDetections;
    window.resetUI = resetUI;

    const startBtn = document.getElementById("start-detect");
    const stopBtn = document.getElementById("stop-detect");
    const readerMessage = document.getElementById("reader-message");

    let stream = null;
    let detectInterval = null;

    async function startCamera() {
        cameraStream = await navigator.mediaDevices.getUserMedia({ video: true });
        video.srcObject = cameraStream;
        await video.play();

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;


        if (!ws || ws.readyState !== WebSocket.OPEN) {
            initWebSocket();
        }

        isCameraRunning = true;   
        isDetecting = true;
        requestAnimationFrame(processFrame);
    }

    function stopCamera() {
        isDetecting = false;
        isCameraRunning = false; 

        if (cameraStream) {
            cameraStream.getTracks().forEach(track => track.stop());
            cameraStream = null;
        }

        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "stop" }));
        }

        currentDetections = [];     
        lastAuthorizedPlate = null; 

        clearCanvas();
        resetUI();
    }

    function processFrame(timestamp) {
       
        if (!isDetecting || !isCameraRunning) return;

        const now = Date.now();
        if (now - lastSendTime > SEND_INTERVAL) {
            sendFrame();
            lastSendTime = now;
        }

        drawDetections();
        requestAnimationFrame(processFrame);
    }

    function sendFrame() {
      
        if (!isCameraRunning) return;
        if (!ws || ws.readyState !== WebSocket.OPEN) return;

        const tempCanvas = document.createElement("canvas");
       
        const targetWidth = 640;
        const ratio = video.videoHeight / video.videoWidth;

        tempCanvas.width = targetWidth;
        tempCanvas.height = Math.round(targetWidth * ratio);
        const tempCtx = tempCanvas.getContext("2d");

      
        tempCtx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);


        const base64Image = tempCanvas
            .toDataURL("image/jpeg", 0.7)
            .split(",")[1];

        ws.send(JSON.stringify({
            type: "frame",
            image: base64Image
        }));
    }

    startBtn.addEventListener("click", async () => {
        readerMessage.style.display = "block";
        readerMessage.className = "message";
        readerMessage.textContent = "Camera started. Detecting...";

        await startCamera();

       
    });

    stopBtn.addEventListener("click", () => {
        clearInterval(detectInterval);
        detectInterval = null;

        stopCamera();

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        readerMessage.className = "message";
        readerMessage.textContent = "Detection stopped.";

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        currentDetections = [];

        
        resetUI();


        console.log("Camera stopped, UI cleared");
    });

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
