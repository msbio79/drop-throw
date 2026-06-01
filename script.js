// Physics Simulation: Free Fall vs. Horizontal Projection
// Designed for High School Physics Classrooms with Premium UI and Touch zoom/pan

// DOM Elements
const canvas = document.getElementById('simCanvas');
const ctx = canvas.getContext('2d');

// Control Inputs
const inputHeight = document.getElementById('inputHeight');
const inputVx = document.getElementById('inputVx');
const inputGravity = document.getElementById('inputGravity');
const inputTimeScale = document.getElementById('inputTimeScale');
const inputStrobe = document.getElementById('inputStrobe');

// Value Displays
const valHeight = document.getElementById('valHeight');
const valVx = document.getElementById('valVx');
const valGravity = document.getElementById('valGravity');
const valTimeScale = document.getElementById('valTimeScale');
const valStrobe = document.getElementById('valStrobe');

// Toggles
const chkGrid = document.getElementById('chkGrid');
const chkSyncLine = document.getElementById('chkSyncLine');
const chkHorizInterval = document.getElementById('chkHorizInterval');
const chkVectors = document.getElementById('chkVectors');
const chkPath = document.getElementById('chkPath');
const chkStats = document.getElementById('chkStats');

// Action Buttons
const btnPlayPause = document.getElementById('btnPlayPause');
const lblPlayPause = document.getElementById('lblPlayPause');
const btnStep = document.getElementById('btnStep');
const btnPrevStep = document.getElementById('btnPrevStep');
const btnReset = document.getElementById('btnReset');

// Floating Controls & Dashboard
const dashboardOverlay = document.getElementById('dashboardOverlay');
const dashTime = document.getElementById('dashTime');
const dashFreeY = document.getElementById('dashFreeY');
const dashFreeVy = document.getElementById('dashFreeVy');
const dashProjX = document.getElementById('dashProjX');
const dashProjY = document.getElementById('dashProjY');
const dashProjVx = document.getElementById('dashProjVx');
const dashProjVy = document.getElementById('dashProjVy');

// Floating Toolbar & Modals
const btnZoomIn = document.getElementById('btnZoomIn');
const btnZoomOut = document.getElementById('btnZoomOut');
const btnZoomFit = document.getElementById('btnZoomFit');
const btnHelp = document.getElementById('btnHelp');
const helpModal = document.getElementById('helpModal');
const btnHelpClose = document.getElementById('btnHelpClose');
const btnHelpConfirm = document.getElementById('btnHelpConfirm');
const btnThemeToggle = document.getElementById('btnThemeToggle');
const btnSidebarToggle = document.getElementById('btnSidebarToggle');
const sidebar = document.querySelector('.sidebar');

// Simulation State Constants & Variables
const ORIGIN_X_METERS = 15; // Platform horizontal start position in physics space
let height = parseFloat(inputHeight.value); // m
let v0 = parseFloat(inputVx.value);         // m/s
let g = parseFloat(inputGravity.value);     // m/s^2
let timeScale = parseFloat(inputTimeScale.value);
let strobeInterval = parseFloat(inputStrobe.value); // seconds

let simTime = 0; // Elapsed simulation time (seconds)
let isPlaying = false;
let lastTimestamp = 0;

// Path records and Strobe (afterimage) snapshots
let freeFallPath = [];
let projectedPath = [];
let strobes = []; // Array of { time, freeFall: {x,y,vx,vy}, projected: {x,y,vx,vy} }
let lastStrobeTime = 0;

// Ball size and styling configurations (dynamically scaled with camera zoom for physical feel)
function getBallRadius() {
    return Math.max(4, 1.75 * camera.zoom);
}

// Camera Viewport Configuration (Zoom & Pan)
const camera = {
    x: 0,       // Horizontal offset in screen pixels
    y: 0,       // Vertical offset in screen pixels
    zoom: 8.0,  // Scale factor: pixels per physical meter
    minZoom: 1.5,
    maxZoom: 50.0
};

// Interaction variables (Dragging/Panning & Touch Multi-pinch)
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let touchStartDist = 0;
let touchStartZoom = 1;
let touchStartCenter = { x: 0, y: 0 };
let activeTouches = 0;
let selectedStrobeTime = null; // Currently selected strobe time for highlighting
let pointerStartX = 0;
let pointerStartY = 0;

// High-DPI screen adjustments
function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
}

// ----------------------------------------------------
// Physics Equations & Calculations
// ----------------------------------------------------

// Calculate time it takes to hit the ground: t_hit = sqrt(2h/g)
function getGroundHitTime() {
    if (g === 0) {
        return Infinity;
    }
    return Math.sqrt((2 * height) / g);
}

// Get state of free fall ball at a specific time t
function getFreeFallState(t) {
    const tHit = getGroundHitTime();
    const activeTime = Math.min(t, tHit);
    
    const x = ORIGIN_X_METERS;
    const y = height - 0.5 * g * activeTime * activeTime;
    
    return {
        x: x,
        y: Math.max(0, y), // Clamp to ground
        vx: 0,
        vy: -g * activeTime,
        isLanded: t >= tHit
    };
}

// Get state of projected ball at a specific time t
function getProjectedState(t) {
    const tHit = getGroundHitTime();
    const activeTime = Math.min(t, tHit);
    
    const x = ORIGIN_X_METERS + v0 * activeTime;
    const y = height - 0.5 * g * activeTime * activeTime;
    
    return {
        x: x,
        y: Math.max(0, y), // Clamp to ground
        vx: v0,
        vy: -g * activeTime,
        isLanded: t >= tHit
    };
}

// ----------------------------------------------------
// Coordinate Conversions
// ----------------------------------------------------

// Convert Physics coordinates (meters) to Canvas Screen coordinates (pixels)
function toScreen(physX, physY) {
    const screenX = camera.x + physX * camera.zoom;
    // Note: Canvas Y coordinates increase downwards, whereas Physics Y increases upwards
    const screenY = camera.y - physY * camera.zoom;
    return { x: screenX, y: screenY };
}

// Convert Canvas Screen coordinates (pixels) to Physics coordinates (meters)
function toPhysics(screenX, screenY) {
    const physX = (screenX - camera.x) / camera.zoom;
    const physY = (camera.y - screenY) / camera.zoom;
    return { x: physX, y: physY };
}

// Helper to get dynamically scaled font based on current camera zoom level
function getScaledFont(baseSize, fontName = 'Outfit', isBold = false) {
    // Damped and clamped zoom scale factor to prevent giant font sizes (e.g. max 1.6x base size)
    const fontScale = Math.min(1.6, Math.max(0.8, camera.zoom / 10.0));
    const computedSize = Math.max(9, Math.round(baseSize * fontScale));
    return `${isBold ? 'bold ' : ''}${computedSize}px ${fontName}`;
}

// ----------------------------------------------------
// Viewport Auto-fit (Zoom Fit)
// ----------------------------------------------------

