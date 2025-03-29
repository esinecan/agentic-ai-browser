import fs from 'fs';
import path from 'path';
import { GraphContext } from "../../../browserExecutor.js";
import logger from '../../../utils/logger.js';

// Session-specific notes file
let sessionNotesFile: string | null = null;

export async function notesHandler(ctx: GraphContext): Promise<string> {
  if (!ctx.page || !ctx.action) throw new Error("Invalid context");

  logger.browser.action('notes', {
    operation: ctx.action.operation,
    url: ctx.page.url()
  });

  try {
    // Create notes directory if it doesn't exist
    const notesDir = path.resolve('./notes');
    if (!fs.existsSync(notesDir)) {
      fs.mkdirSync(notesDir, { recursive: true });
    }
    
    // Initialize notes file for this session if not already done
    if (!sessionNotesFile) {
      const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-');
      sessionNotesFile = path.join(notesDir, `notes-${timestamp}.txt`);
    }

    const { operation } = ctx.action;
    
    // Check both note and value fields for content (fixes compatibility with different LLMs)
    const noteContent = ctx.action.note || ctx.action.value;
    
    if (operation === 'add' && noteContent) {
      // Get current URL
      const url = ctx.page.url();
      // Format note with URL
      const noteWithUrl = `${url}\n${noteContent}`;
      
      // Append to file (create if doesn't exist)
      await fs.promises.appendFile(sessionNotesFile, noteWithUrl + '\n\n');
      
      // Update context
      ctx.lastActionSuccess = true;
      ctx.successCount = (ctx.successCount || 0) + 1;
      ctx.actionFeedback = `✅ Note successfully added to ${path.basename(sessionNotesFile)}`;
      
      ctx.history.push(`Added note (${noteContent.length} chars)`);
      
      logger.info('Note added', {
        file: path.basename(sessionNotesFile),
        chars: noteContent.length
      });
    }
    else if (operation === 'read') {
      // Check if file exists
      if (!sessionNotesFile || !fs.existsSync(sessionNotesFile)) {
        ctx.actionFeedback = 'No notes found for this session.';
        ctx.lastActionSuccess = true;
        return "chooseAction";
      }
      
      // Read file content
      let notes = await fs.promises.readFile(sessionNotesFile, 'utf8');
      
      // Truncate from beginning if too long (exactly as requested)
      const MAX_CHARS = 5000;
      if (notes.length > MAX_CHARS) {
        notes = '...(content truncated)...\n' + notes.substring(notes.length - MAX_CHARS);
      }
      
      // Update context
      ctx.lastActionSuccess = true;
      ctx.successCount = (ctx.successCount || 0) + 1;
      ctx.actionFeedback = `📝 Notes from ${path.basename(sessionNotesFile)}:\n\n${notes}`;
      
      ctx.history.push(`Read notes (${notes.length} chars)`);
      
      logger.info('Notes read', {
        file: path.basename(sessionNotesFile),
        totalChars: notes.length
      });
    }
    else {
      throw new Error(`Invalid notes operation: ${operation}`);
    }
    
    return "chooseAction";
  } catch (error) {
    logger.browser.error('notes', {
      error,
      operation: ctx.action.operation
    });

    ctx.lastActionSuccess = false;
    ctx.successCount = 0;
    ctx.history.push(`Notes action failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return "handleFailure";
  }
}
