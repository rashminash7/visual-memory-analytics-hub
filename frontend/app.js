
const API_BASE_URL = "http://127.0.0.1:5000";

const $ = (id) => document.getElementById(id);

const els = {
    memoryStatus: $("memoryStatus"),
    stackTray: $("stackTray"),
    heapGrid: $("heapGrid"),
    executeFunctionBtn: $("executeFunctionBtn"),
    allocateDatasetBtn: $("allocateDatasetBtn"),
    clearStorageBtn: $("clearStorageBtn"),

    totalItems: $("totalItems"),
    loadFactor: $("loadFactor"),
    resizeInfo: $("resizeInfo"),
    cacheHits: $("cacheHits"),
    cacheMisses: $("cacheMisses"),

    dataStream: $("dataStream"),
    streamStatus: $("streamStatus"),

    searchForm: $("searchForm"),
    searchTarget: $("searchTarget"),
    searchBtn: $("searchBtn"),
    searchResult: $("searchResult"),
    searchTable: $("searchTable"),

    cacheInspector: $("cacheInspector"),
    refreshCacheBtn: $("refreshCacheBtn"),
    evictForm: $("evictForm"),
    evictCacheKey: $("evictCacheKey"),
    clearCacheBtn: $("clearCacheBtn"),
    cacheStatus: $("cacheStatus"),

    invalidRequestBtn: $("invalidRequestBtn"),
    serviceFailureBtn: $("serviceFailureBtn"),
    optimisticLockBtn: $("optimisticLockBtn"),
    errorStatus: $("errorStatus"),
    lockStatus: $("lockStatus")
};

let streamEvents = [];
let streamTimer = null;
let searchInProgress = false;


/* ---------------- API HELPER ---------------- */

async function apiRequest(path, options = {}) {
    const response = await fetch(`${API_BASE_URL}${path}`, options);

    let result;

    try {
        result = await response.json();
    } catch {
        throw new Error("Server returned an invalid JSON response.");
    }

    return { response, result };
}


function setFeedback(element, message, kind = "") {
    element.textContent = message;
    element.classList.remove("success", "error");

    if (kind) {
        element.classList.add(kind);
    }
}


function showEmpty(container, message) {
    container.innerHTML = "";

    const paragraph = document.createElement("p");
    paragraph.className = "empty";
    paragraph.textContent = message;

    container.appendChild(paragraph);
}


/* ---------------- THREE SCREEN NAVIGATION ---------------- */

document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
        document.querySelectorAll(".tab").forEach((item) => {
            item.classList.remove("active");
        });

        document.querySelectorAll(".screen").forEach((screen) => {
            screen.classList.remove("active");
        });

        tab.classList.add("active");
        $(tab.dataset.screen).classList.add("active");

        if (tab.dataset.screen === "screen02") {
            loadMemoryState();
            loadCacheStats();
        }

        if (tab.dataset.screen === "screen03") {
            loadCacheInspector();
            loadCacheStats();
        }
    });
});


/* ---------------- SCREEN 01: MEMORY ---------------- */

async function loadMemoryState() {
    try {
        const { response, result } =
            await apiRequest("/api/memory/state");

        if (!response.ok || result.status !== "success") {
            setFeedback(
                els.memoryStatus,
                result.message || "Unable to load memory state.",
                "error"
            );
            return;
        }

        renderMemoryState(result.data);
        updateMetrics(result.data);

    } catch {
        setFeedback(
            els.memoryStatus,
            "Cannot reach Flask API. Start backend/main.py.",
            "error"
        );
    }
}


function renderMemoryState(data) {
    els.stackTray.innerHTML = "";
    els.heapGrid.innerHTML = "";

    if (data.stack_frames.length === 0) {
        showEmpty(
            els.stackTray,
            "No active frames. Execute a local function to see one briefly."
        );
    } else {
        data.stack_frames.forEach((frame) => {
            const card = document.createElement("div");
            card.className = "memory-card";
            card.textContent =
                `${frame.name || "Function Call Frame"} · ${frame.id}`;

            els.stackTray.appendChild(card);
        });
    }

    if (data.heap_objects.length === 0) {
        showEmpty(
            els.heapGrid,
            "No allocated objects. Allocate a dataset to begin."
        );
    } else {
        data.heap_objects.forEach((object, index) => {
            const card = document.createElement("div");
            card.className = "memory-card";
            card.textContent =
                `Heap Object ${index + 1} · Size: ${object.data_size} · ID: ${object.id}`;

            els.heapGrid.appendChild(card);
        });
    }

    els.memoryStatus.textContent =
        `Stack ${data.memory_utilization.stack_count} · Heap ${data.memory_utilization.heap_count}`;

    els.memoryStatus.classList.remove("error");
}


