// Runtime UI strings, selected by meta.lang. Author-written content is never translated.
// Both tables must have exactly the same keys (checked by a test).
// `{name}` placeholders are filled at runtime.

export const UI = {
  en: {
    scenario: "Scenario",
    prev: "← Prev",
    next: "Next step →",
    end: "Done",
    autoplay: "▶ Auto play",
    pause: "⏸ Pause",
    reset: "Restart",
    status_idle: "Step 0/{total} · You can also click a box to jump to it",
    status_step: "Step {step}/{total} · Path: {scenario}",
    path_title: "Selected scenario path",
    data_title: "Data flowing at this step",
    data_idle: 'Pick a scenario above and press "Next step →", or click any box in the diagram.',
    data_empty: "(No data to show for this scenario at this step)",
    steps_hint: "Numbers on the boxes match the steps above — the same number on several boxes means the same step handled by different actors",
    tldr_heading: "TL;DR — Key strategy",
    tldr_suffix: "— this one sentence is the core of the whole design.",
  },
  ko: {
    scenario: "시나리오",
    prev: "← 이전",
    next: "다음 단계 →",
    end: "끝",
    autoplay: "▶ 자동 재생",
    pause: "⏸ 일시정지",
    reset: "처음부터",
    status_idle: "단계 0/{total} · 박스를 직접 클릭해도 이동합니다",
    status_step: "단계 {step}/{total} · 경로: {scenario}",
    path_title: "선택한 시나리오의 경로",
    data_title: "현재 단계에서 흐르는 데이터",
    data_idle: '위 드롭다운에서 시나리오를 고르고 "다음 단계 →"를 누르거나, 다이어그램의 박스를 직접 클릭해보세요.',
    data_empty: "(이 단계에서 이 시나리오는 별도로 보여줄 데이터가 없습니다)",
    steps_hint: "박스마다 붙은 번호는 위 단계와 대응됩니다 — 같은 번호가 여러 박스에 있으면 \"같은 단계인데 실행 주체만 다르다\"는 뜻입니다",
    tldr_heading: "TL;DR — 핵심 전략",
    tldr_suffix: "— 이 한 문장이 전체 설계의 핵심입니다.",
  },
};

export function uiStrings(lang) {
  return UI[lang] || UI.en;
}
