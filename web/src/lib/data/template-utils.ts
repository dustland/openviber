export type TemplateParamType = "text" | "select";

export type TemplateSmartFields = Record<string, string>;

export interface TemplateParamOption {
  value: string;
  label: string;
}

export interface TemplateParam {
  id: string;
  label: string;
  description?: string;
  type: TemplateParamType;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
  options?: TemplateParamOption[];
}

export interface EnvironmentSmartContext {
  name?: string | null;
  repoUrl?: string | null;
  repoOrg?: string | null;
  repoName?: string | null;
  repoBranch?: string | null;
  workingDir?: string | null;
}

export function buildDefaultParams(
  params: TemplateParam[] = [],
): Record<string, string> {
  return params.reduce<Record<string, string>>((acc, param) => {
    if (param.defaultValue != null) {
      acc[param.id] = param.defaultValue;
      return acc;
    }
    if (param.type === "select" && param.options && param.options.length > 0) {
      acc[param.id] = param.options[0].value;
      return acc;
    }
    acc[param.id] = "";
    return acc;
  }, {});
}

function parseGitHubRepoSlug(input?: string | null): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  const match = trimmed.match(/github\.com[:/]+([^/]+)\/([^/.]+)(?:\.git)?/i);
  if (!match) return null;
  return `${match[1]}/${match[2]}`;
}

export function buildEnvironmentSmartFields(
  context?: EnvironmentSmartContext | null,
): TemplateSmartFields {
  if (!context) return {};
  const repoSlug =
    (context.repoOrg && context.repoName
      ? `${context.repoOrg}/${context.repoName}`
      : null) || parseGitHubRepoSlug(context.repoUrl);
  return {
    environmentName: context.name ?? "",
    environmentRepo: repoSlug ?? "",
    environmentRepoUrl: context.repoUrl ?? "",
    environmentRepoOrg: context.repoOrg ?? "",
    environmentRepoName: context.repoName ?? "",
    environmentRepoBranch: context.repoBranch ?? "",
    environmentWorkingDir: context.workingDir ?? "",
  };
}

const SMART_PARAM_MAP: Record<string, keyof TemplateSmartFields> = {
  targetRepo: "environmentRepo",
  repo: "environmentRepo",
  repoUrl: "environmentRepoUrl",
  repoOrg: "environmentRepoOrg",
  repoName: "environmentRepoName",
  repoBranch: "environmentRepoBranch",
  environmentName: "environmentName",
  workingDir: "environmentWorkingDir",
};

export function applySmartDefaults(
  params: Record<string, string>,
  smartFields: TemplateSmartFields,
): Record<string, string> {
  const next = { ...params };
  for (const [paramId, smartKey] of Object.entries(SMART_PARAM_MAP)) {
    const current = next[paramId];
    const smartValue = smartFields[smartKey];
    if ((current == null || current === "") && smartValue) {
      next[paramId] = smartValue;
    }
  }
  return next;
}

export function applyTemplate(
  template: string,
  params: Record<string, string>,
  smartFields: TemplateSmartFields = {},
): string {
  const merged = { ...smartFields, ...params };
  return template.replace(/{{\s*([a-zA-Z0-9_-]+)\s*}}/g, (_, key: string) => {
    return merged[key] ?? "";
  });
}