function zoomToFit() {
    let tHit = getGroundHitTime();
    if (!isFinite(tHit)) {
        tHit = 2.0; // Default finite time for framing in zero gravity
    }
    const maxX = ORIGIN_X_METERS + v0 * tHit;
    const maxY = height;
    
    // Bounds of physical area to frame
    const physMinX = ORIGIN_X_METERS - 5; // 10m (closer to the left edge)
    const physMaxX = maxX + 8;
    const physMinY = -10;
    const physMaxY = maxY + 15;
    
    const physWidth = physMaxX - physMinX;
    const physHeight = physMaxY - physMinY;
    
    // Available screen space
    const screenWidth = canvas.clientWidth;
    const screenHeight = canvas.clientHeight;
    
    // Calculate appropriate zoom to fit inside canvas
    const zoomX = screenWidth / physWidth;
    const zoomY = screenHeight / physHeight;
    camera.zoom = Math.min(zoomX, zoomY);
    
    // Clamp zoom to safety boundaries
    camera.zoom = Math.max(camera.minZoom, Math.min(camera.zoom, camera.maxZoom));
    
    // Center the viewport horizontally and vertically
    camera.x = -physMinX * camera.zoom + (screenWidth - physWidth * camera.zoom) / 2;
    camera.y = physMaxY * camera.zoom - (screenHeight - physHeight * camera.zoom) / 2;
}

// Zoom centered on a specific screen point (for mouse wheel and touch pinch)
function zoomAtPoint(factor, screenX, screenY) {
    const newZoom = Math.max(camera.minZoom, Math.min(camera.zoom * factor, camera.maxZoom));
    const actualFactor = newZoom / camera.zoom;
    
    camera.x = screenX * (1 - actualFactor) + camera.x * actualFactor;
    camera.y = screenY * (1 - actualFactor) + camera.y * actualFactor;
    camera.zoom = newZoom;
}

// ----------------------------------------------------
// Drawing Utility Helpers
// ----------------------------------------------------

