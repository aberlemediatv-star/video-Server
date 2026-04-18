import { spawn } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import {
  type JobRow,
  claimNextJob,
  migrate,
  setAssetManifests,
  updateJob,
} from "./db.js";

function log(
  level: "info" | "warn" | "error",
  jobId: string | null,
  msg: string,
  extra?: Record<string, unknown>,
) {
  const rec = {
    ts: new Date().toISOString(),
    level,
    service: "worker",
    jobId,
    msg,
    ...(extra ?? {}),
  };
  const line = JSON.stringify(rec);
  if (level === "error") console.error(line);
  else console.log(line);
}

const DATA_ROOT = process.env.DATA_ROOT ?? join(process.cwd(), "..", "..", "data");
const SCRIPT_ROOT = process.env.SCRIPT_ROOT ?? join(process.cwd(), "..", "..", "scripts");
const vodPublicBase = process.env.VOD_PUBLIC_BASE?.replace(/\/$/, "") ?? "http://localhost:8080/vod";

/** Nur relative Pfade unter DATA_ROOT (kein Escape via .. oder absoluter Pfad). */
function resolveInputFile(root: string, inputRelative: string): string {
  const s = String(inputRelative).replace(/\\/g, "/").trim();
  if (!s || s.startsWith("/") || /^[a-zA-Z]:/.test(s)) {
    throw new Error("inputRelativePath must be a relative path under DATA_ROOT");
  }
  const abs = resolve(root, s);
  const rel = relative(root, abs);
  if (rel.startsWith("..") || rel === "..") {
    throw new Error("inputRelativePath leaves DATA_ROOT");
  }
  return abs;
}

