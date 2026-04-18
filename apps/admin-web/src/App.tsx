import {
  Alert,
  Box,
  Button,
  CssBaseline,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  ThemeProvider,
  Typography,
  createTheme,
} from "@mui/material";
import { startTransition, useCallback, useEffect, useMemo, useState } from "react";

const theme = createTheme({ palette: { mode: "light" } });
const apiBase = import.meta.env.VITE_API_URL ?? "";
const LS_KEY = "vs_admin_api_key";

type Angle = {
  id: string;
  label: string;
  manifestHls?: string;
  manifestDash?: string;
};

type Asset = {
  slug: string;
  title: string;
  manifestHls?: string;
  manifestDash?: string;
  projection?: string;
  audioLanguages?: unknown;
  angles?: Angle[];
  createdAt?: string;
};

type Job = {
  id: string;
  type: string;
  status: string;
  payload?: unknown;
  message?: string;
  createdAt?: string;
};

export default function App() {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(LS_KEY) ?? "");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [presignBucket, setPresignBucket] = useState("incoming");
  const [presignKey, setPresignKey] = useState("uploads/test.bin");
  const [presignCt, setPresignCt] = useState("application/octet-stream");
  const [presignOut, setPresignOut] = useState<string>("");
  const [jobType, setJobType] = useState("vod_phase_a");
  const [jobPayload, setJobPayload] = useState(
    '{\n  "inputRelativePath": "incoming/demo.mp4",\n  "outputSlug": "demo",\n  "title": "Demo"\n}',
  );

  const authHeaders = useMemo(() => {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey.trim()) h["X-Admin-Key"] = apiKey.trim();
    return h;
  }, [apiKey]);

  const saveKey = () => {
    localStorage.setItem(LS_KEY, apiKey.trim());
    setError(null);
  };

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [a, j] = await Promise.all([
        fetch(`${apiBase}/api/assets`),
        fetch(`${apiBase}/api/jobs`),
      ]);
      if (!a.ok || !j.ok) throw new Error("API-Anfrage fehlgeschlagen");
      const aj = (await a.json()) as { assets: Asset[] };
      const jj = (await j.json()) as { jobs: Job[] };
      setAssets(aj.assets ?? []);
      setJobs(jj.jobs ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    startTransition(() => {
      void refresh();
    });
  }, [refresh]);

  const registerDemoAsset = async () => {
    setError(null);
    const res = await fetch(`${apiBase}/api/assets`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        slug: "demo",
        title: "Demo (VOD unter /vod/demo/)",
        projection: "none",
      }),
    });
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    await refresh();
  };

  const setDemo360Asset = async () => {
    setError(null);
    const res = await fetch(`${apiBase}/api/assets`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        slug: "demo360",
        title: "Demo 360 (Metadaten)",
        projection: "equirect360",
        manifestHls: "http://localhost:8080/vod/demo360/master.m3u8",
        manifestDash: "http://localhost:8080/vod/demo360/manifest.mpd",
      }),
    });
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    await refresh();
  };

  const enqueueDemoJob = async () => {
    setError(null);
    const res = await fetch(`${apiBase}/api/jobs/demo`, {
      method: "POST",
      headers: authHeaders,
    });
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    await refresh();
  };

  const enqueueJob = async () => {
    setError(null);
    let payload: unknown;
    try {
      payload = JSON.parse(jobPayload) as unknown;
    } catch {
      setError("Job-Payload: kein gültiges JSON");
      return;
    }
    const res = await fetch(`${apiBase}/api/jobs`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ type: jobType, payload }),
    });
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    await refresh();
  };

  const doPresign = async () => {
    setError(null);
    setPresignOut("");
    const res = await fetch(`${apiBase}/api/uploads/presign`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        bucket: presignBucket,
        key: presignKey,
        contentType: presignCt,
      }),
    });
    const t = await res.text();
    if (!res.ok) {
      setError(t);
      return;
    }
    setPresignOut(t);
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ p: 3, maxWidth: 1150, mx: "auto" }}>
        <Typography variant="h4" gutterBottom>
          Video-Server Admin
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          API: <code>{apiBase || "(Proxy /api)"}</code> · VOD{" "}
          <code>http://localhost:8080/vod/</code> · Live-HLS-Proxy{" "}
          <code>http://localhost:8080/live/hls/index.m3u8</code>
        </Typography>

        <Paper sx={{ p: 2, mb: 2 }}>
          <Typography variant="subtitle1" gutterBottom>
            Admin-API-Key (<code>X-Admin-Key</code>, optional lokal)
          </Typography>
          <Stack direction="row" spacing={1} sx={{ mb: 1, flexWrap: "wrap" }}>
            <TextField
              size="small"
              type="password"
              label="ADMIN_API_KEY"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              sx={{ minWidth: 260 }}
            />
            <Button variant="outlined" onClick={saveKey}>
              Speichern
            </Button>
          </Stack>
          <Typography variant="caption" color="text.secondary">
            Muss mit Server-<code>ADMIN_API_KEY</code> übereinstimmen, sonst schlagen POSTs fehl.
          </Typography>
        </Paper>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: "wrap" }}>
          <Button variant="contained" onClick={() => void refresh()}>
            Aktualisieren
          </Button>
          <Button variant="outlined" onClick={() => void registerDemoAsset()}>
            Demo-Asset (VOD)
          </Button>
          <Button variant="outlined" onClick={() => void setDemo360Asset()}>
            Demo-Asset 360° (Metadaten)
          </Button>
          <Button variant="outlined" onClick={() => void enqueueDemoJob()}>
            Demo-Job (DB)
          </Button>
        </Stack>

        <Paper sx={{ p: 2, mb: 2 }}>
          <Typography variant="h6" gutterBottom>
            MinIO Presigned PUT
          </Typography>
          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", mb: 1 }}>
            <TextField
              size="small"
              label="Bucket"
              value={presignBucket}
              onChange={(e) => setPresignBucket(e.target.value)}
            />
            <TextField
              size="small"
              label="Object-Key"
              value={presignKey}
              onChange={(e) => setPresignKey(e.target.value)}
              sx={{ minWidth: 240 }}
            />
            <TextField
              size="small"
              label="Content-Type"
              value={presignCt}
              onChange={(e) => setPresignCt(e.target.value)}
            />
            <Button variant="contained" onClick={() => void doPresign()}>
              Presign holen
            </Button>
          </Stack>
          {presignOut && (
            <Typography variant="body2" sx={{ wordBreak: "break-all" }}>
              <code>{presignOut}</code>
            </Typography>
          )}
        </Paper>

        <Paper sx={{ p: 2, mb: 2 }}>
          <Typography variant="h6" gutterBottom>
            Worker-Job einreihen
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Datei muss unter <code>data/incoming/…</code> liegen (Host-Volume). Typen:{" "}
            <code>vod_phase_a</code>, <code>vod_angle</code>, <code>vod_multi_audio</code>.
          </Typography>
          <Box sx={{ mb: 1 }}>
            <Typography variant="caption">Job-Typ</Typography>
            <select
              value={jobType}
              onChange={(e) => setJobType(e.target.value)}
              style={{ marginLeft: 8, padding: "8px 12px" }}
            >
              <option value="vod_phase_a">vod_phase_a</option>
              <option value="vod_angle">vod_angle</option>
              <option value="vod_multi_audio">vod_multi_audio</option>
            </select>
          </Box>
          <TextField
            fullWidth
            multiline
            minRows={5}
            value={jobPayload}
            onChange={(e) => setJobPayload(e.target.value)}
            sx={{ mb: 1, fontFamily: "monospace" }}
          />
          <Button variant="contained" onClick={() => void enqueueJob()}>
            Job POST /api/jobs
          </Button>
        </Paper>

        <Paper sx={{ p: 2, mb: 2 }}>
          <Typography variant="h6" gutterBottom>
            Assets
          </Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Slug</TableCell>
                <TableCell>Titel</TableCell>
                <TableCell>Projektion</TableCell>
                <TableCell>HLS</TableCell>
                <TableCell>DASH</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {assets.map((row) => (
                <TableRow key={row.slug}>
                  <TableCell>{row.slug}</TableCell>
                  <TableCell>{row.title}</TableCell>
                  <TableCell>{row.projection ?? "none"}</TableCell>
                  <TableCell sx={{ wordBreak: "break-all", maxWidth: 200 }}>
                    {row.manifestHls}
                  </TableCell>
                  <TableCell sx={{ wordBreak: "break-all", maxWidth: 200 }}>
                    {row.manifestDash}
                  </TableCell>
                </TableRow>
              ))}
              {!assets.length && (
                <TableRow>
                  <TableCell colSpan={5}>Keine Einträge</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Paper>

        <Paper sx={{ p: 2 }}>
          <Typography variant="h6" gutterBottom>
            Jobs
          </Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>ID</TableCell>
                <TableCell>Typ</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Nachricht</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {jobs.map((row) => (
                <TableRow key={row.id}>
                  <TableCell sx={{ fontFamily: "monospace", fontSize: 12 }}>
                    {row.id}
                  </TableCell>
                  <TableCell>{row.type}</TableCell>
                  <TableCell>{row.status}</TableCell>
                  <TableCell>{row.message}</TableCell>
                </TableRow>
              ))}
              {!jobs.length && (
                <TableRow>
                  <TableCell colSpan={4}>Keine Jobs</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Paper>
      </Box>
    </ThemeProvider>
  );
}
