export type TemplateParamType = "text" | "select";

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

export function applyTemplate(
  template: string,
  params: Record<string, string>,
): string {
  return template.replace(/{{\s*([a-zA-Z0-9_-]+)\s*}}/g, (_, key: string) => {
    return params[key] ?? "";
  });
}
