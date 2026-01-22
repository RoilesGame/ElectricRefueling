const searchInput = document.getElementById("searchInput");
const searchButton = document.getElementById("searchButton");
const resetButton = document.getElementById("resetButton");
const resultsList = document.getElementById("resultsList");
const resultsCount = document.getElementById("resultsCount");
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
const manualBrand = document.getElementById("manualBrand");
const manualModel = document.getElementById("manualModel");
const manualPlug = document.getElementById("manualPlug");
const manualRange = document.getElementById("manualRange");
const manualFastCharge = document.getElementById("manualFastCharge");
const chargeSlider = document.getElementById("chargeSlider");
const chargeValue = document.getElementById("chargeValue");
const saveCarButton = document.getElementById("saveCarButton");
const carStatus = document.getElementById("carStatus");

let mapInstance;
let markers = [];
let suggestions = [];
let activeSuggestion = -1;
let debounceTimer;

let selectedCar = null;
let carMode = "dataset";
let currentUserId = null;
let currentUsername = null;

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

function loadAuthFromStorage() {
  const storedUserId = localStorage.getItem("er_user_id");
  const storedUsername = localStorage.getItem("er_username");
  if (storedUserId && storedUsername) {
    currentUserId = Number(storedUserId);
    currentUsername = storedUsername;
  }
}

function clearResults() {
  resultsList.innerHTML = "";
  resultsCount.textContent = "0";
}

function clearMarkers() {
  markers.forEach(marker => mapInstance.geoObjects.remove(marker.placemark));
  markers = [];
}

function buildAddress(station) {
  const parts = [station.address, station.district, station.admArea];
  return parts.filter(Boolean).join(", ");
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
    throw new Error("Не удалось загрузить список станций");
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
