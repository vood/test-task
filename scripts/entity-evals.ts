import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

type QueryResponse = {
  ok?: boolean;
  chatId?: string;
  raw?: string;
  error?: string;
};

type EvalCase = {
  name: string;
  question: string;
  mustInclude: string[];
  mustNotInclude: string[];
  requireCitation?: boolean;
};

const deployment = process.env.VERCEL_DEPLOYMENT;
const baseUrl = process.env.BASE_URL;
const username = process.env.APP_USERNAME ?? "demo";
const password = process.env.APP_PASSWORD ?? "demo";
const vercelHome = process.env.VERCEL_HOME ?? "/private/tmp/vercel-login-home";
const caseFilter = process.env.ENTITY_EVAL_FILTER?.toLowerCase();

const allCases: EvalCase[] = [
  {
    name: "Maria ambiguity is not silently merged",
    question: "What did Maria say about the CRM migration?",
    mustInclude: ["Maria Silva", "Maria Santos"],
    mustNotInclude: ["Maria said", "the Maria"],
  },
  {
    name: "Brazil HubSpot claim is not overgeneralized from SEA",
    question: "Is Brazil already on HubSpot because Sofia said most pipeline is migrated?",
    mustInclude: ["Brazil", "Pipedrive", "HubSpot", "SEA"],
    mustNotInclude: ["Brazil is already on HubSpot", "Brazil has already migrated", "fully migrated"],
    requireCitation: true,
  },
  {
    name: "Confluence stale June target is corrected",
    question: "What is the current Confluence launch date, June or September?",
    mustInclude: ["Confluence", "June", "September"],
    mustNotInclude: ["on track for the end-of-June launch", "Q3 is not on the table"],
    requireCitation: true,
  },
  {
    name: "Confluence ownership distinguishes executives and workstream owners",
    question: "Who owns Confluence: Arjun, Daniel, Sara, or Camila?",
    mustInclude: ["Daniel", "Sara", "Camila", "Arjun"],
    mustNotInclude: ["Sara owns Confluence", "Camila owns Confluence", "Arjun owns Confluence"],
    requireCitation: true,
  },
  {
    name: "Tap underperformance separates product, support, and sales causes",
    question: "Why is Tap underperforming in Brazil?",
    mustInclude: ["Tap", "Brazil", "attach", "reconciliation"],
    mustNotInclude: ["only a sales problem", "just a sales problem"],
    requireCitation: true,
  },
  {
    name: "POS Self-Service is distinct from POS",
    question: "Is POS Self-Service the same thing as POS?",
    mustInclude: ["not the same", "POS Self-Service", "POS"],
    mustNotInclude: ["is the same product", "is the same thing"],
    requireCitation: true,
  },
  {
    name: "NPS aggregate is not confused with SEA enterprise",
    question: "What is HelixPay's NPS?",
    mustInclude: ["47", "62", "SEA enterprise"],
    mustNotInclude: ["HelixPay's NPS is 62", "aggregate NPS is 62"],
    requireCitation: true,
  },
  {
    name: "Aisha sales owner is not confused with FP&A",
    question: "Which Aisha owns SEA sales performance?",
    mustInclude: ["Aisha Yusof", "SEA"],
    mustNotInclude: ["Aisha Mahmud owns", "FP&A owns"],
    requireCitation: true,
  },
  {
    name: "Sara and Sarah are distinct people",
    question: "Does Sara report to Daniel Tan or is she the same as Sarah Ng?",
    mustInclude: ["Sara Wijaya", "Sarah Ng", "not the same"],
    mustNotInclude: ["Sarah Wijaya"],
    requireCitation: true,
  },
  {
    name: "Brazil pipeline dashboard is treated cautiously",
    question: "Can we trust the Brazil pipeline coverage number?",
    mustInclude: ["Brazil", "Pipedrive", "duplicates"],
    mustNotInclude: ["can fully trust", "clean source of truth"],
    requireCitation: true,
  },
  {
    name: "Acai issue is not collapsed into one domain",
    question: "Is the Acai Express issue a Tap issue, Loyalty issue, or Confluence issue?",
    mustInclude: ["Açaí", "Loyalty", "Confluence"],
    mustNotInclude: ["only a Tap issue", "only a Loyalty issue"],
    requireCitation: true,
  },
  {
    name: "Cosmos loss is not invented as pricing",
    question: "Did Cosmos Hotels churn because of pricing?",
    mustInclude: ["Cosmos", "multi-property"],
    mustNotInclude: ["churned because of pricing", "price was the reason"],
    requireCitation: true,
  },
  {
    name: "Brazil CS ownership distinguishes Marco and Maria Santos",
    question: "Who is responsible for Brazil CS capacity problems?",
    mustInclude: ["Marco", "Maria Santos", "Brazil"],
    mustNotInclude: ["Maria Silva", "Sales"],
    requireCitation: true,
  },
  {
    name: "CRM migration aliases are unified",
    question: "Are HubSpot migration and Pipedrive migration two separate projects?",
    mustInclude: ["same", "CRM migration", "HubSpot", "Pipedrive"],
    mustNotInclude: ["are two separate projects", "unrelated"],
    requireCitation: true,
  },
  {
    name: "Board risk synthesis keeps issues separate",
    question: "What should the board worry about: Confluence, CRM, or Brazil sales?",
    mustInclude: ["Confluence", "CRM", "Brasil"],
    mustNotInclude: ["same issue", "single cause"],
    requireCitation: true,
  },
];

