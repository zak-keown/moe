import { getElementSelectorAll } from './element-selector.mjs';
import { throwIfExceptionDetails } from './cdp-utils.mjs';

function attachSelectOption({ getPageSession }) {
  async function selectOption(tabIndexOrWsUrl, selector, value, index = 0) {
    const pageSession = await getPageSession(tabIndexOrWsUrl);
    const values = Array.isArray(value) ? value : [value];

    const countJs = `${getElementSelectorAll(selector)}.length`;
    const countResult = await pageSession.send('Runtime.evaluate', {
      expression: countJs,
      returnByValue: true
    });
    throwIfExceptionDetails(countResult);
    const matchCount = countResult.result.value || 0;

    let warning = null;
    if (matchCount > 1) {
      warning = `Selector "${selector}" matches ${matchCount} elements. Using element at index ${index}. Use a more specific selector or pass index parameter.`;
      console.error(`WARNING: ${warning}`);
    }

    const js = `
      (() => {
        const elements = ${getElementSelectorAll(selector)};
        const el = elements[${index}];
        if (!el) return { success: false, error: 'Element not found at index ${index}' };
        if (el.tagName !== 'SELECT') return { success: false, error: 'Element is not a SELECT' };

        const requested = ${JSON.stringify(values)};
        if (requested.length > 1 && !el.multiple) {
          return { success: false, error: 'Cannot select multiple values on a non-multiple <select>' };
        }

        const options = Array.from(el.options);
        const matched = [];
        const unmatched = [];
        for (const v of requested) {
          const opt = options.find(o => o.value === v) ||
                      options.find(o => o.textContent.trim() === v);
          if (opt) matched.push(opt);
          else unmatched.push(v);
        }
        if (unmatched.length) {
          return { success: false, error: 'No matching option for: ' + JSON.stringify(unmatched) };
        }

        for (const o of options) o.selected = false;
        for (const o of matched) o.selected = true;
        el.dispatchEvent(new Event('change', { bubbles: true }));

        return {
          success: true,
          matchCount: elements.length,
          matched: matched.map(o => ({ value: o.value, text: o.textContent.trim() }))
        };
      })()
    `;

    const result = await pageSession.send('Runtime.evaluate', {
      expression: js,
      returnByValue: true
    });
    throwIfExceptionDetails(result);

    const resultValue = result.result.value;
    if (!resultValue.success) {
      throw new Error(resultValue.error);
    }

    return {
      success: true,
      matchCount: resultValue.matchCount,
      matched: resultValue.matched,
      warning,
      selectedIndex: index
    };
  }

  return { selectOption };
}

export { attachSelectOption };
