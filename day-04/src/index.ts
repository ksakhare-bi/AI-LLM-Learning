import { DemoWorker } from "./agents/demo-worker.js";
import { Supervisor } from "./orchestration/supervisor.js";

const workers = [
  new DemoWorker("research-agent", 500),
  new DemoWorker("pricing-agent", 2000),
  new DemoWorker("analysis-agent", 500)
];

const supervisor = new Supervisor(
  workers,
  {
    workerTimeoutMs: 1000,
    globalTimeoutMs: 3000
  }
);

const result = await supervisor.execute({
  taskId: "task-001",
  description: "Analyze a product and return useful information"
});

console.log(JSON.stringify(result, null, 2));