// Draws a sleek arrow indicating velocity vectors
function drawArrow(ctx, fromX, fromY, toX, toY, color, width = 3, arrowSize = 8) {
    const dx = toX - fromX;
    const dy = toY - fromY;
    const angle = Math.atan2(dy, dx);
    const length = Math.sqrt(dx * dx + dy * dy);
    
    if (length < 2) return; // Don't draw tiny arrows
    
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    
    // Draw stem
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();
    
    // Draw arrowhead
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - arrowSize * Math.cos(angle - Math.PI / 6), toY - arrowSize * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(toX - arrowSize * Math.cos(angle + Math.PI / 6), toY - arrowSize * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
}

// ----------------------------------------------------
// Core Canvas Render Loop
// ----------------------------------------------------

function draw() {
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    
    const screenWidth = canvas.clientWidth;
    const screenHeight = canvas.clientHeight;
    
    // Evaluate dynamically scaled ball radius for all canvas drawings
    const BALL_RADIUS_PX = getBallRadius();
    
    const currentFreeFall = getFreeFallState(simTime);
    const currentProjected = getProjectedState(simTime);
    
    // Dynamic color choices based on active Light Mode theme
    const isLightMode = document.body.classList.contains('light-mode');
    
    // Theme colors
    const colorGridLine = isLightMode ? 'rgba(15, 23, 42, 0.05)' : 'rgba(255, 255, 255, 0.03)';
    const colorGridText = isLightMode ? 'rgba(15, 23, 42, 0.4)' : 'rgba(255, 255, 255, 0.25)';
    const colorTowerPillar = isLightMode ? 'rgba(15, 23, 42, 0.08)' : 'rgba(255, 255, 255, 0.08)';
    const colorTowerBg = isLightMode ? 'rgba(15, 23, 42, 0.02)' : 'rgba(255, 255, 255, 0.02)';
    const colorTowerTruss = isLightMode ? 'rgba(15, 23, 42, 0.04)' : 'rgba(255, 255, 255, 0.04)';
    
    const colorCyan = isLightMode ? '#0284c7' : '#00f0ff';
    const colorOrange = isLightMode ? '#ea580c' : '#ff9f00';
    
    const colorHeightArrow = isLightMode ? 'rgba(2, 132, 199, 0.4)' : 'rgba(0, 240, 255, 0.3)';
    const colorHeightText = isLightMode ? 'rgba(2, 132, 199, 0.8)' : 'rgba(0, 240, 255, 0.6)';
    
    const colorFreeTrail = isLightMode ? 'rgba(2, 132, 199, 0.45)' : 'rgba(0, 240, 255, 0.35)';
    const colorProjTrail = isLightMode ? 'rgba(234, 88, 12, 0.5)' : 'rgba(255, 159, 0, 0.4)';
    
    const colorSyncLine = isLightMode ? 'rgba(15, 23, 42, 0.35)' : 'rgba(255, 255, 255, 0.25)';
    const colorSyncText = isLightMode ? 'rgba(15, 23, 42, 0.7)' : 'rgba(255, 255, 255, 0.85)';
    const colorActiveSyncLine = isLightMode ? 'rgba(15, 23, 42, 0.65)' : 'rgba(255, 255, 255, 0.85)';
    const colorStrobeText = isLightMode ? 'rgba(15, 23, 42, 0.55)' : 'rgba(255, 255, 255, 0.5)';
    
    const colorBallText = isLightMode ? '#0f172a' : '#ffffff';
    const colorBallSubText = isLightMode ? 'rgba(15, 23, 42, 0.6)' : 'rgba(255, 255, 255, 0.6)';
    
    const shadowColorCyan = isLightMode ? 'rgba(2, 132, 199, 0.4)' : 'rgba(0, 240, 255, 0.7)';
    const shadowColorOrange = isLightMode ? 'rgba(234, 88, 12, 0.4)' : 'rgba(255, 159, 0, 0.7)';
    const shadowBlurRadius = isLightMode ? 4 : 15;
    
    // Vector label colors
    const colorVyText = isLightMode ? '#dc2626' : '#f87171';
    const colorVxText = isLightMode ? '#059669' : '#34d399';
    const colorVResultText = isLightMode ? '#db2777' : '#f472b6';

    // 1. Draw Grid (faint graph paper effect)
    if (chkGrid.checked) {
        ctx.strokeStyle = colorGridLine;
        ctx.lineWidth = 1;
        
        // Determine grid interval dynamically so that grid lines are spaced at least 95 pixels apart on screen
        const candidateSteps = [1, 2, 5, 10, 20, 50, 100, 200, 500];
        let step = 10;
        for (let s of candidateSteps) {
            if (s * camera.zoom >= 95) {
                step = s;
                break;
            }
        }
        
        // Find visible physics boundaries
        const topLeftPhys = toPhysics(0, 0);
        const bottomRightPhys = toPhysics(screenWidth, screenHeight);
        
        const startX = Math.floor(topLeftPhys.x / step) * step;
        const endX = Math.ceil(bottomRightPhys.x / step) * step;
        const startY = Math.floor(bottomRightPhys.y / step) * step;
        const endY = Math.ceil(topLeftPhys.y / step) * step;
        
        ctx.save();
        ctx.fillStyle = colorGridText;
        ctx.font = getScaledFont(10, 'Inter', false);
        
        // Draw vertical grid lines and X-axis labels
        for (let px = startX; px <= endX; px += step) {
            const screenPt = toScreen(px, 0);
            ctx.beginPath();
            ctx.moveTo(screenPt.x, 0);
            ctx.lineTo(screenPt.x, screenHeight);
            ctx.stroke();
            
            // Label along the bottom ground (or screen bottom if ground is off-screen)
            let labelY = toScreen(0, 0).y;
            if (labelY < 8) labelY = 8;
            if (labelY > screenHeight - 60) labelY = screenHeight - 60; // Clamped higher to leave room for the strobe ruler below
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(`${px}m`, screenPt.x, labelY + 8); // Shifted closer to the ground line (offset +8px)
        }
        
        // Draw horizontal grid lines and Y-axis labels
        for (let py = startY; py <= endY; py += step) {
            const screenPt = toScreen(0, py);
            ctx.beginPath();
            ctx.moveTo(0, screenPt.y);
            ctx.lineTo(screenWidth, screenPt.y);
            ctx.stroke();
            
            // Label along the left axis (placed to the left of the axis line, right-aligned)
            let labelX = toScreen(0, 0).x;
            if (labelX < 35) labelX = 35; // Leave space for Y-axis labels on the left edge
            if (labelX > screenWidth - 8) labelX = screenWidth - 8;
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.fillText(`${py}m`, labelX - 8, screenPt.y);
        }
        ctx.restore();
    }
    
    // 2. Draw Ground
    const groundScreen = toScreen(0, 0);
    ctx.strokeStyle = isLightMode ? 'rgba(16, 185, 129, 0.6)' : 'rgba(16, 185, 129, 0.4)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, groundScreen.y);
    ctx.lineTo(screenWidth, groundScreen.y);
    ctx.stroke();
    
    // Ground glowing stripe
    ctx.strokeStyle = isLightMode ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.1)';
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(0, groundScreen.y + 4);
    ctx.lineTo(screenWidth, groundScreen.y + 4);
    ctx.stroke();
    
    // 3. Draw Platform / Launch Tower
    const platformBase = toScreen(ORIGIN_X_METERS, 0);
    const platformTop = toScreen(ORIGIN_X_METERS, height);
    
    // Tower pillar
    ctx.strokeStyle = colorTowerPillar;
    ctx.fillStyle = colorTowerBg;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.rect(platformBase.x - 20, platformTop.y, 40, platformBase.y - platformTop.y);
    ctx.fill();
    ctx.stroke();
    
    // Support trusses inside tower (makes it look like a cool construction crane/physics rig)
    ctx.strokeStyle = colorTowerTruss;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    let trussStep = 10; // meters
    for (let hTruss = 0; hTruss < height; hTruss += trussStep) {
        const topY = toScreen(ORIGIN_X_METERS, Math.min(hTruss + trussStep, height)).y;
        const botY = toScreen(ORIGIN_X_METERS, hTruss).y;
        
        ctx.moveTo(platformBase.x - 20, botY);
        ctx.lineTo(platformBase.x + 20, topY);
        ctx.moveTo(platformBase.x + 20, botY);
        ctx.lineTo(platformBase.x - 20, topY);
    }
    ctx.stroke();
    
    // Launch platform cap
    ctx.fillStyle = isLightMode ? 'rgba(99, 102, 241, 0.4)' : 'rgba(99, 102, 241, 0.3)';
    ctx.strokeStyle = 'rgba(99, 102, 241, 0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(platformTop.x - 30, platformTop.y - 4, 60, 8, 4);
    ctx.fill();
    ctx.stroke();
    
    // Height Dimension arrow
    ctx.strokeStyle = colorHeightArrow;
    ctx.fillStyle = colorHeightArrow;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const arrowX = platformTop.x - 45;
    ctx.moveTo(arrowX, platformTop.y);
    ctx.lineTo(arrowX, platformBase.y);
    ctx.stroke();
    
    // Arrowheads for height indicator
    drawArrow(ctx, arrowX, platformTop.y + 10, arrowX, platformTop.y, colorHeightArrow, 1.5, 6);
    drawArrow(ctx, arrowX, platformBase.y - 10, arrowX, platformBase.y, colorHeightArrow, 1.5, 6);
    
    // Height text
    const heightFontSize = Math.max(9, Math.round(12 * (camera.zoom / 10.0)));
    ctx.fillStyle = colorHeightText;
    ctx.font = getScaledFont(12, 'Outfit', true);
    ctx.textAlign = 'right';
    ctx.fillText(`${height}m`, arrowX - 8, (platformTop.y + platformBase.y) / 2 + Math.round(heightFontSize / 3));
    
    // 4. Draw Trails/Paths (Continuous trace lines)
    if (chkPath.checked) {
        // Free fall (vertical line)
        if (freeFallPath.length > 1) {
            ctx.strokeStyle = colorFreeTrail;
            ctx.lineWidth = 3.5;
            ctx.setLineDash([4, 4]); // Clearer trace
            ctx.beginPath();
            const startPt = toScreen(freeFallPath[0].x, freeFallPath[0].y);
            ctx.moveTo(startPt.x, startPt.y);
            for (let i = 1; i < freeFallPath.length; i++) {
                const pt = toScreen(freeFallPath[i].x, freeFallPath[i].y);
                ctx.lineTo(pt.x, pt.y);
            }
            ctx.stroke();
            ctx.setLineDash([]);
        }
        
        // Projected fall (parabolic curve)
        if (projectedPath.length > 1) {
            ctx.strokeStyle = colorProjTrail;
            ctx.lineWidth = 3.5;
            ctx.beginPath();
            const startPt = toScreen(projectedPath[0].x, projectedPath[0].y);
            ctx.moveTo(startPt.x, startPt.y);
            for (let i = 1; i < projectedPath.length; i++) {
                const pt = toScreen(projectedPath[i].x, projectedPath[i].y);
                ctx.lineTo(pt.x, pt.y);
            }
            ctx.stroke();
        }
    }
    
    // 5. Draw Strobes (Afterimages / Translucent historical snapshots)
    strobes.forEach((strobe, idx) => {
        const ffPt = toScreen(strobe.freeFall.x, strobe.freeFall.y);
        const projPt = toScreen(strobe.projected.x, strobe.projected.y);
        
        // Calculate fade-in factor or constant opacity for educational clarity
        // Faded snapshot representing equal time increments
        const opacity = 0.25;
        
        // 5a. Strobe Connectors (horizontal alignment line)
        if (chkSyncLine.checked) {
            ctx.strokeStyle = colorSyncLine;
            ctx.lineWidth = 1.5;
            ctx.setLineDash([5, 4]);
            ctx.beginPath();
            ctx.moveTo(ffPt.x, ffPt.y);
            ctx.lineTo(projPt.x, projPt.y);
            ctx.stroke();
            ctx.setLineDash([]);
        }
        
        // 5b. Strobe spheres
        // Free Fall strobe
        // Draw strobe colors based on dynamic theme color values
        ctx.fillStyle = isLightMode ? `rgba(2, 132, 199, ${opacity})` : `rgba(0, 240, 255, ${opacity})`;
        ctx.beginPath();
        ctx.arc(ffPt.x, ffPt.y, BALL_RADIUS_PX, 0, 2 * Math.PI);
        ctx.fill();
        
        // Projected strobe
        ctx.fillStyle = isLightMode ? `rgba(234, 88, 12, ${opacity})` : `rgba(255, 159, 0, ${opacity})`;
        ctx.beginPath();
        ctx.arc(projPt.x, projPt.y, BALL_RADIUS_PX, 0, 2 * Math.PI);
        ctx.fill();
        
        // Time labels on strobes to aid explanations (placed above the ball to prevent overlap with ground rulers)
        ctx.save();
        ctx.fillStyle = colorStrobeText;
        ctx.font = getScaledFont(10, 'Outfit', false);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`${strobe.time.toFixed(1)}s`, projPt.x, projPt.y - BALL_RADIUS_PX - 4);
        ctx.restore();
    });
    
    // 5c. Draw Horizontal Equal Spacing indicators for projected motion
    if (chkHorizInterval && chkHorizInterval.checked && v0 > 0) {
        ctx.save();
        
        // Setup colors based on theme
        const colorIntervalLine = isLightMode ? 'rgba(234, 88, 12, 0.5)' : 'rgba(255, 159, 0, 0.4)';
        const colorIntervalText = isLightMode ? '#ea580c' : '#ff9f00';
        const colorDottedLine = isLightMode ? 'rgba(15, 23, 42, 0.45)' : 'rgba(255, 255, 255, 0.35)';
        
        ctx.strokeStyle = colorDottedLine;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        
        // Draw vertical projection line for the start position
        const startGroundPt = toScreen(ORIGIN_X_METERS, 0);
        const startTopPt = toScreen(ORIGIN_X_METERS, height);
        ctx.beginPath();
        ctx.moveTo(startTopPt.x, startTopPt.y);
        ctx.lineTo(startGroundPt.x, startGroundPt.y);
        ctx.stroke();
        
        // Gather all horizontal positions to segment: start, all strobes
        const xPositions = [ORIGIN_X_METERS];
        const strobePoints = [];
        
        strobes.forEach(strobe => {
            xPositions.push(strobe.projected.x);
            strobePoints.push({ x: strobe.projected.x, y: strobe.projected.y });
        });
        
        // Draw vertical lines for each strobe and connect them on the ground
        strobePoints.forEach(pt => {
            const screenTop = toScreen(pt.x, pt.y);
            const screenBot = toScreen(pt.x, 0);
            ctx.beginPath();
            ctx.moveTo(screenTop.x, screenTop.y);
            ctx.lineTo(screenBot.x, screenBot.y);
            ctx.stroke();
        });
        
        ctx.setLineDash([]); // Reset line dash for arrows
        
        // Draw brackets/arrows at a fixed pixel offset below the ground line (e.g., groundY + 54 pixels)
        // Clamped lower and separate from the X-axis labels to completely eliminate vertical overlap
        const groundY = toScreen(0, 0).y;
        let strobeRulerY = groundY + 54;
        if (strobeRulerY < 30) strobeRulerY = 30;
        if (strobeRulerY > screenHeight - 10) strobeRulerY = screenHeight - 10;
        
        // Determine stride dynamically to prevent arrows and text from overlapping
        let stride = 1;
        if (xPositions.length > 1) {
            const d = (xPositions[1] - xPositions[0]) * camera.zoom;
            if (d > 0 && d < 75) { // Ensure at least 75 pixels space for each text and arrow
                stride = Math.ceil(75 / d);
            }
        }
        
        for (let i = stride; i < xPositions.length; i += stride) {
            const xPrev = xPositions[i - stride];
            const xCurr = xPositions[i];
            
            const xPrevScreen = toScreen(xPrev, 0).x;
            const xCurrScreen = toScreen(xCurr, 0).x;
            
            // Draw double-headed arrow along strobeRulerY
            ctx.strokeStyle = colorIntervalLine;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(xPrevScreen + 4, strobeRulerY);
            ctx.lineTo(xCurrScreen - 4, strobeRulerY);
            ctx.stroke();
            
            // Draw arrow heads
            drawArrow(ctx, xPrevScreen + 8, strobeRulerY, xPrevScreen, strobeRulerY, colorIntervalLine, 1.5, 5);
            drawArrow(ctx, xCurrScreen - 8, strobeRulerY, xCurrScreen, strobeRulerY, colorIntervalLine, 1.5, 5);
            
            // Draw label slightly above the ruler line
            const labelText = `Δx = ${(xCurr - xPrev).toFixed(1)}m`;
            ctx.fillStyle = colorIntervalText;
            ctx.font = getScaledFont(10, 'Outfit', true);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(labelText, (xPrevScreen + xCurrScreen) / 2, strobeRulerY - 4);
        }
        
        ctx.restore();
    }
    
    // 6. Draw Horizontal Sync Dotted Line for current positions
    if (chkSyncLine.checked) {
        const ffPt = toScreen(currentFreeFall.x, currentFreeFall.y);
        const projPt = toScreen(currentProjected.x, currentProjected.y);
        
        ctx.strokeStyle = colorActiveSyncLine;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.moveTo(ffPt.x, ffPt.y);
        ctx.lineTo(projPt.x, projPt.y);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Equal height text banner inside canvas
        const syncFontSize = Math.max(9, Math.round(11 * (camera.zoom / 10.0)));
        ctx.fillStyle = colorSyncText;
        ctx.font = getScaledFont(11, 'Inter', false);
        ctx.textAlign = 'center';
        ctx.fillText("동일한 수직 높이 (y)", (ffPt.x + projPt.x) / 2, ffPt.y - Math.round(syncFontSize * 0.7));
    }
    
    // 7. Draw Velocity Vectors (Current frame)
    if (chkVectors.checked) {
        const vectorScale = 4.0; // Scaler to translate physics m/s velocity to screen coordinates pixels
        
        const ffPt = toScreen(currentFreeFall.x, currentFreeFall.y);
        const projPt = toScreen(currentProjected.x, currentProjected.y);
        
        // 7a. Free Fall vectors (Only has vertical Vy)
        if (Math.abs(currentFreeFall.vy) > 0.1) {
            const vyLen = currentFreeFall.vy * vectorScale * camera.zoom / 10;
            drawArrow(ctx, ffPt.x, ffPt.y, ffPt.x, ffPt.y - vyLen, '#ef4444', 3, 8); // Downward red arrow for Vy
            
            // Label
            const vectorFontSize = Math.max(9, Math.round(11 * (camera.zoom / 10.0)));
            ctx.fillStyle = colorVyText;
            ctx.font = getScaledFont(11, 'Outfit', true);
            ctx.textAlign = 'right';
            ctx.fillText(`vy`, ffPt.x - (BALL_RADIUS_PX + 4), ffPt.y - vyLen/2 + Math.round(vectorFontSize / 3));
        }
        
        // 7b. Projected vectors
        // Horizontal Vx (Constant green arrow pointing right)
        if (v0 > 0) {
            const vxLen = currentProjected.vx * vectorScale * camera.zoom / 10;
            drawArrow(ctx, projPt.x, projPt.y, projPt.x + vxLen, projPt.y, '#10b981', 3, 8);
            
            const vectorFontSize = Math.max(9, Math.round(11 * (camera.zoom / 10.0)));
            ctx.fillStyle = colorVxText;
            ctx.font = getScaledFont(11, 'Outfit', true);
            ctx.textAlign = 'center';
            ctx.fillText(`vx`, projPt.x + vxLen/2, projPt.y - (BALL_RADIUS_PX + Math.round(vectorFontSize * 0.3)));
        }
        
        // Vertical Vy (Increasing downward red arrow)
        if (Math.abs(currentProjected.vy) > 0.1) {
            const vyLen = currentProjected.vy * vectorScale * camera.zoom / 10;
            drawArrow(ctx, projPt.x, projPt.y, projPt.x, projPt.y - vyLen, '#ef4444', 3, 8);
            
            const vectorFontSize = Math.max(9, Math.round(11 * (camera.zoom / 10.0)));
            ctx.fillStyle = colorVyText;
            ctx.font = getScaledFont(11, 'Outfit', true);
            ctx.textAlign = 'left';
            ctx.fillText(`vy`, projPt.x + (BALL_RADIUS_PX + 4), projPt.y - vyLen/2 + Math.round(vectorFontSize / 3));
        }
        
        // Resultant vector V (Diagonal pink arrow)
        if (v0 > 0 && Math.abs(currentProjected.vy) > 0.1) {
            const vxLen = currentProjected.vx * vectorScale * camera.zoom / 10;
            const vyLen = currentProjected.vy * vectorScale * camera.zoom / 10;
            drawArrow(ctx, projPt.x, projPt.y, projPt.x + vxLen, projPt.y - vyLen, '#ec4899', 3.5, 9);
            
            const vectorFontSize = Math.max(9, Math.round(11 * (camera.zoom / 10.0)));
            ctx.fillStyle = colorVResultText;
            ctx.font = getScaledFont(11, 'Outfit', true);
            ctx.textAlign = 'left';
            ctx.fillText(`v`, projPt.x + vxLen + 6, projPt.y - vyLen + Math.round(vectorFontSize / 3));
        }
    }
    
    // 8. Draw Main Active Spheres (Glowing premium appearance)
    const ffPt = toScreen(currentFreeFall.x, currentFreeFall.y);
    const projPt = toScreen(currentProjected.x, currentProjected.y);
    
    // Free fall sphere (Cyan / Blue)
    ctx.shadowColor = shadowColorCyan;
    ctx.shadowBlur = shadowBlurRadius;
    ctx.fillStyle = colorCyan;
    ctx.beginPath();
    ctx.arc(ffPt.x, ffPt.y, BALL_RADIUS_PX, 0, 2 * Math.PI);
    ctx.fill();
    
    // Add inner highlight to sphere for premium 3D volume effect
    ctx.shadowBlur = 0; // reset shadow
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.beginPath();
    const highlightOffset = Math.max(1.5, BALL_RADIUS_PX * 0.3);
    const highlightRadius = Math.max(1.5, BALL_RADIUS_PX * 0.3);
    ctx.arc(ffPt.x - highlightOffset, ffPt.y - highlightOffset, highlightRadius, 0, 2 * Math.PI);
    ctx.fill();
    
    // Projected sphere (Orange / Dark Orange)
    ctx.shadowColor = shadowColorOrange;
    ctx.shadowBlur = shadowBlurRadius;
    ctx.fillStyle = colorOrange;
    ctx.beginPath();
    ctx.arc(projPt.x, projPt.y, BALL_RADIUS_PX, 0, 2 * Math.PI);
    ctx.fill();
    
    // Inner highlight
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.beginPath();
    ctx.arc(projPt.x - highlightOffset, projPt.y - highlightOffset, highlightRadius, 0, 2 * Math.PI);
    ctx.fill();
    
    // 9. Display real-time telemetry labels near balls if dashboard checked
    if (chkStats.checked) {
        const titleFont = getScaledFont(11, 'Inter', true);
        const subFont = getScaledFont(10, 'Inter', false);
        const titleSize = Math.max(9, Math.round(11 * (camera.zoom / 10.0)));
        const subSize = Math.max(9, Math.round(10 * (camera.zoom / 10.0)));
        
        // Free Fall label
        ctx.fillStyle = colorBallText;
        ctx.font = titleFont;
        ctx.textAlign = 'left';
        ctx.fillText(`자유낙하`, ffPt.x + BALL_RADIUS_PX + 8, ffPt.y - titleSize * 0.3);
        
        ctx.fillStyle = colorBallSubText;
        ctx.font = subFont;
        ctx.fillText(`y = ${currentFreeFall.y.toFixed(1)}m`, ffPt.x + BALL_RADIUS_PX + 8, ffPt.y + titleSize * 0.8);
        ctx.fillText(`vy = ${Math.abs(currentFreeFall.vy).toFixed(1)}m/s`, ffPt.x + BALL_RADIUS_PX + 8, ffPt.y + titleSize * 0.8 + subSize + 2);
        
        // Projected label
        ctx.fillStyle = colorBallText;
        ctx.font = titleFont;
        ctx.fillText(`수평투사`, projPt.x + BALL_RADIUS_PX + 8, projPt.y - titleSize * 0.3);
        
        ctx.fillStyle = colorBallSubText;
        ctx.font = subFont;
        ctx.fillText(`x = ${(currentProjected.x - ORIGIN_X_METERS).toFixed(1)}m`, projPt.x + BALL_RADIUS_PX + 8, projPt.y + titleSize * 0.8);
        ctx.fillText(`y = ${currentProjected.y.toFixed(1)}m`, projPt.x + BALL_RADIUS_PX + 8, projPt.y + titleSize * 0.8 + subSize + 2);
    }
    
    // 10. Draw Selected Strobe Highlighting and Educational HUD Card
    if (selectedStrobeTime !== null) {
        const selectedStrobe = strobes.find(s => Math.abs(s.time - selectedStrobeTime) < 0.0001);
        if (selectedStrobe) {
            const strobeFFPt = toScreen(selectedStrobe.freeFall.x, selectedStrobe.freeFall.y);
            const strobeProjPt = toScreen(selectedStrobe.projected.x, selectedStrobe.projected.y);
            
            ctx.save();
            
            // 1. Draw glowing outer rings for selected balls
            // Free Fall selected ball outer ring (Cyan)
            ctx.shadowColor = shadowColorCyan;
            ctx.shadowBlur = 12;
            ctx.strokeStyle = colorCyan;
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(strobeFFPt.x, strobeFFPt.y, BALL_RADIUS_PX + 5, 0, 2 * Math.PI);
            ctx.stroke();
            
            // Projected selected ball outer ring (Orange)
            ctx.shadowColor = shadowColorOrange;
            ctx.shadowBlur = 12;
            ctx.strokeStyle = colorOrange;
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(strobeProjPt.x, strobeProjPt.y, BALL_RADIUS_PX + 5, 0, 2 * Math.PI);
            ctx.stroke();
            
            ctx.shadowBlur = 0; // Reset shadow blur
            
            // 2. Draw thick, glowing horizontal connection line with linear gradient
            const grad = ctx.createLinearGradient(strobeFFPt.x, strobeFFPt.y, strobeProjPt.x, strobeProjPt.y);
            grad.addColorStop(0, colorCyan);
            grad.addColorStop(1, colorOrange);
            ctx.strokeStyle = grad;
            ctx.lineWidth = 3.5;
            
            // Add subtle glow to the connection line
            ctx.shadowColor = isLightMode ? 'rgba(99, 102, 241, 0.3)' : 'rgba(99, 102, 241, 0.6)';
            ctx.shadowBlur = 8;
            
            ctx.beginPath();
            ctx.moveTo(strobeFFPt.x, strobeFFPt.y);
            ctx.lineTo(strobeProjPt.x, strobeProjPt.y);
            ctx.stroke();
            
            ctx.shadowBlur = 0; // Reset
            
            // 3. Draw midpoint floating educational HUD Card
            const midX = (strobeFFPt.x + strobeProjPt.x) / 2;
            const midY = strobeFFPt.y;
            
            const cardW = 210;
            const cardH = 46;
            const cardX = midX - cardW / 2;
            const cardY = midY - cardH / 2;
            
            // Draw card shadow
            ctx.fillStyle = isLightMode ? 'rgba(0, 0, 0, 0.08)' : 'rgba(0, 0, 0, 0.4)';
            ctx.beginPath();
            ctx.roundRect(cardX + 2, cardY + 3, cardW, cardH, 8);
            ctx.fill();
            
            // Draw card body
            ctx.fillStyle = isLightMode ? '#ffffff' : '#0f172a';
            ctx.strokeStyle = isLightMode ? '#6366f1' : '#818cf8';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.roundRect(cardX, cardY, cardW, cardH, 8);
            ctx.fill();
            ctx.stroke();
            
            // Draw card text
            ctx.fillStyle = isLightMode ? '#0f172a' : '#ffffff';
            ctx.font = getScaledFont(11, 'Outfit', true);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            const textVal = `동일 높이 y = ${selectedStrobe.freeFall.y.toFixed(2)}m`;
            const textTime = `시간 t = ${selectedStrobe.time.toFixed(2)}s`;
            
            ctx.fillText(textVal, midX, midY - 9);
            ctx.fillStyle = isLightMode ? '#4f46e5' : '#818cf8';
            ctx.font = getScaledFont(10, 'Outfit', false);
            ctx.fillText(textTime, midX, midY + 9);
            
            ctx.restore();
        }
    }
}

