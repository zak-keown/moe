export class JsonInteger {
  constructor(source) {
    this.value = BigInt(source);
  }

  toString() {
    return this.value.toString();
  }

  toJSON() {
    return JSON.rawJSON(this.value.toString());
  }
}

export function isPlainObject(value) {
  return value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
}

export function parseJsonLosslessly(text) {
  return JSON.parse(text, (_key, value, context) => {
    if (
      typeof value === "number" &&
      context?.source &&
      !/[.eE]/.test(context.source) &&
      !Number.isSafeInteger(value)
    ) {
      return new JsonInteger(context.source);
    }
    return value;
  });
}

export function pythonEqual(left, right) {
  const leftIsNumeric =
    left instanceof JsonInteger || typeof left === "number" || typeof left === "boolean";
  const rightIsNumeric =
    right instanceof JsonInteger || typeof right === "number" || typeof right === "boolean";
  if (leftIsNumeric && rightIsNumeric) {
    if (left instanceof JsonInteger && right instanceof JsonInteger) return left.value === right.value;
    if (left instanceof JsonInteger || right instanceof JsonInteger) {
      const integer = left instanceof JsonInteger ? left : right;
      const other = left instanceof JsonInteger ? right : left;
      const number = typeof other === "boolean" ? Number(other) : other;
      return Number.isInteger(number) && integer.value === BigInt(number);
    }
    return Number(left) === Number(right);
  }
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => pythonEqual(value, right[index]))
    );
  }
  if (isPlainObject(left) && isPlainObject(right)) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every((key) => Object.hasOwn(right, key) && pythonEqual(left[key], right[key]))
    );
  }
  return false;
}

export function compareCodePoints(left, right) {
  const leftPoints = Array.from(left, (character) => character.codePointAt(0));
  const rightPoints = Array.from(right, (character) => character.codePointAt(0));
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    if (leftPoints[index] !== rightPoints[index]) return leftPoints[index] - rightPoints[index];
  }
  return leftPoints.length - rightPoints.length;
}

export function normalizeUniversalNewlines(text) {
  return text.replace(/\r\n?/g, "\n");
}

export function splitLines(text) {
  const lines = text.split(/\r\n|[\n\v\f\r\x1c-\x1e\x85\u2028\u2029]/);
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

export function isNegativeNumber(value) {
  return /^-(?:\p{Nd}+|\p{Nd}*\.\p{Nd}+)$/u.test(value);
}
