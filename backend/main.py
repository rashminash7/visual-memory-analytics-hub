
from flask import Flask, jsonify, request
from flask_cors import CORS
from datetime import datetime
from threading import Lock, Timer
from uuid import uuid4
import random

app = Flask(__name__)
CORS(app)

# Memory state
stack_frames = []
heap_objects = []

# Collection metrics
collection_capacity = 4
resize_count = 0
collision_count = 0

# Cache state
cache_store = {}
cache_hits = 0
cache_misses = 0
cache_access_count = {}
CACHE_CAPACITY = 10

# Simulated optimistic-lock state
state_version = 0
lock_attempts = 0
lock_conflicts = 0
last_lock_status = "idle"

# Mock sensor events
event_sequence = 0
mock_events = []

state_lock = Lock()


def timestamp():
    return datetime.now().astimezone().isoformat()


def make_response(status, message, data=None):
    return {
        "status": status,
        "timestamp": timestamp(),
        "message": message,
        "data": data if data is not None else {}
    }


def memory_metrics():
    return {
        "stack_count": len(stack_frames),
        "heap_count": len(heap_objects),
        "load_factor": round(
            len(heap_objects) / collection_capacity * 100, 2
        ),
        "collection_capacity": collection_capacity,
        "resize_count": resize_count,
        "collision_count": collision_count,
        "state_version": state_version
    }


def rebuild_collision_count():
    global collision_count

    buckets = {}

    for item in heap_objects:
        bucket = item["data_size"] % collection_capacity

        if bucket in buckets:
            collision_count += 1
        else:
            buckets[bucket] = []

        buckets[bucket].append(item["id"])


def clear_cache_internal():
    cache_store.clear()
    cache_access_count.clear()


@app.get("/")
def home():
    return jsonify(make_response(
        "success",
        "Visual Memory & Analytics Hub API is running."
    ))


@app.get("/api/memory/state")
def get_memory_state():
    with state_lock:
        data = {
            "stack_frames": list(stack_frames),
            "heap_objects": [dict(item) for item in heap_objects],
            "memory_utilization": memory_metrics()
        }

    return jsonify(make_response(
        "success", "Current memory state", data
    ))


@app.post("/api/memory/allocate")
def allocate_memory():
    global collection_capacity, resize_count
    global state_version, collision_count

    data = request.get_json(silent=True)

    if not isinstance(data, dict) or "data_size" not in data:
        return jsonify(make_response(
            "error", "data_size is required"
        )), 400

    value = data["data_size"]

    if isinstance(value, bool):
        return jsonify(make_response(
            "error", "data_size must be a non-negative integer"
        )), 400

    try:
        data_size = int(value)

        if data_size < 0 or str(data_size) != str(value).strip():
            if not isinstance(value, int) or value < 0:
                raise ValueError

    except (ValueError, TypeError):
        return jsonify(make_response(
            "error", "data_size must be a non-negative integer"
        )), 400

    with state_lock:
        allocation = {
            "id": str(uuid4())[:8],
            "data_size": data_size,
            "created_at": timestamp()
        }

        heap_objects.append(allocation)

        resized = False

        while len(heap_objects) / collection_capacity > 0.75:
            collection_capacity *= 2
            resize_count += 1
            resized = True

        collision_count = 0
        rebuild_collision_count()

        state_version += 1
        clear_cache_internal()

        metrics = memory_metrics()

        message = (
            "Collection resized; allocation successful"
            if resized
            else "Memory allocated successfully"
        )

        result = {
            "allocation": allocation,
            "heap_count": len(heap_objects),
            "collection_capacity": collection_capacity,
            "load_factor": metrics["load_factor"],
            "resize_count": resize_count,
            "collision_count": collision_count,
            "resized": resized,
            "state_version": state_version
        }

    return jsonify(make_response(
        "success", message, result
    )), 201


@app.post("/api/memory/clear")
def clear_memory():
    global collection_capacity, resize_count
    global collision_count, state_version

    with state_lock:
        heap_objects.clear()
        collection_capacity = 4
        resize_count = 0
        collision_count = 0
        state_version += 1
        clear_cache_internal()

    return jsonify(make_response(
        "success",
        "Heap storage cleared",
        {
            "heap_count": 0,
            "collection_capacity": collection_capacity,
            "state_version": state_version
        }
    ))


@app.post("/api/memory/function")
def execute_local_function():
    frame_id = str(uuid4())[:8]

    frame = {
        "id": frame_id,
        "name": "Execute Local Function",
        "created_at": timestamp()
    }

    with state_lock:
        stack_frames.append(frame)

    def release_frame():
        with state_lock:
            stack_frames[:] = [
                item for item in stack_frames
                if item["id"] != frame_id
            ]

    Timer(1.2, release_frame).start()

    return jsonify(make_response(
        "success",
        "Temporary function frame created",
        {"frame": frame, "lifetime_ms": 1200}
    )), 201


