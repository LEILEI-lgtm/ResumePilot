import { NextResponse } from "next/server";
import { createRequire } from "module";
import { access, copyFile, mkdir } from "fs/promises";
import os from "os";
import path from "path";
import mammoth from "mammoth";
import { recognize } from "tesseract.js";

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
};

type ResumePayload = {
  resumeText: string;
  jobDescription: string;
  userStage: string;
  targetRole: string;
  hasJobImage: boolean;
};

type PdfParse = (buffer: Buffer) => Promise<{ text: string }>;

export const runtime = "nodejs";

const maxFileSize = 5 * 1024 * 1024;
const supportedFileTypes = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
} as const;
const supportedJobImageTypes = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);
const require = createRequire(import.meta.url);
const ocrLangData = [
  {
    name: "eng.traineddata.gz",
    sourcePath: path.join(
      process.cwd(),
      "node_modules",
      "@tesseract.js-data",
      "eng",
      "4.0.0",
      "eng.traineddata.gz",
    ),
  },
  {
    name: "chi_sim.traineddata.gz",
    sourcePath: path.join(
      process.cwd(),
      "node_modules",
      "@tesseract.js-data",
      "chi_sim",
      "4.0.0",
      "chi_sim.traineddata.gz",
    ),
  },
] as const;
const tesseractWorkerPath = path.join(
  process.cwd(),
  "node_modules",
  "tesseract.js",
  "src",
  "worker-script",
  "node",
  "index.js",
);
const tesseractCorePath = path.join(
  process.cwd(),
  "node_modules",
  "tesseract.js-core",
);
const fallbackResult: AnalysisResult = {
  score: 0,
  strengths: [],
  weaknesses: [],
  suggestions: [],
  job_match: {
    score: 0,
    missing_skills: [],
  },
  gap_analysis: {
    matched_skills: [],
    missing_skills: [],
    priority_gaps: [],
  },
  jd_breakdown: {
    core_requirements: [],
    hidden_requirements: [],
    keywords: [],
  },
  career_roadmap: [],
  rewrite_examples: [],
};

const mockResult: AnalysisResult = {
  score: 82,
  strengths: [
    "具备项目经历，能展示基础产品思维",
    "有一定技术背景，适合AI产品方向",
  ],
  weaknesses: ["项目成果缺少量化指标", "AI产品相关能力展示不够突出"],
  suggestions: [
    "补充项目中的用户规模、转化率、效率提升等指标",
    "增加Prompt设计、LLM应用、Agent产品理解等关键词",
  ],
  job_match: {
    score: 76,
    missing_skills: ["A/B测试", "Agent产品设计", "数据分析能力"],
  },
  gap_analysis: {
    matched_skills: ["用户调研", "产品设计", "Python基础", "Prompt使用"],
    missing_skills: ["A/B测试", "SQL分析", "Agent工作流设计"],
    priority_gaps: [
      "优先补充AI产品项目经历",
      "补充数据分析和指标意识",
      "强化JD关键词匹配",
    ],
  },
  jd_breakdown: {
    core_requirements: [
      "理解大模型产品形态",
      "能输出PRD和产品流程图",
      "具备用户研究和需求分析能力",
    ],
    hidden_requirements: [
      "需要能把AI能力转化为具体产品功能",
      "需要有从Demo到MVP的落地经验",
      "需要懂基本数据分析和效果评估",
    ],
    keywords: ["LLM", "Prompt Engineering", "Agent", "PRD", "用户调研", "数据分析"],
  },
  career_roadmap: [
    {
      week: "第1周",
      goal: "补齐AI产品基础",
      tasks: ["学习Prompt Engineering基础", "整理3个AI产品案例", "补充简历中的AI关键词"],
    },
    {
      week: "第2周",
      goal: "强化数据与实验能力",
      tasks: ["学习SQL基础查询", "理解A/B测试流程", "把项目成果改成量化表达"],
    },
    {
      week: "第3周",
      goal: "完成AI项目包装",
      tasks: ["完善ResumePilot项目PRD", "补充竞品分析和用户调研", "录制2分钟Demo视频"],
    },
    {
      week: "第4周",
      goal: "开始投递和复盘",
      tasks: ["根据JD定制简历", "投递AI产品实习岗位", "记录投递反馈并继续优化"],
    },
  ],
  rewrite_examples: [
    {
      original: "负责校园二手交易平台产品设计",
      optimized:
        "负责校园二手交易平台从0到1产品设计，完成20名用户访谈，梳理发布商品、搜索商品、在线沟通等核心流程，并输出PRD和高保真原型。",
      reason: "补充了用户调研、核心流程、PRD和原型产出，更符合产品经理岗位要求。",
    },
    {
      original: "使用Python调用大模型API，实现问答功能",
      optimized:
        "基于Python调用大模型API，设计Prompt模板并完成AI问答Demo，实现用户输入问题后自动生成结构化回答，验证LLM在求职场景中的应用可行性。",
      reason: "突出AI产品能力、Prompt设计能力和场景验证价值。",
    },
  ],
};

