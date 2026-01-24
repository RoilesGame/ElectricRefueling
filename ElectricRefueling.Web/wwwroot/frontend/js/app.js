const searchInput = document.getElementById("searchInput");
const searchButton = document.getElementById("searchButton");
const resetButton = document.getElementById("resetButton");
const resultsList = document.getElementById("resultsList");
const resultsCount = document.getElementById("resultsCount");
const alternativesHeader = document.getElementById("alternativesHeader");
const alternativesCount = document.getElementById("alternativesCount");
const alternativesList = document.getElementById("alternativesList");
const searchStatus = document.getElementById("searchStatus");
const focusMap = document.getElementById("focusMap");
const searchSuggestions = document.getElementById("searchSuggestions");

const carDatasetButton = document.getElementById("carDatasetButton");
const carManualButton = document.getElementById("carManualButton");
const carDatasetPanel = document.getElementById("carDatasetPanel");
const carManualPanel = document.getElementById("carManualPanel");
const carSearchInput = document.getElementById("carSearchInput");
const carSearchButton = document.getElementById("carSearchButton");
const carList = document.getElementById("carList");
const savedCarsSection = document.getElementById("savedCarsSection");
const savedCarsList = document.getElementById("savedCarsList");
const manualBrand = document.getElementById("manualBrand");
const manualModel = document.getElementById("manualModel");
const manualPlug = document.getElementById("manualPlug");
const manualRange = document.getElementById("manualRange");
const manualFastCharge = document.getElementById("manualFastCharge");
const chargeSlider = document.getElementById("chargeSlider");
const chargeValue = document.getElementById("chargeValue");
const saveCarButton = document.getElementById("saveCarButton");
const calculateRouteButton = document.getElementById("calculateRouteButton");
const carStatus = document.getElementById("carStatus");
const locationInput = document.getElementById("locationInput");
const locationApplyButton = document.getElementById("locationApplyButton");
const locationAutoButton = document.getElementById("locationAutoButton");
const locationStatus = document.getElementById("locationStatus");

let mapInstance;
let markers = [];
let suggestions = [];
let activeSuggestion = -1;
let debounceTimer;

let selectedCar = null;
let carMode = "dataset";
let currentUserId = null;
let currentUsername = null;
let currentRoute = null;
let locationNotice = null;
let locationOverride = null;
let userPlacemark = null;
let candidatePlacemarks = [];
let roadWorkPlacemarks = [];
let plugRangesCache = null;
const assumeType2Stations = true;

const centerMoscow = [55.751244, 37.618423];

function setStatus(message) {
  if (searchStatus) {
    searchStatus.textContent = message;
  }
}

function setCarStatus(message, isError = false) {
  if (!carStatus) return;
  carStatus.textContent = message;
  carStatus.style.color = isError ? "#f38a8a" : "";
}

function setLocationStatus(message, isError = false) {
  if (!locationStatus) return;
  locationStatus.textContent = message;
  locationStatus.style.color = isError ? "#f38a8a" : "";
}

function loadAuthFromStorage() {
  const storedUserId = localStorage.getItem("er_user_id");
  const storedUsername = localStorage.getItem("er_username");
  if (storedUserId && storedUsername) {
    currentUserId = Number(storedUserId);
    currentUsername = storedUsername;
  }
}

async function fetchUserCars(userId) {
  const url = new URL("/api/user-cars", window.location.origin);
  url.searchParams.set("userId", userId);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Не удалось загрузить сохранённые авто.");
  }
  return response.json();
}

function renderSavedCars(cars) {
  if (!savedCarsSection || !savedCarsList) return;
  savedCarsList.innerHTML = "";

  if (cars.length === 0) {
    savedCarsSection.hidden = true;
    return;
  }

  savedCarsSection.hidden = false;
  cars.forEach((car) => {
    const item = document.createElement("div");
    item.className = "car__saved-item";
    item.innerHTML = `
      <div class="car__item-title">${car.brand ?? ""} ${car.model ?? ""}</div>
      <div class="car__item-meta">
        <span>Запас хода: ${car.rangeKm ?? "-"} км</span>
        <span>Разъём: ${car.plugType ?? "-"}</span>
      </div>
    `;
    item.addEventListener("click", () => {
      selectedCar = car;
      document.querySelectorAll(".car__saved-item").forEach(el => el.classList.remove("car__saved-item--active"));
      item.classList.add("car__saved-item--active");
      setCarStatus(`Вы выбрали: ${car.brand ?? ""} ${car.model ?? ""}`);
    });
    savedCarsList.appendChild(item);
  });
}