@app.get("/api/items/search")
def search_items():
    global cache_hits, cache_misses
    global lock_attempts, lock_conflicts, last_lock_status

    target_text = request.args.get("target")

    if target_text is None:
        return jsonify(make_response(
            "error", "target is required"
        )), 400

    try:
        target = int(target_text)
    except (ValueError, TypeError):
        return jsonify(make_response(
            "error", "target must be an integer"
        )), 400

    key = str(target)

    with state_lock:
        lock_attempts += 1
        version_snapshot = state_version

        # Correctly handle cached search results, including not-found results.
        if key in cache_store:
            cache_hits += 1
            cache_access_count[key] = (
                cache_access_count.get(key, 0) + 1
            )
            last_lock_status = "validated cache read"

            cached_result = dict(cache_store[key])
            cached_result["cache"] = "hit"
            cached_result["optimistic_lock"] = {
                "version": version_snapshot,
                "status": last_lock_status
            }

            found_in_cache = cached_result.get("found", False)

            if found_in_cache:
                message = "Search result retrieved from cache"
                status_code = 200
            else:
                message = "Cached search result: item not found"
                status_code = 404

            return jsonify(make_response(
                "success", message, cached_result
            )), status_code

        cache_misses += 1

        records = sorted(
            [dict(item) for item in heap_objects],
            key=lambda item: (item["data_size"], item["id"])
        )

    # Two-pointer search: cursors move inward.
    left = 0
    right = len(records) - 1
    cursor_steps = 0
    found = None

    while left <= right:
        cursor_steps += 1

        left_value = records[left]["data_size"]
        right_value = records[right]["data_size"]

        if left_value == target:
            found = records[left]
            break

        if right_value == target:
            found = records[right]
            break

        if left_value < target:
            left += 1

        if left <= right and right_value > target:
            right -= 1

    result_data = {
        "found": found is not None,
        "item": found,
        "cursor_steps": cursor_steps,
        "cache": "miss",
        "optimistic_lock": {
            "version": version_snapshot,
            "status": "checking version"
        }
    }

    with state_lock:
        if state_version != version_snapshot:
            lock_conflicts += 1
            last_lock_status = "version conflict; result not cached"
            result_data["optimistic_lock"]["status"] = last_lock_status
        else:
            last_lock_status = "version validated"
            result_data["optimistic_lock"]["status"] = last_lock_status

            cache_store[key] = dict(result_data)
            cache_access_count[key] = 1

            if len(cache_store) > CACHE_CAPACITY:
                oldest_key = next(iter(cache_store))
                cache_store.pop(oldest_key, None)
                cache_access_count.pop(oldest_key, None)

    message = "Item found" if found else "Item not found"
    status_code = 200 if found else 404

    return jsonify(make_response(
        "success", message, result_data
    )), status_code


@app.get("/api/cache/stats")
def get_cache_stats():
    with state_lock:
        items = []

        for key, result in cache_store.items():
            items.append({
                "key": key,
                "result": dict(result),
                "access_count": cache_access_count.get(key, 0)
            })

        data = {
            "hits": cache_hits,
            "misses": cache_misses,
            "retained_keys": list(cache_store.keys()),
            "items": items,
            "capacity": CACHE_CAPACITY,
            "optimistic_lock": {
                "attempts": lock_attempts,
                "conflicts": lock_conflicts,
                "version": state_version,
                "last_status": last_lock_status
            }
        }

    return jsonify(make_response(
        "success", "Current cache statistics", data
    ))


@app.post("/api/cache/evict")
def evict_cache():
    data = request.get_json(silent=True)

    if data is None:
        data = {}

    if not isinstance(data, dict):
        return jsonify(make_response(
            "error", "Request body must be a JSON object"
        )), 400

    key = data.get("key")

    with state_lock:
        if key is None or key == "":
            clear_cache_internal()

            return jsonify(make_response(
                "success", "All cached items evicted",
                {"retained_keys": []}
            ))

        key = str(key)

        if key not in cache_store:
            return jsonify(make_response(
                "error", "Cache key not found", {"key": key}
            )), 404

        cache_store.pop(key)
        cache_access_count.pop(key, None)

        return jsonify(make_response(
            "success", f"Cache key {key} evicted",
            {"retained_keys": list(cache_store.keys())}
        ))


@app.post("/api/test/fail")
def test_fail():
    global lock_conflicts, last_lock_status

    data = request.get_json(silent=True)

    if data is None:
        data = {}

    if not isinstance(data, dict):
        return jsonify(make_response(
            "error", "Request body must be a JSON object"
        )), 400

    mode = data.get("mode", "service")

    if mode == "invalid":
        return jsonify(make_response(
            "error", "Invalid test request"
        )), 400

    if mode == "timeout":
        return jsonify(make_response(
            "error", "Simulated service timeout"
        )), 503

    if mode == "lock":
        with state_lock:
            lock_conflicts += 1
            last_lock_status = "simulated optimistic version conflict"

            return jsonify(make_response(
                "success", "Optimistic lock conflict simulated",
                {
                    "conflicts": lock_conflicts,
                    "version": state_version,
                    "last_status": last_lock_status
                }
            ))

    return jsonify(make_response(
        "error", "Simulated service failure"
    )), 503


@app.get("/api/events/stream")
def stream_mock_event():
    global event_sequence

    with state_lock:
        event_sequence += 1

        event = {
            "id": event_sequence,
            "sensor": random.choice(
                ["sensor-A", "sensor-B", "sensor-C"]
            ),
            "value": round(random.uniform(18.0, 42.0), 2),
            "unit": "°C",
            "timestamp": timestamp(),
            "type": "mock_sensor_reading"
        }

        mock_events.append(event)
        del mock_events[:-20]

        return jsonify(make_response(
            "success", "Mock event received",
            {"event": event, "recent_events": list(mock_events)}
        ))


if __name__ == "__main__":
    app.run(debug=True, threaded=True)
