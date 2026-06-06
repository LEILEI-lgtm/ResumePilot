"use client";

import type { FormEvent, ReactNode } from "react";
import { useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

type AnalysisResult = {
  score: number;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  job_match: {
    score: number;
    missing_skills: string[];
  };
  gap_analysis: {
    matched_skills: string[];
    missing_skills: string[];
    priority_gaps: string[];
  };
  jd_breakdown: {
    core_requirements: string[];
    hidden_requirements: string[];
    keywords: string[];
  };
  career_roadmap: {
    week: string;
    goal: string;
    tasks: string[];
  }[];
  rewrite_examples: {
    original: string;
    optimized: string;
    reason: string;
  }[];
  source_text?: {
    resumeText?: string;
    jobDescription?: string;
  };
};

type OptimizedResume = {
  summary: string;
  project_experience: string[];
  internship_experience: string[];
  campus_experience: string[];
  skills: string[];
  optimization_notes: string[];
};

type ResultListProps = {
  title: string;
  items: string[];
  emptyText: string;
  markdown?: boolean;
};

const userStageOptions = ["应届求职学生", "实习求职学生"];
const targetRoleOptions = [
  "产品经理",
  "运营",
  "数据分析",
  "开发",
  "测试",
  "设计",
  "其他",
];

function safeCssValue(property: string, value: string) {
  if (!value.includes("oklch")) {
    return value;
  }

  if (property.includes("background")) {
    return "#ffffff";
  }

  if (property.includes("border")) {
    return "#e2e8f0";
  }

  if (property.includes("color")) {
    return "#0f172a";
  }

  if (property.includes("shadow")) {
    return "none";
  }

  return "";
}

function applySafeInlineStyles(source: Element, target: Element) {
  if (!(source instanceof HTMLElement) || !(target instanceof HTMLElement)) {
    return;
  }

  const computedStyle = window.getComputedStyle(source);

  for (const property of computedStyle) {
    const value = computedStyle.getPropertyValue(property);
    const priority = computedStyle.getPropertyPriority(property);
    const safeValue = safeCssValue(property, value);

    if (safeValue) {
      target.style.setProperty(property, safeValue, priority);
    } else {
      target.style.removeProperty(property);
    }
  }

  target.removeAttribute("class");
  target.style.color = "#0f172a";
  target.style.backgroundColor = "#ffffff";
  target.style.borderColor = "#e2e8f0";
  target.style.boxShadow = "none";

  Array.from(source.children).forEach((sourceChild, index) => {
    const targetChild = target.children[index];

    if (targetChild) {
      applySafeInlineStyles(sourceChild, targetChild);
    }
  });
}

function sanitizeExportElement(element: HTMLElement) {
  const clone = element.cloneNode(true) as HTMLElement;

  applySafeInlineStyles(element, clone);
  clone.style.width = "794px";
  clone.style.maxWidth = "794px";
  clone.style.backgroundColor = "#ffffff";
  clone.style.color = "#0f172a";
  clone.style.boxShadow = "none";

  return clone;
}

function OptionGroup({
  title,
  helperText,
  options,
  selectedValue,
  onChange,
}: {
  title: string;
  helperText: string;
  options: string[];
  selectedValue: string;
  onChange: (value: string) => void;
}) {
  return (
    <section className="grid gap-3">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-slate-500">{helperText}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const isSelected = option === selectedValue;

          return (
            <label
              className={`cursor-pointer rounded-xl border px-3 py-2 text-sm font-medium transition ${
                isSelected
                  ? "border-teal-600 bg-teal-50 text-teal-800 shadow-sm"
                  : "border-slate-200 bg-white text-slate-700 hover:border-teal-300 hover:bg-teal-50"
              }`}
              key={option}
            >
              <input
                checked={isSelected}
                className="sr-only"
                onChange={() => onChange(option)}
                type="radio"
                value={option}
              />
              {option}
            </label>
          );
        })}
      </div>
    </section>
  );
}