async function refreshSavedCars() {
  if (!currentUserId) {
    if (savedCarsSection) savedCarsSection.hidden = true;
    return;
  }
  try {
    const cars = await fetchUserCars(currentUserId);
    renderSavedCars(cars);
  } catch (error) {
    setCarStatus(error.message || "Ошибка загрузки сохранённых авто.", true);
  }
}


function clearAlternatives() {
  if (!alternativesList) return;
  alternativesList.innerHTML = "";
  if (alternativesHeader) alternativesHeader.hidden = true;
  if (alternativesList) alternativesList.hidden = true;
  if (alternativesCount) alternativesCount.textContent = "0";
  if (resultsList) resultsList.style.maxHeight = "calc(var(--map-height) - 90px)";
}

function clearResults() {
  resultsList.innerHTML = "";
  resultsCount.textContent = "0";
}

function clearMarkers() {
  markers.forEach(marker => mapInstance.geoObjects.remove(marker.placemark));
  markers = [];
}

function clearCandidatePlacemarks() {
  if (!mapInstance) return;
  candidatePlacemarks.forEach((placemark) => mapInstance.geoObjects.remove(placemark));
  candidatePlacemarks = [];
}

function clearRoadWorkPlacemarks() {
  if (!mapInstance) return;
  roadWorkPlacemarks.forEach((placemark) => mapInstance.geoObjects.remove(placemark));
  roadWorkPlacemarks = [];
}

function buildAddress(station) {
  const parts = [station.address, station.district, station.admArea];
  return parts.filter(Boolean).join(", ");
}

function haversineKm(a, b) {
  const toRad = (v) => (v * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function flattenCoordinates(coords, acc) {
  if (!Array.isArray(coords)) return;
  if (typeof coords[0] === "number") {
    acc.push(coords);
    return;
  }
  coords.forEach((entry) => flattenCoordinates(entry, acc));
}

function getChargeRangeKm(car, chargePercent) {
  const range = car?.rangeKm ?? null;
  if (!range || Number.isNaN(range)) return null;
  return (range * chargePercent) / 100;
}

function getSelectedCarData() {
  if (carMode === "dataset") {
    return selectedCar;
  }
  const brand = manualBrand?.value.trim();
  const model = manualModel?.value.trim();
  if (!brand || !model) return null;
  return {
    brand,
    model,
    plugType: manualPlug?.value.trim() || null,
    rangeKm: manualRange?.value ? Number(manualRange.value) : null,
    fastChargeKmH: manualFastCharge?.value ? Number(manualFastCharge.value) : null
  };
}

function normalizePlugType(raw) {
  if (!raw) return null;
  const upper = raw.toString().trim().toUpperCase();
  if (!upper) return null;
  if (upper.includes("CHADEMO")) return "CHADEMO";
  if (upper.includes("CCS")) return "CCS";
  if (upper.includes("TESLA")) return "TESLA";
  if (upper.includes("GB/T") || upper.includes("GBT")) {
    return upper.includes("DC") ? "GBT_DC" : "GBT_AC";
  }
  if (upper.includes("TYPE1") || upper.includes("TYPE 1")) return "TYPE1";
  if (upper.includes("TYPE2") || upper.includes("TYPE 2")) return "TYPE2";
  return upper.replace(/\s+/g, "_");
}
function isType2Family(plugType) {
  if (!plugType) return false;
  return plugType === "TYPE2" || plugType === "CCS" || plugType === "CHADEMO";
}


function parseStationPowerKw(raw) {
  if (!raw) return null;
  const text = raw.toString().replace(",", ".");
  const matches = text.match(/\d+(?:\.\d+)?/g);
  if (!matches || matches.length === 0) return null;
  const values = matches.map((v) => Number(v)).filter((v) => !Number.isNaN(v));
  if (values.length === 0) return null;
  return Math.max(...values);
}

function getStationPlugTypes(powerKw, ranges) {
  if (powerKw == null) return [];
  return ranges
    .filter((range) => powerKw >= range.minPowerKw && powerKw <= range.maxPowerKw)
    .map((range) => range.plugType);
}

async function geocodeCached(address, cachePrefix) {
  if (!address) return null;
  const key = `${cachePrefix || "geo"}:${address}`;
  const cached = localStorage.getItem(key);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      return [parsed.lat, parsed.lon];
    } catch {
      localStorage.removeItem(key);
    }
  }

  const point = await geocodeAddress(address);
  if (!point) return null;
  const coords = [parseFloat(point.lat), parseFloat(point.lon)];
  localStorage.setItem(key, JSON.stringify({ lat: coords[0], lon: coords[1] }));
  return coords;
}

