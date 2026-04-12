export const ERROR_PREFIX = "\u26A0\uFE0F";

export const TOOLS = [
  { id: "policy", label: "Policy", icon: "📋", desc: "Policies & procedures" },
  { id: "supervision", label: "Supervision", icon: "🩺", desc: "NP/PA oversight tools" },
  { id: "lecture", label: "Lecture", icon: "🎓", desc: "CME content builder" },
  { id: "chat", label: "Consult", icon: "💬", desc: "Clinical consultation" },
];

export const TOOL_MAP = Object.fromEntries(TOOLS.map((t) => [t.id, t]));

export const TOOL_COLORS = {
  policy: "#5B9BD5",
  supervision: "#7BC9A0",
  lecture: "#E8AA5A",
  chat: "#C47BE0",
};

export const QUICK_PROMPTS = {
  policy: [
    "Schedule II controlled substance prescribing policy for telepsychiatry",
    "PDMP/PMP mandatory check policy for all prescribers",
    "Telehealth informed consent and platform security policy",
    "Collaborative practice agreement compliance and audit policy",
  ],
  supervision: [
    "Monthly NP supervision checklist for psychiatric prescribers",
    "Competency assessment: ADHD medication initiation and titration",
    "Documentation audit tool for controlled substance encounters",
    "New NP onboarding 90-day supervision framework",
  ],
  lecture: [
    "Diagnosing Adult ADHD: A Multi-Source, Measurement-Based Approach",
    "Safe Stimulant Prescribing in Telepsychiatry Practice",
    "BPD from Diagnosis to DBT: A Case-Based Teaching Session",
    "Collaborative Practice for Psychiatric NPs: Scope and Safety",
  ],
  chat: [
    "Ryan Haight Act 2.0 \u2014 what changed for my telepsychiatry practice?",
    "Help me work through a complex ADHD + AUD case",
    "What are defensible Schedule II supply limits for my NP supervisees?",
    "Walk me through ERISA standards for psychiatric LTD evaluations",
  ],
};

export const TEMPLATE_LIBRARY = [
  { id: "t1", category: "policy", label: "Telepsychiatry CS Policy Shell", prompt: "Create a complete telepsychiatry controlled substance prescribing policy shell with all required sections, placeholders for practice-specific details, and Texas Medical Board regulatory citations." },
  { id: "t2", category: "policy", label: "PDMP Policy (Multi-State)", prompt: "Draft a multi-state PDMP/PMP check policy covering Texas, North Carolina, and other telehealth states with state-specific lookup requirements and documentation standards." },
  { id: "t3", category: "supervision", label: "Monthly Supervision Log", prompt: "Create a structured monthly NP supervision log template including cases reviewed, prescribing decisions discussed, competency observations, and attestation signature blocks." },
  { id: "t4", category: "supervision", label: "Prescribing Competency Rubric", prompt: "Build a detailed prescribing competency rubric for psychiatric NPs covering diagnostic accuracy, medication selection, dosing rationale, monitoring, and patient safety with 1-5 rating scales." },
  { id: "t5", category: "lecture", label: "Adult ADHD Lecture (60 min)", prompt: "Create a full 60-minute CME lecture outline on Adult ADHD including 5 learning objectives, 12-15 slide summaries, 2 case vignettes with discussion, clinical pearls, and references." },
  { id: "t6", category: "lecture", label: "BPD Teaching Case Series", prompt: "Develop a 3-case teaching series on borderline personality disorder covering initial presentation, diagnostic reasoning using DSM-5 criteria, DBT conceptualization, and treatment planning." },
  { id: "t7", category: "chat", label: "DEA Telehealth FAQ", prompt: "Give me a comprehensive FAQ covering the current DEA telehealth prescribing rules post-COVID, including Ryan Haight exceptions, in-person requirements by substance schedule, and state law conflicts." },
  { id: "t8", category: "chat", label: "Collaborative Practice Checklist", prompt: "What are the key legal and clinical requirements for a valid psychiatric collaborative practice agreement in Texas, and what are the most common compliance gaps?" },
];
