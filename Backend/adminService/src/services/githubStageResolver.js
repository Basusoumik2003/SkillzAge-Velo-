import { config } from "../config/config.js";

function resolveBaseUrl() {
  return String(config.services?.python || "http://127.0.0.1:8000").replace(/\/+$/, "");
}

export async function triggerStageResolver({
  userId,
  projectName,
  stepNumber,
  stageIndex,
  eventType = "stage_entered",
  actor = "system",
  previousStatus = null,
  currentStatus = null,
  sourcePayload = null
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`${resolveBaseUrl()}/github/stage-event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        project_name: projectName,
        step_number: stepNumber,
        stage_index: stageIndex,
        event_type: eventType,
        actor,
        previous_status: previousStatus,
        current_status: currentStatus,
        source_payload: sourcePayload || {}
      }),
      signal: controller.signal
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        detail: data?.detail || data?.message || "Stage resolver request failed",
        data
      };
    }

    return { ok: true, status: response.status, data };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      detail: error?.name === "AbortError" ? "Stage resolver request timed out" : String(error?.message || error),
      error
    };
  } finally {
    clearTimeout(timeout);
  }
}
