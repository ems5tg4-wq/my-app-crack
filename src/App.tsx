import React, { useState, useEffect, useRef } from "react";
import { 
  Mail, 
  Key, 
  Play, 
  Square, 
  Trash2, 
  Download, 
  Upload, 
  CheckCircle, 
  AlertTriangle, 
  Activity, 
  Settings, 
  Layers, 
  Copy, 
  Globe, 
  ListRestart, 
  Send,
  Sparkles
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface SMTPResult {
  email: string;
  pass: string;
  host: string;
  port: number;
  status: "valid" | "invalid" | "checking" | "error";
  error?: string;
  timestamp: string;
}

interface LogMessage {
  id: string;
  timestamp: string;
  level: "info" | "success" | "error" | "warn";
  message: string;
}

export default function App() {
  const [emailList, setEmailList] = useState<string>(
    "example1@gmail.com:password123\nexample2@outlook.com:securepass456"
  );
  const [useCustomSmtp, setUseCustomSmtp] = useState<boolean>(false);
  const [customHost, setCustomHost] = useState<string>("");
  const [customPort, setCustomPort] = useState<string>("587");
  const [threads, setThreads] = useState<number>(15);
  const [emailNotify, setEmailNotify] = useState<string>("ems5.tg4@gmail.com");
  
  // Running scanner state
  const [scannerStatus, setScannerStatus] = useState<"idle" | "running" | "stopped" | "completed">("idle");
  const [queueLength, setQueueLength] = useState<number>(0);
  const [totalResults, setTotalResults] = useState<number>(0);
  const [validCount, setValidCount] = useState<number>(0);
  const [invalidCount, setInvalidCount] = useState<number>(0);
  const [checkingCount, setCheckingCount] = useState<number>(0);
  const [activeWorkers, setActiveWorkers] = useState<number>(0);
  const [results, setResults] = useState<SMTPResult[]>([]);
  const [logs, setLogs] = useState<LogMessage[]>([]);
  
  // UI Feedbacks
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [notification, setNotification] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Poll intervals
  useEffect(() => {
    let intervalId: any;
    
    const fetchStatus = async () => {
      try {
        const res = await fetch("/api/scan/status");
        if (res.ok) {
          const data = await res.json();
          setScannerStatus(data.status);
          setQueueLength(data.queueLength);
          setTotalResults(data.totalResultsCount);
          setValidCount(data.validCount);
          setInvalidCount(data.invalidCount);
          setCheckingCount(data.checkingCount);
          setActiveWorkers(data.activeWorkers);
          setResults(data.results || []);
          setLogs(data.logs || []);
        }
      } catch (err) {
        console.error("Error polling scanner status:", err);
      }
    };

    // Initial fetch
    fetchStatus();

    // Set polling interval
    intervalId = setInterval(fetchStatus, 1500);

    return () => clearInterval(intervalId);
  }, []);

  // Auto scroll logs
  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  // Flash messages helper
  const triggerNotification = (type: "success" | "error", text: string) => {
    setNotification({ type, text });
    setTimeout(() => setNotification(null), 4000);
  };

  // Start checking credentials
  const handleStartScan = async () => {
    if (!emailList.trim()) {
      triggerNotification("error", "Veuillez entrer une liste d'e-mails et de mots de passe.");
      return;
    }

    try {
      const response = await fetch("/api/scan/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailList,
          customHost: useCustomSmtp ? customHost : undefined,
          customPort: useCustomSmtp ? customPort : undefined,
          threads,
          emailNotify: emailNotify,
        }),
      });

      const data = await response.json();
      if (response.ok) {
        triggerNotification("success", "Vérificateur SMTP lancé avec succès !");
      } else {
        triggerNotification("error", data.error || "Échec du démarrage de l'analyse.");
      }
    } catch (e) {
      triggerNotification("error", "Erreur réseau lors de la communication de l'analyse.");
    }
  };

  // Terminate execution
  const handleStopScan = async () => {
    try {
      const response = await fetch("/api/scan/stop", { method: "POST" });
      const data = await response.json();
      if (response.ok) {
        triggerNotification("success", "Arrêt demandé...");
      } else {
        triggerNotification("error", data.error || "Impossible d'arrêter le scan.");
      }
    } catch (e) {
      triggerNotification("error", "Erreur réseau lors de l'arrêt.");
    }
  };

  // Clear system outputs
  const handleClearHistory = async () => {
    if (!window.confirm("Êtes-vous sûr de vouloir tout effacer ? (Historique et fichier validcrk.txt)")) {
      return;
    }
    try {
      const response = await fetch("/api/results/clear", { method: "POST" });
      if (response.ok) {
        setResults([]);
        setLogs([]);
        triggerNotification("success", "Historique réinitialisé avec succès !");
      } else {
        triggerNotification("error", "Échec de l'effacement.");
      }
    } catch (e) {
      triggerNotification("error", "Erreur de connexion.");
    }
  };

  // Copy credential line to clipboard
  const handleCopyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
    triggerNotification("success", "Identifiants copiés !");
  };

  // Handling drop text list upload
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const parseUploadedFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result;
      if (typeof text === "string") {
        setEmailList(text);
        triggerNotification("success", `${file.name} chargé avec succès !`);
      }
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      parseUploadedFile(e.dataTransfer.files[0]);
    }
  };

  // Click file upload
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      parseUploadedFile(e.target.files[0]);
    }
  };

  // Calculate percentage progress safely
  const validTotalTested = validCount + invalidCount;
  const progressRatio = totalResults > 0 ? (validTotalTested / totalResults) * 100 : 0;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500/30 selection:text-emerald-300">
      
      {/* Toast Notification Bar */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className={`fixed top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-xl border shadow-2xl backdrop-blur-md ${
              notification.type === "success"
                ? "bg-slate-900/90 border-emerald-500/50 text-emerald-300"
                : "bg-slate-900/90 border-rose-500/50 text-rose-300"
            }`}
          >
            {notification.type === "success" ? (
              <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
            )}
            <span className="text-sm font-medium">{notification.text}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Styled Premium Header */}
      <header className="border-b border-slate-900 bg-slate-950/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/10">
              <Mail className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent flex items-center gap-2">
                SMTP Checker Pro <span className="text-xs text-emerald-400 font-mono border border-emerald-500/20 px-2 py-0.5 rounded-full bg-emerald-500/5">Beta v1.1</span>
              </h1>
              <p className="text-xs text-slate-400">Profiter de l'offre - Multi-threaded SMTP credential validator</p>
            </div>
          </div>
          
          {/* Quick Stats Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="bg-slate-900/60 border border-slate-800/80 rounded-lg px-3 py-1.5 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
              <span className="text-xs text-slate-400">Queue:</span>
              <span className="text-xs font-mono font-bold text-slate-200">{queueLength}</span>
            </div>
            
            <div className="bg-slate-900/60 border border-slate-800/80 rounded-lg px-3 py-1.5 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span className="text-xs text-slate-400">Valid:</span>
              <span className="text-xs font-mono font-bold text-emerald-400">{validCount}</span>
            </div>

            <div className="bg-slate-900/60 border border-slate-800/80 rounded-lg px-3 py-1.5 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-500"></span>
              <span className="text-xs text-slate-400">Failed:</span>
              <span className="text-xs font-mono font-bold text-rose-400">{invalidCount}</span>
            </div>

            {scannerStatus === "running" && (
              <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 animate-pulse">
                <Activity className="w-3.5 h-3.5 rotate-infinite" />
                Vérification en cours...
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Main Container Workspace */}
      <main className="flex-1 max-w-7xl mx-auto px-4 py-6 w-full grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column Controls & Inputs */}
        <section className="lg:col-span-12 xl:col-span-5 flex flex-col gap-6">
          
          {/* Email input list widget */}
          <div className="bg-slate-900/30 border border-slate-900 rounded-2xl p-5 flex flex-col gap-4 relative overflow-hidden group">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-400" />
                <h2 className="text-sm font-semibold text-slate-100">Liste d'e-mails & mots de passe</h2>
              </div>
              
              <button
                onClick={() => {
                  if (fileInputRef.current) fileInputRef.current.click();
                }}
                className="text-xs font-semibold text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700/50 transition flex items-center gap-1.5"
              >
                <Upload className="w-3.5 h-3.5" />
                Importer (.txt)
              </button>
              
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".txt"
                className="hidden"
              />
            </div>

            {/* Drag & drop upload target area overlay */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`relative rounded-xl border-2 border-dashed flex flex-col transition-all duration-200 ${
                isDragging
                  ? "border-emerald-500 bg-emerald-500/5 text-emerald-400"
                  : "border-slate-800 hover:border-slate-700 bg-slate-950/60"
              }`}
            >
              <textarea
                value={emailList}
                onChange={(e) => setEmailList(e.target.value)}
                placeholder="Format strict:
