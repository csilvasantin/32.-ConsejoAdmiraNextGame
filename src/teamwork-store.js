const MAX_ENTRIES = 100;
const history = [];
let nextId = 1;

export function addEntry(machineId, machineName, prompt, ok, error, captureId) {
  const entry = {
    id: nextId++,
    machineId,
    machineName: machineName || machineId,
    prompt,
    sentAt: new Date().toISOString(),
    status: ok ? "sent" : "error",
    error: error || null,
    captureId: captureId || null
  };

  history.unshift(entry);
  if (history.length > MAX_ENTRIES) {
    history.length = MAX_ENTRIES;
  }

  return entry;
}

export function getHistory() {
  return history;
}