// ----------------------------------------------------
// UI Dashboard Telemetry Updates
// ----------------------------------------------------

function updateDashboard() {
    const currentFreeFall = getFreeFallState(simTime);
    const currentProjected = getProjectedState(simTime);
    
    dashTime.innerText = `${simTime.toFixed(3)} s`;
    
    dashFreeY.innerText = currentFreeFall.y.toFixed(1);
    dashFreeVy.innerText = Math.abs(currentFreeFall.vy).toFixed(1);
    
    dashProjX.innerText = (currentProjected.x - ORIGIN_X_METERS).toFixed(1);
    dashProjY.innerText = currentProjected.y.toFixed(1);
    dashProjVx.innerText = currentProjected.vx.toFixed(1);
    dashProjVy.innerText = Math.abs(currentProjected.vy).toFixed(1);
}

// ----------------------------------------------------
// Simulation State Mutators
// ----------------------------------------------------

// Sync all physics parameters from sliders
function syncParameters() {
    height = parseFloat(inputHeight.value);
    v0 = parseFloat(inputVx.value);
    g = parseFloat(inputGravity.value);
    timeScale = parseFloat(inputTimeScale.value);
    strobeInterval = parseFloat(inputStrobe.value);
    
    valHeight.innerText = `${height} m`;
    valVx.innerText = `${v0} m/s`;
    valGravity.innerText = `${g} m/s²`;
    valTimeScale.innerText = `${timeScale.toFixed(2)}x`;
    valStrobe.innerText = `${strobeInterval.toFixed(2)} 초`;
}