const demoMode = process.env.DEMO_MODE !== "false";

class UserFacingError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function getSupportedFileType(file: File) {
  if (Object.hasOwn(supportedFileTypes, file.type)) {
    return supportedFileTypes[file.type as keyof typeof supportedFileTypes];
  }

  const fileName = file.name.toLowerCase();

  if (fileName.endsWith(".pdf")) {
    return "pdf";
  }

  if (fileName.endsWith(".docx")) {
    return "docx";
  }

  return null;
}

function isFile(value: FormDataEntryValue | null): value is File {
  return value instanceof File;
}

async function fileExists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function getLocalOcrLangPath() {
  const langPath = path.join(os.tmpdir(), "resumepilot-tessdata");

  await mkdir(langPath, { recursive: true });

  await Promise.all(
    ocrLangData.map(async ({ name, sourcePath }) => {
      const target = path.join(langPath, name);

      if (await fileExists(target)) {
        return;
      }

      await copyFile(sourcePath, target);
    }),
  );

  return langPath;
}

async function extractPdfText(buffer: Buffer) {
  const pdfParse = require("pdf-parse/lib/pdf-parse.js") as PdfParse;
  const data = await pdfParse(buffer);

  return data.text;
}

async function extractDocxText(buffer: Buffer) {
  const data = await mammoth.extractRawText({ buffer });

  return data.value;
}

