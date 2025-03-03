// filepath: c:\Users\yepis\dev\agent\agentic-ai-browser\src\successPatterns.ts
import fs from 'fs';
import path from 'path';
import { Action } from './browserExecutor.js';

interface SuccessPattern {
  actionType: string;
  selector?: string;
  domain: string;
  successCount: number;
  lastSuccess: string; // ISO date string
}

export class SuccessPatterns {
  private patterns: SuccessPattern[] = [];
  private filePath: string;
  
  constructor() {
    this.filePath = path.join(process.cwd(), 'data', 'success-patterns.json');
    this.loadPatterns();
  }
  
  private loadPatterns() {
    try {
      if (fs.existsSync(this.filePath)) {
        this.patterns = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      }
    } catch (error) {
      console.error('Error loading success patterns:', error);
      this.patterns = [];
    }
  }
  
  public savePatterns() {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.patterns, null, 2));
    } catch (error) {
      console.error('Error saving success patterns:', error);
    }
  }
  
  public recordSuccess(action: Action, domain: string) {
    const key = `${action.type}:${action.element || action.value || ''}`;
    const existingPattern = this.patterns.find(p => 
      p.actionType === action.type && 
      p.selector === (action.element || action.value) && 
      p.domain === domain
    );
    
    if (existingPattern) {
      existingPattern.successCount++;
      existingPattern.lastSuccess = new Date().toISOString();
    } else {
      this.patterns.push({
        actionType: action.type,
        selector: action.element || action.value,
        domain,
        successCount: 1,
        lastSuccess: new Date().toISOString()
      });
    }
    
    this.savePatterns();
  }
  
  public getSuggestionsForDomain(domain: string): string[] {
    const domainPatterns = this.patterns
      .filter(p => p.domain === domain || domain.includes(p.domain) || p.domain.includes(domain))
      .sort((a, b) => b.successCount - a.successCount)
      .slice(0, 3);
    
    return domainPatterns.map(p => {
      if (p.actionType === 'click' || p.actionType === 'input') {
        return `Try using selector "${p.selector}" for ${p.actionType} actions (worked ${p.successCount} times)`; 
      }
      return `"${p.actionType}" actions work well on this site (worked ${p.successCount} times)`;
    });
  }
}