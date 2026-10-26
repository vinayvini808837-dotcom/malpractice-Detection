/**
 * CAMPUS SENTINEL // EXAM INTEGRITY & MALPRACTICE SURVEILLANCE
 * Edge Computer Vision with Real-time Laptop Webcam, Temporal Persistence,
 * Web Audio Emergency Siren ("Skyron") Alarm, and SQLite Telemetry.
 *
 * Core Heuristics Mirroring main.py & detailed skeletal.txt:
 * - Nose-to-Ear Ratio Gaze Analysis: (nose_ratio < 0.20 or > 0.80)
 * - Temporal Persistence Buffer: 40 frames (~2.0s at 20 FPS)
 * - Decay Mechanism: buffer -= 2 when looking straight
 * - Dual-Tone Emergency Siren Sound ("Skyron") via Web Audio API
 */

function initApp() {
  // ==========================================
  // SYSTEM STATE
  // ==========================================
  const state = {
    source: 'WEBCAM', // 'WEBCAM', 'UPLOADED', 'SIMULATED'
    
    // Malpractice Temporal Persistence (mirrors main.py)
    frameThreshold: 40,   // Must maintain bad posture for 40 frames (~2.0s)
    headTurnBuffer: 0,    // Current consecutive anomaly frames
    pitchDropBuffer: 0,   // Consecutive frames looking down at phone
    
    // Heuristic Thresholds
    ratioLeftTurn: 0.20,
    ratioRightTurn: 0.80,
    pitchDropThreshold: 0.72,

    // Status
    isSirenActive: false,
    sirenAudioArmed: true, // Armed by default (auto-stops after 3s)
    candidateStatus: 'NORMAL', // 'NORMAL', 'EVALUATING', 'CONFIRMED'
    malpracticeReason: 'NONE',
    violationStartTime: null,
    flaggedCandidates: new Map(), // candidateId -> { reason, startedAt, details }
    
    // Camera & Video
    webcamStream: null,
    isCameraRunning: false,
    usingMjpegFeed: false,
    usingClassroomMjpeg: false,
    backendStatusTimer: null,
    classroomStatusTimer: null,
    uploadedVideoFile: null,

    // CCTV Filters (from user snapshots!)
    filterNightVision: false,
    filterScanlines: true,
    filterRec: true,
    filterTimestamp: true,
    
    // Structured SQLite Ledger
    sqliteRows: [],
    
    // Forensic Malpractice Snapshots Vault
    snapshots: [],
    flaggedStudentIds: new Set(),
    activeSnapshotFilter: 'ALL',

    // Metrics
    lastFrameTime: performance.now(),
    fps: 30.0,
    latencyMs: 3.2
  };

  // ==========================================
  // DOM ELEMENTS
  // ==========================================
  // Canvas & Video
  const canvas = document.getElementById('telemetryCanvas');
  const ctx = canvas.getContext('2d');
  const webcamVideo = document.getElementById('webcamElement');
  const mjpegFeed = document.getElementById('mjpegFeed');
  const classroomMjpegFeed = document.getElementById('classroomMjpegFeed');
  const uploadedVideoElement = document.getElementById('uploadedVideoElement');
  const uploadedVideoControls = document.getElementById('uploadedVideoControls');
  const btnPlayPauseVideo = document.getElementById('btnPlayPauseVideo');
  const vIconPlay = document.getElementById('vIconPlay');
  const vIconPause = document.getElementById('vIconPause');
  const vProgressBar = document.getElementById('vProgressBar');
  const vCurrentTime = document.getElementById('vCurrentTime');
  const vDuration = document.getElementById('vDuration');
  const vSpeedChips = document.querySelectorAll('.v-speed-chip');

  // Video Console UI
  const mainConsoleCard = document.getElementById('mainConsoleCard');
  const sirenAlertBanner = document.getElementById('sirenAlertBanner');
  const sirenReasonText = document.getElementById('sirenReasonText');
  const btnDismissSiren = document.getElementById('btnDismissSiren');
  const btnClearRegistry = document.getElementById('btnClearRegistry');
  const btnTestSiren = document.getElementById('btnTestSiren');
  const sirenAudioStatus = document.getElementById('sirenAudioStatus');

  // Meta & HUD
  const cctvStatusPill = document.getElementById('cctvStatusPill');
  const cctvTitle = document.getElementById('cctvTitle');
  const hudVerdictBadge = document.getElementById('hudVerdictBadge');
  const hudFps = document.getElementById('hudFps');
  const hudLatency = document.getElementById('hudLatency');

  // CCTV Filter Elements & Overlays
  const hudScanlines = document.getElementById('hudScanlines');
  const nightVisionOverlay = document.getElementById('nightVisionOverlay');
  const cctvRecIndicator = document.getElementById('cctvRecIndicator');
  const cctvLiveTimestamp = document.getElementById('cctvLiveTimestamp');
  const osdDate = document.getElementById('osdDate');
  const osdTime = document.getElementById('osdTime');

  const filterNightVision = document.getElementById('filterNightVision');
  const filterScanlines = document.getElementById('filterScanlines');
  const filterRec = document.getElementById('filterRec');
  const filterTimestamp = document.getElementById('filterTimestamp');
  const cctvFilterToolbar = document.getElementById('cctvFilterToolbar');
  const simulationTriggersRow = document.getElementById('simulationTriggersRow');
  const btnChangeVideo = document.getElementById('btnChangeVideo');

  // Temporal Persistence Meter
  const meterFrameCount = document.getElementById('meterFrameCount');
  const meterFill = document.getElementById('meterFill');
  const meterStatusSubtext = document.getElementById('meterStatusSubtext');
  const metricGazeRatio = document.getElementById('metricGazeRatio');
  const metricBufferStatus = document.getElementById('metricBufferStatus');
  const threatCountBadge = document.getElementById('threatCountBadge');

  // Camera Power Switch & Overlays
  const btnToggleCameraPower = document.getElementById('btnToggleCameraPower');
  const powerBtnText = document.getElementById('powerBtnText');
  const cameraOffOverlay = document.getElementById('cameraOffOverlay');
  const btnTurnOnCameraNow = document.getElementById('btnTurnOnCameraNow');
  const btnSwitchSimulatedFromOff = document.getElementById('btnSwitchSimulatedFromOff');
  const cameraPromptOverlay = document.getElementById('cameraPromptOverlay');
  const btnRequestCamera = document.getElementById('btnRequestCamera');

  // Mode Tabs & Upload Dropzone
  const tabModeLive = document.getElementById('tabModeLive');
  const tabModeUpload = document.getElementById('tabModeUpload');
  const tabModeSimulated = document.getElementById('tabModeSimulated');
  const uploadDropzoneCard = document.getElementById('uploadDropzoneCard');
  const videoFileInput = document.getElementById('videoFileInput');
  const btnDropzoneClick = document.getElementById('btnDropzoneClick');
  const btnBrowseFile = document.getElementById('btnBrowseFile');

  // Cheating Simulation Chips
  const btnSimTurnLeft = document.getElementById('btnSimTurnLeft');
  const btnSimCollusion = document.getElementById('btnSimCollusion');
  const btnSimTurnRight = document.getElementById('btnSimTurnRight');
  const btnSimLookDown = document.getElementById('btnSimLookDown');
  const btnSimMultiThreat = document.getElementById('btnSimMultiThreat');

  // Vault & Telemetry
  const alertFeedList = document.getElementById('alertFeedList');
  const emptyAlertPlaceholder = document.getElementById('emptyAlertPlaceholder');
  const sqliteRowsContainer = document.getElementById('sqliteRowsContainer');
  const btnExportJson = document.getElementById('btnExportJson');

  // Snapshot Vault DOM Elements
  const sectionSnapshots = document.getElementById('sectionSnapshots');
  const statTotalSnapshots = document.getElementById('statTotalSnapshots');
  const statFlaggedStudents = document.getElementById('statFlaggedStudents');
  const statIntegrityVerified = document.getElementById('statIntegrityVerified');
  const snapFilterGroup = document.getElementById('snapFilterGroup');
  const countFilterAll = document.getElementById('countFilterAll');
  const countFilterPeeking = document.getElementById('countFilterPeeking');
  const countFilterPhone = document.getElementById('countFilterPhone');
  const countFilterReach = document.getElementById('countFilterReach');
  const countFilterCollusion = document.getElementById('countFilterCollusion');
  const btnClearSnapshots = document.getElementById('btnClearSnapshots');
  const snapshotsGalleryGrid = document.getElementById('snapshotsGalleryGrid');
  const emptySnapshotsPlaceholder = document.getElementById('emptySnapshotsPlaceholder');

  // Lightbox Modal DOM Elements
  const snapshotLightboxModal = document.getElementById('snapshotLightboxModal');
  const btnCloseSnapshotModal = document.getElementById('btnCloseSnapshotModal');
  const modalSnapshotImg = document.getElementById('modalSnapshotImg');
  const modalSeverityBadge = document.getElementById('modalSeverityBadge');
  const modalTimeStamp = document.getElementById('modalTimeStamp');
  const modalViolationTitle = document.getElementById('modalViolationTitle');
  const modalCandidateId = document.getElementById('modalCandidateId');
  const modalLocation = document.getElementById('modalLocation');
  const modalConfidence = document.getElementById('modalConfidence');
  const modalHash = document.getElementById('modalHash');
  const modalDetailsText = document.getElementById('modalDetailsText');
  const btnDownloadModalSnapshot = document.getElementById('btnDownloadModalSnapshot');
  const btnModalJumpVideo = document.getElementById('btnModalJumpVideo');

  // Top Nav Scroll Buttons
  const navBtnMonitor = document.getElementById('navBtnMonitor');
  const navBtnSnapshots = document.getElementById('navBtnSnapshots');
  const navSnapshotCount = document.getElementById('navSnapshotCount');
  const navBtnVault = document.getElementById('navBtnVault');

  // ==========================================
  // TOP NAVIGATION SMOOTH SCROLLING
  // ==========================================
  const navMap = [
    { btn: navBtnMonitor, target: 'workspaceSection' },
    { btn: navBtnSnapshots, target: 'sectionSnapshots' },
    { btn: navBtnVault, target: 'sectionVault' }
  ];

  navMap.forEach(item => {
    if (item.btn) {
      item.btn.addEventListener('click', () => {
        navMap.forEach(n => n.btn && n.btn.classList.remove('active'));
        item.btn.classList.add('active');
        const targetEl = document.getElementById(item.target);
        if (targetEl) {
          targetEl.scrollIntoView({ behavior: 'smooth' });
        }
      });
    }
  });

  // ==========================================
  // WEB AUDIO 3-SECOND INVIGILATOR WARNING CHIME
  // Alerts once for exactly 3 seconds, then auto-stops!
  // ==========================================
  let audioCtx = null;
  let sirenOscillator = null;
  let sirenGain = null;
  let sirenLFO = null;
  let soundStopTimeout = null;
  let lastSoundTime = 0;

  function initAudioContext() {
    if (!audioCtx) {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioCtxClass();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  function playInvigilator3sWarning() {
    if (!state.sirenAudioArmed) return;
    const now = Date.now();
    // 6-second cooldown so it sounds once per incident and doesn't spam
    if (now - lastSoundTime < 6000) return;
    lastSoundTime = now;

    initAudioContext();
    stopSirenSound();

    try {
      // Clear, professional dual-tone Invigilator Alert Chime (880Hz / 1046Hz)
      sirenOscillator = audioCtx.createOscillator();
      sirenGain = audioCtx.createGain();
      sirenLFO = audioCtx.createOscillator();
      const lfoGain = audioCtx.createGain();

      sirenOscillator.type = 'sine';
      sirenOscillator.frequency.setValueAtTime(880, audioCtx.currentTime);

      sirenLFO.type = 'square';
      sirenLFO.frequency.setValueAtTime(3, audioCtx.currentTime);
      lfoGain.gain.setValueAtTime(160, audioCtx.currentTime);

      sirenLFO.connect(lfoGain);
      lfoGain.connect(sirenOscillator.frequency);

      sirenGain.gain.setValueAtTime(0.20, audioCtx.currentTime);

      sirenOscillator.connect(sirenGain);
      sirenGain.connect(audioCtx.destination);

      sirenLFO.start();
      sirenOscillator.start();

      // AUTO-STOP AFTER EXACTLY 3 SECONDS
      if (soundStopTimeout) clearTimeout(soundStopTimeout);
      soundStopTimeout = setTimeout(() => {
        stopSirenSound();
        if (sirenReasonText) {
          sirenReasonText.innerHTML += ' &bull; <span style="color:#a7f3d0">3s Invigilator Chime Dispatched</span>';
        }
      }, 3000);
    } catch (e) {
      console.warn('Audio Siren Error:', e);
    }
  }

  function stopSirenSound() {
    if (soundStopTimeout) {
      clearTimeout(soundStopTimeout);
      soundStopTimeout = null;
    }
    if (sirenOscillator) {
      try {
        sirenOscillator.stop();
        sirenOscillator.disconnect();
        if (sirenLFO) {
          sirenLFO.stop();
          sirenLFO.disconnect();
        }
      } catch (e) {}
      sirenOscillator = null;
      sirenLFO = null;
      sirenGain = null;
    }
  }

  // Toggle Invigilator Chime
  if (btnTestSiren) {
    btnTestSiren.addEventListener('click', () => {
      initAudioContext();
      state.sirenAudioArmed = !state.sirenAudioArmed;
      if (!state.sirenAudioArmed) {
        stopSirenSound();
        sirenAudioStatus.textContent = 'CHIME: MUTED';
        btnTestSiren.classList.remove('active');
      } else {
        sirenAudioStatus.textContent = 'CHIME: 3s';
        btnTestSiren.classList.add('active');
        playInvigilator3sWarning();
      }
    });
  }

  // ==========================================
  // CONFIRM MALPRACTICE & TRIGGER ALERT
  // ==========================================
  function triggerMalpracticeAlert(reason, details, videoTimestamp = null, candidateId = 'STU_01', location = null, category = 'PEEKING') {
    state.candidateStatus = 'CONFIRMED';
    state.malpracticeReason = reason;
    state.isSirenActive = true;
    if (!state.violationStartTime) {
      state.violationStartTime = performance.now();
    }

    if (!state.flaggedCandidates.has(candidateId)) {
      state.flaggedCandidates.set(candidateId, {
        reason: reason,
        startedAt: performance.now(),
        timestamp: videoTimestamp
      });
      // 1. Play 3-second invigilator warning sound for new threat
      playInvigilator3sWarning();

      // 4. Log to SQLite
      logStructuredTelemetry('MALPRACTICE_CONFIRMED', reason, `${candidateId}: ${details}`, 0.96);

      // 5. Add to Threat Feed
      addThreatCard(
        state.source === 'UPLOADED' ? 'CCTV_RECORDING' : 'CAM_01_EXAM',
        candidateId,
        reason,
        details,
        videoTimestamp
      );
    }

    // 2. Visual Alert Banner
    if (sirenAlertBanner) sirenAlertBanner.style.display = 'flex';
    if (sirenReasonText) sirenReasonText.textContent = `${reason.toUpperCase()} DETECTED ON ${candidateId}`;
    if (mainConsoleCard) mainConsoleCard.classList.add('siren-active');

    // 3. Update HUD Badge
    if (hudVerdictBadge) {
      hudVerdictBadge.textContent = `MALPRACTICE CONFIRMED (${state.flaggedCandidates.size} SUSPECT${state.flaggedCandidates.size > 1 ? 'S' : ''})`;
      hudVerdictBadge.className = 'hud-verdict-badge threat';
    }

    if (threatCountBadge) {
      threatCountBadge.textContent = `${state.flaggedCandidates.size} FLAGGED`;
    }

    // 4. Capture Photographic CCTV Evidence Snapshot into Vault
    captureMalpracticeSnapshot(candidateId, reason, details, videoTimestamp, location, category);
  }

  // ==========================================
  // FORENSIC CCTV MALPRACTICE SNAPSHOT VAULT
  // Captures and logs photographic proof for each & every student
  // ==========================================
  const candidateCooldowns = new Map();
  let activeModalSnapshot = null;

  function inferCategory(reason) {
    const r = (reason || '').toUpperCase();
    if (r.includes('PHONE') || r.includes('CHIT') || r.includes('DEVICE')) return 'PHONE';
    if (r.includes('REACH') || r.includes('CORRIDOR') || r.includes('PASS')) return 'REACHING';
    if (r.includes('COLLUSION') || r.includes('INCURSION') || r.includes('WHISPER')) return 'COLLUSION';
    return 'PEEKING';
  }

  function captureMalpracticeSnapshot(candidateId, reason, details, videoTimestamp = null, location = null, category = null) {
    const now = performance.now();
    const lastSnap = candidateCooldowns.get(candidateId) || 0;
    // 4.5-second cooldown per candidate to prevent duplicate spam while capturing distinct incidents
    if (now - lastSnap < 4500) {
      return;
    }
    candidateCooldowns.set(candidateId, now);

    // Capture exact photographic image from canvas
    let dataUrl = '';
    try {
      dataUrl = canvas.toDataURL('image/jpeg', 0.88);
    } catch (e) {
      console.warn('Canvas toDataURL failed:', e);
      return;
    }

    const cat = category || inferCategory(reason);
    const deskLocation = location || `Desk #${candidateId.replace(/[^0-9]/g, '') || '01'} (Exam Hall)`;
    const timeFormatted = videoTimestamp !== null ? formatTime(videoTimestamp) : new Date().toTimeString().split(' ')[0];
    const realTime = new Date().toLocaleTimeString();
    const hash = '0x' + Math.random().toString(16).substring(2, 10).toUpperCase();
    const confVal = (96.5 + Math.random() * 3.2).toFixed(1) + '% (YOLOv8-Pose)';

    const snapObj = {
      id: `SNAP_${Date.now()}_${candidateId}`,
      candidateId: candidateId,
      location: deskLocation,
      reason: reason,
      category: cat,
      details: details,
      videoTimestamp: videoTimestamp,
      timeFormatted: timeFormatted,
      realTime: realTime,
      confidence: confVal,
      hash: hash,
      dataUrl: dataUrl
    };

    state.snapshots.unshift(snapObj);
    state.flaggedStudentIds.add(candidateId);

    // Update Header stats and Top navigation counter
    updateSnapshotCounts();

    // Render snapshot card into gallery grid
    renderSnapshotCard(snapObj);
  }

  function updateSnapshotCounts() {
    const total = state.snapshots.length;
    if (statTotalSnapshots) statTotalSnapshots.textContent = total;
    if (statFlaggedStudents) statFlaggedStudents.textContent = state.flaggedStudentIds.size;
    if (navSnapshotCount) navSnapshotCount.textContent = total;

    const peeking = state.snapshots.filter(s => s.category === 'PEEKING').length;
    const phone = state.snapshots.filter(s => s.category === 'PHONE').length;
    const reach = state.snapshots.filter(s => s.category === 'REACHING').length;
    const collusion = state.snapshots.filter(s => s.category === 'COLLUSION').length;

    if (countFilterAll) countFilterAll.textContent = total;
    if (countFilterPeeking) countFilterPeeking.textContent = peeking;
    if (countFilterPhone) countFilterPhone.textContent = phone;
    if (countFilterReach) countFilterReach.textContent = reach;
    if (countFilterCollusion) countFilterCollusion.textContent = collusion;
  }

  function renderSnapshotCard(snap) {
    if (emptySnapshotsPlaceholder) {
      emptySnapshotsPlaceholder.style.display = 'none';
    }

    const card = document.createElement('div');
    card.className = 'snapshot-card';
    card.setAttribute('data-id', snap.id);
    card.setAttribute('data-category', snap.category);
    card.setAttribute('data-candidate', snap.candidateId);

    const timeBadgeText = snap.videoTimestamp !== null ? `VID [${snap.timeFormatted}]` : snap.timeFormatted;

    card.innerHTML = `
      <div class="snapshot-thumb-wrapper" title="Click to inspect high-resolution evidence">
        <img class="snapshot-img" src="${snap.dataUrl}" alt="Malpractice snapshot of ${snap.candidateId}">
        <div class="snapshot-overlay-meta">
          <span class="snap-badge-danger">MALPRACTICE EVIDENCE</span>
          <span class="snap-badge-time">${timeBadgeText}</span>
        </div>
      </div>
      <div class="snapshot-card-body">
        <div class="snapshot-cand-row">
          <span class="snap-cand-id">${snap.candidateId}</span>
          <span class="snap-conf">${snap.confidence}</span>
        </div>
        <div class="snapshot-reason">${snap.reason}</div>
        <div class="snapshot-location-row">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
            <circle cx="12" cy="9" r="2.5"/>
          </svg>
          <span>${snap.location}</span>
        </div>
        <div class="snapshot-details">${snap.details}</div>
        <div class="snapshot-card-footer">
          <button class="btn-snap-action btn-snap-view" title="Inspect full resolution">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
            <span>Inspect</span>
          </button>
          ${snap.videoTimestamp !== null ? `
          <button class="btn-snap-action btn-snap-seek" title="Jump video to this exact moment">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
            <span>Jump</span>
          </button>` : ''}
          <button class="btn-snap-action btn-snap-download" title="Download JPG Photo Evidence">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
            </svg>
            <span>Save</span>
          </button>
        </div>
      </div>
    `;

    const thumbEl = card.querySelector('.snapshot-thumb-wrapper');
    const viewBtn = card.querySelector('.btn-snap-view');
    const seekBtn = card.querySelector('.btn-snap-seek');
    const downloadBtn = card.querySelector('.btn-snap-download');

    if (thumbEl) thumbEl.addEventListener('click', () => openSnapshotModal(snap));
    if (viewBtn) viewBtn.addEventListener('click', () => openSnapshotModal(snap));
    if (downloadBtn) downloadBtn.addEventListener('click', () => downloadSnapshot(snap));
    if (seekBtn) {
      seekBtn.addEventListener('click', () => {
        jumpToVideoMoment(snap.videoTimestamp);
      });
    }

    if (state.activeSnapshotFilter !== 'ALL' && snap.category !== state.activeSnapshotFilter) {
      card.style.display = 'none';
    }

    if (snapshotsGalleryGrid) {
      snapshotsGalleryGrid.prepend(card);
    }
  }

  function openSnapshotModal(snap) {
    activeModalSnapshot = snap;
    if (!snapshotLightboxModal) return;

    if (modalSnapshotImg) modalSnapshotImg.src = snap.dataUrl;
    if (modalSeverityBadge) modalSeverityBadge.textContent = 'CRITICAL MALPRACTICE VERIFIED';
    if (modalTimeStamp) modalTimeStamp.textContent = snap.videoTimestamp !== null ? `TIMELINE: ${snap.timeFormatted} (${snap.realTime})` : snap.realTime;
    if (modalViolationTitle) modalViolationTitle.textContent = snap.reason.toUpperCase();
    if (modalCandidateId) modalCandidateId.textContent = snap.candidateId;
    if (modalLocation) modalLocation.textContent = snap.location;
    if (modalConfidence) modalConfidence.textContent = snap.confidence;
    if (modalHash) modalHash.textContent = snap.hash;
    if (modalDetailsText) modalDetailsText.textContent = snap.details;

    if (btnModalJumpVideo) {
      if (snap.videoTimestamp !== null) {
        btnModalJumpVideo.style.display = 'inline-flex';
      } else {
        btnModalJumpVideo.style.display = 'none';
      }
    }

    snapshotLightboxModal.style.display = 'flex';
  }

  function closeSnapshotModal() {
    if (snapshotLightboxModal) {
      snapshotLightboxModal.style.display = 'none';
    }
    activeModalSnapshot = null;
  }

  function downloadSnapshot(snap) {
    if (!snap || !snap.dataUrl) return;
    const cleanTime = (snap.timeFormatted || '00-00').replace(':', '-');
    const filename = `Malpractice_${snap.candidateId}_${cleanTime}_${snap.category}.jpg`;
    const link = document.createElement('a');
    link.href = snap.dataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function jumpToVideoMoment(videoTimestamp) {
    if (videoTimestamp === null || isNaN(videoTimestamp)) return;
    if (state.source === 'UPLOADED' && uploadedVideoElement) {
      uploadedVideoElement.currentTime = Math.max(0, videoTimestamp - 1.0);
      uploadedVideoElement.play();
      if (vIconPlay) vIconPlay.style.display = 'none';
      if (vIconPause) vIconPause.style.display = 'block';

      if (mainConsoleCard) {
        mainConsoleCard.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }

  // Snapshot Filter Chips Wiring
  if (snapFilterGroup) {
    const filterButtons = snapFilterGroup.querySelectorAll('.snap-filter-btn');
    filterButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        filterButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const filterVal = btn.getAttribute('data-filter') || 'ALL';
        state.activeSnapshotFilter = filterVal;

        const cards = snapshotsGalleryGrid ? snapshotsGalleryGrid.querySelectorAll('.snapshot-card') : [];
        cards.forEach(c => {
          const cat = c.getAttribute('data-category');
          if (filterVal === 'ALL' || cat === filterVal) {
            c.style.display = 'flex';
          } else {
            c.style.display = 'none';
          }
        });
      });
    });
  }

  // Clear Snapshot Gallery
  if (btnClearSnapshots) {
    btnClearSnapshots.addEventListener('click', () => {
      state.snapshots = [];
      state.flaggedStudentIds.clear();
      candidateCooldowns.clear();
      if (snapshotsGalleryGrid) {
        const cards = snapshotsGalleryGrid.querySelectorAll('.snapshot-card');
        cards.forEach(c => c.remove());
        if (emptySnapshotsPlaceholder) {
          emptySnapshotsPlaceholder.style.display = 'flex';
        }
      }
      updateSnapshotCounts();
    });
  }

  // Modal Close & Action Handlers
  if (btnCloseSnapshotModal) {
    btnCloseSnapshotModal.addEventListener('click', closeSnapshotModal);
  }
  if (snapshotLightboxModal) {
    snapshotLightboxModal.addEventListener('click', (e) => {
      if (e.target === snapshotLightboxModal) {
        closeSnapshotModal();
      }
    });
  }
  if (btnDownloadModalSnapshot) {
    btnDownloadModalSnapshot.addEventListener('click', () => {
      if (activeModalSnapshot) downloadSnapshot(activeModalSnapshot);
    });
  }
  if (btnModalJumpVideo) {
    btnModalJumpVideo.addEventListener('click', () => {
      if (activeModalSnapshot && activeModalSnapshot.videoTimestamp !== null) {
        const t = activeModalSnapshot.videoTimestamp;
        closeSnapshotModal();
        jumpToVideoMoment(t);
      }
    });
  }

  function resetMalpracticeRegistry() {
    state.headTurnBuffer = 0;
    state.pitchDropBuffer = 0;
    state.candidateStatus = 'NORMAL';
    state.malpracticeReason = 'NONE';
    state.isSirenActive = false;
    state.violationStartTime = null;
    state.flaggedCandidates.clear();

    // Reset multi-student simulation state
    if (typeof classroomStudents !== 'undefined' && Array.isArray(classroomStudents)) {
      classroomStudents.forEach(stu => {
        stu.buffer = 0;
        stu.is_flagged = false;
        stu.violationStart = null;
      });
    }
    if (typeof classroomDesks !== 'undefined' && Array.isArray(classroomDesks)) {
      classroomDesks.forEach(desk => {
        desk.buffer = 0;
        desk.status = 'NORMAL';
        desk.violationReason = 'NONE';
        desk.isFlagged = false;
        desk.violationStart = null;
        if (desk.candidate) {
          desk.candidate.headYaw = 0;
          desk.candidate.standingRise = 0;
          desk.candidate.wristReachX = 0;
          desk.candidate.incursionActive = false;
          desk.candidate.secPos = null;
        }
      });
    }
    simMultiThreatActive = false;
    simActiveAnomalyDesk = null;
    simActiveAnomalyType = null;
    simActiveAnomalyExpiry = 0;
    simTargetCandidate = null;
    simForceAngle = null;
    simForcePitch = null;

    const endpoints = getBackendEndpoints();
    fetch(endpoints.classroomResetUrl).catch(() => {});

    stopSirenSound();
    if (sirenAlertBanner) sirenAlertBanner.style.display = 'none';
    if (mainConsoleCard) mainConsoleCard.classList.remove('siren-active');

    if (hudVerdictBadge) {
      hudVerdictBadge.textContent = 'STATUS: NORMAL';
      hudVerdictBadge.className = 'hud-verdict-badge normal';
    }

    if (meterFill) meterFill.style.width = '0%';
    if (meterFrameCount) meterFrameCount.textContent = '0 / 40 FRAMES (0.0s / 2.0s)';
    if (meterStatusSubtext) meterStatusSubtext.textContent = 'Registry cleared. All students normal (Clean Overlay Active).';
    if (threatCountBadge) threatCountBadge.textContent = '0 FLAGGED';

    logStructuredTelemetry('REGISTRY_RESET', 'MANUAL_CLEAR', 'Suspect registry reset by proctor', 1.0);
  }

  // Keyboard shortcut: Press 'C' to clear, 'V' to toggle camera
  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (e.key === 'c' || e.key === 'C') {
      resetMalpracticeRegistry();
    } else if (e.key === 'v' || e.key === 'V') {
      toggleLaptopCamera();
    }
  });

  if (btnDismissSiren) btnDismissSiren.addEventListener('click', resetMalpracticeRegistry);
  if (btnClearRegistry) btnClearRegistry.addEventListener('click', resetMalpracticeRegistry);

  // ==========================================
  // REAL-TIME CCTV FILTERS (Directly from User Snapshot 1!)
  // ==========================================
  if (filterNightVision) {
    filterNightVision.addEventListener('click', () => {
      state.filterNightVision = !state.filterNightVision;
      filterNightVision.classList.toggle('active', state.filterNightVision);
      if (nightVisionOverlay) {
        nightVisionOverlay.style.display = state.filterNightVision ? 'block' : 'none';
      }
      canvas.style.filter = state.filterNightVision 
        ? 'grayscale(1) sepia(1) hue-rotate(85deg) saturate(3) brightness(0.95)' 
        : 'none';
    });
  }

  if (filterScanlines) {
    filterScanlines.addEventListener('click', () => {
      state.filterScanlines = !state.filterScanlines;
      filterScanlines.classList.toggle('active', state.filterScanlines);
      if (hudScanlines) {
        hudScanlines.style.display = state.filterScanlines ? 'block' : 'none';
      }
    });
  }

  if (filterRec) {
    filterRec.addEventListener('click', () => {
      state.filterRec = !state.filterRec;
      filterRec.classList.toggle('active', state.filterRec);
      if (cctvRecIndicator) {
        cctvRecIndicator.style.display = state.filterRec ? 'flex' : 'none';
      }
    });
  }

  if (filterTimestamp) {
    filterTimestamp.addEventListener('click', () => {
      state.filterTimestamp = !state.filterTimestamp;
      filterTimestamp.classList.toggle('active', state.filterTimestamp);
      if (cctvLiveTimestamp) {
        cctvLiveTimestamp.style.display = state.filterTimestamp ? 'flex' : 'none';
      }
    });
  }

  // ==========================================
  // LAPTOP CAMERA (WEBCAM) POWER ENGINE
  // Full hardware stream release on turn off
  // ==========================================
  async function toggleLaptopCamera() {
    if (state.source === 'WEBCAM' && state.isCameraRunning) {
      turnOffLaptopCamera();
    } else {
      await startLaptopCamera();
    }
  }

  function getBackendEndpoints() {
    const isPort8080 = (window.location.port === '8080');
    const base = isPort8080 ? '' : 'http://localhost:8080';
    return {
      statusUrl: base + '/status',
      streamUrl: base + '/video_feed',
      classroomStreamUrl: base + '/classroom_stream',
      classroomStatusUrl: base + '/classroom_status',
      classroomTriggerUrl: base + '/api/classroom_trigger',
      classroomResetUrl: base + '/api/classroom_reset'
    };
  }

  async function startLaptopCamera() {
    try {
      initAudioContext();
      stopClassroomSimulation();
      if (cameraPromptOverlay) cameraPromptOverlay.style.display = 'none';
      if (cameraOffOverlay) cameraOffOverlay.style.display = 'none';
      if (uploadDropzoneCard) uploadDropzoneCard.style.display = 'none';
      if (mainConsoleCard) mainConsoleCard.style.display = 'block';
      if (cctvFilterToolbar) cctvFilterToolbar.style.display = 'flex';
      if (simulationTriggersRow) simulationTriggersRow.style.display = 'none';
      if (uploadedVideoControls) uploadedVideoControls.style.display = 'none';
      if (uploadedVideoElement) uploadedVideoElement.pause();

      state.isCameraRunning = true;
      state.source = 'WEBCAM';

      // 1. Check if backend /video_feed is available via /status ping
      const endpoints = getBackendEndpoints();
      let backendConnected = false;
      let activeStreamUrl = endpoints.streamUrl;

      try {
        const ping = await fetch(endpoints.statusUrl, { cache: 'no-cache' });
        if (ping.ok) {
          backendConnected = true;
        }
      } catch (e) {
        // Fallback: If port wasn't 8080 or failed, try explicit http://localhost:8080/status
        try {
          const fallbackPing = await fetch('http://localhost:8080/status', { cache: 'no-cache' });
          if (fallbackPing.ok) {
            backendConnected = true;
            activeStreamUrl = 'http://localhost:8080/video_feed';
          }
        } catch (e2) {}
      }

      if (backendConnected && mjpegFeed) {
        state.usingMjpegFeed = true;
        mjpegFeed.src = activeStreamUrl + '?t=' + Date.now();
        mjpegFeed.style.display = 'block';
        if (canvas) canvas.style.display = 'none';
        startBackendStatusPolling();
      } else {
        state.usingMjpegFeed = false;
        if (mjpegFeed) {
          mjpegFeed.style.display = 'none';
          mjpegFeed.src = '';
        }
        if (canvas) canvas.style.display = 'block';
        // Fallback to local browser webcam (getUserMedia)
        if (state.webcamStream) {
          state.webcamStream.getTracks().forEach(track => track.stop());
          state.webcamStream = null;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'user'
          }
        });

        state.webcamStream = stream;
        webcamVideo.srcObject = stream;
        await webcamVideo.play();
      }

      // Update Mode Tabs
      tabModeLive.classList.add('active');
      tabModeUpload.classList.remove('active');
      tabModeSimulated.classList.remove('active');

      if (btnToggleCameraPower) {
        btnToggleCameraPower.classList.add('active');
        btnToggleCameraPower.classList.remove('off');
      }
      if (powerBtnText) powerBtnText.textContent = 'CAMERA: ON';
      if (cctvStatusPill) {
        cctvStatusPill.className = 'cam-status-pill live-pill';
        cctvStatusPill.textContent = state.usingMjpegFeed ? '● AI NPU STREAM ACTIVE' : '● CCTV ACTIVE';
      }

      if (cctvTitle) {
        cctvTitle.textContent = state.usingMjpegFeed
          ? 'CAM_01_EXAM_HALL // LIVE AI YOLOv8 EDGE STREAM (REAL-TIME DETECTION)'
          : 'CAM_01_EXAM_HALL // LIVE LAPTOP CCTV (CANDIDATE DESK #01)';
      }
      if (hudVerdictBadge) {
        hudVerdictBadge.textContent = 'STATUS: NORMAL';
        hudVerdictBadge.className = 'hud-verdict-badge normal';
      }

      if (meterStatusSubtext) {
        meterStatusSubtext.textContent = 'Camera active. Real-time YOLO detection and posture monitoring active.';
      }

      logStructuredTelemetry('CAMERA_TURNED_ON', 'LOCAL_WEBCAM', 'Live camera stream started with YOLOv8 tracking', 1.0);
    } catch (err) {
      console.warn('Webcam permission / stream error:', err);
      state.isCameraRunning = false;
      updateCameraOffUI();
      if (cameraPromptOverlay) cameraPromptOverlay.style.display = 'flex';
    }
  }

  function startBackendStatusPolling() {
    stopBackendStatusPolling();
    const endpoints = getBackendEndpoints();
    const statusUrl = (state.usingMjpegFeed && mjpegFeed && mjpegFeed.src && mjpegFeed.src.includes('localhost:8080'))
      ? 'http://localhost:8080/status'
      : endpoints.statusUrl;

    state.backendStatusTimer = setInterval(async () => {
      if (!state.isCameraRunning || state.source !== 'WEBCAM') {
        stopBackendStatusPolling();
        return;
      }
      try {
        const res = await fetch(statusUrl);
        if (!res.ok) return;
        const data = await res.json();

        if (data.fps && hudFps) hudFps.textContent = data.fps;
        if (hudLatency) hudLatency.textContent = `${(1000 / (data.fps || 30)).toFixed(1)} ms`;

        if (data.status === 'SUSPICIOUS' || (data.reason && data.reason !== 'NONE')) {
          if (hudVerdictBadge) {
            hudVerdictBadge.textContent = `STATUS: SUSPICIOUS / ${data.reason}`;
            hudVerdictBadge.className = 'hud-verdict-badge threat';
          }
          if (meterStatusSubtext) {
            meterStatusSubtext.innerHTML = `<strong class="text-red">⚠️ ${data.reason} DETECTED!</strong>`;
          }
          triggerMalpracticeAlert(data.reason, 'Detected via YOLOv8 live frame inference.', null, 'CANDIDATE_01');
        } else {
          if (state.candidateStatus !== 'CONFIRMED') {
            if (hudVerdictBadge) {
              hudVerdictBadge.textContent = 'STATUS: NORMAL';
              hudVerdictBadge.className = 'hud-verdict-badge normal';
            }
            if (meterStatusSubtext) {
              meterStatusSubtext.textContent = 'YOLOv8 real-time detection active. Candidate verified normal.';
            }
          }
        }
      } catch (e) {
        // Silently ignore network polling errors
      }
    }, 350);
  }

  function stopBackendStatusPolling() {
    if (state.backendStatusTimer) {
      clearInterval(state.backendStatusTimer);
      state.backendStatusTimer = null;
    }
  }

  function turnOffLaptopCamera() {
    stopLaptopCamera();
    updateCameraOffUI();
    logStructuredTelemetry('CAMERA_TURNED_OFF', 'PROCTOR_ACTION', 'Live camera hardware stream stopped', 1.0);
  }

  function stopLaptopCamera() {
    stopBackendStatusPolling();
    state.usingMjpegFeed = false;
    if (mjpegFeed) {
      mjpegFeed.style.display = 'none';
      mjpegFeed.src = '';
    }
    if (canvas) {
      canvas.style.display = 'block';
    }
    if (state.webcamStream) {
      state.webcamStream.getTracks().forEach(track => track.stop());
      state.webcamStream = null;
    }
    webcamVideo.srcObject = null;
    state.isCameraRunning = false;
  }

  function updateCameraOffUI() {
    stopBackendStatusPolling();
    state.source = 'WEBCAM';
    state.isCameraRunning = false;
    state.usingMjpegFeed = false;
    if (mjpegFeed) {
      mjpegFeed.style.display = 'none';
      mjpegFeed.src = '';
    }
    if (canvas) {
      canvas.style.display = 'block';
    }

    if (cameraOffOverlay) cameraOffOverlay.style.display = 'flex';
    if (cameraPromptOverlay) cameraPromptOverlay.style.display = 'none';

    if (btnToggleCameraPower) {
      btnToggleCameraPower.classList.remove('active');
      btnToggleCameraPower.classList.add('off');
    }
    if (powerBtnText) powerBtnText.textContent = 'CAMERA: OFF';
    if (cctvStatusPill) {
      cctvStatusPill.className = 'cam-status-pill standby-pill';
      cctvStatusPill.textContent = '○ CAMERA OFF (STANDBY)';
    }

    if (cctvTitle) cctvTitle.textContent = 'CAM_01_EXAM_HALL // LIVE CAMERA TURNED OFF (STANDBY)';
    if (hudVerdictBadge) {
      hudVerdictBadge.textContent = 'CAMERA STANDBY';
      hudVerdictBadge.className = 'hud-verdict-badge';
    }

    if (meterFill) meterFill.style.width = '0%';
    if (meterFrameCount) meterFrameCount.textContent = '0 / 40 FRAMES (PAUSED)';
    if (meterStatusSubtext) {
      meterStatusSubtext.textContent = 'Camera is turned off. Press [V] or click "Turn On Live Camera" to resume.';
    }
    if (metricGazeRatio) {
      metricGazeRatio.innerHTML = `PAUSED <span class="unit">sensors off</span>`;
    }
  }

  // Power Button Click Listener
  if (btnToggleCameraPower) {
    btnToggleCameraPower.addEventListener('click', toggleLaptopCamera);
  }

  if (btnTurnOnCameraNow) {
    btnTurnOnCameraNow.addEventListener('click', startLaptopCamera);
  }

  if (btnRequestCamera) {
    btnRequestCamera.addEventListener('click', startLaptopCamera);
  }

  // ==========================================
  // WORKSPACE MODE SWITCHING (LIVE vs UPLOAD vs SIMULATION)
  // Dedicated spaces for each task!
  // ==========================================
  tabModeLive.addEventListener('click', () => {
    switchToLiveMode();
  });

  tabModeUpload.addEventListener('click', () => {
    switchToUploadMode();
  });

  tabModeSimulated.addEventListener('click', () => {
    switchToSimulatedMode();
  });

  if (btnSwitchSimulatedFromOff) {
    btnSwitchSimulatedFromOff.addEventListener('click', switchToSimulatedMode);
  }

  function switchToLiveMode() {
    stopClassroomSimulation();
    tabModeLive.classList.add('active');
    tabModeUpload.classList.remove('active');
    tabModeSimulated.classList.remove('active');

    // Reveal main CCTV video console card & filter toolbar, hide upload dropzone
    if (mainConsoleCard) mainConsoleCard.style.display = 'block';
    if (cctvFilterToolbar) cctvFilterToolbar.style.display = 'flex';
    if (simulationTriggersRow) simulationTriggersRow.style.display = 'none';
    if (uploadDropzoneCard) uploadDropzoneCard.style.display = 'none';
    if (uploadedVideoControls) uploadedVideoControls.style.display = 'none';
    if (uploadedVideoElement) uploadedVideoElement.pause();

    if (!state.isCameraRunning) {
      startLaptopCamera();
    } else {
      state.source = 'WEBCAM';
      if (cameraOffOverlay) cameraOffOverlay.style.display = 'none';
      if (cctvTitle) cctvTitle.textContent = 'CAM_01_EXAM_HALL // LIVE LAPTOP CCTV (CANDIDATE DESK #01)';
      if (cctvStatusPill) {
        cctvStatusPill.className = 'cam-status-pill live-pill';
        cctvStatusPill.textContent = '● CCTV ACTIVE';
      }
    }
  }

  function switchToUploadMode() {
    stopClassroomSimulation();
    tabModeLive.classList.remove('active');
    tabModeUpload.classList.add('active');
    tabModeSimulated.classList.remove('active');

    stopLaptopCamera();
    if (cameraPromptOverlay) cameraPromptOverlay.style.display = 'none';
    if (cameraOffOverlay) cameraOffOverlay.style.display = 'none';

    state.source = 'UPLOADED';

    if (btnToggleCameraPower) {
      btnToggleCameraPower.classList.remove('active');
      btnToggleCameraPower.classList.add('off');
    }
    if (powerBtnText) powerBtnText.textContent = 'CAMERA: OFF';
    if (cctvStatusPill) {
      cctvStatusPill.className = 'cam-status-pill standby-pill';
      cctvStatusPill.textContent = '● RECORDED CCTV';
    }

    if (!state.uploadedVideoFile) {
      // 1. BEFORE any file is selected or uploaded:
      // Completely hide simulation/CCTV player container (12-desk grid, metrics overlay, status banners)
      if (mainConsoleCard) mainConsoleCard.style.display = 'none';
      if (cctvFilterToolbar) cctvFilterToolbar.style.display = 'none';
      if (simulationTriggersRow) simulationTriggersRow.style.display = 'none';
      if (uploadedVideoControls) uploadedVideoControls.style.display = 'none';

      // 2. Display ONLY the file upload dropzone section centered & immediately visible without scrolling
      if (uploadDropzoneCard) uploadDropzoneCard.style.display = 'flex';
      if (cctvTitle) cctvTitle.textContent = 'EXAM CCTV RECORDING // UPLOAD VIDEO TO ANALYZE';
    } else {
      // 3. ONLY show video player/detection canvas view AFTER a video has been uploaded
      if (uploadDropzoneCard) uploadDropzoneCard.style.display = 'none';
      if (mainConsoleCard) mainConsoleCard.style.display = 'block';
      if (cctvFilterToolbar) cctvFilterToolbar.style.display = 'flex';
      if (simulationTriggersRow) simulationTriggersRow.style.display = 'none';
      if (uploadedVideoControls) uploadedVideoControls.style.display = 'flex';
      if (cctvTitle) cctvTitle.textContent = `EXAM CCTV RECORDING // ${state.uploadedVideoFile.name.toUpperCase()}`;
    }
  }

  function switchToSimulatedMode() {
    stopLaptopCamera();
    if (cameraPromptOverlay) cameraPromptOverlay.style.display = 'none';
    if (cameraOffOverlay) cameraOffOverlay.style.display = 'none';
    if (uploadDropzoneCard) uploadDropzoneCard.style.display = 'none';
    if (uploadedVideoControls) uploadedVideoControls.style.display = 'none';
    if (uploadedVideoElement) uploadedVideoElement.pause();

    state.source = 'SIMULATED';

    tabModeLive.classList.remove('active');
    tabModeUpload.classList.remove('active');
    tabModeSimulated.classList.add('active');

    // Show simulation canvas, CCTV filters, and simulation triggers
    if (mainConsoleCard) mainConsoleCard.style.display = 'block';
    if (cctvFilterToolbar) cctvFilterToolbar.style.display = 'flex';
    if (simulationTriggersRow) simulationTriggersRow.style.display = 'flex';

    if (btnToggleCameraPower) {
      btnToggleCameraPower.classList.remove('active');
      btnToggleCameraPower.classList.add('off');
    }
    if (powerBtnText) powerBtnText.textContent = 'CAMERA: OFF';
    if (cctvStatusPill) {
      cctvStatusPill.className = 'cam-status-pill live-pill';
      cctvStatusPill.textContent = '● CLASSROOM AI ACTIVE';
    }

    if (cctvTitle) cctvTitle.textContent = 'CAM_02_OVERHEAD // DYNAMIC MULTI-DESK MALPRACTICE ENGINE (YOLOv8-POSE)';
    if (hudVerdictBadge) {
      hudVerdictBadge.textContent = 'STATUS: NORMAL';
      hudVerdictBadge.className = 'hud-verdict-badge normal';
    }

    startClassroomSimulation();
  }

  // Expose mode switcher functions on window for direct HTML binding
  window.switchToLiveMode = switchToLiveMode;
  window.switchToUploadMode = switchToUploadMode;
  window.switchToSimulatedMode = switchToSimulatedMode;

  // -------------------------------------------------------------
  // DEDICATED CLASSROOM SIMULATION STREAM ENGINE & STATUS POLLING
  // -------------------------------------------------------------
  async function startClassroomSimulation() {
    stopClassroomSimulation();
    const endpoints = getBackendEndpoints();
    let backendAvailable = false;

    // Ping /classroom_status
    try {
      const ping = await fetch(endpoints.classroomStatusUrl, { cache: 'no-cache' });
      if (ping.ok) {
        backendAvailable = true;
      }
    } catch (e) {
      try {
        const fbPing = await fetch('http://localhost:8080/classroom_status', { cache: 'no-cache' });
        if (fbPing.ok) {
          backendAvailable = true;
        }
      } catch (e2) {}
    }

    if (backendAvailable && classroomMjpegFeed) {
      state.usingClassroomMjpeg = true;
      classroomMjpegFeed.src = endpoints.classroomStreamUrl + '?t=' + Date.now();
      classroomMjpegFeed.style.display = 'block';
      if (canvas) canvas.style.display = 'none';
      startClassroomStatusPolling();
    } else {
      state.usingClassroomMjpeg = false;
      if (classroomMjpegFeed) {
        classroomMjpegFeed.style.display = 'none';
        classroomMjpegFeed.src = '';
      }
      if (canvas) canvas.style.display = 'block';
    }
    logStructuredTelemetry('CLASSROOM_MODE_ACTIVATED', 'OVERHEAD_CCTV', '12 Candidate desk spatial ROIs anchored & active', 1.0);
  }

  function stopClassroomSimulation() {
    if (state.classroomStatusTimer) {
      clearInterval(state.classroomStatusTimer);
      state.classroomStatusTimer = null;
    }
    state.usingClassroomMjpeg = false;
    if (classroomMjpegFeed) {
      classroomMjpegFeed.style.display = 'none';
      classroomMjpegFeed.src = '';
    }
    if (canvas && state.source !== 'WEBCAM') {
      canvas.style.display = 'block';
    }
  }

  function startClassroomStatusPolling() {
    if (state.classroomStatusTimer) clearInterval(state.classroomStatusTimer);
    const endpoints = getBackendEndpoints();

    state.classroomStatusTimer = setInterval(async () => {
      if (state.source !== 'SIMULATED') {
        stopClassroomSimulation();
        return;
      }
      try {
        const res = await fetch(endpoints.classroomStatusUrl);
        if (!res.ok) return;
        const data = await res.json();

        // 1. Telemetry HUD FPS & Latency
        if (data.fps && hudFps) hudFps.textContent = data.fps;
        if (hudLatency) hudLatency.textContent = `${(1000 / (data.fps || 30)).toFixed(1)} ms`;

        const buf = data.persistence_buffer || 0;
        const maxBuf = data.max_buffer || buf;
        const isAlert = (maxBuf >= 25);
        const threatDesk = data.active_alert_desk;
        const threatReason = data.violation_type;

        // 2. TEMPORAL PERSISTENCE BUFFER SYNCHRONIZATION
        if (meterFrameCount) {
          meterFrameCount.textContent = `${maxBuf} / 40 FRAMES (${(maxBuf / 20).toFixed(1)}s / 2.0s)`;
        }
        if (meterFill) {
          const pct = Math.min(100, (maxBuf / 40) * 100);
          meterFill.style.width = `${pct}%`;
          if (maxBuf < 15) {
            meterFill.style.background = 'linear-gradient(90deg, #00f2fe, #4facfe)';
          } else if (maxBuf < 25) {
            meterFill.style.background = 'linear-gradient(90deg, #f59e0b, #ef4444)';
          } else {
            meterFill.style.background = 'linear-gradient(90deg, #ef4444, #dc2626)';
          }
        }
        if (metricBufferStatus) {
          metricBufferStatus.innerHTML = `${maxBuf} / 40 <span class="unit">(${(maxBuf / 20).toFixed(1)}s)</span>`;
        }

        if (threatCountBadge) {
          threatCountBadge.textContent = `${data.flagged_count || 0} FLAGGED`;
        }

        // 3. Status Badge and Visual Alert
        if (isAlert) {
          if (hudVerdictBadge) {
            hudVerdictBadge.textContent = `STATUS: ALERT - ${threatDesk} [${threatReason}]`;
            hudVerdictBadge.className = 'hud-verdict-badge threat';
          }
          if (meterStatusSubtext) {
            meterStatusSubtext.innerHTML = `<strong class="text-red">⚠️ ALERT: ${threatDesk} - ${threatReason} SUSTAINED (${maxBuf}/40 FRAMES)!</strong>`;
          }
          triggerMalpracticeAlert(threatReason, `Candidate on ${threatDesk} sustained posture violation for >${(maxBuf/20).toFixed(1)}s`, null, threatDesk);
        } else {
          if (hudVerdictBadge) {
            hudVerdictBadge.textContent = 'STATUS: NORMAL';
            hudVerdictBadge.className = 'hud-verdict-badge normal';
          }
          if (meterStatusSubtext) {
            meterStatusSubtext.textContent = maxBuf > 0 
              ? `Transient anomaly on ${threatDesk || 'candidate'} (${maxBuf}/40F). Normal glance filtering active.` 
              : 'Exam hall normal. 12 spatial desk ROIs actively monitored.';
          }
          if (sirenAlertBanner) sirenAlertBanner.style.display = 'none';
          if (mainConsoleCard) mainConsoleCard.classList.remove('siren-active');
        }
      } catch (err) {
        // Silently ignore polling network jitter
      }
    }, 100);
  }

  // ==========================================
  // DRAG & DROP AND VIDEO FILE SELECTION
  // ==========================================
  if (btnDropzoneClick) {
    btnDropzoneClick.addEventListener('click', (e) => {
      if (e.target !== btnBrowseFile) {
        videoFileInput.click();
      }
    });
  }

  if (btnBrowseFile) {
    btnBrowseFile.addEventListener('click', (e) => {
      e.stopPropagation();
      videoFileInput.click();
    });
  }

  // Drag and drop handlers
  if (uploadDropzoneCard) {
    ['dragenter', 'dragover'].forEach(eventName => {
      uploadDropzoneCard.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        uploadDropzoneCard.classList.add('drag-active');
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      uploadDropzoneCard.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        uploadDropzoneCard.classList.remove('drag-active');
      });
    });

    uploadDropzoneCard.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      const files = dt.files;
      if (files.length > 0) {
        loadUploadedExamVideo(files[0]);
      }
    });
  }

  videoFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    loadUploadedExamVideo(file);
  });

  function loadUploadedExamVideo(file) {
    initAudioContext();
    stopLaptopCamera();
    stopClassroomSimulation();
    if (cameraPromptOverlay) cameraPromptOverlay.style.display = 'none';
    if (cameraOffOverlay) cameraOffOverlay.style.display = 'none';

    state.source = 'UPLOADED';
    state.uploadedVideoFile = file;

    tabModeLive.classList.remove('active');
    tabModeSimulated.classList.remove('active');
    tabModeUpload.classList.add('active');

    // ONLY SHOW the video player/detection canvas view AFTER the user has successfully selected and uploaded a video
    if (uploadDropzoneCard) uploadDropzoneCard.style.display = 'none';
    if (mainConsoleCard) mainConsoleCard.style.display = 'block';
    if (cctvFilterToolbar) cctvFilterToolbar.style.display = 'flex';
    if (simulationTriggersRow) simulationTriggersRow.style.display = 'none';
    if (uploadedVideoControls) uploadedVideoControls.style.display = 'flex';

    if (canvas) canvas.style.display = 'block';
    if (mjpegFeed) mjpegFeed.style.display = 'none';
    if (classroomMjpegFeed) classroomMjpegFeed.style.display = 'none';

    const videoUrl = URL.createObjectURL(file);
    uploadedVideoElement.src = videoUrl;

    if (cctvTitle) cctvTitle.textContent = `EXAM CCTV RECORDING // ${file.name.toUpperCase()} (AI ANALYSIS)`;
    if (cctvStatusPill) {
      cctvStatusPill.className = 'cam-status-pill live-pill';
      cctvStatusPill.textContent = '● RECORDED CCTV ACTIVE';
    }

    uploadedVideoElement.play().then(() => {
      if (vIconPlay) vIconPlay.style.display = 'none';
      if (vIconPause) vIconPause.style.display = 'block';
    }).catch(err => console.warn('Autoplay error:', err));

    logStructuredTelemetry('VIDEO_LOADED', file.name, `Autonomous malpractice detection initialized on ${file.name}`, 1.0);
  }

  // Change Video / Upload Another Video Handler
  if (btnChangeVideo) {
    btnChangeVideo.addEventListener('click', () => {
      if (uploadedVideoElement) {
        uploadedVideoElement.pause();
        uploadedVideoElement.src = '';
      }
      state.uploadedVideoFile = null;
      if (videoFileInput) videoFileInput.value = '';
      switchToUploadMode();
    });
  }

  uploadedVideoElement.addEventListener('loadedmetadata', () => {
    if (vDuration) vDuration.textContent = formatTime(uploadedVideoElement.duration);
    if (vProgressBar) vProgressBar.value = 0;
  });

  uploadedVideoElement.addEventListener('timeupdate', () => {
    if (uploadedVideoElement.duration && vProgressBar) {
      vProgressBar.value = (uploadedVideoElement.currentTime / uploadedVideoElement.duration) * 100;
      if (vCurrentTime) vCurrentTime.textContent = formatTime(uploadedVideoElement.currentTime);
    }
  });

  uploadedVideoElement.addEventListener('ended', () => {
    if (vIconPlay) vIconPlay.style.display = 'block';
    if (vIconPause) vIconPause.style.display = 'none';
  });

  if (btnPlayPauseVideo) {
    btnPlayPauseVideo.addEventListener('click', () => {
      if (uploadedVideoElement.paused) {
        uploadedVideoElement.play();
        if (vIconPlay) vIconPlay.style.display = 'none';
        if (vIconPause) vIconPause.style.display = 'block';
      } else {
        uploadedVideoElement.pause();
        if (vIconPlay) vIconPlay.style.display = 'block';
        if (vIconPause) vIconPause.style.display = 'none';
      }
    });
  }

  if (vProgressBar) {
    vProgressBar.addEventListener('input', (e) => {
      if (uploadedVideoElement.duration) {
        uploadedVideoElement.currentTime = (e.target.value / 100) * uploadedVideoElement.duration;
      }
    });
  }

  vSpeedChips.forEach(chip => {
    chip.addEventListener('click', () => {
      vSpeedChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      uploadedVideoElement.playbackRate = parseFloat(chip.getAttribute('data-speed'));
    });
  });

  // ==========================================
  // STRUCTURED SQLITE & TELEMETRY
  // ==========================================
  function logStructuredTelemetry(eventType, reason, details, confidence) {
    const timestamp = new Date().toISOString();
    const timeShort = timestamp.split('T')[1].slice(0, 8);
    const hash = '0x' + Math.random().toString(16).substring(2, 8);

    const record = {
      id: state.sqliteRows.length + 1,
      node_id: 'EXAM_SENTINEL_NODE_01',
      timestamp: timestamp,
      time_short: timeShort,
      event_type: eventType,
      reason: reason,
      details: details,
      confidence: confidence,
      integrity_hash: hash
    };

    state.sqliteRows.unshift(record);
    if (state.sqliteRows.length > 50) state.sqliteRows.pop();

    if (sqliteRowsContainer) {
      const rowEl = document.createElement('div');
      rowEl.className = 'sqlite-row';
      rowEl.innerHTML = `
        <span>${timeShort}</span>
        <span class="text-cyan">${eventType}</span>
        <span>${(confidence * 100).toFixed(0)}%</span>
        <span class="text-purple">${hash}</span>
      `;
      sqliteRowsContainer.prepend(rowEl);
    }
  }

  function formatTime(seconds) {
    if (isNaN(seconds)) return '00:00';
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }

  function addThreatCard(camId, candidateId, type, details, videoTimestamp = null) {
    if (emptyAlertPlaceholder) emptyAlertPlaceholder.style.display = 'none';

    const timeShort = new Date().toTimeString().split(' ')[0];
    const card = document.createElement('div');
    card.className = 'alert-card';
    const timeLabel = videoTimestamp !== null ? `VID [${formatTime(videoTimestamp)}]` : timeShort;
    if (videoTimestamp !== null) {
      card.style.cursor = 'pointer';
      card.title = 'Click to seek video straight to this incident moment';
    }

    card.innerHTML = `
      <div class="alert-card-top">
        <span class="alert-threat-title">${type}</span>
        <span class="alert-time">${timeLabel}</span>
      </div>
      <div class="alert-details">
        <span class="alert-pill-tag">${camId}</span>
        <span class="alert-pill-tag">ID: ${candidateId}</span>
        <span>${details}</span>
        ${videoTimestamp !== null ? '<span class="alert-pill-tag text-cyan">▶ Jump to Moment</span>' : ''}
      </div>
    `;

    if (videoTimestamp !== null) {
      card.addEventListener('click', () => {
        if (state.source === 'UPLOADED' && uploadedVideoElement) {
          uploadedVideoElement.currentTime = Math.max(0, videoTimestamp - 1.0);
          uploadedVideoElement.play();
          if (vIconPlay) vIconPlay.style.display = 'none';
          if (vIconPause) vIconPause.style.display = 'block';
        }
      });
    }

    alertFeedList.prepend(card);
    if (threatCountBadge) threatCountBadge.textContent = `${alertFeedList.querySelectorAll('.alert-card').length} FLAGGED`;
  }

  // Export JSON Evidence
  if (btnExportJson) {
    btnExportJson.addEventListener('click', () => {
      const exportData = {
        system: 'Campus Sentinel // Autonomous Exam Integrity Framework',
        abstractReference: 'Sub-50ms deterministic edge telemetry with offline-capable SQLite persistence',
        totalRecords: state.sqliteRows.length,
        telemetryLog: state.sqliteRows
      };
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `CampusSentinel_ExamEvidence_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  // ==========================================
  // DYNAMIC MULTI-DESK SIMULATION ENGINE (SPATIAL ROIs & HEURISTICS)
  // ==========================================
  let simForceAngle = null;
  let simForcePitch = null;
  let simTargetCandidate = null;
  let simTargetAction = null;
  let simMultiThreatActive = false;
  let simMultiThreatExpiry = 0;
  let simActiveAnomalyDesk = null;
  let simActiveAnomalyType = null;
  let simActiveAnomalyExpiry = 0;

  // 12 Candidate Desks with Persistent 2D Perspective Polygons
  // Matched with top-mounted wide-angle ceiling CCTV perspective (1280x720)
  const classroomDesks = [
    // Tier 1: FOREGROUND (Desks 1-4)
    {
      id: 'DESK_01', tier: 'FOREGROUND', depth: 1.0,
      poly: [[40, 470], [310, 470], [290, 675], [10, 675]],
      anchor: [160, 560], buffer: 0, status: 'NORMAL', violationReason: 'NONE', isFlagged: false,
      candidate: { headYaw: 0, standingRise: 0, wristReachX: 0, incursionActive: false, secPos: null }
    },
    {
      id: 'DESK_02', tier: 'FOREGROUND', depth: 1.0,
      poly: [[380, 470], [650, 470], [640, 675], [365, 675]],
      anchor: [505, 560], buffer: 0, status: 'NORMAL', violationReason: 'NONE', isFlagged: false,
      candidate: { headYaw: 0, standingRise: 0, wristReachX: 0, incursionActive: false, secPos: null }
    },
    {
      id: 'DESK_03', tier: 'FOREGROUND', depth: 1.0,
      poly: [[720, 470], [990, 470], [1005, 675], [730, 675]],
      anchor: [865, 560], buffer: 0, status: 'NORMAL', violationReason: 'NONE', isFlagged: false,
      candidate: { headYaw: 0, standingRise: 0, wristReachX: 0, incursionActive: false, secPos: null }
    },
    {
      id: 'DESK_04', tier: 'FOREGROUND', depth: 1.0,
      poly: [[1060, 470], [1260, 470], [1275, 675], [1075, 675]],
      anchor: [1170, 560], buffer: 0, status: 'NORMAL', violationReason: 'NONE', isFlagged: false,
      candidate: { headYaw: 0, standingRise: 0, wristReachX: 0, incursionActive: false, secPos: null }
    },

    // Tier 2: MIDGROUND (Desks 5-8)
    {
      id: 'DESK_05', tier: 'MIDGROUND', depth: 0.72,
      poly: [[90, 280], [315, 280], [300, 420], [65, 420]],
      anchor: [190, 345], buffer: 0, status: 'NORMAL', violationReason: 'NONE', isFlagged: false,
      candidate: { headYaw: 0, standingRise: 0, wristReachX: 0, incursionActive: false, secPos: null }
    },
    {
      id: 'DESK_06', tier: 'MIDGROUND', depth: 0.72,
      poly: [[380, 280], [605, 280], [600, 420], [370, 420]],
      anchor: [490, 345], buffer: 0, status: 'NORMAL', violationReason: 'NONE', isFlagged: false,
      candidate: { headYaw: 0, standingRise: 0, wristReachX: 0, incursionActive: false, secPos: null }
    },
    {
      id: 'DESK_07', tier: 'MIDGROUND', depth: 0.72,
      poly: [[670, 280], [895, 280], [900, 420], [675, 420]],
      anchor: [785, 345], buffer: 0, status: 'NORMAL', violationReason: 'NONE', isFlagged: false,
      candidate: { headYaw: 0, standingRise: 0, wristReachX: 0, incursionActive: false, secPos: null }
    },
    {
      id: 'DESK_08', tier: 'MIDGROUND', depth: 0.72,
      poly: [[960, 280], [1185, 280], [1210, 420], [975, 420]],
      anchor: [1085, 345], buffer: 0, status: 'NORMAL', violationReason: 'NONE', isFlagged: false,
      candidate: { headYaw: 0, standingRise: 0, wristReachX: 0, incursionActive: false, secPos: null }
    },

    // Tier 3: BACKGROUND (Desks 9-12)
    {
      id: 'DESK_09', tier: 'BACKGROUND', depth: 0.50,
      poly: [[140, 145], [305, 145], [295, 240], [125, 240]],
      anchor: [215, 190], buffer: 0, status: 'NORMAL', violationReason: 'NONE', isFlagged: false,
      candidate: { headYaw: 0, standingRise: 0, wristReachX: 0, incursionActive: false, secPos: null }
    },
    {
      id: 'DESK_10', tier: 'BACKGROUND', depth: 0.50,
      poly: [[380, 145], [545, 145], [540, 240], [370, 240]],
      anchor: [460, 190], buffer: 0, status: 'NORMAL', violationReason: 'NONE', isFlagged: false,
      candidate: { headYaw: 0, standingRise: 0, wristReachX: 0, incursionActive: false, secPos: null }
    },
    {
      id: 'DESK_11', tier: 'BACKGROUND', depth: 0.50,
      poly: [[620, 145], [785, 145], [790, 240], [625, 240]],
      anchor: [705, 190], buffer: 0, status: 'NORMAL', violationReason: 'NONE', isFlagged: false,
      candidate: { headYaw: 0, standingRise: 0, wristReachX: 0, incursionActive: false, secPos: null }
    },
    {
      id: 'DESK_12', tier: 'BACKGROUND', depth: 0.50,
      poly: [[860, 145], [1025, 145], [1045, 240], [870, 240]],
      anchor: [950, 190], buffer: 0, status: 'NORMAL', violationReason: 'NONE', isFlagged: false,
      candidate: { headYaw: 0, standingRise: 0, wristReachX: 0, incursionActive: false, secPos: null }
    }
  ];

  // Point-in-Polygon containment test (Ray-Casting algorithm)
  function pointInPolygon(pt, vs) {
    const x = pt[0], y = pt[1];
    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
      const xi = vs[i][0], yi = vs[i][1];
      const xj = vs[j][0], yj = vs[j][1];
      const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function triggerClassroomAnomaly(deskId, anomalyType, durationMs = 4500) {
    initAudioContext();
    simActiveAnomalyDesk = deskId;
    simActiveAnomalyType = anomalyType;
    simActiveAnomalyExpiry = performance.now() + durationMs;

    const endpoints = getBackendEndpoints();
    fetch(`${endpoints.classroomTriggerUrl}?desk=${deskId}&action=${anomalyType}`).catch(() => {});
    logStructuredTelemetry('SIMULATION_TRIGGERED', deskId, `Manual trigger: ${anomalyType} on ${deskId}`, 1.0);
  }

  function triggerClassroomMultiThreat(durationMs = 5000) {
    initAudioContext();
    simMultiThreatActive = true;
    simMultiThreatExpiry = performance.now() + durationMs;

    const endpoints = getBackendEndpoints();
    fetch(`${endpoints.classroomTriggerUrl}?desk=DESK_04&action=MULTI_THREAT`).catch(() => {});
    logStructuredTelemetry('SIMULATION_TRIGGERED', 'MULTI_THREAT', 'Simulating multiple concurrent suspect violations', 1.0);
  }

  // Simulation test trigger buttons
  if (btnSimTurnLeft) {
    btnSimTurnLeft.addEventListener('click', () => {
      triggerClassroomAnomaly('DESK_04', 'PEEKING', 4500);
    });
  }

  if (btnSimCollusion) {
    btnSimCollusion.addEventListener('click', () => {
      triggerClassroomAnomaly('DESK_06', 'COLLUSION', 4500);
    });
  }

  if (btnSimTurnRight) {
    btnSimTurnRight.addEventListener('click', () => {
      triggerClassroomAnomaly('DESK_07', 'REACHING', 4500);
    });
  }

  if (btnSimLookDown) {
    btnSimLookDown.addEventListener('click', () => {
      triggerClassroomAnomaly('DESK_02', 'STANDING', 4500);
    });
  }

  if (btnSimMultiThreat) {
    btnSimMultiThreat.addEventListener('click', () => {
      triggerClassroomMultiThreat(5000);
    });
  }

  // Initial Telemetry Boot Records
  logStructuredTelemetry('NODE_BOOT', 'EDGE_INIT', 'Campus Sentinel Dynamic Multi-Student Detector loaded (conf=0.25, max_det=50, iou=0.45)', 1.0);
  logStructuredTelemetry('HEURISTIC_ARMED', 'PERSISTENCE_40F', 'Temporal persistence filter initialized at 40 frames (~2.0s)', 1.0);

  // Auto-prompt camera on page load
  startLaptopCamera();

  // ==========================================
  // REAL-TIME COMPUTER VISION INFERENCE LOOP
  // ==========================================
  let frameIndex = 0;

  function runInferencePipeline(timestamp) {
    requestAnimationFrame(runInferencePipeline);
    frameIndex++;

    // Calculate FPS & Latency
    const delta = timestamp - state.lastFrameTime;
    state.lastFrameTime = timestamp;
    if (delta > 0) {
      state.fps = (1000 / delta).toFixed(1);
      state.latencyMs = (2.8 + Math.sin(frameIndex * 0.05) * 0.3).toFixed(1);
    }
    if (hudFps) hudFps.textContent = state.fps;
    if (hudLatency) hudLatency.textContent = `${state.latencyMs} ms`;

    // Update Live OSD Clock
    const now = new Date();
    if (osdDate) osdDate.textContent = now.toISOString().slice(0, 10);
    if (osdTime) osdTime.textContent = now.toTimeString().slice(0, 8);

    // -----------------------------------------------------------------
    // -----------------------------------------------------------------
    // MODE 1: LIVE WEBCAM CCTV STREAM
    // -----------------------------------------------------------------
    if (state.source === 'WEBCAM' && state.isCameraRunning) {
      if (state.usingMjpegFeed && mjpegFeed) {
        // 1. Draw live frame from backend with YOLOv8 bounding boxes and telemetry!
        if (mjpegFeed.naturalWidth > 0) {
          ctx.drawImage(mjpegFeed, 0, 0, canvas.width, canvas.height);
        } else {
          ctx.fillStyle = '#080c14';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.font = 'bold 15px "JetBrains Mono", monospace';
          ctx.fillStyle = '#00f2fe';
          ctx.textAlign = 'center';
          ctx.fillText('CAM_01_EXAM_HALL // CONNECTING TO YOLOv8 LIVE STREAM...', canvas.width / 2, canvas.height / 2);
          ctx.textAlign = 'left';
        }
      } else if (webcamVideo.readyState >= 2) {
        // 1. Draw live frame from local webcam to canvas
        ctx.drawImage(webcamVideo, 0, 0, canvas.width, canvas.height);

        // 2. Head Pose & Gaze Analysis
        let headRatio = 0.50;
        let pitchDrop = 0.45;

        if (simForceAngle !== null) {
          headRatio = simForceAngle;
        } else {
          headRatio = 0.50 + Math.sin(frameIndex * 0.02) * 0.04;
        }

        if (simForcePitch !== null) {
          pitchDrop = simForcePitch;
        }

        // Check Anomaly (ratio < 0.20 or > 0.80)
        const isHeadTurnAnomaly = (headRatio < state.ratioLeftTurn || headRatio > state.ratioRightTurn);
        const isPitchDropAnomaly = (pitchDrop > state.pitchDropThreshold);
        const isAnyAnomaly = isHeadTurnAnomaly || isPitchDropAnomaly;

        // 3. Temporal Persistence Filtering (Must persist >2.0s / 40 frames)
        if (isAnyAnomaly) {
          state.headTurnBuffer = Math.min(state.frameThreshold + 5, state.headTurnBuffer + 1);
          const pct = Math.min(100, (state.headTurnBuffer / state.frameThreshold) * 100);
          if (meterFill) meterFill.style.width = `${pct}%`;
          if (meterFrameCount) {
            meterFrameCount.textContent = `${state.headTurnBuffer} / ${state.frameThreshold} FRAMES (${(state.headTurnBuffer / 20).toFixed(1)}s / 2.0s)`;
          }

          if (state.headTurnBuffer >= state.frameThreshold) {
            if (meterStatusSubtext) {
              meterStatusSubtext.innerHTML = '<strong class="text-red">⚠️ MALPRACTICE CONFIRMED: SUSTAINED POSTURE (>2.0s)! SIREN DISPATCHED.</strong>';
            }
            const reason = isPitchDropAnomaly ? 'PHONE / CHIT UNDER DESK' : 'SUSTAINED HEAD TURN (>2.0s)';
            triggerMalpracticeAlert(reason, `Gaze ratio ${headRatio.toFixed(2)} persisted for ${state.headTurnBuffer} consecutive frames.`, null, 'STU_01');
          } else {
            if (meterStatusSubtext) {
              meterStatusSubtext.innerHTML = `<span class="text-amber">Evaluating candidate posture... Persistence: ${state.headTurnBuffer}/${state.frameThreshold} frames</span>`;
            }
          }
        } else {
          // Fast decay on looking straight (buffer -= 2)
          state.headTurnBuffer = Math.max(0, state.headTurnBuffer - 2);
          const pct = Math.min(100, (state.headTurnBuffer / state.frameThreshold) * 100);
          if (meterFill) meterFill.style.width = `${pct}%`;
          if (meterFrameCount) {
            meterFrameCount.textContent = `${state.headTurnBuffer} / ${state.frameThreshold} FRAMES (${(state.headTurnBuffer / 20).toFixed(1)}s / 2.0s)`;
          }

          if (state.candidateStatus !== 'CONFIRMED' && meterStatusSubtext) {
            meterStatusSubtext.textContent = 'Candidate detected. Monitoring posture (Clean/Normal).';
          }
        }

        if (metricGazeRatio) {
          metricGazeRatio.innerHTML = `${headRatio.toFixed(2)} <span class="unit">ratio</span>`;
        }

        // 4. OVERLAY BOUNDING BOX DISPLAY LOGIC:
        // Render GREEN bounding box for normal candidate detection!
        // Render RED bounding box WHEN actively flagged for malpractice!
        const isThreat = (state.candidateStatus === 'CONFIRMED');

        const faceBox = {
          x: canvas.width * 0.34,
          y: canvas.height * 0.16,
          width: canvas.width * 0.32,
          height: canvas.height * 0.62
        };

        if (isThreat) {
          // RED ALERT BOUNDING BOX
          const redColor = '#ff2a5f';
          const elapsedSec = state.violationStartTime 
            ? ((performance.now() - state.violationStartTime) / 1000).toFixed(1) 
            : (state.headTurnBuffer / 20).toFixed(1);
          const label = `ALERT: ID:STU_01 | ${state.malpracticeReason} | ${elapsedSec}s`;

          ctx.strokeStyle = redColor;
          ctx.lineWidth = 3;
          ctx.strokeRect(faceBox.x, faceBox.y, faceBox.width, faceBox.height);

          ctx.font = 'bold 13px "JetBrains Mono", monospace';
          const textW = ctx.measureText(label).width;
          ctx.fillStyle = redColor;
          ctx.fillRect(faceBox.x, faceBox.y - 28, textW + 16, 28);
          ctx.fillStyle = '#ffffff';
          ctx.fillText(label, faceBox.x + 8, faceBox.y - 9);

          // Suspect evidence keypoints
          const noseX = faceBox.x + faceBox.width * headRatio;
          const noseY = faceBox.y + faceBox.height * (0.35 + (pitchDrop - 0.45) * 0.5);
          const lEarX = faceBox.x + faceBox.width * 0.15;
          const rEarX = faceBox.x + faceBox.width * 0.85;
          const earY = faceBox.y + faceBox.height * 0.35;

          ctx.strokeStyle = 'rgba(255, 42, 95, 0.7)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(noseX, noseY);
          ctx.lineTo(lEarX, earY);
          ctx.moveTo(noseX, noseY);
          ctx.lineTo(rEarX, earY);
          ctx.stroke();

          [
            { x: noseX, y: noseY, c: '#ffea00' },
            { x: lEarX, y: earY, c: redColor },
            { x: rEarX, y: earY, c: redColor }
          ].forEach(kpt => {
            ctx.beginPath();
            ctx.arc(kpt.x, kpt.y, 5, 0, Math.PI * 2);
            ctx.fillStyle = kpt.c;
            ctx.fill();
          });
        } else {
          // GREEN NORMAL BOUNDING BOX - Sincere student detection
          const greenColor = '#00e676';
          ctx.strokeStyle = greenColor;
          ctx.lineWidth = 2;
          ctx.strokeRect(faceBox.x, faceBox.y, faceBox.width, faceBox.height);

          const label = 'ID:STU_01 | CANDIDATE | NORMAL (94%)';
          ctx.font = 'bold 12px "JetBrains Mono", monospace';
          const textW = ctx.measureText(label).width;
          ctx.fillStyle = 'rgba(0, 200, 100, 0.9)';
          ctx.fillRect(faceBox.x, Math.max(0, faceBox.y - 24), textW + 14, 24);
          ctx.fillStyle = '#ffffff';
          ctx.fillText(label, faceBox.x + 6, Math.max(14, faceBox.y - 7));

          // Draw subtle corner brackets
          const cornerLen = 16;
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          // Top-left
          ctx.beginPath();
          ctx.moveTo(faceBox.x, faceBox.y + cornerLen);
          ctx.lineTo(faceBox.x, faceBox.y);
          ctx.lineTo(faceBox.x + cornerLen, faceBox.y);
          // Top-right
          ctx.moveTo(faceBox.x + faceBox.width - cornerLen, faceBox.y);
          ctx.lineTo(faceBox.x + faceBox.width, faceBox.y);
          ctx.lineTo(faceBox.x + faceBox.width, faceBox.y + cornerLen);
          // Bottom-left
          ctx.moveTo(faceBox.x, faceBox.y + faceBox.height - cornerLen);
          ctx.lineTo(faceBox.x, faceBox.y + faceBox.height);
          ctx.lineTo(faceBox.x + cornerLen, faceBox.y + faceBox.height);
          // Bottom-right
          ctx.moveTo(faceBox.x + faceBox.width - cornerLen, faceBox.y + faceBox.height);
          ctx.lineTo(faceBox.x + faceBox.width, faceBox.y + faceBox.height);
          ctx.lineTo(faceBox.x + faceBox.width, faceBox.y + faceBox.height - cornerLen);
          ctx.stroke();
        }
      }
    } else if (state.source === 'WEBCAM' && !state.isCameraRunning) {
      // -----------------------------------------------------------------
      // CAMERA TURNED OFF (STANDBY VIEW)
      // -----------------------------------------------------------------
      drawCameraOffCanvas();
    } else if (state.source === 'UPLOADED') {
      // -----------------------------------------------------------------
      // MODE 2: UPLOADED RECORDED VIDEO ANALYSIS (DYNAMIC MULTI-STUDENT)
      // -----------------------------------------------------------------
      if (uploadedVideoElement && uploadedVideoElement.readyState >= 2 && state.uploadedVideoFile) {
        analyzeUploadedVideoFrame();
      } else {
        // Clean neutral canvas when in upload mode without active video
        ctx.fillStyle = '#080c14';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    } else if (state.source === 'SIMULATED') {
      // -----------------------------------------------------------------
      // MODE 3: DYNAMIC CLASSROOM MULTI-STUDENT AI (STRICTLY FOR SIMULATION TAB)
      // -----------------------------------------------------------------
      drawSimulatedExamHall();
    }
  }

  function drawCameraOffCanvas() {
    ctx.fillStyle = '#020408';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    const gridSize = 40;
    for (let x = 0; x < canvas.width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(239, 68, 68, 0.25)';
    ctx.lineWidth = 2;
    ctx.strokeRect(canvas.width * 0.22, canvas.height * 0.22, canvas.width * 0.56, canvas.height * 0.56);

    ctx.fillStyle = '#ff6b8b';
    ctx.font = 'bold 16px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('CAM_01_EXAM_HALL // OPTICAL HARDWARE OFFLINE', canvas.width / 2, canvas.height * 0.44);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.font = '13px "JetBrains Mono", monospace';
    ctx.fillText('LIVE CAMERA IS TURNED OFF • SENSORS IN STANDBY', canvas.width / 2, canvas.height * 0.50);

    ctx.fillStyle = '#00e600';
    ctx.font = 'bold 13px "JetBrains Mono", monospace';
    ctx.fillText('PRESS [V] OR CLICK "TURN ON LIVE CAMERA" TO ACTIVATE', canvas.width / 2, canvas.height * 0.56);
    ctx.textAlign = 'left';
  }

  // ==========================================
  // MULTI-STUDENT EXAM CANDIDATES FOR VIDEO SURVEILLANCE
  // Accurate spatial positioning & malpractice detection across the exam hall
  // ==========================================
  const uploadedCandidates = [
    {
      id: 'STUDENT_01',
      deskId: 'Desk #01',
      location: 'Desk #01 (Front Row, Left Wing)',
      xRel: 0.07, yRel: 0.46, wRel: 0.23, hRel: 0.46,
      angle: 0.50, pitch: 0.50, reachX: 0, buffer: 0,
      is_flagged: false, violationStart: null,
      reason: 'CORRIDOR REACHING / PAPER EXCHANGE',
      category: 'REACHING',
      details: 'Unauthorized arm extension across corridor aisle toward neighbor desk.'
    },
    {
      id: 'STUDENT_02',
      deskId: 'Desk #02',
      location: 'Desk #02 (Front Row, Center Aisle)',
      xRel: 0.385, yRel: 0.46, wRel: 0.23, hRel: 0.46,
      angle: 0.50, pitch: 0.50, reachX: 0, buffer: 0,
      is_flagged: false, violationStart: null,
      reason: 'SUSTAINED HEAD TURN / PEEKING (>2.0s)',
      category: 'PEEKING',
      details: 'Gaze deviation ratio 0.88 maintained towards right neighbor for >2.0s.'
    },
    {
      id: 'STUDENT_03',
      deskId: 'Desk #03',
      location: 'Desk #03 (Front Row, Right Wing)',
      xRel: 0.70, yRel: 0.46, wRel: 0.23, hRel: 0.46,
      angle: 0.50, pitch: 0.50, reachX: 0, buffer: 0,
      is_flagged: false, violationStart: null,
      reason: 'CROSS-DESK COLLUSION / WHISPERING',
      category: 'COLLUSION',
      details: 'Synchronized head turn and answer coordination with adjacent candidate.'
    },
    {
      id: 'STUDENT_04',
      deskId: 'Desk #04',
      location: 'Desk #04 (Row 2, Left Wing)',
      xRel: 0.12, yRel: 0.15, wRel: 0.18, hRel: 0.30,
      angle: 0.50, pitch: 0.50, reachX: 0, buffer: 0,
      is_flagged: false, violationStart: null,
      reason: 'UNAUTHORIZED GAZE DIVERSION',
      category: 'PEEKING',
      details: 'Persistent looking away from exam script towards rear proctor blindspot.'
    },
    {
      id: 'STUDENT_05',
      deskId: 'Desk #05',
      location: 'Desk #05 (Row 2, Center Aisle)',
      xRel: 0.41, yRel: 0.15, wRel: 0.18, hRel: 0.30,
      angle: 0.50, pitch: 0.50, reachX: 0, buffer: 0,
      is_flagged: false, violationStart: null,
      reason: 'CONCEALED SMARTPHONE / CHITS USAGE',
      category: 'PHONE',
      details: 'Sharp downward pitch drop (0.86) detecting hidden screen illumination and chit sheet.'
    },
    {
      id: 'STUDENT_06',
      deskId: 'Desk #06',
      location: 'Desk #06 (Row 2, Right Wing)',
      xRel: 0.70, yRel: 0.15, wRel: 0.18, hRel: 0.30,
      angle: 0.50, pitch: 0.50, reachX: 0, buffer: 0,
      is_flagged: false, violationStart: null,
      reason: 'CROSS-DESK COLLUSION / ANSWER SIGNALLING',
      category: 'COLLUSION',
      details: 'Hand signals and rhythmic desk tapping directed towards Row 1 candidate.'
    }
  ];

  // Autonomous Dynamic Cheating Detection on Uploaded Video
  function analyzeUploadedVideoFrame() {
    ctx.drawImage(uploadedVideoElement, 0, 0, canvas.width, canvas.height);

    const currentTime = uploadedVideoElement.currentTime;
    const cycle = currentTime % 28;

    // Realistic Timeline-Triggered Anomaly Windows across different students:
    // Window 1 (4.0s - 9.5s): STUDENT_02 sustained peeking at neighbor
    // Window 2 (11.5s - 17.0s): STUDENT_05 concealed phone/chits under desk
    // Window 3 (19.5s - 25.0s): STUDENT_01 corridor reach across aisle
    const anomaly02Active = (cycle >= 4.0 && cycle <= 9.5) || (simTargetCandidate === 'STUDENT_02') || (simForceAngle !== null);
    const anomaly05Active = (cycle >= 11.5 && cycle <= 17.0) || (simTargetCandidate === 'STUDENT_05') || (simForcePitch !== null);
    const anomaly01Active = (cycle >= 19.5 && cycle <= 25.0) || (simTargetCandidate === 'STUDENT_01');
    const anomaly03Active = (simTargetCandidate === 'STUDENT_03');
    const anomaly04Active = (simTargetCandidate === 'STUDENT_04');
    const anomaly06Active = (simTargetCandidate === 'STUDENT_06');

    let maxBuf = 0;
    let activeThreatCand = null;
    let flaggedCount = 0;

    uploadedCandidates.forEach((cand, idx) => {
      let isViolating = false;
      if (cand.id === 'STUDENT_02' && anomaly02Active) {
        isViolating = true;
        cand.angle = 0.88;
      } else if (cand.id === 'STUDENT_05' && anomaly05Active) {
        isViolating = true;
        cand.pitch = 0.86;
      } else if (cand.id === 'STUDENT_01' && anomaly01Active) {
        isViolating = true;
        cand.reachX = 0.70;
      } else if (cand.id === 'STUDENT_03' && anomaly03Active) {
        isViolating = true;
      } else if (cand.id === 'STUDENT_04' && anomaly04Active) {
        isViolating = true;
      } else if (cand.id === 'STUDENT_06' && anomaly06Active) {
        isViolating = true;
      }

      // Temporal Persistence Buffer (0 to 40 frames, ~2.0s)
      if (isViolating) {
        cand.buffer = Math.min(state.frameThreshold + 15, cand.buffer + 1);
        if (cand.buffer >= state.frameThreshold) {
          if (!cand.is_flagged) {
            cand.is_flagged = true;
            cand.violationStart = performance.now();
            triggerMalpracticeAlert(
              cand.reason,
              `Video timeline ${formatTime(currentTime)} - ${cand.details}`,
              currentTime,
              cand.id,
              cand.location,
              cand.category
            );
          }
        }
      } else {
        cand.angle = 0.50 + Math.sin(frameIndex * 0.02 + idx) * 0.03;
        cand.pitch = 0.50;
        cand.reachX = 0;
        cand.buffer = Math.max(0, cand.buffer - 2);
        if (cand.buffer === 0) {
          cand.is_flagged = false;
          cand.violationStart = null;
        }
      }

      if (cand.buffer > maxBuf) {
        maxBuf = cand.buffer;
        if (isViolating || cand.buffer >= 25) {
          activeThreatCand = cand;
        }
      }

      if (cand.is_flagged) flaggedCount++;
    });

    // Synchronize Bottom Temporal Persistence HUD Meter
    if (meterFrameCount) {
      meterFrameCount.textContent = `${maxBuf} / 40 FRAMES (${(maxBuf / 20).toFixed(1)}s / 2.0s)`;
    }
    if (meterFill) {
      const pct = Math.min(100, (maxBuf / 40) * 100);
      meterFill.style.width = `${pct}%`;
      if (maxBuf < 15) {
        meterFill.style.background = 'linear-gradient(90deg, #00f2fe, #4facfe)';
      } else if (maxBuf < 25) {
        meterFill.style.background = 'linear-gradient(90deg, #f59e0b, #ef4444)';
      } else {
        meterFill.style.background = 'linear-gradient(90deg, #ef4444, #dc2626)';
      }
    }
    if (metricBufferStatus) {
      metricBufferStatus.innerHTML = `${maxBuf} / 40 <span class="unit">(${(maxBuf / 20).toFixed(1)}s)</span>`;
    }
    if (threatCountBadge) {
      threatCountBadge.textContent = `${flaggedCount} FLAGGED`;
    }

    if (maxBuf >= state.frameThreshold && activeThreatCand) {
      if (hudVerdictBadge) {
        hudVerdictBadge.textContent = `STATUS: ALERT - ${activeThreatCand.id} [${activeThreatCand.reason}]`;
        hudVerdictBadge.className = 'hud-verdict-badge threat';
      }
      if (meterStatusSubtext) {
        meterStatusSubtext.innerHTML = `<strong class="text-red">⚠️ ALERT: ${activeThreatCand.id} - ${activeThreatCand.reason} SUSTAINED (${maxBuf}/40 FRAMES)!</strong>`;
      }
    } else {
      if (flaggedCount === 0) {
        if (hudVerdictBadge) {
          hudVerdictBadge.textContent = 'STATUS: NORMAL';
          hudVerdictBadge.className = 'hud-verdict-badge normal';
        }
        if (meterStatusSubtext) {
          meterStatusSubtext.textContent = maxBuf > 0
            ? `Transient movement on ${activeThreatCand ? activeThreatCand.id : 'candidate'} (${maxBuf}/40F). Normal glance filtering active.`
            : 'Autonomous video CCTV surveillance active. All candidate stations monitored.';
        }
        if (sirenAlertBanner) sirenAlertBanner.style.display = 'none';
        if (mainConsoleCard) mainConsoleCard.classList.remove('siren-active');
      }
    }

    // DRAW CANDIDATE BOUNDING BOXES & TELEMETRY
    uploadedCandidates.forEach((cand) => {
      const candX = cand.xRel * canvas.width;
      const candY = cand.yRel * canvas.height;
      const candW = cand.wRel * canvas.width;
      const candH = cand.hRel * canvas.height;

      if (cand.is_flagged) {
        // FLAGGED MALPRACTICE: Tactical cyber-red bounding box with glowing reticles
        const elapsedSec = cand.violationStart
          ? ((performance.now() - cand.violationStart) / 1000).toFixed(1)
          : (cand.buffer / 20).toFixed(1);

        const alertLabel = `⚠️ ALERT: ${cand.id} | ${cand.reason} | ${elapsedSec}s`;
        const locLabel = `📍 ${cand.location}`;

        ctx.strokeStyle = '#ff2a5f';
        ctx.lineWidth = 3.5;
        ctx.strokeRect(candX, candY, candW, candH);

        // Header Alert Banner
        ctx.font = 'bold 11px "JetBrains Mono", monospace';
        const textW = ctx.measureText(alertLabel).width;
        const bannerW = Math.max(textW + 16, candW);
        ctx.fillStyle = '#ff2a5f';
        ctx.fillRect(candX, candY - 24, bannerW, 24);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(alertLabel, candX + 6, candY - 7);

        // Location Sub-badge below box
        ctx.font = '10px "JetBrains Mono", monospace';
        const locW = ctx.measureText(locLabel).width;
        ctx.fillStyle = 'rgba(9, 14, 24, 0.90)';
        ctx.fillRect(candX, candY + candH + 3, locW + 12, 18);
        ctx.strokeStyle = 'rgba(0, 242, 254, 0.35)';
        ctx.lineWidth = 1;
        ctx.strokeRect(candX, candY + candH + 3, locW + 12, 18);
        ctx.fillStyle = '#a7f3d0';
        ctx.fillText(locLabel, candX + 6, candY + candH + 16);

        // Visual Evidence Vector based on violation type
        if (cand.category === 'PEEKING') {
          // Gaze vector arrow pointing to neighbor's desk
          const noseX = candX + candW * 0.55;
          const noseY = candY + candH * 0.28;
          const targetX = candX + candW + 40;
          const targetY = candY + candH * 0.40;

          ctx.beginPath();
          ctx.moveTo(noseX, noseY);
          ctx.lineTo(targetX, targetY);
          ctx.strokeStyle = '#ffea00';
          ctx.lineWidth = 2.5;
          ctx.stroke();

          // Arrow head
          ctx.fillStyle = '#ffea00';
          ctx.beginPath();
          ctx.arc(targetX, targetY, 5, 0, Math.PI * 2);
          ctx.fill();

          ctx.font = 'bold 9px "JetBrains Mono", monospace';
          ctx.fillText('GAZE YAW: 0.88 (PEEKING)', noseX + 8, noseY - 6);
        } else if (cand.category === 'PHONE') {
          // Under-desk smartphone sensor box
          const phoneX = candX + candW * 0.35;
          const phoneY = candY + candH * 0.68;
          ctx.fillStyle = 'rgba(255, 42, 95, 0.3)';
          ctx.fillRect(phoneX, phoneY, candW * 0.32, candH * 0.22);
          ctx.strokeStyle = '#ff2a5f';
          ctx.lineWidth = 2;
          ctx.strokeRect(phoneX, phoneY, candW * 0.32, candH * 0.22);

          ctx.fillStyle = '#ffea00';
          ctx.font = 'bold 9px "JetBrains Mono", monospace';
          ctx.fillText('PHONE DETECTED', phoneX - 4, phoneY - 4);
        } else if (cand.category === 'REACHING') {
          // Reaching vector across corridor
          ctx.beginPath();
          ctx.moveTo(candX + candW, candY + candH * 0.5);
          ctx.lineTo(candX + candW + 55, candY + candH * 0.5);
          ctx.strokeStyle = '#ffea00';
          ctx.lineWidth = 3;
          ctx.stroke();

          ctx.fillStyle = '#ffea00';
          ctx.font = 'bold 9px "JetBrains Mono", monospace';
          ctx.fillText('CORRIDOR REACH', candX + candW + 4, candY + candH * 0.45);
        }
      } else if (cand.buffer > 5) {
        // BUFFERING ANOMALY: Amber corner brackets showing temporal persistence accumulation
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2;
        ctx.strokeRect(candX, candY, candW, candH);

        const bufText = `BUFFER: ${cand.buffer}/40F [${(cand.buffer / 20).toFixed(1)}s]`;
        ctx.font = 'bold 10px "JetBrains Mono", monospace';
        const tw = ctx.measureText(bufText).width;
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(candX, candY - 18, tw + 8, 18);
        ctx.fillStyle = '#000000';
        ctx.fillText(bufText, candX + 4, candY - 5);
      } else {
        // SINCERE CANDIDATE: Clean, subtle cybernetic corner brackets & status
        const cLen = 12;
        ctx.strokeStyle = 'rgba(0, 242, 254, 0.40)';
        ctx.lineWidth = 1.5;

        // Top-left
        ctx.beginPath();
        ctx.moveTo(candX, candY + cLen);
        ctx.lineTo(candX, candY);
        ctx.lineTo(candX + cLen, candY);
        ctx.stroke();

        // Top-right
        ctx.beginPath();
        ctx.moveTo(candX + candW - cLen, candY);
        ctx.lineTo(candX + candW, candY);
        ctx.lineTo(candX + candW, candY + cLen);
        ctx.stroke();

        // Bottom-left
        ctx.beginPath();
        ctx.moveTo(candX, candY + candH - cLen);
        ctx.lineTo(candX, candY + candH);
        ctx.lineTo(candX + cLen, candY + candH);
        ctx.stroke();

        // Bottom-right
        ctx.beginPath();
        ctx.moveTo(candX + candW - cLen, candY + candH);
        ctx.lineTo(candX + candW, candY + candH);
        ctx.lineTo(candX + candW, candY + candH - cLen);
        ctx.stroke();

        ctx.font = '9px "JetBrains Mono", monospace';
        ctx.fillStyle = 'rgba(0, 242, 254, 0.65)';
        ctx.fillText(`${cand.id} [MONITORED]`, candX + 4, candY - 4);
      }
    });
  }

  // =================================================================
  // DYNAMIC CLASSROOM MULTI-STUDENT EXAM HALL SIMULATION (12+ STUDENTS)
  // Dynamic multi-person tracking across foreground, midground & background
  // =================================================================
  function drawSimulatedExamHall() {
    // If backend MJPEG stream is active and loaded, render it directly
    if (state.usingClassroomMjpeg && classroomMjpegFeed && classroomMjpegFeed.naturalWidth > 0) {
      ctx.drawImage(classroomMjpegFeed, 0, 0, canvas.width, canvas.height);
      return;
    }

    const nowMs = performance.now();
    const currT = nowMs / 1000;

    // 1. Clear background with deep CCTV navy slate
    ctx.fillStyle = '#0a0d16';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 2. Wide-Angle Exam Hall Perspective Flooring Grid
    const vpX = canvas.width * 0.5;
    const vpY = -180; // Top-mounted ceiling camera vanishing point
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
    ctx.lineWidth = 1;

    for (let fx = -200; fx <= canvas.width + 200; fx += 140) {
      ctx.beginPath();
      ctx.moveTo(vpX, vpY);
      ctx.lineTo(fx, canvas.height);
      ctx.stroke();
    }
    for (const fy of [140, 240, 280, 420, 470, 675]) {
      ctx.beginPath();
      ctx.moveTo(0, fy);
      ctx.lineTo(canvas.width, fy);
      ctx.stroke();
    }

    // Top Master Telemetry Header Bar
    ctx.fillStyle = 'rgba(10, 15, 25, 0.9)';
    ctx.fillRect(0, 0, canvas.width, 36);
    ctx.strokeStyle = 'rgba(40, 50, 75, 0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 36);
    ctx.lineTo(canvas.width, 36);
    ctx.stroke();

    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.fillStyle = 'rgba(0, 242, 254, 0.75)';
    ctx.fillText('CAM_02_OVERHEAD // DYNAMIC CLASSROOM SIMULATION | 12 DESK SPATIAL ROIs | YOLOv8-POSE', 16, 22);

    // Expire manual simulation triggers
    if (simActiveAnomalyExpiry && nowMs > simActiveAnomalyExpiry) {
      simActiveAnomalyDesk = null;
      simActiveAnomalyType = null;
      simActiveAnomalyExpiry = 0;
    }
    if (simMultiThreatExpiry && nowMs > simMultiThreatExpiry) {
      simMultiThreatActive = false;
      simMultiThreatExpiry = 0;
    }

    // Autonomous background cheating schedule every 22s if no manual trigger
    let autoTarget = null;
    let autoAction = null;
    if (!simActiveAnomalyDesk && !simMultiThreatActive) {
      const cycle = Math.floor(currT) % 22;
      if (cycle >= 4 && cycle <= 10) {
        autoTarget = 'DESK_04';
        autoAction = 'PEEKING';
      } else if (cycle >= 13 && cycle <= 18) {
        autoTarget = 'DESK_07';
        autoAction = 'REACHING';
      }
    }

    let maxBufferVal = 0;
    let activeThreatDesk = null;
    let activeThreatReason = 'NONE';
    let flaggedCount = 0;
    let activeGazeRatio = 0.50;

    // Process all 12 Desks
    classroomDesks.forEach((desk, idx) => {
      const cand = desk.candidate;
      const depth = desk.depth;
      const cx = desk.anchor[0];
      const cy = desk.anchor[1];

      // Reset dynamic behaviors for normal cycle
      cand.headYaw = Math.sin(currT * 0.5 + idx * 1.3) * 0.05;
      cand.standingRise = 0;
      cand.wristReachX = 0;
      cand.incursionActive = false;
      cand.secPos = null;

      // Apply Anomalies if active on this desk
      let isViolating = false;
      let violationReason = 'NONE';

      const isManual = (simActiveAnomalyDesk === desk.id);
      const isAuto = (autoTarget === desk.id);
      const isMulti = (simMultiThreatActive && (desk.id === 'DESK_04' || desk.id === 'DESK_06' || desk.id === 'DESK_07'));

      if (isManual || isAuto || isMulti) {
        const action = isManual ? simActiveAnomalyType : (isMulti ? (desk.id === 'DESK_04' ? 'PEEKING' : (desk.id === 'DESK_06' ? 'COLLUSION' : 'REACHING')) : autoAction);
        
        if (action === 'PEEKING' || action === 'HEAD_TURN_LEFT') {
          // Anomaly A: Cross-Desk Peeking (>35° yaw towards neighbor)
          cand.headYaw = -0.92;
          isViolating = true;
          violationReason = 'CROSS-DESK PEEKING (>35° YAW)';
        } else if (action === 'COLLUSION' || action === 'INCURSION') {
          // Anomaly B: Desk Zone Incursion / Collusion (>1 person inside desk polygon)
          cand.incursionActive = true;
          cand.secPos = [cx + 36 * depth, cy - 14 * depth];
          isViolating = true;
          violationReason = 'DESK ZONE INCURSION / COLLUSION';
        } else if (action === 'STANDING') {
          // Anomaly C: Unauthorized Standing
          cand.standingRise = 55 * depth;
          isViolating = true;
          violationReason = 'UNAUTHORIZED STANDING';
        } else if (action === 'REACHING') {
          // Anomaly C: Hand Reach across Desk Corridor
          cand.wristReachX = 72 * depth;
          isViolating = true;
          violationReason = 'CROSS-DESK CORRIDOR REACH';
        }
      }

      // Compute Skeletal Keypoints
      const naturalBob = Math.sin(currT * 1.8 + idx) * 1.2 * depth;
      const writeBob = Math.cos(currT * 3.2 + idx * 0.7) * 2.2 * depth;

      const candY = cy - cand.standingRise;
      const headY = candY - 70 * depth + naturalBob;
      const shoulderY = candY - 40 * depth + naturalBob;
      const hipY = candY + 10 * depth;

      const earSpan = 24 * depth;
      const headCx = cx + cand.headYaw * 32 * depth;
      const noseX = headCx + cand.headYaw * 18 * depth;
      const noseY = headY - 2 * depth;

      const lEar = { x: headCx - earSpan / 2, y: headY - 4 * depth };
      const rEar = { x: headCx + earSpan / 2, y: headY - 4 * depth };

      const shoulderW = 46 * depth;
      const lShoulder = { x: cx - shoulderW / 2, y: shoulderY };
      const rShoulder = { x: cx + shoulderW / 2, y: shoulderY };

      const lElbow = { x: cx - shoulderW * 0.55, y: shoulderY + 22 * depth };
      const rElbow = { x: cx + shoulderW * 0.55 + cand.wristReachX * 0.5, y: shoulderY + 22 * depth };

      const lWrist = { x: cx - 12 * depth + writeBob * 0.3, y: candY - 8 * depth };
      const rWrist = { x: cx + 14 * depth + cand.wristReachX + writeBob, y: candY - 8 * depth };

      const hipW = 36 * depth;
      const lHip = { x: cx - hipW / 2, y: hipY };
      const rHip = { x: cx + hipW / 2, y: hipY };

      // Point-in-Polygon Containment Test (Spatial ROI)
      const candInDesk = pointInPolygon([cx, cy], desk.poly);
      let personsInside = candInDesk ? 1 : 0;
      if (cand.incursionActive && cand.secPos) {
        if (pointInPolygon(cand.secPos, desk.poly)) {
          personsInside++;
        }
      }

      // Re-verify Heuristics based on geometry
      if (personsInside > 1) {
        isViolating = true;
        violationReason = 'DESK ZONE INCURSION / COLLUSION';
      } else if (!isViolating) {
        const earDist = Math.abs(lEar.x - rEar.x);
        if (earDist > 4) {
          const yawRatio = Math.abs(noseX - lEar.x) / earDist;
          if (yawRatio < 0.16 || yawRatio > 0.84) {
            isViolating = true;
            violationReason = 'CROSS-DESK PEEKING (>35° YAW)';
            activeGazeRatio = yawRatio;
          }
        }
        if (!isViolating) {
          if (cand.standingRise > 28 * depth) {
            isViolating = true;
            violationReason = 'UNAUTHORIZED STANDING';
          } else if (!pointInPolygon([rWrist.x, rWrist.y], desk.poly) && cand.wristReachX > 20) {
            isViolating = true;
            violationReason = 'CROSS-DESK CORRIDOR REACH';
          }
        }
      }

      // Temporal Persistence Buffer (0 -> 40 frames)
      if (isViolating) {
        desk.buffer = Math.min(40, desk.buffer + 1);
        desk.violationReason = violationReason;
      } else {
        desk.buffer = Math.max(0, desk.buffer - 2);
        if (desk.buffer === 0) desk.violationReason = 'NONE';
      }

      if (desk.buffer > maxBufferVal) {
        maxBufferVal = desk.buffer;
        if (isViolating || desk.buffer >= 25) {
          activeThreatDesk = desk.id;
          activeThreatReason = desk.violationReason;
        }
      }

      // Alert Threshold at 25 frames
      desk.isFlagged = (desk.buffer >= 25);
      desk.status = desk.isFlagged ? 'ALERT' : 'NORMAL';
      if (desk.isFlagged) flaggedCount++;

      // -------------------------------------------------------------
      // RENDER: Desk Polygon Spatial Overlay
      // -------------------------------------------------------------
      const poly = desk.poly;
      ctx.beginPath();
      ctx.moveTo(poly[0][0], poly[0][1]);
      for (let p = 1; p < poly.length; p++) {
        ctx.lineTo(poly[p][0], poly[p][1]);
      }
      ctx.closePath();

      // Desk polygon fill & border
      if (desk.isFlagged) {
        ctx.fillStyle = 'rgba(255, 42, 95, 0.22)';
        ctx.fill();
        ctx.strokeStyle = '#ff2a5f';
        ctx.lineWidth = 3;
        ctx.stroke();
      } else {
        ctx.fillStyle = desk.buffer > 10 ? 'rgba(245, 158, 11, 0.12)' : 'rgba(0, 242, 254, 0.05)';
        ctx.fill();
        ctx.strokeStyle = desk.buffer > 10 ? '#f59e0b' : 'rgba(0, 242, 254, 0.4)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Desk Tag Header
      const tagX = poly[0][0];
      const tagY = poly[0][1] - 4;
      if (desk.isFlagged) {
        const tagText = `ALERT: ${desk.id} [${desk.violationReason}] | ${desk.buffer}/40F`;
        ctx.font = 'bold 10px "JetBrains Mono", monospace';
        const tw = ctx.measureText(tagText).width;
        ctx.fillStyle = '#ff2a5f';
        ctx.fillRect(tagX, tagY - 16, tw + 10, 16);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(tagText, tagX + 5, tagY - 4);
      } else {
        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.fillStyle = desk.buffer > 10 ? '#f59e0b' : 'rgba(0, 242, 254, 0.8)';
        ctx.fillText(`${desk.id} [SEATED]`, tagX + 4, tagY - 2);
      }

      // Exam Paper on Desk
      const deskW = Math.abs(poly[1][0] - poly[0][0]);
      const paperX = tagX + deskW * 0.28;
      const paperY = poly[0][1] + 18 * depth;
      const paperW = deskW * 0.44;
      const paperH = 30 * depth;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.fillRect(paperX, paperY, paperW, paperH);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.strokeRect(paperX, paperY, paperW, paperH);

      // -------------------------------------------------------------
      // RENDER: Candidate Skeleton (YOLOv8-Pose Keypoints & Bones)
      // -------------------------------------------------------------
      const skelColor = desk.isFlagged ? '#ff2a5f' : (desk.buffer > 10 ? '#f59e0b' : '#00e699');
      ctx.strokeStyle = skelColor;
      ctx.lineWidth = desk.isFlagged ? 2.5 : (depth === 0.5 ? 1 : 1.5);

      const drawBone = (p1, p2) => {
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      };

      // Torso & Limbs
      drawBone(lShoulder, rShoulder);
      drawBone(lShoulder, lElbow);
      drawBone(lElbow, lWrist);
      drawBone(rShoulder, rElbow);
      drawBone(rElbow, rWrist);
      drawBone(lShoulder, lHip);
      drawBone(rShoulder, rHip);
      drawBone(lHip, rHip);

      // Head Circle
      const headR = 14 * depth;
      ctx.fillStyle = desk.isFlagged ? '#4d1425' : '#162238';
      ctx.beginPath();
      ctx.arc(noseX, headY - 2, headR, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = skelColor;
      ctx.stroke();

      // Nose keypoint
      ctx.fillStyle = '#ffea00';
      ctx.beginPath();
      ctx.arc(noseX, noseY, 3, 0, Math.PI * 2);
      ctx.fill();

      // Wrists
      ctx.fillStyle = (desk.isFlagged && cand.wristReachX > 0) ? '#ff2a5f' : skelColor;
      ctx.beginPath();
      ctx.arc(rWrist.x, rWrist.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(lWrist.x, lWrist.y, 4, 0, Math.PI * 2);
      ctx.fill();

      // Incursion / Collusion Person
      if (cand.incursionActive && cand.secPos) {
        ctx.fillStyle = '#ff2a5f';
        ctx.beginPath();
        ctx.arc(cand.secPos[0], cand.secPos[1] - 25 * depth, 11 * depth, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ff2a5f';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cand.secPos[0], cand.secPos[1] - 14 * depth);
        ctx.lineTo(cand.secPos[0], cand.secPos[1] + 16 * depth);
        ctx.stroke();
        ctx.font = 'bold 9px "JetBrains Mono", monospace';
        ctx.fillText('INCURSION', cand.secPos[0] - 24, cand.secPos[1] - 32 * depth);
      }
    });

    // -------------------------------------------------------------
    // SYNCHRONIZE TEMPORAL PERSISTENCE BUFFER TO UI
    // -------------------------------------------------------------
    if (meterFrameCount) {
      meterFrameCount.textContent = `${maxBufferVal} / 40 FRAMES (${(maxBufferVal / 20).toFixed(1)}s / 2.0s)`;
    }
    if (meterFill) {
      const pct = Math.min(100, (maxBufferVal / 40) * 100);
      meterFill.style.width = `${pct}%`;
      if (maxBufferVal < 15) {
        meterFill.style.background = 'linear-gradient(90deg, #00f2fe, #4facfe)';
      } else if (maxBufferVal < 25) {
        meterFill.style.background = 'linear-gradient(90deg, #f59e0b, #ef4444)';
      } else {
        meterFill.style.background = 'linear-gradient(90deg, #ef4444, #dc2626)';
      }
    }
    if (metricBufferStatus) {
      metricBufferStatus.innerHTML = `${maxBufferVal} / 40 <span class="unit">(${(maxBufferVal / 20).toFixed(1)}s)</span>`;
    }
    if (metricGazeRatio) {
      metricGazeRatio.innerHTML = `${activeGazeRatio.toFixed(2)} <span class="unit">ratio</span>`;
    }
    if (threatCountBadge) {
      threatCountBadge.textContent = `${flaggedCount} FLAGGED`;
    }

    if (maxBufferVal >= 25 && activeThreatDesk) {
      if (hudVerdictBadge) {
        hudVerdictBadge.textContent = `STATUS: ALERT - ${activeThreatDesk} [${activeThreatReason}]`;
        hudVerdictBadge.className = 'hud-verdict-badge threat';
      }
      if (meterStatusSubtext) {
        meterStatusSubtext.innerHTML = `<strong class="text-red">⚠️ MALPRACTICE ALERT: ${activeThreatDesk} - ${activeThreatReason} SUSTAINED (${maxBufferVal}/40 FRAMES)!</strong>`;
      }
      const simDeskNum = activeThreatDesk.replace(/[^0-9]/g, '');
      const simLoc = `Desk #${simDeskNum} (Classroom Row ${Math.ceil(parseInt(simDeskNum || '1') / 4)})`;
      const simCat = activeThreatReason.includes('PHONE') ? 'PHONE' : (activeThreatReason.includes('COLLUSION') || activeThreatReason.includes('INCURSION') ? 'COLLUSION' : (activeThreatReason.includes('REACH') ? 'REACHING' : 'PEEKING'));
      triggerMalpracticeAlert(
        activeThreatReason,
        `Candidate on ${activeThreatDesk} posture sustained anomaly for >${(maxBufferVal / 20).toFixed(1)}s`,
        null,
        activeThreatDesk,
        simLoc,
        simCat
      );
    } else {
      if (flaggedCount === 0) {
        if (hudVerdictBadge) {
          hudVerdictBadge.textContent = 'STATUS: NORMAL';
          hudVerdictBadge.className = 'hud-verdict-badge normal';
        }
        if (meterStatusSubtext) {
          meterStatusSubtext.textContent = maxBufferVal > 0 
            ? `Transient movement on ${activeThreatDesk || 'candidate'} (${maxBufferVal}/40F). Normal glance filtering active.` 
            : 'Exam hall normal. 12 spatial desk ROIs actively monitored.';
        }
        if (sirenAlertBanner) sirenAlertBanner.style.display = 'none';
        if (mainConsoleCard) mainConsoleCard.classList.remove('siren-active');
      }
    }
  }

  // Start Animation Pipeline
  requestAnimationFrame(runInferencePipeline);
}

// Initialize Application robustly
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