async function extractTextFromFile(file: File) {
  if (file.size > maxFileSize) {
    throw new UserFacingError("Resume file must be 5MB or smaller.");
  }

  const fileType = getSupportedFileType(file);

  if (!fileType) {
    throw new UserFacingError(
      "Unsupported file type. Please upload a PDF or DOCX file.",
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    if (fileType === "pdf") {
      return await extractPdfText(buffer);
    }

    return await extractDocxText(buffer);
  } catch {
    throw new UserFacingError(
      "We could not read that resume file. Please upload a readable PDF or DOCX, or paste the text instead.",
    );
  }
}

async function extractJobImageText(file: File) {
  if (file.size > maxFileSize) {
    throw new UserFacingError("JD截图不能超过 5MB。");
  }

  if (!supportedJobImageTypes.has(file.type)) {
    throw new UserFacingError("JD截图仅支持 PNG、JPG、JPEG 或 WEBP 格式。");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  console.log("JD OCR start", {
    name: file.name,
    size: file.size,
    type: file.type,
  });

  try {
    const langPath = await getLocalOcrLangPath();
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(
          new UserFacingError(
            "JD截图识别超时，请换一张更清晰的图片或粘贴JD文本。",
          ),
        );
      }, 25_000);
    });

    const result = await Promise.race([
      recognize(buffer, "chi_sim+eng", {
        cachePath: path.join(os.tmpdir(), "resumepilot-tess-cache"),
        corePath: tesseractCorePath,
        langPath: `${langPath}${path.sep}`,
        workerPath: tesseractWorkerPath,
      }),
      timeoutPromise,
    ]);
    const text = result.data.text.trim();

    console.log("JD OCR text length", text.length);

    if (text.length < 20) {
      throw new UserFacingError(
        "JD截图识别内容过少，请换一张更清晰的图片或粘贴JD文本。",
      );
    }

    return text;
  } catch (error) {
    console.error("JD OCR error", error);

    if (error instanceof UserFacingError) {
      throw error;
    }

    throw new UserFacingError(
      "JD截图识别失败，请换一张更清晰的图片或粘贴JD文本。",
    );
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

async function getResumePayload(
  request: Request,
  parsedFormData?: FormData,
): Promise<ResumePayload> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const formData = parsedFormData ?? (await request.formData());
    const file = formData.get("resumeFile");
    const jobImage = formData.get("jobImage") ?? formData.get("jdImageFile");
    const resume = formData.get("resume");
    const resumeText = formData.get("resumeText");
    const jobDescription = formData.get("jobDescription") ?? formData.get("jdText");
    const userStage = formData.get("userStage");
    const targetRole = formData.get("targetRole");
    const customTargetRole = formData.get("customTargetRole");
    const typedJobDescription =
      typeof jobDescription === "string" ? jobDescription.trim() : "";
    const ocrJobDescription = isFile(jobImage)
      ? await extractJobImageText(jobImage)
      : "";
    const resolvedJobDescription =
      typedJobDescription && ocrJobDescription
        ? `${typedJobDescription}\n\nOCR识别JD内容：\n${ocrJobDescription}`
        : ocrJobDescription || typedJobDescription;
    const resolvedTargetRole =
      targetRole === "其他" && typeof customTargetRole === "string"
        ? customTargetRole.trim()
        : typeof targetRole === "string"
          ? targetRole
          : "";

    if (!isFile(file)) {
      return {
        resumeText:
          typeof resumeText === "string"
            ? resumeText
            : typeof resume === "string"
              ? resume
              : "",
        jobDescription: resolvedJobDescription,
        userStage: typeof userStage === "string" ? userStage : "",
        targetRole: resolvedTargetRole,
        hasJobImage: isFile(jobImage),
      };
    }

    return {
      resumeText: await extractTextFromFile(file),
      jobDescription: resolvedJobDescription,
      userStage: typeof userStage === "string" ? userStage : "",
      targetRole: resolvedTargetRole,
      hasJobImage: isFile(jobImage),
    };
  }

  const {
    resume,
    resumeText,
    jobDescription,
    jdText,
    userStage,
    targetRole,
    customTargetRole,
  } = await request.json();
  const resolvedTargetRole =
    targetRole === "其他" && typeof customTargetRole === "string"
      ? customTargetRole.trim()
      : typeof targetRole === "string"
        ? targetRole
        : "";

  return {
    resumeText:
      typeof resumeText === "string"
        ? resumeText
        : typeof resume === "string"
          ? resume
          : "",
    jobDescription:
      typeof jobDescription === "string"
        ? jobDescription.trim()
        : typeof jdText === "string"
          ? jdText.trim()
          : "",
    userStage: typeof userStage === "string" ? userStage : "",
    targetRole: resolvedTargetRole,
    hasJobImage: false,
  };
}

function clampScore(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(numeric)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function objectValue(value: unknown) {
  return value && typeof value === "object" ? value : {};
}

function normalizeRoadmap(value: unknown): AnalysisResult["career_roadmap"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === "object",
    )
    .map((item) => ({
      week: typeof item.week === "string" ? item.week : "",
      goal: typeof item.goal === "string" ? item.goal : "",
      tasks: stringArray(item.tasks),
    }));
}

function normalizeRewriteExamples(
  value: unknown,
): AnalysisResult["rewrite_examples"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === "object",
    )
    .map((item) => ({
      original: typeof item.original === "string" ? item.original : "",
      optimized: typeof item.optimized === "string" ? item.optimized : "",
      reason: typeof item.reason === "string" ? item.reason : "",
    }));
}