async function fetchRoadWorks() {
  const response = await fetch("/api/roadworks");
  if (!response.ok) {
    return [];
  }
  return response.json();
}

async function fetchPlugRanges() {
  if (plugRangesCache) return plugRangesCache;
  const response = await fetch("/api/plug-ranges");
  if (!response.ok) {
    plugRangesCache = [];
    return plugRangesCache;
  }
  plugRangesCache = await response.json();
  return plugRangesCache;
}

async function getRoadWorkPoints() {
  const works = await fetchRoadWorks();
  const limited = works.slice(0, 80);
  const points = [];
  for (const work of limited) {
    const coords = await geocodeCached(work.worksPlace, "rw");
    if (coords) {
      points.push({ coords, title: work.worksPlace });
    }
  }
  return points;
}

function routeHasRoadWorks(route, roadWorks) {
  if (!roadWorks.length) return false;
  const points = [];
  const paths = route.getPaths();
  paths.each((path) => {
    const coords = path.geometry.getCoordinates();
    flattenCoordinates(coords, points);
  });

  for (const pt of points) {
    for (const work of roadWorks) {
      if (haversineKm(pt, work.coords) < 0.3) {
        return true;
      }
    }
  }
  return false;
}

function getUserLocation() {
  locationNotice = null;
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Геолокация недоступна."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve([pos.coords.latitude, pos.coords.longitude]),
      async (err) => {
        if (typeof ymaps !== "undefined" && ymaps.geolocation) {
          try {
            const result = await ymaps.geolocation.get({ provider: "browser", mapStateAutoApply: false });
            const first = result.geoObjects.get(0);
            if (first) {
              resolve(first.geometry.getCoordinates());
              return;
            }
            const fallback = await ymaps.geolocation.get({ provider: "yandex", mapStateAutoApply: false });
            const fallbackFirst = fallback.geoObjects.get(0);
            if (fallbackFirst) {
              resolve(fallbackFirst.geometry.getCoordinates());
              return;
            }
          } catch {
          }
        }

        const center = mapInstance?.getCenter?.() ?? centerMoscow;
        locationNotice = err?.code === 1
          ? "Доступ к геолокации запрещён. Используем центр карты."
          : "Геолокация недоступна. Используем центр карты.";
        resolve(center);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    );
  });
}

function hideSuggestions() {
  if (searchSuggestions) {
    searchSuggestions.hidden = true;
    searchSuggestions.innerHTML = "";
  }
  suggestions = [];
  activeSuggestion = -1;
}

