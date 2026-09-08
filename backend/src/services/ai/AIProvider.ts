export interface GenerateTextOptions {
  systemInstruction?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AIProvider {
  readonly name: string;
  readonly model: string;
  generateText(prompt: string, options?: GenerateTextOptions): Promise<string>;
}