function updateMetrics(data) {
    const metrics = data.memory_utilization;

    els.totalItems.textContent = data.heap_objects.length;
    els.loadFactor.textContent = `${metrics.load_factor ?? 0}%`;

    els.resizeInfo.textContent =
        `Capacity: ${metrics.collection_capacity} · Resizes: ${metrics.resize_count} · Collisions: ${metrics.collision_count ?? 0}`;

    els.resizeInfo.style.color =
        metrics.resize_count > 0 || metrics.collision_count > 0
            ? "#17684a"
            : "";
}


/* Execute a short-lived function frame */

els.executeFunctionBtn.addEventListener("click", async () => {
    setFeedback(els.memoryStatus, "Creating temporary stack frame...");

    try {
        const { response, result } =
            await apiRequest("/api/memory/function", {
                method: "POST"
            });

        if (!response.ok) {
            throw new Error(result.message || "Function request failed.");
        }

        await loadMemoryState();

        setFeedback(
            els.memoryStatus,
            "Function running. Its temporary frame will be released automatically.",
            "success"
        );

        setTimeout(loadMemoryState, 1400);

    } catch (error) {
        setFeedback(
            els.memoryStatus,
            error.message || "Unable to execute function.",
            "error"
        );
    }
});


/* Allocate a persistent heap object */

els.allocateDatasetBtn.addEventListener("click", async () => {
    els.allocateDatasetBtn.disabled = true;

    setFeedback(els.memoryStatus, "Allocating dataset...");

    try {
        const { response, result } =
            await apiRequest("/api/memory/allocate", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    data_size: 100
                })
            });

        if (!response.ok) {
            throw new Error(result.message || "Allocation failed.");
        }

        await loadMemoryState();
        await loadCacheStats();

        setFeedback(
            els.memoryStatus,
            result.message,
            "success"
        );

    } catch (error) {
        setFeedback(
            els.memoryStatus,
            error.message || "Unable to connect to the API.",
            "error"
        );
    } finally {
        els.allocateDatasetBtn.disabled = false;
    }
});


/* Clear persistent heap storage */

els.clearStorageBtn.addEventListener("click", async () => {
    if (!window.confirm("Clear all heap objects? This cannot be undone.")) {
        return;
    }

    els.clearStorageBtn.disabled = true;

    try {
        const { response, result } =
            await apiRequest("/api/memory/clear", {
                method: "POST"
            });

        if (!response.ok) {
            throw new Error(result.message || "Clear operation failed.");
        }

        await loadMemoryState();
        await loadCacheStats();
        await loadCacheInspector();

        setFeedback(
            els.memoryStatus,
            result.message,
            "success"
        );

    } catch (error) {
        setFeedback(
            els.memoryStatus,
            error.message || "Unable to clear storage.",
            "error"
        );
    } finally {
        els.clearStorageBtn.disabled = false;
    }
});


/* ---------------- SCREEN 02: ASYNC DATA STREAM ---------------- */

async function pollMockEvent() {
    try {
        const { response, result } =
            await apiRequest("/api/events/stream");

        if (!response.ok || result.status !== "success") {
            throw new Error(result.message || "Stream request failed.");
        }

        const event = result.data.event;

        streamEvents.unshift(event);
        streamEvents = streamEvents.slice(0, 12);

        renderEvents();

        els.streamStatus.textContent =
            `Receiving · ${new Date(event.timestamp).toLocaleTimeString()}`;

        els.streamStatus.classList.remove("error");

    } catch {
        els.streamStatus.textContent = "Stream unavailable · retrying";
        els.streamStatus.classList.add("error");
    }
}


function renderEvents() {
    els.dataStream.innerHTML = "";

    if (streamEvents.length === 0) {
        showEmpty(els.dataStream, "Waiting for incoming events...");
        return;
    }

    streamEvents.forEach((event) => {
        const row = document.createElement("article");
        row.className = "event-card";

        const details = document.createElement("div");

        const title = document.createElement("strong");
        title.textContent =
            `Event #${event.id} · ${event.sensor}`;

        const metadata = document.createElement("small");
        metadata.textContent =
            `${new Date(event.timestamp).toLocaleTimeString()} · Mock sensor reading`;

        details.append(title, metadata);

        const value = document.createElement("span");
        value.className = "event-value";
        value.textContent = `${event.value} ${event.unit}`;

        row.append(details, value);
        els.dataStream.appendChild(row);
    });
}