const jobTimeoutSec = Math.max(
  60,
  Number(process.env.JOB_TIMEOUT_SEC ?? "7200"),
);

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: "inherit",
      env: { ...process.env, PATH: process.env.PATH },
    });
    const to = setTimeout(() => {
      child.kill("SIGKILL");
      reject(
        new Error(`${cmd} timed out after ${jobTimeoutSec}s`),
      );
    }, jobTimeoutSec * 1000);
    child.on("error", (e) => {
      clearTimeout(to);
      reject(e);
    });
    child.on("exit", (code) => {
      clearTimeout(to);
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited with ${code}`));
    });
  });
}

async function rsyncDir(src: string, dest: string): Promise<void> {
  await run("rsync", ["-a", "--delete", `${src}/`, `${dest}/`]);
}

async function runVodPackage(
  jobId: string,
  inputRelative: string,
  outputSlug: string,
  title: string,
): Promise<void> {
  const inputAbs = resolveInputFile(DATA_ROOT, inputRelative);
  const workBase = join(DATA_ROOT, "work", String(jobId));
  const rend = join(workBase, "rend");
  const pkg = join(workBase, "pkg");
  const vodOut = join(DATA_ROOT, "vod", outputSlug);
  rmSync(workBase, { recursive: true, force: true });
  mkdirSync(rend, { recursive: true });
  mkdirSync(pkg, { recursive: true });
  mkdirSync(vodOut, { recursive: true });

  await run("bash", [join(SCRIPT_ROOT, "transcode_abr.sh"), inputAbs, rend]);
  await run("bash", [join(SCRIPT_ROOT, "package_cmaf.sh"), rend, pkg]);
  await rsyncDir(pkg, vodOut);

  const hls = `${vodPublicBase}/${encodeURIComponent(outputSlug)}/master.m3u8`;
  const dash = `${vodPublicBase}/${encodeURIComponent(outputSlug)}/manifest.mpd`;
  await setAssetManifests({
    slug: outputSlug,
    title,
    manifestHls: hls,
    manifestDash: dash,
  });
}

async function runVodMultiAudio(
  jobId: string,
  inputRelative: string,
  outputSlug: string,
  title: string,
): Promise<void> {
  const inputAbs = resolveInputFile(DATA_ROOT, inputRelative);
  const workBase = join(DATA_ROOT, "work", String(jobId));
  const rend = join(workBase, "rend");
  const pkg = join(workBase, "pkg");
  const vodOut = join(DATA_ROOT, "vod", outputSlug);
  rmSync(workBase, { recursive: true, force: true });
  mkdirSync(rend, { recursive: true });
  mkdirSync(pkg, { recursive: true });
  mkdirSync(vodOut, { recursive: true });

  await run("bash", [join(SCRIPT_ROOT, "transcode_abr_multiaudio.sh"), inputAbs, rend]);
  await run("bash", [join(SCRIPT_ROOT, "package_cmaf_multiaudio.sh"), rend, pkg]);
  await rsyncDir(pkg, vodOut);

  const hls = `${vodPublicBase}/${encodeURIComponent(outputSlug)}/master.m3u8`;
  const dash = `${vodPublicBase}/${encodeURIComponent(outputSlug)}/manifest.mpd`;
  await setAssetManifests({
    slug: outputSlug,
    title,
    manifestHls: hls,
    manifestDash: dash,
  });
}

/**
 * Packt eine *bereits* MV-HEVC-encodierte .mov/.mp4 (auf dem Host erstellt,
 * z.B. via scripts/transcode_mv_hevc_macos.sh) nach HLS+DASH.
 * Der Worker-Container kann MV-HEVC nicht encodieren — nur paketieren.
 */
async function runVodSpatialPackage(
  jobId: string,
  inputRelative: string,
  outputSlug: string,
  title: string,
): Promise<void> {
  const inputAbs = resolveInputFile(DATA_ROOT, inputRelative);
  const workBase = join(DATA_ROOT, "work", String(jobId));
  const rend = join(workBase, "rend");
  const pkg = join(workBase, "pkg");
  const vodOut = join(DATA_ROOT, "vod", outputSlug);
  rmSync(workBase, { recursive: true, force: true });
  mkdirSync(rend, { recursive: true });
  mkdirSync(pkg, { recursive: true });
  mkdirSync(vodOut, { recursive: true });

  await run("cp", [inputAbs, join(rend, "spatial.mp4")]);
  await run("bash", [
    join(SCRIPT_ROOT, "package_cmaf_spatial.sh"),
    rend,
    pkg,
  ]);
  await rsyncDir(pkg, vodOut);

  const hls = `${vodPublicBase}/${encodeURIComponent(outputSlug)}/master.m3u8`;
  const dash = `${vodPublicBase}/${encodeURIComponent(outputSlug)}/manifest.mpd`;
  await setAssetManifests({
    slug: outputSlug,
    title,
    manifestHls: hls,
    manifestDash: dash,
  });
}

async function runVodImmersiveAudio(
  jobId: string,
  inputRelative: string,
  outputSlug: string,
  title: string,
): Promise<void> {
  const inputAbs = resolveInputFile(DATA_ROOT, inputRelative);
  const workBase = join(DATA_ROOT, "work", String(jobId));
  const rend = join(workBase, "rend");
  const pkg = join(workBase, "pkg");
  const vodOut = join(DATA_ROOT, "vod", outputSlug);
  rmSync(workBase, { recursive: true, force: true });
  mkdirSync(rend, { recursive: true });
  mkdirSync(pkg, { recursive: true });
  mkdirSync(vodOut, { recursive: true });

  await run("bash", [
    join(SCRIPT_ROOT, "transcode_immersive_audio.sh"),
    inputAbs,
    rend,
  ]);
  await run("bash", [
    join(SCRIPT_ROOT, "package_cmaf_immersive.sh"),
    rend,
    pkg,
  ]);
  await rsyncDir(pkg, vodOut);

  const hls = `${vodPublicBase}/${encodeURIComponent(outputSlug)}/master.m3u8`;
  const dash = `${vodPublicBase}/${encodeURIComponent(outputSlug)}/manifest.mpd`;
  await setAssetManifests({
    slug: outputSlug,
    title,
    manifestHls: hls,
    manifestDash: dash,
  });
}

async function processJob(job: JobRow) {
  const id = job.id;
  const payload = job.payload as Record<string, unknown>;
  try {
    if (job.type === "vod_phase_a" || job.type === "vod_angle") {
      const inputRelativePath = String(payload.inputRelativePath ?? "");
      const outputSlug = String(payload.outputSlug ?? "").replace(
        /[^a-zA-Z0-9-_]/g,
        "",
      );
      const title = String(payload.title ?? outputSlug);
      if (!inputRelativePath || !outputSlug) {
        throw new Error("payload.inputRelativePath and outputSlug required");
      }
      await runVodPackage(id, inputRelativePath, outputSlug, title);
    } else if (job.type === "vod_multi_audio") {
      const inputRelativePath = String(payload.inputRelativePath ?? "");
      const outputSlug = String(payload.outputSlug ?? "").replace(
        /[^a-zA-Z0-9-_]/g,
        "",
      );
      const title = String(payload.title ?? outputSlug);
      if (!inputRelativePath || !outputSlug) {
        throw new Error("payload.inputRelativePath and outputSlug required");
      }
      await runVodMultiAudio(id, inputRelativePath, outputSlug, title);
    } else if (job.type === "vod_immersive_audio") {
      const inputRelativePath = String(payload.inputRelativePath ?? "");
      const outputSlug = String(payload.outputSlug ?? "").replace(
        /[^a-zA-Z0-9-_]/g,
        "",
      );
      const title = String(payload.title ?? outputSlug);
      if (!inputRelativePath || !outputSlug) {
        throw new Error("payload.inputRelativePath and outputSlug required");
      }
      await runVodImmersiveAudio(id, inputRelativePath, outputSlug, title);
    } else if (job.type === "vod_spatial_package") {
      const inputRelativePath = String(payload.inputRelativePath ?? "");
      const outputSlug = String(payload.outputSlug ?? "").replace(
        /[^a-zA-Z0-9-_]/g,
        "",
      );
      const title = String(payload.title ?? outputSlug);
      if (!inputRelativePath || !outputSlug) {
        throw new Error("payload.inputRelativePath and outputSlug required");
      }
      await runVodSpatialPackage(id, inputRelativePath, outputSlug, title);
    } else {
      throw new Error(`unsupported job type: ${job.type}`);
    }
    await updateJob(id, { status: "succeeded", message: null });
    log("info", id, "job succeeded", { type: job.type });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await updateJob(id, { status: "failed", message: msg });
    log("error", id, "job failed", { type: job.type, err: msg });
  }
}

await migrate();
log("info", null, "worker started", {
  dataRoot: DATA_ROOT,
  scriptRoot: SCRIPT_ROOT,
  jobTimeoutSec,
});

async function loop() {
  for (;;) {
    try {
      const job = await claimNextJob();
      if (!job) {
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
      log("info", job.id, "job started", { type: job.type });
      await processJob(job);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log("error", null, "worker loop error", { err: msg });
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

void loop();