const cases = caseFilter
  ? allCases.filter((evalCase) => evalCase.name.toLowerCase().includes(caseFilter))
  : allCases;

async function main() {
  if (!deployment && !baseUrl) {
    throw new Error("Set VERCEL_DEPLOYMENT for protected Vercel previews or BASE_URL for public/local testing.");
  }
  if (cases.length === 0) {
    throw new Error(`No entity eval cases matched ENTITY_EVAL_FILTER=${process.env.ENTITY_EVAL_FILTER}`);
  }

  const cookieJar = path.join(mkdtempSync(path.join(tmpdir(), "helixpay-entity-evals-")), "cookies.txt");
  try {
    log("Target", deployment ?? baseUrl ?? "");
    const login = await request("/api/auth/login", {
      method: "POST",
      cookieJar,
      body: { username, password },
    });
    assert(login.ok === true, "login should return ok=true");

    let passed = 0;
    for (const evalCase of cases) {
      log("Case", evalCase.name);
      const response = (await request("/api/query", {
        method: "POST",
        cookieJar,
        body: { question: evalCase.question },
      })) as QueryResponse;

      assert(response.ok === true, `${evalCase.name}: query should return ok=true`);
      const answer = response.raw ?? "";
      log("Answer", answer.slice(0, 700).replace(/\s+/g, " "));
      assert(Boolean(answer.trim()), `${evalCase.name}: answer should not be empty`);
      assert(!answer.trim().startsWith("{"), `${evalCase.name}: answer should not be raw JSON`);

      for (const expected of evalCase.mustInclude) {
        assert(includesLoose(answer, expected), `${evalCase.name}: answer should include "${expected}"`);
      }
      for (const forbidden of evalCase.mustNotInclude) {
        assert(!includesLoose(answer, forbidden), `${evalCase.name}: answer should not include "${forbidden}"`);
      }
      if (evalCase.requireCitation) {
        assert(/\[\d+\]/.test(answer), `${evalCase.name}: answer should use bracket citations`);
        assert(/References:[\s\S]*data\//i.test(answer), `${evalCase.name}: answer should include referenced data files`);
        assert(!/References:[\s\S]*data\/normalized\//i.test(answer), `${evalCase.name}: references should not cite normalized records`);
      }

      passed += 1;
      log("Passed", `${passed}/${cases.length}`);
      log("Preview", answer.slice(0, 300).replace(/\s+/g, " "));
    }
  } finally {
    rmSync(path.dirname(cookieJar), { recursive: true, force: true });
  }

  log("Result", `${cases.length} entity disambiguation evals passed`);
}

async function request(
  apiPath: string,
  options: { method: "GET" | "POST"; cookieJar: string; body?: unknown },
) {
  if (deployment) {
    return requestViaVercelCurl(apiPath, options);
  }
  return requestViaFetch(apiPath, options);
}

function requestViaVercelCurl(
  apiPath: string,
  options: { method: "GET" | "POST"; cookieJar: string; body?: unknown },
) {
  const curlArgs = [
    "vercel@54.14.5",
    "curl",
    apiPath,
    "--deployment",
    deployment!,
    "--",
    "--silent",
    "--show-error",
    "--request",
    options.method,
    "--cookie",
    options.cookieJar,
    "--cookie-jar",
    options.cookieJar,
  ];

  if (options.body !== undefined) {
    curlArgs.push("--header", "content-type: application/json", "--data", JSON.stringify(options.body));
  }

  const output = execFileSync("npx", curlArgs, {
    encoding: "utf8",
    env: {
      ...process.env,
      HOME: vercelHome,
      VERCEL_NO_UPDATE_NOTIFIER: "1",
      NO_COLOR: "1",
      CI: "1",
      XDG_CACHE_HOME: process.env.XDG_CACHE_HOME ?? "/private/tmp/vercel-cache",
      npm_config_cache: process.env.npm_config_cache ?? "/private/tmp/npm-cache-homework",
      NPM_CONFIG_CACHE: process.env.NPM_CONFIG_CACHE ?? "/private/tmp/npm-cache-homework",
    },
    timeout: 300_000,
  });
  return parseJsonFromCli(output);
}

async function requestViaFetch(
  apiPath: string,
  options: { method: "GET" | "POST"; cookieJar: string; body?: unknown },
) {
  const cookie = readCookie(options.cookieJar);
  const response = await fetch(new URL(apiPath, baseUrl), {
    method: options.method,
    headers: {
      ...(options.body === undefined ? {} : { "content-type": "application/json" }),
      ...(cookie ? { cookie } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) {
    writeFileSync(options.cookieJar, setCookie.split(";")[0], "utf8");
  }
  return response.json();
}

function parseJsonFromCli(output: string) {
  const start = output.indexOf("{");
  const end = output.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`No JSON object found in output:\n${output}`);
  }
  return JSON.parse(output.slice(start, end + 1));
}

function readCookie(cookieFile: string) {
  try {
    return readFileSync(cookieFile, "utf8");
  } catch {
    return "";
  }
}

function includesLoose(value: string, expected: string) {
  return normalize(value).includes(normalize(expected));
}

function normalize(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function log(label: string, value: string) {
  console.log(`[${label}] ${value}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