function normalizeAnalysis(value: unknown): AnalysisResult {
  if (!value || typeof value !== "object") {
    return fallbackResult;
  }

  const data = value as Partial<AnalysisResult>;
  const jobMatch = objectValue(data.job_match) as Partial<
    AnalysisResult["job_match"]
  >;
  const gapAnalysis = objectValue(data.gap_analysis) as Partial<
    AnalysisResult["gap_analysis"]
  >;
  const jdBreakdown = objectValue(data.jd_breakdown) as Partial<
    AnalysisResult["jd_breakdown"]
  >;

  return {
    score: clampScore(data.score),
    strengths: stringArray(data.strengths),
    weaknesses: stringArray(data.weaknesses),
    suggestions: stringArray(data.suggestions),
    job_match: {
      score: clampScore(jobMatch.score),
      missing_skills: stringArray(jobMatch.missing_skills),
    },
    gap_analysis: {
      matched_skills: stringArray(gapAnalysis.matched_skills),
      missing_skills: stringArray(gapAnalysis.missing_skills),
      priority_gaps: stringArray(gapAnalysis.priority_gaps),
    },
    jd_breakdown: {
      core_requirements: stringArray(jdBreakdown.core_requirements),
      hidden_requirements: stringArray(jdBreakdown.hidden_requirements),
      keywords: stringArray(jdBreakdown.keywords),
    },
    career_roadmap: normalizeRoadmap(data.career_roadmap),
    rewrite_examples: normalizeRewriteExamples(data.rewrite_examples),
  };
}

function extractFirstJsonBlock(text: string) {
  const trimmed = text.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fencedMatch?.[1]?.trim() ?? trimmed;
  const firstBrace = candidate.indexOf("{");

  if (firstBrace === -1) {
    return candidate;
  }

  let depth = 0;
  let inString = false;
  let isEscaped = false;

  for (let index = firstBrace; index < candidate.length; index += 1) {
    const char = candidate[index];

    if (isEscaped) {
      isEscaped = false;
      continue;
    }

    if (char === "\\") {
      isEscaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "{") {
      depth += 1;
    }

    if (char === "}") {
      depth -= 1;

      if (depth === 0) {
        return candidate.slice(firstBrace, index + 1).trim();
      }
    }
  }

  return candidate.slice(firstBrace).trim();
}

function repairModelJson(jsonText: string) {
  return jsonText.replace(
    /("week"\s*:\s*)(\d+)\s*-\s*(\d+)(\s*[,}])/g,
    (_, prefix: string, start: string, end: string, suffix: string) =>
      `${prefix}"第${start}-${end}周"${suffix}`,
  );
}

function extractDeepSeekContent(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const data = payload as {
    choices?: Array<{
      message?: {
        content?: unknown;
      };
    }>;
  };

  const content = data.choices?.[0]?.message?.content ?? "";

  return typeof content === "string" ? content : "";
}

function getFormDataSummary(formData: FormData) {
  return Array.from(formData.entries()).map(([key, value]) => {
    if (isFile(value)) {
      return {
        key,
        kind: "file",
        name: value.name,
        size: value.size,
        type: value.type,
      };
    }

    return {
      key,
      kind: "text",
      length: value.length,
    };
  });
}

function buildDeepSeekPrompt({
  resumeText,
  jobDescription,
  userStage,
  targetRole,
}: ResumePayload) {
  return `请根据以下信息输出严格 JSON，不要输出 Markdown，不要输出解释文字。
必须返回合法 JSON。不要使用 1-2、3-4 这类未加引号的表达式。

求职身份:
${userStage || "未提供"}

目标岗位:
${targetRole || "未提供"}

简历内容:
${resumeText}

JD内容:
${jobDescription || "未提供"}

评分要求:
- score 必须是 0 到 100 的整数，基于简历整体质量、经历清晰度、岗位相关性、量化成果和结构完整度评分。
- job_match.score 必须是 0 到 100 的整数，基于简历与目标岗位 JD 的匹配程度评分。
- 不要复制示例分数；必须根据不同的简历和 JD 输入给出不同分数。

简历评分标准:
- 0-40: weak resume, unclear experience
- 41-60: basic resume, lacks quantified achievements
- 61-80: decent resume, has relevant experience but needs improvement
- 81-100: strong resume, relevant experience, quantified impact, clear structure

岗位匹配评分标准:
- 0-40: weak match
- 41-60: partial match
- 61-80: good match with some gaps
- 81-100: strong match

返回 JSON 字段结构必须完全一致:
- score: 0 到 100 的整数
- strengths: 字符串数组
- weaknesses: 字符串数组
- suggestions: 字符串数组
- job_match: 包含 score 和 missing_skills
- gap_analysis: 包含 matched_skills、missing_skills、priority_gaps
- jd_breakdown: 包含 core_requirements、hidden_requirements、keywords
- career_roadmap: 数组，每项包含 week、goal、tasks
- career_roadmap.week 必须是字符串，不能是数字或表达式。正确示例: "week": "第1周"、"week": "第1-2周"、"week": "第3-4周"
- rewrite_examples: 数组，每项包含 original、optimized、reason`;
}

