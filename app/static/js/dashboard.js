/**
 * DELHI AQI DASHBOARD — CLIENT LOGIC & ANIMATIONS
 * Features: Background Crossfade, Mouse Parallax, Animated Bezier Wave Line,
 * Smooth AQI Counter, and Unambiguous Date Formatting.
 */

(function () {
  'use strict';
  console.info('[Delhi AQI] dashboard.js fix2 loaded');

  // Application State
  const state = {
    mode: 'replay',
    targetDate: '2025-11-12',
    horizon: 1,
    activeReplay: null,
    liveWeather: null,
    metricsData: null,
    chartSeries: null,
    chartAnimProgress: 0,
    hoveredIndex: -1
  };

  // DOM Elements Cache
  const el = {
    // Backgrounds
    layerContainer: document.getElementById('bgLayerContainer'),
    layerHeavySmog: document.getElementById('layerHeavySmog'),
    layerHazySky: document.getElementById('layerHazySky'),
    layerClearSky: document.getElementById('layerClearSky'),

    // Navigation & Tabs
    tabReplayBtn: document.getElementById('tabReplayBtn'),
    tabLiveBtn: document.getElementById('tabLiveBtn'),
    tabMetricsBtn: document.getElementById('tabMetricsBtn'),
    navBtnReplay: document.getElementById('navBtnReplay'),
    navBtnLive: document.getElementById('navBtnLive'),
    navBtnMetrics: document.getElementById('navBtnMetrics'),
    openVivaDrawerBtn: document.getElementById('openVivaDrawerBtn'),
    closeVivaDrawerBtn: document.getElementById('closeVivaDrawerBtn'),
    modalVivaDrawer: document.getElementById('modalVivaDrawer'),
    headerDisclaimerPill: document.getElementById('headerDisclaimerPill'),

    // Views
    viewReplay: document.getElementById('viewReplay'),
    viewLive: document.getElementById('viewLive'),
    viewMetrics: document.getElementById('viewMetrics'),

    // Replay Controls
    inputDate: document.getElementById('inputDate'),
    labelFormattedDate: document.getElementById('labelFormattedDate'),
    btnH1: document.getElementById('btnH1'),
    btnH2: document.getElementById('btnH2'),
    btnH3: document.getElementById('btnH3'),
    containerEpisodeChips: document.getElementById('containerEpisodeChips'),

    // Hero AQI Display
    badgeEpisodeLead: document.getElementById('badgeEpisodeLead'),
    textConditionHeadline: document.getElementById('textConditionHeadline'),
    textConditionSummary: document.getElementById('textConditionSummary'),
    numFocalAqi: document.getElementById('numFocalAqi'),
    badgeCpcbCategory: document.getElementById('badgeCpcbCategory'),

    // Comparison Card
    textSelectedModelName: document.getElementById('textSelectedModelName'),
    textValPredicted: document.getElementById('textValPredicted'),
    textActualCatLabel: document.getElementById('textActualCatLabel'),
    textValActual: document.getElementById('textValActual'),
    textValPersistence: document.getElementById('textValPersistence'),
    textValError: document.getElementById('textValError'),
    badgeDeltaStatus: document.getElementById('badgeDeltaStatus'),

    // Side Weather Card
    textWeatherCondDesc: document.getElementById('textWeatherCondDesc'),
    textWeatherTemp: document.getElementById('textWeatherTemp'),
    textWeatherHumidity: document.getElementById('textWeatherHumidity'),
    textWeatherWind: document.getElementById('textWeatherWind'),
    textWeatherRain: document.getElementById('textWeatherRain'),

    // Pollutants & Chart
    containerPollutantsRow: document.getElementById('containerPollutantsRow'),
    canvas: document.getElementById('forecastWaveCanvas'),

    // Live Containers
    containerLiveStatus: document.getElementById('containerLiveStatus'),
    containerLiveWeather: document.getElementById('containerLiveWeather'),
    containerMetricsTable: document.getElementById('containerMetricsTable')
  };

  /**
   * Helper: Format Date String to Unambiguous \"12 Nov 2025\"
   */
  function formatUnambiguousDate(dateStr) {
    if (!dateStr || dateStr.length < 10) return dateStr;
    const parts = dateStr.split('-');
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${day} ${months[month]} ${year}`;
  }

  /**
   * Helper: Accurate CPCB Category Determination
   */
  function determineCpcbCategory(aqi) {
    if (aqi <= 50) return { name: 'Good', token: 'cpcb-good' };
    if (aqi <= 100) return { name: 'Satisfactory', token: 'cpcb-satisfactory' };
    if (aqi <= 200) return { name: 'Moderate', token: 'cpcb-moderate' };
    if (aqi <= 300) return { name: 'Poor', token: 'cpcb-poor' };
    if (aqi <= 400) return { name: 'Very Poor', token: 'cpcb-very-poor' };
    return { name: 'Severe', token: 'cpcb-severe' }; // > 400 is strictly Severe
  }

  /**
   * App Initialization
   */
  async function init() {
    bindEvents();
    initCanvas();
    setupParallax();
    await fetchEpisodes();
    await queryReplayData(state.targetDate, state.horizon);
    fetchLiveWeather();
    fetchLiveStatus();
  }

  /**
   * Bind Events
   */
  function bindEvents() {
    // Date input change
    if (el.inputDate) {
      el.inputDate.addEventListener('change', (e) => {
        const val = e.target.value;
        if (val) {
          state.targetDate = val;
          if (el.labelFormattedDate) el.labelFormattedDate.textContent = formatUnambiguousDate(val);
          queryReplayData(state.targetDate, state.horizon);
        }
      });
    }

    // Horizon buttons
    [el.btnH1, el.btnH2, el.btnH3].forEach((btn) => {
      if (!btn) return;
      btn.addEventListener('click', () => {
        [el.btnH1, el.btnH2, el.btnH3].forEach((b) => b && b.classList.remove('active'));
        btn.classList.add('active');
        state.horizon = parseInt(btn.dataset.horizon, 10);
        queryReplayData(state.targetDate, state.horizon);
      });
    });

    // Mode tabs
    [el.tabReplayBtn, el.tabLiveBtn, el.tabMetricsBtn].forEach((btn) => {
      if (!btn) return;
      btn.addEventListener('click', () => switchMode(btn.dataset.mode));
    });

    // Nav rail
    [el.navBtnReplay, el.navBtnLive, el.navBtnMetrics].forEach((btn) => {
      if (!btn) return;
      btn.addEventListener('click', () => switchMode(btn.dataset.nav));
    });

    // Viva Guide Drawer
    if (el.openVivaDrawerBtn) el.openVivaDrawerBtn.addEventListener('click', openDrawer);
    if (el.closeVivaDrawerBtn) el.closeVivaDrawerBtn.addEventListener('click', closeDrawer);
    if (el.headerDisclaimerPill) el.headerDisclaimerPill.addEventListener('click', openDrawer);
    if (el.modalVivaDrawer) {
      el.modalVivaDrawer.addEventListener('click', (e) => {
        if (e.target === el.modalVivaDrawer) closeDrawer();
      });
    }

    // Canvas Window Resize & Hover
    window.addEventListener('resize', () => {
      resizeCanvas();
      if (state.chartSeries) drawForecastWave(state.chartSeries, 1.0);
    });

    if (el.canvas) {
      el.canvas.addEventListener('mousemove', handleCanvasHover);
      el.canvas.addEventListener('mouseleave', () => {
        state.hoveredIndex = -1;
        if (state.chartSeries) drawForecastWave(state.chartSeries, 1.0);
      });
    }
  }

  /**
   * Mode Switching
   */
  function switchMode(mode) {
    state.mode = mode;
    [el.tabReplayBtn, el.tabLiveBtn, el.tabMetricsBtn].forEach((b) => {
      if (b) b.classList.toggle('active', b.dataset.mode === mode);
    });
    [el.navBtnReplay, el.navBtnLive, el.navBtnMetrics].forEach((b) => {
      if (b) b.classList.toggle('active', b.dataset.nav === mode);
    });

    if (el.viewReplay) el.viewReplay.style.display = mode === 'replay' ? 'block' : 'none';
    if (el.viewLive) el.viewLive.style.display = mode === 'live' ? 'block' : 'none';
    if (el.viewMetrics) el.viewMetrics.style.display = mode === 'metrics' ? 'block' : 'none';

    if (mode === 'metrics' && !state.metricsData) fetchMetricsData();
    if (mode === 'live' && !state.liveWeather) fetchLiveWeather();
  }

  function openDrawer() {
    if (el.modalVivaDrawer) el.modalVivaDrawer.classList.add('active');
  }

  function closeDrawer() {
    if (el.modalVivaDrawer) el.modalVivaDrawer.classList.remove('active');
  }

  /**
   * Subtle Parallax on Desktop
   */
  function setupParallax() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (window.innerWidth < 768) return;

    let targetX = 0, targetY = 0;
    let currentX = 0, currentY = 0;

    window.addEventListener('mousemove', (e) => {
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      targetX = ((e.clientX - cx) / cx) * -5; // max 5px
      targetY = ((e.clientY - cy) / cy) * -4;
    });

    function loop() {
      currentX += (targetX - currentX) * 0.08;
      currentY += (targetY - currentY) * 0.08;
      if (el.layerContainer) {
        el.layerContainer.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
      }
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }

  /**
   * Background Crossfade
   */
  function updateBackgroundAtmosphere(aqi) {
    if (!el.layerHeavySmog || !el.layerHazySky || !el.layerClearSky) return;

    el.layerHeavySmog.classList.remove('active');
    el.layerHazySky.classList.remove('active');
    el.layerClearSky.classList.remove('active');

    if (aqi >= 250) {
      el.layerHeavySmog.classList.add('active');
    } else if (aqi >= 100) {
      el.layerHazySky.classList.add('active');
    } else {
      el.layerClearSky.classList.add('active');
    }
  }

  /**
   * Fetch Notable Episodes
   */
  async function fetchEpisodes() {
    if (!el.containerEpisodeChips) return;
    try {
      const res = await fetch('/api/replay/episodes?v=20261026-fix2', { cache: 'no-store' });
      if (!res.ok) throw new Error(`Episodes endpoint returned HTTP ${res.status}`);
      const episodes = await res.json();
      if (!Array.isArray(episodes)) throw new Error('Episodes response was not a JSON array');
      renderEpisodeChips(episodes);
    } catch (e) {
      console.error('[Delhi AQI] Episodes failed to load:', e);
      el.containerEpisodeChips.innerHTML = '<span class="episode-load-error">Episodes unavailable — check /api/replay/episodes</span>';
    }
  }

  function renderEpisodeChips(episodes) {
    if (!el.containerEpisodeChips) return;
    el.containerEpisodeChips.innerHTML = '';
    episodes.forEach((ep) => {
      const chip = document.createElement('button');
      chip.className = `chip-btn ${ep.date === state.targetDate ? 'active' : ''}`;
      chip.textContent = `${ep.title} (${formatUnambiguousDate(ep.date).slice(0, 6)})`;
      chip.addEventListener('click', () => {
        document.querySelectorAll('.chip-btn').forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        state.targetDate = ep.date;
        if (el.inputDate) el.inputDate.value = ep.date;
        if (el.labelFormattedDate) el.labelFormattedDate.textContent = formatUnambiguousDate(ep.date);
        queryReplayData(state.targetDate, state.horizon);
      });
      el.containerEpisodeChips.appendChild(chip);
    });
  }

  /**
   * Query Replay Data
   */
  async function queryReplayData(date, horizon) {
    try {
      const res = await fetch(`/api/replay/query?date=${encodeURIComponent(date)}&horizon=${horizon}&v=20261026-fix2`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Replay endpoint returned HTTP ${res.status}`);
      const data = await res.json();

      if (data.success) {
        state.activeReplay = data;
        updateUIWithReplay(data);
      } else {
        handleOutOfRange(data.message);
      }
    } catch (e) {
      console.error('[Delhi AQI] Replay query failed:', e);
      handleOutOfRange('Failed to retrieve replay data. Check /api/replay/query in the browser.');
    }
  }

  /**
   * Update UI With Replay Results
   */
  function updateUIWithReplay(data) {
    const formattedDate = formatUnambiguousDate(data.target_date);
    if (el.labelFormattedDate) el.labelFormattedDate.textContent = formattedDate;

    // 1. AQI Category & Headline
    const cat = determineCpcbCategory(data.predicted_aqi);
    const actCat = determineCpcbCategory(data.actual_aqi_estimate);

    if (el.badgeCpcbCategory) {
      el.badgeCpcbCategory.className = `cpcb-category-badge ${cat.token}`;
      el.badgeCpcbCategory.textContent = cat.name;
    }

    if (el.textConditionHeadline) {
      if (cat.name === 'Severe') {
        el.textConditionHeadline.textContent = 'Severe Smog Inversion';
      } else if (cat.name === 'Very Poor') {
        el.textConditionHeadline.textContent = 'Heavy Particulate Overcast';
      } else if (cat.name === 'Poor') {
        el.textConditionHeadline.textContent = 'Stagnant Autumn Smog';
      } else if (cat.name === 'Moderate') {
        el.textConditionHeadline.textContent = 'Diffused Atmospheric Haze';
      } else {
        el.textConditionHeadline.textContent = 'Clear Atmospheric Window';
      }
    }

    if (el.textConditionSummary) {
      el.textConditionSummary.textContent = data.health_statement;
    }

    if (el.badgeEpisodeLead) {
      el.badgeEpisodeLead.textContent = `Historical Replay: ${formattedDate} (Day ${data.horizon_days})`;
    }

    // 2. Animate AQI Number
    animateAqiCounter(Math.round(data.predicted_aqi));

    // 3. Smooth Background Crossfade
    updateBackgroundAtmosphere(data.predicted_aqi);

    // 4. Comparison Cards (Explicit Labels)
    if (el.textValPredicted) el.textValPredicted.textContent = data.predicted_aqi;
    if (el.textSelectedModelName) el.textSelectedModelName.textContent = `Model: ${data.selected_model}`;
    if (el.textValActual) el.textValActual.textContent = data.actual_aqi_estimate;
    if (el.textActualCatLabel) el.textActualCatLabel.textContent = `Derived category: ${actCat.name}`;
    if (el.textValPersistence) el.textValPersistence.textContent = data.persistence_prediction;

    if (el.textValError) {
      el.textValError.textContent = `±${data.absolute_model_error}`;
      el.textValError.style.color = data.model_beaten_baseline ? '#4ade80' : '#facc15';
    }

    if (el.badgeDeltaStatus) {
      if (data.model_beaten_baseline) {
        const diff = (data.absolute_persistence_error - data.absolute_model_error).toFixed(1);
        el.badgeDeltaStatus.className = 'delta-status-pill success';
        el.badgeDeltaStatus.textContent = `Model beats baseline by ${diff} pts`;
      } else {
        el.badgeDeltaStatus.className = 'delta-status-pill neutral';
        el.badgeDeltaStatus.textContent = `Baseline closer by ${(data.absolute_model_error - data.absolute_persistence_error).toFixed(1)} pts`;
      }
    }

    // 5. Weather Panel
    if (data.weather) {
      if (el.textWeatherTemp) el.textWeatherTemp.textContent = `${data.weather.temperature_c !== undefined ? data.weather.temperature_c : '--'}°C`;
      if (el.textWeatherHumidity) el.textWeatherHumidity.textContent = `${data.weather.humidity_pct !== undefined ? data.weather.humidity_pct : '--'}%`;
      if (el.textWeatherWind) el.textWeatherWind.textContent = `${data.weather.wind_speed_mps !== undefined ? data.weather.wind_speed_mps : '--'} m/s`;
      if (el.textWeatherRain) el.textWeatherRain.textContent = `${data.weather.rainfall_mm !== undefined && data.weather.rainfall_mm !== null ? data.weather.rainfall_mm : 0} mm`;
      if (el.textWeatherCondDesc) {
        const temp = data.weather.temperature_c ?? '--';
        const wind = data.weather.wind_speed_mps ?? '--';
        el.textWeatherCondDesc.textContent = wind === '--' || isNaN(parseFloat(wind)) ? 'Loading weather data...' : (parseFloat(wind) < 1.2 ? 'Calm Stagnant Inversion' : 'Moderate Boundary Flow');
      }
    }

    // 6. Pollutants Row
    renderPollutants(data.pollutants);

    // 7. Animated Forecast Wave Chart
    if (data.chart_series && Array.isArray(data.chart_series.dates) && data.chart_series.dates.length > 1) {
      state.chartSeries = data.chart_series;
      state.hoveredIndex = -1;
      // Ensure the canvas has its final layout size before drawing the chart.
      resizeCanvas();
      requestAnimationFrame(() => animateForecastWave(data.chart_series));
    } else {
      state.chartSeries = null;
      drawChartUnavailable('No held-out points available around this date.');
    }
  }

  /**
   * Handle Out-of-Range Replay Dates
   */
  function handleOutOfRange(msg) {
    if (el.textConditionHeadline) el.textConditionHeadline.textContent = 'Held-Out Evaluation Split';
    if (el.textConditionSummary) el.textConditionSummary.innerHTML = `<span style=\"color:#f87171;\">${msg}</span>`;
    if (el.numFocalAqi) el.numFocalAqi.textContent = '--';
    if (el.badgeCpcbCategory) {
      el.badgeCpcbCategory.className = 'cpcb-category-badge';
      el.badgeCpcbCategory.textContent = 'Out of Split';
    }
    if (el.textValPredicted) el.textValPredicted.textContent = '--';
    if (el.textValActual) el.textValActual.textContent = '--';
    if (el.textValPersistence) el.textValPersistence.textContent = '--';
    if (el.textValError) el.textValError.textContent = '--';
  }

  /**
   * Render Pollutants Capsules
   */
  function renderPollutants(pollutants) {
    if (!el.containerPollutantsRow || !pollutants) return;
    el.containerPollutantsRow.innerHTML = '';

    pollutants.forEach((p) => {
      const cap = document.createElement('div');
      cap.className = 'pollutant-capsule';
      const statusClass = p.status || 'normal';
      const label = statusClass === 'severe' ? 'Severe' : statusClass === 'exceeded' ? 'Exceeded' : 'Normal';

      cap.innerHTML = `
        <div class=\"capsule-sym\">${p.symbol}</div>
        <div class=\"capsule-num\">${p.value !== null ? p.value : '--'}</div>
        <div class=\"capsule-unit\">${p.unit}</div>
        <span class=\"capsule-badge ${statusClass}\">${label}</span>
      `;
      el.containerPollutantsRow.appendChild(cap);
    });
  }

  /**
   * Smooth Counter Animation
   */
  function animateAqiCounter(endVal) {
    if (!el.numFocalAqi || isNaN(endVal)) return;
    const startVal = parseInt(el.numFocalAqi.textContent, 10) || endVal;
    const duration = 600;
    const startTime = performance.now();

    function step(now) {
      const p = Math.min((now - startTime) / duration, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      const current = Math.round(startVal + (endVal - startVal) * ease);
      el.numFocalAqi.textContent = current;
      if (p < 1) requestAnimationFrame(step);
      else el.numFocalAqi.textContent = endVal;
    }
    requestAnimationFrame(step);
  }

  /**
   * Forecast Wave Canvas Rendering
   */
  function initCanvas() {
    if (!el.canvas) return;
    resizeCanvas();
  }

  function resizeCanvas() {
    if (!el.canvas) return;
    const rect = el.canvas.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const cssWidth = Math.max(1, Math.round(rect.width));
    const cssHeight = Math.max(1, Math.round(rect.height));
    // Resizing the canvas resets its drawing state; setTransform avoids cumulative scaling.
    el.canvas.width = Math.round(cssWidth * dpr);
    el.canvas.height = Math.round(cssHeight * dpr);
    const ctx = el.canvas.getContext('2d');
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function animateForecastWave(series) {
    const duration = 750;
    const startTime = performance.now();

    function step(now) {
      const p = Math.min((now - startTime) / duration, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      drawForecastWave(series, ease);
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function drawChartUnavailable(message) {
    if (!el.canvas) return;
    resizeCanvas();
    const ctx = el.canvas.getContext('2d');
    if (!ctx) return;
    const rect = el.canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(message, rect.width / 2, Math.max(28, rect.height / 2));
  }

  function drawForecastWave(series, progress) {
    if (!el.canvas || !series || !Array.isArray(series.dates) || series.dates.length < 2) return;
    if (![series.actuals, series.predictions, series.persistence].every((arr) => Array.isArray(arr) && arr.length >= 2)) {
      drawChartUnavailable('Chart data is incomplete.');
      return;
    }
    const ctx = el.canvas.getContext('2d');
    const width = el.canvas.getBoundingClientRect().width;
    const height = el.canvas.getBoundingClientRect().height;

    ctx.clearRect(0, 0, width, height);

    const padLeft = 32;
    const padRight = 24;
    const padTop = 16;
    const padBottom = 28;
    const plotW = width - padLeft - padRight;
    const plotH = height - padTop - padBottom;

    const values = [...series.actuals, ...series.predictions, ...series.persistence].filter((v) => !isNaN(v) && v > 0);
    const minVal = Math.max(0, Math.min(...values) - 25);
    const maxVal = Math.max(120, Math.max(...values) + 25);

    const n = series.dates.length;
    const getX = (i) => padLeft + (i / (n - 1)) * plotW;
    const getY = (val) => padTop + plotH - ((val - minVal) / (maxVal - minVal)) * plotH;

    // Background horizontal guides
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;
    for (let step = 0; step <= 3; step++) {
      const gVal = Math.round(minVal + (step / 3) * (maxVal - minVal));
      const gy = getY(gVal);
      ctx.beginPath();
      ctx.moveTo(padLeft, gy);
      ctx.lineTo(width - padRight, gy);
      ctx.stroke();

      ctx.fillStyle = '#64748b';
      ctx.font = '10px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(gVal, padLeft - 6, gy + 3);
    }

    // Number of points to render based on animation progress
    const pointsToDraw = Math.max(2, Math.floor(n * progress));

    // 1. Persistence Baseline (Thin Dotted Slate)
    drawWavePath(ctx, series.persistence.slice(0, pointsToDraw), getX, getY, 'rgba(148, 163, 184, 0.35)', 1.5, [3, 3]);

    // 2. Model Predicted (Dashed Gold)
    drawWavePath(ctx, series.predictions.slice(0, pointsToDraw), getX, getY, '#facc15', 2.2, [5, 4]);

    // 3. Derived Actual (Solid Glowing Teal Wave)
    drawWavePath(ctx, series.actuals.slice(0, pointsToDraw), getX, getY, '#2dd4bf', 3.2, []);

    // 4. Subtle Area Glow under Actual Wave
    fillWaveGlow(ctx, series.actuals.slice(0, pointsToDraw), getX, getY, padTop + plotH);

    // 5. Date Labels on Bottom Axis
    ctx.fillStyle = '#64748b';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    for (let i = 0; i < n; i += 2) {
      const rawDt = series.dates[i];
      const shortDt = rawDt ? formatUnambiguousDate(rawDt).slice(0, 6) : '';
      ctx.fillText(shortDt, getX(i), height - 8);
    }

    // 6. Active Day Beacon
    const activeIdx = series.dates.indexOf(series.active_date);
    if (activeIdx !== -1 && activeIdx < pointsToDraw) {
      const ax = getX(activeIdx);
      const ayAct = getY(series.actuals[activeIdx]);
      const ayPred = getY(series.predictions[activeIdx]);

      // Vertical guide
      ctx.strokeStyle = 'rgba(45, 212, 191, 0.25)';
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(ax, padTop);
      ctx.lineTo(ax, padTop + plotH);
      ctx.stroke();
      ctx.setLineDash([]);

      drawGlowingPoint(ctx, ax, ayAct, '#2dd4bf', 6);
      drawGlowingPoint(ctx, ax, ayPred, '#facc15', 4.5);
    }

    // 7. Hover Tooltip
    if (state.hoveredIndex >= 0 && state.hoveredIndex < pointsToDraw) {
      const hi = state.hoveredIndex;
      drawWaveTooltip(ctx, getX(hi), getY(series.actuals[hi]), series.dates[hi], series.actuals[hi], series.predictions[hi], series.persistence[hi], width, height);
    }
  }

  function drawWavePath(ctx, data, getX, getY, strokeColor, lineWidth, dash) {
    if (data.length < 2) return;
    ctx.save();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = lineWidth;
    ctx.setLineDash(dash);
    ctx.beginPath();

    ctx.moveTo(getX(0), getY(data[0]));
    for (let i = 0; i < data.length - 1; i++) {
      const x0 = getX(i);
      const y0 = getY(data[i]);
      const x1 = getX(i + 1);
      const y1 = getY(data[i + 1]);
      const cpx = (x0 + x1) / 2;
      ctx.bezierCurveTo(cpx, y0, cpx, y1, x1, y1);
    }
    ctx.stroke();
    ctx.restore();
  }

  function fillWaveGlow(ctx, data, getX, getY, bottomY) {
    if (data.length < 2) return;
    ctx.save();
    const grad = ctx.createLinearGradient(0, 0, 0, bottomY);
    grad.addColorStop(0, 'rgba(45, 212, 191, 0.16)');
    grad.addColorStop(1, 'rgba(45, 212, 191, 0.0)');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(getX(0), getY(data[0]));
    for (let i = 0; i < data.length - 1; i++) {
      const x0 = getX(i);
      const y0 = getY(data[i]);
      const x1 = getX(i + 1);
      const y1 = getY(data[i + 1]);
      const cpx = (x0 + x1) / 2;
      ctx.bezierCurveTo(cpx, y0, cpx, y1, x1, y1);
    }
    ctx.lineTo(getX(data.length - 1), bottomY);
    ctx.lineTo(getX(0), bottomY);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawGlowingPoint(ctx, x, y, color, r) {
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, r * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawWaveTooltip(ctx, x, y, rawDate, act, pred, pers, maxW, maxH) {
    const tipW = 158;
    const tipH = 78;
    let tipX = x + 12;
    let tipY = y - tipH - 8;

    if (tipX + tipW > maxW - 10) tipX = x - tipW - 12;
    if (tipY < 10) tipY = y + 14;

    ctx.save();
    ctx.fillStyle = 'rgba(12, 20, 24, 0.94)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(tipX, tipY, tipW, tipH, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(formatUnambiguousDate(rawDate), tipX + 10, tipY + 18);

    ctx.fillStyle = '#2dd4bf';
    ctx.fillText(`Derived Actual: ${act} AQI`, tipX + 10, tipY + 36);

    ctx.fillStyle = '#facc15';
    ctx.fillText(`Model Pred: ${pred} AQI`, tipX + 10, tipY + 52);

    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(`Baseline: ${pers} AQI`, tipX + 10, tipY + 68);
    ctx.restore();
  }

  function handleCanvasHover(e) {
    if (!state.chartSeries || !state.chartSeries.dates) return;
    const rect = el.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const padLeft = 32;
    const padRight = 24;
    const plotW = rect.width - padLeft - padRight;
    const n = state.chartSeries.dates.length;

    let closest = -1;
    let minDist = Infinity;
    for (let i = 0; i < n; i++) {
      const ptX = padLeft + (i / (n - 1)) * plotW;
      const d = Math.abs(mouseX - ptX);
      if (d < minDist && d < 28) {
        minDist = d;
        closest = i;
      }
    }

    if (closest !== state.hoveredIndex) {
      state.hoveredIndex = closest;
      drawForecastWave(state.chartSeries, 1.0);
    }
  }

  /**
   * Fetch Live Weather (Open-Meteo)
   */
  async function fetchLiveWeather() {
    try {
      const res = await fetch('/api/live/weather');
      if (res.ok) {
        const data = await res.json();
        state.liveWeather = data;
        renderLiveWeather(data);
      }
    } catch (e) {
      console.warn('Weather error:', e);
    }
  }

  function renderLiveWeather(data) {
    if (!el.containerLiveWeather || !data) return;
    const tom = data.tomorrow_forecast || {};

    el.containerLiveWeather.innerHTML = `
      <div class=\"glass-panel\" style=\"margin-bottom: 20px;\">
        <div style=\"display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;\">
          <div>
            <h3 style=\"margin:0; font-size:18px;\">Tomorrow's Meteorological Forecast</h3>
            <p style=\"margin:4px 0 0 0; font-size:12px; color:var(--text-muted);\">Source: Open-Meteo Asia/Kolkata Forecast</p>
          </div>
          <div style=\"font-family:var(--font-display); font-size:36px; font-weight:700; color:var(--text-main);\">
            ${tom.temp_max ?? '--'}° / ${tom.temp_min ?? '--'}°C
          </div>
        </div>
        <div class=\"weather-metrics-strip\">
          <div class=\"weather-metric-box\">
            <div class=\"metric-box-val\">${tom.humidity ?? '--'}%</div>
            <div class=\"metric-box-label\">Humidity</div>
          </div>
          <div class=\"weather-metric-box\">
            <div class=\"metric-box-val\">${tom.wind_speed_kmh ?? '--'} km/h</div>
            <div class=\"metric-box-label\">Wind Speed</div>
          </div>
          <div class=\"weather-metric-box\">
            <div class=\"metric-box-val\">${tom.precipitation_mm ?? 0} mm</div>
            <div class=\"metric-box-label\">Precipitation</div>
          </div>
        </div>
        <p style=\"font-size:13px; color:var(--text-sub); line-height:1.5; margin:16px 0 0 0;\">
          Condition: <strong>${tom.weather_desc ?? 'Clear'}</strong>. Meteorology is kept as an independent data stream separate from the air quality model.
        </p>
      </div>
    `;
  }

  /**
   * Fetch Live AQI Status
   */
  async function fetchLiveStatus() {
    try {
      const res = await fetch('/api/live/status');
      if (res.ok) {
        const data = await res.json();
        renderLiveStatus(data);
      }
    } catch (e) {
      console.warn('Status error:', e);
    }
  }

  function renderLiveStatus(data) {
    if (!el.containerLiveStatus || !data) return;
    el.containerLiveStatus.innerHTML = `
      <div class=\"glass-panel\" style=\"margin-bottom: 20px; border-color: rgba(248, 113, 113, 0.3);\">
        <div style=\"display:flex; align-items:center; gap:10px; color:#f87171; font-size:18px; font-weight:700; margin-bottom:10px;\">
          <span>🛑 ${data.message}</span>
        </div>
        <p style=\"font-size:14px; color:var(--text-sub); line-height:1.6; margin:0 0 16px 0;\">
          ${data.reason}
        </p>
        <div class=\"disclaimer-banner\">
          <div>
            <strong>Scientific Integrity Rule:</strong> ${data.provenance_disclaimer}
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Fetch Metrics
   */
  async function fetchMetricsData() {
    try {
      const res = await fetch('/api/replay/metrics');
      if (res.ok) {
        state.metricsData = await res.json();
        renderMetricsView(state.metricsData);
      }
    } catch (e) {
      console.warn('Metrics error:', e);
    }
  }

  function renderMetricsView(data) {
    if (!el.containerMetricsTable || !data) return;
    el.containerMetricsTable.innerHTML = `
      <div class=\"glass-panel\" style=\"margin-bottom: 24px;\">
        <div class=\"card-title-row\">
          <h3>Out-of-Time Frozen Test Evaluation</h3>
          <p>Strict chronological split: 2024 (Train) &bull; 2025 H1 (Validation) &bull; 2025 H2 (Final Test)</p>
        </div>
        <table style=\"width:100%; border-collapse:collapse; font-size:13px; margin-top:16px;\">
          <thead>
            <tr style=\"border-bottom: 1px solid var(--glass-border); text-align:left; color:var(--text-muted);\">
              <th style=\"padding:10px 12px;\">Horizon</th>
              <th style=\"padding:10px 12px;\">Model</th>
              <th style=\"padding:10px 12px;\">Test MAE</th>
              <th style=\"padding:10px 12px;\">Persistence Baseline</th>
              <th style=\"padding:10px 12px;\">Decision / Viva Concept</th>
            </tr>
          </thead>
          <tbody>
            <tr style=\"border-bottom: 1px solid var(--glass-border-subtle);\">
              <td style=\"padding:12px;\"><strong>1-Day Ahead</strong></td>
              <td style=\"padding:12px;\">GradientBoosting</td>
              <td style=\"padding:12px; color:#4ade80; font-family:var(--font-mono);\">15.78</td>
              <td style=\"padding:12px; font-family:var(--font-mono);\">21.50</td>
              <td style=\"padding:12px;\"><span style=\"color:#4ade80;\">✔ Beats baseline by 5.72 AQI points</span></td>
            </tr>
            <tr style=\"border-bottom: 1px solid var(--glass-border-subtle);\">
              <td style=\"padding:12px;\"><strong>2-Day Ahead</strong></td>
              <td style=\"padding:12px;\">RandomForest</td>
              <td style=\"padding:12px; color:#4ade80; font-family:var(--font-mono);\">29.03</td>
              <td style=\"padding:12px; font-family:var(--font-mono);\">30.72</td>
              <td style=\"padding:12px;\"><span style=\"color:#facc15;\">Marginal gain; provisional deployment</span></td>
            </tr>
            <tr>
              <td style=\"padding:12px;\"><strong>3-Day Ahead</strong></td>
              <td style=\"padding:12px;\">HistGradientBoosting</td>
              <td style=\"padding:12px; color:#f87171; font-family:var(--font-mono);\">39.10</td>
              <td style=\"padding:12px; font-family:var(--font-mono);\">33.43</td>
              <td style=\"padding:12px;\"><span style=\"color:#f87171;\">✖ Worse than baseline; persistence fallback used</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
  }

  document.addEventListener('DOMContentLoaded', init);
})();