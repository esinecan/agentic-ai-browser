import { Page, ElementHandle } from "playwright";
import { GraphContext } from "../../../browserExecutor.js";
import { getElement, verifyAction } from "../../../browserExecutor.js";
import { SuccessPatterns } from "../../../successPatterns.js";
import { SelectorFallbacks } from "../../elements/strategies/SelectorFallbacks.js";
import { ensureElementVisible } from "../../../utils/visibilityUtils.js";
import { highlightElement, setOverlayStatus } from "../../../utils/uiEffects.js";
import logger from "../../../utils/logger.js";

// Default value for the universal submit selector if not set in environment variables
const DEFAULT_UNIVERSAL_SUBMIT_SELECTOR = "";

export async function clickHandler(ctx: GraphContext): Promise<string> {
  if (!ctx.page || !ctx.action) {
    throw new Error("Invalid context");
  }

  // Set overlay status immediately
  const elementDescription = ctx.action.description || ctx.action.element || "element";
  await setOverlayStatus(ctx.page, `Agent is clicking ${elementDescription}`);

  // Special case for UNIVERSAL_SUBMIT_SELECTOR - simulate pressing Enter key
  // Use the environment variable or fall back to the default value
  const universalSubmitSelector = process.env.UNIVERSAL_SUBMIT_SELECTOR || DEFAULT_UNIVERSAL_SUBMIT_SELECTOR;
  
  // Make comparison more robust by checking for exact match or if action element contains the selector text
  if (ctx.action.element === universalSubmitSelector || 
      (typeof ctx.action.element === 'string' && 
       ctx.action.element.includes(universalSubmitSelector)) ||
      ctx.action.element === "Enter") {
    
    logger.browser.action('keypress', {
      key: 'Enter',
      url: ctx.page.url()
    });
    
    try {
      // Use Playwright's keyboard API to press Enter
      await ctx.page.keyboard.press('Enter');
      
      // Mark action as successful
      ctx.lastActionSuccess = true;
      ctx.successCount = (ctx.successCount || 0) + 1;
      ctx.successfulActions?.push(`keypress:Enter`);
      
      // Add to history
      ctx.history.push(`Pressed Enter key`);
      
      logger.info('Successfully executed Enter key press', {
        url: ctx.page.url()
      });
      
      return "getPageState";
    } catch (error) {
      logger.error('Error pressing Enter key', { error });
      ctx.lastActionSuccess = false;
      ctx.retries = (ctx.retries || 0) + 1;
      ctx.actionFeedback = "Submission failed. Please notify human handler.";
      return "handleFailure";
    }
  }

  // Continue with regular click handling for normal elements
  logger.browser.action('click', {
    element: ctx.action.element,
    url: ctx.page.url()
  });

  try {
    // Store previous URL for navigation detection
    const previousUrl = ctx.page.url();
    ctx.action.previousUrl = ctx.action.previousUrl || previousUrl;
    
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
    if (!elementHandle) {
      throw new Error("Element not found " + ctx.action.element);
    }

    // Highlight the element we're about to click
    await highlightElement(elementHandle);

    try {
      // Check if this is a form element (option, radio, checkbox, etc.)
      const elementInfo = await elementHandle.evaluate((el: HTMLElement) => {
        const tagName = el.tagName.toLowerCase();
        
        return {
          tagName,
          isRadio: tagName === 'input' && (el as HTMLInputElement).type === 'radio',
          isCheckbox: tagName === 'input' && (el as HTMLInputElement).type === 'checkbox',
          isSelect: tagName === 'select',
          parentIsSelect: tagName === 'option' || (el.parentElement && el.parentElement.tagName.toLowerCase() === 'select'),
          value: tagName === 'input' ? (el as HTMLInputElement).value : 
                el.getAttribute('value') || el.textContent?.trim() || '',
          id: el.id,
          name: el.getAttribute('name')
        };
      });
      
      // Handle select elements with specialized dropdown handling
      if ((elementInfo.isSelect || elementInfo.parentIsSelect) && ctx.action.value) {
        logger.info('Detected select element, using specialized dropdown handling', { 
          element: ctx.action.element,
          value: ctx.action.value
        });
        
        try {
          // Determine the select element selector
          let selectSelector = ctx.action.element;
          if (elementInfo.parentIsSelect) {
            // If we clicked on an option, find its parent select
            const parentSelectResult = await elementHandle.evaluate(el => {
              // Walk up to find parent select
              let parent = el.parentElement;
              while (parent && parent.tagName.toLowerCase() !== 'select') {
                parent = parent.parentElement;
              }
              
              if (!parent) return null;
              
              // Cast to HTMLSelectElement to access proper properties
              const selectEl = parent as HTMLSelectElement;
              return {
                id: selectEl.id,
                name: selectEl.getAttribute('name')
              };
            });
            
            // Convert the result to a selector string or keep the original
            if (parentSelectResult) {
              selectSelector = parentSelectResult.id ? 
                `#${parentSelectResult.id}` : 
                parentSelectResult.name ? 
                `select[name="${parentSelectResult.name}"]` : 
                'select';
            } else {
              throw new Error('Could not find parent select element');
            }
          }
          
          // Use Playwright's native selectOption method
          if (!selectSelector) {
            throw new Error('No valid select element selector found');
          }
          await ctx.page.selectOption(selectSelector, ctx.action.value || '');
          
          // Verify the selection worked correctly
          const verificationResult = await ctx.page.evaluate(
            ({ selector, expectedValue }) => {
              const selectEl = document.querySelector(selector) as HTMLSelectElement;
              if (!selectEl) return false;
              
              // Check if any of the selected options match our expected value
              // by text content or by value attribute
              return Array.from(selectEl.selectedOptions).some(option => 
                option.textContent?.trim() === expectedValue || 
                option.value === expectedValue
              );
            },
            { 
              selector: selectSelector!,
              expectedValue: ctx.action.value
            }
          );
          
          if (!verificationResult) {
            logger.warn('Select option verification failed', {
              element: selectSelector,
              expectedValue: ctx.action.value
            });
            // Continue anyway - some selects might have complex option text/values
          } else {
            logger.info('Successfully selected dropdown option', {
              element: selectSelector,
              value: ctx.action.value
            });
          }
          
          // Skip regular click logic since we've handled the select element
          let verified = await verifyAction(ctx.page, ctx.action);
          
          // If we get here, the selection was successful
          ctx.lastActionSuccess = true;
          ctx.successCount = (ctx.successCount || 0) + 1;
          ctx.successfulActions?.push(`select:${selectSelector}:${ctx.action.value}`);
          
          ctx.history.push(`Selected "${ctx.action.value}" from dropdown ${selectSelector}`);
          
          return "getPageState";
        } catch (selectError) {
          logger.error('Error handling select element', {
            error: selectError instanceof Error ? selectError.message : String(selectError),
            element: ctx.action.element
          });
          throw selectError;
        }
      }
      // Handle different form elements appropriately
      else if (elementInfo.isRadio || elementInfo.isCheckbox) {
        logger.info(`Detected ${elementInfo.isRadio ? 'radio button' : 'checkbox'}, using specialized handling`, { elementInfo });
        
        // For radio buttons and checkboxes, we need to ensure they're checked
        await ctx.page.evaluate(
          ({ selector, elementType }) => {
            const element = document.querySelector(selector) as HTMLInputElement | null;
            if (element) {
              // Set checked state
              if (elementType === 'radio' || !element.checked) {
                element.checked = true;
                // Trigger change and input events
                element.dispatchEvent(new Event('change', { bubbles: true }));
                element.dispatchEvent(new Event('input', { bubbles: true }));
              }
              return true;
            }
            return false;
          },
          { 
            selector: ctx.action.element || '', 
            elementType: elementInfo.isRadio ? 'radio' : 'checkbox' 
          }
        );
        
        logger.info(`Set ${elementInfo.isRadio ? 'radio button' : 'checkbox'} state using JavaScript`, { 
          element: ctx.action.element
        });
      } else {
        // Regular click for non-form elements
        await ensureElementVisible(ctx.page, elementHandle);
        await elementHandle.click({ timeout: ctx.action.maxWait });
      }
    } catch (error) {
      // If regular click fails, check if it's a link and navigate directly
      try {
        logger.info('Regular click failed, checking if element is a link', {
          element: ctx.action.element,
          error: error instanceof Error ? error.message : String(error)
        });
        
        // Check if it's an anchor tag with href
        const href = await elementHandle.evaluate((el: HTMLElement) => {
          if (el.tagName === 'A' && el.hasAttribute('href')) {
            return el.getAttribute('href');
          }
          return null;
        });
        
        // If it's a link with href, navigate directly instead of clicking
        if (href) {
          logger.info('Element is a link, navigating directly', { href });
          
          // Resolve relative URLs
          let fullUrl = href;
          if (href.startsWith('/')) {
            const baseUrl = new URL(ctx.page.url());
            fullUrl = `${baseUrl.origin}${href}`;
          }
          
          // Navigate directly to the URL
          await ctx.page.goto(fullUrl, { timeout: 10000 });
          
          // Navigation successful, no need for JavaScript click
          logger.info('Direct navigation successful', { url: fullUrl });
        } else {
          // Not a link, try JavaScript click as last resort
          logger.info('Element is not a link, trying JavaScript click');
          await ctx.page.evaluate((element: HTMLElement) => {
            if (element && typeof element.click === 'function') {
              element.click();
              return true;
            }
            return false;
          }, elementHandle as any);
        }
      } catch (fallbackError) {
        // Both methods failed
        logger.error('All click fallbacks failed', {
          element: ctx.action.element,
          originalError: error instanceof Error ? error.message : String(error),
          fallbackError: fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
        });
        throw error; // Re-throw the original error
      }
    }

    let verified = await verifyAction(ctx.page, ctx.action);

    // Verify element was actually clicked by checking for navigation or other state changes
    const currentUrl = ctx.page.url();
    const urlChanged = ctx.action.previousUrl !== currentUrl;

    if (!verified && urlChanged) {
      // If URL changed despite verification failure, consider it a success
      logger.info('Click verification failed but URL changed, considering successful', {
        from: ctx.action.previousUrl,
        to: currentUrl
      });
      verified = true;
    } else if (verified && !urlChanged && ctx.action.element && ctx.action.element.includes('href')) {
      // If verification succeeded but URL didn't change for a link, something might be wrong
      logger.warn('Click verification succeeded but URL didn\'t change for a link element', {
        element: ctx.action.element
      });
      // We'll still proceed as successful since verification passed
    }

    if (!verified) {
      throw new Error("Action verification failed after click");
    }

    // If we get here, the click was successful
    ctx.lastActionSuccess = true;
    ctx.successCount = (ctx.successCount || 0) + 1;
    ctx.successfulActions?.push(`click:${ctx.action.element}`);

    const elementSelector = ctx.action.element;
    const description = ctx.action.description || elementSelector;
    
    // Update overlay with success message
    await setOverlayStatus(ctx.page, `✅ Successfully clicked ${description}!`);

    logger.info('Click successful', {
      element: description,
      successCount: ctx.successCount
    });

    // Record in context that we used the last selector
    if (ctx.action.element) {
      ctx.lastSelector = ctx.action.element;
    }

    // Optionally record success patterns
    try {
      const domain = new URL(ctx.page.url()).hostname;
      const successPatternsInstance = new SuccessPatterns();
      successPatternsInstance.recordSuccess(ctx.action, domain);
    } catch (spError) {
      logger.error('Error recording success pattern', spError);
    }

    return "getPageState";
  } catch (error) {
    // Update overlay with error message
    if (ctx.page) {
      await setOverlayStatus(ctx.page, `❌ Click failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    
    logger.browser.error('click', {
      error,
      element: ctx.action.element
    });
    ctx.lastActionSuccess = false;
    ctx.successCount = 0;
    return "handleFailure";
  }
}