function ScoreRing({ label, score }: { label: string; score: number }) {
  const safeScore = Math.max(0, Math.min(100, score));

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-1 text-4xl font-semibold text-slate-950">
            {safeScore}
            <span className="text-lg text-slate-400">/100</span>
          </p>
        </div>
        <div
          className="grid size-20 place-items-center rounded-full"
          style={{
            background: `conic-gradient(#0f766e ${safeScore * 3.6}deg, #e2e8f0 0deg)`,
          }}
          aria-label={`${label}: ${safeScore} out of 100`}
        >
          <div className="grid size-14 place-items-center rounded-full bg-white text-sm font-semibold text-teal-700">
            {safeScore}%
          </div>
        </div>
      </div>
    </div>
  );
}

function MarkdownText({ children }: { children: string }) {
  return (
    <ReactMarkdown
      components={{
        a: ({ children: linkChildren, ...props }) => (
          <a
            {...props}
            className="font-medium text-teal-700 underline underline-offset-2"
            rel="noreferrer"
            target="_blank"
          >
            {linkChildren}
          </a>
        ),
        ol: ({ children: listChildren }) => (
          <ol className="my-2 list-decimal space-y-1 pl-5">{listChildren}</ol>
        ),
        p: ({ children: paragraphChildren }) => (
          <p className="my-0">{paragraphChildren}</p>
        ),
        strong: ({ children: strongChildren }) => (
          <strong className="font-semibold text-slate-950">
            {strongChildren}
          </strong>
        ),
        ul: ({ children: listChildren }) => (
          <ul className="my-2 list-disc space-y-1 pl-5">{listChildren}</ul>
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  );
}

function ResultList({ title, items, emptyText, markdown }: ResultListProps) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-slate-950">{title}</h2>
      {items.length > 0 ? (
        <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-700">
          {items.map((item, index) => (
            <li className="flex gap-3" key={`${title}-${index}`}>
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-teal-600" />
              <span>{markdown ? <MarkdownText>{item}</MarkdownText> : item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-slate-500">{emptyText}</p>
      )}
    </section>
  );
}

function PlainList({ title, items, emptyText, markdown }: ResultListProps) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {items.length > 0 ? (
        <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
          {items.map((item, index) => (
            <li className="flex gap-2" key={`${title}-${index}`}>
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-teal-600" />
              <span>{markdown ? <MarkdownText>{item}</MarkdownText> : item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-slate-500">{emptyText}</p>
      )}
    </div>
  );
}

function TagGroup({
  title,
  items,
  tone = "teal",
}: {
  title: string;
  items: string[];
  tone?: "teal" | "amber" | "slate";
}) {
  const toneClass = {
    teal: "border-teal-200 bg-teal-50 text-teal-800",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    slate: "border-slate-200 bg-slate-50 text-slate-700",
  }[tone];

  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <div className="mt-3 flex flex-wrap gap-2">
        {items.length > 0 ? (
          items.map((item) => (
            <span
              className={`rounded-md border px-2.5 py-1 text-xs font-medium ${toneClass}`}
              key={`${title}-${item}`}
            >
              {item}
            </span>
          ))
        ) : (
          <span className="text-sm text-slate-500">暂无内容。</span>
        )}
      </div>
    </div>
  );
}

function ModuleCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-slate-950">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function ResultSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-4">
      <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
      {children}
    </section>
  );
}

function GapAnalysis({ result }: { result: AnalysisResult }) {
  return (
    <ModuleCard title="Gap Analysis">
      <div className="grid gap-5">
        <TagGroup
          items={result.gap_analysis.matched_skills}
          title="已匹配能力"
        />
        <TagGroup
          items={result.gap_analysis.missing_skills}
          title="缺失能力"
          tone="amber"
        />
        <PlainList
          emptyText="暂无优先差距。"
          items={result.gap_analysis.priority_gaps}
          markdown
          title="优先补齐项"
        />
      </div>
    </ModuleCard>
  );
}

function JdBreakdown({ result }: { result: AnalysisResult }) {
  return (
    <ModuleCard title="JD Breakdown">
      <div className="grid gap-5">
        <PlainList
          emptyText="暂无核心要求。"
          items={result.jd_breakdown.core_requirements}
          markdown
          title="核心要求"
        />
        <PlainList
          emptyText="暂无隐性要求。"
          items={result.jd_breakdown.hidden_requirements}
          markdown
          title="隐性要求"
        />
        <TagGroup
          items={result.jd_breakdown.keywords}
          title="关键词"
          tone="slate"
        />
      </div>
    </ModuleCard>
  );
}

function CareerRoadmap({ result }: { result: AnalysisResult }) {
  return (
    <ModuleCard title="AI求职成长路线图">
      <div className="relative grid gap-4">
        {result.career_roadmap.length > 0 ? (
          result.career_roadmap.map((item, index) => (
            <div className="relative pl-9" key={`${item.week}-${index}`}>
              <div className="absolute left-3 top-7 h-full w-px bg-slate-200 last:hidden" />
              <div className="absolute left-0 top-1 grid size-7 place-items-center rounded-full bg-teal-700 text-xs font-semibold text-white">
                {index + 1}
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">
                  {item.week}
                </p>
                <h3 className="mt-1 text-sm font-semibold text-slate-950">
                  {item.goal}
                </h3>
                <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                  {item.tasks.map((task) => (
                    <li className="flex gap-2" key={`${item.week}-${task}`}>
                      <span className="mt-2 size-1.5 shrink-0 rounded-full bg-teal-600" />
                      <span>
                        <MarkdownText>{task}</MarkdownText>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-slate-500">暂无路线图。</p>
        )}
      </div>
    </ModuleCard>
  );
}

function ResumeRewrite({ result }: { result: AnalysisResult }) {
  return (
    <ModuleCard title="Resume Rewrite">
      <div className="grid gap-4">
        {result.rewrite_examples.length > 0 ? (
          result.rewrite_examples.map((example, index) => (
            <article
              className="rounded-lg border border-slate-200 bg-slate-50 p-4"
              key={`${example.original}-${index}`}
            >
              <div className="grid gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    改写前
                  </p>
                  <p className="mt-1 text-sm leading-6 text-slate-700">
                    {example.original}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">
                    改写后
                  </p>
                  <p className="mt-1 text-sm leading-6 text-slate-950">
                    {example.optimized}
                  </p>
                </div>
                <div className="rounded-md border border-teal-100 bg-white px-3 py-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    优化原因
                  </p>
                  <div className="mt-1 text-sm leading-6 text-slate-700">
                    <MarkdownText>{example.reason}</MarkdownText>
                  </div>
                </div>
              </div>
            </article>
          ))
        ) : (
          <p className="text-sm text-slate-500">
            暂无改写建议。
          </p>
        )}
      </div>
    </ModuleCard>
  );
}

function OptimizedResumeView({ result }: { result: OptimizedResume }) {
  return (
    <ModuleCard title="优化版简历">
      <div className="grid gap-5">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">个人总结</h3>
          {result.summary ? (
            <div className="mt-3 text-sm leading-6 text-slate-700">
              <MarkdownText>{result.summary}</MarkdownText>
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-500">暂无个人总结。</p>
          )}
        </div>
        <PlainList
          emptyText="暂无项目经历。"
          items={result.project_experience}
          markdown
          title="项目经历"
        />
        <PlainList
          emptyText="暂无实习经历。"
          items={result.internship_experience}
          markdown
          title="实习经历"
        />
        <PlainList
          emptyText="暂无校园经历。"
          items={result.campus_experience}
          markdown
          title="校园经历"
        />
        <PlainList
          emptyText="暂无技能。"
          items={result.skills}
          markdown
          title="技能"
        />
        <PlainList
          emptyText="暂无优化说明。"
          items={result.optimization_notes}
          markdown
          title="优化说明"
        />
      </div>
    </ModuleCard>
  );
}

export default function Home() {
  const optimizedResumeRef = useRef<HTMLDivElement | null>(null);
  const [resume, setResume] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [jdImageFile, setJdImageFile] = useState<File | null>(null);
  const [selectedUserStage, setSelectedUserStage] = useState("应届求职学生");
  const [selectedTargetRole, setSelectedTargetRole] = useState("产品经理");
  const [customTargetRole, setCustomTargetRole] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [optimizedResume, setOptimizedResume] =
    useState<OptimizedResume | null>(null);
  const [error, setError] = useState("");
  const [optimizeError, setOptimizeError] = useState("");
  const [exportError, setExportError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);

  const hasResumeInput = resumeFile !== null || resume.trim().length > 0;
  const hasJobDescriptionInput =
    jdImageFile !== null || jobDescription.trim().length > 0;
  const hasValidTargetRole =
    selectedTargetRole !== "其他" || customTargetRole.trim().length >= 2;
  const canAnalyze = useMemo(
    () =>
      hasResumeInput && hasJobDescriptionInput && hasValidTargetRole && !isLoading,
    [hasResumeInput, hasJobDescriptionInput, hasValidTargetRole, isLoading],
  );
  const resolvedTargetRole =
    selectedTargetRole === "其他" ? customTargetRole.trim() : selectedTargetRole;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!hasResumeInput) {
      setError("请上传简历文件或粘贴简历文本。");
      return;
    }

    if (!hasJobDescriptionInput) {
      setError("请填写目标岗位JD或上传JD截图。");
      return;
    }

    if (!hasValidTargetRole) {
      setError("请填写具体目标岗位。");
      return;
    }

    setError("");
    setResult(null);
    setOptimizedResume(null);
    setOptimizeError("");
    setExportError("");
    setIsLoading(true);

    try {
      const body = new FormData();

      if (resumeFile) {
        body.append("resumeFile", resumeFile);
      } else {
        body.append("resumeText", resume);
        body.append("resume", resume);
      }

      if (jdImageFile) {
        body.append("jdImageFile", jdImageFile);
        body.append("jobImage", jdImageFile);
      } else {
        body.append("jdText", jobDescription);
      }

      body.append("jobDescription", jobDescription);
      body.append("userStage", selectedUserStage);
      body.append("targetRole", selectedTargetRole);
      body.append("customTargetRole", customTargetRole.trim());

      const response = await fetch("/api/analyze", {
        method: "POST",
        body,
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "暂时无法完成分析，请稍后重试。");
      }

      setResult(payload);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "暂时无法完成分析，请稍后重试。",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function handleOptimize() {
    if (!result) {
      return;
    }

    const optimizeResumeText = result.source_text?.resumeText?.trim() || resume.trim();
    const optimizeJobDescription =
      result.source_text?.jobDescription?.trim() || jobDescription.trim();

    if (!optimizeResumeText) {
      setOptimizeError(
        "一键优化简历目前需要粘贴简历文本；如果你只上传了PDF/DOCX，请先把简历文本粘贴到左侧文本框。",
      );
      return;
    }

    if (!optimizeJobDescription) {
      setOptimizeError(
        "一键优化简历目前需要粘贴JD文本；如果你只上传了JD截图，请先把识别后的JD文本粘贴到左侧文本框。",
      );
      return;
    }

    setOptimizeError("");
    setExportError("");
    setOptimizedResume(null);
    setIsOptimizing(true);

    try {
      const response = await fetch("/api/optimize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          resumeText: optimizeResumeText,
          jobDescription: optimizeJobDescription,
          analysisResult: result,
          userStage: selectedUserStage,
          targetRole: resolvedTargetRole,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "暂时无法生成优化版简历，请稍后重试。");
      }

      setOptimizedResume(payload);
    } catch (caughtError) {
      setOptimizeError(
        caughtError instanceof Error
          ? caughtError.message
          : "暂时无法生成优化版简历，请稍后重试。",
      );
    } finally {
      setIsOptimizing(false);
    }
  }

  async function handleExportPDF() {
    if (typeof window === "undefined") {
      return;
    }

    if (!optimizedResume || !optimizedResumeRef.current) {
      return;
    }

    setExportError("");

    let exportContainer: HTMLDivElement | null = null;

    try {
      const html2canvas = (await import("html2canvas")).default;
      const { jsPDF } = await import("jspdf");
      const sanitizedElement = sanitizeExportElement(optimizedResumeRef.current);
      exportContainer = document.createElement("div");
      exportContainer.style.position = "fixed";
      exportContainer.style.left = "-9999px";
      exportContainer.style.top = "0";
      exportContainer.style.width = "794px";
      exportContainer.style.background = "#ffffff";
      exportContainer.style.color = "#0f172a";
      exportContainer.appendChild(sanitizedElement);
      document.body.appendChild(exportContainer);

      const canvas = await html2canvas(sanitizedElement, {
        backgroundColor: "#ffffff",
        scale: 2,
      });
      const pdf = new jsPDF("p", "mm", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imageWidth = pageWidth;
      const imageHeight = (canvas.height * imageWidth) / canvas.width;
      const imageData = canvas.toDataURL("image/png");
      let remainingHeight = imageHeight;
      let yPosition = 0;

      pdf.addImage(imageData, "PNG", 0, yPosition, imageWidth, imageHeight);
      remainingHeight -= pageHeight;

      while (remainingHeight > 0) {
        yPosition = remainingHeight - imageHeight;
        pdf.addPage();
        pdf.addImage(imageData, "PNG", 0, yPosition, imageWidth, imageHeight);
        remainingHeight -= pageHeight;
      }

      pdf.save("优化版简历.pdf");
    } catch (caughtError) {
      console.error(caughtError);
      setExportError("导出失败，请重试。");
    } finally {
      exportContainer?.remove();
    }
  }

  async function handleExportWord() {
    if (typeof window === "undefined") {
      return;
    }

    if (!optimizedResume) {
      return;
    }

    setExportError("");

    try {
      const fileSaverModule = (await import("file-saver")) as unknown as {
        default?: (data: Blob, filename?: string) => void;
        saveAs?: (data: Blob, filename?: string) => void;
      };
      const saveAsFile = fileSaverModule.saveAs ?? fileSaverModule.default;
      const {
        Document,
        HeadingLevel,
        Packer,
        Paragraph,
        TextRun,
      } = await import("docx");

      if (!saveAsFile) {
        throw new Error("file-saver saveAs export is unavailable.");
      }

      const optimizedResult = optimizedResume as Record<string, unknown>;
      const children: InstanceType<typeof Paragraph>[] = [
        new Paragraph({
          heading: HeadingLevel.TITLE,
          children: [new TextRun("优化版简历")],
        }),
      ];
      const normalizeToStringArray = (value: unknown) => {
        if (typeof value === "string") {
          const trimmed = value.trim();
          return trimmed ? [trimmed] : [];
        }

        if (!Array.isArray(value)) {
          return [];
        }

        return value
          .map((item) => {
            if (typeof item === "string") {
              return item.trim();
            }

            if (item && typeof item === "object") {
              return JSON.stringify(item);
            }

            if (item === null || item === undefined) {
              return "";
            }

            return String(item).trim();
          })
          .filter((item) => item.length > 0);
      };
      const appendSection = (title: string, value: unknown) => {
        const items = normalizeToStringArray(value);

        if (items.length === 0) {
          return;
        }

        children.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun(title)],
          }),
        );

        items.forEach((item) => {
          children.push(
            new Paragraph({
              children: [new TextRun(item)],
            }),
          );
        });
      };

      appendSection("个人总结", optimizedResult.summary);
      appendSection("项目经历", optimizedResult.project_experience);
      appendSection("实习经历", optimizedResult.internship_experience);
      appendSection("校园经历", optimizedResult.campus_experience);
      appendSection("技能", optimizedResult.skills);
      appendSection("优化说明", optimizedResult.optimization_notes);

      const document = new Document({
        sections: [
          {
            children:
              children.length > 0
                ? children
                : [new Paragraph({ children: [new TextRun("暂无优化版简历内容。")] })],
          },
        ],
      });
      const blob = await Packer.toBlob(document);

      saveAsFile(blob, "优化版简历.docx");
      setExportError("");
    } catch (caughtError) {
      console.error(caughtError);
      setExportError("导出失败，请重试。");
    }
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-slate-100 text-slate-950">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
        <div className="grid w-full min-w-0 gap-6 lg:grid-cols-[560px_minmax(0,1fr)]">
          <form
            className="min-h-0 w-full overflow-x-hidden rounded-xl border border-slate-200 bg-white p-6 shadow-sm lg:h-[calc(100vh-120px)] lg:w-[560px] lg:overflow-y-auto"
            onSubmit={handleSubmit}
          >
            <div>
              <div className="grid gap-5">
                <header className="border-b border-slate-200 pb-5">
                  <p className="text-sm font-semibold text-teal-700">
                    AI求职成长助手
                  </p>
                  <h1 className="mt-2 text-2xl font-semibold tracking-normal text-slate-950">
                    面向应届生和实习生的 AI 求职成长助手
                  </h1>
                  <p className="mt-3 text-sm leading-6 text-slate-600">
                    上传简历和目标岗位JD，快速获得简历评分、岗位匹配度、能力差距分析、JD拆解和求职成长建议。
                  </p>
                </header>

                <OptionGroup
                  helperText="选择你的求职阶段，系统会根据校招或实习场景调整分析重点。"
                  onChange={setSelectedUserStage}
                  options={userStageOptions}
                  selectedValue={selectedUserStage}
                  title="求职身份"
                />

                <OptionGroup
                  helperText="选择你主要投递的岗位方向。"
                  onChange={setSelectedTargetRole}
                  options={targetRoleOptions}
                  selectedValue={selectedTargetRole}
                  title="目标岗位"
                />

                {selectedTargetRole === "其他" ? (
                  <label className="grid gap-2">
                    <span className="text-sm font-medium text-slate-800">
                      具体岗位名称
                    </span>
                    <input
                      className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-teal-600 focus:ring-4 focus:ring-teal-100"
                      onChange={(event) => {
                        setCustomTargetRole(event.target.value);
                        setError("");
                      }}
                      placeholder="例如：市场、算法工程师、HR、财务、新媒体运营……"
                      value={customTargetRole}
                    />
                  </label>
                ) : null}

                <div className="grid gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-800">
                      上传简历文件
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      支持 PDF、DOCX
                    </p>
                  </div>
                  <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center transition hover:border-teal-500 hover:bg-teal-50">
                    <span className="text-sm font-semibold text-teal-700">
                      选择简历文件
                    </span>
                    <span className="mt-1 text-xs text-slate-500">
                      文件大小不超过 5MB
                    </span>
                    <input
                      accept=".pdf,.docx"
                      className="sr-only"
                      onChange={(event) => {
                        setResumeFile(event.target.files?.[0] ?? null);
                        setResult(null);
                        setError("");
                      }}
                      type="file"
                    />
                  </label>
                  {resumeFile ? (
                    <div className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-sm shadow-sm">
                      <span className="truncate font-medium text-teal-900">
                        {resumeFile.name}
                      </span>
                      <button
                        className="shrink-0 text-sm font-semibold text-teal-800 hover:text-teal-950"
                        onClick={() => setResumeFile(null)}
                        type="button"
                      >
                        移除
                      </button>
                    </div>
                  ) : null}
                </div>

                <div className="flex items-center gap-3 text-xs font-semibold tracking-wide text-slate-400">
                  <span className="h-px flex-1 bg-slate-200" />
                  或者
                  <span className="h-px flex-1 bg-slate-200" />
                </div>

                <label className="grid gap-2">
                  <span className="text-sm font-medium text-slate-800">
                    粘贴简历文本
                  </span>
                  <textarea
                    className="min-h-[220px] w-full resize-y overflow-x-hidden rounded-md border border-slate-300 bg-white px-3 py-3 text-sm leading-6 text-slate-900 outline-none transition focus:border-teal-600 focus:ring-4 focus:ring-teal-100"
                    onChange={(event) => setResume(event.target.value)}
                    placeholder="也可以把简历文本粘贴在这里……"
                    value={resume}
                  />
                </label>

                <div className="grid gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-800">
                      上传目标岗位JD截图
                    </p>
                    <p className="mt-1 text-sm leading-6 text-slate-500">
                      支持 PNG、JPG、JPEG、WEBP，系统会自动识别图片中的岗位描述文字。
                    </p>
                  </div>
                  <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-center transition hover:border-teal-500 hover:bg-teal-50">
                    <span className="text-sm font-semibold text-teal-700">
                      选择JD图片
                    </span>
                    <span className="mt-1 text-xs text-slate-500">
                      PNG、JPG、JPEG、WEBP，不超过 5MB
                    </span>
                    <input
                      accept=".png,.jpg,.jpeg,.webp"
                      className="sr-only"
                      onChange={(event) => {
                        setJdImageFile(event.target.files?.[0] ?? null);
                        setResult(null);
                        setError("");
                      }}
                      type="file"
                    />
                  </label>
                  {jdImageFile ? (
                    <div className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-sm shadow-sm">
                      <span className="truncate font-medium text-teal-900">
                        {jdImageFile.name}
                      </span>
                      <button
                        className="shrink-0 text-sm font-semibold text-teal-800 hover:text-teal-950"
                        onClick={() => setJdImageFile(null)}
                        type="button"
                      >
                        移除
                      </button>
                    </div>
                  ) : null}
                </div>

                <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  <span className="h-px flex-1 bg-slate-200" />
                  或者
                  <span className="h-px flex-1 bg-slate-200" />
                </div>

                <label className="grid gap-2">
                  <span className="text-sm font-medium text-slate-800">
                    粘贴目标岗位JD文本
                  </span>
                  <textarea
                    className="min-h-[220px] w-full resize-y overflow-x-hidden rounded-md border border-slate-300 bg-white px-3 py-3 text-sm leading-6 text-slate-900 outline-none transition focus:border-teal-600 focus:ring-4 focus:ring-teal-100"
                    onChange={(event) => setJobDescription(event.target.value)}
                    placeholder="也可以把岗位JD文本粘贴在这里……"
                    value={jobDescription}
                  />
                </label>
              </div>
            </div>

            {error ? (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            <div className="mt-5 border-t border-slate-200 pt-5">
              <button
                className="inline-flex h-11 w-full items-center justify-center rounded-md bg-teal-700 px-5 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                disabled={!canAnalyze}
                type="submit"
              >
                {isLoading
                  ? resumeFile || jdImageFile
                    ? "上传并分析中..."
                    : "分析中..."
                  : "分析"}
              </button>
            </div>
          </form>

          <aside className="min-h-0 w-full overflow-x-hidden rounded-xl border border-slate-200 bg-slate-50 p-6 shadow-sm lg:h-[calc(100vh-120px)] lg:overflow-y-auto">
            <div className="grid min-w-0 content-start gap-8">
              {isLoading ? (
                <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="h-3 w-28 animate-pulse rounded bg-slate-200" />
                  <div className="mt-5 h-10 w-36 animate-pulse rounded bg-slate-200" />
                  <div className="mt-6 space-y-3">
                    <div className="h-3 animate-pulse rounded bg-slate-200" />
                    <div className="h-3 w-5/6 animate-pulse rounded bg-slate-200" />
                    <div className="h-3 w-2/3 animate-pulse rounded bg-slate-200" />
                  </div>
                </div>
              ) : null}

              {result ? (
                <>
                  <ResultSection title="基础评分">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <ScoreRing label="简历评分" score={result.score} />
                      <ScoreRing
                        label="岗位匹配度"
                        score={result.job_match.score}
                      />
                    </div>
                  </ResultSection>

                  <section className="rounded-xl border border-teal-200 bg-white p-5 shadow-sm">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h2 className="text-base font-semibold text-slate-950">
                          一键优化简历
                        </h2>
                        <p className="mt-1 text-sm leading-6 text-slate-500">
                          根据当前分析结果、简历文本和目标岗位JD生成优化版草稿。
                        </p>
                      </div>
                      <button
                        className="inline-flex h-10 shrink-0 items-center justify-center rounded-md bg-teal-700 px-4 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                        disabled={isOptimizing}
                        onClick={handleOptimize}
                        type="button"
                      >
                        {isOptimizing ? "生成中..." : "生成优化版简历"}
                      </button>
                    </div>
                    {optimizeError ? (
                      <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                        {optimizeError}
                      </div>
                    ) : null}
                  </section>

                  <ResultSection title="简历诊断">
                    <div className="grid gap-4 xl:grid-cols-2">
                      <ResultList
                        emptyText="暂无优势。"
                        items={result.strengths}
                        title="简历优势"
                      />
                      <ResultList
                        emptyText="暂无短板。"
                        items={result.weaknesses}
                        title="简历短板"
                      />
                      <ResultList
                        emptyText="暂无优化建议。"
                        items={result.suggestions}
                        markdown
                        title="优化建议"
                      />
                      <ResultList
                        emptyText="暂无缺失能力。"
                        items={result.job_match.missing_skills}
                        title="缺失能力"
                      />
                    </div>
                  </ResultSection>

                  <ResultSection title="能力差距分析">
                    <GapAnalysis result={result} />
                  </ResultSection>

                  <ResultSection title="JD拆解">
                    <JdBreakdown result={result} />
                  </ResultSection>

                  <ResultSection title="4周求职成长路线图">
                    <CareerRoadmap result={result} />
                  </ResultSection>

                  <ResultSection title="简历改写建议">
                    <ResumeRewrite result={result} />
                  </ResultSection>

                  {optimizedResume ? (
                    <ResultSection title="优化版简历">
                      <div className="grid gap-4">
                        <div ref={optimizedResumeRef}>
                          <OptimizedResumeView result={optimizedResume} />
                        </div>
                        <div className="flex flex-wrap gap-3">
                          <button
                            className="inline-flex h-10 items-center justify-center rounded-md bg-teal-700 px-4 text-sm font-semibold text-white transition hover:bg-teal-800"
                            onClick={handleExportPDF}
                            type="button"
                          >
                            下载 PDF
                          </button>
                          <button
                            className="inline-flex h-10 items-center justify-center rounded-md border border-teal-200 bg-white px-4 text-sm font-semibold text-teal-800 transition hover:border-teal-300 hover:bg-teal-50"
                            onClick={handleExportWord}
                            type="button"
                          >
                            下载 Word
                          </button>
                        </div>
                        {exportError ? (
                          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                            {exportError}
                          </div>
                        ) : null}
                      </div>
                    </ResultSection>
                  ) : null}
                </>
              ) : null}

              {!result && !isLoading ? (
                <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm leading-6 text-slate-500">
                  分析结果会展示在这里，包括简历评分、岗位匹配度、能力差距分析、JD拆解和求职成长建议。
                </div>
              ) : null}
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
