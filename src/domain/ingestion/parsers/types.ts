export type ParsedDocument = {
  title?: string | undefined;
  content: string;
  metadata?: object | undefined;
};

export interface Parser {
  parse(buffer: Buffer, mimeType: string): Promise<ParsedDocument>;
  supports(mimeType: string): boolean;
}
