export type ParsedDocument = {
  title?: string;
  content: string;
  metadata?: object;
};

export interface Parser {
  parse(buffer: Buffer, mimeType: string): Promise<ParsedDocument>;
  supports(mimeType: string): boolean;
}