email1@domain.com:password123
email2@domain.com:password456"
                className="w-full h-64 p-4 font-mono text-xs bg-transparent border-0 ring-0 focus:outline-none focus:ring-0 text-slate-300 placeholder-slate-600 resize-y min-h-[160px]"
              />
              {isDragging && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/90 rounded-xl pointer-events-none">
                  <Upload className="w-8 h-8 text-emerald-400 animate-bounce mb-2" />
                  <p className="text-sm font-semibold">Déposez le fichier .txt ici</p>
                  <p className="text-xs text-slate-400 mt-1">Sera analysé instantanément</p>
                </div>
              )}
            </div>
            
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>Supporte formats : `:` , `|` ou `;`</span>
              <span>Total lignes: <strong className="font-mono text-slate-200">{emailList.split("\n").filter(Boolean).length}</strong></span>
            </div>
          </div>

          {/* Verification Settings widget */}
          <div className="bg-slate-900/30 border border-slate-900 rounded-2xl p-5 flex flex-col gap-4">
            <div className="flex items-center gap-2 pb-1 border-b border-slate-900">
              <Settings className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-semibold text-slate-100">Paramètres d'analyse & Cible</h2>
            </div>

            {/* Custom host toggle & values */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-300">Ciblage du serveur SMTP :</label>
                <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 p-0.5 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setUseCustomSmtp(false)}
                    className={`px-2 py-1 text-[10px] font-bold rounded-md transition ${
                      !useCustomSmtp ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "text-slate-500 hover:text-slate-300"
                    }`}
                  >
                    Découverte Auto
                  </button>
                  <button
                    type="button"
                    onClick={() => setUseCustomSmtp(true)}
                    className={`px-2 py-1 text-[10px] font-bold rounded-md transition ${
                      useCustomSmtp ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "text-slate-500 hover:text-slate-300"
                    }`}
                  >
                    Hôte Spécifique
                  </button>
                </div>
              </div>

              {useCustomSmtp ? (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="grid grid-cols-12 gap-2"
                >
                  <div className="col-span-8">
                    <input
                      type="text"
                      value={customHost}
                      onChange={(e) => setCustomHost(e.target.value)}
                      placeholder="e.g. smtp.gmail.com"
                      className="w-full bg-slate-950 border border-slate-800/80 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 font-mono"
                    />
                  </div>
                  <div className="col-span-4">
                    <input
                      type="number"
                      value={customPort}
                      onChange={(e) => setCustomPort(e.target.value)}
                      placeholder="Port"
                      className="w-full bg-slate-950 border border-slate-800/80 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 font-mono"
                    />
                  </div>
                </motion.div>
              ) : (
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  L'algorithme de découverte automatique génère intelligemment des candidats de serveurs SMTP basés sur le domaine de l'adresse et tente les ports <strong className="text-slate-300">587, 465, 25</strong> avec prise en charge TLS/SSL.
                </p>
              )}
            </div>

            {/* Notification Email Input */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1">
                  <Send className="w-3.5 h-3.5 text-emerald-400" />
                  Envoyer l'alerte de succès à :
                </label>
              </div>
              <input
                type="email"
                value={emailNotify}
                onChange={(e) => setEmailNotify(e.target.value)}
                placeholder="e.g. ems5.tg4@gmail.com"
                className="w-full bg-slate-950 border border-slate-800/80 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 font-mono"
              />
              <span className="text-[10px] text-slate-500">Un e-mail de notification est envoyé via les informations valides lors de chaque succès.</span>
            </div>

            {/* Concurrency slider */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-300">File de Workers Simultanés :</span>
                <span className="font-mono text-emerald-400 font-bold">{threads} Threads</span>
              </div>
              <input
                type="range"
                min="1"
                max="50"
                value={threads}
                onChange={(e) => setThreads(parseInt(e.target.value))}
                className="w-full accent-emerald-500 cursor-pointer h-1.5 bg-slate-950 rounded-lg"
              />
              <span className="text-[10px] text-slate-500">Une taille élevée accélère le scan mais peut déclencher des blocages de sécurité serveurs.</span>
            </div>

            {/* Scan Controls Action Panels */}
            <div className="grid grid-cols-2 gap-2 mt-2">
              {scannerStatus === "running" ? (
                <button
                  type="button"
                  onClick={handleStopScan}
                  className="col-span-2 w-full bg-rose-600 hover:bg-rose-500 text-white font-bold py-3 px-4 rounded-xl shadow-lg shadow-rose-950/20 transition flex items-center justify-center gap-2 text-sm"
                >
                  <Square className="w-4 h-4" />
                  Arrêter l'analyse
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleStartScan}
                  className="col-span-2 w-full bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-slate-950 font-bold py-3 px-4 rounded-xl shadow-lg shadow-emerald-950/20 transition flex items-center justify-center gap-2 text-sm"
                >
                  <Play className="w-4 h-4 fill-slate-950" />
                  Profiter de l’offre (Démarrer)
                </button>
              )}
              
              <button
                type="button"
                onClick={handleClearHistory}
                className="bg-slate-950 hover:bg-slate-900 border border-slate-800/80 text-slate-350 font-semibold py-2 px-3 rounded-lg transition-all text-xs flex items-center justify-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Effacer Tout
              </button>

              <a
                href="/api/results/download"
                download="validcrk.txt"
                className={`border text-xs rounded-lg font-semibold py-2 px-3 flex items-center justify-center gap-1.5 transition-all ${
                  validCount > 0 
                  ? "bg-slate-900/40 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10 cursor-pointer"
                  : "bg-slate-950 text-slate-600 border-slate-900 cursor-not-allowed pointer-events-none"
                }`}
              >
                <Download className="w-3.5 h-3.5" />
                Télécharger (TXT)
              </a>
            </div>
            
          </div>

        </section>

        {/* Right Column Monitor & Live Outcomes */}
        <section className="lg:col-span-12 xl:col-span-7 flex flex-col gap-6">

          {/* Verification Progress details */}
          <div className="bg-slate-900/30 border border-slate-900 rounded-2xl p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between pb-1 border-b border-slate-900">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-400" />
                <h2 className="text-sm font-semibold text-slate-100">Progression globale de l'analyse</h2>
              </div>
              <span className="text-xs text-slate-400">
                Statut: <span className="capitalize font-bold text-emerald-400">{scannerStatus}</span>
              </span>
            </div>

            {/* Interactive Progress bar */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-400">Combinaisons vérifiées :</span>
                <span className="text-xs font-mono font-bold text-slate-200">
                  {validCount + invalidCount} / {totalResults} ({Math.round(progressRatio)}%)
                </span>
              </div>
              <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-900">
                <motion.div
                  className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${progressRatio}%` }}
                  transition={{ duration: 0.5 }}
                />
              </div>
            </div>

            {/* Performance metrics dashboard cells */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-900">
                <div className="text-xl font-mono font-bold text-emerald-400">{validCount}</div>
                <div className="text-[10px] text-slate-500 uppercase font-medium mt-1">Valide (Succès)</div>
              </div>

              <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-900">
                <div className="text-xl font-mono font-bold text-rose-400">{invalidCount}</div>
                <div className="text-[10px] text-slate-500 uppercase font-medium mt-1">Échoué</div>
              </div>

              <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-900">
                <div className="text-xl font-mono font-bold text-amber-400">{checkingCount}</div>
                <div className="text-[10px] text-slate-500 uppercase font-medium mt-1">En cours</div>
              </div>

              <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-900">
                <div className="text-xl font-mono font-bold text-blue-400">{activeWorkers}</div>
                <div className="text-[10px] text-slate-500 uppercase font-medium mt-1">Workers Actifs</div>
              </div>
            </div>
          </div>

          {/* Results credentials section */}
          <div className="bg-slate-900/30 border border-slate-900 rounded-2xl p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between pb-1 border-b border-slate-900">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                <h2 className="text-sm font-semibold text-slate-100">
                  Comptes Valides Détectés ({results.filter(r => r.status === "valid").length})
                </h2>
              </div>
              
              {validCount > 0 && (
                <span className="text-[10px] text-emerald-400/95 font-bold animate-pulse flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5" />
                  Sauvegardé dans validcrk.txt
                </span>
              )}
            </div>

            <div className="overflow-x-auto min-h-[140px] max-h-[220px] overflow-y-auto bg-slate-950/60 rounded-xl border border-slate-900">
              <table className="w-full text-xs text-left">
                <thead className="text-[11px] text-slate-400 bg-slate-900/45 sticky top-0 border-b border-slate-900">
                  <tr>
                    <th className="p-3">Email:Password</th>
                    <th className="p-3">Serveur SMTP Target</th>
                    <th className="p-3">Port</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900">
                  {results.filter(r => r.status === "valid").length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-slate-500 font-mono">
                        Aucun SMTP valide détecté pour le moment.
                      </td>
                    </tr>
                  ) : (
                    results
                      .filter(r => r.status === "valid")
                      .map((res, index) => {
                        const copyString = `${res.host}|${res.port}|${res.email}|${res.pass}`;
                        return (
                          <motion.tr
                            key={`${res.email}-${res.host}-${index}`}
                            initial={{ opacity: 0, x: -5 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="hover:bg-slate-900/20 text-slate-300 font-mono group"
                          >
                            <td className="p-3 truncate max-w-[200px]" title={`${res.email}:${res.pass}`}>
                              <span className="text-emerald-300">{res.email}</span>
                              <span className="text-slate-600">:</span>
                              <span className="text-slate-400">{res.pass}</span>
                            </td>
                            <td className="p-3 text-slate-400 truncate max-w-[150px]">{res.host}</td>
                            <td className="p-3">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                res.port === 465 
                                  ? "bg-purple-500/10 text-purple-400 border border-purple-500/15" 
                                  : "bg-blue-500/10 text-blue-400 border border-blue-500/15"
                              }`}>
                                {res.port}
                              </span>
                            </td>
                            <td className="p-3 text-right">
                              <button
                                onClick={() => handleCopyToClipboard(copyString, index)}
                                className="p-1 px-2 rounded bg-slate-900 hover:bg-slate-850 hover:text-white border border-slate-800 transition text-[10px] flex items-center gap-1 ml-auto"
                              >
                                {copiedIndex === index ? (
                                  <span className="text-emerald-400 font-sans">Copié !</span>
                                ) : (
                                  <>
                                    <Copy className="w-3 h-3 text-slate-400" />
                                    <span>Copier</span>
                                  </>
                                )}
                              </button>
                            </td>
                          </motion.tr>
                        );
                      })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Realtime CLI/Log section */}
          <div className="bg-slate-900/30 border border-slate-900 rounded-2xl p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between pb-1 border-b border-slate-900">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-emerald-400 animate-pulse" />
                <h2 className="text-sm font-semibold text-slate-100">Journal d'activité en temps réel</h2>
              </div>
              <span className="text-[10px] font-mono text-slate-400">Max Log: 150</span>
            </div>

            <div className="h-44 bg-slate-950 font-mono text-[11px] p-4 rounded-xl border border-slate-900 overflow-y-auto flex flex-col gap-1.5 scrollbar-thin scrollbar-thumb-slate-800">
              {logs.length === 0 ? (
                <div className="text-slate-600 italic">Plateforme prête. En attente de lancement...</div>
              ) : (
                logs.map((log) => {
                  let colorClass = "text-slate-350";
                  if (log.level === "success") colorClass = "text-emerald-400 font-bold";
                  if (log.level === "error") colorClass = "text-rose-400";
                  if (log.level === "warn") colorClass = "text-amber-400";

                  return (
                    <div key={log.id} className="leading-5">
                      <span className="text-slate-600 mr-2">[{log.timestamp}]</span>
                      <span className={colorClass}>{log.message}</span>
                    </div>
                  );
                })
              )}
              <div ref={logEndRef} />
            </div>
          </div>

        </section>

      </main>

      {/* Modern Aesthetic Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-6 mt-auto">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row justify-between items-center gap-4 text-xs text-slate-500">
          <div>
            <span>Profiter de l'offre © 2026.</span>
            <span className="ml-2 pl-2 border-l border-slate-800">SMTP Checker & Credentials Engine.</span>
          </div>
          <div className="flex items-center gap-1 text-slate-400 font-medium">
            <span>Power parameters:</span>
            <span className="font-mono bg-slate-900 text-slate-300 border border-slate-800/80 rounded px-1.5 py-0.5">3D-Smtp Check Connection</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
