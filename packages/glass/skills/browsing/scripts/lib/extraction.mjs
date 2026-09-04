import { getElementSelector } from './element-selector.mjs';
import { throwIfExceptionDetails } from './cdp-utils.mjs';

function attachExtraction({ getPageSession }) {
  async function extractText(tabIndexOrWsUrl, selector) {
    const ps = await getPageSession(tabIndexOrWsUrl);
    const js = `${getElementSelector(selector)}?.textContent`;
    const result = await ps.send('Runtime.evaluate', {
      expression: js,
      returnByValue: true
    });
    throwIfExceptionDetails(result);
    return result.result.value;
  }

  async function getHtml(tabIndexOrWsUrl, selector = null) {
    const ps = await getPageSession(tabIndexOrWsUrl);
    const js = selector
      ? `${getElementSelector(selector)}?.innerHTML`
      : 'document.documentElement.outerHTML';
    const result = await ps.send('Runtime.evaluate', {
      expression: js,
      returnByValue: true
    });
    throwIfExceptionDetails(result);
    return result.result.value;
  }

  async function getAttribute(tabIndexOrWsUrl, selector, attrName) {
    const ps = await getPageSession(tabIndexOrWsUrl);
    const js = `${getElementSelector(selector)}?.getAttribute(${JSON.stringify(attrName)})`;
    const result = await ps.send('Runtime.evaluate', {
      expression: js,
      returnByValue: true
    });
    throwIfExceptionDetails(result);
    return result.result.value;
  }

  return { extractText, getHtml, getAttribute };
}

export { attachExtraction };
