let isLoggedIn = false;
let ws = null; 
let cameraStream = null;
let isDetecting = false;
let lastSendTime = 0;
let video = null;
let canvas = null;
let ctx = null;

const SEND_INTERVAL = 2000; 
let currentDetections = [];

let detectionBuffer = [];
const BUFFER_SIZE = 10;
const AUTHORIZATION_THRESHOLD = 1;

const deniedPlates = [];


let isCameraRunning = false;
let lastAuthorizedPlate = null;
let foundAuthorizedPlate = false;

const COMPANY_ACCOUNT = {
    username: "CGS_Company",
    password: "123",
    companyName: "Staff-First Parking Services",
    companyId: "CGS-001"
};
let staffData = JSON.parse(localStorage.getItem("staffData")) || [];

// function code below utilizes AI to help connecting with websocket and process messages
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
    // partf of code below utilizes Ai to help overcome with duplicate processing and
    // UI redundancy updates. 
    if (!isCameraRunning) return;
    if (foundAuthorizedPlate) return;

    // part of code below utilizes AI to help overcome problem of error WebSocket parsing 
    // that happen due to non-JSON messages from the server. 
    let data;
    try {
        data = JSON.parse(event.data);
    } catch (e) {
        console.warn("Non-JSON message from server:", event.data);
        return;
    }

    // this part of code utilizes AI to help overcome problem 
    // from the previous code where system could not be used without page reloading. 
    if (data.type === "reset") {
        currentDetections = [];
        lastAuthorizedPlate = null;
        foundAuthorizedPlate = false;
        detectionBuffer = [];
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
        console.log("DETECTION DEBUG ");
        console.log("OCR Raw:", det.ocr_raw);
        console.log("OCR Cleaned:", det.ocr_cleaned);
        console.log("Final Match:", det.plate);
        console.log("Authorized:", det.authorized);
        console.log("Confidence:", det.confidence);

        const ocrRawEl = document.getElementById("ocr-raw");
        const ocrCleanedEl = document.getElementById("ocr-cleaned");
        const ocrMatchedEl = document.getElementById("ocr-matched");
        const ocrAuthEl = document.getElementById("ocr-authorized");
        const confEl = document.getElementById("result-confidence");

        if (ocrRawEl) {
            ocrRawEl.textContent = det.ocr_raw || "N/A";
            ocrRawEl.style.fontSize = "18px";
            ocrRawEl.style.fontWeight = "bold";
        }
        if (ocrCleanedEl) {
            ocrCleanedEl.textContent = det.ocr_cleaned || "N/A";
            ocrCleanedEl.style.fontSize = "18px";
            ocrCleanedEl.style.fontWeight = "bold";
        }
        if (ocrMatchedEl) {
            ocrMatchedEl.textContent = det.plate || "UNKNOWN";
            ocrMatchedEl.style.fontSize = "18px";
            ocrMatchedEl.style.fontWeight = "bold";
        }
        if (ocrAuthEl) {
            ocrAuthEl.textContent = det.authorized ? "YES" : "NO";
            ocrAuthEl.style.color = det.authorized ? "green" : "red";
            ocrAuthEl.style.fontSize = "18px";
            ocrAuthEl.style.fontWeight = "bold";
        }
        if (confEl) {
            confEl.textContent = `${(det.confidence * 100).toFixed(2)}%`;
        }

        // this buffer code utilization is using AI help to increase accuracy by 
        // reducing OCR fluctuations results per frame. 
        detectionBuffer.push({
            plate: det.plate,
            authorized: det.authorized,
            confidence: det.confidence,
            timestamp: Date.now()
        });


        if (detectionBuffer.length > BUFFER_SIZE) {
            detectionBuffer.shift();
        }


        const authorizedReads = detectionBuffer.filter(d => d.authorized);
        const authorizedCount = authorizedReads.length;


        const readerMessage = document.getElementById("reader-message");
        if (readerMessage && !foundAuthorizedPlate) {
            readerMessage.style.display = "block";
            readerMessage.className = "message";
            readerMessage.textContent = `Scanning... (${detectionBuffer.length}/${BUFFER_SIZE} reads, ${authorizedCount} authorized)`;
        }


        if (authorizedCount >= AUTHORIZATION_THRESHOLD && !foundAuthorizedPlate) {
            const firstAuthorized = authorizedReads[0];
            const bestPlate = firstAuthorized.plate;

            foundAuthorizedPlate = true;
            lastAuthorizedPlate = bestPlate;

            const staff = staffData.find(s => s.plate === bestPlate);
            if (staff) {
                const plateEl = document.getElementById("result-plate-text");
                const statusEl = document.getElementById("access-status-text");
                const resultEl = document.getElementById("result-status");

                if (plateEl) plateEl.textContent = staff.plate;
                if (statusEl) {
                    statusEl.textContent = "GRANTED";
                    statusEl.style.color = "green";
                }
                if (resultEl) resultEl.textContent = `${staff.name} (${staff.id})`;

                console.log(`ACCESS GRANTED: ${staff.name} after ${detectionBuffer.length} reads`);
                
                if (readerMessage) {
                    readerMessage.className = "message success";
                    readerMessage.textContent = `Access Granted: ${staff.name} (${staff.plate})`;
                }

                setTimeout(() => {
                    stopCamera();
                }, 2000);
            }
            return; 
        }

        if (detectionBuffer.length >= BUFFER_SIZE && authorizedCount === 0) {
            console.log(`ACCESS DENIED: 0 authorized reads in ${BUFFER_SIZE} attempts`);
            
            if (readerMessage) {
                readerMessage.className = "message error";
                readerMessage.textContent = `Access Denied - No authorized plate detected in ${BUFFER_SIZE} attempts`;
            }

            foundAuthorizedPlate = true;
            
            setTimeout(() => {
                stopCamera();
            }, 2000);
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {

    initWebSocket(); 

    const loginScreen = document.getElementById('login-screen');
    const dashboardScreen = document.getElementById('dashboard-screen');
    const loginForm = document.getElementById('login-form');
    const logoutBtn = document.getElementById('logout-btn');

    const navItems = document.querySelectorAll('.main-nav .nav-item');
    const views = document.querySelectorAll('.content .view');

    const registerForm = document.getElementById('register-form');
    const searchInput = document.getElementById('search-plate');

    registerForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const id = document.getElementById('reg-staff-id').value.trim();
        const name = document.getElementById('reg-staff-name').value.trim();
        const plate = document.getElementById('reg-license-plate').value
            .toUpperCase()
            .replace(/\s+/g, '');

        const messageEl = document.getElementById('register-message');

        //this part of code utilizes AI to help synchronize frontend and backend state. 
        const existing = staffData.find(s => s.plate === plate);

        if (existing) {
            messageEl.textContent = 'License plate already registered.';
            messageEl.className = 'message error';
            return;
        }

        staffData.push({
            id,
            name,
            plate,
            registeredDate: new Date().toISOString().split('T')[0]
        });
        
        localStorage.setItem("staffData", JSON.stringify(staffData));

        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: "add_trusted_plate",
                plate: plate
            }));
        }

        messageEl.textContent = 'Plate registered successfully.';
        messageEl.className = 'message success';

        registerForm.reset();
        renderStaffData(staffData);
        updateMetrics();

        console.log(`Plate ${plate} registered`);
    });


    video = document.getElementById("camera");
    canvas = document.getElementById("overlay");
    ctx = canvas.getContext("2d");

    function resetUI() {
        const plate = document.getElementById("result-plate-text");
        const conf = document.getElementById("result-confidence");
        const status = document.getElementById("access-status-text");
        const result = document.getElementById("result-status");
        const ocrRaw = document.getElementById("ocr-raw");
        const ocrCleaned = document.getElementById("ocr-cleaned");
        const ocrMatched = document.getElementById("ocr-matched");
        const ocrAuth = document.getElementById("ocr-authorized");

        if (!plate || !conf || !status || !result) return;

        plate.textContent = "N/A";
        conf.textContent = "N/A";
        status.textContent = "";
        result.textContent = "";
        if (ocrRaw) ocrRaw.textContent = "-";
        if (ocrCleaned) ocrCleaned.textContent = "-";
        if (ocrMatched) ocrMatched.textContent = "-";
        if (ocrAuth) ocrAuth.textContent = "-";
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
        // this code below utilizes AI to help overcome with problem of 
        // bringing previous state to new state each session. 
        foundAuthorizedPlate = false;
        lastAuthorizedPlate = null;
        currentDetections = [];
        detectionBuffer = []; 
        
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
        
        clearCanvas();
        resetUI();
        
        const readerMessage = document.getElementById("reader-message");
        if (readerMessage) {
            readerMessage.style.display = "block";
            readerMessage.className = "message";
            readerMessage.textContent = "Camera started. Collecting 10 reads...";
        }
        
        requestAnimationFrame(processFrame);
    }

    function stopCamera() {
        isDetecting = false;
        isCameraRunning = false; 
        foundAuthorizedPlate = false;
        detectionBuffer = []; 

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
        if (foundAuthorizedPlate) {
            drawDetections(); 
            return; 
        }
        if (!isDetecting || !isCameraRunning) return;

        const now = Date.now();
        // part of code below utilizes AI to help overcome with OCR backend overload problem 
        // 
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
        
        // this part of code utilizes AI to help overcome the 
        // large payload size and high latency problem that impacted to the real time processing.
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

        data.forEach((s, index) => {
            tbody.innerHTML += `
                <tr>
                    <td>${s.id}</td>
                    <td>${s.name}</td>
                    <td><strong>${s.plate}</strong></td>
                    <td>${s.registeredDate}</td>
                    <td>
                        <button class="btn secondary" onclick="deletePlate(${index})">
                            Delete
                        </button>
                    </td>
                </tr>
            `;
        });
    }

    
    function deletePlate(index) {
        const plate = staffData[index].plate;

        const confirmDelete = confirm(
            `Plate deletion confirmation : by clicking yes, you are deleting the plate ${plate}?`
        );
        if (!confirmDelete) return;

        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: "remove_trusted_plate",
                plate: plate
            }));
        }

        staffData.splice(index, 1);

        localStorage.setItem("staffData", JSON.stringify(staffData));
        renderStaffData(staffData);
        updateMetrics();

        console.log(`Plate ${plate} deleted`);
    }


    window.deletePlate = deletePlate;



    function renderUserProfile() {
        document.getElementById('user-profile-summary').innerHTML = `
            <h4>${COMPANY_ACCOUNT.companyName}</h4>
            <p>ID: ${COMPANY_ACCOUNT.companyId}</p>
            <p>Total Plates: <strong>${staffData.length}</strong></p>`;
    }

    function updateMetrics() {
        document.getElementById('total-plates-count').textContent = staffData.length;
    }

    renderStaffData(staffData);
    updateMetrics();

});
