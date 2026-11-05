import { KEBAB, LANGS, STYLES, MAX_COLUMNS } from "./validate.mjs";
import { DEFAULT_COLUMNS } from "./layout.mjs";

export { KEBAB, LANGS, STYLES };

// `iad init`: a skeleton document with 0 validation errors. Every author-facing string is a
// `[...]` placeholder, so `validate` reports W_PLACEHOLDER until the agent has filled them all.

export const MAX_STEPS = 20;
export const MIN_LANES = 2;
export const MAX_LANES = 8;
export const MAX_PATHS = MAX_COLUMNS;

const TEXT = {
  en: {
    title: "[Document title]",
    intro: "[What this walkthrough shows, in one or two sentences]",
    legend: { client: "[Client — who starts the flow]", app: "[Service step]", store: "[Storage]" },
    node: (n) => `[Component ${n}]`,
    mono: "[module or resource]",
    fact: (n) => `[What component ${n} does]`,
    scenario: (id) => `[Title of ${id}]`,
    summary: "[One-line path summary]",
    lead: "[What happens in this scenario]",
    step: (n) => `[Step ${n}]`,
    token: "[data]",
    what: "[What moves]",
    where: "[Where it lives]",
    fail: "[What happens if it fails]",
    point: (n) => `[Key point ${n}]`,
  },
  ko: {
    title: "[문서 제목]",
    intro: "[이 워크스루가 보여 주는 것을 한두 문장으로]",
    legend: { client: "[클라이언트 — 흐름을 시작하는 쪽]", app: "[서비스 단계]", store: "[저장소]" },
    node: (n) => `[구성요소 ${n}]`,
    mono: "[모듈 또는 리소스]",
    fact: (n) => `[구성요소 ${n}이 하는 일]`,
    scenario: (id) => `[${id} 시나리오 제목]`,
    summary: "[경로를 한 줄로]",
    lead: "[이 시나리오에서 일어나는 일]",
    step: (n) => `[${n}단계]`,
    token: "[데이터]",
    what: "[무엇이 오가는가]",
    where: "[어디에 놓이는가]",
    fail: "[실패하면]",
    point: (n) => `[핵심 ${n}]`,
  },
};

// v3 walkthrough: `lanes` nodes in a chain (client -> app ... -> store), one file edge between
// neighbors, and per scenario `steps` steps that walk the chain (the last step also carries any
// edges the earlier steps did not reach, so every edge is used). No node has a lane: the map is
// fully automatic (a chain already lays out left to right), so nodes added later are placed too.
export function scaffold({ lang = "en", steps = 3, scenarios = ["default"], lanes = 3 } = {}) {
  const T = TEXT[lang];
  const kindOf = (i) => (i === 0 ? "client" : i === lanes - 1 ? "store" : "app");
  const nodes = Array.from({ length: lanes }, (_, i) => ({
    id: `node-${i + 1}`,
    kind: kindOf(i),
    title: T.node(i + 1),
    mono: T.mono,
    facts: [T.fact(i + 1)],
  }));
  const edges = nodes.slice(1).map((n, i) => ({ id: `edge-${i + 1}`, from: nodes[i].id, to: n.id, kind: "file" }));
  const stepList = () =>
    Array.from({ length: steps }, (_, j) => {
      const own = edges.length ? [edges[j % edges.length].id] : [];
      const rest = j === steps - 1 ? edges.slice(steps).map((e) => e.id) : [];
      return { title: T.step(j + 1), edges: [...own, ...rest], token: { text: T.token, kind: "file" }, what: T.what, where: T.where, fail: T.fail };
    });
  const legendNodes = {};
  for (const k of ["client", "app", "store"]) if (nodes.some((n) => n.kind === k)) legendNodes[k] = T.legend[k];
  return {
    meta: { title: T.title, lang, intro: T.intro },
    legend: { nodes: legendNodes },
    nodes,
    edges,
    scenarios: scenarios.map((id) => ({ id, title: T.scenario(id), summary: T.summary, lead: T.lead, steps: stepList() })),
    tldr: { points: [1, 2, 3].map(T.point) },
  };
}

// JSON with short arrays/objects kept on one line (smaller for the agent to read than 2-space indent).
export function formatJson(value, indent = "") {
  const flat = JSON.stringify(value);
  if (value === null || typeof value !== "object" || indent.length + flat.length <= 100) return flat;
  const inner = indent + "  ";
  const items = Array.isArray(value)
    ? value.map((v) => inner + formatJson(v, inner))
    : Object.entries(value).map(([k, v]) => inner + JSON.stringify(k) + ": " + formatJson(v, inner));
  const [open, close] = Array.isArray(value) ? ["[", "]"] : ["{", "}"];
  return `${open}\n${items.join(",\n")}\n${indent}${close}`;
}

// ---- overview style ---------------------------------------------------------
const OVERVIEW_TEXT = {
  en: {
    title: "[Document title]",
    subtitle: "[One-line summary of what the diagram shows]",
    client: "[CLIENT]",
    clientCode: "[who calls it]",
    group: "[SYSTEM]",
    core: "[Entry component]",
    coreCode: "[entry point]",
    part: (n) => `[Component ${n}]`,
    partCode: "[module.fn()]",
    request: "[request]",
    response: "[response]",
    call: "[call]",
    pathLabel: (id) => `[Label for ${id}]`,
    pathCaption: (id) => `[What happens on the ${id} path]`,
    caption: "[One sentence that explains the diagram]",
  },
  ko: {
    title: "[문서 제목]",
    subtitle: "[다이어그램이 보여주는 것을 한 줄로]",
    client: "[CLIENT]",
    clientCode: "[호출하는 쪽]",
    group: "[시스템]",
    core: "[진입 컴포넌트]",
    coreCode: "[진입점]",
    part: (n) => `[컴포넌트 ${n}]`,
    partCode: "[module.fn()]",
    request: "[요청]",
    response: "[응답]",
    call: "[호출]",
    pathLabel: (id) => `[${id} 경로 이름]`,
    pathCaption: (id) => `[${id} 경로에서 일어나는 일]`,
    caption: "[다이어그램을 설명하는 한 문장]",
  },
};

// client (outer) -> entry component -> one component per path (or three without paths), all but the
// client inside one group. Each path highlights client, entry and its own component.
export function scaffoldOverview({ lang = "en", paths = [] } = {}) {
  const T = OVERVIEW_TEXT[lang];
  const count = paths.length || DEFAULT_COLUMNS;
  const columns = Math.max(DEFAULT_COLUMNS, count);
  const parts = Array.from({ length: count }, (_, i) => ({ id: paths[i] || `part-${i + 1}`, title: T.part(i + 1), code: T.partCode }));
  const doc = {
    meta: { style: "overview", title: T.title, subtitle: T.subtitle, lang },
    layers: [
      { nodes: [{ id: "client", title: T.client, code: T.clientCode, span: columns, tone: "outer" }] },
      { group: "system", nodes: [{ id: "entry", title: T.core, code: T.coreCode, span: columns }] },
      { group: "system", nodes: parts },
    ],
    groups: [{ id: "system", label: T.group }],
    edges: [
      { from: "client", to: "entry", label: T.request },
      { from: "entry", to: "client", label: T.response },
      ...parts.map((p) => ({ from: "entry", to: p.id, label: T.call })),
    ],
  };
  if (columns !== DEFAULT_COLUMNS) doc.meta.columns = columns;
  if (paths.length) {
    doc.paths = paths.map((id) => ({ id, label: T.pathLabel(id), nodes: ["client", "entry", id], caption: T.pathCaption(id) }));
  }
  doc.caption = T.caption;
  return doc;
}
