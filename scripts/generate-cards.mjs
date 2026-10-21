import { mkdir, writeFile } from "node:fs/promises";

const USER = "Leonardoongaratto";
const OUT_DIR = process.argv[2] ?? "dist";
const TOKEN = process.env.GITHUB_TOKEN;

const FEATURED = [
  { repo: "llm-gateway", description: "Gateway de IA em Go com orçamento rígido de tokens, fallback entre provedores, gRPC e NATS JetStream" },
  { repo: "nexus-trading-engine", description: "Robô de trading em Python para MetaTrader 5 (ouro, BTC, forex): estrutura de mercado, risco e backtest" },
  { repo: "campaign-broker", description: "Gateway de ingestão de campanhas WhatsApp com cache de tokens, streaming de mídia e RabbitMQ" },
  { repo: "finance-api", description: "API de finanças pessoais em Go: gastos, investimentos, metas, dívidas e importação OFX" },
  { repo: "finance-web", description: "Interface da finance-api em React, Vite e TypeScript, com gráficos em Recharts" },
  { repo: "ai-dev-template", description: "Governança para agentes de IA: pipeline implementer → reviewer → QA → bug-fixer" },
];

const HIDDEN_LANGUAGES = new Set(["HTML", "CSS", "SCSS", "Makefile", "Dockerfile", "Procfile", "Shell", "Batchfile"]);
const TOP_LANGUAGES = 6;

const LANGUAGE_COLORS = {
  Go: "#00ADD8",
  Python: "#FFD43B",
  TypeScript: "#3178C6",
  JavaScript: "#F0883E",
  PowerShell: "#A78BFA",
  Ruby: "#701516",
};

const THEMES = {
  dark: { bg: "#0d1117", border: "#30363d", title: "#58a6ff", text: "#c9d1d9", muted: "#8b949e", track: "#21262d" },
  light: { bg: "#ffffff", border: "#d0d7de", title: "#0969da", text: "#1f2328", muted: "#59636e", track: "#eaeef2" },
};

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

async function github(path) {
  const headers = { Accept: "application/vnd.github+json", "User-Agent": `${USER}-profile` };
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
  const response = await fetch(`https://api.github.com/${path}`, { headers });
  if (!response.ok) throw new Error(`GitHub API ${path}: ${response.status}`);
  return response.json();
}

const escapeXml = (text) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function wrap(text, maxChars) {
  const lines = [];
  let line = "";
  for (const word of text.split(" ")) {
    if ((line + " " + word).trim().length > maxChars) {
      lines.push(line);
      line = word;
    } else {
      line = (line + " " + word).trim();
    }
  }
  if (line) lines.push(line);
  return lines;
}

const languageColor = (name) => LANGUAGE_COLORS[name] ?? "#8b949e";

function repoCard(repo, description, theme) {
  const t = THEMES[theme];
  const lines = wrap(description, 52).slice(0, 3);
  const footerY = 52 + lines.length * 20 + 18;
  const height = footerY + 22;
  const stars = repo.stargazers_count > 0
    ? `<text x="150" y="${footerY}" fill="${t.muted}" font-size="12">★ ${repo.stargazers_count}</text>`
    : "";
  const language = repo.language
    ? `<circle cx="31" cy="${footerY - 4}" r="6" fill="${languageColor(repo.language)}"/>
       <text x="43" y="${footerY}" fill="${t.muted}" font-size="12">${escapeXml(repo.language)}</text>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="${height}" viewBox="0 0 400 ${height}" font-family="${FONT}">
  <rect x="0.5" y="0.5" width="399" height="${height - 1}" rx="10" fill="${t.bg}" stroke="${t.border}"/>
  <text x="25" y="36" fill="${t.title}" font-size="16" font-weight="600">${escapeXml(repo.name)}</text>
  ${lines.map((l, i) => `<text x="25" y="${62 + i * 20}" fill="${t.text}" font-size="13">${escapeXml(l)}</text>`).join("\n  ")}
  ${language}
  ${stars}
</svg>`;
}

function languagesCard(languages, theme) {
  const t = THEMES[theme];
  const barWidth = 350;
  let x = 25;
  const segments = languages.map(({ name, percent }) => {
    const width = Math.max((barWidth * percent) / 100, 2);
    const rect = `<rect x="${x}" y="52" width="${width}" height="10" fill="${languageColor(name)}"/>`;
    x += width;
    return rect;
  });
  const legend = languages.map(({ name, percent }, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const lx = 25 + col * 180;
    const ly = 90 + row * 26;
    return `<circle cx="${lx + 5}" cy="${ly - 4}" r="5" fill="${languageColor(name)}"/>
  <text x="${lx + 16}" y="${ly}" fill="${t.text}" font-size="13">${escapeXml(name)}</text>
  <text x="${lx + 160}" y="${ly}" fill="${t.muted}" font-size="12" text-anchor="end">${percent.toFixed(1)}%</text>`;
  });
  const height = 90 + Math.ceil(languages.length / 2) * 26 + 6;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="${height}" viewBox="0 0 400 ${height}" font-family="${FONT}">
  <defs><clipPath id="bar"><rect x="25" y="52" width="${barWidth}" height="10" rx="5"/></clipPath></defs>
  <rect x="0.5" y="0.5" width="399" height="${height - 1}" rx="10" fill="${t.bg}" stroke="${t.border}"/>
  <text x="25" y="34" fill="${t.title}" font-size="16" font-weight="600">Linguagens mais usadas</text>
  <rect x="25" y="52" width="${barWidth}" height="10" rx="5" fill="${t.track}"/>
  <g clip-path="url(#bar)">${segments.join("")}</g>
  ${legend.join("\n  ")}
</svg>`;
}

async function languageTotals() {
  const repos = await github(`users/${USER}/repos?per_page=100&type=owner`);
  const totals = new Map();
  for (const repo of repos) {
    if (repo.fork || repo.archived || repo.name === USER) continue;
    const languages = await github(`repos/${USER}/${repo.name}/languages`);
    for (const [name, bytes] of Object.entries(languages)) {
      if (HIDDEN_LANGUAGES.has(name)) continue;
      totals.set(name, (totals.get(name) ?? 0) + bytes);
    }
  }
  const sum = [...totals.values()].reduce((a, b) => a + b, 0);
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_LANGUAGES)
    .map(([name, bytes]) => ({ name, percent: (100 * bytes) / sum }));
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const languages = await languageTotals();
  for (const theme of Object.keys(THEMES)) {
    await writeFile(`${OUT_DIR}/languages-${theme}.svg`, languagesCard(languages, theme));
  }
  for (const { repo: name, description } of FEATURED) {
    const repo = await github(`repos/${USER}/${name}`);
    for (const theme of Object.keys(THEMES)) {
      await writeFile(`${OUT_DIR}/repo-${name}-${theme}.svg`, repoCard(repo, description, theme));
    }
  }
  console.log(`Generated ${2 + FEATURED.length * 2} cards in ${OUT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
