import {
  Counter,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from "prom-client";

export const registry = new Registry();
registry.setDefaultLabels({ service: "control-api" });
collectDefaultMetrics({ register: registry });

export const httpRequests = new Counter({
  name: "http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["method", "route", "status"] as const,
  registers: [registry],
});

export const httpDuration = new Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request duration seconds",
  labelNames: ["method", "route", "status"] as const,
  buckets: [0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [registry],
});

export const jobsEnqueued = new Counter({
  name: "jobs_enqueued_total",
  help: "Jobs enqueued",
  labelNames: ["type"] as const,
  registers: [registry],
});

export const jobsFinished = new Counter({
  name: "jobs_finished_total",
  help: "Jobs finished",
  labelNames: ["type", "status"] as const,
  registers: [registry],
});

export const jobDuration = new Histogram({
  name: "job_duration_seconds",
  help: "Job duration seconds",
  labelNames: ["type", "status"] as const,
  buckets: [1, 5, 15, 30, 60, 120, 300, 600, 1800, 3600],
  registers: [registry],
});