/* ---------------- TWO-POINTER SEARCH ---------------- */

function renderSearchRows(records, left = -1, right = -1, match = -1) {
    els.searchTable.innerHTML = "";

    if (records.length === 0) {
        showEmpty(
            els.searchTable,
            "No heap records to search. Allocate a dataset first."
        );
        return;
    }

    records.forEach((record, index) => {
        const row = document.createElement("div");
        row.className = "search-row";

        if (index === match) {
            row.classList.add("match");
        } else if (index === left && index === right) {
            row.classList.add("left-pointer", "right-pointer");
        } else if (index === left) {
            row.classList.add("left-pointer");
        } else if (index === right) {
            row.classList.add("right-pointer");
        }

        const rowIndex = document.createElement("span");
        rowIndex.className = "row-index";
        rowIndex.textContent = `Record ${index + 1}`;

        const value = document.createElement("span");
        value.textContent = `Data size: ${record.data_size}`;

        const tag = document.createElement("span");
        tag.className = "pointer-tag";

        if (index === match) {
            tag.textContent = "✓ MATCH";
        } else if (index === left && index === right) {
            tag.textContent = "LEFT + RIGHT";
        } else if (index === left) {
            tag.textContent = "LEFT";
        } else if (index === right) {
            tag.textContent = "RIGHT";
        }

        row.append(rowIndex, value, tag);
        els.searchTable.appendChild(row);
    });
}


els.searchForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const rawTarget = els.searchTarget.value.trim();

    if (
        rawTarget === "" ||
        !Number.isSafeInteger(Number(rawTarget))
    ) {
        setFeedback(
            els.searchResult,
            "Enter a valid whole-number target.",
            "error"
        );
        return;
    }

    searchInProgress = true;
    els.searchBtn.disabled = true;

    try {
        const { response: stateResponse, result: stateResult } =
            await apiRequest("/api/memory/state");

        if (!stateResponse.ok || stateResult.status !== "success") {
            throw new Error("Could not load heap records.");
        }

        const records = [...stateResult.data.heap_objects].sort(
            (a, b) => a.data_size - b.data_size
        );

        if (records.length === 0) {
            renderSearchRows([]);
            setFeedback(
                els.searchResult,
                "No records available. Allocate a dataset first.",
                "error"
            );
            return;
        }

        const target = Number(rawTarget);

        let left = 0;
        let right = records.length - 1;
        let foundIndex = -1;
        let steps = 0;

        while (left <= right) {
            steps++;

            renderSearchRows(records, left, right);

            // Small delay makes the cursor movement visible.
            await new Promise(resolve => setTimeout(resolve, 220));

            if (records[left].data_size === target) {
                foundIndex = left;
                break;
            }

            if (records[right].data_size === target) {
                foundIndex = right;
                break;
            }

            if (records[left].data_size < target) {
                left++;
            }

            if (
                left <= right &&
                records[right].data_size > target
            ) {
                right--;
            }
        }

        renderSearchRows(records, -1, -1, foundIndex);

        const { response, result } = await apiRequest(
            `/api/items/search?target=${encodeURIComponent(target)}`
        );

        if (response.status === 404 && result.data?.found === false) {
            setFeedback(
                els.searchResult,
                `Item not found · ${steps} cursor steps · Cache: ${result.data.cache || "miss"}`,
                "error"
            );
        } else if (!response.ok) {
            throw new Error(result.message || `Search failed: HTTP ${response.status}`);
        } else {
            setFeedback(
                els.searchResult,
                `Found item: ${result.data.item.data_size} · ${steps} cursor steps · Cache: ${result.data.cache || "miss"}`,
                "success"
            );
        }

        await Promise.all([
            loadCacheStats(),
            loadCacheInspector()
        ]);

    } catch (error) {
        setFeedback(
            els.searchResult,
            `Search failed: ${error.message}`,
            "error"
        );
    } finally {
        searchInProgress = false;
        els.searchBtn.disabled = false;
        await loadMemoryState();
    }
});


/* ---------------- SCREEN 03: CACHE INSPECTOR ---------------- */

