const searchInput = document.getElementById("searchInput");
const searchButton = document.getElementById("searchButton");
const resetButton = document.getElementById("resetButton");
const resultsList = document.getElementById("resultsList");
const resultsCount = document.getElementById("resultsCount");
const searchStatus = document.getElementById("searchStatus");
const focusMap = document.getElementById("focusMap");
const searchSuggestions = document.getElementById("searchSuggestions");

let mapInstance;
let markers = [];
let suggestions = [];
let activeSuggestion = -1;
let debounceTimer;

const centerMoscow = [55.751244, 37.618423];

function setStatus(message) {
  if (searchStatus) {
    searchStatus.textContent = message;
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
  setStatus("Введите запрос и нажмите «Найти»." );
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