// Recalculate historical strobes up to current simTime based on new interval
function recalculateStrobes() {
    strobes = [];
    selectedStrobeTime = null; // Clear active strobe highlight
    const tHit = getGroundHitTime();
    const limitTime = Math.min(simTime, tHit);
    
    let sTime = strobeInterval;
    while (sTime <= limitTime + 0.0001) {
        const sf = getFreeFallState(sTime);
        const sp = getProjectedState(sTime);
        strobes.push({
            time: sTime,
            freeFall: { x: sf.x, y: sf.y, vx: sf.vx, vy: sf.vy },
            projected: { x: sp.x, y: sp.y, vx: sp.vx, vy: sp.vy }
        });
        sTime += strobeInterval;
    }
    
    if (strobes.length > 0) {
        lastStrobeTime = strobes[strobes.length - 1].time;
    } else {
        lastStrobeTime = 0;
    }
}

// Full simulation state reset
function resetSimulation() {
    isPlaying = false;
    lblPlayPause.innerText = "시작";
    btnPlayPause.innerHTML = `<i class="fa-solid fa-play"></i> <span>시작</span>`;
    btnPlayPause.className = "btn btn-primary btn-large";
    
    simTime = 0;
    lastStrobeTime = 0;
    selectedStrobeTime = null; // Clear active strobe highlight
    
    freeFallPath = [];
    projectedPath = [];
    strobes = [];
    
    syncParameters();
    
    // Add starting point to path traces
    const initialFree = getFreeFallState(0);
    const initialProj = getProjectedState(0);
    freeFallPath.push({ x: initialFree.x, y: initialFree.y });
    projectedPath.push({ x: initialProj.x, y: initialProj.y });
    
    updateDashboard();
    draw();
}

