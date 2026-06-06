import { NextResponse } from "next/server";

type AnalysisResult = {
  score?: number;
  strengths?: string[];
  weaknesses?: string[];
  suggestions?: string[];
  job_match?: {
    score?: number;
    missing_skills?: string[];
  };
  gap_analysis?: {
    matched_skills?: string[];
    missing_skills?: string[];
    priority_gaps?: string[];
  };
  jd_breakdown?: {
    core_requirements?: string[];
    hidden_requirements?: string[];
    keywords?: string[];
  };
  career_roadmap?: Array<{
    week?: string;
    goal?: string;
    tasks?: string[];
  }>;
  rewrite_examples?: Array<{
    original?: string;
    optimized?: string;
    reason?: string;
  }>;
};

type OptimizeRequest = {
  resumeText?: unknown;
  jobDescription?: unknown;
  analysisResult?: unknown;
  userStage?: unknown;
  targetRole?: unknown;
};

type OptimizedResume = {
  summary: string;
  project_experience: string[];
  internship_experience: string[];
  campus_experience: string[];
  skills: string[];
  optimization_notes: string[];
};

export const runtime = "nodejs";

const fallbackOptimizedResume: OptimizedResume = {
  summary: "",
  project_experience: [],
  internship_experience: [],
  campus_experience: [],
  skills: [],
  optimization_notes: [],
};

class UserFacingError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function normalizeOptimizedResume(value: unknown): OptimizedResume {
  if (!value || typeof value !== "object") {
    return fallbackOptimizedResume;
  }

  const data = value as Partial<OptimizedResume>;

  return {
    summary: typeof data.summary === "string" ? data.summary : "",
    project_experience: stringArray(data.project_experience),
    internship_experience: stringArray(data.internship_experience),
    campus_experience: stringArray(data.campus_experience),
    skills: stringArray(data.skills),
    optimization_notes: stringArray(data.optimization_notes),
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
  return jsonText
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'");
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

function buildOptimizePrompt({
  resumeText,
  jobDescription,
  analysisResult,
  userStage,
  targetRole,
}: {
  resumeText: string;
  jobDescription: string;
  analysisResult: AnalysisResult;
  userStage: string;
  targetRole: string;
}) {
  return `你是一名资深职业顾问和简历优化专家。请基于原始简历、目标岗位JD、当前AI分析结果、求职身份和目标岗位，生成一份优化版简历草稿。

必须只返回合法 JSON，不要返回 Markdown，不要解释。
所有数组项都必须是字符串。
不要编造不存在的学校、公司、奖项、证书或经历；可以优化表达、结构、关键词和量化方式。

求职身份:
${userStage || "未提供"}

目标岗位:
${targetRole || "未提供"}

原始简历:
${resumeText}

目标岗位JD:
${jobDescription}

当前分析结果:
${JSON.stringify(analysisResult)}

返回 JSON 结构必须完全匹配:
{
  "summary": "",
  "project_experience": [],
  "internship_experience": [],
  "campus_experience": [],
  "skills": [],
  "optimization_notes": []
}`;
}

async function callDeepSeek({
  resumeText,
  jobDescription,
  analysisResult,
  userStage,
  targetRole,
}: {
  resumeText: string;
  jobDescription: string;
  analysisResult: AnalysisResult;
  userStage: string;
  targetRole: string;
}) {
  if (!process.env.DEEPSEEK_API_KEY) {
    throw new UserFacingError("Missing DEEPSEEK_API_KEY in .env.local.", 500);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);
  const baseUrl = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";
  const endpoint = `${baseUrl.replace(/\/$/, "")}/chat/completions`;
  const model = process.env.DEEPSEEK_MODEL || "deepseek-chat";

  try {
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
            content: buildOptimizePrompt({
              resumeText,
              jobDescription,
              analysisResult,
              userStage,
              targetRole,
            }),
          },
        ],
        temperature: 0.3,
      }),
    });
    const responseText = await response.text();

    if (!response.ok) {
      throw new UserFacingError(
        `DeepSeek调用失败：状态码 ${response.status}`,
        response.status,
      );
    }

    let responsePayload: unknown;

    try {
      responsePayload = JSON.parse(responseText);
    } catch {
      throw new UserFacingError("AI返回格式异常，请重试。", 500);
    }

    const content = extractDeepSeekContent(responsePayload);

    if (!content) {
      throw new UserFacingError("DeepSeek API returned an empty response.", 502);
    }

    try {
      const extractedJson = extractFirstJsonBlock(content);
      const repairedJson = repairModelJson(extractedJson);

      return JSON.parse(repairedJson);
    } catch (error) {
      console.error("Optimize JSON parse failure", error);
      console.error("Raw optimize model content", content);
      throw new UserFacingError("AI返回格式异常，请重试。", 500);
    }
  } catch (error) {
    if (error instanceof UserFacingError) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new UserFacingError("AI生成超时，请稍后重试。", 504);
    }

    throw new UserFacingError("AI服务暂时不可用，请稍后重试。", 502);
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as OptimizeRequest;
    const resumeText =
      typeof body.resumeText === "string" ? body.resumeText.trim() : "";
    const jobDescription =
      typeof body.jobDescription === "string"
        ? body.jobDescription.trim()
        : "";
    const userStage =
      typeof body.userStage === "string" ? body.userStage.trim() : "";
    const targetRole =
      typeof body.targetRole === "string" ? body.targetRole.trim() : "";
    const analysisResult =
      body.analysisResult && typeof body.analysisResult === "object"
        ? (body.analysisResult as AnalysisResult)
        : {};

    if (!resumeText) {
      return NextResponse.json(
        { error: "请先提供简历文本，再生成优化版简历。" },
        { status: 400 },
      );
    }

    if (!jobDescription) {
      return NextResponse.json(
        { error: "请先提供目标岗位JD文本，再生成优化版简历。" },
        { status: 400 },
      );
    }

    const optimizedResume = await callDeepSeek({
      resumeText,
      jobDescription,
      analysisResult,
      userStage,
      targetRole,
    });

    return NextResponse.json(normalizeOptimizedResume(optimizedResume));
  } catch (error) {
    if (error instanceof UserFacingError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }

    console.error(error);

    return NextResponse.json(
      { error: "生成优化版简历时出现错误，请稍后重试。" },
      { status: 500 },
    );
  }
}
