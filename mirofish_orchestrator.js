const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const os = require('os');
const FormData = require('form-data');

const MIROFISH_URL = 'http://127.0.0.1:5001';

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runMiroFishSimulation(query, event) {
  try {
    event.sender.send('agent-log', `[MIROFISH FULL] Starte Deep-Simulation...`);
    event.sender.send('simulation-start');

    // Check if server is running
    try {
      const ping = await fetch(`${MIROFISH_URL}/api/project/list`, { timeout: 2000 });
      if (!ping.ok) throw new Error();
    } catch(e) {
      throw new Error(`MiroFish Backend ist nicht erreichbar! Bitte starte 'npm run backend' im MiroFish Ordner.`);
    }

    // 1. Create a dummy file for the ontology/generate step
    const tempDir = os.tmpdir();
    const dummyFile = path.join(tempDir, 'query.txt');
    fs.writeFileSync(dummyFile, query);

    event.sender.send('agent-log', `[MIROFISH FULL] Generiere Ontologie (Schritt 1/7)...`);
    const form = new FormData();
    form.append('simulation_requirement', query);
    form.append('project_name', 'DesktopAgent Sim');
    form.append('files', fs.createReadStream(dummyFile));

    const ontRes = await fetch(`${MIROFISH_URL}/api/graph/ontology/generate`, { method: 'POST', body: form });
    const ontData = await ontRes.json();
    if (!ontData.success) throw new Error("Ontology Error: " + (ontData.error || "Unknown"));
    const projectId = ontData.data.project_id;

    // 2. Build Graph
    event.sender.send('agent-log', `[MIROFISH FULL] Baue Wissensgraph auf (Schritt 2/7)...`);
    const buildRes = await fetch(`${MIROFISH_URL}/api/graph/build`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: projectId, graph_name: "AgentGraph" })
    });
    const buildData = await buildRes.json();
    if (!buildData.success) throw new Error("Build Graph Error: " + buildData.error);
    const buildTaskId = buildData.data.task_id;

    // Poll Graph Build
    event.sender.send('agent-log', `[MIROFISH FULL] Wissensgraph wird berechnet...`);
    let graphDone = false;
    while (!graphDone) {
      await delay(2000);
      const tRes = await fetch(`${MIROFISH_URL}/api/graph/task/${buildTaskId}`);
      const tData = await tRes.json();
      if (tData.data.status === 'completed') graphDone = true;
      if (tData.data.status === 'failed') throw new Error("Graph Build Failed");
    }

    // 3. Create Simulation
    event.sender.send('agent-log', `[MIROFISH FULL] Erstelle Simulation (Schritt 3/7)...`);
    const createRes = await fetch(`${MIROFISH_URL}/api/simulation/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: projectId })
    });
    const createData = await createRes.json();
    if (!createData.success) throw new Error("Create Sim Error: " + createData.error);
    const simulationId = createData.data.simulation_id;

    // 4. Prepare Simulation
    event.sender.send('agent-log', `[MIROFISH FULL] Generiere Agenten Profile (Schritt 4/7)...`);
    const prepRes = await fetch(`${MIROFISH_URL}/api/simulation/prepare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ simulation_id: simulationId })
    });
    const prepData = await prepRes.json();
    if (!prepData.success) throw new Error("Prepare Error: " + prepData.error);

    let prepDone = false;
    while (!prepDone) {
      await delay(3000);
      const psRes = await fetch(`${MIROFISH_URL}/api/simulation/prepare/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ simulation_id: simulationId })
      });
      const psData = await psRes.json();
      if (psData.data.status === 'ready' || psData.data.already_prepared) prepDone = true;
      else if (psData.data.status === 'failed') throw new Error("Prepare Failed");
    }

    // 5. Start Simulation
    event.sender.send('agent-log', `[MIROFISH FULL] Agenten-Simulation läuft (Schritt 5/7)... Bitte warten, dies dauert einige Minuten.`);
    const startRes = await fetch(`${MIROFISH_URL}/api/simulation/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ simulation_id: simulationId, rounds: 3 })
    });
    const startData = await startRes.json();
    if (!startData.success) throw new Error("Start Error: " + startData.error);

    let simDone = false;
    while (!simDone) {
      await delay(5000);
      const runRes = await fetch(`${MIROFISH_URL}/api/simulation/${simulationId}/run-status`);
      const runData = await runRes.json();
      if (runData.data.status === 'completed') simDone = true;
      else if (runData.data.status === 'failed') throw new Error("Simulation Failed");
      else if (runData.data.message) {
        event.sender.send('agent-log', `[MIROFISH FULL] Simulation: ${runData.data.message}`);
      }
    }

    // 6. Generate Report
    event.sender.send('agent-log', `[MIROFISH FULL] Generiere Prognose-Bericht (Schritt 6/7)...`);
    const repRes = await fetch(`${MIROFISH_URL}/api/report/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ simulation_id: simulationId })
    });
    const repData = await repRes.json();
    if (!repData.success) throw new Error("Report Error: " + repData.error);
    const reportId = repData.data.report_id;

    let repDone = false;
    while (!repDone) {
      await delay(3000);
      const rpRes = await fetch(`${MIROFISH_URL}/api/report/${reportId}/progress`);
      const rpData = await rpRes.json();
      if (rpData.data.status === 'completed') repDone = true;
      else if (rpData.data.status === 'failed') throw new Error("Report Failed");
    }

    // 7. Get Report Content
    event.sender.send('agent-log', `[MIROFISH FULL] Lade finalen Bericht (Schritt 7/7)...`);
    const finalRes = await fetch(`${MIROFISH_URL}/api/report/${reportId}`);
    const finalData = await finalRes.json();

    event.sender.send('simulation-end');
    event.sender.send('agent-log', `[MIROFISH FULL] Simulation abgeschlossen!`);

    let reportMarkdown = "## MiroFish Prognose-Bericht\n\n";
    if (finalData.data && finalData.data.sections) {
      for (const section of finalData.data.sections) {
        reportMarkdown += `### ${section.title}\n${section.content}\n\n`;
      }
    } else {
      reportMarkdown += "Bericht generiert, aber Inhalt ist leer.";
    }

    return { text: reportMarkdown, totalCost: 0 };
  } catch (error) {
    event.sender.send('simulation-end');
    return { error: `[MIROFISH FEHLER] ${error.message}` };
  }
}

module.exports = { runMiroFishSimulation };