// Triggered when sliders change
function handleParameterChange() {
    resetSimulation();
    // zoomToFit(); // 수평 초기 속도바를 움직여도 화면 캔버스가 마음대로 움직이지 않도록 자동 피팅 차단
}

// 이전 잔상 위치로 강제 이동 (교육적 효과 극대화)
function stepPrevStrobe() {
    if (isPlaying) {
        pauseSimulation();
    }
    
    if (simTime <= 0) {
        return; // 이미 시작 시점임
    }
    
    // 이전 잔상 촬영 시점으로 회귀
    let prevTime = (Math.ceil((simTime - 0.001) / strobeInterval) - 1) * strobeInterval;
    if (prevTime < 0) {
        prevTime = 0;
    }
    
    simTime = prevTime;
    
    // 회귀한 시간까지의 실시간 운동 궤적 및 잔상들 전부 재계산 동기화
    freeFallPath = [];
    projectedPath = [];
    strobes = [];
    
    // 궤적 점 연결 데이터 생성
    const pathSteps = Math.round(simTime / 0.016);
    for (let i = 0; i <= pathSteps; i++) {
        const timeStep = Math.min(simTime, i * 0.016);
        const ff = getFreeFallState(timeStep);
        const proj = getProjectedState(timeStep);
        freeFallPath.push({ x: ff.x, y: ff.y });
        projectedPath.push({ x: proj.x, y: proj.y });
    }
    
    // 잔상 데이터들 쌓기
    let sTime = strobeInterval;
    while (sTime <= simTime + 0.0001) {
        const sf = getFreeFallState(sTime);
        const sp = getProjectedState(sTime);
        strobes.push({
            time: sTime,
            freeFall: { x: sf.x, y: sf.y, vx: sf.vx, vy: sf.vy },
            projected: { x: sp.x, y: sp.y, vx: sp.vx, vy: sp.vy }
        });
        sTime += strobeInterval;
    }
    
    // 동적으로 잔상 발생 시간 기록값 동기화
    lastStrobeTime = Math.floor(simTime / strobeInterval) * strobeInterval;
    
    updateDashboard();
    draw();
}

