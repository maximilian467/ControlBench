const API_URL = "http://127.0.0.1:8000";

const experimentForm = document.getElementById("experiment-form");
const experimentList = document.getElementById("experiment-list");
const detailSection = document.getElementById("experiment-detail");
const detailTitle = document.getElementById("detail-title");
const detailInfo = document.getElementById("detail-info");
const runTable = document.getElementById("run-table");
const runForm = document.getElementById("run-form");
const responseBox = document.getElementById("response");

// Das aktuell geöffnete Experiment (null = keins)
let currentExperimentId = null;

// Zeigt Methode, Pfad, Statuscode und JSON der letzten API-Antwort an
function showResponse(method, path, res, body) {
  const json = body === undefined ? "(kein Inhalt)" : JSON.stringify(body, null, 2);
  responseBox.textContent = `${method} ${path} -> ${res.status}\n${json}`;
}

// Eingabefelder liefern immer Text: leeres Feld -> null, sonst Zahl
function numberOrNull(value) {
  return value === "" ? null : Number(value);
}

// ---------- Experimente ----------

// GET /experiments -> Liste neu aufbauen
async function loadExperiments() {
  const res = await fetch(`${API_URL}/experiments`);
  const experiments = await res.json();

  experimentList.innerHTML = "";
  for (const exp of experiments) {
    const li = document.createElement("li");
    // textContent statt innerHTML: Eingaben werden als Text angezeigt, nie als HTML ausgeführt
    li.textContent = `#${exp.id} ${exp.name} – ${exp.environment} / ${exp.controller} `;

    const openButton = document.createElement("button");
    openButton.textContent = "Öffnen";
    openButton.addEventListener("click", () => openExperiment(exp.id));
    li.appendChild(openButton);

    experimentList.appendChild(li);
  }
}

// Klick auf "Create Experiment" -> POST /experiments
experimentForm.addEventListener("submit", async (event) => {
  // Ohne diese Zeile würde der Browser das Formular selbst abschicken und die Seite neu laden
  event.preventDefault();

  const fields = new FormData(experimentForm);
  const data = {
    name: fields.get("name"),
    environment: fields.get("environment"),
    controller: fields.get("controller"),
    description: fields.get("description") || null,
  };

  const res = await fetch(`${API_URL}/experiments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const body = await res.json();
  showResponse("POST", "/experiments", res, body);

  if (res.ok) {
    experimentForm.reset();
    loadExperiments();
  }
});

// GET /experiments/{id} -> Detailbereich füllen und Runs laden
async function openExperiment(id) {
  const res = await fetch(`${API_URL}/experiments/${id}`);
  const exp = await res.json();
  showResponse("GET", `/experiments/${id}`, res, exp);
  if (!res.ok) return;

  currentExperimentId = id;
  detailTitle.textContent = `Experiment #${exp.id}: ${exp.name}`;
  detailInfo.textContent = `${exp.environment} / ${exp.controller}` +
    (exp.description ? ` – ${exp.description}` : "");
  detailSection.hidden = false;
  loadRuns();
}

// ---------- Runs ----------

// GET /runs?experiment_id=... -> Tabelle neu aufbauen
async function loadRuns() {
  const res = await fetch(`${API_URL}/runs?experiment_id=${currentExperimentId}`);
  const runs = await res.json();

  runTable.innerHTML = "";
  for (const run of runs) {
    const tr = document.createElement("tr");
    const values = [run.id, run.seed, run.reward, run.stability_time,
                    run.recovery_time, run.num_steps, run.duration];
    for (const value of values) {
      const td = document.createElement("td");
      td.textContent = value ?? "–";  // null (nicht gemessen) als Strich anzeigen
      tr.appendChild(td);
    }

    const actions = document.createElement("td");
    const detailsButton = document.createElement("button");
    detailsButton.textContent = "Details";
    detailsButton.addEventListener("click", () => showRun(run.id));
    const deleteButton = document.createElement("button");
    deleteButton.textContent = "Löschen";
    deleteButton.addEventListener("click", () => deleteRun(run.id));
    actions.append(detailsButton, " ", deleteButton);
    tr.appendChild(actions);

    runTable.appendChild(tr);
  }
}

// GET /runs/{id} -> einzelnen Run im Antwortfeld anzeigen
async function showRun(id) {
  const res = await fetch(`${API_URL}/runs/${id}`);
  const body = await res.json();
  showResponse("GET", `/runs/${id}`, res, body);
}

// Klick auf "Run speichern" -> POST /runs
runForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const fields = new FormData(runForm);
  const data = {
    experiment_id: currentExperimentId,
    seed: numberOrNull(fields.get("seed")),
    reward: numberOrNull(fields.get("reward")),
    stability_time: numberOrNull(fields.get("stability_time")),
    recovery_time: numberOrNull(fields.get("recovery_time")),
    num_steps: numberOrNull(fields.get("num_steps")),
    duration: numberOrNull(fields.get("duration")),
  };

  const res = await fetch(`${API_URL}/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const body = await res.json();
  showResponse("POST", "/runs", res, body);

  if (res.ok) {
    runForm.reset();
    loadRuns();
  }
});

// Klick auf "Löschen" -> DELETE /runs/{id}
async function deleteRun(id) {
  if (!confirm(`Run #${id} wirklich löschen?`)) return;

  const res = await fetch(`${API_URL}/runs/${id}`, { method: "DELETE" });
  if (res.ok) {
    // 204 No Content: die Antwort hat keinen Inhalt, daher kein res.json()
    showResponse("DELETE", `/runs/${id}`, res);
    loadRuns();
  } else {
    showResponse("DELETE", `/runs/${id}`, res, await res.json());
  }
}

loadExperiments();
