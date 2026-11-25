export interface Finding {
  validator: string;
  field: string;
  blocking: boolean;
  message: string;
  kind?: string;
  quoteA?: string;
  quoteB?: string;
  otherField?: string;
}

export interface GateResult {
  pass: boolean;
  findings: Finding[];
}

export function gate(findings: Finding[]): GateResult {
  return { pass: !findings.some((f) => f.blocking), findings };
}