// 다음 잔상 위치로 강제 이동 (교육적 효과 극대화)
function stepStrobe() {
    if (isPlaying) {
        pauseSimulation();
    }
    const tHit = getGroundHitTime();
    if (simTime >= tHit) {
        resetSimulation();
        return;
    }
    
    // 다음 잔상 촬영 시점으로 건너뜀 (부동 소수점 누적 오차 방지 보강)
    let nextTime = (Math.floor((simTime + 0.001) / strobeInterval) + 1) * strobeInterval;
    if (nextTime >= tHit) {
        nextTime = tHit;
    }
    
    simTime = nextTime;
    
    // 점프한 시간까지의 실시간 운동 궤적 및 잔상들 전부 재계산 동기화
    freeFallPath = [];
    projectedPath = [];
    strobes = [];
    
    // 궤적 점 연결 데이터 생성
    const pathSteps = Math.round(simTime / 0.016);
    for (let i = 0; i <= pathSteps; i++) {
        const timeStep = Math.min(simTime, i * 0.016);
        const ff = getFreeFallState(timeStep);
        const proj = getProjectedState(timeStep);
        freeFallPath.push({ x: ff.x, y: ff.y });
        projectedPath.push({ x: proj.x, y: proj.y });
    }
    
    // 잔상 데이터들 쌓기
    let sTime = strobeInterval;
    while (sTime <= simTime) {
        const sf = getFreeFallState(sTime);
        const sp = getProjectedState(sTime);
        strobes.push({
            time: sTime,
            freeFall: { x: sf.x, y: sf.y, vx: sf.vx, vy: sf.vy },
            projected: { x: sp.x, y: sp.y, vx: sp.vx, vy: sp.vy }
        });
        sTime += strobeInterval;
    }
    
    // 동적으로 잔상 발생 시간 기록값 동기화
    lastStrobeTime = Math.floor(simTime / strobeInterval) * strobeInterval;
    
    updateDashboard();
    draw();
}

// Advance simulation physics by dt seconds
function advanceSimulation(dt) {
    const tHit = getGroundHitTime();
    
    if (simTime >= tHit) {
        simTime = tHit;
        isPlaying = false;
        lblPlayPause.innerText = "시작";
        btnPlayPause.innerHTML = `<i class="fa-solid fa-rotate-left"></i> <span>재실행</span>`;
        btnPlayPause.className = "btn btn-secondary btn-large";
        updateDashboard();
        draw();
        return;
    }
    
    simTime += dt;
    if (simTime > tHit) simTime = tHit;
    
    // Update path traces
    const freeState = getFreeFallState(simTime);
    const projState = getProjectedState(simTime);
    freeFallPath.push({ x: freeState.x, y: freeState.y });
    projectedPath.push({ x: projState.x, y: projState.y });
    
    // Handle Strobe snapshots
    while (simTime >= lastStrobeTime + strobeInterval && lastStrobeTime + strobeInterval <= tHit) {
        const strobeTime = lastStrobeTime + strobeInterval;
        const sf = getFreeFallState(strobeTime);
        const sp = getProjectedState(strobeTime);
        
        strobes.push({
            time: strobeTime,
            freeFall: { x: sf.x, y: sf.y, vx: sf.vx, vy: sf.vy },
            projected: { x: sp.x, y: sp.y, vx: sp.vx, vy: sp.vy }
        });
        
        lastStrobeTime = strobeTime;
    }
    
    updateDashboard();
    draw();
}

function pauseSimulation() {
    isPlaying = false;
    lblPlayPause.innerText = "시작";
    btnPlayPause.innerHTML = `<i class="fa-solid fa-play"></i> <span>시작</span>`;
    btnPlayPause.className = "btn btn-primary btn-large";
}

function startSimulation() {
    isPlaying = true;
    lblPlayPause.innerText = "일시정지";
    btnPlayPause.innerHTML = `<i class="fa-solid fa-pause"></i> <span>일시정지</span>`;
    btnPlayPause.className = "btn btn-secondary btn-large";
    lastTimestamp = performance.now();
    requestAnimationFrame(animationLoop);
}

// ----------------------------------------------------
// Main Animation Loop (High-precision performance.now)
// ----------------------------------------------------

function animationLoop(timestamp) {
    if (!isPlaying) return;
    
    const elapsedWallTime = (timestamp - lastTimestamp) / 1000.0; // seconds
    lastTimestamp = timestamp;
    
    // Scale delta time by physics timeScale
    const dt = elapsedWallTime * timeScale;
    
    // Prevent huge jumps (e.g. if browser tab is suspended)
    const cappedDt = Math.min(dt, 0.1);
    
    advanceSimulation(cappedDt);
    
    if (isPlaying) {
        requestAnimationFrame(animationLoop);
    }
}

// ----------------------------------------------------
// Interaction Event Handlers (Mouse / Touch)
// ----------------------------------------------------

// Retrieve cursor coordinate in canvas screen space
function getPointerPosition(e) {
    const rect = canvas.getBoundingClientRect();
    if (e.touches && e.touches.length > 0) {
        return {
            x: e.touches[0].clientX - rect.left,
            y: e.touches[0].clientY - rect.top
        };
    }
    return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
    };
}

// Hit-test and handle clicking on strobe balls
function handleCanvasClick(clickX, clickY) {
    let clickedStrobeTime = null;
    const ballRadius = getBallRadius();
    const HIT_RADIUS = Math.max(24, ballRadius + 10); // Dynamic target size for easy click accessibility at high zooms
    
    for (let i = 0; i < strobes.length; i++) {
        const strobe = strobes[i];
        const ffPt = toScreen(strobe.freeFall.x, strobe.freeFall.y);
        const projPt = toScreen(strobe.projected.x, strobe.projected.y);
        
        const distFF = Math.hypot(clickX - ffPt.x, clickY - ffPt.y);
        const distProj = Math.hypot(clickX - projPt.x, clickY - projPt.y);
        
        if (distFF <= HIT_RADIUS || distProj <= HIT_RADIUS) {
            clickedStrobeTime = strobe.time;
            break;
        }
    }
    
    if (clickedStrobeTime !== null) {
        if (selectedStrobeTime === clickedStrobeTime) {
            selectedStrobeTime = null; // Toggle off if clicked again
        } else {
            selectedStrobeTime = clickedStrobeTime;
        }
    } else {
        selectedStrobeTime = null; // Clicked empty space
    }
    
    draw();
}

// Mouse events for Panning & Clicking
canvas.addEventListener('mousedown', (e) => {
    isDragging = true;
    dragStartX = e.clientX - camera.x;
    dragStartY = e.clientY - camera.y;
    pointerStartX = e.clientX;
    pointerStartY = e.clientY;
});

window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    camera.x = e.clientX - dragStartX;
    camera.y = e.clientY - dragStartY;
    draw();
});

