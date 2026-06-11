// LangSmith dataset wiring (optional).
//
// Evals run against the SAME runOcr/analyzeText as production and are recorded in
// LangSmith when its env is present (specs/06-evals.md). LangSmith is a SOFT
// dependency: when LANGCHAIN/LANGSMITH env is absent the runner still executes
// fully and scores locally — registration is simply skipped. We dynamic-import
// the `langsmith` client so the local path never needs it loaded.

export interface LangSmithEnv {
  LANGCHAIN_TRACING_V2?: string;
  LANGCHAIN_API_KEY?: string;
  LANGSMITH_API_KEY?: string;
  LANGCHAIN_PROJECT?: string;
}

/** True when enough LangSmith env is present to register datasets / record runs. */
export function isLangSmithEnabled(env: LangSmithEnv = process.env): boolean {
  const tracingOn = env.LANGCHAIN_TRACING_V2 === 'true';
  const hasKey = Boolean(env.LANGCHAIN_API_KEY ?? env.LANGSMITH_API_KEY);
  return tracingOn && hasKey;
}

/** A dataset to mirror into LangSmith: a name and example input/output pairs. */
export interface RegisterDatasetInput {
  datasetName: string;
  description?: string;
  examples: Array<{ inputs: Record<string, unknown>; outputs: Record<string, unknown> }>;
}

/**
 * Register (idempotently create + populate) a LangSmith dataset from local
 * fixtures. No-ops and returns `false` when LangSmith is not enabled, so callers
 * can stay agnostic. Returns `true` when the dataset was ensured in LangSmith.
 */
export async function registerLangSmithDataset(
  input: RegisterDatasetInput,
  env: LangSmithEnv = process.env,
): Promise<boolean> {
  if (!isLangSmithEnabled(env)) return false;

  // Imported lazily so the offline path never loads the client.
  const { Client } = await import('langsmith');
  const client = new Client();

  let dataset;
  if (await client.hasDataset({ datasetName: input.datasetName })) {
    dataset = await client.readDataset({ datasetName: input.datasetName });
  } else {
    dataset = await client.createDataset(input.datasetName, {
      description: input.description ?? '',
    });
  }

  for (const ex of input.examples) {
    await client.createExample({
      inputs: ex.inputs,
      outputs: ex.outputs,
      dataset_id: dataset.id,
    });
  }
  return true;
}