function renderSuggestions(items) {
  if (!searchSuggestions) return;

  searchSuggestions.innerHTML = "";
  suggestions = items;
  activeSuggestion = -1;

  if (items.length === 0) {
    hideSuggestions();
    return;
  }

  items.forEach((item, index) => {
    const div = document.createElement("div");
    div.className = "suggestion-item";
    const address = buildAddress(item) || "Адрес не указан";
    div.innerHTML = `
      <div class="suggestion-title">${item.stationName || item.name || "Без названия"}</div>
      <div class="suggestion-meta">
        <span>Мощность: ${item.power || "-"}</span>
        <span>${address}</span>
      </div>
    `;
    div.addEventListener("click", () => {
      searchInput.value = item.stationName || item.name || "";
      hideSuggestions();
      handleSearch();
    });
    div.addEventListener("mouseenter", () => {
      activeSuggestion = index;
      updateSuggestionActive();
    });
    searchSuggestions.appendChild(div);
  });

  searchSuggestions.hidden = false;
}

function updateSuggestionActive() {
  if (!searchSuggestions) return;
  const items = Array.from(searchSuggestions.children);
  items.forEach((item, index) => {
    item.classList.toggle("suggestion-item--active", index === activeSuggestion);
  });
}


function renderAlternatives(candidates) {
  if (!alternativesList || !alternativesHeader) return;
  alternativesList.innerHTML = "";
  if (!candidates || candidates.length == 0) {
    alternativesHeader.hidden = true;
    alternativesList.hidden = true;
    if (alternativesCount) alternativesCount.textContent = "0";
    return;
  }

  alternativesHeader.hidden = false;
  alternativesList.hidden = false;
  if (alternativesCount) alternativesCount.textContent = candidates.length.toString();
  if (resultsList) resultsList.style.maxHeight = "calc((var(--map-height) - 140px) / 2)";

  candidates.forEach((candidate) => {
    const station = candidate.station || candidate;
    const coords = candidate.coords;
    const card = document.createElement("div");
    card.className = "result-card";

    const title = document.createElement("div");
    title.className = "result-title";
    title.textContent = station.stationName || station.name || "??? ????????";

    const meta = document.createElement("div");
    meta.className = "result-meta";
    meta.innerHTML = `
      <span>????????: ${station.power || "-"}</span>
      <span>${buildAddress(station) || "????? ?? ??????"}</span>
      <span>??????????: ${candidate.distance?.toFixed(1) ?? "-"} ??</span>
    `;

    card.appendChild(title);
    card.appendChild(meta);

    card.addEventListener("click", () => {
      if (!coords || !mapInstance) return;
      const targetZoom = Math.min(mapInstance.getZoom() + 1, 13);
      mapInstance.setCenter(coords, targetZoom, { duration: 300 });
    });

    alternativesList.appendChild(card);
  });
}

function renderResults(stations) {
  clearResults();
  resultsCount.textContent = stations.length.toString();

  stations.forEach((station, index) => {
    const card = document.createElement("div");
    card.className = "result-card";
    card.dataset.index = index.toString();

    const title = document.createElement("div");
    title.className = "result-title";
    title.textContent = station.stationName || station.name || "Без названия";

    const meta = document.createElement("div");
    meta.className = "result-meta";
    meta.innerHTML = `
      <span>Мощность: ${station.power || "-"}</span>
      <span>${buildAddress(station) || "Адрес не указан"}</span>
    `;

    card.appendChild(title);
    card.appendChild(meta);

    card.addEventListener("click", () => {
      const marker = markers[index];
      if (!marker) return;
      const targetZoom = Math.min(mapInstance.getZoom() + 1, 13);
      mapInstance.setCenter(marker.coords, targetZoom, { duration: 300 });
      marker.placemark.balloon.open();
    });

    resultsList.appendChild(card);
  });
}

function renderCarList(cars) {
  if (!carList) return;
  carList.innerHTML = "";

  cars.forEach(car => {
    const item = document.createElement("div");
    item.className = "car__item";
    item.innerHTML = `
      <div class="car__item-title">${car.brand ?? ""} ${car.model ?? ""}</div>
      <div class="car__item-meta">
        <span>Запас хода: ${car.rangeKm ?? "-"} км</span>
        <span>Разъём: ${car.plugType ?? "-"}</span>
        <span>Быстрая зарядка: ${car.fastChargeKmH ?? "-"} км/ч</span>
      </div>
    `;
    item.addEventListener("click", () => {
      selectedCar = car;
      document.querySelectorAll(".car__item").forEach(el => el.classList.remove("car__item--active"));
      item.classList.add("car__item--active");
      setCarStatus(`Вы выбрали: ${car.brand ?? ""} ${car.model ?? ""}`);
    });
    carList.appendChild(item);
  });

  if (cars.length === 0) {
    setCarStatus("Автомобили не найдены.");
  }
}

