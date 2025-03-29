// filepath: c:\Users\yepis\dev\agent\agentic-ai-browser\src\successPatterns.ts
import fs from 'fs';
import path from 'path';
import { Action } from './browserExecutor.js';

interface SuccessPattern {
  actionType: string;
  element?: string;  // Change from selector to element
  domain: string;
  successCount: number;
  lastSuccess: string; // ISO date string
}

export class SuccessPatterns {
  private patterns: SuccessPattern[] = [];
  private filePath: string;
  private isInFrequentFailureMode: boolean = false;
  private failureCount: number = 0;
  private lastFailureTime: number = 0;
  
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
    // Don't record simple navigation as a reusable pattern
    if (action.type === 'navigate' && (!this.isSignificantNavigation(action, domain))) {
      return;
    }
    
    // Rest of existing recordSuccess logic
    const key = `${action.type}:${action.element || action.value || ''}`;
    const existingPattern = this.patterns.find(p => 
      p.actionType === action.type && 
      p.element === action.element &&
      p.domain === domain
    );
    
    if (existingPattern) {
      existingPattern.successCount++;
      existingPattern.lastSuccess = new Date().toISOString();
    } else {
      this.patterns.push({
        actionType: action.type,
        element: action.element || action.value,
        domain,
        successCount: 1,
        lastSuccess: new Date().toISOString()
      });
    }
    
    this.savePatterns();
  }
  
  private isSignificantNavigation(action: Action, domain: string): boolean {
    // Don't record refreshes to the same page
    if (action.type === 'navigate' && action.value && action.previousUrl) {
      try {
        const prevDomain = new URL(action.previousUrl).hostname;
        const newDomain = new URL(action.value).hostname;
        
        // Record if:
        // 1. Cross-domain navigation
        // 2. Navigation to a specific path that's not the homepage
        // 3. Navigation to a path with significant query params
        const newPath = new URL(action.value).pathname;
        const hasSignificantPath = newPath && newPath !== '/' && newPath.length > 1;
        const hasSignificantQueryParams = new URL(action.value).search.length > 1;
        
        return prevDomain !== newDomain || 
               hasSignificantPath ||
               hasSignificantQueryParams;
      } catch (error) {
        console.error("Error analyzing navigation significance:", error);
        return false;
      }
    }
    return false;
  }
  
  public getSuggestionsForDomain(domain: string): string[] {
    const domainPatterns = this.patterns
      .filter(p => (p.domain === domain || domain.includes(p.domain) || p.domain.includes(domain))
        // Prioritize interaction patterns over navigation when stuck
        && (p.actionType !== 'navigate' || this.isInFrequentFailureMode === false))
      .sort((a, b) => {
        // Prioritize non-navigation actions
        if (a.actionType !== 'navigate' && b.actionType === 'navigate') return -1;
        if (a.actionType === 'navigate' && b.actionType !== 'navigate') return 1;
        // Then sort by success count
        return b.successCount - a.successCount;
      })
      .slice(0, 3);
    
    return domainPatterns.map(p => {
      if (p.actionType === 'click' || p.actionType === 'input') {
        return `Try using selector "${p.element}" for ${p.actionType} actions (worked ${p.successCount} times)`;
      }
      return `"${p.actionType}" actions work well on this site (worked ${p.successCount} times)`;
    });
  }

  public recordFailure() {
    const now = Date.now();
    // Reset if failures are spread out
    if (now - this.lastFailureTime > 30000) {
      this.failureCount = 0;
    }
    
    this.failureCount++;
    this.lastFailureTime = now;
    
    // Enter "frequent failure mode" if we're seeing many failures
    if (this.failureCount >= 3) {
      this.isInFrequentFailureMode = true;
    }
  }

  public resetFailures() {
    this.failureCount = 0;
    this.isInFrequentFailureMode = false;
  }
}