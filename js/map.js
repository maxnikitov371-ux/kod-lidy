(function () {
  const MAP_CENTER = [53.891667, 25.302254];
  const MAP_ZOOM = 14;
  const MARKER_2_OFFSET_X = 12;
  const MARKER_2_OFFSET_Y = 8;
  const THEME_CLASSIC = 'classic';
  const THEME_LIGHT = 'light';
  const THEME_DARK = 'dark';

  const TILE_URLS = {
    light: 'https://cartodb-basemaps-{s}.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png',
    classic: 'https://cartodb-basemaps-{s}.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png',
    dark: 'https://cartodb-basemaps-{s}.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png'
  };

  const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

  const POINT_META = {
    1: { lat: 53.887, lng: 25.302, image: '01_lida_castle' },
    2: { lat: 53.888456, lng: 25.303017, image: '02_gediminas_monument' },
    3: { lat: 53.889293, lng: 25.303169, image: '03_church_holy_cross' },
    4: { lat: 53.89377, lng: 25.303056, image: '04_cathedral_st_michael' },
    5: { lat: 53.891646, lng: 25.295913, image: '05_lida_museum' },
    6: { lat: 53.89236, lng: 25.315396, image: '06_kurgan_slavy' },
    7: { lat: 53.88962, lng: 25.29864, image: '07_sundial' },
    8: { lat: 53.897057, lng: 25.303152, image: '08_lidskae_brewery_museum' }
  };

  function initMapPage(deps) {
    if (!deps || !deps.questData || !Array.isArray(deps.questData.points)) return;

    const mapEl = document.getElementById('map');
    const fallbackEl = document.getElementById('map-fallback');
    const fallbackMarkersEl = document.getElementById('map-fallback-markers');
    const statusEl = document.getElementById('map-status');
    if (!mapEl || !fallbackEl || !fallbackMarkersEl) return;

    const points = deps.questData.points
      .map((point) => {
        const meta = POINT_META[point.id];
        if (!meta) return null;
        return {
          ...point,
          lat: meta.lat,
          lng: meta.lng,
          markerImage: `../assets/images/markers/${point.id}.png`,
          modalImage: `../assets/images/points/${meta.image}.png`
        };
      })
      .filter(Boolean);

    const progress = (typeof deps.loadProgress === 'function') ? deps.loadProgress() : { completedPoints: {} };

    renderProgress(points.length, progress);
    bindModal(points, statusEl, progress, deps);

    if (!window.L) {
      activateFallback(points, fallbackEl, mapEl, fallbackMarkersEl, statusEl, progress, deps);
      setHint(statusEl, 'Не удалось загрузить тайлы карты. Включен резервный режим.');
      return;
    }

    let map = L.map(mapEl, {
      center: MAP_CENTER,
      zoom: MAP_ZOOM,
      zoomControl: true,
      attributionControl: true
    });

    let currentTheme = getCurrentTheme();
    let activeTileLayer = null;
    let tileLoaded = false;
    let tileErrors = 0;

    function attachTileLayerEvents(layer) {
      layer.on('tileload', function () {
        tileLoaded = true;
      });

      layer.on('tileerror', function () {
        tileErrors += 1;
      });
    }

    function applyThemeLayer(theme) {
      currentTheme = normalizeTheme(theme);
      tileLoaded = false;
      tileErrors = 0;

      const layer = L.tileLayer(getTileUrlForTheme(currentTheme), {
        maxZoom: 20,
        subdomains: 'abcd',
        attribution: TILE_ATTRIBUTION
      });

      attachTileLayerEvents(layer);

      if (activeTileLayer) {
        map.removeLayer(activeTileLayer);
      }

      activeTileLayer = layer;
      activeTileLayer.addTo(map);
    }

    applyThemeLayer(currentTheme);

    let marker2 = null;
    let marker2BaseLatLng = null;
    let point3BaseLatLng = null;

    points.forEach((point) => {
      const state = getPointState(point.id, progress, deps);
      const baseIconSize = [34, 34];
      const baseIconAnchor = [17, 34];
      const markerClass = `map-marker-icon map-marker-${state} map-marker-point-${point.id}`;
      const icon = L.icon({
        iconUrl: point.markerImage,
        iconSize: baseIconSize,
        iconAnchor: baseIconAnchor,
        className: markerClass
      });

      const marker = L.marker([point.lat, point.lng], { icon, title: point.title });
      marker.on('click', function () {
        handlePointClick(point, state, statusEl);
      });
      marker.addTo(map);
      if (point.id === 2) {
        marker2 = marker;
        marker2BaseLatLng = L.latLng(point.lat, point.lng);
      }
      if (point.id === 3) {
        point3BaseLatLng = L.latLng(point.lat, point.lng);
      }
    });

    fitMapToAllPoints(map, points);
    if (marker2 && marker2BaseLatLng) {
      const syncMarker2 = function () {
        syncMarker2VisualPosition(map, marker2, marker2BaseLatLng, point3BaseLatLng);
      };
      map.once('moveend', syncMarker2);
      map.on('zoomend', syncMarker2);
    }

    const onThemeChange = function (event) {
      if (!map || !activeTileLayer) return;
      const nextTheme = event && event.detail ? event.detail.theme : null;
      const normalizedNext = normalizeTheme(nextTheme);
      if (normalizedNext === currentTheme) return;
      applyThemeLayer(normalizedNext);
    };

    document.addEventListener('kod-lidy-theme-change', onThemeChange);

    window.setTimeout(function () {
      if (!tileLoaded && tileErrors > 0) {
        document.removeEventListener('kod-lidy-theme-change', onThemeChange);
        map.remove();
        map = null;
        activeTileLayer = null;
        activateFallback(points, fallbackEl, mapEl, fallbackMarkersEl, statusEl, progress, deps);
        setHint(statusEl, 'Не удалось загрузить тайлы карты. Включен резервный режим.');
      }
    }, 4500);
  }

  function fitMapToAllPoints(map, points) {
    if (!map || !Array.isArray(points) || points.length === 0) return;

    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng]));
    const paddedBounds = bounds.pad(0.08);
    const fitOptions = {
      padding: [48, 48],
      maxZoom: 14,
      animate: false
    };

    window.requestAnimationFrame(function () {
      map.invalidateSize();
      map.fitBounds(paddedBounds, fitOptions);
    });
  }

  function syncMarker2VisualPosition(map, marker2, marker2BaseLatLng, point3BaseLatLng) {
    if (!map || !marker2 || !marker2BaseLatLng) return;

    const zoom = map.getZoom();
    const p2Base = map.project(marker2BaseLatLng, zoom);
    let shiftedPoint = L.point(p2Base.x + MARKER_2_OFFSET_X, p2Base.y + MARKER_2_OFFSET_Y);

    // Keep a small visual gap from point 3 while preserving a rightward offset.
    if (point3BaseLatLng) {
      const p3 = map.project(point3BaseLatLng, zoom);
      const minGap = 16;
      const currentDistance = shiftedPoint.distanceTo(p3);

      if (currentDistance < minGap) {
        const dx = shiftedPoint.x - p3.x;
        const dy = shiftedPoint.y - p3.y;
        const len = Math.sqrt((dx * dx) + (dy * dy)) || 1;
        const scale = minGap / len;
        shiftedPoint = L.point(p3.x + (dx * scale), p3.y + (dy * scale));
      }
    }

    marker2.setLatLng(map.unproject(shiftedPoint, zoom));
  }

  function renderProgress(total, progress) {
    const done = Object.keys((progress && progress.completedPoints) || {}).length;
    const counter = document.querySelector('[data-map-progress]');
    const lettersEl = document.querySelector('[data-letters]');
    const bar = document.querySelector('[data-map-progressbar]');

    if (counter) counter.textContent = `${done}/${total}`;
    if (lettersEl) {
      const letters = [];
      for (let i = 1; i <= total; i += 1) {
        letters.push((progress.letters && progress.letters[String(i)]) || '-');
      }
      lettersEl.textContent = letters.join(' ');
    }
    if (bar) {
      bar.max = total;
      bar.value = done;
    }
  }

  function bindModal(points, statusEl, progress, deps) {
    const modal = document.getElementById('point-modal');
    const modalTitle = document.getElementById('map-modal-title');
    const modalImage = document.getElementById('map-modal-image');
    const modalText = document.getElementById('map-modal-text');
    const modalLink = document.getElementById('map-modal-link');
    if (!modal || !modalTitle || !modalImage || !modalText || !modalLink) return;

    function closeModal() {
      modal.classList.add('hidden');
      modal.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('map-modal-open');
    }

    function openModal(point) {
      modalTitle.textContent = point.title;
      if (typeof window.renderParagraphText === 'function') {
        window.renderParagraphText(modalText, point.text);
      } else {
        modalText.textContent = point.text || '';
      }
      modalImage.src = point.modalImage;
      modalImage.alt = point.title;
      modalLink.href = `point.html?id=${point.id}`;
      modal.classList.remove('hidden');
      modal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('map-modal-open');
    }

    modal.addEventListener('click', function (event) {
      if (event.target.closest('[data-modal-close]')) {
        closeModal();
        return;
      }
      if (!event.target.closest('.map-modal-dialog')) {
        closeModal();
      }
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !modal.classList.contains('hidden')) {
        closeModal();
      }
    });

    window.__kodLidyMapOpenPoint = function (pointId) {
      const point = points.find((p) => p.id === pointId);
      if (!point) return;
      const state = getPointState(point.id, progress, deps);
      if (state === 'closed') {
        setHint(statusEl, 'Сначала пройди предыдущую точку');
        return;
      }
      openModal(point);
    };
  }

  function activateFallback(points, fallbackEl, mapEl, fallbackMarkersEl, statusEl, progress, deps) {
    mapEl.classList.add('hidden');
    fallbackEl.classList.remove('hidden');
    fallbackMarkersEl.innerHTML = '';

    const bounds = getBounds(points);

    points.forEach((point) => {
      const state = getPointState(point.id, progress, deps);
      const pos = toPercent(point.lat, point.lng, bounds);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `map-fallback-marker map-marker-${state}`;
      btn.style.left = `${pos.x}%`;
      btn.style.top = `${pos.y}%`;
      btn.title = point.title;
      btn.setAttribute('aria-label', point.title);
      btn.innerHTML = `<img src="${point.markerImage}" alt="">`;
      btn.addEventListener('click', function () {
        handlePointClick(point, state, statusEl);
      });

      fallbackMarkersEl.appendChild(btn);
    });
  }

  function getBounds(points) {
    const lats = points.map((p) => p.lat);
    const lngs = points.map((p) => p.lng);

    return {
      minLat: Math.min.apply(null, lats),
      maxLat: Math.max.apply(null, lats),
      minLng: Math.min.apply(null, lngs),
      maxLng: Math.max.apply(null, lngs)
    };
  }

  function toPercent(lat, lng, bounds) {
    const lngRange = Math.max(bounds.maxLng - bounds.minLng, 0.0001);
    const latRange = Math.max(bounds.maxLat - bounds.minLat, 0.0001);
    const x = ((lng - bounds.minLng) / lngRange) * 100;
    const y = ((bounds.maxLat - lat) / latRange) * 100;

    return {
      x: clamp(x, 5, 95),
      y: clamp(y, 8, 94)
    };
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function getPointState(pointId, progress, deps) {
    const sid = String(pointId);
    const completed = !!(progress.completedPoints && progress.completedPoints[sid]);
    if (completed) return 'done';
    const available = (typeof deps.isPointAvailable === 'function') ? deps.isPointAvailable(progress, pointId) : false;
    return available ? 'open' : 'closed';
  }

  function handlePointClick(point, state, statusEl) {
    if (state === 'closed') {
      setHint(statusEl, 'Сначала пройди предыдущую точку');
      return;
    }

    if (typeof window.__kodLidyMapOpenPoint === 'function') {
      window.__kodLidyMapOpenPoint(point.id);
    }
  }

  function normalizeTheme(theme) {
    if (theme === THEME_LIGHT || theme === THEME_DARK || theme === THEME_CLASSIC) {
      return theme;
    }
    return THEME_CLASSIC;
  }

  function getCurrentTheme() {
    if (typeof window.getTheme === 'function') {
      return normalizeTheme(window.getTheme());
    }

    const fromAttr = document.documentElement.getAttribute('data-theme');
    return normalizeTheme(fromAttr);
  }

  function getTileUrlForTheme(theme) {
    const normalized = normalizeTheme(theme);
    return TILE_URLS[normalized] || TILE_URLS[THEME_CLASSIC];
  }

  let hintTimer = null;
  function setHint(statusEl, message) {
    if (!statusEl) return;
    statusEl.textContent = message;
    if (hintTimer) window.clearTimeout(hintTimer);
    hintTimer = window.setTimeout(function () {
      statusEl.textContent = '';
    }, 3500);
  }

  window.KodLidyMap = {
    initMapPage: initMapPage
  };
})();