async function fetchCars(query) {
  const url = new URL("/api/cars", window.location.origin);
  if (query) {
    url.searchParams.set("query", query);
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Не удалось загрузить список автомобилей");
  }
  return response.json();
}

async function handleCarSearch() {
  const query = carSearchInput?.value.trim();
  if (!query) {
    renderCarList([]);
    setCarStatus("Введите марку или модель.");
    return;
  }

  setCarStatus("Поиск автомобилей...");
  try {
    const cars = await fetchCars(query);
    renderCarList(cars);
    if (cars.length > 0) {
      setCarStatus("Выберите автомобиль из списка.");
    }
  } catch (error) {
    setCarStatus(error.message || "Ошибка поиска автомобилей.", true);
  }
}

async function saveUserCar() {
  if (!currentUserId) {
    setCarStatus("Войдите в аккаунт, чтобы сохранять авто.", true);
    return;
  }

  let payload = null;
  if (carMode === "dataset") {
    if (!selectedCar) {
      setCarStatus("Выберите автомобиль из списка.", true);
      return;
    }
    payload = { userId: currentUserId, carId: selectedCar.id, alias: null };
  } else {
    const brand = manualBrand?.value.trim();
    const model = manualModel?.value.trim();
    if (!brand || !model) {
      setCarStatus("Укажите марку и модель.", true);
      return;
    }
    setCarStatus("Ручной ввод пока сохраняется только локально.");
    localStorage.setItem("er_manual_car", JSON.stringify({
      brand,
      model,
      plugType: manualPlug?.value.trim() || null,
      rangeKm: manualRange?.value ? Number(manualRange.value) : null,
      fastChargeKmH: manualFastCharge?.value ? Number(manualFastCharge.value) : null
    }));
    return;
  }

  const response = await fetch("/api/user-cars", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    setCarStatus("Не удалось сохранить автомобиль.", true);
    return;
  }

  setCarStatus("Автомобиль сохранён в профиле.");
  refreshSavedCars();
}

