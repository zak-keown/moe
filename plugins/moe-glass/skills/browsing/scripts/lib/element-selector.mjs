function getElementSelector(selector) {
  if (selector.startsWith('/') || selector.startsWith('//')) {
    const hasTextEquals = /text\(\)\s*=\s*['"]/.test(selector);
    const xpaths = [JSON.stringify(selector)];
    if (hasTextEquals) {
      const fallbackSelector = selector.replace(/text\(\)\s*=\s*(['"])(.*?)\1/g, "normalize-space()=$1$2$1");
      xpaths.push(JSON.stringify(fallbackSelector));
    }
    return `(() => {
      var all = [];
      var seen = new Set();
      [${xpaths.join(', ')}].forEach(function(xpath) {
        var iter = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null);
        var node;
        while (node = iter.iterateNext()) {
          if (!seen.has(node)) { seen.add(node); all.push(node); }
        }
      });
      if (all.length === 0) return null;
      var visible = all.find(function(el) {
        var r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      if (visible) return visible;
      console.warn('[moe-glass] All ' + all.length + ' elements matching XPath have zero dimensions; using first match');
      return all[0];
    })()`;
  } else {
    return `(() => {
      var all = document.querySelectorAll(${JSON.stringify(selector)});
      if (all.length === 0) return null;
      var visible = Array.from(all).find(function(el) {
        var r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      if (visible) return visible;
      console.warn('[moe-glass] All ' + all.length + ' elements matching ' + ${JSON.stringify(JSON.stringify(selector))} + ' have zero dimensions; using first match');
      return all[0];
    })()`;
  }
}

function getElementSelectorAll(selector) {
  if (selector.startsWith('/') || selector.startsWith('//')) {
    const hasTextEquals = /text\(\)\s*=\s*['"]/.test(selector);
    if (hasTextEquals) {
      const fallbackSelector = selector.replace(/text\(\)\s*=\s*(['"])(.*?)\1/g, "normalize-space()=$1$2$1");
      return `(() => {
        const result = [];
        const seen = new Set();
        for (const xpath of [${JSON.stringify(selector)}, ${JSON.stringify(fallbackSelector)}]) {
          const iterator = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null);
          let node;
          while (node = iterator.iterateNext()) {
            if (!seen.has(node)) { seen.add(node); result.push(node); }
          }
        }
        return result;
      })()`;
    }
    return `(() => {
      const result = [];
      const iterator = document.evaluate(${JSON.stringify(selector)}, document, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null);
      let node;
      while (node = iterator.iterateNext()) result.push(node);
      return result;
    })()`;
  } else {
    return `Array.from(document.querySelectorAll(${JSON.stringify(selector)}))`;
  }
}

export { getElementSelector, getElementSelectorAll };
