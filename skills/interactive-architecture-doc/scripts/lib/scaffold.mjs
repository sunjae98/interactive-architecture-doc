import { KEBAB, LANGS, STYLES, MAX_COLUMNS } from "./validate.mjs";
import { DEFAULT_COLUMNS } from "./layout.mjs";

export { KEBAB, LANGS, STYLES };

// `iad init`: a skeleton document with 0 validation errors. Every author-facing string is a
// `[...]` placeholder, so `validate` reports W_PLACEHOLDER until the agent has filled them all.

export const MAX_STEPS = 20;
export const MAX_PATHS = MAX_COLUMNS;

const TEXT = {
  en: {
    title: "[Document title]",
    subtitle: "[One-line summary of the core design]",
    entry_request: '[METHOD] /[path]\n{ "input": "{{input}}" }',
    step: (n) => `[Step ${n} label]`,
    legend: {
      client: "[Client — who sends the request]",
      decision: "[Decision — where the path is chosen]",
      new: "[New — what this project builds]",
    },
    scenario: (id) => `[Label for ${id}]`,
    input: "[Example input]",
    data: (n) => `[Data flowing at step ${n}]`,
    entry: "[The client sends the request]",
    decide: "[What decides the path]",
    node: (n) => `[What happens at step ${n}]`,
    response: "[The client receives the response]",
    internal: "[Internal — invisible to the client]",
    column: (id) => `[${id} path]`,
    headline: "[The one sentence that sums up the design]",
    point: (n) => ({ title: `[Key point ${n}]`, detail: `[One-line detail for point ${n}]` }),
    considerations: "[Design considerations]",
    decision: "[Decision]",
    why: "[Why — and which alternative was rejected]",
  },
  ko: {
    title: "[문서 제목]",
    subtitle: "[핵심 설계를 한 줄로 요약]",
    entry_request: '[METHOD] /[경로]\n{ "input": "{{input}}" }',
    step: (n) => `[${n}단계 이름]`,
    legend: {
      client: "[클라이언트 — 요청을 보내는 쪽]",
      decision: "[결정 — 경로가 갈리는 곳]",
      new: "[신규 — 이 프로젝트에서 만드는 것]",
    },
    scenario: (id) => `[${id} 시나리오 이름]`,
    input: "[예시 입력]",
    data: (n) => `[${n}단계에서 흐르는 데이터]`,
    entry: "[클라이언트가 요청을 보냄]",
    decide: "[경로를 정하는 기준]",
    node: (n) => `[${n}단계에서 일어나는 일]`,
    response: "[클라이언트가 응답을 받음]",
    internal: "[내부 — 클라이언트에게 보이지 않음]",
    column: (id) => `[${id} 경로]`,
    headline: "[설계 전체를 요약하는 한 문장]",
    point: (n) => ({ title: `[핵심 ${n}]`, detail: `[핵심 ${n}의 한 줄 설명]` }),
    considerations: "[설계 고려사항]",
    decision: "[결정 사항]",
    why: "[이유 — 그리고 버린 대안]",
  },
};

const node = (kind, step, body, extra = {}) => ({ type: "node", kind, step, body, ...extra });
const ARROW = { type: "arrow" };

// Nodes for steps from..to, separated by arrows (branch-scoped when `branch` is given).
function chain(T, from, to, kind, branch) {
  const out = [];
  for (let s = from; s <= to; s++) {
    if (out.length) out.push(ARROW);
    out.push(node(kind, s, T.node(s), branch ? { branches: [branch] } : {}));
  }
  return out;
}

// Linear: client (1) -> internal (2..N-1, or 2..N for N = 2) -> client response (N, for N >= 3).
// Fork: client (1) -> internal { fork { decision hub (step h), one column per scenario with
// branch-scoped nodes from h+1, the first one a fan_target } } -> client response (N, for N >= 4).
// h = 2, or 1 when N = 2 (the decision then shares step 1 with the client).
export function scaffold({ lang = "en", steps = 3, scenarios = ["default"], fork = false } = {}) {
  const T = TEXT[lang];
  const N = steps;
  const hasResponse = fork ? N >= 4 : N >= 3;
  const last = hasResponse ? N - 1 : N;
  const board = [node("client", 1, T.entry, { entry: true, width: "wide" })];

  let inside = [];
  if (fork) {
    const h = Math.min(2, N - 1);
    inside.push({
      type: "fork",
      children: [
        node("decision", h, T.decide, { fan_hub: "route" }),
        {
          type: "columns",
          columns: scenarios.map((id) => {
            const children = chain(T, h + 1, last, "new", id);
            children[0].fan_target = "route";
            return { title: T.column(id), children };
          }),
        },
      ],
    });
  } else {
    inside = chain(T, 2, last, "new");
  }
  if (inside.length) board.push(ARROW, { type: "internal", badge: T.internal, children: inside });
  if (hasResponse) board.push(ARROW, node("client", N, T.response, { width: "wide" }));

  const legend = { client: T.legend.client };
  if (fork) legend.decision = T.legend.decision;
  if (N > 1) legend.new = T.legend.new;

  const stepTexts = {};
  for (let s = 1; s <= N; s++) stepTexts[String(s)] = T.data(s);

  return {
    meta: { title: T.title, subtitle: T.subtitle, lang, entry_request: T.entry_request },
    tldr: { headline: T.headline, points: [1, 2, 3, 4].map(T.point) },
    steps: Array.from({ length: N }, (_, i) => ({ label: T.step(i + 1) })),
    legend,
    scenarios: scenarios.map((id) => ({ id, label: T.scenario(id), input: T.input, steps: { ...stepTexts } })),
    board,
    considerations: { title: T.considerations, items: [{ decision: T.decision, why: T.why }] },
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
