import pipelineJson from "./pipeline.json";

export interface PipelineConfig {
  maxCardCostUSD: number;
  repairsPerField: number;
  escalationsPerCard: number;
  auditCyclesPerCard: number;
  parallelGreetings: number;
  cacheKey: string;
  budgetHardFail: number;
  regenerateTarget: number;
}

export const PIPELINE_CONFIG: PipelineConfig = pipelineJson;