async function callDeepSeek(payload: ResumePayload) {
  if (!process.env.DEEPSEEK_API_KEY) {
    throw new UserFacingError("Missing DEEPSEEK_API_KEY in .env.local.", 500);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);
  const baseUrl = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";
  const endpoint = `${baseUrl.replace(/\/$/, "")}/chat/completions`;
  const model = process.env.DEEPSEEK_MODEL || "deepseek-chat";

  try {
    console.log("DeepSeek request start", {
      endpoint,
      model,
      resumeTextLength: payload.resumeText.length,
      jobDescriptionLength: payload.jobDescription.length,
    });

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              "你是一名资深职业顾问和招聘专家。你必须只返回合法 JSON，不要返回 Markdown，不要解释。",
          },
          {
            role: "user",
            content: buildDeepSeekPrompt(payload),
          },
        ],
        temperature: 0.3,
      }),
    });
    const responseText = await response.text();

    console.log("DeepSeek HTTP status", response.status);
    console.log("Raw DeepSeek response body", responseText);

    if (!response.ok) {
      throw new UserFacingError(
        `DeepSeek调用失败：状态码 ${response.status}`,
        response.status,
      );
    }

    let responsePayload: unknown;

    try {
      responsePayload = JSON.parse(responseText);
    } catch (error) {
      console.error("DeepSeek response JSON parse error", error);
      throw new UserFacingError("AI返回格式异常，请重试。", 500);
    }

    const content = extractDeepSeekContent(responsePayload);

    console.log("Raw DeepSeek message content", content);

    if (!content) {
      throw new UserFacingError("DeepSeek API returned an empty response.", 502);
    }

    try {
      const extractedJson = extractFirstJsonBlock(content);
      const repairedJson = repairModelJson(extractedJson);

      console.log("Repaired JSON preview", repairedJson.slice(0, 1000));

      const parsed = JSON.parse(repairedJson);

      console.log("AI JSON parse success");

      return parsed;
    } catch (error) {
      console.error("AI JSON parse failure", error);
      console.error("Raw model content for parse failure", content);
      throw new UserFacingError("AI返回格式异常，请重试。", 500);
    }
  } catch (error) {
    if (error instanceof UserFacingError) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new UserFacingError("AI分析超时，请稍后重试。", 504);
    }

    throw new UserFacingError("AI服务暂时不可用，请稍后重试。", 502);
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    let parsedFormData: FormData | undefined;

    console.log(
      `Analyze API mode: ${demoMode ? "demo" : "real"} (DEMO_MODE=${process.env.DEMO_MODE ?? "unset"})`,
    );

    if (contentType.includes("multipart/form-data")) {
      parsedFormData = await request.formData();

      console.log(
        "Demo multipart fields received:",
        getFormDataSummary(parsedFormData),
      );

      if (demoMode) {
        return NextResponse.json(mockResult);
      }
    }

    if (demoMode) {
      return NextResponse.json(mockResult);
    }

    const { resumeText, jobDescription, userStage, targetRole } =
      await getResumePayload(request, parsedFormData);

    console.log("Final resumeText length", resumeText.length);
    console.log("Final jobDescription length", jobDescription.length);

    if (resumeText.trim().length < 40) {
      return NextResponse.json(
        {
          error:
            "Please provide a resume with at least 40 readable characters.",
        },
        { status: 400 },
      );
    }

    const parsed = await callDeepSeek({
      resumeText,
      jobDescription,
      userStage,
      targetRole,
    });

    return NextResponse.json({
      ...normalizeAnalysis(parsed),
      source_text: {
        resumeText,
        jobDescription,
      },
    });
  } catch (error) {
    if (error instanceof UserFacingError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }

    console.error(error);

    return NextResponse.json(
      { error: "Something went wrong while analyzing the resume." },
      { status: 500 },
    );
  }
}
