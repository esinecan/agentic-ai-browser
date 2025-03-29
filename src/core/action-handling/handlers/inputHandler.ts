import { GraphContext } from "../../../browserExecutor.js";
import { getElement, verifyAction } from "../../../browserExecutor.js";
import { SelectorFallbacks } from "../../elements/strategies/SelectorFallbacks.js";
import { SuccessPatterns } from "../../../successPatterns.js";
import { ensureElementVisible } from "../../../utils/visibilityUtils.js";
import logger from "../../../utils/logger.js";

export async function inputHandler(ctx: GraphContext): Promise<string> {
  if (!ctx.page || !ctx.action) throw new Error("Invalid context");

  logger.browser.action('input', {
    element: ctx.action.element,
    value: ctx.action.value,
    url: ctx.page.url()
  });

  try {
    // Try with the original element selector first
    let elementHandle = await getElement(ctx.page, ctx.action);
    
    // If not found, try with fallbacks
    if (!elementHandle && ctx.action.element) {
      logger.info('Original selector failed, trying fallbacks', { 
        original: ctx.action.element,
        url: ctx.page.url()
      });
      
      elementHandle = await SelectorFallbacks.tryFallbacks(ctx.page, ctx.action);
      
      // If we found an element, log the fallback success
      if (elementHandle) {
        logger.info('Found element using fallback mechanisms');
      }
    }
    
    // If still no element found, throw error
    if (!elementHandle) throw new Error("Element not found");
    
    // Ensure element is visible before interacting with it
    await ensureElementVisible(ctx.page, elementHandle);
    
    // Get element info for logging and verification
    const elementInfo = await elementHandle.evaluate((el: HTMLElement) => {
      const tagName = el.tagName.toLowerCase();
      return {
        tagName,
        type: tagName === 'input' ? (el as HTMLInputElement).type : undefined,
        isSelect: tagName === 'select',
        isInput: tagName === 'input',
        isTextarea: tagName === 'textarea',
        value: tagName === 'input' ? (el as HTMLInputElement).value : 
               tagName === 'textarea' ? (el as HTMLTextAreaElement).value :
               tagName === 'select' ? (el as HTMLSelectElement).value :
               el.getAttribute('value') || el.textContent?.trim() || '',
        id: el.id,
        name: el.getAttribute('name')
      };
    });

    try {
      // Try direct fill first (without clicking) to avoid triggering blur events
      await elementHandle.fill(ctx.action.value || '');
      logger.info('Direct fill successful', { element: ctx.action.element });
    } catch (fillError) {
      logger.warn('Direct fill failed, falling back to click+fill approach', { 
        error: fillError instanceof Error ? fillError.message : String(fillError)
      });
      
      // If direct fill fails, fall back to click+fill
      await elementHandle.click({ timeout: ctx.action.maxWait / 2 });
      await elementHandle.fill(ctx.action.value || '');
    }
    
    // Add verification after input/selection to confirm values were accepted
    const verifyValue = await elementHandle.evaluate((el: HTMLElement, value: string) => {
      if (el.tagName.toLowerCase() === 'select') {
        // For select elements, check selected value or text
        const selectEl = el as HTMLSelectElement;
        return Array.from(selectEl.selectedOptions).some(o => 
          o.value === value || o.text === value || o.textContent === value
        );
      } else if (el.hasAttribute('contenteditable')) {
        // For contentEditable elements
        return el.textContent === value;
      } else {
        // For inputs, check value property
        const inputEl = el as HTMLInputElement;
        return inputEl.value === value;
      }
    }, ctx.action.value!);
    
    if (!verifyValue) {
      logger.warn('Value verification failed after input operation', {
        element: ctx.action.element,
        value: ctx.action.value,
        elementInfo
      });
      // We continue despite verification failure, as some inputs might transform values
    }
    
    const verified = await verifyAction(ctx.page, ctx.action);
    if (!verified) throw new Error("Action verification failed after input");
    
    ctx.lastActionSuccess = true;
    ctx.successCount = (ctx.successCount || 0) + 1;
    const elementSelector = ctx.action.element;
    const value = ctx.action.value;
    const description = ctx.action.description || elementSelector;
    
    ctx.successfulActions?.push(`input:${elementSelector}`);
    
    ctx.actionFeedback = `✅ Successfully entered "${value}" into ${description}!` + 
      (ctx.successCount > 1 ? ` You're doing great! ${ctx.successCount} successful actions in a row.` : '');
    
    ctx.history.push(`Input '${ctx.action.value}' to ${ctx.action.element}`);
    
    try {
      const domain = new URL(ctx.page.url()).hostname;
      const successPatternsInstance = new SuccessPatterns();
      successPatternsInstance.recordSuccess(ctx.action, domain);
    } catch (error) {
      logger.error("Error recording success pattern", error);
    }
    
    logger.info("Input successful", {
      element: ctx.action.element,
      value: ctx.action.value,
      elementType: elementInfo.tagName + (elementInfo.type ? `[type=${elementInfo.type}]` : ''),
      successCount: ctx.successCount
    });

    return "chooseAction";
  } catch (error) {
    logger.browser.error("input", {
      error,
      element: ctx.action.element,
      value: ctx.action.value
    });

    ctx.lastActionSuccess = false;
    ctx.successCount = 0;
    ctx.history.push(`Input failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return "handleFailure";
  }
}