async function calculateRoute() {
  if (!mapInstance || typeof ymaps === "undefined") {
    setCarStatus("Карта ещё не готова.", true);
    return;
  }

  const car = getSelectedCarData();
  if (!car) {
    setCarStatus("Сначала выберите авто или заполните параметры.", true);
    return;
  }

  const chargePercent = Number(chargeSlider?.value ?? 0);
  const availableRange = getChargeRangeKm(car, chargePercent);
  if (!availableRange) {
    setCarStatus("Недостаточно данных для расчёта запаса хода.", true);
    return;
  }

  const normalizedPlug = normalizePlugType(car?.plugType);
  const plugRanges = await fetchPlugRanges();
  if (normalizedPlug && plugRanges.length > 0) {
    const supported = plugRanges.some((range) => range.plugType === normalizedPlug);
    if (!supported) {
      setCarStatus("Разъём авто не поддерживается для подбора станций.", true);
      return;
    }
  }

  let userCoords;
  if (locationOverride) {
    userCoords = locationOverride;
    setCarStatus("Используем указанное местоположение.");
  } else {
    setCarStatus("Определяем ваше местоположение...");
    try {
      userCoords = await getUserLocation();
    } catch (error) {
      setCarStatus(error.message || "Не удалось получить местоположение.", true);
      return;
    }
    if (locationNotice) {
      setCarStatus(locationNotice);
    }
  }

  if (mapInstance) {
    if (userPlacemark) {
      mapInstance.geoObjects.remove(userPlacemark);
    }
    userPlacemark = new ymaps.Placemark(userCoords, { iconCaption: "Вы здесь" }, { preset: "islands#redDotIcon" });
    mapInstance.geoObjects.add(userPlacemark);
  }

  setCarStatus("Подбираем подходящие станции...");
  const stations = await fetchStations("");
  const stationPoints = [];
  const allPoints = [];
  for (const station of stations) {
    const address = buildAddress(station) || station.name;
    if (!address) continue;
    const coords = await geocodeCached(address, "st");
    if (!coords) continue;
    const distance = haversineKm(userCoords, coords);

    let plugOk = true;
    if (normalizedPlug && plugRanges.length > 0) {
      if (!assumeType2Stations || !isType2Family(normalizedPlug)) {
        const powerKw = parseStationPowerKw(station.power);
        const stationPlugTypes = getStationPlugTypes(powerKw, plugRanges);
        plugOk = stationPlugTypes.includes(normalizedPlug);
      }
    }

    if (!plugOk) {
      continue;
    }

    allPoints.push({ station, coords, distance });

    if (distance <= availableRange) {
      stationPoints.push({ station, coords, distance });
    }
  }

  stationPoints.sort((a, b) => a.distance - b.distance);
  allPoints.sort((a, b) => a.distance - b.distance);
  if (stationPoints.length === 0) {
    setCarStatus("Подходящих станций в пределах запаса хода не найдено.", true);
    return;
  }

  clearResults();
  renderResults(stationPoints.slice(0, 6).map(p => p.station));
  renderAlternatives([]);

  clearCandidatePlacemarks();
  stationPoints.slice(0, 6).forEach((candidate, index) => {
    const title = candidate.station.stationName || candidate.station.name || "Станция";
    const address = buildAddress(candidate.station) || candidate.station.name || "Адрес не указан";
    const placemark = new ymaps.Placemark(candidate.coords, {
      balloonContentHeader: `${index === 0 ? "Ближайшая станция" : "Запасной вариант"}: ${title}`,
      balloonContentBody: `Адрес: ${address}<br/>Мощность: ${candidate.station.power || "-"}<br/>Расстояние: ${candidate.distance.toFixed(1)} км`,
      balloonContentFooter: candidate.station.balanceHolder || ""
    }, {
      preset: index === 0 ? "islands#orangeIcon" : "islands#darkOrangeIcon"
    });
    mapInstance.geoObjects.add(placemark);
    candidatePlacemarks.push(placemark);
  });


  setCarStatus("Учитываем дорожные работы...");
  const roadWorks = await getRoadWorkPoints();

  clearRoadWorkPlacemarks();
  roadWorks.forEach((work) => {
    const placemark = new ymaps.Placemark(work.coords, {
      iconCaption: "Дорожные работы",
      balloonContentHeader: "Дорожные работы",
      balloonContentBody: work.title
    }, {
      preset: "islands#redCircleIcon"
    });
    mapInstance.geoObjects.add(placemark);
    roadWorkPlacemarks.push(placemark);
  });

  for (const candidate of stationPoints.slice(0, 12)) {
    setCarStatus(`Проверяем маршрут до ${candidate.station.stationName || candidate.station.name}...`);
    try {
      const route = await ymaps.route([userCoords, candidate.coords], { mapStateAutoApply: false });
      if (routeHasRoadWorks(route, roadWorks)) {
        continue;
      }

      if (currentRoute) {
        mapInstance.geoObjects.remove(currentRoute);
      }

      currentRoute = route;
      mapInstance.geoObjects.add(route);
      mapInstance.setBounds(route.getBounds(), { checkZoomRange: true, zoomMargin: 40 });
      setCarStatus("Маршрут построен с учётом дорожных работ.");
      return;
    } catch {
      continue;
    }
  }

  setCarStatus("Не удалось построить маршрут без дорожных работ.", true);
}

