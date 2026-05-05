export interface ConfidenceInput {
  retrievalScores: number[];
  citationCount: number;
  llmSelfReport: number;
}

export function score({ retrievalScores, citationCount, llmSelfReport }: ConfidenceInput): number {
  const topScore = retrievalScores.length > 0 ? Math.max(...retrievalScores) : 0;
  const normalizedRetrieval = Math.min(Math.max(topScore, 0), 1);
  const citationScore = Math.min(citationCount / 3, 1);
  const selfReport = Math.min(Math.max(llmSelfReport, 0), 1);

  return 0.4 * normalizedRetrieval + 0.2 * citationScore + 0.4 * selfReport;
}
