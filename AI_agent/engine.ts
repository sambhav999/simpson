import { KNOWLEDGE_BASE } from './knowledge';

export class HomerAgent {
  /**
   * Simple intent matching engine
   */
  public static async answer(message: string): Promise<string> {
    const query = message.toLowerCase();
    
    // 1. Initial greeting/thanks
    if (query === 'hi' || query === 'hello' || query === 'hey') {
      return "Hello! I'm Homer Baba, your SimPredict guide. 🔮 How can I help you today?";
    }
    
    // 2. Exact/Key match
    for (const item of KNOWLEDGE_BASE) {
      if (item.keywords.some(k => query.includes(k))) {
        return item.answer;
      }
    }
    
    // 3. Fuzzy match / Fallback
    return "I'm not exactly sure about that, but I'm here to help with questions about SimPredict, Solana Pay, XP, or Daily Battles! Ask me things like 'What is Homer Baba?' or 'How do I earn XP?'.";
  }
}