async function handleSearch() {
  const query = searchInput.value.trim();
  if (!query) {
    setStatus("Введите запрос для поиска.");
    return;
  }

  setStatus("Идет поиск станций...");

  try {
    const stations = await fetchStations(query);
    const limitedStations = stations.slice(0, 25);

    clearMarkers();
    renderResults(limitedStations);

    if (limitedStations.length === 0) {
      setStatus("Ничего не найдено.");
      return;
    }

    for (const station of limitedStations) {
      const address = buildAddress(station) || station.name;
      if (!address) continue;

      const point = await geocodeAddress(address);
      if (!point) continue;

      const coords = [parseFloat(point.lat), parseFloat(point.lon)];
      const placemark = new ymaps.Placemark(coords, {
        balloonContentHeader: station.stationName || station.name || "Станция",
        balloonContentBody: `Адрес: ${address}<br/>Мощность: ${station.power || "-"}`,
        balloonContentFooter: station.balanceHolder || "",
      }, {
        preset: "islands#orangeIcon"
      });

      mapInstance.geoObjects.add(placemark);
      markers.push({ placemark, coords });
    }

    if (markers.length > 0) {
      mapInstance.setBounds(mapInstance.geoObjects.getBounds(), {
        checkZoomRange: true,
        zoomMargin: 40
      });
      if (mapInstance.getZoom() > 13) {
        mapInstance.setZoom(13, { duration: 200 });
      }
    }

    setStatus("Поиск завершен.");
  } catch (error) {
    setStatus(error.message || "Произошла ошибка при поиске.");
  }
}

