import { throwIfExceptionDetails } from './cdp-utils.mjs';

function attachEvaluation({ getPageSession }) {
  async function evaluate(tabIndexOrWsUrl, expression) {
    const pageSession = await getPageSession(tabIndexOrWsUrl);
    const result = await pageSession.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    throwIfExceptionDetails(result);
    return result.result.value;
  }

  async function evaluateJson(tabIndexOrWsUrl, expression) {
    const pageSession = await getPageSession(tabIndexOrWsUrl);

    const wrappedExpression = `
      (() => {
        try {
          const result = ${expression};
          if (result === undefined) return { __type: 'undefined' };
          if (result === null) return null;
          if (result instanceof Element) {
            return {
              __type: 'Element',
              tagName: result.tagName,
              id: result.id,
              className: result.className,
              textContent: result.textContent?.slice(0, 100)
            };
          }
          if (typeof result === 'function') {
            return { __type: 'function', name: result.name || 'anonymous' };
          }
          return result;
        } catch (e) {
          return { __type: 'error', message: e.message };
        }
      })()
    `;

    const result = await pageSession.send('Runtime.evaluate', {
      expression: wrappedExpression,
      returnByValue: true,
      awaitPromise: true
    });
    throwIfExceptionDetails(result);
    return result.result.value;
  }

  async function evaluateRaw(tabIndexOrWsUrl, expression) {
    const pageSession = await getPageSession(tabIndexOrWsUrl);
    const result = await pageSession.send('Runtime.evaluate', {
      expression,
      returnByValue: false
    });
    throwIfExceptionDetails(result);
    return result.result;
  }

  return { evaluate, evaluateJson, evaluateRaw };
}

export { attachEvaluation };
