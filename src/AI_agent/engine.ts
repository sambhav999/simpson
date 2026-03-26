import { KNOWLEDGE_BASE } from './knowledge';

export class HomerAgent {
  /**
   * Smarter matching engine with word-based detection
   */
  public static async answer(message: string): Promise<string> {
    const query = message.toLowerCase().replace(/[^a-z0-0\s]/g, '');
    const queryWords = query.split(/\s+/).filter(w => w.length > 0);
    
    // 1. Initial greeting/thanks
    if (query.includes('hi ') || query.includes('hello') || query.includes('hey') || query === 'hi') {
      return "Hello! I'm Homer Baba, your SimPredict guide. 🔮 How can I help you today?";
    }
    
    let bestMatch: any = null;
    let maxMatchedWords = 0;

    for (const item of KNOWLEDGE_BASE) {
      for (const keyword of item.keywords) {
        const kwWords = keyword.toLowerCase().split(/\s+/);
        let matched = 0;

        for (const kwWord of kwWords) {
          // Check if kwWord exists in queryWords (either exact or prefix)
          const isFound = queryWords.some(qw => 
            qw === kwWord || 
            (kwWord.length > 3 && qw.startsWith(kwWord.slice(0, -1))) || // predictio -> predictio0ns
            (qw.length > 3 && kwWord.startsWith(qw.slice(0, -1)))
          );
          
          if (isFound) matched++;
        }

        // If ALL words in the keyword are found in the query
        if (matched === kwWords.length && matched > maxMatchedWords) {
          maxMatchedWords = matched;
          bestMatch = item;
        }
      }
    }

    if (bestMatch) {
      return bestMatch.answer;
    }
    
    // 3. Fallback
    return "I'm not exactly sure about that, but I'm here to help with questions about SimPredict, Solana Pay, XP, or Daily Battles! Ask me things like 'What is Homer Baba?' or 'How do I earn XP?'.";
  }
}