canvas.addEventListener('mouseup', (e) => {
    if (isDragging) {
        const dx = e.clientX - pointerStartX;
        const dy = e.clientY - pointerStartY;
        const distance = Math.hypot(dx, dy);
        if (distance < 5) {
            const rect = canvas.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const clickY = e.clientY - rect.top;
            handleCanvasClick(clickX, clickY);
        }
    }
});

window.addEventListener('mouseup', () => {
    isDragging = false;
});

// Wheel event for zooming focused on mouse cursor
canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const pos = getPointerPosition(e);
    const zoomFactor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    zoomAtPoint(zoomFactor, pos.x, pos.y);
    draw();
}, { passive: false });

// Touch Panning & Multi-touch Pinch to Zoom & Tapping
canvas.addEventListener('touchstart', (e) => {
    activeTouches = e.touches.length;
    
    if (activeTouches === 1) {
        // Single touch drag -> panning
        isDragging = true;
        const rect = canvas.getBoundingClientRect();
        dragStartX = e.touches[0].clientX - camera.x;
        dragStartY = e.touches[0].clientY - camera.y;
        pointerStartX = e.touches[0].clientX;
        pointerStartY = e.touches[0].clientY;
    } else if (activeTouches === 2) {
        // Multi touch pinch -> zoom + pan
        isDragging = false;
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        
        // Starting distance between fingers
        touchStartDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        touchStartZoom = camera.zoom;
        
        // Center of fingers
        const rect = canvas.getBoundingClientRect();
        touchStartCenter = {
            x: ((t1.clientX + t2.clientX) / 2) - rect.left,
            y: ((t1.clientY + t2.clientY) / 2) - rect.top
        };
    }
}, { passive: true });

canvas.addEventListener('touchmove', (e) => {
    if (e.cancelable) e.preventDefault(); // Prevents screen scrolling / rubber banding on zoom/drag
    
    if (e.touches.length === 1 && isDragging) {
        // Pan
        camera.x = e.touches[0].clientX - dragStartX;
        camera.y = e.touches[0].clientY - dragStartY;
        draw();
    } else if (e.touches.length === 2) {
        // Pinch Zoom
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const currentDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        
        if (touchStartDist > 10) {
            const factor = currentDist / touchStartDist;
            const targetZoom = touchStartZoom * factor;
            
            // Adjust factor to zoom relative to the original touch center
            const zoomRatio = targetZoom / camera.zoom;
            zoomAtPoint(zoomRatio, touchStartCenter.x, touchStartCenter.y);
            draw();
        }
    }
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
    if (isDragging && activeTouches === 1 && e.changedTouches && e.changedTouches.length > 0) {
        const touch = e.changedTouches[0];
        const dx = touch.clientX - pointerStartX;
        const dy = touch.clientY - pointerStartY;
        const distance = Math.hypot(dx, dy);
        if (distance < 5) {
            const rect = canvas.getBoundingClientRect();
            const tapX = touch.clientX - rect.left;
            const tapY = touch.clientY - rect.top;
            handleCanvasClick(tapX, tapY);
        }
    }
    isDragging = false;
    activeTouches = e.touches.length;
});

canvas.addEventListener('touchcancel', () => {
    isDragging = false;
    activeTouches = 0;
});

// ----------------------------------------------------
// UI Toggles & Floating button click hooks
// ----------------------------------------------------

chkGrid.addEventListener('change', draw);
chkSyncLine.addEventListener('change', draw);
chkHorizInterval.addEventListener('change', draw);
chkVectors.addEventListener('change', draw);
chkPath.addEventListener('change', draw);
chkStats.addEventListener('change', (e) => {
    if (e.target.checked) {
        dashboardOverlay.classList.remove('hidden');
    } else {
        dashboardOverlay.classList.add('hidden');
    }
    draw();
});

// Play / Pause simulation trigger
btnPlayPause.addEventListener('click', () => {
    const tHit = getGroundHitTime();
    if (simTime >= tHit) {
        // Re-run
        resetSimulation();
        startSimulation();
    } else if (isPlaying) {
        pauseSimulation();
    } else {
        startSimulation();
    }
});

// Step simulation
btnPrevStep.addEventListener('click', stepPrevStrobe);
btnStep.addEventListener('click', stepStrobe);

// Sidebar Toggle (Collapse/Expand)
btnSidebarToggle.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
    
    // Smoothly resize canvas during transition to keep physical dimensions consistent
    let startTime = null;
    const duration = 400; // ms transition duration
    function animateResize(timestamp) {
        if (!startTime) startTime = timestamp;
        const progress = timestamp - startTime;
        resizeCanvas();
        draw();
        if (progress < duration) {
            requestAnimationFrame(animateResize);
        } else {
            resizeCanvas();
            draw();
        }
    }
    requestAnimationFrame(animateResize);
});

// Theme Toggle
btnThemeToggle.addEventListener('click', () => {
    document.body.classList.toggle('light-mode');
    const isLight = document.body.classList.contains('light-mode');
    const icon = btnThemeToggle.querySelector('i');
    if (isLight) {
        icon.className = 'fa-solid fa-sun';
        btnThemeToggle.title = '어두운 테마로 변경';
    } else {
        icon.className = 'fa-solid fa-moon';
        btnThemeToggle.title = '밝은 테마로 변경';
    }
    draw();
});

// Reset simulation
btnReset.addEventListener('click', () => {
    resetSimulation();
    zoomToFit();
    draw();
});

// Sidebar sliders real-time listeners
inputHeight.addEventListener('input', handleParameterChange);
inputVx.addEventListener('input', handleParameterChange);
inputGravity.addEventListener('input', handleParameterChange);
inputTimeScale.addEventListener('input', syncParameters);
inputStrobe.addEventListener('input', () => {
    syncParameters();
    recalculateStrobes();
    draw();
});

// Navigation Toolbar hooks
btnZoomIn.addEventListener('click', () => {
    zoomAtPoint(1.2, canvas.clientWidth / 2, canvas.clientHeight / 2);
    draw();
});

btnZoomOut.addEventListener('click', () => {
    zoomAtPoint(1 / 1.2, canvas.clientWidth / 2, canvas.clientHeight / 2);
    draw();
});

btnZoomFit.addEventListener('click', () => {
    zoomToFit();
    draw();
});

// Modal Help Controls
btnHelp.addEventListener('click', () => {
    helpModal.classList.remove('hidden');
});

btnHelpClose.addEventListener('click', () => {
    helpModal.classList.add('hidden');
});

btnHelpConfirm.addEventListener('click', () => {
    helpModal.classList.add('hidden');
});

// Close modal if user clicks outside of modal card
helpModal.addEventListener('click', (e) => {
    if (e.target === helpModal) {
        helpModal.classList.add('hidden');
    }
});

// ----------------------------------------------------
// App Setup & Initial Activation
// ----------------------------------------------------

window.addEventListener('resize', () => {
    resizeCanvas();
    draw();
});

// Core bootstrapper
function initializeApp() {
    resizeCanvas();
    resetSimulation();
    zoomToFit(); // elegant automatic framing of physics vectors
    draw();
}

// Fire on load
window.addEventListener('load', initializeApp);