async function fetchStations(query) {
  const url = new URL("/api/stations", window.location.origin);
  if (query) {
    url.searchParams.set("query", query);
  }

  const response = await fetch(url);
  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Не удалось загрузить список станций (${response.status}). ${details}`);
  }

  return response.json();
}

async function geocodeAddress(query) {
  const url = new URL("/api/geocode", window.location.origin);
  url.searchParams.set("query", query);

  const response = await fetch(url);
  if (!response.ok) {
    return null;
  }

  return response.json();
}

async function handleSuggest() {
  const query = searchInput.value.trim();
  if (!query) {
    hideSuggestions();
    return;
  }

  try {
    const stations = await fetchStations(query);
    renderSuggestions(stations.slice(0, 6));
  } catch {
    hideSuggestions();
  }
}

function resetSearch() {
  searchInput.value = "";
  setStatus("Введите запрос и нажмите <Найти>." );
  clearResults();
  clearAlternatives();
  hideSuggestions();
  if (mapInstance) {
    clearMarkers();
    mapInstance.setCenter(centerMoscow, 10, { duration: 300 });
  }
}

function initMap() {
  mapInstance = new ymaps.Map("mapCanvas", {
    center: centerMoscow,
    zoom: 10,
    controls: ["zoomControl", "typeSelector", "fullscreenControl"]
  }, {
    suppressMapOpenBlock: true
  });
}

if (typeof ymaps !== "undefined") {
  ymaps.ready(initMap);
}

carDatasetButton?.addEventListener("click", () => {
  carMode = "dataset";
  carDatasetPanel.hidden = false;
  carManualPanel.hidden = true;
  carDatasetButton.classList.add("primary-button");
  carDatasetButton.classList.remove("ghost-button");
  carManualButton.classList.add("ghost-button");
  carManualButton.classList.remove("primary-button");
});

carManualButton?.addEventListener("click", () => {
  carMode = "manual";
  carDatasetPanel.hidden = true;
  carManualPanel.hidden = false;
  carManualButton.classList.add("primary-button");
  carManualButton.classList.remove("ghost-button");
  carDatasetButton.classList.add("ghost-button");
  carDatasetButton.classList.remove("primary-button");
  setCarStatus("Введите параметры вручную.");
});

carSearchButton?.addEventListener("click", async () => {
  await handleCarSearch();
});

let carSearchTimer;
carSearchInput?.addEventListener("input", () => {
  clearTimeout(carSearchTimer);
  carSearchTimer = setTimeout(handleCarSearch, 250);
});

chargeSlider?.addEventListener("input", () => {
  if (chargeValue) {
    chargeValue.textContent = `${chargeSlider.value}%`;
  }
  const value = Number(chargeSlider.value || 0);
  const clamped = Math.max(1, Math.min(100, value));
  chargeSlider.style.background = `linear-gradient(90deg, var(--accent) 0%, var(--accent) ${clamped}%, rgba(255, 255, 255, 0.15) ${clamped}%)`;
});

saveCarButton?.addEventListener("click", () => {
  saveUserCar().catch(() => setCarStatus("Не удалось сохранить авто.", true));
});

calculateRouteButton?.addEventListener("click", () => {
  calculateRoute().catch((error) => {
    setCarStatus(error?.message || "Ошибка построения маршрута.", true);
  });
});

locationApplyButton?.addEventListener("click", async () => {
  const query = locationInput?.value.trim();
  if (!query) {
    setLocationStatus("Введите адрес или район.", true);
    return;
  }
  setLocationStatus("Определяем координаты...");
  const coords = await geocodeCached(query, "user");
  if (!coords) {
    setLocationStatus("Не удалось найти указанный адрес.", true);
    return;
  }
  locationOverride = coords;
  setLocationStatus("Местоположение задано вручную.");
  mapInstance?.setCenter(coords, 11, { duration: 300 });
  if (mapInstance) {
    if (userPlacemark) {
      mapInstance.geoObjects.remove(userPlacemark);
    }
    userPlacemark = new ymaps.Placemark(coords, { iconCaption: "Вы здесь" }, { preset: "islands#redDotIcon" });
    mapInstance.geoObjects.add(userPlacemark);
  }
});

locationAutoButton?.addEventListener("click", () => {
  locationOverride = null;
  setLocationStatus("Определяем местоположение автоматически...");
  getUserLocation()
    .then((coords) => {
      setLocationStatus("Местоположение определено автоматически.");
      if (mapInstance) {
        mapInstance.setCenter(coords, 11, { duration: 300 });
        if (userPlacemark) {
          mapInstance.geoObjects.remove(userPlacemark);
        }
        userPlacemark = new ymaps.Placemark(coords, { iconCaption: "Вы здесь" }, { preset: "islands#redDotIcon" });
        mapInstance.geoObjects.add(userPlacemark);
      }
    })
    .catch(() => {
      setLocationStatus("Не удалось определить местоположение автоматически.", true);
    });
});
searchButton?.addEventListener("click", handleSearch);
resetButton?.addEventListener("click", resetSearch);
searchInput?.addEventListener("keydown", (event) => {
  if (!searchSuggestions?.hidden && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
    event.preventDefault();
    const maxIndex = suggestions.length - 1;
    if (event.key === "ArrowDown") {
      activeSuggestion = Math.min(maxIndex, activeSuggestion + 1);
    } else {
      activeSuggestion = Math.max(0, activeSuggestion - 1);
    }
    updateSuggestionActive();
    return;
  }

  if (event.key === "Enter" && activeSuggestion >= 0) {
    event.preventDefault();
    const picked = suggestions[activeSuggestion];
    const text = picked?.stationName || picked?.name || picked?.address;
    if (text) {
      searchInput.value = text;
    }
    hideSuggestions();
    handleSearch();
    return;
  }

  if (event.key === "Enter") {
    handleSearch();
  }
});

searchInput?.addEventListener("input", () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(handleSuggest, 250);
});

searchInput?.addEventListener("focus", () => {
  if (searchInput.value.trim()) {
    handleSuggest();
  }
});

document.addEventListener("click", (event) => {
  if (!searchSuggestions || !searchInput) return;
  if (!searchSuggestions.contains(event.target) && event.target !== searchInput) {
    hideSuggestions();
  }
});

focusMap?.addEventListener("click", () => {
  document.getElementById("map")?.scrollIntoView({ behavior: "smooth" });
});

loadAuthFromStorage();
if (chargeValue) {
  chargeValue.textContent = `${chargeSlider?.value ?? 65}%`;
}
if (chargeSlider) {
  const value = Number(chargeSlider.value || 65);
  const clamped = Math.max(1, Math.min(100, value));
  chargeSlider.style.background = `linear-gradient(90deg, var(--accent) 0%, var(--accent) ${clamped}%, rgba(255, 255, 255, 0.15) ${clamped}%)`;
}
refreshSavedCars();
setLocationStatus("Можно ввести адрес вручную или определить автоматически.");