async function loadCacheStats() {
    try {
        const { response, result } =
            await apiRequest("/api/cache/stats");

        if (!response.ok || result.status !== "success") {
            throw new Error("Cache statistics unavailable.");
        }

        els.cacheHits.textContent = result.data.hits;
        els.cacheMisses.textContent = result.data.misses;

        const lock = result.data.optimistic_lock;

        if (lock) {
            els.lockStatus.textContent =
                `Optimistic lock · Attempts: ${lock.attempts} · Conflicts: ${lock.conflicts} · Last status: ${lock.last_status}`;
        }

    } catch {
        els.cacheHits.textContent = "—";
        els.cacheMisses.textContent = "—";
    }
}


async function loadCacheInspector() {
    try {
        const { response, result } =
            await apiRequest("/api/cache/stats");

        if (!response.ok || result.status !== "success") {
            throw new Error("Unable to load cache.");
        }

        const items = result.data.items || [];

        els.cacheInspector.innerHTML = "";

        if (items.length === 0) {
            showEmpty(
                els.cacheInspector,
                "No cached entries. Run a search first."
            );
            return;
        }

        items.forEach((item) => {
            const card = document.createElement("article");
            card.className = "cache-card";

            const title = document.createElement("strong");
            title.textContent = `Cache key · ${item.key}`;

            const access = document.createElement("p");
            access.textContent = `Access count: ${item.access_count}`;

            const found = document.createElement("p");
            found.textContent =
                `Search found item: ${item.result.found ? "Yes" : "No"}`;

            card.append(title, access, found);
            els.cacheInspector.appendChild(card);
        });

    } catch {
        showEmpty(
            els.cacheInspector,
            "Unable to connect to cache API."
        );
    }
}


els.refreshCacheBtn.addEventListener("click", async () => {
    await Promise.all([
        loadCacheStats(),
        loadCacheInspector()
    ]);

    setFeedback(
        els.cacheStatus,
        "Cache inspector refreshed.",
        "success"
    );
});


els.evictForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const key = els.evictCacheKey.value.trim();

    if (!key) {
        setFeedback(
            els.cacheStatus,
            "Enter a cache key first.",
            "error"
        );
        return;
    }

    await evictCache({ key });
});


els.clearCacheBtn.addEventListener("click", async () => {
    await evictCache({});
});


async function evictCache(body) {
    try {
        const { response, result } =
            await apiRequest("/api/cache/evict", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(body)
            });

        if (!response.ok) {
            setFeedback(
                els.cacheStatus,
                result.message || "Eviction failed.",
                "error"
            );
            return;
        }

        setFeedback(
            els.cacheStatus,
            result.message,
            "success"
        );

        await Promise.all([
            loadCacheStats(),
            loadCacheInspector()
        ]);

    } catch {
        setFeedback(
            els.cacheStatus,
            "Unable to connect to cache API.",
            "error"
        );
    }
}


/* ---------------- ERROR HANDLING ---------------- */

async function triggerFailure(mode, label) {
    setFeedback(els.errorStatus, `${label}...`);

    try {
        const { response, result } =
            await apiRequest("/api/test/fail", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ mode })
            });

        setFeedback(
            els.errorStatus,
            `HTTP ${response.status}: ${result.message}`,
            response.ok ? "success" : "error"
        );

    } catch {
        setFeedback(
            els.errorStatus,
            "Network error. Check whether Flask is running.",
            "error"
        );
    }
}


els.invalidRequestBtn.addEventListener("click", () => {
    triggerFailure("invalid", "Testing invalid request");
});


els.serviceFailureBtn.addEventListener("click", () => {
    triggerFailure("timeout", "Simulating service timeout");
});


els.optimisticLockBtn.addEventListener("click", async () => {
    setFeedback(
        els.errorStatus,
        "Simulating optimistic version conflict..."
    );

    try {
        const { response, result } =
            await apiRequest("/api/test/fail", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ mode: "lock" })
            });

        if (!response.ok) {
            throw new Error(result.message || "Lock test failed.");
        }

        setFeedback(
            els.errorStatus,
            result.message,
            "success"
        );

        await loadCacheStats();

    } catch (error) {
        setFeedback(
            els.errorStatus,
            `Lock test failed: ${error.message}`,
            "error"
        );
    }
});


/* ---------------- START DASHBOARD ---------------- */

async function refreshDashboard() {
    await Promise.all([
        loadMemoryState(),
        loadCacheStats()
    ]);
}

refreshDashboard();
loadCacheInspector();

pollMockEvent();
streamTimer = setInterval(pollMockEvent, 2500);

setInterval(() => {
    if (!searchInProgress) {
        loadMemoryState();
        loadCacheStats();
    }
}, 4000);

window.addEventListener("beforeunload", () => {
    if (streamTimer) {
        clearInterval(streamTimer);
    }
});
